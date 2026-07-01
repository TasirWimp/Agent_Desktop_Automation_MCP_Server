import {
  normalizeNoContradiction,
  type DesktopActionRisk,
  type DesktopCompactRelationalClaim,
  type DesktopInteractionScope,
  type DesktopPoint
} from "../policy/sessionLicensePolicy.js";
import {
  applyUiTestClosureDecision,
  applyUiTestEvidencePhase,
  applyUiTestInteractionEvidenceIds,
  applyUiTestRouteCarrierTransition,
  applyUiTestTargetTrack,
  appendUiTestBehaviorLabels,
  evaluateUiTestTargetTrack,
  type UiTestEvidenceMode
} from "./uiTestCarrierUpdates.js";
import {
  type UiTestBehaviorLabel,
  type UiTestRunCarrier,
  type UiTestScenarioContract,
  type UiTestTransitionClassification,
  uiTestRunCarrierSchema,
  uiTestScenarioContractSchema
} from "./uiTestCarrierSchemas.js";

export const uiTestRunnerToolNames = [
  "desktop_start_interaction_session",
  "desktop_observe",
  "desktop_submit_interaction_evidence",
  "desktop_move_mouse",
  "desktop_click",
  "desktop_type_text",
  "desktop_session_audit_log",
  "desktop_end_interaction_session"
] as const;

export type UiTestRunnerToolName = (typeof uiTestRunnerToolNames)[number];

export type UiTestRunnerEvidenceMode = Extract<
  UiTestEvidenceMode,
  "new_target" | "same_target" | "repair_target"
>;

export interface UiTestRunnerToolCall {
  tool: UiTestRunnerToolName;
  arguments: Record<string, unknown>;
  instruction: string;
  mutatesDesktop: boolean;
  requiresVisualInspectionBefore: boolean;
  carrierHints: {
    targetKey?: string;
    canonicalIntendedTarget?: string;
    observationId?: string;
    evidenceMode?: UiTestRunnerEvidenceMode;
    transitionActionId?: string;
  };
  residue: string[];
}

export type UiTestRunnerPlan =
  | {
      status: "ready";
      call: UiTestRunnerToolCall;
      residue: string[];
    }
  | {
      status: "blocked";
      reason: string;
      nextRequiredStep: {
        tool: UiTestRunnerToolName;
        instruction: string;
        arguments: Record<string, unknown>;
      };
      residue: string[];
      behaviorLabels: UiTestBehaviorLabel[];
    };

export interface UiTestRunnerPerceptionEvidenceDraft {
  currentScene: string;
  currentAnchor: string;
  targetVisibility: "visible" | "not_visible" | "uncertain";
  anchorVisibility: "visible" | "not_visible" | "uncertain";
  contradictionToPriorClaim?: string | null;
  staleCarryoverReviewed: true;
  currentEvidence: string;
}

export interface UiTestRunnerWorkflowEvidenceDraft {
  workflowGoal: string;
  workflowStep: string;
  intendedElementTarget?: string;
  intendedActionMeaning: string;
  actionRole:
    | "probe"
    | "commit_precondition"
    | "execute_committed_action"
    | "text_entry"
    | "repair"
    | "not_applicable";
  requiredPrecondition: string;
  preconditionStatus:
    | "satisfied"
    | "not_satisfied"
    | "uncertain"
    | "not_applicable";
  committedStateEvidence: string;
  transientStateRisk: "none" | "possible" | "present" | "uncertain";
  missingConfirmation: string | null;
  expectedPostcondition: string;
  postconditionContradiction: string;
  currentContradiction: string | null;
  transitionActionId?: string;
  postconditionStatus?:
    | "satisfied"
    | "contradicted"
    | "inconclusive"
    | "not_applicable";
  staleCarryoverReviewed: true;
}

export interface UiTestRunnerTransitionAssessmentDraft {
  actionId: string;
  assessment: {
    outcome: "supported" | "contradicted" | "inconclusive";
    relationHeld: boolean;
    candidateSupported: boolean;
    rejectedAlternativeAvoided: boolean;
    expectedEvidenceSeen: string;
    contradictionSeen: boolean;
    summary: string;
  };
}

export interface UiTestRunnerClickCandidateDraft {
  workflowStateClaimId?: string;
  movementActionId?: string;
  candidatePoint?: DesktopPoint;
  candidateBbox?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  risk?: DesktopActionRisk;
}

export type UiTestRunnerRelationalClaimDraft = Omit<
  DesktopCompactRelationalClaim,
  "sourceObservationId" | "intendedTarget" | "pointProvenance"
> &
  Partial<
    Pick<
      DesktopCompactRelationalClaim,
      "sourceObservationId" | "intendedTarget" | "pointProvenance"
    >
  >;

export interface UiTestRunnerEvidenceResultInput {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  call: UiTestRunnerToolCall;
  result: Record<string, unknown>;
}

export interface UiTestRunnerApplyResult {
  carrier: UiTestRunCarrier;
  residue: string[];
  behaviorLabels: UiTestBehaviorLabel[];
}

const blockedRisk: DesktopActionRisk = {
  credentialExposure: false,
  destructive: false,
  externalEffect: false,
  systemChange: false,
  recoverability: "high"
};

const standardForbiddenSessionActions = [
  "credential_entry",
  "payment_or_purchase",
  "send_message",
  "external_publish",
  "destructive_file_operation",
  "shell_command",
  "system_change"
];

export function planUiTestStartSession(input: {
  scenario: UiTestScenarioContract;
  sessionId?: string;
  expiresAt?: string;
}): UiTestRunnerPlan {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const allowedActions = uniqueStrings([
    ...scenario.sessionLicense.allowedProbes.filter(
      (probe) => probe === "observe"
    ),
    ...scenario.sessionLicense.allowedActions
  ]);

  return readyCall({
    tool: "desktop_start_interaction_session",
    arguments: {
      sessionId: input.sessionId,
      userGoal: scenario.userGoal,
      userConfirmed: scenario.sessionLicense.userConfirmed,
      visibleContentAcknowledged:
        scenario.sessionLicense.visibleContentAcknowledged,
      allowedScopes: [scenario.sessionLicense.appUnderTestScope.scope],
      allowedActions,
      forbiddenActions: standardForbiddenSessionActions,
      licensedAppScope: scenario.sessionLicense.appUnderTestScope,
      riskLimits: scenario.sessionLicense.riskLimits,
      observationCadence: scenario.sessionLicense.observationCadence,
      expiresAt: input.expiresAt
    },
    instruction:
      "Start the bounded app-under-test session before observing or submitting evidence.",
    mutatesDesktop: false,
    requiresVisualInspectionBefore: false,
    carrierHints: {},
    residue: [
      "Runner harness composed desktop_start_interaction_session from the scenario contract.",
      "This call creates session state only; it does not observe, move, click, or type."
    ]
  });
}

export function planUiTestObserve(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  transitionActionId?: string;
}): UiTestRunnerPlan {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const targetScope =
    carrier.current.targetScope ?? scenario.sessionLicense.appUnderTestScope.scope;

  return readyCall({
    tool: "desktop_observe",
    arguments: {
      sessionId: carrier.session.sessionId,
      targetScope,
      includeImages: true,
      transitionActionId: input.transitionActionId
    },
    instruction:
      "Observe the licensed app scope and inspect visualArtifacts[].path before submitting interaction evidence.",
    mutatesDesktop: false,
    requiresVisualInspectionBefore: false,
    carrierHints: {
      transitionActionId: input.transitionActionId
    },
    residue: [
      "Observation is the next carrier witness.",
      "The server will capture/store artifacts but will not inspect pixels."
    ]
  });
}

export function planUiTestSubmitInteractionEvidence(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  evidenceMode: UiTestRunnerEvidenceMode;
  perception: UiTestRunnerPerceptionEvidenceDraft;
  targetKey?: string;
  workflow?: UiTestRunnerWorkflowEvidenceDraft;
  transitionAssessment?: UiTestRunnerTransitionAssessmentDraft;
  clickCandidate?: UiTestRunnerClickCandidateDraft;
}): UiTestRunnerPlan {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const targetResolution = resolveRunnerTarget({
    scenario,
    carrier,
    targetKey: input.targetKey
  });

  if (!targetResolution.ok) {
    return blockedPlan(
      targetResolution.reason,
      "desktop_observe",
      "Resolve a canonical target track before submitting interaction evidence.",
      {
        sessionId: carrier.session.sessionId,
        targetScope: carrier.current.targetScope ?? scenario.sessionLicense.appUnderTestScope.scope,
        includeImages: true
      },
      targetResolution.residue,
      ["target_string_drift"]
    );
  }

  if (carrier.current.observationId === undefined) {
    return blockedPlan(
      "interaction evidence requires a current observation id",
      "desktop_observe",
      "Call desktop_observe with includeImages: true, inspect the visual artifact, then submit interaction evidence.",
      {
        sessionId: carrier.session.sessionId,
        targetScope: targetResolution.targetScope,
        includeImages: true
      },
      ["Carrier has no current observationId."],
      []
    );
  }

  if (input.evidenceMode === "same_target" && carrier.current.targetKey === undefined) {
    return blockedPlan(
      "same_target evidence requires an active target track",
      "desktop_submit_interaction_evidence",
      "Use new_target evidence first to open the canonical target track.",
      {
        sessionId: carrier.session.sessionId,
        observationId: carrier.current.observationId,
        targetScope: targetResolution.targetScope,
        intendedTarget: targetResolution.canonicalIntendedTarget,
        evidenceMode: "new_target"
      },
      ["No active carrier targetKey is set."],
      ["target_string_drift"]
    );
  }

  const targetCheck = evaluateUiTestTargetTrack({
    scenario,
    carrier,
    intendedTarget: targetResolution.canonicalIntendedTarget,
    targetKey: targetResolution.targetKey,
    mode: input.evidenceMode
  });

  if (!targetCheck.allowed) {
    return blockedPlan(
      `target track check failed: ${targetCheck.status}`,
      "desktop_submit_interaction_evidence",
      "Open a new target track or correct the canonical target before submitting evidence.",
      {
        sessionId: carrier.session.sessionId,
        observationId: carrier.current.observationId,
        targetScope: targetResolution.targetScope,
        intendedTarget: targetResolution.canonicalIntendedTarget,
        evidenceMode: "new_target"
      },
      targetCheck.residue,
      targetCheck.behaviorLabels
    );
  }

  return readyCall({
    tool: "desktop_submit_interaction_evidence",
    arguments: removeUndefinedProperties({
      sessionId: carrier.session.sessionId,
      observationId: carrier.current.observationId,
      targetScope: targetResolution.targetScope,
      intendedTarget: targetResolution.canonicalIntendedTarget,
      evidenceMode: input.evidenceMode,
      perception: input.perception,
      workflow: input.workflow,
      transitionAssessment: input.transitionAssessment,
      clickCandidate: input.clickCandidate
    }),
    instruction:
      "Submit agent-authored evidence for the latest inspected screenshot-bearing observation.",
    mutatesDesktop: false,
    requiresVisualInspectionBefore: true,
    carrierHints: {
      targetKey: targetResolution.targetKey,
      canonicalIntendedTarget: targetResolution.canonicalIntendedTarget,
      observationId: carrier.current.observationId,
      evidenceMode: input.evidenceMode,
      transitionActionId: input.transitionAssessment?.actionId
    },
    residue: [
      "The helper is the preferred consistency hub for perception, workflow, transition, and click-candidate evidence.",
      "This call does not observe, move, click, type, launch apps, or inspect pixels."
    ]
  });
}

export function planUiTestMoveMouse(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  point: DesktopPoint;
  compactRelationalClaim: UiTestRunnerRelationalClaimDraft;
}): UiTestRunnerPlan {
  const readiness = mutationReadiness(input.scenario, input.carrier, {
    requireWorkflow: false,
    requireHoverWitness: false
  });

  if (!readiness.ok) {
    return readiness.blockedPlan;
  }

  const compactRelationalClaim = compactClaimFromCarrier({
    carrier: readiness.carrier,
    target: readiness.target,
    draft: input.compactRelationalClaim,
    pointProvenance:
      input.compactRelationalClaim.pointProvenance ?? "relational_estimate"
  });

  return readyCall({
    tool: "desktop_move_mouse",
    arguments: {
      sessionId: readiness.carrier.session.sessionId,
      targetScope: readiness.target.targetScope,
      preActionObservationId: readiness.carrier.current.observationId,
      perceptionDigestId: readiness.carrier.current.perceptionDigestId,
      intendedSemanticTarget: readiness.target.canonicalIntendedTarget,
      point: input.point,
      compactRelationalClaim
    },
    instruction:
      "Move the mouse as a relational probe, then observe the transitionActionId before any next non-observe action.",
    mutatesDesktop: true,
    requiresVisualInspectionBefore: false,
    carrierHints: {
      targetKey: readiness.target.targetKey,
      canonicalIntendedTarget: readiness.target.canonicalIntendedTarget,
      observationId: readiness.carrier.current.observationId
    },
    residue: [
      "Movement uses carrier-held observation and perception IDs.",
      "Coordinates are action endpoints only; follow-up semantic assessment is still required."
    ]
  });
}

export function planUiTestClick(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  point: DesktopPoint;
  compactRelationalClaim: UiTestRunnerRelationalClaimDraft;
  button?: "left" | "middle" | "right";
  risk?: DesktopActionRisk;
}): UiTestRunnerPlan {
  const readiness = mutationReadiness(input.scenario, input.carrier, {
    requireWorkflow: true,
    requireHoverWitness: true
  });

  if (!readiness.ok) {
    return readiness.blockedPlan;
  }

  const compactRelationalClaim = compactClaimFromCarrier({
    carrier: readiness.carrier,
    target: readiness.target,
    draft: input.compactRelationalClaim,
    pointProvenance: "hover_witness"
  });

  return readyCall({
    tool: "desktop_click",
    arguments: {
      sessionId: readiness.carrier.session.sessionId,
      targetScope: readiness.target.targetScope,
      preActionObservationId: readiness.carrier.current.observationId,
      perceptionDigestId: readiness.carrier.current.perceptionDigestId,
      workflowStateClaimId: readiness.carrier.current.workflowStateClaimId,
      hoverTargetWitnessId: readiness.carrier.current.hoverTargetWitnessId,
      intendedSemanticTarget: readiness.target.canonicalIntendedTarget,
      point: input.point,
      button: input.button ?? "left",
      risk: input.risk ?? blockedRisk,
      compactRelationalClaim
    },
    instruction:
      "Click with carrier-held digest/workflow/hover-witness IDs, then observe the click transition.",
    mutatesDesktop: true,
    requiresVisualInspectionBefore: false,
    carrierHints: {
      targetKey: readiness.target.targetKey,
      canonicalIntendedTarget: readiness.target.canonicalIntendedTarget,
      observationId: readiness.carrier.current.observationId
    },
    residue: [
      "Click request was assembled from carrier-held IDs.",
      "The click still goes through the existing desktop_click policy gate."
    ]
  });
}

export function planUiTestTypeText(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  text: string;
  compactRelationalClaim: UiTestRunnerRelationalClaimDraft;
  sensitivityClassification?: "test_input" | "private" | "credential" | "secret";
  risk?: DesktopActionRisk;
}): UiTestRunnerPlan {
  const readiness = mutationReadiness(input.scenario, input.carrier, {
    requireWorkflow: true,
    requireHoverWitness: false
  });

  if (!readiness.ok) {
    return readiness.blockedPlan;
  }

  const compactRelationalClaim = compactClaimFromCarrier({
    carrier: readiness.carrier,
    target: readiness.target,
    draft: input.compactRelationalClaim,
    pointProvenance:
      input.compactRelationalClaim.pointProvenance ?? "relational_estimate"
  });

  return readyCall({
    tool: "desktop_type_text",
    arguments: {
      sessionId: readiness.carrier.session.sessionId,
      targetScope: readiness.target.targetScope,
      preActionObservationId: readiness.carrier.current.observationId,
      perceptionDigestId: readiness.carrier.current.perceptionDigestId,
      workflowStateClaimId: readiness.carrier.current.workflowStateClaimId,
      intendedSemanticTarget: readiness.target.canonicalIntendedTarget,
      text: input.text,
      sensitivityClassification: input.sensitivityClassification ?? "test_input",
      risk: input.risk ?? blockedRisk,
      compactRelationalClaim
    },
    instruction:
      "Type text with carrier-held digest/workflow IDs, then observe the text-entry transition.",
    mutatesDesktop: true,
    requiresVisualInspectionBefore: false,
    carrierHints: {
      targetKey: readiness.target.targetKey,
      canonicalIntendedTarget: readiness.target.canonicalIntendedTarget,
      observationId: readiness.carrier.current.observationId
    },
    residue: [
      "Text entry request was assembled from carrier-held IDs.",
      "The desktop_type_text tool remains responsible for sensitivity and policy checks."
    ]
  });
}

export function applyUiTestRunnerObservationResult(input: {
  carrier: UiTestRunCarrier;
  result: Record<string, unknown>;
}): UiTestRunnerApplyResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const observationId = nestedString(input.result, ["observation", "observationId"]);
  const transitionActionId = nestedString(input.result, ["transitionGate", "actionId"]);
  const classification = transitionClassificationFromResult(input.result);
  let update = applyUiTestInteractionEvidenceIds({
    carrier,
    observationId,
    transitionActionId
  });

  if (classification !== undefined) {
    update = applyUiTestRouteCarrierTransition({
      carrier: update.carrier,
      classification,
      hasLookback: observationId !== undefined,
      unsatisfiedResidue:
        classification.kind === "expected_delta"
          ? []
          : [`Transition classified as ${classification.kind}.`]
    });
  }

  return update;
}

export function applyUiTestRunnerInteractionEvidenceResult(
  input: UiTestRunnerEvidenceResultInput
): UiTestRunnerApplyResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const call = input.call;
  const args = call.arguments;
  const perception = args.perception as
    | UiTestRunnerPerceptionEvidenceDraft
    | undefined;
  const evidenceMode = call.carrierHints.evidenceMode;
  const targetKey = call.carrierHints.targetKey;
  const intendedTarget = stringFrom(args.intendedTarget);
  const observationId = stringFrom(args.observationId);

  let carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const residue: string[] = [];
  const behaviorLabels: UiTestBehaviorLabel[] = [];

  if (targetKey !== undefined && intendedTarget !== undefined) {
    const targetUpdate = applyUiTestTargetTrack({
      scenario,
      carrier,
      targetKey,
      intendedTarget,
      mode: evidenceMode ?? "new_target"
    });

    carrier = targetUpdate.carrier;
    residue.push(...targetUpdate.residue);
    behaviorLabels.push(...targetUpdate.behaviorLabels);
  }

  if (
    evidenceMode !== undefined &&
    perception !== undefined &&
    observationId !== undefined &&
    typeof input.result.perceptionDigestId === "string"
  ) {
    const evidenceUpdate = applyUiTestEvidencePhase({
      carrier,
      mode: evidenceMode,
      observationId,
      perceptionDigestId: input.result.perceptionDigestId,
      targetVisibility: perception.targetVisibility,
      continuityWithPriorClaim: continuityForEvidenceMode(
        evidenceMode,
        perception.targetVisibility
      ),
      contradictionToPriorClaim: normalizeNoContradiction(
        perception.contradictionToPriorClaim ?? null
      )
    });

    carrier = evidenceUpdate.carrier;
    residue.push(...evidenceUpdate.residue);
    behaviorLabels.push(...evidenceUpdate.behaviorLabels);
  }

  const idUpdate = applyUiTestInteractionEvidenceIds({
    carrier,
    observationId,
    perceptionDigestId: stringFrom(input.result.perceptionDigestId),
    workflowStateClaimId: stringFrom(input.result.workflowStateClaimId),
    transitionActionId:
      stringFrom(input.result.transitionActionId) ??
      call.carrierHints.transitionActionId ??
      nestedString(input.result, ["created", "transitionGate", "actionId"]),
    hoverTargetWitnessId: stringFrom(input.result.hoverTargetWitnessId)
  });
  carrier = idUpdate.carrier;
  residue.push(...idUpdate.residue);

  const failureLabels = behaviorLabelsForEvidenceFailures(input.result.failures);
  if (failureLabels.length > 0) {
    const labeled = appendUiTestBehaviorLabels({
      carrier,
      behaviorLabels: failureLabels,
      residue: ["Interaction evidence result contained repairable failures."]
    });

    carrier = labeled.carrier;
    residue.push(...labeled.residue);
    behaviorLabels.push(...labeled.behaviorLabels);
  }

  return {
    carrier,
    residue: uniqueStrings(residue),
    behaviorLabels: uniqueStrings(behaviorLabels)
  };
}

export function applyUiTestRunnerActionResult(input: {
  carrier: UiTestRunCarrier;
  result: Record<string, unknown>;
}): UiTestRunnerApplyResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const actionId =
    nestedString(input.result, ["action", "actionId"]) ??
    nestedString(input.result, ["transitionGate", "actionId"]);

  if (actionId === undefined) {
    const labels = behaviorLabelsForActionStatus(stringFrom(input.result.status));

    return appendUiTestBehaviorLabels({
      carrier,
      behaviorLabels: labels,
      residue:
        labels.length === 0
          ? ["No action id was present in the tool result."]
          : ["Action result did not produce a usable transition action id."]
    });
  }

  return applyUiTestInteractionEvidenceIds({
    carrier,
    transitionActionId: actionId
  });
}

export function applyUiTestRunnerClosureDecision(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  requestedClosureStatus: "passed" | "partial_landfall";
}) {
  return applyUiTestClosureDecision(input);
}

interface ResolvedRunnerTarget {
  targetKey: string;
  canonicalIntendedTarget: string;
  targetScope: DesktopInteractionScope;
}

function resolveRunnerTarget(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  targetKey?: string;
}):
  | ({ ok: true } & ResolvedRunnerTarget)
  | { ok: false; reason: string; residue: string[] } {
  const requestedTargetKey = input.targetKey ?? input.carrier.current.targetKey;
  const target =
    requestedTargetKey === undefined
      ? input.scenario.canonicalTargets.length === 1
        ? input.scenario.canonicalTargets[0]
        : undefined
      : input.scenario.canonicalTargets.find(
          (candidate) => candidate.targetKey === requestedTargetKey
        );

  if (target === undefined) {
    return {
      ok: false,
      reason: "no canonical target could be resolved",
      residue: [
        `requested targetKey: ${requestedTargetKey ?? "none"}.`,
        "Set carrier.current.targetKey or pass targetKey explicitly."
      ]
    };
  }

  return {
    ok: true,
    targetKey: target.targetKey,
    canonicalIntendedTarget: target.canonicalIntendedTarget,
    targetScope:
      target.targetScope ??
      input.carrier.current.targetScope ??
      input.scenario.sessionLicense.appUnderTestScope.scope
  };
}

function mutationReadiness(
  scenarioInput: UiTestScenarioContract,
  carrierInput: UiTestRunCarrier,
  requirements: {
    requireWorkflow: boolean;
    requireHoverWitness: boolean;
  }
):
  | { ok: true; scenario: UiTestScenarioContract; carrier: UiTestRunCarrier; target: ResolvedRunnerTarget }
  | { ok: false; blockedPlan: UiTestRunnerPlan & { status: "blocked" } } {
  const scenario = uiTestScenarioContractSchema.parse(scenarioInput);
  const carrier = uiTestRunCarrierSchema.parse(carrierInput);
  const target = resolveRunnerTarget({ scenario, carrier });

  if (!target.ok) {
    return {
      ok: false,
      blockedPlan: blockedPlan(
        target.reason,
        "desktop_submit_interaction_evidence",
        "Open a canonical target track with interaction evidence before planning mutation.",
        {
          sessionId: carrier.session.sessionId
        },
        target.residue,
        ["target_string_drift"]
      )
    };
  }

  if (carrier.current.observationId === undefined) {
    return {
      ok: false,
      blockedPlan: blockedPlan(
        "mutation requires current observation id",
        "desktop_observe",
        "Observe with includeImages: true before mutation planning.",
        {
          sessionId: carrier.session.sessionId,
          targetScope: target.targetScope,
          includeImages: true
        },
        ["Carrier current.observationId is missing."],
        []
      )
    };
  }

  if (carrier.current.perceptionDigestId === undefined) {
    return {
      ok: false,
      blockedPlan: blockedPlan(
        "mutation requires current perception digest id",
        "desktop_submit_interaction_evidence",
        "Submit perception evidence for the latest observation before mutation planning.",
        {
          sessionId: carrier.session.sessionId,
          observationId: carrier.current.observationId,
          targetScope: target.targetScope,
          intendedTarget: target.canonicalIntendedTarget
        },
        ["Carrier current.perceptionDigestId is missing."],
        []
      )
    };
  }

  if (requirements.requireWorkflow && carrier.current.workflowStateClaimId === undefined) {
    return {
      ok: false,
      blockedPlan: blockedPlan(
        "mutation requires workflow state claim id",
        "desktop_submit_interaction_evidence",
        "Submit workflow evidence for the current observation before click/type planning.",
        {
          sessionId: carrier.session.sessionId,
          observationId: carrier.current.observationId,
          targetScope: target.targetScope,
          intendedTarget: target.canonicalIntendedTarget
        },
        ["Carrier current.workflowStateClaimId is missing."],
        ["workflow_precondition_missing"]
      )
    };
  }

  if (
    requirements.requireHoverWitness &&
    carrier.current.hoverTargetWitnessId === undefined
  ) {
    return {
      ok: false,
      blockedPlan: blockedPlan(
        "click requires hover target witness id",
        "desktop_submit_interaction_evidence",
        "Submit transitionAssessment and clickCandidate evidence to obtain hoverTargetWitnessId before clicking.",
        {
          sessionId: carrier.session.sessionId,
          observationId: carrier.current.observationId,
          targetScope: target.targetScope,
          intendedTarget: target.canonicalIntendedTarget,
          perceptionDigestId: carrier.current.perceptionDigestId,
          workflowStateClaimId: carrier.current.workflowStateClaimId
        },
        ["Carrier current.hoverTargetWitnessId is missing."],
        ["gui_visual_grounding_issue"]
      )
    };
  }

  return {
    ok: true,
    scenario,
    carrier,
    target
  };
}

function compactClaimFromCarrier(input: {
  carrier: UiTestRunCarrier;
  target: ResolvedRunnerTarget;
  draft: UiTestRunnerRelationalClaimDraft;
  pointProvenance: DesktopCompactRelationalClaim["pointProvenance"];
}): DesktopCompactRelationalClaim {
  if (input.carrier.current.observationId === undefined) {
    throw new Error("Cannot build compact claim without current observation id.");
  }

  return {
    ...input.draft,
    sourceObservationId: input.carrier.current.observationId,
    intendedTarget: input.target.canonicalIntendedTarget,
    pointProvenance: input.pointProvenance
  };
}

function readyCall(call: UiTestRunnerToolCall): UiTestRunnerPlan {
  return {
    status: "ready",
    call,
    residue: call.residue
  };
}

function blockedPlan(
  reason: string,
  tool: UiTestRunnerToolName,
  instruction: string,
  args: Record<string, unknown>,
  residue: string[],
  behaviorLabels: UiTestBehaviorLabel[]
): UiTestRunnerPlan & { status: "blocked" } {
  return {
    status: "blocked",
    reason,
    nextRequiredStep: {
      tool,
      instruction,
      arguments: args
    },
    residue,
    behaviorLabels
  };
}

function continuityForEvidenceMode(
  evidenceMode: UiTestRunnerEvidenceMode,
  targetVisibility: "visible" | "not_visible" | "uncertain"
): "consistent" | "changed" | "uncertain" | "not_applicable" {
  if (evidenceMode === "same_target") {
    return "consistent";
  }

  if (evidenceMode === "repair_target") {
    return targetVisibility === "uncertain" ? "uncertain" : "not_applicable";
  }

  return "not_applicable";
}

function transitionClassificationFromResult(
  result: Record<string, unknown>
): UiTestTransitionClassification | undefined {
  const rawClassification = nestedRecord(result, [
    "transitionGate",
    "postActionClassification"
  ]);
  const kind = stringFrom(rawClassification?.kind);

  if (
    kind !== "expected_delta" &&
    kind !== "no_op" &&
    kind !== "wrong_target" &&
    kind !== "scope_exit" &&
    kind !== "risk_prompt" &&
    kind !== "uninterpretable_state" &&
    kind !== "repair_needed"
  ) {
    return undefined;
  }

  return {
    kind,
    confidence:
      rawClassification?.confidence === "low" ||
      rawClassification?.confidence === "medium" ||
      rawClassification?.confidence === "high"
        ? rawClassification.confidence
        : "medium",
    summary:
      stringFrom(rawClassification?.reason) ??
      stringFrom(result.observedDeltaSummary) ??
      `Transition classified as ${kind}.`,
    evidence: [],
    residue: stringArrayFrom(rawClassification?.residue)
  };
}

function behaviorLabelsForEvidenceFailures(
  failures: unknown
): UiTestBehaviorLabel[] {
  if (!Array.isArray(failures)) {
    return [];
  }

  const labels: UiTestBehaviorLabel[] = [];

  for (const failure of failures) {
    if (!isRecord(failure)) {
      continue;
    }

    const code = nestedString(failure, ["error", "code"]);

    if (code === "workflow_postcondition_status_required") {
      labels.push("missing_workflow_postcondition_status");
    } else if (code === "click_candidate_movement_action_required") {
      labels.push("gui_visual_grounding_issue");
    } else if (code?.includes("target") === true) {
      labels.push("target_string_drift");
    }
  }

  return uniqueStrings(labels);
}

function behaviorLabelsForActionStatus(
  status: string | undefined
): UiTestBehaviorLabel[] {
  if (status === "blocked") {
    return ["workflow_precondition_missing"];
  }

  if (status === "escalate") {
    return ["scope_drift"];
  }

  return [];
}

function nestedString(
  value: Record<string, unknown>,
  path: string[]
): string | undefined {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return stringFrom(current);
}

function nestedRecord(
  value: Record<string, unknown>,
  path: string[]
): Record<string, unknown> | undefined {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return isRecord(current) ? current : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function removeUndefinedProperties(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
