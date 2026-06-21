import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopCompactRelationalClaimSchema,
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  desktopPointSchema,
  desktopPreActionNavigationCheckSchema,
  desktopRelationalNavigationSchema,
  evaluateSessionActionPolicy,
  type DesktopActionPacket,
  type DesktopActionRisk,
  type DesktopCompactRelationalClaim,
  type DesktopObservationPacket,
  type DesktopPoint,
  type DesktopPreActionNavigationCheck,
  type DesktopRelationalNavigation,
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
import type { HoverTargetWitness } from "./hoverTargetWitness.js";
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
  intendedSemanticTarget: z.string().min(1).max(1000).optional(),
  compactRelationalClaim: desktopCompactRelationalClaimSchema.optional(),
  relationalNavigation: desktopRelationalNavigationSchema.optional(),
  preActionNavigationCheck: desktopPreActionNavigationCheckSchema.optional()
});

const moveMouseInputSchema = baseActionInputSchema.extend({
  point: desktopPointSchema
});

const clickInputSchema = baseActionInputSchema.extend({
  point: desktopPointSchema,
  button: z.enum(["left", "middle", "right"]).default("left"),
  hoverTargetWitnessId: z.string().min(1).optional(),
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
  buildAction: (
    input: Input,
    actionId: string,
    requestedAt: string,
    sourceObservation?: DesktopObservationPacket
  ) => DesktopActionPacket;
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

interface CompactClaimExpansion {
  relationalNavigation: DesktopRelationalNavigation;
  preActionNavigationCheck: DesktopPreActionNavigationCheck;
}

function expandCompactRelationalClaim(
  claim: DesktopCompactRelationalClaim,
  actionId: string,
  actionType: SupportedActionType,
  sourceObservation?: DesktopObservationPacket
): CompactClaimExpansion | undefined {
  if (sourceObservation === undefined || sourceObservation.frames.length === 0) {
    return undefined;
  }

  const navigationId = `nav-${actionId}`;
  const orientationId = `orientation-${actionId}`;
  const regionId = `region-${actionId}`;
  const traceId = `trace-${actionId}`;
  const hypothesisId = `hypothesis-${actionId}`;
  const exploratoryAction =
    actionType === "move_mouse" && claim.pointProvenance !== "hover_witness";
  const frameEvidence = sourceObservation.frames
    .filter((frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0)
    .map((frame) => ({
      evidenceId: `frame-evidence-${actionId}-${frame.index}`,
      sourceObservationId: sourceObservation.observationId,
      frameIndex: frame.index,
      frameSha256: frame.sha256,
      imagePayloadPresent: true as const,
      visualEvidenceRole:
        "Live screenshot frame used to derive compact relational navigation claim.",
      residue: [
        "Frame hash was copied from the live pre-action observation during compact claim expansion."
      ]
    }));

  if (frameEvidence.length === 0) {
    return undefined;
  }

  const relationalNavigation = desktopRelationalNavigationSchema.parse({
    navigationId,
    frameEvidence,
    orientation: {
      orientationId,
      sourceObservationId: claim.sourceObservationId,
      userImpliedTask: claim.intendedTarget,
      sceneSummary: claim.scene,
      landmarks: [
        {
          landmarkId: `landmark-${actionId}-anchor`,
          kind: "spatial",
          label: claim.anchor,
          description: claim.anchor,
          observedRole: "compact_claim_anchor",
          spatialRelation: claim.relation,
          confidence: "medium",
          residue: []
        }
      ],
      coarseRelations: [claim.relation],
      confidence: claim.pointProvenance === "hover_witness" ? "high" : "medium",
      residue: [
        "Orientation was generated from compactRelationalClaim to reduce client token burden."
      ]
    },
    regionHypothesis: {
      regionId,
      orientationId,
      candidateRegionDescription: claim.candidate,
      relationToLandmarks: [claim.relation],
      expectedTraces: [claim.expectedEvidence],
      ruledOutAlternatives: [claim.rejectedAlternative],
      rejectedAlternatives: [
        {
          alternativeId: `alternative-${actionId}-rejected`,
          description: claim.rejectedAlternative,
          whyPlausible:
            "The compact claim names this as the nearby plausible wrong target.",
          whyRejected: claim.contradiction,
          relationToTarget: claim.relation,
          contradictionSignal: claim.contradiction,
          confidence: "medium",
          residue: []
        }
      ],
      confidence: claim.pointProvenance === "hover_witness" ? "high" : "medium",
      residue: [
        `Point provenance: ${claim.pointProvenance}.`,
        "Coordinates are retained as action endpoints only, not as target-correctness proof."
      ]
    },
    traceHypothesis: {
      traceId,
      regionId,
      traceSummary: claim.expectedEvidence,
      supportingTraces: [claim.expectedEvidence],
      missingOrAmbiguousTraces: [claim.contradiction],
      exactTargetCriteria: [
        claim.relation,
        claim.candidate,
        `Rejected alternative avoided: ${claim.rejectedAlternative}.`
      ],
      confidence: claim.pointProvenance === "hover_witness" ? "high" : "medium",
      residue: []
    },
    actionJustification: {
      hypothesisId,
      traceId,
      intendedSemanticTarget: claim.intendedTarget,
      targetPointRationale:
        "Point is used as a relationally justified probe/action endpoint; semantic correctness must be verified by follow-up observation.",
      relationPath: [claim.scene, claim.anchor, claim.relation, claim.candidate],
      expectedHoverEvidence: [claim.expectedEvidence],
      contradictionSignals: [claim.contradiction],
      confidence: claim.pointProvenance === "hover_witness" ? "high" : "medium",
      residue: [
        "Expanded from compactRelationalClaim by the server before provider execution."
      ]
    },
    residue: [
      "Compact relational claim was expanded server-side for auditability.",
      "Raw coordinate landing is telemetry only; semantic landing still requires assessment."
    ]
  });
  const preActionNavigationCheck = desktopPreActionNavigationCheckSchema.parse({
    checkId: `pre-action-check-${actionId}`,
    sourceObservationId: claim.sourceObservationId,
    navigationId,
    hypothesisId,
    reviewedLiveObservation: true,
    comparedAgainstAlternatives: true,
    contradictionSignalsReviewed: true,
    acknowledgedSemanticGap: true,
    exploratoryAction,
    ambiguityDescription: exploratoryAction
      ? "Movement is a relational probe whose semantic landing must be assessed after follow-up observation."
      : undefined,
    repairOrBacktrackPlan:
      "If follow-up evidence contradicts the claimed relation, backtrack or refine the target inside the licensed scope.",
    readyToAct: true,
    selectedActionRationale:
      "The compact claim names the scene, anchor, relation, candidate, rejected alternative, expected evidence, and contradiction.",
    confidence: claim.pointProvenance === "hover_witness" ? "high" : "medium",
    residue: [
      "Generated server-side from compactRelationalClaim.",
      "This self-check records the required relational comparison without requiring the client to emit the full packet."
    ]
  });

  return {
    relationalNavigation,
    preActionNavigationCheck
  };
}

function sourceObservationForAction(
  runtime: ActionToolRuntime,
  input: { sessionId: string; preActionObservationId?: string }
): DesktopObservationPacket | undefined {
  if (input.preActionObservationId === undefined) {
    return undefined;
  }

  return runtime.sessionStore.getObservation(
    input.sessionId,
    input.preActionObservationId
  );
}

interface ClickHoverWitnessValidationResult {
  ok: boolean;
  hoverTargetWitness?: HoverTargetWitness;
  reason?: string;
  residue: string[];
}

function pointDistance(first: DesktopPoint, second: DesktopPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function validateClickHoverTargetWitness(
  runtime: ActionToolRuntime,
  action: DesktopActionPacket
): ClickHoverWitnessValidationResult {
  if (action.actionType !== "click") {
    return { ok: true, residue: [] };
  }

  const hoverTargetWitnessId = action.input.hoverTargetWitnessId;

  if (hoverTargetWitnessId === undefined) {
    return {
      ok: false,
      reason: "desktop_click requires hoverTargetWitnessId from desktop_evaluate_click_candidate.",
      residue: [
        "Click requests require a supported semantic landing assessment and hover witness.",
        "Run observe -> semantic landing assessment -> desktop_evaluate_click_candidate before clicking."
      ]
    };
  }

  const hoverTargetWitness = runtime.sessionStore.getHoverTargetWitness(
    action.sessionId,
    hoverTargetWitnessId
  );

  if (hoverTargetWitness === undefined) {
    return {
      ok: false,
      reason: `Hover target witness ${hoverTargetWitnessId} was not found in the active session.`,
      residue: ["No provider call was made and no click occurred."]
    };
  }

  if (hoverTargetWitness.visualConfirmation.status !== "confirmed") {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Hover target witness is not visually and semantically confirmed.",
      residue: hoverTargetWitness.residue
    };
  }

  if (!desktopInteractionScopesMatch(hoverTargetWitness.targetScope, action.targetScope)) {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Hover target witness scope does not match click target scope.",
      residue: hoverTargetWitness.residue
    };
  }

  if (hoverTargetWitness.followUpObservationId !== action.preActionObservationId) {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Click pre-action observation must be the hover witness follow-up observation.",
      residue: [
        `Click preActionObservationId: ${action.preActionObservationId ?? "missing"}.`,
        `Witness followUpObservationId: ${hoverTargetWitness.followUpObservationId}.`
      ]
    };
  }

  if (
    action.intendedSemanticTarget !== undefined &&
    hoverTargetWitness.intendedSemanticTarget !== action.intendedSemanticTarget
  ) {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Hover target witness semantic target does not match the click request.",
      residue: [
        `Click target: ${action.intendedSemanticTarget}.`,
        `Witness target: ${hoverTargetWitness.intendedSemanticTarget}.`
      ]
    };
  }

  const witnessedPoint =
    hoverTargetWitness.candidatePoint ??
    hoverTargetWitness.observedCursorPoint ??
    hoverTargetWitness.plannedHoverPoint;

  if (action.input.point === undefined || witnessedPoint === undefined) {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Click point and witnessed hover/candidate point are both required.",
      residue: hoverTargetWitness.residue
    };
  }

  const distance = pointDistance(action.input.point, witnessedPoint);

  if (distance > 2) {
    return {
      ok: false,
      hoverTargetWitness,
      reason: "Click point must match the supported hover/candidate witness.",
      residue: [
        `Click point is ${Math.round(distance * 100) / 100} px from the witnessed point.`,
        "A nearby coordinate is not accepted as proof of the same target."
      ]
    };
  }

  return {
    ok: true,
    hoverTargetWitness,
    residue: [
      "Click point matched the supported hover/candidate witness.",
      "Semantic confirmation came from the stored landing assessment, not coordinate proximity alone."
    ]
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
    const sourceObservation = sourceObservationForAction(runtime, input);
    const action = config.buildAction(
      input,
      runtime.generateId("action"),
      requestedAt,
      sourceObservation
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

    const clickHoverWitnessValidation = validateClickHoverTargetWitness(
      runtime,
      action
    );

    if (!clickHoverWitnessValidation.ok) {
      const stopCondition: DesktopSessionStopCondition = {
        condition: "missing_semantic_landing_assessment",
        sessionId: input.sessionId,
        actionId: action.actionId,
        reason:
          clickHoverWitnessValidation.reason ??
          "Click request lacks a valid hover target witness.",
        residue: clickHoverWitnessValidation.residue
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
          policy,
          stopCondition,
          hoverTargetWitness: clickHoverWitnessValidation.hoverTargetWitness,
          auditEvents: [requestedAuditEvent, blockedAuditEvent],
          residue: ["No provider call was made and no click occurred."]
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
        buildAction: (actionInput, actionId, requestedAt, sourceObservation) => {
          const expansion =
            actionInput.compactRelationalClaim === undefined
              ? undefined
              : expandCompactRelationalClaim(
                  actionInput.compactRelationalClaim,
                  actionId,
                  "move_mouse",
                  sourceObservation
                );

          return {
            actionId,
            sessionId: actionInput.sessionId,
            actionType: "move_mouse",
            requestedAt,
            targetScope: actionInput.targetScope,
            preActionObservationId: actionInput.preActionObservationId,
            intendedSemanticTarget:
              actionInput.intendedSemanticTarget ??
              actionInput.compactRelationalClaim?.intendedTarget,
            input: {
              point: actionInput.point
            },
            compactRelationalClaim: actionInput.compactRelationalClaim,
            relationalNavigation:
              actionInput.relationalNavigation ?? expansion?.relationalNavigation,
            preActionNavigationCheck:
              actionInput.preActionNavigationCheck ??
              expansion?.preActionNavigationCheck,
            risk: lowRisk,
            residue: [
              "Mouse movement is treated as a relational probe.",
              "Coordinates are action endpoints only; semantic landing must be assessed after follow-up observation.",
              "A post-movement observation is required before the next non-observe action."
            ]
          };
        },
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
          "The next non-observe action is blocked until post-movement observation and semantic landing assessment complete the transition gate."
        ]
      })
  );

  server.registerTool(
    "desktop_click",
    {
      title: "Desktop Click Probe",
      description:
        "Run a bounded app-scoped click inside an active desktop interaction session. Real clicking is available only when the active provider explicitly supports it.",
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
        buildAction: (actionInput, actionId, requestedAt, sourceObservation) => {
          const expansion =
            actionInput.compactRelationalClaim === undefined
              ? undefined
              : expandCompactRelationalClaim(
                  actionInput.compactRelationalClaim,
                  actionId,
                  "click",
                  sourceObservation
                );

          return {
            actionId,
            sessionId: actionInput.sessionId,
            actionType: "click",
            requestedAt,
            targetScope: actionInput.targetScope,
            preActionObservationId: actionInput.preActionObservationId,
            intendedSemanticTarget:
              actionInput.intendedSemanticTarget ??
              actionInput.compactRelationalClaim?.intendedTarget,
            input: {
              point: actionInput.point,
              button: actionInput.button,
              hoverTargetWitnessId: actionInput.hoverTargetWitnessId
            },
            compactRelationalClaim: actionInput.compactRelationalClaim,
            relationalNavigation:
              actionInput.relationalNavigation ?? expansion?.relationalNavigation,
            preActionNavigationCheck:
              actionInput.preActionNavigationCheck ??
              expansion?.preActionNavigationCheck,
            risk: actionInput.risk,
            residue: [
              "Clicking requires current relational and hover-witness evidence.",
              "A post-click observation is required before success can be claimed."
            ]
          };
        },
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
          "Click was licensed through the active provider; post-click observation is required.",
        policyBlockedResidue: "Policy blocked the click before any provider call.",
        providerCallBlockedResidue: "No provider call was made and no click occurred.",
        recordedResidue: [
          "Click was recorded.",
          "The active provider result states whether the click was real or simulated.",
          "The next non-observe action is blocked until the transition gate is audited by observation."
        ]
      })
  );

  server.registerTool(
    "desktop_type_text",
    {
      title: "Desktop Text Entry",
      description:
        "Run bounded app-scoped generated test-text entry inside an active desktop interaction session. Real typing is available only when the active provider explicitly supports it.",
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
        buildAction: (actionInput, actionId, requestedAt, sourceObservation) => {
          const expansion =
            actionInput.compactRelationalClaim === undefined
              ? undefined
              : expandCompactRelationalClaim(
                  actionInput.compactRelationalClaim,
                  actionId,
                  "type_text",
                  sourceObservation
                );

          return {
            actionId,
            sessionId: actionInput.sessionId,
            actionType: "type_text",
            requestedAt,
            targetScope: actionInput.targetScope,
            preActionObservationId: actionInput.preActionObservationId,
            intendedSemanticTarget:
              actionInput.intendedSemanticTarget ??
              actionInput.compactRelationalClaim?.intendedTarget,
            input: {
              textLength: actionInput.text.length
            },
            compactRelationalClaim: actionInput.compactRelationalClaim,
            relationalNavigation:
              actionInput.relationalNavigation ?? expansion?.relationalNavigation,
            preActionNavigationCheck:
              actionInput.preActionNavigationCheck ??
              expansion?.preActionNavigationCheck,
            risk: riskForTypeText(actionInput),
            residue: [
              `Text sensitivity classification: ${actionInput.sensitivityClassification}.`,
              "Text content is not stored in the action packet or audit event.",
              "A post-typing observation is required before success can be claimed."
            ]
          };
        },
        callProvider: (provider, actionInput, requestedAt) =>
          provider.typeText({
            sessionId: actionInput.sessionId,
            targetScope: actionInput.targetScope,
            requestedAt,
            text: actionInput.text,
            textLength: actionInput.text.length,
            sensitivityClassification: actionInput.sensitivityClassification,
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
          "Text entry was licensed through the active provider; post-typing observation is required.",
        policyBlockedResidue:
          "Policy blocked text entry before any provider call. Text content was not stored.",
        providerCallBlockedResidue:
          "No provider call was made and no typing occurred.",
        recordedResidue: [
          "Text entry was recorded.",
          "The active provider result states whether typing was real or simulated.",
          "Text content was not stored in the action packet or audit event.",
          "The next non-observe action is blocked until the transition gate is audited by observation."
        ]
      })
  );
}
