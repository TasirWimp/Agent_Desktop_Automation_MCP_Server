import { z } from "zod";

export const confidenceLevels = ["low", "medium", "high"] as const;

export const boundingBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative()
});

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export const semanticLocalizationPacketSchema = z.object({
  target: z.string(),
  coarseRegion: z.string().optional(),
  candidateBbox: boundingBoxSchema.optional(),
  confidence: z.enum(confidenceLevels),
  visualCues: z.array(z.string()),
  ambiguityNotes: z.array(z.string())
});

export type SemanticLocalizationPacket = z.infer<typeof semanticLocalizationPacketSchema>;

export const cursorObservationPacketSchema = z.object({
  frameId: z.string().optional(),
  cursorVisible: z.boolean(),
  cursorPosition: pointSchema.optional(),
  cursorBbox: boundingBoxSchema.optional(),
  coordinateSpace: z.enum(["active_window_frame", "screen", "unknown"]).optional(),
  providerSource: z.string().optional(),
  renderedIntoFrame: z.boolean().optional(),
  renderingMethod: z.string().optional(),
  confidence: z.enum(confidenceLevels),
  trackingResidue: z.array(z.string())
});

export type CursorObservationPacket = z.infer<typeof cursorObservationPacketSchema>;

export const intersectionSignalPacketSchema = z.object({
  pointerTargetDistance: z.number().finite().nonnegative().optional(),
  overlapScore: z.number().finite().min(0).max(1).optional(),
  hoverDeltaScore: z.number().finite().min(0).max(1).optional(),
  cursorShapeChangeScore: z.number().finite().min(0).max(1).optional(),
  localStabilityScore: z.number().finite().min(0).max(1).optional(),
  stabilityFrameCount: z.number().int().nonnegative().optional(),
  confidence: z.enum(confidenceLevels),
  licenseCandidateClick: z.boolean(),
  reasons: z.array(z.string()),
  residue: z.array(z.string())
});

export type IntersectionSignalPacket = z.infer<typeof intersectionSignalPacketSchema>;

export const clickCandidatePolicyPacketSchema = z.object({
  semanticTarget: z.string(),
  proposedAction: z.literal("mouse_input"),
  proposedTargetDescription: z.string(),
  requiresPolicyCheck: z.literal(true),
  requiresUserConfirmation: z.literal(true),
  clickLicenseSource: z.literal("intersection_signal"),
  postActionVerificationRequired: z.literal(true),
  residue: z.array(z.string())
});

export type ClickCandidatePolicyPacket = z.infer<typeof clickCandidatePolicyPacketSchema>;

export const uiLocationResiduePacketSchema = z.object({
  visualEnvelope: z.unknown().optional(),
  semanticTarget: z.string(),
  candidateBbox: boundingBoxSchema.optional(),
  clickableRegionUncertainty: z.array(z.string()),
  coordinateTransformUncertainty: z.array(z.string()),
  pointerIntersectionUncertainty: z.array(z.string()),
  hoverStateUncertainty: z.array(z.string()),
  scaleOrDpiUncertainty: z.array(z.string()),
  occlusionOrOverlayRisk: z.array(z.string()),
  textOrIconAmbiguity: z.array(z.string()),
  accessibilityMetadataGap: z.array(z.string()),
  postClickVerificationGap: z.array(z.string()),
  repairPath: z.array(z.string())
});

export type UiLocationResiduePacket = z.infer<typeof uiLocationResiduePacketSchema>;

export interface UiIntersectionPolicyReminder {
  planningOnly: true;
  planningActionClass: "observe";
  actualMouseInputAction: "mouse_input";
  actualMouseInputRequiresPolicyCheck: true;
  actualMouseInputRequiresUserConfirmation: true;
  executionToolAvailable: false;
  postActionVerificationRequired: true;
  statement: string;
}

export interface UiIntersectionPlanResult {
  clickCandidatePolicyPacket: ClickCandidatePolicyPacket;
  uiLocationResiduePacket: UiLocationResiduePacket;
  policyReminder: UiIntersectionPolicyReminder;
}
