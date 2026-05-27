import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  type DesktopActionPacket,
  type DesktopObservationPacket
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
  protectedObservables: z.array(z.string().min(1)),
  expectedEvidenceAfterAction: z.array(z.string().min(1)),
  observedDeltaSummary: z.string().min(1).optional(),
  residue: z.array(z.string())
});

export type InteractionTransitionGate = z.infer<typeof interactionTransitionGateSchema>;

export interface PendingInteractionTransitionGateInput {
  transitionId: string;
  action: DesktopActionPacket;
  createdAt: string;
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
  const status: InteractionTransitionStatus =
    scopeMatches && hasFrameEvidence ? "audited" : "blocked";
  const residue = [
    ...gate.residue,
    ...(scopeMatches
      ? ["Follow-up observation target scope matched the transition gate."]
      : ["Follow-up observation target scope did not match the transition gate."]),
    ...(hasFrameEvidence
      ? ["Follow-up observation included frame evidence."]
      : ["Follow-up observation did not include frame evidence."])
  ];

  return interactionTransitionGateSchema.parse({
    ...gate,
    status,
    updatedAt: auditedAt,
    followUpObservationId: observation.observationId,
    observedDeltaSummary:
      observation.lastActionDeltaSummary ??
      "Follow-up observation was attached; no provider delta summary was available.",
    residue
  });
}

export function transitionGateBlocksNonObserveAction(
  gate: InteractionTransitionGate
): boolean {
  return gate.status !== "audited";
}
