import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  appScopeBindingEvidenceFresh,
  desktopEvidenceFresh,
  desktopEvidenceFreshnessMaxAgeMs,
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  desktopPointSchema,
  desktopRectangleSchema,
  currentAppScopeBindingEvidenceFor,
  evaluateWorkflowStateClaimRevalidation,
  formatNullableStringForAudit,
  isDesktopInteractionScopeAllowed,
  semanticTargetCanonicalForm,
  semanticTargetsEquivalent,
  type DesktopActionRisk,
  type DesktopAppScopeBindingEvidence,
  type DesktopInteractionScope,
  type DesktopObservationPacket,
  type DesktopPerceptionDigest,
  type DesktopPoint,
  type DesktopRectangle,
  type DesktopSessionAuditEvent,
  type DesktopWorkflowStateClaim
} from "../policy/sessionLicensePolicy.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";
import {
  buildDesktopAgentGuidance,
  guidanceCodeForClickCandidateStatus,
  type DesktopAgentGuidance
} from "./agentGuidance.js";
import type { InteractionTransitionGate } from "./interactionTransitionGate.js";
import {
  createHoverTargetWitness,
  type HoverTargetWitness
} from "./hoverTargetWitness.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError,
  type DesktopSessionSnapshot
} from "./sessionStore.js";

export interface ClickCandidateWitnessRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  desktopProvider: DesktopInteractionProvider;
  now: () => string;
  generateId: (prefix: string) => string;
}

export const clickCandidateWitnessStatuses = [
  "candidate_ready",
  "insufficient_witness",
  "scope_unbound",
  "scope_mismatch",
  "app_scope_binding_unverified",
  "stale_observation",
  "action_not_allowed",
  "risk_blocked",
  "perception_digest_invalid",
  "perception_digest_not_current",
  "perception_digest_not_visible",
  "workflow_state_invalid",
  "workflow_state_not_current",
  "workflow_precondition_not_ready",
  "transition_not_audited"
] as const;

type ClickCandidateWitnessStatus = (typeof clickCandidateWitnessStatuses)[number];

const maximumCandidateCursorDistancePx = 8;
const maximumWitnessPointDistancePx = 2;

const lowRisk: DesktopActionRisk = {
  credentialExposure: false,
  destructive: false,
  externalEffect: false,
  systemChange: false,
  recoverability: "high"
};

const clickCandidateRiskInputSchema = z
  .object({
    credentialExposure: z.boolean().default(false),
    destructive: z.boolean().default(false),
    externalEffect: z.boolean().default(false),
    systemChange: z.boolean().default(false),
    recoverability: z.enum(["high", "medium", "low"]).default("high")
  })
  .default(lowRisk);

export const clickCandidateWitnessInputSchema = z.object({
  sessionId: z.string().min(1),
  observationId: z.string().min(1),
  perceptionDigestId: z.string().min(1),
  workflowStateClaimId: z.string().min(1).optional(),
  targetScope: desktopInteractionScopeSchema,
  intendedSemanticTarget: z.string().min(1).max(1000),
  candidatePoint: desktopPointSchema.optional(),
  candidateBbox: desktopRectangleSchema.optional(),
  movementActionId: z.string().min(1).optional(),
  risk: clickCandidateRiskInputSchema
}).strict();

type ClickCandidateWitnessInput = z.infer<typeof clickCandidateWitnessInputSchema>;
export type DesktopClickCandidateWitnessInput = ClickCandidateWitnessInput;

interface ClickCandidateEvaluation {
  status: ClickCandidateWitnessStatus;
  readyForClickRequest: boolean;
  sessionId: string;
  observationId: string;
  movementActionId?: string;
  intendedSemanticTarget: string;
  targetScope: DesktopInteractionScope;
  candidatePoint?: DesktopPoint;
  candidateBbox?: DesktopRectangle;
  cursorPoint?: DesktopPoint;
  candidateCursorDistancePx?: number;
  candidateContainsCursor?: boolean;
  scopeEvidence: {
    sessionScopeAllowed: boolean;
    observationScopeMatches: boolean;
    activeWindowBound: boolean;
    activeWindowIdentity?: string;
  };
  observationEvidence: {
    observedAt?: string;
    checkedAt: string;
    maxObservationGapMs: number;
    freshnessKind?: "click_candidate_observation";
    maxAgeMs?: number;
    ageMs?: number;
    fresh: boolean;
    frameCount: number;
    hasFrameEvidence: boolean;
    cursorObserved: boolean;
    cursorConfidence?: "low" | "medium" | "high";
    hoverEvaluated: boolean;
    hoverConfidence?: "low" | "medium" | "high";
  };
  perceptionDigestEvidence: {
    perceptionDigestId: string;
    observationMatches: boolean;
    latestObservationMatches: boolean;
    fresh: boolean;
    maxAgeMs?: number;
    scopeMatches: boolean;
    targetMatches: boolean;
    requestedTargetCanonical: string;
    digestTargetCanonical?: string;
    readinessIssue?: string;
    targetVisibility?: DesktopPerceptionDigest["targetVisibility"];
    anchorVisibility?: DesktopPerceptionDigest["anchorVisibility"];
    continuityWithPriorClaim?: DesktopPerceptionDigest["continuityWithPriorClaim"];
    contradictionToPriorClaim?: string | null;
    staleCarryoverReviewed?: boolean;
    currentEvidence?: string;
  };
  workflowStateEvidence: {
    workflowStateClaimId?: string;
    observationMatches: boolean;
    latestObservationMatches: boolean;
    revalidatedByLatestObservation?: boolean;
    fresh: boolean;
    maxAgeMs?: number;
    scopeMatches: boolean;
    targetMatches: boolean;
    perceptionDigestMatches: boolean;
    frameHashesMatch: boolean;
    readinessIssue?: string;
    requestedTargetCanonical: string;
    workflowTargetCanonical?: string;
    workflowGoal?: string;
    workflowStep?: string;
    actionRole?: DesktopWorkflowStateClaim["actionRole"];
    requiredPrecondition?: string;
    preconditionStatus?: DesktopWorkflowStateClaim["preconditionStatus"];
    transientStateRisk?: DesktopWorkflowStateClaim["transientStateRisk"];
    committedStateEvidence?: string;
    missingConfirmation?: string | null;
    currentContradiction?: string | null;
    expectedPostcondition?: string;
    postconditionContradiction?: string;
    revalidationResidue?: string[];
    interveningActionIds?: string[];
  };
  appScopeBindingEvidence?: {
    required: boolean;
    appScopeBindingEvidenceId?: string;
    appScopeBindingId?: string;
    observationMatches: boolean;
    scopeMatches: boolean;
    frameHashesMatch: boolean;
    bindingStatus?: DesktopAppScopeBindingEvidence["bindingStatus"];
    contradiction?: string | null;
    staleCarryoverReviewed?: boolean;
    fresh: boolean;
    maxAgeMs?: number;
    expectedApp?: string;
    expectedWindow?: string;
    visualBindingEvidence?: string;
    geometryEvidence?: string;
  };
  movementEvidence?: {
    actionType: string;
    gateStatus: InteractionTransitionGate["status"];
    followUpObservationMatches: boolean;
    semanticLandingObservationId?: string;
    revalidationObservationId?: string;
    revalidatedByLatestObservation?: boolean;
    candidatePointMatchesMovement?: boolean;
    movementPointDistancePx?: number;
    semanticLandingSupported?: boolean;
    semanticLandingOutcome?: "supported" | "contradicted" | "inconclusive";
    contradictionSeen?: boolean;
    cursorObserved?: boolean;
    scopeStable?: boolean;
    distanceFromIntendedPx?: number;
    confidence?: "low" | "medium" | "high";
  };
  hoverTargetWitness?: HoverTargetWitness;
  riskEvidence: {
    credentialExposure: boolean;
    destructive: boolean;
    externalEffect: boolean;
    systemChange: boolean;
    recoverability: DesktopActionRisk["recoverability"];
  };
  requiresPostClickObservation: true;
  wouldExecuteClick: false;
  realClickExecutionAvailable: false;
  agentGuidance?: DesktopAgentGuidance;
  residue: string[];
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

function clickCandidateToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No click candidate was evaluated and no desktop action occurred."]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "click_candidate_tool_error",
        message: error instanceof Error ? error.message : "Unknown click candidate tool error."
      },
      residue: ["No click candidate was evaluated and no desktop action occurred."]
    },
    true
  );
}

function roundForPacket(value: number): number {
  return Math.round(value * 100) / 100;
}

function pointDistance(first: DesktopPoint, second: DesktopPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function rectangleCenter(rectangle: DesktopRectangle): DesktopPoint {
  return {
    x: rectangle.left + rectangle.width / 2,
    y: rectangle.top + rectangle.height / 2
  };
}

function rectangleContainsPoint(rectangle: DesktopRectangle, point: DesktopPoint): boolean {
  return (
    point.x >= rectangle.left &&
    point.x <= rectangle.left + rectangle.width &&
    point.y >= rectangle.top &&
    point.y <= rectangle.top + rectangle.height
  );
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

function isActiveWindowBound(scope: DesktopInteractionScope): boolean {
  return scope.kind !== "active_window" || scope.value !== undefined;
}

function observationAgeMs(observedAt: string, now: string): number | undefined {
  const observedMs = Date.parse(observedAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(observedMs) || Number.isNaN(nowMs)) {
    return undefined;
  }

  return Math.max(0, nowMs - observedMs);
}

function isRiskBlocked(risk: DesktopActionRisk): boolean {
  return (
    risk.credentialExposure ||
    risk.destructive ||
    risk.externalEffect ||
    risk.systemChange ||
    risk.recoverability === "low"
  );
}

function perceptionDigestAgeMs(createdAt: string, now: string): number | undefined {
  const createdMs = Date.parse(createdAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(createdMs) || Number.isNaN(nowMs)) {
    return undefined;
  }

  return Math.max(0, nowMs - createdMs);
}

function digestFrameHashesMatch(
  digest: DesktopPerceptionDigest,
  observation: DesktopObservationPacket
): boolean {
  const hashes = observation.frames.map((frame) => frame.sha256);

  return (
    digest.sourceObservationFrameHashes.length === hashes.length &&
    digest.sourceObservationFrameHashes.every((hash, index) => hash === hashes[index])
  );
}

function workflowClaimAgeMs(createdAt: string, now: string): number | undefined {
  const createdMs = Date.parse(createdAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(createdMs) || Number.isNaN(nowMs)) {
    return undefined;
  }

  return Math.max(0, nowMs - createdMs);
}

function workflowClaimFrameHashesMatch(
  claim: DesktopWorkflowStateClaim,
  observation: DesktopObservationPacket
): boolean {
  const hashes = observation.frames.map((frame) => frame.sha256);

  return (
    claim.sourceObservationFrameHashes.length === hashes.length &&
    claim.sourceObservationFrameHashes.every((hash, index) => hash === hashes[index])
  );
}

function movementEvidenceFor(
  movementGate: InteractionTransitionGate | undefined,
  observationId: string,
  revalidation: {
    candidatePointMatchesMovement?: boolean;
    movementPointDistancePx?: number;
    revalidatedByLatestObservation?: boolean;
  } = {}
): ClickCandidateEvaluation["movementEvidence"] | undefined {
  if (movementGate === undefined) {
    return undefined;
  }

  return {
    actionType: movementGate.actionType,
    gateStatus: movementGate.status,
    followUpObservationMatches: movementGate.followUpObservationId === observationId,
    semanticLandingObservationId: movementGate.followUpObservationId,
    revalidationObservationId: observationId,
    revalidatedByLatestObservation: revalidation.revalidatedByLatestObservation,
    candidatePointMatchesMovement: revalidation.candidatePointMatchesMovement,
    movementPointDistancePx: revalidation.movementPointDistancePx,
    semanticLandingSupported:
      movementGate.semanticLandingAssessment?.outcome === "supported" &&
      movementGate.semanticLandingAssessment.relationHeld &&
      movementGate.semanticLandingAssessment.candidateSupported &&
      movementGate.semanticLandingAssessment.rejectedAlternativeAvoided &&
      !movementGate.semanticLandingAssessment.contradictionSeen,
    semanticLandingOutcome: movementGate.semanticLandingAssessment?.outcome,
    contradictionSeen: movementGate.semanticLandingAssessment?.contradictionSeen,
    cursorObserved: movementGate.movementDeltaWitness?.cursorObserved,
    scopeStable: movementGate.movementDeltaWitness?.scopeStable,
    distanceFromIntendedPx: movementGate.movementDeltaWitness?.distanceFromIntendedPx,
    confidence: movementGate.movementDeltaWitness?.confidence
  };
}

function chooseStatus(input: {
  activeWindowBound: boolean;
  sessionScopeAllowed: boolean;
  observationScopeMatches: boolean;
  fresh: boolean;
  clickAllowed: boolean;
  riskBlocked: boolean;
  movementGate?: InteractionTransitionGate;
  movementGateIsMovement: boolean;
  movementFollowUpMatches: boolean;
  movementRevalidatedByLatestObservation: boolean;
  semanticLandingSupported: boolean;
  hasFrameEvidence: boolean;
  hasCandidatePoint: boolean;
  cursorObserved: boolean;
  candidateAlignedWithCursor: boolean;
  perceptionDigestFound: boolean;
  perceptionDigestObservationMatches: boolean;
  perceptionDigestLatest: boolean;
  perceptionDigestFresh: boolean;
  perceptionDigestScopeMatches: boolean;
  perceptionDigestTargetMatches: boolean;
  perceptionDigestFrameHashesMatch: boolean;
  perceptionDigestReady: boolean;
  workflowStateFound: boolean;
  workflowStateObservationMatches: boolean;
  workflowStateLatest: boolean;
  workflowStateFresh: boolean;
  workflowStateScopeMatches: boolean;
  workflowStateTargetMatches: boolean;
  workflowStatePerceptionDigestMatches: boolean;
  workflowStateFrameHashesMatch: boolean;
  workflowStateReady: boolean;
  appScopeBindingEvidenceRequired: boolean;
  appScopeBindingEvidenceFound: boolean;
  appScopeBindingEvidenceFresh: boolean;
}): ClickCandidateWitnessStatus {
  if (!input.clickAllowed) {
    return "action_not_allowed";
  }

  if (input.riskBlocked) {
    return "risk_blocked";
  }

  if (!input.activeWindowBound) {
    return "scope_unbound";
  }

  if (!input.sessionScopeAllowed || !input.observationScopeMatches) {
    return "scope_mismatch";
  }

  if (!input.fresh) {
    return "stale_observation";
  }

  if (
    !input.perceptionDigestFound ||
    !input.perceptionDigestObservationMatches ||
    !input.perceptionDigestScopeMatches ||
    !input.perceptionDigestTargetMatches ||
    !input.perceptionDigestFrameHashesMatch
  ) {
    return "perception_digest_invalid";
  }

  if (!input.perceptionDigestLatest || !input.perceptionDigestFresh) {
    return "perception_digest_not_current";
  }

  if (!input.perceptionDigestReady) {
    return "perception_digest_not_visible";
  }

  if (
    !input.workflowStateFound ||
    !input.workflowStateObservationMatches ||
    !input.workflowStateScopeMatches ||
    !input.workflowStateTargetMatches ||
    !input.workflowStatePerceptionDigestMatches ||
    !input.workflowStateFrameHashesMatch
  ) {
    return "workflow_state_invalid";
  }

  if (!input.workflowStateLatest || !input.workflowStateFresh) {
    return "workflow_state_not_current";
  }

  if (!input.workflowStateReady) {
    return "workflow_precondition_not_ready";
  }

  if (
    input.movementGate === undefined ||
    !input.movementGateIsMovement ||
    input.movementGate.status !== "audited" ||
    (!input.movementFollowUpMatches && !input.movementRevalidatedByLatestObservation) ||
    !input.semanticLandingSupported ||
    input.movementGate.movementDeltaWitness?.cursorObserved === false ||
    input.movementGate.movementDeltaWitness?.scopeStable === false
  ) {
    return "transition_not_audited";
  }

  if (
    !input.hasFrameEvidence ||
    !input.hasCandidatePoint ||
    !input.cursorObserved ||
    !input.candidateAlignedWithCursor
  ) {
    return "insufficient_witness";
  }

  if (
    input.appScopeBindingEvidenceRequired &&
    (!input.appScopeBindingEvidenceFound || !input.appScopeBindingEvidenceFresh)
  ) {
    return "app_scope_binding_unverified";
  }

  return "candidate_ready";
}

function buildResidue(input: {
  status: ClickCandidateWitnessStatus;
  observation: DesktopObservationPacket;
  risk: DesktopActionRisk;
  candidatePoint?: DesktopPoint;
  cursorPoint?: DesktopPoint;
  candidateCursorDistancePx?: number;
  candidateContainsCursor?: boolean;
  intendedSemanticTarget: string;
  perceptionDigestTargetMatches?: boolean;
  perceptionDigestReadyIssue?: string;
  workflowStateTargetMatches?: boolean;
  workflowStateReadyIssue?: string;
  workflowStateRevalidatedByLatestObservation?: boolean;
  workflowStateRevalidationResidue?: string[];
  workflowStateRevalidationReason?: string;
  appScopeBindingEvidence?: ClickCandidateEvaluation["appScopeBindingEvidence"];
  movementGate?: InteractionTransitionGate;
  movementRevalidatedByLatestObservation?: boolean;
  perceptionDigest?: DesktopPerceptionDigest;
  workflowStateClaim?: DesktopWorkflowStateClaim;
}): string[] {
  const residue = [
    "Click-candidate witness gate evaluated targeting readiness only; no click was executed.",
    "Real click remains unavailable unless app scope, scope binding, provider click gate, hover witness, and post-click observation requirements are all satisfied.",
    "A future click request must still require post-click observation before success can be claimed."
  ];

  if (input.status === "candidate_ready") {
    residue.push("Candidate has enough current session, scope, frame, cursor, and risk evidence for a future app-scoped click request.");
    if (input.workflowStateRevalidatedByLatestObservation === true) {
      residue.push("Older workflow-state claim was revalidated by the latest observation, perception digest, intervening movement audit, target, and scope.");
    }
    if (input.movementRevalidatedByLatestObservation === true) {
      residue.push("Older supported movement was revalidated by the latest observation, perception digest, workflow claim, cursor proximity, target, scope, and candidate point.");
    }
  } else if (input.status === "insufficient_witness") {
    residue.push("Candidate does not yet have enough frame/cursor/targeting evidence; observe again or move as a reversible probe.");
  } else if (input.status === "transition_not_audited") {
    residue.push("Movement evidence must include a supported semantic landing assessment, or an older supported movement must be revalidated by the latest digest/workflow/cursor evidence.");
  } else if (input.status === "scope_unbound") {
    residue.push("Active-window scope must be bound to a concrete observed identity before click targeting is considered ready.");
  } else if (input.status === "scope_mismatch") {
    residue.push("Candidate target scope does not match the licensed session scope or referenced observation scope.");
  } else if (input.status === "app_scope_binding_unverified") {
    residue.push("The current app-under-test binding has not been verified by agent-authored binding evidence for this observation.");
    residue.push("nextRequiredStep: inspect the latest visual artifact and resubmit desktop_submit_interaction_evidence with bindingEvidence before clicking.");
  } else if (input.status === "stale_observation") {
    residue.push("Observation is older than the session cadence allows for a click candidate.");
  } else if (input.status === "action_not_allowed") {
    residue.push("The active session license does not allow click requests.");
  } else if (input.status === "risk_blocked") {
    residue.push("Candidate risk requires stop or escalation before any click can be requested.");
  } else if (input.status === "perception_digest_invalid") {
    residue.push("Perception digest does not match the current observation, target, scope, or frame hashes.");
  } else if (input.status === "perception_digest_not_current") {
    residue.push("Perception digest is stale or not bound to the latest recorded observation.");
  } else if (input.status === "perception_digest_not_visible") {
    residue.push("Perception digest does not currently support visible, non-contradicted target readiness.");
    if (input.perceptionDigestReadyIssue !== undefined) {
      residue.push(input.perceptionDigestReadyIssue);
    }
  } else if (input.status === "workflow_state_invalid") {
    residue.push("Workflow-state claim does not match the current observation, target, scope, perception digest, or frame hashes.");
    residue.push("nextRequiredStep: call desktop_submit_interaction_evidence with workflow evidence for the current observation, or reuse an older workflow claim only when no click/type/app-launch/scope-exit/risk/wrong-target action occurred since it.");
    if (input.workflowStateRevalidationReason !== undefined) {
      residue.push(`Workflow revalidation failed: ${input.workflowStateRevalidationReason}`);
    }
  } else if (input.status === "workflow_state_not_current") {
    residue.push("Workflow-state claim is stale or not bound to the latest recorded observation.");
    residue.push("nextRequiredStep: call desktop_submit_interaction_evidence with workflow evidence for the latest observation.");
    if (input.workflowStateRevalidationReason !== undefined) {
      residue.push(`Workflow revalidation failed: ${input.workflowStateRevalidationReason}`);
    }
  } else if (input.status === "workflow_precondition_not_ready") {
    residue.push("Workflow-state claim does not show that the app workflow is ready for this click candidate.");
    if (input.workflowStateReadyIssue !== undefined) {
      residue.push(input.workflowStateReadyIssue);
    }
  }

  if (input.candidatePoint === undefined) {
    residue.push("No candidate point or bounding-box center was available.");
  }

  if (input.cursorPoint === undefined) {
    residue.push("No cursor position witness was available in the referenced observation.");
  }

  if (input.candidateCursorDistancePx !== undefined) {
    residue.push(
      `Cursor is ${roundForPacket(input.candidateCursorDistancePx)} px from the candidate point.`
    );
  }

  if (input.candidateContainsCursor !== undefined) {
    residue.push(
      input.candidateContainsCursor
        ? "Candidate bounding box contains the observed cursor point."
        : "Candidate bounding box does not contain the observed cursor point."
    );
  }

  if (input.observation.hoverWitness?.evaluated === false) {
    residue.push("Hover witness was not evaluated; this is targeting residue, not proof of failure.");
  }

  if (isRiskBlocked(input.risk)) {
    residue.push("Credential, destructive, external-effect, system-change, or low-recoverability risk remains blocked.");
  }

  if (input.movementGate !== undefined) {
    residue.push(`Movement transition gate status: ${input.movementGate.status}.`);

    if (input.movementGate.actionType !== "move_mouse") {
      residue.push("Supplied movement action id does not reference a move_mouse transition.");
    }

    if (input.movementGate.semanticLandingAssessment === undefined) {
      residue.push("Movement transition has no semantic landing assessment; cursor proximity alone is insufficient.");
    } else {
      residue.push(
        `Semantic landing assessment outcome: ${input.movementGate.semanticLandingAssessment.outcome}.`
      );
    }

    if (input.movementRevalidatedByLatestObservation === true) {
      residue.push("Movement follow-up observation differs from the current observation, but current evidence revalidated the stored movement point.");
    }
  }

  if (input.perceptionDigest !== undefined) {
    residue.push(
      `Perception digest targetVisibility=${input.perceptionDigest.targetVisibility}, continuity=${input.perceptionDigest.continuityWithPriorClaim}, contradictionToPriorClaim=${formatNullableStringForAudit(input.perceptionDigest.contradictionToPriorClaim)}.`
    );

    if (input.perceptionDigestTargetMatches === false) {
      residue.push(
        `Candidate target canonical: ${semanticTargetCanonicalForm(input.intendedSemanticTarget)}.`
      );
      residue.push(
        `Digest target canonical: ${semanticTargetCanonicalForm(input.perceptionDigest.intendedTarget)}.`
      );
    }
  }

  if (input.workflowStateClaim !== undefined) {
    residue.push(
      `Workflow state actionRole=${input.workflowStateClaim.actionRole}, preconditionStatus=${input.workflowStateClaim.preconditionStatus}, transientStateRisk=${input.workflowStateClaim.transientStateRisk}, currentContradiction=${formatNullableStringForAudit(input.workflowStateClaim.currentContradiction)}.`
    );

    if (input.workflowStateTargetMatches === false) {
      residue.push(
        `Candidate target canonical: ${semanticTargetCanonicalForm(input.intendedSemanticTarget)}.`
      );
      residue.push(
        `Workflow target canonical: ${semanticTargetCanonicalForm(input.workflowStateClaim.intendedElementTarget)}.`
      );
    }

    if (input.workflowStateRevalidatedByLatestObservation === true) {
      residue.push("Workflow evidence used bounded revalidation instead of requiring the workflow claim to be bound to the hover follow-up observation.");
    }

    if (
      input.workflowStateRevalidationResidue !== undefined &&
      input.workflowStateRevalidationResidue.length > 0
    ) {
      residue.push(...input.workflowStateRevalidationResidue);
    }
  }

  if (input.appScopeBindingEvidence !== undefined) {
    residue.push(
      `App-scope binding evidence required=${input.appScopeBindingEvidence.required}, id=${input.appScopeBindingEvidence.appScopeBindingEvidenceId ?? "missing"}, fresh=${input.appScopeBindingEvidence.fresh}.`
    );
    if (input.appScopeBindingEvidence.bindingStatus !== undefined) {
      residue.push(
        `App-scope binding status=${input.appScopeBindingEvidence.bindingStatus}, contradiction=${formatNullableStringForAudit(input.appScopeBindingEvidence.contradiction ?? null)}.`
      );
    }
  }

  return residue;
}

function perceptionDigestReadyIssue(
  perceptionDigest: DesktopPerceptionDigest | undefined
): string | undefined {
  if (perceptionDigest === undefined) {
    return undefined;
  }

  if (perceptionDigest.targetVisibility !== "visible") {
    return `Digest targetVisibility is ${perceptionDigest.targetVisibility}.`;
  }

  if (perceptionDigest.anchorVisibility === "not_visible") {
    return "Digest anchorVisibility is not_visible.";
  }

  if (
    perceptionDigest.continuityWithPriorClaim !== "consistent" &&
    perceptionDigest.continuityWithPriorClaim !== "not_applicable"
  ) {
    return `Digest continuityWithPriorClaim is ${perceptionDigest.continuityWithPriorClaim}.`;
  }

  if (perceptionDigest.contradictionToPriorClaim !== null) {
    return `Digest contradictionToPriorClaim is ${formatNullableStringForAudit(perceptionDigest.contradictionToPriorClaim)}.`;
  }

  return undefined;
}

function workflowStateReadyIssue(
  workflowStateClaim: DesktopWorkflowStateClaim | undefined
): string | undefined {
  if (workflowStateClaim === undefined) {
    return undefined;
  }

  if (workflowStateClaim.currentContradiction !== null) {
    return `Workflow currentContradiction is ${formatNullableStringForAudit(workflowStateClaim.currentContradiction)}.`;
  }

  if (workflowStateClaim.actionRole === "probe") {
    return "Workflow actionRole probe cannot support a click candidate.";
  }

  if (
    workflowStateClaim.actionRole === "execute_committed_action" ||
    workflowStateClaim.actionRole === "text_entry"
  ) {
    if (workflowStateClaim.preconditionStatus !== "satisfied") {
      return `Workflow preconditionStatus is ${workflowStateClaim.preconditionStatus}; ${workflowStateClaim.actionRole} requires satisfied.`;
    }

    if (
      workflowStateClaim.transientStateRisk !== "none" &&
      workflowStateClaim.transientStateRisk !== "possible"
    ) {
      return `Workflow transientStateRisk is ${workflowStateClaim.transientStateRisk}; committed execution requires none or possible.`;
    }
  }

  if (
    workflowStateClaim.actionRole === "commit_precondition" ||
    workflowStateClaim.actionRole === "repair"
  ) {
    if (
      (workflowStateClaim.preconditionStatus === "not_satisfied" ||
        workflowStateClaim.preconditionStatus === "uncertain") &&
      workflowStateClaim.missingConfirmation === null
    ) {
      return "Workflow missingConfirmation is required when committing or repairing an unmet/uncertain precondition.";
    }
  }

  if (workflowStateClaim.actionRole === "not_applicable") {
    if (
      workflowStateClaim.preconditionStatus !== "not_applicable" &&
      workflowStateClaim.preconditionStatus !== "satisfied"
    ) {
      return `Workflow preconditionStatus is ${workflowStateClaim.preconditionStatus}; not_applicable role requires not_applicable or satisfied.`;
    }

    if (
      workflowStateClaim.transientStateRisk !== "none" &&
      workflowStateClaim.transientStateRisk !== "possible"
    ) {
      return `Workflow transientStateRisk is ${workflowStateClaim.transientStateRisk}; not_applicable action requires none or possible.`;
    }
  }

  return undefined;
}

function evaluateClickCandidate(
  session: DesktopSessionSnapshot,
  observation: DesktopObservationPacket,
  movementGate: InteractionTransitionGate | undefined,
  perceptionDigest: DesktopPerceptionDigest | undefined,
  workflowStateClaim: DesktopWorkflowStateClaim | undefined,
  input: ClickCandidateWitnessInput,
  now: string,
  realDesktopMutation: boolean
): ClickCandidateEvaluation {
  const candidatePoint = input.candidatePoint ?? (
    input.candidateBbox === undefined ? undefined : rectangleCenter(input.candidateBbox)
  );
  const cursorPoint = observation.cursorWitness?.position ?? observation.cursorPosition;
  const candidateCursorDistancePx =
    candidatePoint === undefined || cursorPoint === undefined
      ? undefined
      : roundForPacket(pointDistance(candidatePoint, cursorPoint));
  const candidateContainsCursor =
    input.candidateBbox === undefined || cursorPoint === undefined
      ? undefined
      : rectangleContainsPoint(input.candidateBbox, cursorPoint);
  const candidateAlignedWithCursor =
    candidateContainsCursor === true ||
    (candidateCursorDistancePx !== undefined &&
      candidateCursorDistancePx <= maximumCandidateCursorDistancePx);
  const clickCandidateObservationMaxAgeMs = desktopEvidenceFreshnessMaxAgeMs(
    session.license,
    "click_candidate_observation"
  );
  const perceptionDigestMaxAgeMs = desktopEvidenceFreshnessMaxAgeMs(
    session.license,
    "perception_digest"
  );
  const workflowStateClaimMaxAgeMs = desktopEvidenceFreshnessMaxAgeMs(
    session.license,
    "workflow_state_claim"
  );
  const appScopeBindingEvidenceMaxAgeMs = desktopEvidenceFreshnessMaxAgeMs(
    session.license,
    "app_scope_binding"
  );
  const ageMs = observationAgeMs(observation.observedAt, now);
  const fresh =
    ageMs === undefined ||
    desktopEvidenceFresh(
      session.license,
      "click_candidate_observation",
      observation.observedAt,
      now
    );
  const digestAgeMs =
    perceptionDigest === undefined
      ? undefined
      : perceptionDigestAgeMs(perceptionDigest.createdAt, now);
  const perceptionDigestFresh =
    digestAgeMs === undefined ||
    (perceptionDigest !== undefined &&
      desktopEvidenceFresh(
        session.license,
        "perception_digest",
        perceptionDigest.createdAt,
        now
      ));
  const latestObservationMatches =
    session.observations.at(-1)?.observationId === perceptionDigest?.observationId;
  const perceptionDigestObservationMatches =
    perceptionDigest?.observationId === observation.observationId;
  const perceptionDigestScopeMatches =
    perceptionDigest !== undefined &&
    desktopInteractionScopesMatch(perceptionDigest.targetScope, input.targetScope);
  const perceptionDigestTargetMatches =
    perceptionDigest !== undefined &&
    semanticTargetsEquivalent(perceptionDigest.intendedTarget, input.intendedSemanticTarget);
  const perceptionDigestHashesMatch =
    perceptionDigest !== undefined &&
    digestFrameHashesMatch(perceptionDigest, observation);
  const perceptionDigestReady =
    perceptionDigest !== undefined &&
    perceptionDigest.targetVisibility === "visible" &&
    perceptionDigest.anchorVisibility !== "not_visible" &&
    (perceptionDigest.continuityWithPriorClaim === "consistent" ||
      perceptionDigest.continuityWithPriorClaim === "not_applicable") &&
    perceptionDigest.contradictionToPriorClaim === null;
  const workflowClaimAge =
    workflowStateClaim === undefined
      ? undefined
      : workflowClaimAgeMs(workflowStateClaim.createdAt, now);
  const workflowStateFresh =
    workflowClaimAge === undefined ||
    (workflowStateClaim !== undefined &&
      desktopEvidenceFresh(
        session.license,
        "workflow_state_claim",
        workflowStateClaim.createdAt,
        now
      ));
  const workflowStateObservationMatches =
    workflowStateClaim?.observationId === observation.observationId;
  const workflowStateLatest =
    session.observations.at(-1)?.observationId === workflowStateClaim?.observationId;
  const workflowStateScopeMatches =
    workflowStateClaim !== undefined &&
    desktopInteractionScopesMatch(workflowStateClaim.targetScope, input.targetScope);
  const workflowStateTargetMatches =
    workflowStateClaim !== undefined &&
    semanticTargetsEquivalent(
      workflowStateClaim.intendedElementTarget,
      input.intendedSemanticTarget
    );
  const workflowStatePerceptionDigestMatches =
    workflowStateClaim?.perceptionDigestId === input.perceptionDigestId;
  const workflowStateHashesMatch =
    workflowStateClaim !== undefined &&
    workflowClaimFrameHashesMatch(workflowStateClaim, observation);
  const workflowStateReadinessIssue = workflowStateReadyIssue(workflowStateClaim);
  const workflowStateReady =
    workflowStateClaim !== undefined && workflowStateReadinessIssue === undefined;
  const workflowStateDirectlyCurrent =
    workflowStateClaim !== undefined &&
    workflowStateObservationMatches &&
    workflowStateLatest &&
    workflowStateFresh &&
    workflowStateScopeMatches &&
    workflowStateTargetMatches &&
    workflowStatePerceptionDigestMatches &&
    workflowStateHashesMatch &&
    workflowStateReady;
  const workflowStateRevalidation =
    workflowStateClaim === undefined || workflowStateDirectlyCurrent
      ? undefined
      : evaluateWorkflowStateClaimRevalidation({
          license: session.license,
          actionId: `click-candidate-${input.observationId}`,
          actionType: "click",
          requestedAt: now,
          targetScope: input.targetScope,
          intendedTarget: input.intendedSemanticTarget,
          preActionObservation: observation,
          currentPerceptionDigest: perceptionDigest,
          workflowStateClaim,
          context: {
            phase: "preflight",
            actionCountSoFar: session.actionCount,
            repairAttemptCount: session.repairAttemptCount,
            auditEvents: session.auditEvents,
            observations: session.observations,
            perceptionDigests: session.perceptionDigests,
            workflowStateClaims: session.workflowStateClaims,
            appScopeBindingEvidenceClaims: session.appScopeBindingEvidenceClaims,
            actions: session.actions,
            transitionGates: session.transitionGates,
            stopConditions: session.stopConditions,
            boundAppScope: session.boundAppScope,
            now
          }
        });
  const workflowStateRevalidatedByLatestObservation =
    workflowStateRevalidation?.ok === true;
  const workflowStateAccepted =
    workflowStateDirectlyCurrent || workflowStateRevalidatedByLatestObservation;
  const activeWindowIdentity = observedWindowIdentity(observation.activeWindow);
  const activeWindowBound =
    isActiveWindowBound(input.targetScope) && isActiveWindowBound(observation.targetScope);
  const sessionScopeAllowed = isDesktopInteractionScopeAllowed(
    session.license,
    input.targetScope
  );
  const observationScopeMatches = desktopInteractionScopesMatch(
    observation.targetScope,
    input.targetScope
  );
  const hasFrameEvidence = observation.frames.length > 0;
  const cursorObserved =
    cursorPoint !== undefined &&
    (observation.cursorWitness === undefined || observation.cursorWitness.status === "observed");
  const movementGateIsMovement =
    movementGate === undefined || movementGate.actionType === "move_mouse";
  const movementActionPoint = movementGate?.actionPoint;
  const movementPointDistancePx =
    candidatePoint === undefined || movementActionPoint === undefined
      ? undefined
      : roundForPacket(pointDistance(candidatePoint, movementActionPoint));
  const candidatePointMatchesMovement =
    movementPointDistancePx !== undefined &&
    movementPointDistancePx <= maximumWitnessPointDistancePx;
  const movementFollowUpMatches =
    movementGate === undefined ||
    movementGate.followUpObservationId === observation.observationId;
  const semanticLandingSupported =
    movementGate?.semanticLandingAssessment?.outcome === "supported" &&
    movementGate.semanticLandingAssessment.relationHeld &&
    movementGate.semanticLandingAssessment.candidateSupported &&
    movementGate.semanticLandingAssessment.rejectedAlternativeAvoided &&
    !movementGate.semanticLandingAssessment.contradictionSeen;
  const movementRevalidatedByLatestObservation =
    movementGate !== undefined &&
    !movementFollowUpMatches &&
    movementGateIsMovement &&
    movementGate.status === "audited" &&
    semanticLandingSupported &&
    movementGate.movementDeltaWitness?.cursorObserved !== false &&
    movementGate.movementDeltaWitness?.scopeStable !== false &&
    fresh &&
    perceptionDigest !== undefined &&
    latestObservationMatches &&
    perceptionDigestFresh &&
    perceptionDigestScopeMatches &&
    perceptionDigestTargetMatches &&
    perceptionDigestHashesMatch &&
    perceptionDigestReady &&
    workflowStateClaim !== undefined &&
    workflowStateAccepted &&
    candidateAlignedWithCursor &&
    candidatePointMatchesMovement;
  const movementEvidence = movementEvidenceFor(movementGate, observation.observationId, {
    candidatePointMatchesMovement:
      movementPointDistancePx === undefined ? undefined : candidatePointMatchesMovement,
    movementPointDistancePx,
    revalidatedByLatestObservation: movementRevalidatedByLatestObservation
  });
  const clickAllowed =
    session.license.allowedActions.includes("click") &&
    !session.license.forbiddenActions.includes("click");
  const riskBlocked = isRiskBlocked(input.risk);
  const appScopeBindingEvidenceRequired =
    realDesktopMutation && session.license.licensedAppScope !== undefined;
  const appScopeBindingEvidence =
    session.boundAppScope === undefined
      ? undefined
      : currentAppScopeBindingEvidenceFor({
          evidenceClaims: session.appScopeBindingEvidenceClaims,
          binding: session.boundAppScope,
          observation,
          targetScope: input.targetScope
        });
  const appScopeBindingEvidenceIsFresh =
    appScopeBindingEvidence !== undefined &&
    appScopeBindingEvidenceFresh(
      session.license,
      appScopeBindingEvidence,
      now
    );
  const status = chooseStatus({
    activeWindowBound,
    sessionScopeAllowed,
    observationScopeMatches,
    fresh,
    clickAllowed,
    riskBlocked,
    movementGate,
    movementGateIsMovement,
    movementFollowUpMatches,
    movementRevalidatedByLatestObservation,
    semanticLandingSupported,
    hasFrameEvidence,
    hasCandidatePoint: candidatePoint !== undefined,
    cursorObserved,
    candidateAlignedWithCursor,
    perceptionDigestFound: perceptionDigest !== undefined,
    perceptionDigestObservationMatches,
    perceptionDigestLatest: latestObservationMatches,
    perceptionDigestFresh,
    perceptionDigestScopeMatches,
    perceptionDigestTargetMatches,
    perceptionDigestFrameHashesMatch: perceptionDigestHashesMatch,
    perceptionDigestReady,
    workflowStateFound: workflowStateClaim !== undefined,
    workflowStateObservationMatches:
      workflowStateObservationMatches || workflowStateRevalidatedByLatestObservation,
    workflowStateLatest:
      workflowStateLatest || workflowStateRevalidatedByLatestObservation,
    workflowStateFresh:
      workflowStateFresh || workflowStateRevalidatedByLatestObservation,
    workflowStateScopeMatches:
      workflowStateScopeMatches || workflowStateRevalidatedByLatestObservation,
    workflowStateTargetMatches:
      workflowStateTargetMatches || workflowStateRevalidatedByLatestObservation,
    workflowStatePerceptionDigestMatches:
      workflowStatePerceptionDigestMatches ||
      workflowStateRevalidatedByLatestObservation,
    workflowStateFrameHashesMatch:
      workflowStateHashesMatch || workflowStateRevalidatedByLatestObservation,
    workflowStateReady,
    appScopeBindingEvidenceRequired,
    appScopeBindingEvidenceFound: appScopeBindingEvidence !== undefined,
    appScopeBindingEvidenceFresh: appScopeBindingEvidenceIsFresh
  });
  const guidanceCode = guidanceCodeForClickCandidateStatus(status);
  const agentGuidance =
    guidanceCode === undefined
      ? undefined
      : buildDesktopAgentGuidance({
          code: guidanceCode,
          sessionId: input.sessionId,
          observationId: input.observationId,
          targetScope: input.targetScope,
          intendedTarget: input.intendedSemanticTarget,
          perceptionDigestId: input.perceptionDigestId,
          workflowStateClaimId: input.workflowStateClaimId,
          movementActionId: input.movementActionId
        });
  const residue = buildResidue({
    status,
    observation,
    risk: input.risk,
    candidatePoint,
    cursorPoint,
    candidateCursorDistancePx,
    candidateContainsCursor,
    intendedSemanticTarget: input.intendedSemanticTarget,
    perceptionDigestTargetMatches,
    perceptionDigestReadyIssue: perceptionDigestReadyIssue(perceptionDigest),
    workflowStateTargetMatches,
    workflowStateReadyIssue: workflowStateReadinessIssue,
    workflowStateRevalidatedByLatestObservation,
    workflowStateRevalidationResidue: workflowStateRevalidation?.residue,
    workflowStateRevalidationReason: workflowStateRevalidation?.reason,
    appScopeBindingEvidence: {
      required: appScopeBindingEvidenceRequired,
      appScopeBindingEvidenceId:
        appScopeBindingEvidence?.appScopeBindingEvidenceId,
      appScopeBindingId: appScopeBindingEvidence?.appScopeBindingId,
      observationMatches:
        appScopeBindingEvidence?.observationId === observation.observationId,
      scopeMatches:
        appScopeBindingEvidence !== undefined &&
        desktopInteractionScopesMatch(
          appScopeBindingEvidence.targetScope,
          input.targetScope
        ),
      frameHashesMatch: appScopeBindingEvidence !== undefined,
      bindingStatus: appScopeBindingEvidence?.bindingStatus,
      contradiction: appScopeBindingEvidence?.contradiction,
      staleCarryoverReviewed:
        appScopeBindingEvidence?.staleCarryoverReviewed,
      fresh: appScopeBindingEvidenceIsFresh,
      maxAgeMs: appScopeBindingEvidenceMaxAgeMs,
      expectedApp: appScopeBindingEvidence?.expectedApp,
      expectedWindow: appScopeBindingEvidence?.expectedWindow,
      visualBindingEvidence:
        appScopeBindingEvidence?.visualBindingEvidence,
      geometryEvidence: appScopeBindingEvidence?.geometryEvidence
    },
    movementGate,
    movementRevalidatedByLatestObservation,
    perceptionDigest,
    workflowStateClaim
  });
  const hoverTargetWitness =
    status === "candidate_ready" && movementGate !== undefined
      ? createHoverTargetWitness({
          witnessId: `hover-witness-${movementGate.actionId}-${observation.observationId}`,
          sessionId: input.sessionId,
          sourceMoveActionId: movementGate.actionId,
          sourceObservationId: movementGate.sourceObservationId,
          followUpObservationId:
            movementGate.followUpObservationId ?? observation.observationId,
          semanticLandingObservationId:
            movementGate.followUpObservationId ?? observation.observationId,
          revalidationObservationId: observation.observationId,
          revalidatedOlderMovement: movementRevalidatedByLatestObservation || undefined,
          perceptionDigestId: input.perceptionDigestId,
          workflowStateClaimId: input.workflowStateClaimId,
          workflowGoal: workflowStateClaim?.workflowGoal,
          workflowStep: workflowStateClaim?.workflowStep,
          workflowActionRole: workflowStateClaim?.actionRole,
          targetScope: input.targetScope,
          intendedSemanticTarget: input.intendedSemanticTarget,
          plannedHoverPoint: movementGate.actionPoint,
          observedCursorPoint: cursorPoint,
          candidatePoint,
          candidateBbox: input.candidateBbox,
          cursorInsideCandidateBbox: candidateContainsCursor,
          cursorDistanceFromCandidatePointPx: candidateCursorDistancePx,
          visualConfirmation: {
            status: "confirmed",
            confidence: "high",
            evidence: [
              movementGate.semanticLandingAssessment?.expectedEvidenceSeen ??
                "Semantic landing assessment supported the stored relational claim."
            ],
            contradictionSignals: [],
            assessedAgainstFollowUpScreenshot: true,
            semanticAssessmentWasAgentDeclared: true,
            coordinateEvidenceOnlyIsInsufficient: true
          },
          createdAt: now,
          residue: [
            movementRevalidatedByLatestObservation
              ? "Hover target witness was created from an older supported semantic landing assessment revalidated by current digest/workflow/cursor evidence."
              : "Hover target witness was created from supported semantic landing assessment.",
            "Click point must match this witness; cursor proximity alone is insufficient."
          ]
        })
      : undefined;

  return {
    status,
    readyForClickRequest: status === "candidate_ready",
    sessionId: input.sessionId,
    observationId: input.observationId,
    movementActionId: input.movementActionId,
    intendedSemanticTarget: input.intendedSemanticTarget,
    targetScope: input.targetScope,
    candidatePoint,
    candidateBbox: input.candidateBbox,
    cursorPoint,
    candidateCursorDistancePx,
    candidateContainsCursor,
    scopeEvidence: {
      sessionScopeAllowed,
      observationScopeMatches,
      activeWindowBound,
      activeWindowIdentity
    },
    observationEvidence: {
      observedAt: observation.observedAt,
      checkedAt: now,
      maxObservationGapMs: clickCandidateObservationMaxAgeMs,
      freshnessKind: "click_candidate_observation",
      maxAgeMs: clickCandidateObservationMaxAgeMs,
      ageMs,
      fresh,
      frameCount: observation.frames.length,
      hasFrameEvidence,
      cursorObserved,
      cursorConfidence: observation.cursorWitness?.confidence,
      hoverEvaluated: observation.hoverWitness?.evaluated ?? false,
      hoverConfidence: observation.hoverWitness?.confidence
    },
    perceptionDigestEvidence: {
      perceptionDigestId: input.perceptionDigestId,
      observationMatches: perceptionDigestObservationMatches,
      latestObservationMatches,
      fresh: perceptionDigestFresh,
      maxAgeMs: perceptionDigestMaxAgeMs,
      scopeMatches: perceptionDigestScopeMatches,
      targetMatches: perceptionDigestTargetMatches,
      requestedTargetCanonical: semanticTargetCanonicalForm(input.intendedSemanticTarget),
      digestTargetCanonical:
        perceptionDigest === undefined
          ? undefined
          : semanticTargetCanonicalForm(perceptionDigest.intendedTarget),
      readinessIssue: perceptionDigestReadyIssue(perceptionDigest),
      targetVisibility: perceptionDigest?.targetVisibility,
      anchorVisibility: perceptionDigest?.anchorVisibility,
      continuityWithPriorClaim: perceptionDigest?.continuityWithPriorClaim,
      contradictionToPriorClaim: perceptionDigest?.contradictionToPriorClaim,
      staleCarryoverReviewed: perceptionDigest?.staleCarryoverReviewed,
      currentEvidence: perceptionDigest?.currentEvidence
    },
    workflowStateEvidence: {
      workflowStateClaimId: input.workflowStateClaimId,
      observationMatches: workflowStateObservationMatches,
      latestObservationMatches: workflowStateLatest,
      revalidatedByLatestObservation: workflowStateRevalidatedByLatestObservation,
      fresh: workflowStateFresh,
      maxAgeMs: workflowStateClaimMaxAgeMs,
      scopeMatches: workflowStateScopeMatches,
      targetMatches: workflowStateTargetMatches,
      perceptionDigestMatches: workflowStatePerceptionDigestMatches,
      frameHashesMatch: workflowStateHashesMatch,
      readinessIssue: workflowStateReadinessIssue,
      requestedTargetCanonical: semanticTargetCanonicalForm(input.intendedSemanticTarget),
      workflowTargetCanonical:
        workflowStateClaim === undefined
          ? undefined
          : semanticTargetCanonicalForm(workflowStateClaim.intendedElementTarget),
      workflowGoal: workflowStateClaim?.workflowGoal,
      workflowStep: workflowStateClaim?.workflowStep,
      actionRole: workflowStateClaim?.actionRole,
      requiredPrecondition: workflowStateClaim?.requiredPrecondition,
      preconditionStatus: workflowStateClaim?.preconditionStatus,
      transientStateRisk: workflowStateClaim?.transientStateRisk,
      committedStateEvidence: workflowStateClaim?.committedStateEvidence,
      missingConfirmation: workflowStateClaim?.missingConfirmation,
      currentContradiction: workflowStateClaim?.currentContradiction,
      expectedPostcondition: workflowStateClaim?.expectedPostcondition,
      postconditionContradiction: workflowStateClaim?.postconditionContradiction,
      revalidationResidue: workflowStateRevalidation?.residue,
      interveningActionIds: workflowStateRevalidation?.interveningActionIds
    },
    appScopeBindingEvidence: {
      required: appScopeBindingEvidenceRequired,
      appScopeBindingEvidenceId:
        appScopeBindingEvidence?.appScopeBindingEvidenceId,
      appScopeBindingId: appScopeBindingEvidence?.appScopeBindingId,
      observationMatches:
        appScopeBindingEvidence?.observationId === observation.observationId,
      scopeMatches:
        appScopeBindingEvidence !== undefined &&
        desktopInteractionScopesMatch(
          appScopeBindingEvidence.targetScope,
          input.targetScope
        ),
      frameHashesMatch: appScopeBindingEvidence !== undefined,
      bindingStatus: appScopeBindingEvidence?.bindingStatus,
      contradiction: appScopeBindingEvidence?.contradiction,
      staleCarryoverReviewed:
        appScopeBindingEvidence?.staleCarryoverReviewed,
      fresh: appScopeBindingEvidenceIsFresh,
      maxAgeMs: appScopeBindingEvidenceMaxAgeMs,
      expectedApp: appScopeBindingEvidence?.expectedApp,
      expectedWindow: appScopeBindingEvidence?.expectedWindow,
      visualBindingEvidence:
        appScopeBindingEvidence?.visualBindingEvidence,
      geometryEvidence: appScopeBindingEvidence?.geometryEvidence
    },
    movementEvidence,
    hoverTargetWitness,
    riskEvidence: input.risk,
    requiresPostClickObservation: true,
    wouldExecuteClick: false,
    realClickExecutionAvailable: false,
    agentGuidance,
    residue
  };
}

export type ClickCandidateRecordResult =
  | {
      ok: true;
      sessionId: string;
      status: ClickCandidateWitnessStatus;
      clickCandidateWitness: ClickCandidateEvaluation & {
        hoverTargetWitness?: HoverTargetWitness;
      };
      hoverTargetWitness?: HoverTargetWitness;
      auditEvent: DesktopSessionAuditEvent;
      providerCapabilities: {
        providerKind: string;
        supportsClick: boolean;
        realDesktopMutation: boolean;
      };
      agentGuidance?: DesktopAgentGuidance;
      residue: string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
      residue: string[];
    };

export function evaluateAndRecordClickCandidate(
  runtime: ClickCandidateWitnessRuntime,
  input: unknown
): ClickCandidateRecordResult {
  const parsedInput = clickCandidateWitnessInputSchema.parse(input);
  const session = runtime.sessionStore.requireActiveSession(parsedInput.sessionId);
  const observation = runtime.sessionStore.getObservation(
    parsedInput.sessionId,
    parsedInput.observationId
  );

  if (observation === undefined) {
    return {
      ok: false,
      error: {
        code: "observation_not_found",
        message: `Observation ${parsedInput.observationId} does not exist in session ${parsedInput.sessionId}.`
      },
      residue: ["No click candidate was evaluated and no desktop action occurred."]
    };
  }

  const movementGate =
    parsedInput.movementActionId === undefined
      ? undefined
      : runtime.sessionStore.requireTransitionGate(
          parsedInput.sessionId,
          parsedInput.movementActionId
        );
  const perceptionDigest = runtime.sessionStore.getPerceptionDigest(
    parsedInput.sessionId,
    parsedInput.perceptionDigestId
  );
  const workflowStateClaim =
    parsedInput.workflowStateClaimId === undefined
      ? undefined
      : runtime.sessionStore.getWorkflowStateClaim(
          parsedInput.sessionId,
          parsedInput.workflowStateClaimId
        );
  const providerCapabilities = runtime.desktopProvider.getCapabilities();
  const evaluation = evaluateClickCandidate(
    session,
    observation,
    movementGate,
    perceptionDigest,
    workflowStateClaim,
    parsedInput,
    runtime.now(),
    providerCapabilities.realDesktopMutation
  );
  const hoverTargetWitness =
    evaluation.hoverTargetWitness === undefined
      ? undefined
      : runtime.sessionStore.recordHoverTargetWitness(
          evaluation.hoverTargetWitness
        );
  const auditEvent: DesktopSessionAuditEvent = {
    eventId: runtime.generateId("event"),
    sessionId: parsedInput.sessionId,
    eventType: "click_candidate_evaluated",
    occurredAt: runtime.now(),
    observationId: parsedInput.observationId,
    actionId: parsedInput.movementActionId,
    summary: `Click candidate witness gate result: ${evaluation.status}.`,
    residue: evaluation.residue
  };

  runtime.sessionStore.appendAuditEvent(auditEvent);

  return {
    ok: true,
    sessionId: parsedInput.sessionId,
    status: evaluation.status,
    clickCandidateWitness: {
      ...evaluation,
      hoverTargetWitness
    },
    hoverTargetWitness,
    auditEvent,
    providerCapabilities: {
      providerKind: providerCapabilities.providerKind,
      supportsClick: providerCapabilities.supportsClick,
      realDesktopMutation: providerCapabilities.realDesktopMutation
    },
    agentGuidance: evaluation.agentGuidance,
    residue: [
      "Click candidate was evaluated and recorded in the session audit log.",
      "No click, mouse movement, typing, OS capture, or OS mutation occurred."
    ]
  };
}

export function registerClickCandidateWitnessTools(
  server: McpServer,
  runtime: ClickCandidateWitnessRuntime
): void {
  server.registerTool(
    "desktop_evaluate_click_candidate",
    {
      title: "Evaluate Desktop Click Candidate Witness",
      description:
        "Evaluate whether current session observation evidence is strong enough to request a future app-scoped click. This is read-only with respect to the desktop and never clicks.",
      inputSchema: clickCandidateWitnessInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const session = runtime.sessionStore.requireActiveSession(input.sessionId);
        const observation = runtime.sessionStore.getObservation(
          input.sessionId,
          input.observationId
        );

        if (observation === undefined) {
          return structuredResult(
            {
              error: {
                code: "observation_not_found",
                message: `Observation ${input.observationId} does not exist in session ${input.sessionId}.`
              },
              residue: ["No click candidate was evaluated and no desktop action occurred."]
            },
            true
          );
        }

        const movementGate =
          input.movementActionId === undefined
            ? undefined
            : runtime.sessionStore.requireTransitionGate(
                input.sessionId,
                input.movementActionId
              );
        const perceptionDigest = runtime.sessionStore.getPerceptionDigest(
          input.sessionId,
          input.perceptionDigestId
        );
        const workflowStateClaim =
          input.workflowStateClaimId === undefined
            ? undefined
            : runtime.sessionStore.getWorkflowStateClaim(
                input.sessionId,
                input.workflowStateClaimId
              );
        const providerCapabilities = runtime.desktopProvider.getCapabilities();
        const evaluation = evaluateClickCandidate(
          session,
          observation,
          movementGate,
          perceptionDigest,
          workflowStateClaim,
          input,
          runtime.now(),
          providerCapabilities.realDesktopMutation
        );
        const hoverTargetWitness =
          evaluation.hoverTargetWitness === undefined
            ? undefined
            : runtime.sessionStore.recordHoverTargetWitness(
                evaluation.hoverTargetWitness
              );
        const auditEvent: DesktopSessionAuditEvent = {
          eventId: runtime.generateId("event"),
          sessionId: input.sessionId,
          eventType: "click_candidate_evaluated",
          occurredAt: runtime.now(),
          observationId: input.observationId,
          actionId: input.movementActionId,
          summary: `Click candidate witness gate result: ${evaluation.status}.`,
          residue: evaluation.residue
        };

        runtime.sessionStore.appendAuditEvent(auditEvent);

        return structuredResult({
          sessionId: input.sessionId,
          status: evaluation.status,
          clickCandidateWitness: {
            ...evaluation,
            hoverTargetWitness
          },
          hoverTargetWitness,
          auditEvent,
          providerCapabilities: {
            providerKind: providerCapabilities.providerKind,
            supportsClick: providerCapabilities.supportsClick,
            realDesktopMutation: providerCapabilities.realDesktopMutation
          },
          agentGuidance: evaluation.agentGuidance,
          residue: [
            "Click candidate was evaluated and recorded in the session audit log.",
            "No click, mouse movement, typing, OS capture, or OS mutation occurred."
          ]
        });
      } catch (error: unknown) {
        return clickCandidateToolError(error);
      }
    }
  );
}
