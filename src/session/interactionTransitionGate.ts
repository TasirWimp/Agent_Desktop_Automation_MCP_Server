import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  type DesktopActionPacket,
  type DesktopObservationPacket,
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
  protectedObservables: string[];
  expectedEvidenceAfterAction: string[];
  residue: string[];
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
    residue: input.residue
  });
}

export function auditInteractionTransitionGate(
  gate: InteractionTransitionGate,
  observation: DesktopObservationPacket,
  auditedAt: string
): InteractionTransitionGate {
  const scopeMatches = desktopInteractionScopesMatch(gate.targetScope, observation.targetScope);
  const hasFrameEvidence = observation.frames.length > 0;
  const movementDeltaWitness =
    gate.actionType === "move_mouse"
      ? buildMovementDeltaWitness(gate, observation, scopeMatches)
      : undefined;
  const status: InteractionTransitionStatus =
    scopeMatches && hasFrameEvidence ? "audited" : "blocked";
  const residue = [
    ...gate.residue,
    ...(scopeMatches
      ? ["Follow-up observation target scope matched the transition gate."]
      : ["Follow-up observation target scope did not match the transition gate."]),
    ...(hasFrameEvidence
      ? ["Follow-up observation included frame evidence."]
      : ["Follow-up observation did not include frame evidence."]),
    ...(movementDeltaWitness?.residue ?? [])
  ];

  return interactionTransitionGateSchema.parse({
    ...gate,
    status,
    updatedAt: auditedAt,
    followUpObservationId: observation.observationId,
    movementDeltaWitness,
    observedDeltaSummary:
      movementDeltaWitness === undefined
        ? observation.lastActionDeltaSummary ??
          "Follow-up observation was attached; no provider delta summary was available."
        : summarizeMovementDeltaWitness(movementDeltaWitness),
    residue
  });
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
