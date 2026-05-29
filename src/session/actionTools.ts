import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopPointSchema,
  evaluateSessionActionPolicy,
  type DesktopActionPacket,
  type DesktopActionRisk,
  type DesktopSessionActionType,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition
} from "../policy/sessionLicensePolicy.js";
import type {
  DesktopInteractionProvider,
  DesktopProviderActionResult
} from "../providers/desktopProvider.js";
import { DesktopProviderError as DesktopProviderErrorClass } from "../providers/desktopProvider.js";
import {
  createPendingInteractionTransitionGate,
  type InteractionTransitionGate
} from "./interactionTransitionGate.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError
} from "./sessionStore.js";

export interface ActionToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  desktopProvider: DesktopInteractionProvider;
  now: () => string;
  generateId: (prefix: string) => string;
}

type SupportedActionType = Extract<
  DesktopSessionActionType,
  "move_mouse" | "click" | "type_text"
>;

const lowRisk: DesktopActionRisk = {
  credentialExposure: false,
  destructive: false,
  externalEffect: false,
  systemChange: false,
  recoverability: "high"
};

const actionRiskInputSchema = z
  .object({
    credentialExposure: z.boolean().default(false),
    destructive: z.boolean().default(false),
    externalEffect: z.boolean().default(false),
    systemChange: z.boolean().default(false),
    recoverability: z.enum(["high", "medium", "low"]).default("high")
  })
  .default(lowRisk);

const baseActionInputSchema = z.object({
  sessionId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  preActionObservationId: z.string().min(1),
  intendedSemanticTarget: z.string().min(1).max(1000).optional()
});

const moveMouseInputSchema = baseActionInputSchema.extend({
  point: desktopPointSchema
});

const clickInputSchema = baseActionInputSchema.extend({
  point: desktopPointSchema,
  button: z.enum(["left", "middle", "right"]).default("left"),
  risk: actionRiskInputSchema
});

const typeTextInputSchema = baseActionInputSchema.extend({
  text: z.string().min(1).max(2000),
  sensitivityClassification: z
    .enum(["test_input", "private", "credential", "secret"])
    .default("test_input"),
  risk: actionRiskInputSchema
});

type MoveMouseInput = z.infer<typeof moveMouseInputSchema>;
type ClickInput = z.infer<typeof clickInputSchema>;
type TypeTextInput = z.infer<typeof typeTextInputSchema>;

interface ActionExecutionConfig<Input> {
  actionType: SupportedActionType;
  unsupportedProviderReason: string;
  providerSupports: (provider: DesktopInteractionProvider) => boolean;
  buildAction: (input: Input, actionId: string, requestedAt: string) => DesktopActionPacket;
  callProvider: (
    provider: DesktopInteractionProvider,
    input: Input,
    requestedAt: string
  ) => Promise<DesktopProviderActionResult>;
  protectedObservables: string[];
  expectedEvidenceAfterAction: string[];
  allowedSummary: string;
  policyBlockedResidue: string;
  providerCallBlockedResidue: string;
  recordedResidue: string[];
}

function structuredResult(value: Record<string, unknown>, isError = false) {
  return {
    structuredContent: value,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    isError
  };
}

function actionToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No desktop action was recorded."]
      },
      true
    );
  }

  if (error instanceof DesktopProviderErrorClass) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No desktop action was recorded.", ...error.residue]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "action_tool_error",
        message: error instanceof Error ? error.message : "Unknown action tool error."
      },
      residue: ["No desktop action was recorded."]
    },
    true
  );
}

function actionRequestedEvent(
  runtime: ActionToolRuntime,
  action: DesktopActionPacket
): DesktopSessionAuditEvent {
  return {
    eventId: runtime.generateId("event"),
    sessionId: action.sessionId,
    eventType: "action_requested",
    occurredAt: action.requestedAt,
    actionId: action.actionId,
    summary: `Requested ${action.actionType} inside a licensed desktop interaction session.`,
    residue: action.residue
  };
}

function actionDecisionEvent(
  runtime: ActionToolRuntime,
  action: DesktopActionPacket,
  eventType: "action_allowed" | "action_blocked" | "escalation_required",
  summary: string,
  residue: string[]
): DesktopSessionAuditEvent {
  return {
    eventId: runtime.generateId("event"),
    sessionId: action.sessionId,
    eventType,
    occurredAt: runtime.now(),
    actionId: action.actionId,
    summary,
    residue
  };
}

function stopConditionForBlockingGate(
  action: DesktopActionPacket,
  blockingTransitionGate: InteractionTransitionGate
): DesktopSessionStopCondition {
  return {
    condition: "missing_post_action_observation",
    sessionId: action.sessionId,
    actionId: action.actionId,
    reason: `Action ${blockingTransitionGate.actionId} requires follow-up observation and transition audit before another non-observe action.`,
    residue: [
      `Blocking transition status: ${blockingTransitionGate.status}.`,
      "Call desktop_observe with transitionActionId before retrying the action."
    ]
  };
}

function appendStopConditions(
  runtime: ActionToolRuntime,
  stopConditions: DesktopSessionStopCondition[]
): void {
  for (const stopCondition of stopConditions) {
    runtime.sessionStore.appendStopCondition(stopCondition);
  }
}

function credentialLikeText(text: string): boolean {
  const normalized = text.toLowerCase();

  return [
    /password\s*[:=]/u,
    /\bpwd\s*[:=]/u,
    /api[_-]?key\s*[:=]/u,
    /\btoken\s*[:=]/u,
    /\bsecret\s*[:=]/u,
    /\bbearer\s+[a-z0-9._-]+/u,
    /\bsk-[a-z0-9]{12,}/u,
    /\bghp_[a-z0-9_]{12,}/u,
    /-----begin [a-z ]+private key-----/u
  ].some((pattern) => pattern.test(normalized));
}

function riskForTypeText(input: TypeTextInput): DesktopActionRisk {
  return {
    ...input.risk,
    credentialExposure:
      input.risk.credentialExposure ||
      input.sensitivityClassification !== "test_input" ||
      credentialLikeText(input.text)
  };
}

async function executeStateChangingAction<Input extends { sessionId: string }>(
  runtime: ActionToolRuntime,
  input: Input,
  config: ActionExecutionConfig<Input>
) {
  try {
    runtime.sessionStore.requireActiveSession(input.sessionId);

    const requestedAt = runtime.now();
    const action = config.buildAction(
      input,
      runtime.generateId("action"),
      requestedAt
    );
    const requestedAuditEvent = actionRequestedEvent(runtime, action);

    runtime.sessionStore.appendAuditEvent(requestedAuditEvent);

    const blockingTransitionGate = runtime.sessionStore.findBlockingTransitionGate(
      input.sessionId
    );

    if (blockingTransitionGate !== undefined) {
      const stopCondition = stopConditionForBlockingGate(action, blockingTransitionGate);
      const blockedAuditEvent = actionDecisionEvent(
        runtime,
        action,
        "action_blocked",
        stopCondition.reason,
        stopCondition.residue
      );

      runtime.sessionStore.appendStopCondition(stopCondition);
      runtime.sessionStore.appendAuditEvent(blockedAuditEvent);

      return structuredResult(
        {
          sessionId: input.sessionId,
          status: "blocked",
          action,
          blockingTransitionGate,
          stopCondition,
          auditEvents: [requestedAuditEvent, blockedAuditEvent],
          residue: [config.providerCallBlockedResidue]
        },
        true
      );
    }

    const context = runtime.sessionStore.getActionPolicyContext(input.sessionId, {
      now: requestedAt,
      phase: "preflight"
    });
    const session = runtime.sessionStore.requireActiveSession(input.sessionId);
    const policy = evaluateSessionActionPolicy(session.license, action, context);

    if (policy.decision !== "allow") {
      const eventType =
        policy.decision === "escalate" ? "escalation_required" : "action_blocked";
      const decisionAuditEvent = actionDecisionEvent(
        runtime,
        action,
        eventType,
        policy.reasons.join(" "),
        [...policy.residue, ...action.residue]
      );

      appendStopConditions(runtime, policy.stopConditions);
      runtime.sessionStore.appendAuditEvent(decisionAuditEvent);

      return structuredResult(
        {
          sessionId: input.sessionId,
          status: policy.decision,
          action,
          policy,
          auditEvents: [requestedAuditEvent, decisionAuditEvent],
          residue: [config.policyBlockedResidue]
        },
        true
      );
    }

    const providerCapabilities = runtime.desktopProvider.getCapabilities();

    if (!config.providerSupports(runtime.desktopProvider)) {
      const stopCondition: DesktopSessionStopCondition = {
        condition: "action_not_allowed",
        sessionId: input.sessionId,
        actionId: action.actionId,
        reason: config.unsupportedProviderReason,
        residue: providerCapabilities.residue
      };
      const blockedAuditEvent = actionDecisionEvent(
        runtime,
        action,
        "action_blocked",
        stopCondition.reason,
        stopCondition.residue
      );

      runtime.sessionStore.appendStopCondition(stopCondition);
      runtime.sessionStore.appendAuditEvent(blockedAuditEvent);

      return structuredResult(
        {
          sessionId: input.sessionId,
          status: "blocked",
          action,
          providerCapabilities,
          stopCondition,
          auditEvents: [requestedAuditEvent, blockedAuditEvent],
          residue: ["No provider call was made."]
        },
        true
      );
    }

    let providerResult: DesktopProviderActionResult;

    try {
      providerResult = await config.callProvider(
        runtime.desktopProvider,
        input,
        requestedAt
      );
    } catch (error: unknown) {
      if (error instanceof DesktopProviderErrorClass) {
        const stopCondition: DesktopSessionStopCondition = {
          condition: "action_not_allowed",
          sessionId: input.sessionId,
          actionId: action.actionId,
          reason: error.message,
          residue: error.residue
        };
        const blockedAuditEvent = actionDecisionEvent(
          runtime,
          action,
          "action_blocked",
          stopCondition.reason,
          stopCondition.residue
        );

        runtime.sessionStore.appendStopCondition(stopCondition);
        runtime.sessionStore.appendAuditEvent(blockedAuditEvent);

        return structuredResult(
          {
            sessionId: input.sessionId,
            status: "blocked",
            action,
            providerCapabilities,
            error: {
              code: error.code,
              message: error.message
            },
            stopCondition,
            auditEvents: [requestedAuditEvent, blockedAuditEvent],
            residue: ["Provider rejected the action before execution.", ...error.residue]
          },
          true
        );
      }

      throw error;
    }

    if (!providerResult.executed) {
      const stopCondition: DesktopSessionStopCondition = {
        condition: "action_not_allowed",
        sessionId: input.sessionId,
        actionId: action.actionId,
        reason: `The active desktop provider did not execute ${config.actionType}.`,
        residue: providerResult.residue
      };
      const blockedAuditEvent = actionDecisionEvent(
        runtime,
        action,
        "action_blocked",
        stopCondition.reason,
        stopCondition.residue
      );

      runtime.sessionStore.appendStopCondition(stopCondition);
      runtime.sessionStore.appendAuditEvent(blockedAuditEvent);

      return structuredResult(
        {
          sessionId: input.sessionId,
          status: "blocked",
          action,
          providerCapabilities,
          providerResult,
          stopCondition,
          auditEvents: [requestedAuditEvent, blockedAuditEvent],
          residue: ["Provider call returned without action execution."]
        },
        true
      );
    }

    const recordedAction = runtime.sessionStore.recordAction({
      ...action,
      residue: [...action.residue, ...providerResult.residue]
    });
    const sourceObservation =
      action.preActionObservationId === undefined
        ? undefined
        : runtime.sessionStore.getObservation(
            input.sessionId,
            action.preActionObservationId
          );
    const actionCount = runtime.sessionStore.incrementActionCount(input.sessionId);
    const transitionGate = runtime.sessionStore.recordTransitionGate(
      createPendingInteractionTransitionGate({
        transitionId: runtime.generateId("transition"),
        action: recordedAction,
        createdAt: runtime.now(),
        sourceObservation,
        providerReportedCursorPosition: providerResult.cursorPosition,
        protectedObservables: config.protectedObservables,
        expectedEvidenceAfterAction: config.expectedEvidenceAfterAction,
        residue: [
          "Transition gate is pending follow-up observation.",
          "Call desktop_observe with transitionActionId before any next non-observe action."
        ]
      })
    );
    const allowedAuditEvent = actionDecisionEvent(
      runtime,
      recordedAction,
      "action_allowed",
      config.allowedSummary,
      transitionGate.residue
    );

    runtime.sessionStore.appendAuditEvent(allowedAuditEvent);

    return structuredResult({
      sessionId: input.sessionId,
      status: "requires_post_action_observation",
      action: recordedAction,
      policy,
      providerCapabilities,
      providerResult,
      transitionGate,
      actionCount,
      auditEvents: [requestedAuditEvent, allowedAuditEvent],
      requiresPostActionObservation: true,
      residue: config.recordedResidue
    });
  } catch (error: unknown) {
    return actionToolError(error);
  }
}

export function registerActionTools(server: McpServer, runtime: ActionToolRuntime): void {
  server.registerTool(
    "desktop_move_mouse",
    {
      title: "Desktop Mouse Movement Probe",
      description:
        "Run a bounded mouse movement probe inside an active desktop interaction session. Real movement is available only when the active provider explicitly supports it.",
      inputSchema: moveMouseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) =>
      executeStateChangingAction(runtime, input, {
        actionType: "move_mouse",
        unsupportedProviderReason: "The active desktop provider does not support mouse movement.",
        providerSupports: (provider) => provider.getCapabilities().supportsMouse,
        buildAction: (actionInput, actionId, requestedAt) => ({
          actionId,
          sessionId: actionInput.sessionId,
          actionType: "move_mouse",
          requestedAt,
          targetScope: actionInput.targetScope,
          preActionObservationId: actionInput.preActionObservationId,
          intendedSemanticTarget: actionInput.intendedSemanticTarget,
          input: {
            point: actionInput.point
          },
          risk: lowRisk,
          residue: [
            "Mouse movement is treated as a probe.",
            "A post-movement observation is required before the next non-observe action."
          ]
        }),
        callProvider: (provider, actionInput, requestedAt) =>
          provider.moveMouse({
            sessionId: actionInput.sessionId,
            targetScope: actionInput.targetScope,
            requestedAt,
            point: actionInput.point,
            intendedSemanticTarget: actionInput.intendedSemanticTarget
          }),
        protectedObservables: [
          "session scope",
          "target scope",
          "pre-action observation frame evidence",
          "cursor position",
          "intended semantic target"
        ],
        expectedEvidenceAfterAction: [
          "cursor position reflects the requested point",
          "visual deltas such as hover highlight, tooltip, focus, enabled state, or cursor change may appear",
          "active window remains inside the licensed scope"
        ],
        allowedSummary:
          "Mouse movement probe was licensed through the active provider; post-movement observation is required.",
        policyBlockedResidue:
          "Policy blocked the movement probe before any provider call.",
        providerCallBlockedResidue:
          "No provider call was made and no mouse movement was simulated.",
        recordedResidue: [
          "Movement probe was recorded.",
          "The active provider result states whether movement was real or simulated.",
          "The next non-observe action is blocked until the transition gate is audited by observation."
        ]
      })
  );

  server.registerTool(
    "desktop_click",
    {
      title: "Mock Desktop Click Probe",
      description:
        "Simulate a bounded click inside an active desktop interaction session. The default provider does not click the real desktop.",
      inputSchema: clickInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) =>
      executeStateChangingAction(runtime, input, {
        actionType: "click",
        unsupportedProviderReason: "The active desktop provider does not support clicking.",
        providerSupports: (provider) => provider.getCapabilities().supportsClick,
        buildAction: (actionInput, actionId, requestedAt) => ({
          actionId,
          sessionId: actionInput.sessionId,
          actionType: "click",
          requestedAt,
          targetScope: actionInput.targetScope,
          preActionObservationId: actionInput.preActionObservationId,
          intendedSemanticTarget: actionInput.intendedSemanticTarget,
          input: {
            point: actionInput.point,
            button: actionInput.button
          },
          risk: actionInput.risk,
          residue: [
            "Clicking requires current visual evidence.",
            "A post-click observation is required before success can be claimed."
          ]
        }),
        callProvider: (provider, actionInput, requestedAt) =>
          provider.click({
            sessionId: actionInput.sessionId,
            targetScope: actionInput.targetScope,
            requestedAt,
            point: actionInput.point,
            button: actionInput.button,
            intendedSemanticTarget: actionInput.intendedSemanticTarget
          }),
        protectedObservables: [
          "session scope",
          "target scope",
          "pre-action observation frame evidence",
          "click point",
          "button",
          "intended semantic target"
        ],
        expectedEvidenceAfterAction: [
          "visible UI state changes according to the clicked control",
          "active window remains inside the licensed scope",
          "no credential, payment, publishing, destructive, or system boundary appears"
        ],
        allowedSummary:
          "Mock click was licensed and simulated; post-click observation is required.",
        policyBlockedResidue: "Policy blocked the click before any provider call.",
        providerCallBlockedResidue: "No provider call was made and no click was simulated.",
        recordedResidue: [
          "Mock click was recorded.",
          "No real click, typing, OS capture, or OS mutation occurred.",
          "The next non-observe action is blocked until the transition gate is audited by observation."
        ]
      })
  );

  server.registerTool(
    "desktop_type_text",
    {
      title: "Mock Desktop Text Entry",
      description:
        "Simulate bounded test-text entry inside an active desktop interaction session. The default provider does not type into the real desktop.",
      inputSchema: typeTextInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) =>
      executeStateChangingAction(runtime, input, {
        actionType: "type_text",
        unsupportedProviderReason: "The active desktop provider does not support typing.",
        providerSupports: (provider) => provider.getCapabilities().supportsTyping,
        buildAction: (actionInput, actionId, requestedAt) => ({
          actionId,
          sessionId: actionInput.sessionId,
          actionType: "type_text",
          requestedAt,
          targetScope: actionInput.targetScope,
          preActionObservationId: actionInput.preActionObservationId,
          intendedSemanticTarget: actionInput.intendedSemanticTarget,
          input: {
            textLength: actionInput.text.length
          },
          risk: riskForTypeText(actionInput),
          residue: [
            `Text sensitivity classification: ${actionInput.sensitivityClassification}.`,
            "Text content is not stored in the action packet or audit event.",
            "A post-typing observation is required before success can be claimed."
          ]
        }),
        callProvider: (provider, actionInput, requestedAt) =>
          provider.typeText({
            sessionId: actionInput.sessionId,
            targetScope: actionInput.targetScope,
            requestedAt,
            text: actionInput.text,
            textLength: actionInput.text.length,
            intendedSemanticTarget: actionInput.intendedSemanticTarget
          }),
        protectedObservables: [
          "session scope",
          "target scope",
          "pre-action observation frame evidence",
          "text length",
          "intended semantic target",
          "absence of credential-like content"
        ],
        expectedEvidenceAfterAction: [
          "text field or focused control reflects the generated test input length",
          "active window remains inside the licensed scope",
          "no credential, payment, publishing, destructive, or system boundary appears"
        ],
        allowedSummary:
          "Mock text entry was licensed and simulated; post-typing observation is required.",
        policyBlockedResidue:
          "Policy blocked text entry before any provider call. Text content was not stored.",
        providerCallBlockedResidue:
          "No provider call was made and no typing was simulated.",
        recordedResidue: [
          "Mock text entry was recorded.",
          "No real typing, click, OS capture, or OS mutation occurred.",
          "Text content was not stored in the action packet or audit event.",
          "The next non-observe action is blocked until the transition gate is audited by observation."
        ]
      })
  );
}
