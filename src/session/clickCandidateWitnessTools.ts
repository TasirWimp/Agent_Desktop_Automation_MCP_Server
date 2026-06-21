import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  desktopPointSchema,
  desktopRectangleSchema,
  isDesktopInteractionScopeAllowed,
  type DesktopActionRisk,
  type DesktopInteractionScope,
  type DesktopObservationPacket,
  type DesktopPoint,
  type DesktopRectangle,
  type DesktopSessionAuditEvent
} from "../policy/sessionLicensePolicy.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";
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
  "stale_observation",
  "action_not_allowed",
  "risk_blocked",
  "transition_not_audited"
] as const;

type ClickCandidateWitnessStatus = (typeof clickCandidateWitnessStatuses)[number];

const maximumCandidateCursorDistancePx = 8;

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

const clickCandidateWitnessInputSchema = z.object({
  sessionId: z.string().min(1),
  observationId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  intendedSemanticTarget: z.string().min(1).max(1000),
  candidatePoint: desktopPointSchema.optional(),
  candidateBbox: desktopRectangleSchema.optional(),
  movementActionId: z.string().min(1).optional(),
  risk: clickCandidateRiskInputSchema
});

type ClickCandidateWitnessInput = z.infer<typeof clickCandidateWitnessInputSchema>;

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
    ageMs?: number;
    fresh: boolean;
    frameCount: number;
    hasFrameEvidence: boolean;
    cursorObserved: boolean;
    cursorConfidence?: "low" | "medium" | "high";
    hoverEvaluated: boolean;
    hoverConfidence?: "low" | "medium" | "high";
  };
  movementEvidence?: {
    actionType: string;
    gateStatus: InteractionTransitionGate["status"];
    followUpObservationMatches: boolean;
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

function movementEvidenceFor(
  movementGate: InteractionTransitionGate | undefined,
  observationId: string
): ClickCandidateEvaluation["movementEvidence"] | undefined {
  if (movementGate === undefined) {
    return undefined;
  }

  return {
    actionType: movementGate.actionType,
    gateStatus: movementGate.status,
    followUpObservationMatches: movementGate.followUpObservationId === observationId,
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
  semanticLandingSupported: boolean;
  hasFrameEvidence: boolean;
  hasCandidatePoint: boolean;
  cursorObserved: boolean;
  candidateAlignedWithCursor: boolean;
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
    input.movementGate === undefined ||
    !input.movementGateIsMovement ||
    input.movementGate.status !== "audited" ||
    !input.movementFollowUpMatches ||
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
  movementGate?: InteractionTransitionGate;
}): string[] {
  const residue = [
    "Click-candidate witness gate evaluated targeting readiness only; no click was executed.",
    "Real click remains unavailable unless app scope, scope binding, provider click gate, hover witness, and post-click observation requirements are all satisfied.",
    "A future click request must still require post-click observation before success can be claimed."
  ];

  if (input.status === "candidate_ready") {
    residue.push("Candidate has enough current session, scope, frame, cursor, and risk evidence for a future app-scoped click request.");
  } else if (input.status === "insufficient_witness") {
    residue.push("Candidate does not yet have enough frame/cursor/targeting evidence; observe again or move as a reversible probe.");
  } else if (input.status === "transition_not_audited") {
    residue.push("Movement evidence must include follow-up observation and supported semantic landing assessment before it can support a click candidate.");
  } else if (input.status === "scope_unbound") {
    residue.push("Active-window scope must be bound to a concrete observed identity before click targeting is considered ready.");
  } else if (input.status === "scope_mismatch") {
    residue.push("Candidate target scope does not match the licensed session scope or referenced observation scope.");
  } else if (input.status === "stale_observation") {
    residue.push("Observation is older than the session cadence allows for a click candidate.");
  } else if (input.status === "action_not_allowed") {
    residue.push("The active session license does not allow click requests.");
  } else if (input.status === "risk_blocked") {
    residue.push("Candidate risk requires stop or escalation before any click can be requested.");
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
  }

  return residue;
}

function evaluateClickCandidate(
  session: DesktopSessionSnapshot,
  observation: DesktopObservationPacket,
  movementGate: InteractionTransitionGate | undefined,
  input: ClickCandidateWitnessInput,
  now: string
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
  const ageMs = observationAgeMs(observation.observedAt, now);
  const fresh =
    ageMs === undefined || ageMs <= session.license.observationCadence.maxObservationGapMs;
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
  const movementEvidence = movementEvidenceFor(movementGate, observation.observationId);
  const movementFollowUpMatches = movementEvidence?.followUpObservationMatches ?? true;
  const semanticLandingSupported = movementEvidence?.semanticLandingSupported === true;
  const clickAllowed =
    session.license.allowedActions.includes("click") &&
    !session.license.forbiddenActions.includes("click");
  const riskBlocked = isRiskBlocked(input.risk);
  const status = chooseStatus({
    activeWindowBound,
    sessionScopeAllowed,
    observationScopeMatches,
    fresh,
    clickAllowed,
    riskBlocked,
    movementGate,
    movementGateIsMovement: movementGate === undefined || movementGate.actionType === "move_mouse",
    movementFollowUpMatches,
    semanticLandingSupported,
    hasFrameEvidence,
    hasCandidatePoint: candidatePoint !== undefined,
    cursorObserved,
    candidateAlignedWithCursor
  });
  const residue = buildResidue({
    status,
    observation,
    risk: input.risk,
    candidatePoint,
    cursorPoint,
    candidateCursorDistancePx,
    candidateContainsCursor,
    movementGate
  });
  const hoverTargetWitness =
    status === "candidate_ready" && movementGate !== undefined
      ? createHoverTargetWitness({
          witnessId: `hover-witness-${movementGate.actionId}-${observation.observationId}`,
          sessionId: input.sessionId,
          sourceMoveActionId: movementGate.actionId,
          sourceObservationId: movementGate.sourceObservationId,
          followUpObservationId: observation.observationId,
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
            "Hover target witness was created from supported semantic landing assessment.",
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
      maxObservationGapMs: session.license.observationCadence.maxObservationGapMs,
      ageMs,
      fresh,
      frameCount: observation.frames.length,
      hasFrameEvidence,
      cursorObserved,
      cursorConfidence: observation.cursorWitness?.confidence,
      hoverEvaluated: observation.hoverWitness?.evaluated ?? false,
      hoverConfidence: observation.hoverWitness?.confidence
    },
    movementEvidence,
    hoverTargetWitness,
    riskEvidence: input.risk,
    requiresPostClickObservation: true,
    wouldExecuteClick: false,
    realClickExecutionAvailable: false,
    residue
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
        const providerCapabilities = runtime.desktopProvider.getCapabilities();
        const evaluation = evaluateClickCandidate(
          session,
          observation,
          movementGate,
          input,
          runtime.now()
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
