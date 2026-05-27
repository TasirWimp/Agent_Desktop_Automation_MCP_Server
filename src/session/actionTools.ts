import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopPointSchema,
  evaluateSessionActionPolicy,
  type DesktopActionPacket,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition
} from "../policy/sessionLicensePolicy.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";
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

const moveMouseInputSchema = z.object({
  sessionId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  preActionObservationId: z.string().min(1),
  point: desktopPointSchema,
  intendedSemanticTarget: z.string().min(1).max(1000).optional()
});

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

function lowRiskMoveAction(action: Omit<DesktopActionPacket, "risk" | "residue">): DesktopActionPacket {
  return {
    ...action,
    risk: {
      credentialExposure: false,
      destructive: false,
      externalEffect: false,
      systemChange: false,
      recoverability: "high"
    },
    residue: [
      "Mouse movement is treated as a probe.",
      "A post-movement observation is required before the next non-observe action."
    ]
  };
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

export function registerActionTools(server: McpServer, runtime: ActionToolRuntime): void {
  server.registerTool(
    "desktop_move_mouse",
    {
      title: "Mock Desktop Mouse Movement Probe",
      description:
        "Simulate a bounded mouse movement probe inside an active desktop interaction session. The default provider does not move the real cursor.",
      inputSchema: moveMouseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        runtime.sessionStore.requireActiveSession(input.sessionId);

        const requestedAt = runtime.now();
        const action = lowRiskMoveAction({
          actionId: runtime.generateId("action"),
          sessionId: input.sessionId,
          actionType: "move_mouse",
          requestedAt,
          targetScope: input.targetScope,
          preActionObservationId: input.preActionObservationId,
          intendedSemanticTarget: input.intendedSemanticTarget,
          input: {
            point: input.point
          }
        });
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
              residue: ["No provider call was made and no mouse movement was simulated."]
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
            policy.residue
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
              residue: ["Policy blocked the movement probe before any provider call."]
            },
            true
          );
        }

        const providerCapabilities = runtime.desktopProvider.getCapabilities();

        if (!providerCapabilities.supportsMouse) {
          const stopCondition: DesktopSessionStopCondition = {
            condition: "action_not_allowed",
            sessionId: input.sessionId,
            actionId: action.actionId,
            reason: "The active desktop provider does not support mouse movement.",
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

        const providerResult = await runtime.desktopProvider.moveMouse({
          sessionId: input.sessionId,
          targetScope: input.targetScope,
          requestedAt,
          point: input.point,
          intendedSemanticTarget: input.intendedSemanticTarget
        });
        const recordedAction = runtime.sessionStore.recordAction({
          ...action,
          residue: [...action.residue, ...providerResult.residue]
        });
        const actionCount = runtime.sessionStore.incrementActionCount(input.sessionId);
        const transitionGate = runtime.sessionStore.recordTransitionGate(
          createPendingInteractionTransitionGate({
            transitionId: runtime.generateId("transition"),
            action: recordedAction,
            createdAt: runtime.now(),
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
          "Mock mouse movement probe was licensed and simulated; post-movement observation is required.",
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
          residue: [
            "Mock movement probe was recorded.",
            "No real cursor movement, click, typing, OS capture, or OS mutation occurred.",
            "The next non-observe action is blocked until the transition gate is audited by observation."
          ]
        });
      } catch (error: unknown) {
        return actionToolError(error);
      }
    }
  );
}
