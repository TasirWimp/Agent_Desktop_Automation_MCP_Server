import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopPointSchema,
  desktopRectangleSchema,
  type DesktopInteractionScope,
  type DesktopPoint,
  type DesktopRectangle
} from "../policy/sessionLicensePolicy.js";

export const hoverTargetWitnessStatuses = ["confirmed", "rejected", "uncertain"] as const;

export const hoverTargetWitnessSchema = z.object({
  witnessId: z.string().min(1),
  sessionId: z.string().min(1),
  sourceMoveActionId: z.string().min(1),
  sourceObservationId: z.string().min(1),
  followUpObservationId: z.string().min(1),
  semanticLandingObservationId: z.string().min(1).optional(),
  revalidationObservationId: z.string().min(1).optional(),
  revalidatedOlderMovement: z.boolean().optional(),
  perceptionDigestId: z.string().min(1).optional(),
  workflowStateClaimId: z.string().min(1).optional(),
  workflowGoal: z.string().min(1).optional(),
  workflowStep: z.string().min(1).optional(),
  workflowActionRole: z.string().min(1).optional(),
  targetScope: desktopInteractionScopeSchema,
  intendedSemanticTarget: z.string().min(1).max(1000),
  plannedHoverPoint: desktopPointSchema.optional(),
  observedCursorPoint: desktopPointSchema.optional(),
  candidatePoint: desktopPointSchema.optional(),
  candidateBbox: desktopRectangleSchema.optional(),
  cursorInsideCandidateBbox: z.boolean().optional(),
  cursorDistanceFromCandidatePointPx: z.number().finite().nonnegative().optional(),
  visualConfirmation: z.object({
    status: z.enum(hoverTargetWitnessStatuses),
    confidence: z.enum(["low", "medium", "high"]),
    evidence: z.array(z.string().min(1)),
    contradictionSignals: z.array(z.string().min(1)),
    assessedAgainstFollowUpScreenshot: z.literal(true),
    semanticAssessmentWasAgentDeclared: z.literal(true),
    coordinateEvidenceOnlyIsInsufficient: z.literal(true)
  }),
  createdAt: z.string().min(1),
  residue: z.array(z.string())
});

export type HoverTargetWitness = z.infer<typeof hoverTargetWitnessSchema>;

export interface HoverTargetWitnessInput {
  witnessId: string;
  sessionId: string;
  sourceMoveActionId: string;
  sourceObservationId: string;
  followUpObservationId: string;
  semanticLandingObservationId?: string;
  revalidationObservationId?: string;
  revalidatedOlderMovement?: boolean;
  perceptionDigestId?: string;
  workflowStateClaimId?: string;
  workflowGoal?: string;
  workflowStep?: string;
  workflowActionRole?: string;
  targetScope: DesktopInteractionScope;
  intendedSemanticTarget: string;
  plannedHoverPoint?: DesktopPoint;
  observedCursorPoint?: DesktopPoint;
  candidatePoint?: DesktopPoint;
  candidateBbox?: DesktopRectangle;
  cursorInsideCandidateBbox?: boolean;
  cursorDistanceFromCandidatePointPx?: number;
  visualConfirmation: HoverTargetWitness["visualConfirmation"];
  createdAt: string;
  residue: string[];
}

export function createHoverTargetWitness(
  input: HoverTargetWitnessInput
): HoverTargetWitness {
  return hoverTargetWitnessSchema.parse(input);
}
