import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  desktopCompactRelationalClaimSchema,
  desktopCompactSemanticLandingAssessmentSchema,
  desktopRelationalNavigationSchema,
  type DesktopActionPacket,
  type DesktopCompactSemanticLandingAssessment,
  type DesktopObservationPacket,
  type DesktopWorkflowStateClaim,
  desktopPointSchema,
  type DesktopPoint
} from "../policy/sessionLicensePolicy.js";

export const interactionTransitionStatuses = [
  "pending_observation",
  "observed",
  "audited",
  "blocked",
  "escalation_required"
] as const;

export type InteractionTransitionStatus = (typeof interactionTransitionStatuses)[number];

export const postActionObservationClassificationKinds = [
  "expected_delta",
  "no_op",
  "wrong_target",
  "scope_exit",
  "risk_prompt",
  "uninterpretable_state",
  "repair_needed"
] as const;

export type PostActionObservationClassificationKind =
  (typeof postActionObservationClassificationKinds)[number];

export const postActionRepairDispositions = [
  "complete",
  "repair_allowed",
  "stop_or_escalate"
] as const;

export type PostActionRepairDisposition =
  (typeof postActionRepairDispositions)[number];

export const postActionObservationClassificationSchema = z.object({
  kind: z.enum(postActionObservationClassificationKinds),
  confidence: z.enum(["low", "medium", "high"]),
  disposition: z.enum(postActionRepairDispositions),
  reason: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  repairAttemptCount: z.number().int().nonnegative().optional(),
  repairLimitReached: z.boolean().default(false),
  residue: z.array(z.string())
});

export type PostActionObservationClassification = z.infer<
  typeof postActionObservationClassificationSchema
>;

const workflowTransitionSnapshotSchema = z.object({
  workflowStateClaimId: z.string().min(1),
  workflowGoal: z.string().min(1),
  workflowStep: z.string().min(1),
  intendedElementTarget: z.string().min(1),
  intendedActionMeaning: z.string().min(1),
  actionRole: z.string().min(1),
  requiredPrecondition: z.string().min(1),
  preconditionStatus: z.string().min(1),
  committedStateEvidence: z.string().min(1),
  transientStateRisk: z.string().min(1),
  expectedPostcondition: z.string().min(1),
  postconditionContradiction: z.string().min(1)
});

const workflowPostconditionAssessmentSchema = z.object({
  workflowStateClaimId: z.string().min(1),
  postconditionStatus: z.enum(["satisfied", "contradicted", "inconclusive"]),
  expectedPostcondition: z.string().min(1),
  postconditionContradiction: z.string().min(1),
  currentContradiction: z.string().min(1).nullable(),
  committedStateEvidence: z.string().min(1),
  missingConfirmation: z.string().min(1).nullable(),
  assessedAt: z.string().min(1)
});

export const interactionTransitionGateSchema = z.object({
  transitionId: z.string().min(1),
  sessionId: z.string().min(1),
  actionId: z.string().min(1),
  actionType: z.string().min(1),
  status: z.enum(interactionTransitionStatuses),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  sourceObservationId: z.string().min(1),
  requiresFollowUpObservation: z.literal(true),
  followUpObservationId: z.string().min(1).optional(),
  targetScope: desktopInteractionScopeSchema,
  intendedSemanticTarget: z.string().min(1).optional(),
  actionPoint: desktopPointSchema.optional(),
  providerReportedCursorPosition: desktopPointSchema.optional(),
  sourceActiveWindowIdentity: z.string().min(1).optional(),
  protectedObservables: z.array(z.string().min(1)),
  expectedEvidenceAfterAction: z.array(z.string().min(1)),
  observedDeltaSummary: z.string().min(1).optional(),
  compactRelationalClaim: desktopCompactRelationalClaimSchema.optional(),
  relationalNavigation: desktopRelationalNavigationSchema.optional(),
  workflowState: workflowTransitionSnapshotSchema.optional(),
  workflowPostconditionAssessment: workflowPostconditionAssessmentSchema.optional(),
  semanticLandingAssessment: desktopCompactSemanticLandingAssessmentSchema.optional(),
  postActionClassification: postActionObservationClassificationSchema.optional(),
  movementDeltaWitness: z
    .object({
      intendedPoint: desktopPointSchema.optional(),
      providerReportedPoint: desktopPointSchema.optional(),
      observedPoint: desktopPointSchema.optional(),
      distanceFromIntendedPx: z.number().finite().nonnegative().optional(),
      cursorObserved: z.boolean(),
      scopeStable: z.boolean(),
      sourceActiveWindowIdentity: z.string().min(1).optional(),
      followUpActiveWindowIdentity: z.string().min(1).optional(),
      confidence: z.enum(["low", "medium", "high"]),
      residue: z.array(z.string())
    })
    .optional(),
  residue: z.array(z.string())
});

export type InteractionTransitionGate = z.infer<typeof interactionTransitionGateSchema>;

export interface PendingInteractionTransitionGateInput {
  transitionId: string;
  action: DesktopActionPacket;
  createdAt: string;
  sourceObservation?: DesktopObservationPacket;
  providerReportedCursorPosition?: DesktopPoint;
  workflowStateClaim?: DesktopWorkflowStateClaim;
  protectedObservables: string[];
  expectedEvidenceAfterAction: string[];
  residue: string[];
}

function workflowTransitionSnapshot(claim: DesktopWorkflowStateClaim) {
  return workflowTransitionSnapshotSchema.parse({
    workflowStateClaimId: claim.workflowStateClaimId,
    workflowGoal: claim.workflowGoal,
    workflowStep: claim.workflowStep,
    intendedElementTarget: claim.intendedElementTarget,
    intendedActionMeaning: claim.intendedActionMeaning,
    actionRole: claim.actionRole,
    requiredPrecondition: claim.requiredPrecondition,
    preconditionStatus: claim.preconditionStatus,
    committedStateEvidence: claim.committedStateEvidence,
    transientStateRisk: claim.transientStateRisk,
    expectedPostcondition: claim.expectedPostcondition,
    postconditionContradiction: claim.postconditionContradiction
  });
}

export function createPendingInteractionTransitionGate(
  input: PendingInteractionTransitionGateInput
): InteractionTransitionGate {
  return interactionTransitionGateSchema.parse({
    transitionId: input.transitionId,
    sessionId: input.action.sessionId,
    actionId: input.action.actionId,
    actionType: input.action.actionType,
    status: "pending_observation",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    sourceObservationId: input.action.preActionObservationId,
    requiresFollowUpObservation: true,
    targetScope: input.action.targetScope,
    intendedSemanticTarget: input.action.intendedSemanticTarget,
    actionPoint: input.action.input.point,
    providerReportedCursorPosition: input.providerReportedCursorPosition,
    sourceActiveWindowIdentity: observedWindowIdentity(input.sourceObservation?.activeWindow),
    protectedObservables: input.protectedObservables,
    expectedEvidenceAfterAction: input.expectedEvidenceAfterAction,
    compactRelationalClaim: input.action.compactRelationalClaim,
    relationalNavigation: input.action.relationalNavigation,
    workflowState:
      input.workflowStateClaim === undefined
        ? undefined
        : workflowTransitionSnapshot(input.workflowStateClaim),
    residue: input.residue
  });
}

export function applyWorkflowPostconditionAssessment(
  gate: InteractionTransitionGate,
  claim: DesktopWorkflowStateClaim,
  assessedAt: string
): InteractionTransitionGate {
  const postconditionStatus =
    claim.postconditionStatus === "satisfied" ||
    claim.postconditionStatus === "contradicted" ||
    claim.postconditionStatus === "inconclusive"
      ? claim.postconditionStatus
      : "inconclusive";
  const postActionClassification =
    postconditionStatus === "satisfied"
      ? classification({
          kind: "expected_delta",
          confidence: "high",
          disposition: "complete",
          reason: "Workflow postcondition assessment satisfied the expected committed state.",
          evidence: [
            "workflow_postcondition_satisfied",
            `expectedPostcondition: ${claim.expectedPostcondition}`,
            `committedStateEvidence: ${claim.committedStateEvidence}`
          ],
          residue: [
            "The agent declared the follow-up screenshot satisfied the workflow postcondition.",
            "This is a workflow-state claim; the server did not inspect pixels."
          ]
        })
      : postconditionStatus === "contradicted"
        ? classification({
            kind: "wrong_target",
            confidence: "high",
            disposition: "repair_allowed",
            reason: "Workflow postcondition assessment contradicted the expected committed state.",
            evidence: [
              "workflow_postcondition_contradicted",
              `expectedPostcondition: ${claim.expectedPostcondition}`,
              `postconditionContradiction: ${claim.postconditionContradiction}`,
              `currentContradiction: ${claim.currentContradiction ?? "none"}`
            ],
            residue: [
              "The action may have hit the right element, but the workflow postcondition indicates the wrong app state.",
              "A bounded repair path may restore the required workflow state inside the licensed scope."
            ]
          })
        : classification({
            kind: "repair_needed",
            confidence: "medium",
            disposition: "repair_allowed",
            reason: "Workflow postcondition assessment was inconclusive.",
            evidence: [
              "workflow_postcondition_inconclusive",
              `expectedPostcondition: ${claim.expectedPostcondition}`,
              `committedStateEvidence: ${claim.committedStateEvidence}`
            ],
            residue: [
              "The follow-up screenshot did not provide enough workflow-state evidence to claim progress.",
              "A bounded repair or fresh observation may be needed."
            ]
          });

  return interactionTransitionGateSchema.parse({
    ...gate,
    status: "audited",
    updatedAt: assessedAt,
    workflowPostconditionAssessment: {
      workflowStateClaimId: claim.workflowStateClaimId,
      postconditionStatus,
      expectedPostcondition: claim.expectedPostcondition,
      postconditionContradiction: claim.postconditionContradiction,
      currentContradiction: claim.currentContradiction,
      committedStateEvidence: claim.committedStateEvidence,
      missingConfirmation: claim.missingConfirmation,
      assessedAt
    },
    postActionClassification,
    observedDeltaSummary:
      `Workflow postcondition assessment: ${postconditionStatus}. ${claim.expectedPostcondition}`,
    residue: [
      ...gate.residue,
      `Workflow postcondition assessment: ${postconditionStatus}.`,
      ...postActionClassification.residue
    ]
  });
}

export function auditInteractionTransitionGate(
  gate: InteractionTransitionGate,
  observation: DesktopObservationPacket,
  auditedAt: string,
  sourceObservation?: DesktopObservationPacket
): InteractionTransitionGate {
  const scopeMatches = desktopInteractionScopesMatch(gate.targetScope, observation.targetScope);
  const hasFrameEvidence = observation.frames.length > 0;
  const movementDeltaWitness =
    gate.actionType === "move_mouse"
      ? buildMovementDeltaWitness(gate, observation, scopeMatches)
      : undefined;
  const requiresSemanticLandingAssessment =
    gate.actionType === "move_mouse" &&
    (gate.compactRelationalClaim !== undefined ||
      gate.relationalNavigation !== undefined);

  if (requiresSemanticLandingAssessment && scopeMatches && hasFrameEvidence) {
    const residue = [
      ...gate.residue,
      "Follow-up observation target scope matched the transition gate.",
      "Follow-up observation included frame evidence.",
      ...(movementDeltaWitness?.residue ?? []),
      "Cursor landing is recorded as telemetry only.",
      "Submit desktop_submit_transition_assessment before using this movement as click-candidate evidence."
    ];

    return interactionTransitionGateSchema.parse({
      ...gate,
      status: "observed",
      updatedAt: auditedAt,
      followUpObservationId: observation.observationId,
      movementDeltaWitness,
      observedDeltaSummary:
        movementDeltaWitness === undefined
          ? observation.lastActionDeltaSummary ??
            "Follow-up observation was attached; semantic landing assessment is pending."
          : `${summarizeMovementDeltaWitness(movementDeltaWitness)} Semantic landing assessment is pending.`,
      residue
    });
  }

  const postActionClassification = classifyPostActionObservation({
    gate,
    observation,
    sourceObservation,
    scopeMatches,
    hasFrameEvidence,
    movementDeltaWitness
  });
  const status: InteractionTransitionStatus =
    postActionClassification.disposition === "stop_or_escalate"
      ? "escalation_required"
      : scopeMatches && hasFrameEvidence
        ? "audited"
        : "blocked";
  const residue = [
    ...gate.residue,
    ...(scopeMatches
      ? ["Follow-up observation target scope matched the transition gate."]
      : ["Follow-up observation target scope did not match the transition gate."]),
    ...(hasFrameEvidence
      ? ["Follow-up observation included frame evidence."]
      : ["Follow-up observation did not include frame evidence."]),
    ...(movementDeltaWitness?.residue ?? []),
    ...postActionClassification.residue
  ];

  return interactionTransitionGateSchema.parse({
    ...gate,
    status,
    updatedAt: auditedAt,
    followUpObservationId: observation.observationId,
    movementDeltaWitness,
    postActionClassification,
    observedDeltaSummary:
      movementDeltaWitness === undefined
        ? observation.lastActionDeltaSummary ??
          "Follow-up observation was attached; no provider delta summary was available."
        : summarizeMovementDeltaWitness(movementDeltaWitness),
    residue
  });
}

export function markInteractionTransitionScopeExit(
  gate: InteractionTransitionGate,
  observedAt: string,
  residue: string[]
): InteractionTransitionGate {
  const classification: PostActionObservationClassification = {
    kind: "scope_exit",
    confidence: "high",
    disposition: "stop_or_escalate",
    reason: "The follow-up observation left the bound app-under-test scope.",
    evidence: ["scope_exit"],
    repairLimitReached: true,
    residue: [
      "Post-action observation detected scope exit before recording frame evidence.",
      "The out-of-scope provider output was not stored as session evidence.",
      ...residue
    ]
  };

  return interactionTransitionGateSchema.parse({
    ...gate,
    status: "escalation_required",
    updatedAt: observedAt,
    observedDeltaSummary:
      "Post-action observation detected scope exit from the bound app-under-test.",
    postActionClassification: classification,
    residue: [...gate.residue, ...classification.residue]
  });
}

export function applyCompactSemanticLandingAssessment(
  gate: InteractionTransitionGate,
  assessment: DesktopCompactSemanticLandingAssessment,
  assessedAt: string
): InteractionTransitionGate {
  const semanticClassification =
    assessment.outcome === "supported" &&
    assessment.relationHeld &&
    assessment.candidateSupported &&
    assessment.rejectedAlternativeAvoided &&
    !assessment.contradictionSeen
      ? classification({
          kind: "expected_delta",
          confidence: "high",
          disposition: "complete",
          reason:
            "Semantic landing assessment supported the stored relational movement claim.",
          evidence: [
            "semantic_landing_assessment_supported",
            `expectedEvidenceSeen: ${assessment.expectedEvidenceSeen}`,
            `summary: ${assessment.summary}`
          ],
          residue: [
            "The agent declared that the follow-up screenshot supports the relation, candidate, rejected-alternative avoidance, and expected evidence.",
            "Cursor movement telemetry was not treated as proof by itself."
          ]
        })
      : assessment.outcome === "contradicted" || assessment.contradictionSeen
        ? classification({
            kind: "wrong_target",
            confidence: "high",
            disposition: "repair_allowed",
            reason:
              "Semantic landing assessment contradicted the stored relational movement claim.",
            evidence: [
              "semantic_landing_assessment_contradicted",
              `expectedEvidenceSeen: ${assessment.expectedEvidenceSeen}`,
              `summary: ${assessment.summary}`
            ],
            residue: [
              "The movement may have landed near a coordinate, but the relational witness indicates the wrong target or rejected alternative.",
              "A bounded repair movement may refine the relational target inside the licensed scope."
            ]
          })
        : classification({
            kind: "repair_needed",
            confidence: "medium",
            disposition: "repair_allowed",
            reason:
              "Semantic landing assessment was inconclusive for the stored relational movement claim.",
            evidence: [
              "semantic_landing_assessment_inconclusive",
              `expectedEvidenceSeen: ${assessment.expectedEvidenceSeen}`,
              `summary: ${assessment.summary}`
            ],
            residue: [
              "The follow-up screenshot did not provide enough semantic support to unlock click readiness.",
              "A bounded repair action may collect stronger hover or visual evidence."
            ]
          });

  return interactionTransitionGateSchema.parse({
    ...gate,
    status: "audited",
    updatedAt: assessedAt,
    semanticLandingAssessment: assessment,
    postActionClassification: semanticClassification,
    observedDeltaSummary: `Semantic landing assessment: ${assessment.outcome}. ${assessment.summary}`,
    residue: [
      ...gate.residue,
      `Semantic landing assessment outcome: ${assessment.outcome}.`,
      ...semanticClassification.residue
    ]
  });
}

export function repairDispositionRequiresAttempt(
  classification: PostActionObservationClassification | undefined
): boolean {
  return classification?.disposition === "repair_allowed";
}

export function withPostActionRepairAttempt(
  gate: InteractionTransitionGate,
  repairAttemptCount: number,
  repairLimitReached: boolean,
  updatedAt: string
): InteractionTransitionGate {
  if (gate.postActionClassification === undefined) {
    return gate;
  }

  const postActionClassification = postActionObservationClassificationSchema.parse({
    ...gate.postActionClassification,
    repairAttemptCount,
    repairLimitReached,
    disposition: repairLimitReached ? "stop_or_escalate" : gate.postActionClassification.disposition,
    residue: [
      ...gate.postActionClassification.residue,
      `Repair attempt count is ${repairAttemptCount}.`,
      ...(repairLimitReached
        ? ["Repair-attempt limit reached; stop or escalate before another action."]
        : ["Bounded repair remains available inside the licensed app scope."])
    ]
  });

  return interactionTransitionGateSchema.parse({
    ...gate,
    status: repairLimitReached ? "escalation_required" : gate.status,
    updatedAt,
    postActionClassification,
    residue: [
      ...gate.residue,
      `Repair attempt count is ${repairAttemptCount}.`,
      ...(repairLimitReached
        ? ["Repair-attempt limit reached; stop or escalate before another action."]
        : ["Bounded repair remains available inside the licensed app scope."])
    ]
  });
}

export function withExpectedDeltaRepairReset(
  gate: InteractionTransitionGate,
  updatedAt: string
): InteractionTransitionGate {
  if (gate.postActionClassification?.kind !== "expected_delta") {
    return gate;
  }

  return interactionTransitionGateSchema.parse({
    ...gate,
    updatedAt,
    residue: [
      ...gate.residue,
      "Expected post-action delta observed; consecutive repair attempt count was reset."
    ]
  });
}

interface ClassifyPostActionObservationInput {
  gate: InteractionTransitionGate;
  observation: DesktopObservationPacket;
  sourceObservation?: DesktopObservationPacket;
  scopeMatches: boolean;
  hasFrameEvidence: boolean;
  movementDeltaWitness?: NonNullable<InteractionTransitionGate["movementDeltaWitness"]>;
}

function classifyPostActionObservation(
  input: ClassifyPostActionObservationInput
): PostActionObservationClassification {
  if (!input.scopeMatches) {
    return classification({
      kind: "scope_exit",
      confidence: "high",
      disposition: "stop_or_escalate",
      reason: "The follow-up observation target scope did not match the action target scope.",
      evidence: ["target_scope_mismatch"],
      residue: ["Scope mismatch prevents post-action success from being claimed."]
    });
  }

  if (!input.hasFrameEvidence) {
    return classification({
      kind: "uninterpretable_state",
      confidence: "high",
      disposition: "stop_or_escalate",
      reason: "The follow-up observation had no frame evidence.",
      evidence: ["missing_frame_evidence"],
      residue: ["Without frame evidence, the post-action state cannot be interpreted."]
    });
  }

  const textualEvidence = postActionTextualEvidence(input.observation);
  const explicitKind = explicitClassificationFromText(textualEvidence.join("\n"));

  if (explicitKind !== undefined) {
    return classificationForKind(explicitKind, {
      confidence: "high",
      evidence: textualEvidence,
      residue: ["Post-action classification used provider or observation textual evidence."]
    });
  }

  if (input.gate.actionType === "move_mouse") {
    return classifyMovementObservation(input);
  }

  const frameDelta = compareFrameEvidence(input.sourceObservation, input.observation);

  if (frameDelta === "changed") {
    return classification({
      kind: "expected_delta",
      confidence: "medium",
      disposition: "complete",
      reason: "Follow-up frame evidence changed after the action.",
      evidence: ["frame_hash_changed"],
      residue: [
        "Frame hashes changed between source and follow-up observations.",
        "No OCR, accessibility-tree, or semantic localization claim was made."
      ]
    });
  }

  if (frameDelta === "unchanged") {
    return classification({
      kind: "no_op",
      confidence: "medium",
      disposition: "repair_allowed",
      reason: "Follow-up frame evidence did not visibly change after the action.",
      evidence: ["frame_hash_unchanged"],
      residue: [
        "Frame hashes matched between source and follow-up observations.",
        "A bounded repair action may refine the target inside the licensed app scope."
      ]
    });
  }

  return classification({
    kind: "repair_needed",
    confidence: "low",
    disposition: "repair_allowed",
    reason: "The follow-up observation was recorded, but the delta was not decisive.",
    evidence: ["delta_not_decisive"],
    residue: [
      "The classifier could not prove expected success from current evidence.",
      "A bounded repair action may collect more evidence or refine the target."
    ]
  });
}

function classifyMovementObservation(
  input: ClassifyPostActionObservationInput
): PostActionObservationClassification {
  const witness = input.movementDeltaWitness;

  if (witness?.cursorObserved && witness.scopeStable) {
    if (
      witness.distanceFromIntendedPx !== undefined &&
      witness.distanceFromIntendedPx <= 32
    ) {
      return classification({
        kind: "expected_delta",
        confidence: witness.confidence,
        disposition: "complete",
        reason: "The cursor witness was close to the intended movement target.",
        evidence: ["cursor_position_delta", "scope_stable"],
        residue: [
          "Mouse movement was treated as a probe and verified by follow-up cursor witness."
        ]
      });
    }

    return classification({
      kind: "wrong_target",
      confidence: "medium",
      disposition: "repair_allowed",
      reason: "The cursor witness did not land close enough to the intended movement target.",
      evidence: ["cursor_position_delta"],
      residue: [
        "Movement landed away from the intended point.",
        "A bounded repair movement may refine the path inside the licensed app scope."
      ]
    });
  }

  const frameDelta = compareFrameEvidence(input.sourceObservation, input.observation);

  if (frameDelta === "changed") {
    return classification({
      kind: "repair_needed",
      confidence: "low",
      disposition: "repair_allowed",
      reason: "The frame changed, but cursor evidence was insufficient for movement verification.",
      evidence: ["frame_hash_changed", "cursor_witness_missing_or_unstable"],
      residue: [
        "Movement probe created some visible delta, but the cursor witness is incomplete."
      ]
    });
  }

  return classification({
    kind: "uninterpretable_state",
    confidence: "low",
    disposition: "stop_or_escalate",
    reason: "The movement follow-up observation did not provide usable cursor evidence.",
    evidence: ["cursor_witness_missing_or_unstable"],
    residue: [
      "Mouse movement is a probe; without cursor or usable frame delta, the next action would be blind."
    ]
  });
}

function classificationForKind(
  kind: PostActionObservationClassificationKind,
  input: {
    confidence: PostActionObservationClassification["confidence"];
    evidence: string[];
    residue: string[];
  }
): PostActionObservationClassification {
  const disposition: PostActionRepairDisposition =
    kind === "expected_delta"
      ? "complete"
      : kind === "risk_prompt" || kind === "scope_exit" || kind === "uninterpretable_state"
        ? "stop_or_escalate"
        : "repair_allowed";

  return classification({
    kind,
    confidence: input.confidence,
    disposition,
    reason: reasonForClassificationKind(kind),
    evidence: input.evidence,
    residue: input.residue
  });
}

function classification(
  input: Omit<PostActionObservationClassification, "repairLimitReached">
): PostActionObservationClassification {
  return postActionObservationClassificationSchema.parse({
    ...input,
    repairLimitReached: false
  });
}

function reasonForClassificationKind(kind: PostActionObservationClassificationKind): string {
  switch (kind) {
    case "expected_delta":
      return "The follow-up observation contains evidence of the expected state delta.";
    case "no_op":
      return "The follow-up observation indicates no visible action effect.";
    case "wrong_target":
      return "The follow-up observation indicates the action affected the wrong target.";
    case "scope_exit":
      return "The follow-up observation left the licensed scope.";
    case "risk_prompt":
      return "The follow-up observation indicates a forbidden or high-risk prompt.";
    case "uninterpretable_state":
      return "The follow-up observation cannot be interpreted safely.";
    case "repair_needed":
      return "The follow-up observation indicates a bounded repair path is needed.";
  }
}

function explicitClassificationFromText(
  rawText: string
): PostActionObservationClassificationKind | undefined {
  const text = normalize(rawText);

  if (text.length === 0) {
    return undefined;
  }

  if (containsAny(text, [
    "credential",
    "password",
    "secret",
    "api key",
    "token",
    "payment",
    "purchase",
    "checkout",
    "credit card",
    "send email",
    "send message",
    "publish",
    "deploy",
    "delete",
    "destructive",
    "system settings"
  ])) {
    return "risk_prompt";
  }

  if (containsAny(text, ["scope exit", "outside allowed scope", "unrelated private window"])) {
    return "scope_exit";
  }

  if (containsAny(text, ["wrong target", "unexpected target", "mis-target", "mistarget"])) {
    return "wrong_target";
  }

  if (containsAny(text, ["no-op", "no op", "no visible change", "unchanged", "did not change"])) {
    return "no_op";
  }

  if (containsAny(text, ["uninterpretable", "cannot interpret", "could not interpret", "unknown state"])) {
    return "uninterpretable_state";
  }

  if (containsAny(text, ["repair needed", "retry needed", "refine target", "needs repair"])) {
    return "repair_needed";
  }

  if (containsAny(text, [
    "expected delta",
    "visible state changes",
    "visible control highlighted",
    "highlighted after",
    "text field",
    "reflects the generated test input",
    "length",
    "changed after",
    "opened",
    "focused",
    "tooltip"
  ])) {
    return "expected_delta";
  }

  return undefined;
}

function compareFrameEvidence(
  sourceObservation: DesktopObservationPacket | undefined,
  followUpObservation: DesktopObservationPacket
): "changed" | "unchanged" | "unknown" {
  if (sourceObservation === undefined) {
    return "unknown";
  }

  const sourceHashes = sourceObservation.frames.map((frame) => frame.sha256);
  const followUpHashes = followUpObservation.frames.map((frame) => frame.sha256);

  if (sourceHashes.length === 0 || followUpHashes.length === 0) {
    return "unknown";
  }

  const sharedLength = Math.min(sourceHashes.length, followUpHashes.length);
  const allSharedFramesMatch = sourceHashes
    .slice(0, sharedLength)
    .every((hash, index) => hash === followUpHashes[index]);

  return allSharedFramesMatch && sourceHashes.length === followUpHashes.length
    ? "unchanged"
    : "changed";
}

function postActionTextualEvidence(observation: DesktopObservationPacket): string[] {
  return [
    observation.lastActionDeltaSummary,
    observation.activeWindow?.title,
    observation.activeWindow?.appName,
    ...observation.residue,
    ...(observation.hoverWitness?.signals ?? [])
  ].filter((value): value is string => value !== undefined && value.trim().length > 0);
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function buildMovementDeltaWitness(
  gate: InteractionTransitionGate,
  observation: DesktopObservationPacket,
  scopeMatches: boolean
): NonNullable<InteractionTransitionGate["movementDeltaWitness"]> {
  const observedPoint = observation.cursorWitness?.position ?? observation.cursorPosition;
  const followUpActiveWindowIdentity = observedWindowIdentity(observation.activeWindow);
  const windowIdentityStable = stableWindowIdentity(
    gate.sourceActiveWindowIdentity,
    followUpActiveWindowIdentity
  );
  const scopeStable = scopeMatches && windowIdentityStable !== false;
  const distanceFromIntendedPx =
    gate.actionPoint !== undefined && observedPoint !== undefined
      ? pointDistance(gate.actionPoint, observedPoint)
      : undefined;
  const residue = [
    ...(observedPoint === undefined
      ? ["Follow-up observation did not include a cursor position witness."]
      : ["Follow-up observation included a cursor position witness."]),
    ...(gate.providerReportedCursorPosition === undefined
      ? ["Provider did not report a post-movement cursor position."]
      : ["Provider reported a post-movement cursor position."]),
    ...(distanceFromIntendedPx === undefined
      ? ["Distance from intended movement point could not be computed."]
      : [`Observed cursor was ${roundForResidue(distanceFromIntendedPx)} px from intended movement point.`]),
    ...(scopeStable
      ? ["Follow-up active-window scope remained stable enough for transition auditing."]
      : ["Follow-up active-window scope did not remain stable."])
  ];

  if (windowIdentityStable === undefined) {
    residue.push("Active-window identity stability could not be fully proven from both observations.");
  }

  return {
    intendedPoint: gate.actionPoint,
    providerReportedPoint: gate.providerReportedCursorPosition,
    observedPoint,
    distanceFromIntendedPx,
    cursorObserved: observedPoint !== undefined,
    scopeStable,
    sourceActiveWindowIdentity: gate.sourceActiveWindowIdentity,
    followUpActiveWindowIdentity,
    confidence: observedPoint === undefined ? "low" : scopeStable ? "high" : "medium",
    residue
  };
}

function summarizeMovementDeltaWitness(
  witness: NonNullable<InteractionTransitionGate["movementDeltaWitness"]>
): string {
  if (witness.observedPoint === undefined) {
    return "Post-movement observation was attached, but no cursor position witness was available.";
  }

  const distanceSummary =
    witness.distanceFromIntendedPx === undefined
      ? "distance from intended point is unknown"
      : `observed cursor is ${roundForResidue(witness.distanceFromIntendedPx)} px from intended point`;

  return `Post-movement observation recorded cursor delta: ${distanceSummary}; scopeStable=${witness.scopeStable}.`;
}

function observedWindowIdentity(
  activeWindow: DesktopObservationPacket["activeWindow"]
): string | undefined {
  if (activeWindow?.windowId !== undefined && activeWindow.windowId.trim().length > 0) {
    return activeWindow.windowId;
  }

  const parts = [activeWindow?.processName, activeWindow?.title].filter(
    (part): part is string => part !== undefined && part.trim().length > 0
  );

  return parts.length === 0 ? undefined : parts.join(":");
}

function stableWindowIdentity(
  sourceIdentity: string | undefined,
  followUpIdentity: string | undefined
): boolean | undefined {
  if (sourceIdentity === undefined || followUpIdentity === undefined) {
    return undefined;
  }

  return normalize(sourceIdentity) === normalize(followUpIdentity);
}

function pointDistance(first: DesktopPoint, second: DesktopPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function roundForResidue(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function transitionGateBlocksNonObserveAction(
  gate: InteractionTransitionGate
): boolean {
  return gate.status !== "audited";
}
