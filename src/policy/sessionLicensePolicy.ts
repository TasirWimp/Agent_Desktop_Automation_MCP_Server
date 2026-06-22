import { z } from "zod";

export const desktopSessionActionTypes = [
  "observe",
  "move_mouse",
  "click",
  "type_text",
  "open_application",
  "open_url",
  "file_operation",
  "credential_entry",
  "payment_or_purchase",
  "send_message",
  "external_publish",
  "destructive_file_operation",
  "shell_command",
  "system_change"
] as const;

export type DesktopSessionActionType = (typeof desktopSessionActionTypes)[number];

export const desktopInteractionScopeKinds = [
  "active_window",
  "observed_window_identity",
  "window_title",
  "process_name",
  "workspace_path",
  "local_url",
  "local_origin"
] as const;

export const desktopInteractionScopeSchema = z
  .object({
    kind: z.enum(desktopInteractionScopeKinds),
    value: z.string().min(1).optional()
  })
  .superRefine((scope, context) => {
    if (scope.kind !== "active_window" && scope.value === undefined) {
      context.addIssue({
        code: "custom",
        message: `${scope.kind} scope requires a value.`,
        path: ["value"]
      });
    }
  });

export type DesktopInteractionScope = z.infer<typeof desktopInteractionScopeSchema>;

export const desktopSessionRiskLimitsSchema = z.object({
  maxDurationMs: z.number().int().positive().max(60 * 60 * 1000),
  maxActionCount: z.number().int().positive().max(1000),
  maxConsecutiveRepairAttempts: z.number().int().nonnegative().max(100),
  allowCredentialEntry: z.literal(false),
  allowDestructiveFileOperations: z.literal(false),
  allowSystemChanges: z.literal(false),
  allowExternalPublishing: z.literal(false)
});

export type DesktopSessionRiskLimits = z.infer<typeof desktopSessionRiskLimitsSchema>;

const desktopEvidenceFreshnessMaxAgeMsSchema = z
  .number()
  .int()
  .positive()
  .max(600_000);

export const desktopSessionEvidenceFreshnessSchema = z.object({
  preActionObservationMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional(),
  clickCandidateObservationMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional(),
  perceptionDigestMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional(),
  workflowStateClaimMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional(),
  appScopeBindingMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional(),
  hoverWitnessMaxAgeMs: desktopEvidenceFreshnessMaxAgeMsSchema.optional()
});

export type DesktopSessionEvidenceFreshness = z.infer<
  typeof desktopSessionEvidenceFreshnessSchema
>;

export const desktopSessionObservationCadenceSchema = z.object({
  beforeEveryAction: z.literal(true),
  afterEveryStateChangingAction: z.literal(true),
  maxObservationGapMs: z.number().int().positive().max(300_000),
  evidenceFreshness: desktopSessionEvidenceFreshnessSchema.optional()
});

export type DesktopSessionObservationCadence = z.infer<
  typeof desktopSessionObservationCadenceSchema
>;

export type DesktopEvidenceFreshnessKind =
  | "pre_action_observation"
  | "click_candidate_observation"
  | "perception_digest"
  | "workflow_state_claim"
  | "app_scope_binding"
  | "hover_witness";

export function desktopEvidenceFreshnessMaxAgeMs(
  license: Pick<DesktopInteractionSessionLicense, "observationCadence">,
  kind: DesktopEvidenceFreshnessKind
): number {
  const fallback = license.observationCadence.maxObservationGapMs;
  const freshness = license.observationCadence.evidenceFreshness;

  if (freshness === undefined) {
    return fallback;
  }

  if (kind === "pre_action_observation") {
    return freshness.preActionObservationMaxAgeMs ?? fallback;
  }

  if (kind === "click_candidate_observation") {
    return freshness.clickCandidateObservationMaxAgeMs ?? fallback;
  }

  if (kind === "perception_digest") {
    return freshness.perceptionDigestMaxAgeMs ?? fallback;
  }

  if (kind === "workflow_state_claim") {
    return freshness.workflowStateClaimMaxAgeMs ?? fallback;
  }

  if (kind === "app_scope_binding") {
    return freshness.appScopeBindingMaxAgeMs ?? fallback;
  }

  return freshness.hoverWitnessMaxAgeMs ?? fallback;
}

export function desktopEvidenceFresh(
  license: Pick<DesktopInteractionSessionLicense, "observationCadence">,
  kind: DesktopEvidenceFreshnessKind,
  createdAt: string,
  checkedAt: string
): boolean {
  const createdMs = Date.parse(createdAt);
  const checkedMs = Date.parse(checkedAt);

  if (Number.isNaN(createdMs) || Number.isNaN(checkedMs)) {
    return true;
  }

  return checkedMs - createdMs <= desktopEvidenceFreshnessMaxAgeMs(license, kind);
}

export const desktopAppForbiddenBoundaryTypes = [
  "credential_or_secret_prompt",
  "payment_or_purchase",
  "external_message_or_email",
  "external_publish_or_deploy",
  "destructive_operation",
  "system_settings",
  "unrelated_private_window",
  "scope_exit",
  "low_recoverability",
  "uninterpretable_state"
] as const;

export const desktopLicensedAppActionTypes = [
  "observe",
  "move_mouse",
  "click",
  "type_text"
] as const;

export type DesktopLicensedAppActionType = (typeof desktopLicensedAppActionTypes)[number];

export const desktopLicensedAppScopeExitStopConditions = [
  "outside_allowed_scope",
  "pre_action_observation_scope_mismatch",
  "post_action_observation_scope_mismatch"
] as const;

export const desktopLicensedAppScopeSchema = z.object({
  scopeId: z.string().min(1).optional(),
  description: z.string().min(1).max(1000),
  scope: desktopInteractionScopeSchema,
  userDeclaredReversible: z.boolean(),
  allowedActions: z.array(z.enum(desktopLicensedAppActionTypes)).min(1),
  forbiddenBoundaries: z.array(z.enum(desktopAppForbiddenBoundaryTypes)),
  scopeExitStopConditions: z
    .array(z.enum(desktopLicensedAppScopeExitStopConditions))
    .min(1)
    .default(["outside_allowed_scope"])
});

export type DesktopLicensedAppScope = z.infer<typeof desktopLicensedAppScopeSchema>;

export const desktopInteractionSessionLicenseSchema = z.object({
  sessionId: z.string().min(1),
  userGoal: z.string().min(1),
  userConfirmed: z.boolean(),
  visibleContentAcknowledged: z.boolean(),
  allowedScopes: z.array(desktopInteractionScopeSchema).min(1),
  allowedActions: z.array(z.enum(desktopSessionActionTypes)).min(1),
  forbiddenActions: z.array(z.enum(desktopSessionActionTypes)),
  licensedAppScope: desktopLicensedAppScopeSchema.optional(),
  riskLimits: desktopSessionRiskLimitsSchema,
  observationCadence: desktopSessionObservationCadenceSchema,
  startedAt: z.string().min(1),
  expiresAt: z.string().min(1).optional()
});

export type DesktopInteractionSessionLicense = z.infer<
  typeof desktopInteractionSessionLicenseSchema
>;

export const desktopPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export type DesktopPoint = z.infer<typeof desktopPointSchema>;

export const desktopPointProvenances = [
  "relational_estimate",
  "relative_probe",
  "hover_witness",
  "external_coordinate",
  "unknown"
] as const;

export type DesktopPointProvenance = (typeof desktopPointProvenances)[number];

const noContradictionSentinels = new Set([
  "none",
  "null",
  "n/a",
  "na",
  "not applicable",
  "no contradiction",
  "no contradiction seen",
  "no contradiction observed",
  "no contradiction to prior claim"
]);

const genericSemanticTargetTokens = new Set([
  "the",
  "a",
  "an",
  "button",
  "control",
  "element",
  "target"
]);

function canonicalNoContradictionText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export function normalizeNoContradiction(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return noContradictionSentinels.has(canonicalNoContradictionText(value))
    ? null
    : value;
}

export function semanticTargetCanonicalForm(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !genericSemanticTargetTokens.has(token))
    .join(" ");
}

export function semanticTargetsEquivalent(
  first: string | undefined,
  second: string | undefined
): boolean {
  if (first === undefined || second === undefined) {
    return false;
  }

  const firstCanonical = semanticTargetCanonicalForm(first);
  const secondCanonical = semanticTargetCanonicalForm(second);

  return (
    firstCanonical.length > 0 &&
    secondCanonical.length > 0 &&
    firstCanonical === secondCanonical
  );
}

export function formatNullableStringForAudit(value: string | null | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

export const desktopCompactRelationalClaimSchema = z.object({
  sourceObservationId: z.string().min(1),
  intendedTarget: z.string().min(1).max(1000),
  scene: z.string().min(1).max(2000),
  anchor: z.string().min(1).max(1000),
  relation: z.string().min(1).max(1000),
  candidate: z.string().min(1).max(2000),
  rejectedAlternative: z.string().min(1).max(2000),
  expectedEvidence: z.string().min(1).max(2000),
  contradiction: z.string().min(1).max(2000),
  pointProvenance: z.enum(desktopPointProvenances)
});

export type DesktopCompactRelationalClaim = z.infer<
  typeof desktopCompactRelationalClaimSchema
>;

export const desktopRectangleSchema = z.object({
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export type DesktopRectangle = z.infer<typeof desktopRectangleSchema>;

export const desktopRelationalNavigationFrameEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceObservationId: z.string().min(1),
  frameIndex: z.number().int().nonnegative(),
  frameSha256: z.string().min(1),
  imagePayloadPresent: z.literal(true),
  visualEvidenceRole: z.string().min(1).max(1000),
  residue: z.array(z.string())
});

export type DesktopRelationalNavigationFrameEvidence = z.infer<
  typeof desktopRelationalNavigationFrameEvidenceSchema
>;

const desktopReasoningConfidenceSchema = z.enum(["low", "medium", "high"]);

export type DesktopReasoningConfidence = z.infer<
  typeof desktopReasoningConfidenceSchema
>;

export const desktopRelationalNavigationRejectedAlternativeSchema = z.object({
  alternativeId: z.string().min(1),
  description: z.string().min(1).max(2000),
  whyPlausible: z.string().min(1).max(2000),
  whyRejected: z.string().min(1).max(2000),
  relationToTarget: z.string().min(1).max(1000),
  contradictionSignal: z.string().min(1).max(1000),
  confidence: desktopReasoningConfidenceSchema,
  residue: z.array(z.string())
});

export type DesktopRelationalNavigationRejectedAlternative = z.infer<
  typeof desktopRelationalNavigationRejectedAlternativeSchema
>;

export const desktopRelationalNavigationSchema = z
  .object({
    navigationId: z.string().min(1),
    parentNavigationId: z.string().min(1).optional(),
    frameEvidence: z.array(desktopRelationalNavigationFrameEvidenceSchema).min(1),
    orientation: z
      .object({
        orientationId: z.string().min(1),
        sourceObservationId: z.string().min(1),
        userImpliedTask: z.string().min(1).max(2000),
        sceneSummary: z.string().min(1).max(2000),
        landmarks: z.array(z.unknown()).min(1),
        coarseRelations: z.array(z.string().min(1)).min(1),
        confidence: desktopReasoningConfidenceSchema,
        residue: z.array(z.string())
      })
      .passthrough(),
    regionHypothesis: z
      .object({
        regionId: z.string().min(1),
        orientationId: z.string().min(1),
        candidateRegionDescription: z.string().min(1).max(2000),
        relationToLandmarks: z.array(z.string().min(1)).min(1),
        expectedTraces: z.array(z.string().min(1)).min(1),
        ruledOutAlternatives: z.array(z.string().min(1)),
        rejectedAlternatives: z.array(desktopRelationalNavigationRejectedAlternativeSchema).min(1),
        confidence: desktopReasoningConfidenceSchema,
        residue: z.array(z.string())
      })
      .passthrough(),
    traceHypothesis: z
      .object({
        traceId: z.string().min(1),
        regionId: z.string().min(1),
        traceSummary: z.string().min(1).max(2000),
        supportingTraces: z.array(z.string().min(1)).min(1),
        missingOrAmbiguousTraces: z.array(z.string().min(1)),
        exactTargetCriteria: z.array(z.string().min(1)).min(1),
        confidence: desktopReasoningConfidenceSchema,
        residue: z.array(z.string())
      })
      .passthrough(),
    actionJustification: z
      .object({
        hypothesisId: z.string().min(1),
        traceId: z.string().min(1),
        intendedSemanticTarget: z.string().min(1).max(1000),
        targetPointRationale: z.string().min(1).max(2000),
        relationPath: z.array(z.string().min(1)).min(1),
        expectedHoverEvidence: z.array(z.string().min(1)).min(1),
        contradictionSignals: z.array(z.string().min(1)).min(1),
        confidence: desktopReasoningConfidenceSchema,
        residue: z.array(z.string())
      })
      .passthrough(),
    residue: z.array(z.string())
  })
  .passthrough()
  .superRefine((navigation, context) => {
    if (navigation.regionHypothesis.orientationId !== navigation.orientation.orientationId) {
      context.addIssue({
        code: "custom",
        message:
          "regionHypothesis.orientationId must match orientation.orientationId.",
        path: ["regionHypothesis", "orientationId"]
      });
    }

    if (navigation.traceHypothesis.regionId !== navigation.regionHypothesis.regionId) {
      context.addIssue({
        code: "custom",
        message: "traceHypothesis.regionId must match regionHypothesis.regionId.",
        path: ["traceHypothesis", "regionId"]
      });
    }

    if (navigation.actionJustification.traceId !== navigation.traceHypothesis.traceId) {
      context.addIssue({
        code: "custom",
        message:
          "actionJustification.traceId must match traceHypothesis.traceId.",
        path: ["actionJustification", "traceId"]
      });
    }

    navigation.frameEvidence.forEach((evidence, index) => {
      if (evidence.sourceObservationId !== navigation.orientation.sourceObservationId) {
        context.addIssue({
          code: "custom",
          message:
            "frameEvidence.sourceObservationId must match orientation.sourceObservationId.",
          path: ["frameEvidence", index, "sourceObservationId"]
        });
      }
    });
  });

export type DesktopRelationalNavigation = z.infer<
  typeof desktopRelationalNavigationSchema
>;

export const desktopPreActionNavigationCheckSchema = z
  .object({
    checkId: z.string().min(1),
    sourceObservationId: z.string().min(1),
    navigationId: z.string().min(1),
    hypothesisId: z.string().min(1),
    reviewedLiveObservation: z.literal(true),
    comparedAgainstAlternatives: z.literal(true),
    contradictionSignalsReviewed: z.literal(true),
    acknowledgedSemanticGap: z.literal(true),
    exploratoryAction: z.boolean(),
    ambiguityDescription: z.string().min(1).max(2000).optional(),
    repairOrBacktrackPlan: z.string().min(1).max(2000),
    readyToAct: z.literal(true),
    selectedActionRationale: z.string().min(1).max(2000),
    confidence: desktopReasoningConfidenceSchema,
    residue: z.array(z.string())
  })
  .superRefine((check, context) => {
    if (check.exploratoryAction && check.ambiguityDescription === undefined) {
      context.addIssue({
        code: "custom",
        message:
          "ambiguityDescription is required when exploratoryAction is true.",
        path: ["ambiguityDescription"]
      });
    }
  });

export type DesktopPreActionNavigationCheck = z.infer<
  typeof desktopPreActionNavigationCheckSchema
>;

export const desktopCompactSemanticLandingAssessmentSchema = z
  .object({
    outcome: z.enum(["supported", "contradicted", "inconclusive"]),
    relationHeld: z.boolean(),
    candidateSupported: z.boolean(),
    rejectedAlternativeAvoided: z.boolean(),
    expectedEvidenceSeen: z.string().min(1).max(2000),
    contradictionSeen: z.boolean(),
    summary: z.string().min(1).max(2000)
  })
  .superRefine((assessment, context) => {
    if (assessment.outcome === "supported") {
      const supported =
        assessment.relationHeld &&
        assessment.candidateSupported &&
        assessment.rejectedAlternativeAvoided &&
        !assessment.contradictionSeen;

      if (!supported) {
        context.addIssue({
          code: "custom",
          message:
            "supported assessments must affirm relation, candidate, rejected-alternative avoidance, and no contradiction.",
          path: ["outcome"]
        });
      }
    }
  });

export type DesktopCompactSemanticLandingAssessment = z.infer<
  typeof desktopCompactSemanticLandingAssessmentSchema
>;

export const desktopFrameVisualArtifactSchema = z.object({
  kind: z.literal("local_file"),
  path: z.string().min(1),
  fileUri: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  sha256: z.string().min(1),
  byteLength: z.number().int().nonnegative()
});

export type DesktopFrameVisualArtifact = z.infer<
  typeof desktopFrameVisualArtifactSchema
>;

export const desktopFrameArtifactSchema = z.object({
  index: z.number().int().nonnegative(),
  capturedAt: z.string().min(1),
  elapsedMs: z.number().int().nonnegative(),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  witness: z
    .object({
      pixelSource: z.enum(["raw", "cursor_annotated"]),
      cursorRenderedIntoFrame: z.boolean(),
      nativeCursorRenderedIntoFrame: z.boolean().optional(),
      witnessMarkerRenderedIntoFrame: z.boolean().optional(),
      cursorRenderingMethod: z.string().min(1).optional(),
      cursorFramePosition: desktopPointSchema.optional(),
      cursorHotspot: desktopPointSchema.optional(),
      residue: z.array(z.string())
    })
    .optional(),
  visualArtifact: desktopFrameVisualArtifactSchema.optional(),
  dataBase64: z.string().optional()
});

export type DesktopFrameArtifact = z.infer<typeof desktopFrameArtifactSchema>;

export const desktopWindowMetadataSchema = z.object({
  windowId: z.string().optional(),
  title: z.string().optional(),
  processName: z.string().optional(),
  appName: z.string().optional(),
  bounds: desktopRectangleSchema.optional()
});

export type DesktopWindowMetadata = z.infer<typeof desktopWindowMetadataSchema>;

export const desktopCursorWitnessSchema = z.object({
  status: z.enum(["observed", "unavailable"]),
  visible: z.boolean().optional(),
  position: desktopPointSchema.optional(),
  coordinateSpace: z.enum(["active_window_frame", "screen", "unknown"]),
  providerSource: z.string().min(1),
  observedAt: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  renderedIntoFrame: z.boolean(),
  nativeCursorRenderedIntoFrame: z.boolean().optional(),
  witnessMarkerRenderedIntoFrame: z.boolean().optional(),
  renderingMethod: z.string().min(1).optional(),
  residue: z.array(z.string())
});

export type DesktopCursorWitness = z.infer<typeof desktopCursorWitnessSchema>;

export const desktopHoverWitnessSchema = z.object({
  evaluated: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  signals: z.array(z.string()),
  residue: z.array(z.string())
});

export type DesktopHoverWitness = z.infer<typeof desktopHoverWitnessSchema>;

export const desktopProviderTimingEntrySchema = z.object({
  operation: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["completed", "failed", "skipped"]),
  residue: z.array(z.string())
});

export type DesktopProviderTimingEntry = z.infer<typeof desktopProviderTimingEntrySchema>;

export const desktopProviderTimingDiagnosticsSchema = z.object({
  providerName: z.string().min(1),
  providerKind: z.enum(["mock", "real"]),
  totalDurationMs: z.number().int().nonnegative(),
  entries: z.array(desktopProviderTimingEntrySchema),
  residue: z.array(z.string())
});

export type DesktopProviderTimingDiagnostics = z.infer<
  typeof desktopProviderTimingDiagnosticsSchema
>;

export const desktopObservationPacketSchema = z.object({
  observationId: z.string().min(1),
  sessionId: z.string().min(1),
  observedAt: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  activeWindow: desktopWindowMetadataSchema.optional(),
  cursorPosition: desktopPointSchema.optional(),
  cursorWitness: desktopCursorWitnessSchema.optional(),
  hoverWitness: desktopHoverWitnessSchema.optional(),
  providerTiming: desktopProviderTimingDiagnosticsSchema.optional(),
  frames: z.array(desktopFrameArtifactSchema).max(12),
  lastActionDeltaSummary: z.string().optional(),
  residue: z.array(z.string())
});

export type DesktopObservationPacket = z.infer<typeof desktopObservationPacketSchema>;

export const desktopPerceptionVisibilityStates = [
  "visible",
  "not_visible",
  "uncertain"
] as const;

export const desktopPerceptionContinuityStates = [
  "consistent",
  "changed",
  "uncertain",
  "not_applicable"
] as const;

export const desktopSubmitPerceptionDigestInputSchema = z.object({
  sessionId: z.string().min(1),
  observationId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  intendedTarget: z.string().min(1).max(1000),
  currentScene: z.string().min(1).max(2000),
  currentAnchor: z.string().min(1).max(1000),
  targetVisibility: z.enum(desktopPerceptionVisibilityStates),
  anchorVisibility: z.enum(desktopPerceptionVisibilityStates),
  continuityWithPriorClaim: z.enum(desktopPerceptionContinuityStates),
  contradictionToPriorClaim: z.string().min(1).max(2000).nullable(),
  staleCarryoverReviewed: z.literal(true),
  currentEvidence: z.string().min(1).max(2000)
});

export type DesktopSubmitPerceptionDigestInput = z.infer<
  typeof desktopSubmitPerceptionDigestInputSchema
>;

export const desktopPerceptionDigestSchema =
  desktopSubmitPerceptionDigestInputSchema.extend({
    perceptionDigestId: z.string().min(1),
    createdAt: z.string().min(1),
    sourceObservationFrameHashes: z.array(z.string().min(1)).min(1),
    status: z.literal("accepted")
  });

export type DesktopPerceptionDigest = z.infer<
  typeof desktopPerceptionDigestSchema
>;

export const desktopWorkflowActionRoles = [
  "probe",
  "commit_precondition",
  "execute_committed_action",
  "text_entry",
  "repair",
  "not_applicable"
] as const;

export const desktopWorkflowPreconditionStatuses = [
  "satisfied",
  "not_satisfied",
  "uncertain",
  "not_applicable"
] as const;

export const desktopWorkflowTransientStateRisks = [
  "none",
  "possible",
  "present",
  "uncertain"
] as const;

export const desktopWorkflowPostconditionStatuses = [
  "satisfied",
  "contradicted",
  "inconclusive",
  "not_applicable"
] as const;

export const desktopSubmitWorkflowStateClaimInputSchema = z.object({
  sessionId: z.string().min(1),
  observationId: z.string().min(1),
  perceptionDigestId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  workflowGoal: z.string().min(1).max(2000),
  workflowStep: z.string().min(1).max(2000),
  intendedElementTarget: z.string().min(1).max(1000),
  intendedActionMeaning: z.string().min(1).max(2000),
  actionRole: z.enum(desktopWorkflowActionRoles),
  requiredPrecondition: z.string().min(1).max(2000),
  preconditionStatus: z.enum(desktopWorkflowPreconditionStatuses),
  committedStateEvidence: z.string().min(1).max(2000),
  transientStateRisk: z.enum(desktopWorkflowTransientStateRisks),
  missingConfirmation: z.string().min(1).max(2000).nullable(),
  expectedPostcondition: z.string().min(1).max(2000),
  postconditionContradiction: z.string().min(1).max(2000),
  currentContradiction: z.string().min(1).max(2000).nullable(),
  transitionActionId: z.string().min(1).optional(),
  postconditionStatus: z.enum(desktopWorkflowPostconditionStatuses).optional(),
  staleCarryoverReviewed: z.literal(true)
});

export type DesktopSubmitWorkflowStateClaimInput = z.infer<
  typeof desktopSubmitWorkflowStateClaimInputSchema
>;

export const desktopWorkflowStateClaimSchema =
  desktopSubmitWorkflowStateClaimInputSchema.extend({
    workflowStateClaimId: z.string().min(1),
    createdAt: z.string().min(1),
    sourceObservationFrameHashes: z.array(z.string().min(1)).min(1),
    status: z.literal("accepted")
  });

export type DesktopWorkflowStateClaim = z.infer<
  typeof desktopWorkflowStateClaimSchema
>;

export const desktopAppScopeBindingSchema = z.object({
  bindingId: z.string().min(1),
  sessionId: z.string().min(1),
  licensedScope: desktopInteractionScopeSchema,
  boundScope: desktopInteractionScopeSchema,
  boundAt: z.string().min(1),
  observationId: z.string().min(1),
  activeWindow: desktopWindowMetadataSchema.optional(),
  observedWindowIdentity: z.string().min(1).optional(),
  residue: z.array(z.string())
});

export type DesktopAppScopeBinding = z.infer<typeof desktopAppScopeBindingSchema>;

export const desktopActionRiskSchema = z.object({
  credentialExposure: z.boolean(),
  destructive: z.boolean(),
  externalEffect: z.boolean(),
  systemChange: z.boolean(),
  recoverability: z.enum(["high", "medium", "low"])
});

export type DesktopActionRisk = z.infer<typeof desktopActionRiskSchema>;

export const desktopActionInputSchema = z.object({
  point: desktopPointSchema.optional(),
  button: z.enum(["left", "middle", "right"]).optional(),
  textLength: z.number().int().nonnegative().optional(),
  hoverTargetWitnessId: z.string().min(1).optional()
});

export type DesktopActionInput = z.infer<typeof desktopActionInputSchema>;

export const desktopActionPacketSchema = z
  .object({
    actionId: z.string().min(1),
    sessionId: z.string().min(1),
    actionType: z.enum(desktopSessionActionTypes),
    requestedAt: z.string().min(1),
    targetScope: desktopInteractionScopeSchema,
  preActionObservationId: z.string().min(1).optional(),
  postActionObservationId: z.string().min(1).optional(),
  intendedSemanticTarget: z.string().min(1).optional(),
  perceptionDigestId: z.string().min(1).optional(),
  workflowStateClaimId: z.string().min(1).optional(),
  input: desktopActionInputSchema,
  compactRelationalClaim: desktopCompactRelationalClaimSchema.optional(),
  relationalNavigation: desktopRelationalNavigationSchema.optional(),
    preActionNavigationCheck: desktopPreActionNavigationCheckSchema.optional(),
    risk: desktopActionRiskSchema,
    residue: z.array(z.string())
  })
  .superRefine((action, context) => {
    if (
      action.relationalNavigation !== undefined &&
      action.intendedSemanticTarget !== undefined &&
      !semanticTargetsEquivalent(
        action.relationalNavigation.actionJustification.intendedSemanticTarget,
        action.intendedSemanticTarget
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "relationalNavigation.actionJustification.intendedSemanticTarget must match intendedSemanticTarget when both are supplied.",
        path: ["relationalNavigation", "actionJustification", "intendedSemanticTarget"]
      });
    }

    if (
      action.relationalNavigation !== undefined &&
      action.preActionObservationId !== undefined &&
      action.relationalNavigation.orientation.sourceObservationId !==
        action.preActionObservationId
    ) {
      context.addIssue({
        code: "custom",
        message:
          "relationalNavigation.orientation.sourceObservationId must match preActionObservationId when both are supplied.",
        path: ["relationalNavigation", "orientation", "sourceObservationId"]
      });
    }

    if (
      action.compactRelationalClaim !== undefined &&
      action.preActionObservationId !== undefined &&
      action.compactRelationalClaim.sourceObservationId !== action.preActionObservationId
    ) {
      context.addIssue({
        code: "custom",
        message:
          "compactRelationalClaim.sourceObservationId must match preActionObservationId when both are supplied.",
        path: ["compactRelationalClaim", "sourceObservationId"]
      });
    }

    if (
      action.compactRelationalClaim !== undefined &&
      action.intendedSemanticTarget !== undefined &&
      !semanticTargetsEquivalent(
        action.compactRelationalClaim.intendedTarget,
        action.intendedSemanticTarget
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "compactRelationalClaim.intendedTarget must match intendedSemanticTarget when both are supplied.",
        path: ["compactRelationalClaim", "intendedTarget"]
      });
    }

    if (
      action.preActionNavigationCheck !== undefined &&
      action.relationalNavigation !== undefined &&
      action.preActionNavigationCheck.navigationId !==
        action.relationalNavigation.navigationId
    ) {
      context.addIssue({
        code: "custom",
        message:
          "preActionNavigationCheck.navigationId must match relationalNavigation.navigationId when both are supplied.",
        path: ["preActionNavigationCheck", "navigationId"]
      });
    }

    if (
      action.preActionNavigationCheck !== undefined &&
      action.relationalNavigation !== undefined &&
      action.preActionNavigationCheck.hypothesisId !==
        action.relationalNavigation.actionJustification.hypothesisId
    ) {
      context.addIssue({
        code: "custom",
        message:
          "preActionNavigationCheck.hypothesisId must match relationalNavigation.actionJustification.hypothesisId when both are supplied.",
        path: ["preActionNavigationCheck", "hypothesisId"]
      });
    }
  });

export type DesktopActionPacket = z.infer<typeof desktopActionPacketSchema>;

export const desktopSessionAuditEventTypes = [
  "session_started",
  "observation_recorded",
  "perception_digest_recorded",
  "workflow_state_claim_recorded",
  "action_requested",
  "action_allowed",
  "action_blocked",
  "action_completed",
  "post_action_observed",
  "transition_assessed",
  "app_scope_bound",
  "click_candidate_evaluated",
  "session_stopped",
  "escalation_required"
] as const;

export const desktopSessionAuditEventSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.enum(desktopSessionAuditEventTypes),
  occurredAt: z.string().min(1),
  actionId: z.string().min(1).optional(),
  observationId: z.string().min(1).optional(),
  summary: z.string().min(1),
  residue: z.array(z.string())
});

export type DesktopSessionAuditEvent = z.infer<typeof desktopSessionAuditEventSchema>;

export const desktopSessionStopConditionTypes = [
  "session_confirmation_required",
  "visible_content_acknowledgement_required",
  "invalid_session",
  "session_expired",
  "max_action_count_reached",
  "max_repair_attempts_reached",
  "outside_allowed_scope",
  "action_not_allowed",
  "forbidden_action",
  "blocked_high_risk_action",
  "missing_pre_action_observation",
  "stale_pre_action_observation",
  "pre_action_observation_scope_mismatch",
  "missing_frame_evidence",
  "missing_perception_digest",
  "stale_perception_digest",
  "perception_digest_observation_mismatch",
  "perception_digest_scope_mismatch",
  "perception_digest_target_mismatch",
  "perception_digest_not_latest",
  "perception_digest_target_not_visible",
  "perception_digest_anchor_not_visible",
  "perception_digest_contradicted",
  "missing_workflow_state_claim",
  "stale_workflow_state_claim",
  "workflow_state_claim_mismatch",
  "workflow_precondition_not_satisfied",
  "workflow_state_contradicted",
  "missing_relational_navigation",
  "invalid_point_provenance",
  "missing_pre_action_navigation_check",
  "insufficient_reasoning_contract",
  "missing_semantic_landing_assessment",
  "missing_post_action_observation",
  "post_action_observation_scope_mismatch",
  "missing_audit_event",
  "licensed_app_scope_required",
  "app_scope_binding_required",
  "app_scope_binding_stale",
  "user_reversibility_declaration_required",
  "forbidden_boundary_declaration_required",
  "forbidden_boundary_detected",
  "uninterpretable_post_action_state",
  "low_recoverability"
] as const;

export const desktopSessionStopConditionSchema = z.object({
  condition: z.enum(desktopSessionStopConditionTypes),
  sessionId: z.string().min(1),
  actionId: z.string().min(1).optional(),
  reason: z.string().min(1),
  residue: z.array(z.string())
});

export type DesktopSessionStopCondition = z.infer<
  typeof desktopSessionStopConditionSchema
>;

export type DesktopSessionPolicyDecision =
  | "allow"
  | "requires_session_confirmation"
  | "escalate"
  | "block";

export interface DesktopSessionPolicyResult {
  decision: DesktopSessionPolicyDecision;
  requiresUserConfirmation: boolean;
  requiresPostActionObservation: boolean;
  reasons: string[];
  auditTags: string[];
  stopConditions: DesktopSessionStopCondition[];
  residue: string[];
}

export interface DesktopActionPolicyTransitionGate {
  actionId: string;
  actionType: string;
  status: string;
  followUpObservationId?: string;
  semanticLandingAssessment?: DesktopCompactSemanticLandingAssessment;
  postActionClassification?: {
    kind: string;
  };
  movementDeltaWitness?: {
    cursorObserved: boolean;
    scopeStable: boolean;
  };
  residue: string[];
}

export interface DesktopSessionActionPolicyContext {
  phase: "preflight" | "completion";
  actionCountSoFar: number;
  repairAttemptCount: number;
  auditEvents: DesktopSessionAuditEvent[];
  observations: DesktopObservationPacket[];
  perceptionDigests: DesktopPerceptionDigest[];
  workflowStateClaims: DesktopWorkflowStateClaim[];
  actions: DesktopActionPacket[];
  transitionGates: DesktopActionPolicyTransitionGate[];
  stopConditions: DesktopSessionStopCondition[];
  boundAppScope?: DesktopAppScopeBinding;
  now: string;
}

const hardBlockedActionTypes = new Set<DesktopSessionActionType>([
  "credential_entry",
  "payment_or_purchase",
  "destructive_file_operation",
  "shell_command",
  "system_change"
]);

const stateChangingActionTypes = new Set<DesktopSessionActionType>([
  "move_mouse",
  "click",
  "type_text",
  "open_application",
  "open_url",
  "file_operation"
]);

const appScopedActionTypes = new Set<DesktopLicensedAppActionType>([
  "click",
  "type_text"
]);

function stopCondition(
  condition: DesktopSessionStopCondition["condition"],
  sessionId: string,
  reason: string,
  actionId?: string,
  residue: string[] = []
): DesktopSessionStopCondition {
  return {
    condition,
    sessionId,
    actionId,
    reason,
    residue
  };
}

function result(
  decision: DesktopSessionPolicyDecision,
  reasons: string[],
  auditTags: string[],
  stopConditions: DesktopSessionStopCondition[] = [],
  residue: string[] = [],
  requiresPostActionObservation = false
): DesktopSessionPolicyResult {
  return {
    decision,
    requiresUserConfirmation: decision === "requires_session_confirmation",
    requiresPostActionObservation,
    reasons,
    auditTags,
    stopConditions,
    residue
  };
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function observedWindowIdentity(
  activeWindow: DesktopWindowMetadata | undefined
): string | undefined {
  if (activeWindow?.windowId !== undefined && activeWindow.windowId.trim().length > 0) {
    return activeWindow.windowId;
  }

  const parts = [activeWindow?.processName, activeWindow?.title].filter(
    (part): part is string => part !== undefined && part.trim().length > 0
  );

  return parts.length === 0 ? undefined : parts.join(":");
}

function appScopedActionsRequested(
  license: DesktopInteractionSessionLicense
): DesktopLicensedAppActionType[] {
  return license.allowedActions.filter(
    (actionType): actionType is DesktopLicensedAppActionType =>
      appScopedActionTypes.has(actionType as DesktopLicensedAppActionType)
  );
}

function scopeMatches(
  allowedScope: DesktopInteractionScope,
  targetScope: DesktopInteractionScope
): boolean {
  if (allowedScope.kind !== targetScope.kind) {
    return false;
  }

  if (allowedScope.kind === "active_window") {
    const allowedWindowIdentity = normalize(allowedScope.value);
    const targetWindowIdentity = normalize(targetScope.value);

    return allowedWindowIdentity.length === 0
      ? true
      : targetWindowIdentity === allowedWindowIdentity;
  }

  if (allowedScope.kind === "workspace_path") {
    const allowedPath = normalize(allowedScope.value);
    const targetPath = normalize(targetScope.value);
    return targetPath === allowedPath || targetPath.startsWith(`${allowedPath}\\`);
  }

  return normalize(allowedScope.value) === normalize(targetScope.value);
}

export function isDesktopInteractionScopeAllowed(
  license: DesktopInteractionSessionLicense,
  targetScope: DesktopInteractionScope
): boolean {
  return license.allowedScopes.some((allowedScope) => scopeMatches(allowedScope, targetScope));
}

export function desktopInteractionScopesMatch(
  firstScope: DesktopInteractionScope,
  secondScope: DesktopInteractionScope
): boolean {
  return scopeMatches(firstScope, secondScope);
}

function hasRequiredAuditEvent(
  action: DesktopActionPacket,
  auditEvents: DesktopSessionAuditEvent[]
): boolean {
  return auditEvents.some(
    (event) =>
      event.sessionId === action.sessionId &&
      event.actionId === action.actionId &&
      event.eventType === "action_requested"
  );
}

function isExpired(license: DesktopInteractionSessionLicense, now: string): boolean {
  const nowMs = Date.parse(now);
  const startedMs = Date.parse(license.startedAt);
  const expiresMs = license.expiresAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(license.expiresAt);

  if (Number.isNaN(nowMs) || Number.isNaN(startedMs)) {
    return false;
  }

  return nowMs - startedMs > license.riskLimits.maxDurationMs || nowMs >= expiresMs;
}

function isObservationFresh(
  license: DesktopInteractionSessionLicense,
  observation: DesktopObservationPacket,
  action: DesktopActionPacket
): boolean {
  return desktopEvidenceFresh(
    license,
    "pre_action_observation",
    observation.observedAt,
    action.requestedAt
  );
}

function isAppScopeBindingFresh(
  license: DesktopInteractionSessionLicense,
  binding: DesktopAppScopeBinding,
  now: string
): boolean {
  return desktopEvidenceFresh(license, "app_scope_binding", binding.boundAt, now);
}

function observationMatchesBoundAppScope(
  binding: DesktopAppScopeBinding,
  observation: DesktopObservationPacket
): boolean {
  const observationIdentity = observedWindowIdentity(observation.activeWindow);

  if (
    binding.observedWindowIdentity !== undefined &&
    observationIdentity !== undefined
  ) {
    return normalize(binding.observedWindowIdentity) === normalize(observationIdentity);
  }

  return scopeMatches(binding.boundScope, observation.targetScope);
}

function findObservation(
  observations: DesktopObservationPacket[],
  observationId: string | undefined
): DesktopObservationPacket | undefined {
  return observations.find((observation) => observation.observationId === observationId);
}

function findPerceptionDigest(
  perceptionDigests: DesktopPerceptionDigest[],
  perceptionDigestId: string | undefined
): DesktopPerceptionDigest | undefined {
  return perceptionDigests.find(
    (digest) => digest.perceptionDigestId === perceptionDigestId
  );
}

function findWorkflowStateClaim(
  workflowStateClaims: DesktopWorkflowStateClaim[],
  workflowStateClaimId: string | undefined
): DesktopWorkflowStateClaim | undefined {
  return workflowStateClaims.find(
    (claim) => claim.workflowStateClaimId === workflowStateClaimId
  );
}

function latestObservationId(
  observations: DesktopObservationPacket[]
): string | undefined {
  return observations.at(-1)?.observationId;
}

function observationHasImagePayload(observation: DesktopObservationPacket): boolean {
  return observation.frames.some(
    (frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0
  );
}

function perceptionDigestFresh(
  license: DesktopInteractionSessionLicense,
  digest: DesktopPerceptionDigest,
  action: DesktopActionPacket
): boolean {
  return desktopEvidenceFresh(
    license,
    "perception_digest",
    digest.createdAt,
    action.requestedAt
  );
}

function perceptionDigestFrameHashesMatch(
  digest: DesktopPerceptionDigest,
  observation: DesktopObservationPacket
): boolean {
  const observationHashes = observation.frames.map((frame) => frame.sha256);

  return (
    digest.sourceObservationFrameHashes.length === observationHashes.length &&
    digest.sourceObservationFrameHashes.every(
      (hash, index) => hash === observationHashes[index]
    )
  );
}

function workflowStateClaimFresh(
  license: DesktopInteractionSessionLicense,
  claim: DesktopWorkflowStateClaim,
  action: DesktopActionPacket
): boolean {
  return desktopEvidenceFresh(
    license,
    "workflow_state_claim",
    claim.createdAt,
    action.requestedAt
  );
}

function workflowStateClaimFrameHashesMatch(
  claim: DesktopWorkflowStateClaim,
  observation: DesktopObservationPacket
): boolean {
  const observationHashes = observation.frames.map((frame) => frame.sha256);

  return (
    claim.sourceObservationFrameHashes.length === observationHashes.length &&
    claim.sourceObservationFrameHashes.every(
      (hash, index) => hash === observationHashes[index]
    )
  );
}

function intendedTargetForAction(action: DesktopActionPacket): string | undefined {
  return (
    action.compactRelationalClaim?.intendedTarget ??
    action.relationalNavigation?.actionJustification.intendedSemanticTarget ??
    action.intendedSemanticTarget
  );
}

function isRepairMovement(action: DesktopActionPacket, digest: DesktopPerceptionDigest): boolean {
  return (
    action.actionType === "move_mouse" &&
    action.compactRelationalClaim?.pointProvenance === "relative_probe" &&
    (digest.continuityWithPriorClaim === "changed" ||
      digest.continuityWithPriorClaim === "uncertain")
  );
}

function perceptionDigestStopConditionForAction(
  license: DesktopInteractionSessionLicense,
  action: DesktopActionPacket,
  preActionObservation: DesktopObservationPacket,
  context: DesktopSessionActionPolicyContext
): { stop: DesktopSessionStopCondition; auditTag: string } | undefined {
  if (action.perceptionDigestId === undefined) {
    return {
      stop: stopCondition(
        "missing_perception_digest",
        license.sessionId,
        "Every state-changing action must reference a fresh perception digest for the latest screenshot-bearing observation.",
        action.actionId,
        [
          "Call desktop_submit_interaction_evidence after desktop_observe and pass perceptionDigestId to the action.",
          "The digest is agent-authored; the server validates freshness and provenance, not pixels."
        ]
      ),
      auditTag: "missing_perception_digest"
    };
  }

  const digest = findPerceptionDigest(context.perceptionDigests, action.perceptionDigestId);

  if (digest === undefined) {
    return {
      stop: stopCondition(
        "missing_perception_digest",
        license.sessionId,
        "The referenced perception digest does not exist in the session context.",
        action.actionId,
        [`perceptionDigestId: ${action.perceptionDigestId}.`]
      ),
      auditTag: "missing_perception_digest"
    };
  }

  if (digest.sessionId !== license.sessionId) {
    return {
      stop: stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced perception digest belongs to a different session.",
        action.actionId
      ),
      auditTag: "perception_digest_session_mismatch"
    };
  }

  if (digest.observationId !== preActionObservation.observationId) {
    return {
      stop: stopCondition(
        "perception_digest_observation_mismatch",
        license.sessionId,
        "The perception digest must be bound to the same observation as the action pre-action observation.",
        action.actionId,
        [
          `Action preActionObservationId: ${preActionObservation.observationId}.`,
          `Digest observationId: ${digest.observationId}.`
        ]
      ),
      auditTag: "perception_digest_observation_mismatch"
    };
  }

  const latest = latestObservationId(context.observations);

  if (latest !== digest.observationId) {
    return {
      stop: stopCondition(
        "perception_digest_not_latest",
        license.sessionId,
        "The perception digest is not bound to the latest recorded observation.",
        action.actionId,
        [
          `Latest observationId: ${latest ?? "none"}.`,
          `Digest observationId: ${digest.observationId}.`,
          "A newer desktop_observe invalidates previous digests for future state-changing actions."
        ]
      ),
      auditTag: "perception_digest_not_latest"
    };
  }

  if (!perceptionDigestFresh(license, digest, action)) {
    return {
      stop: stopCondition(
        "stale_perception_digest",
        license.sessionId,
        "The perception digest is older than the session observation cadence allows.",
        action.actionId
      ),
      auditTag: "stale_perception_digest"
    };
  }

  if (!desktopInteractionScopesMatch(digest.targetScope, action.targetScope)) {
    return {
      stop: stopCondition(
        "perception_digest_scope_mismatch",
        license.sessionId,
        "The perception digest target scope does not match the action target scope.",
        action.actionId
      ),
      auditTag: "perception_digest_scope_mismatch"
    };
  }

  const intendedTarget = intendedTargetForAction(action);

  if (
    intendedTarget !== undefined &&
    !semanticTargetsEquivalent(digest.intendedTarget, intendedTarget)
  ) {
    return {
      stop: stopCondition(
        "perception_digest_target_mismatch",
        license.sessionId,
        "The perception digest intended target does not match the action target.",
        action.actionId,
        [
          `Action target: ${intendedTarget}.`,
          `Digest target: ${digest.intendedTarget}.`,
          `Action target canonical: ${semanticTargetCanonicalForm(intendedTarget)}.`,
          `Digest target canonical: ${semanticTargetCanonicalForm(digest.intendedTarget)}.`
        ]
      ),
      auditTag: "perception_digest_target_mismatch"
    };
  }

  if (!perceptionDigestFrameHashesMatch(digest, preActionObservation)) {
    return {
      stop: stopCondition(
        "perception_digest_observation_mismatch",
        license.sessionId,
        "The perception digest frame hashes do not match the referenced observation.",
        action.actionId
      ),
      auditTag: "perception_digest_frame_hash_mismatch"
    };
  }

  if (digest.anchorVisibility === "not_visible") {
    return {
      stop: stopCondition(
        "perception_digest_anchor_not_visible",
        license.sessionId,
        "The perception digest says the relational anchor is not visible in the current observation.",
        action.actionId
      ),
      auditTag: "perception_digest_anchor_not_visible"
    };
  }

  if (digest.targetVisibility === "not_visible") {
    return {
      stop: stopCondition(
        "perception_digest_target_not_visible",
        license.sessionId,
        "The perception digest says the intended target is not visible in the current observation.",
        action.actionId
      ),
      auditTag: "perception_digest_target_not_visible"
    };
  }

  const repairMovement = isRepairMovement(action, digest);

  if (digest.targetVisibility === "uncertain" && !repairMovement) {
    return {
      stop: stopCondition(
        "perception_digest_target_not_visible",
        license.sessionId,
        "The perception digest is uncertain about target visibility; only relative-probe repair movement may proceed from uncertainty.",
        action.actionId
      ),
      auditTag: "perception_digest_target_uncertain"
    };
  }

  if (
    !repairMovement &&
    (digest.continuityWithPriorClaim === "changed" ||
      digest.continuityWithPriorClaim === "uncertain" ||
      digest.contradictionToPriorClaim !== null)
  ) {
    return {
      stop: stopCondition(
        "perception_digest_contradicted",
        license.sessionId,
        "The perception digest does not support carrying the prior visual claim into this action.",
        action.actionId,
        [
          `continuityWithPriorClaim: ${digest.continuityWithPriorClaim}.`,
          `contradictionToPriorClaim: ${formatNullableStringForAudit(digest.contradictionToPriorClaim)}.`
        ]
      ),
      auditTag: "perception_digest_contradicted"
    };
  }

  return undefined;
}

function workflowStateClaimReadinessIssue(
  claim: DesktopWorkflowStateClaim,
  actionType: DesktopSessionActionType
): string | undefined {
  if (claim.currentContradiction !== null) {
    return `Workflow currentContradiction is ${formatNullableStringForAudit(claim.currentContradiction)}.`;
  }

  if (claim.actionRole === "probe") {
    return "Workflow actionRole probe cannot support click or typing execution.";
  }

  if (claim.actionRole === "execute_committed_action" || claim.actionRole === "text_entry") {
    if (claim.preconditionStatus !== "satisfied") {
      return `Workflow preconditionStatus is ${claim.preconditionStatus}; ${claim.actionRole} requires satisfied.`;
    }

    if (claim.transientStateRisk !== "none" && claim.transientStateRisk !== "possible") {
      return `Workflow transientStateRisk is ${claim.transientStateRisk}; committed execution requires none or possible.`;
    }
  }

  if (claim.actionRole === "commit_precondition" || claim.actionRole === "repair") {
    if (
      (claim.preconditionStatus === "not_satisfied" ||
        claim.preconditionStatus === "uncertain") &&
      claim.missingConfirmation === null
    ) {
      return "Workflow missingConfirmation is required when committing or repairing an unmet/uncertain precondition.";
    }
  }

  if (claim.actionRole === "not_applicable") {
    if (
      claim.preconditionStatus !== "not_applicable" &&
      claim.preconditionStatus !== "satisfied"
    ) {
      return `Workflow preconditionStatus is ${claim.preconditionStatus}; not_applicable role requires not_applicable or satisfied.`;
    }

    if (claim.transientStateRisk !== "none" && claim.transientStateRisk !== "possible") {
      return `Workflow transientStateRisk is ${claim.transientStateRisk}; not_applicable action requires none or possible.`;
    }
  }

  if (
    actionType === "type_text" &&
    claim.actionRole !== "text_entry" &&
    claim.actionRole !== "not_applicable"
  ) {
    return `desktop_type_text requires workflow actionRole text_entry or not_applicable, not ${claim.actionRole}.`;
  }

  return undefined;
}

export interface DesktopWorkflowStateRevalidationResult {
  ok: boolean;
  residue: string[];
  interveningActionIds: string[];
  reason?: string;
}

function observationIndex(
  observations: DesktopObservationPacket[],
  observationId: string
): number {
  return observations.findIndex(
    (observation) => observation.observationId === observationId
  );
}

function perceptionDigestSupportsCurrentAction(
  digest: DesktopPerceptionDigest
): string | undefined {
  if (digest.targetVisibility !== "visible") {
    return `Current digest targetVisibility is ${digest.targetVisibility}.`;
  }

  if (digest.anchorVisibility === "not_visible") {
    return "Current digest anchorVisibility is not_visible.";
  }

  if (
    digest.continuityWithPriorClaim !== "consistent" &&
    digest.continuityWithPriorClaim !== "not_applicable"
  ) {
    return `Current digest continuityWithPriorClaim is ${digest.continuityWithPriorClaim}.`;
  }

  if (digest.contradictionToPriorClaim !== null) {
    return `Current digest contradictionToPriorClaim is ${formatNullableStringForAudit(digest.contradictionToPriorClaim)}.`;
  }

  return undefined;
}

function transitionGateBlocksWorkflowRevalidation(
  gate: DesktopActionPolicyTransitionGate | undefined
): string | undefined {
  if (gate === undefined) {
    return "Intervening movement has no transition gate.";
  }

  if (gate.actionType !== "move_mouse") {
    return `Intervening transition actionType is ${gate.actionType}.`;
  }

  if (gate.status !== "audited") {
    return `Intervening movement transition status is ${gate.status}, not audited.`;
  }

  const blockingClassificationKinds = new Set([
    "wrong_target",
    "scope_exit",
    "risk_prompt",
    "uninterpretable_state",
    "repair_needed"
  ]);

  if (
    gate.postActionClassification !== undefined &&
    blockingClassificationKinds.has(gate.postActionClassification.kind)
  ) {
    return `Intervening movement transition classified as ${gate.postActionClassification.kind}.`;
  }

  if (gate.semanticLandingAssessment === undefined) {
    return "Intervening movement has no semantic landing assessment.";
  }

  if (gate.semanticLandingAssessment.outcome === "contradicted") {
    return "Intervening movement semantic landing was contradicted.";
  }

  if (gate.movementDeltaWitness?.cursorObserved === false) {
    return "Intervening movement did not retain cursor observation evidence.";
  }

  if (gate.movementDeltaWitness?.scopeStable === false) {
    return "Intervening movement did not retain stable scope evidence.";
  }

  return undefined;
}

export function evaluateWorkflowStateClaimRevalidation(input: {
  license: DesktopInteractionSessionLicense;
  actionId: string;
  actionType: DesktopSessionActionType;
  requestedAt: string;
  targetScope: DesktopInteractionScope;
  intendedTarget?: string;
  preActionObservation: DesktopObservationPacket;
  currentPerceptionDigest: DesktopPerceptionDigest | undefined;
  workflowStateClaim: DesktopWorkflowStateClaim;
  context: DesktopSessionActionPolicyContext;
}): DesktopWorkflowStateRevalidationResult {
  const residue: string[] = [];
  const interveningActionIds: string[] = [];
  const currentDigest = input.currentPerceptionDigest;

  if (input.workflowStateClaim.sessionId !== input.license.sessionId) {
    return {
      ok: false,
      reason: "Workflow claim belongs to a different session.",
      residue,
      interveningActionIds
    };
  }

  if (currentDigest === undefined) {
    return {
      ok: false,
      reason: "Current perception digest is missing.",
      residue,
      interveningActionIds
    };
  }

  if (currentDigest.observationId !== input.preActionObservation.observationId) {
    return {
      ok: false,
      reason: "Current perception digest is not bound to the action pre-action observation.",
      residue: [
        `Action preActionObservationId: ${input.preActionObservation.observationId}.`,
        `Digest observationId: ${currentDigest.observationId}.`
      ],
      interveningActionIds
    };
  }

  const latest = latestObservationId(input.context.observations);

  if (latest !== input.preActionObservation.observationId) {
    return {
      ok: false,
      reason: "Action pre-action observation is not the latest recorded observation.",
      residue: [
        `Latest observationId: ${latest ?? "none"}.`,
        `Action preActionObservationId: ${input.preActionObservation.observationId}.`
      ],
      interveningActionIds
    };
  }

  if (!perceptionDigestFresh(input.license, currentDigest, {
    actionId: input.actionId,
    sessionId: input.license.sessionId,
    actionType: input.actionType,
    requestedAt: input.requestedAt,
    targetScope: input.targetScope,
    preActionObservationId: input.preActionObservation.observationId,
    intendedSemanticTarget: input.intendedTarget,
    perceptionDigestId: currentDigest.perceptionDigestId,
    workflowStateClaimId: input.workflowStateClaim.workflowStateClaimId,
    input: {},
    risk: {
      credentialExposure: false,
      destructive: false,
      externalEffect: false,
      systemChange: false,
      recoverability: "high"
    },
    residue: []
  })) {
    return {
      ok: false,
      reason: "Current perception digest is stale.",
      residue,
      interveningActionIds
    };
  }

  if (!desktopInteractionScopesMatch(currentDigest.targetScope, input.targetScope)) {
    return {
      ok: false,
      reason: "Current perception digest scope does not match the requested action scope.",
      residue,
      interveningActionIds
    };
  }

  if (!desktopInteractionScopesMatch(input.workflowStateClaim.targetScope, input.targetScope)) {
    return {
      ok: false,
      reason: "Workflow claim scope does not match the requested action scope.",
      residue,
      interveningActionIds
    };
  }

  const intendedTarget = input.intendedTarget;

  if (
    intendedTarget !== undefined &&
    !semanticTargetsEquivalent(currentDigest.intendedTarget, intendedTarget)
  ) {
    return {
      ok: false,
      reason: "Current perception digest target does not match the requested action target.",
      residue: [
        `Action target: ${intendedTarget}.`,
        `Digest target: ${currentDigest.intendedTarget}.`,
        `Action target canonical: ${semanticTargetCanonicalForm(intendedTarget)}.`,
        `Digest target canonical: ${semanticTargetCanonicalForm(currentDigest.intendedTarget)}.`
      ],
      interveningActionIds
    };
  }

  if (
    intendedTarget !== undefined &&
    !semanticTargetsEquivalent(input.workflowStateClaim.intendedElementTarget, intendedTarget)
  ) {
    return {
      ok: false,
      reason: "Workflow claim target does not match the requested action target.",
      residue: [
        `Action target: ${intendedTarget}.`,
        `Workflow target: ${input.workflowStateClaim.intendedElementTarget}.`,
        `Action target canonical: ${semanticTargetCanonicalForm(intendedTarget)}.`,
        `Workflow target canonical: ${semanticTargetCanonicalForm(input.workflowStateClaim.intendedElementTarget)}.`
      ],
      interveningActionIds
    };
  }

  if (
    !semanticTargetsEquivalent(
      currentDigest.intendedTarget,
      input.workflowStateClaim.intendedElementTarget
    )
  ) {
    return {
      ok: false,
      reason: "Current perception digest target does not match the workflow claim target.",
      residue: [
        `Digest target: ${currentDigest.intendedTarget}.`,
        `Workflow target: ${input.workflowStateClaim.intendedElementTarget}.`,
        `Digest target canonical: ${semanticTargetCanonicalForm(currentDigest.intendedTarget)}.`,
        `Workflow target canonical: ${semanticTargetCanonicalForm(input.workflowStateClaim.intendedElementTarget)}.`
      ],
      interveningActionIds
    };
  }

  if (!perceptionDigestFrameHashesMatch(currentDigest, input.preActionObservation)) {
    return {
      ok: false,
      reason: "Current perception digest frame hashes do not match the action observation.",
      residue,
      interveningActionIds
    };
  }

  const digestReadinessIssue = perceptionDigestSupportsCurrentAction(currentDigest);

  if (digestReadinessIssue !== undefined) {
    return {
      ok: false,
      reason: digestReadinessIssue,
      residue,
      interveningActionIds
    };
  }

  if (!workflowStateClaimFresh(input.license, input.workflowStateClaim, {
    actionId: input.actionId,
    sessionId: input.license.sessionId,
    actionType: input.actionType,
    requestedAt: input.requestedAt,
    targetScope: input.targetScope,
    preActionObservationId: input.preActionObservation.observationId,
    intendedSemanticTarget: intendedTarget,
    perceptionDigestId: currentDigest.perceptionDigestId,
    workflowStateClaimId: input.workflowStateClaim.workflowStateClaimId,
    input: {},
    risk: {
      credentialExposure: false,
      destructive: false,
      externalEffect: false,
      systemChange: false,
      recoverability: "high"
    },
    residue: []
  })) {
    return {
      ok: false,
      reason: "Workflow claim is stale.",
      residue,
      interveningActionIds
    };
  }

  const workflowClaimObservation = findObservation(
    input.context.observations,
    input.workflowStateClaim.observationId
  );

  if (workflowClaimObservation === undefined) {
    return {
      ok: false,
      reason: "Workflow claim source observation was not found.",
      residue,
      interveningActionIds
    };
  }

  if (!workflowStateClaimFrameHashesMatch(input.workflowStateClaim, workflowClaimObservation)) {
    return {
      ok: false,
      reason: "Workflow claim frame hashes do not match its source observation.",
      residue,
      interveningActionIds
    };
  }

  const readinessIssue = workflowStateClaimReadinessIssue(
    input.workflowStateClaim,
    input.actionType
  );

  if (readinessIssue !== undefined) {
    return {
      ok: false,
      reason: readinessIssue,
      residue,
      interveningActionIds
    };
  }

  const claimObservationIndex = observationIndex(
    input.context.observations,
    input.workflowStateClaim.observationId
  );
  const currentObservationIndex = observationIndex(
    input.context.observations,
    input.preActionObservation.observationId
  );

  if (claimObservationIndex < 0 || currentObservationIndex < claimObservationIndex) {
    return {
      ok: false,
      reason: "Workflow claim observation is not an ancestor of the current observation.",
      residue,
      interveningActionIds
    };
  }

  const observationIdsSinceClaim = new Set(
    input.context.observations
      .slice(claimObservationIndex, currentObservationIndex + 1)
      .map((observation) => observation.observationId)
  );
  const claimCreatedMs = Date.parse(input.workflowStateClaim.createdAt);
  const actionsSinceClaim = input.context.actions.filter((action) => {
    if (action.actionId === input.actionId) {
      return false;
    }

    const preActionAfterClaim =
      action.preActionObservationId !== undefined &&
      observationIdsSinceClaim.has(action.preActionObservationId);

    if (preActionAfterClaim) {
      return true;
    }

    const requestedMs = Date.parse(action.requestedAt);

    return (
      !Number.isNaN(claimCreatedMs) &&
      !Number.isNaN(requestedMs) &&
      requestedMs > claimCreatedMs
    );
  });

  for (const action of actionsSinceClaim) {
    interveningActionIds.push(action.actionId);

    if (action.actionType !== "move_mouse") {
      return {
        ok: false,
        reason: `Intervening ${action.actionType} action invalidates workflow revalidation.`,
        residue: [`Intervening actionId: ${action.actionId}.`],
        interveningActionIds
      };
    }

    const gate = input.context.transitionGates.find(
      (transitionGate) => transitionGate.actionId === action.actionId
    );
    const gateIssue = transitionGateBlocksWorkflowRevalidation(gate);

    if (gateIssue !== undefined) {
      return {
        ok: false,
        reason: gateIssue,
        residue: [
          `Intervening move actionId: ${action.actionId}.`,
          ...(gate?.residue ?? [])
        ],
        interveningActionIds
      };
    }

    const stopCondition = input.context.stopConditions.find(
      (condition) => condition.actionId === action.actionId
    );

    if (stopCondition !== undefined) {
      return {
        ok: false,
        reason: `Intervening action has stop condition ${stopCondition.condition}.`,
        residue: stopCondition.residue,
        interveningActionIds
      };
    }
  }

  return {
    ok: true,
    residue: [
      "Older workflow-state claim was revalidated by the latest screenshot-bearing observation and perception digest.",
      "Only observations and audited non-contradicted mouse movement occurred since the workflow claim.",
      `Current observationId: ${input.preActionObservation.observationId}.`,
      `Current perceptionDigestId: ${currentDigest.perceptionDigestId}.`,
      `WorkflowStateClaimId: ${input.workflowStateClaim.workflowStateClaimId}.`
    ],
    interveningActionIds
  };
}

function workflowStateClaimStopConditionForAction(
  license: DesktopInteractionSessionLicense,
  action: DesktopActionPacket,
  preActionObservation: DesktopObservationPacket,
  context: DesktopSessionActionPolicyContext
): { stop: DesktopSessionStopCondition; auditTag: string } | undefined {
  if (action.actionType !== "click" && action.actionType !== "type_text") {
    return undefined;
  }

  if (action.workflowStateClaimId === undefined) {
    return {
      stop: stopCondition(
        "missing_workflow_state_claim",
        license.sessionId,
        "Click and typing actions must reference a fresh workflow-state claim.",
        action.actionId,
        [
          "Call desktop_submit_interaction_evidence with workflow evidence after inspecting the latest screenshot-bearing observation.",
          "Workflow state claims prove committed UI workflow readiness; element targeting alone is not enough."
        ]
      ),
      auditTag: "missing_workflow_state_claim"
    };
  }

  const claim = findWorkflowStateClaim(
    context.workflowStateClaims,
    action.workflowStateClaimId
  );

  if (claim === undefined) {
    return {
      stop: stopCondition(
        "missing_workflow_state_claim",
        license.sessionId,
        "The referenced workflow-state claim does not exist in the session context.",
        action.actionId,
        [`workflowStateClaimId: ${action.workflowStateClaimId}.`]
      ),
      auditTag: "missing_workflow_state_claim"
    };
  }

  if (claim.sessionId !== license.sessionId) {
    return {
      stop: stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced workflow-state claim belongs to a different session.",
        action.actionId
      ),
      auditTag: "workflow_state_claim_session_mismatch"
    };
  }

  const latest = latestObservationId(context.observations);
  const currentPerceptionDigest = findPerceptionDigest(
    context.perceptionDigests,
    action.perceptionDigestId
  );
  const claimDirectlyMatchesAction =
    claim.observationId === preActionObservation.observationId &&
    latest === claim.observationId &&
    workflowStateClaimFresh(license, claim, action) &&
    claim.perceptionDigestId === action.perceptionDigestId &&
    desktopInteractionScopesMatch(claim.targetScope, action.targetScope) &&
    workflowStateClaimFrameHashesMatch(claim, preActionObservation);

  if (!claimDirectlyMatchesAction) {
    const revalidation = evaluateWorkflowStateClaimRevalidation({
      license,
      actionId: action.actionId,
      actionType: action.actionType,
      requestedAt: action.requestedAt,
      targetScope: action.targetScope,
      intendedTarget: intendedTargetForAction(action),
      preActionObservation,
      currentPerceptionDigest,
      workflowStateClaim: claim,
      context
    });

    if (revalidation.ok) {
      return undefined;
    }
  }

  if (claim.observationId !== preActionObservation.observationId) {
    return {
      stop: stopCondition(
        "workflow_state_claim_mismatch",
        license.sessionId,
        "The workflow-state claim must be bound to the same observation as the action pre-action observation.",
        action.actionId,
        [
          `Action preActionObservationId: ${preActionObservation.observationId}.`,
          `Workflow claim observationId: ${claim.observationId}.`
        ]
      ),
      auditTag: "workflow_state_claim_observation_mismatch"
    };
  }

  if (latest !== claim.observationId) {
    return {
      stop: stopCondition(
        "stale_workflow_state_claim",
        license.sessionId,
        "The workflow-state claim is not bound to the latest recorded observation.",
        action.actionId,
        [
          `Latest observationId: ${latest ?? "none"}.`,
          `Workflow claim observationId: ${claim.observationId}.`,
          "A newer desktop_observe invalidates previous workflow claims for future click/type actions."
        ]
      ),
      auditTag: "workflow_state_claim_not_latest"
    };
  }

  if (!workflowStateClaimFresh(license, claim, action)) {
    return {
      stop: stopCondition(
        "stale_workflow_state_claim",
        license.sessionId,
        "The workflow-state claim is older than the session observation cadence allows.",
        action.actionId
      ),
      auditTag: "stale_workflow_state_claim"
    };
  }

  if (claim.perceptionDigestId !== action.perceptionDigestId) {
    return {
      stop: stopCondition(
        "workflow_state_claim_mismatch",
        license.sessionId,
        "The workflow-state claim must reference the same perception digest as the action.",
        action.actionId,
        [
          `Action perceptionDigestId: ${action.perceptionDigestId ?? "missing"}.`,
          `Workflow claim perceptionDigestId: ${claim.perceptionDigestId}.`
        ]
      ),
      auditTag: "workflow_state_claim_digest_mismatch"
    };
  }

  if (!desktopInteractionScopesMatch(claim.targetScope, action.targetScope)) {
    return {
      stop: stopCondition(
        "workflow_state_claim_mismatch",
        license.sessionId,
        "The workflow-state claim target scope does not match the action target scope.",
        action.actionId
      ),
      auditTag: "workflow_state_claim_scope_mismatch"
    };
  }

  const intendedTarget = intendedTargetForAction(action);

  if (
    intendedTarget !== undefined &&
    !semanticTargetsEquivalent(claim.intendedElementTarget, intendedTarget)
  ) {
    return {
      stop: stopCondition(
        "workflow_state_claim_mismatch",
        license.sessionId,
        "The workflow-state claim intended element target does not match the action target.",
        action.actionId,
        [
          `Action target: ${intendedTarget}.`,
          `Workflow target: ${claim.intendedElementTarget}.`,
          `Action target canonical: ${semanticTargetCanonicalForm(intendedTarget)}.`,
          `Workflow target canonical: ${semanticTargetCanonicalForm(claim.intendedElementTarget)}.`
        ]
      ),
      auditTag: "workflow_state_claim_target_mismatch"
    };
  }

  if (!workflowStateClaimFrameHashesMatch(claim, preActionObservation)) {
    return {
      stop: stopCondition(
        "workflow_state_claim_mismatch",
        license.sessionId,
        "The workflow-state claim frame hashes do not match the referenced observation.",
        action.actionId
      ),
      auditTag: "workflow_state_claim_frame_hash_mismatch"
    };
  }

  const readinessIssue = workflowStateClaimReadinessIssue(claim, action.actionType);

  if (readinessIssue !== undefined) {
    const contradicted = claim.currentContradiction !== null;

    return {
      stop: stopCondition(
        contradicted ? "workflow_state_contradicted" : "workflow_precondition_not_satisfied",
        license.sessionId,
        "The workflow-state claim does not support the requested action.",
        action.actionId,
        [
          readinessIssue,
          `workflowGoal: ${claim.workflowGoal}.`,
          `workflowStep: ${claim.workflowStep}.`,
          `actionRole: ${claim.actionRole}.`,
          `requiredPrecondition: ${claim.requiredPrecondition}.`,
          `committedStateEvidence: ${claim.committedStateEvidence}.`
        ]
      ),
      auditTag: contradicted ? "workflow_state_contradicted" : "workflow_precondition_not_satisfied"
    };
  }

  return undefined;
}

function relationalFrameEvidenceIssues(
  observation: DesktopObservationPacket,
  navigation: DesktopRelationalNavigation
): string[] {
  const issues: string[] = [];
  const frameHashesByIndex = new Map(
    observation.frames.map((frame) => [frame.index, frame.sha256])
  );

  for (const evidence of navigation.frameEvidence) {
    const observedHash = frameHashesByIndex.get(evidence.frameIndex);

    if (evidence.sourceObservationId !== observation.observationId) {
      issues.push(
        `Frame evidence ${evidence.evidenceId} references source observation ${evidence.sourceObservationId}, not ${observation.observationId}.`
      );
    }

    if (observedHash === undefined) {
      issues.push(
        `Frame evidence ${evidence.evidenceId} references frame ${evidence.frameIndex}, which is not in the pre-action observation.`
      );
    } else if (observedHash !== evidence.frameSha256) {
      issues.push(
        `Frame evidence ${evidence.evidenceId} hash does not match the live pre-action observation frame.`
      );
    }
  }

  return issues;
}

function pointProvenanceAllowedForAction(action: DesktopActionPacket): boolean {
  const provenance = action.compactRelationalClaim?.pointProvenance;

  if (provenance === undefined) {
    return true;
  }

  if (provenance === "external_coordinate" || provenance === "unknown") {
    return false;
  }

  if (action.actionType === "move_mouse") {
    return (
      provenance === "relational_estimate" ||
      provenance === "relative_probe" ||
      provenance === "hover_witness"
    );
  }

  if (action.actionType === "click") {
    return provenance === "hover_witness";
  }

  return (
    provenance === "relational_estimate" ||
    provenance === "relative_probe" ||
    provenance === "hover_witness"
  );
}

function invalidPointProvenanceReason(action: DesktopActionPacket): string {
  const provenance = action.compactRelationalClaim?.pointProvenance ?? "missing";

  if (provenance === "external_coordinate" || provenance === "unknown") {
    return `${provenance} coordinates are hypotheses from outside relational navigation and cannot license state-changing desktop actions.`;
  }

  if (action.actionType === "click") {
    return "desktop_click requires compactRelationalClaim.pointProvenance=hover_witness.";
  }

  return `${provenance} is not accepted for ${action.actionType}.`;
}

function postActionObservationReason(actionType: DesktopSessionActionType): string {
  if (actionType === "move_mouse") {
    return "Mouse movement is a probe and requires post-movement observation plus semantic landing assessment before the next non-observe action.";
  }

  if (actionType === "click" || actionType === "type_text") {
    return "Clicking and typing require post-action observation before success can be claimed.";
  }

  return "State-changing actions require post-action observation before the next non-observe action.";
}

export function evaluateSessionStartPolicy(
  license: DesktopInteractionSessionLicense
): DesktopSessionPolicyResult {
  const auditTags = ["desktop_interaction_session"];
  const stopConditions: DesktopSessionStopCondition[] = [];

  if (license.userGoal.trim().length === 0) {
    stopConditions.push(
      stopCondition(
        "invalid_session",
        license.sessionId,
        "A desktop interaction session requires a concrete user goal."
      )
    );
  }

  if (license.allowedScopes.length === 0) {
    stopConditions.push(
      stopCondition(
        "invalid_session",
        license.sessionId,
        "A desktop interaction session requires at least one allowed scope."
      )
    );
  }

  if (stopConditions.length > 0) {
    return result(
      "block",
      stopConditions.map((condition) => condition.reason),
      [...auditTags, "invalid_session"],
      stopConditions
    );
  }

  if (!license.userConfirmed) {
    const stop = stopCondition(
      "session_confirmation_required",
      license.sessionId,
      "User confirmation is required before a desktop interaction session can start."
    );

    return result(
      "requires_session_confirmation",
      [stop.reason],
      [...auditTags, "session_confirmation_required"],
      [stop]
    );
  }

  if (!license.visibleContentAcknowledged) {
    const stop = stopCondition(
      "visible_content_acknowledgement_required",
      license.sessionId,
      "The user must acknowledge that visible desktop content may be captured during observation."
    );

    return result(
      "requires_session_confirmation",
      [stop.reason],
      [...auditTags, "visible_content_acknowledgement_required"],
      [stop]
    );
  }

  const requestedAppScopedActions = appScopedActionsRequested(license);

  if (requestedAppScopedActions.length > 0 && license.licensedAppScope === undefined) {
    const stop = stopCondition(
      "licensed_app_scope_required",
      license.sessionId,
      "Click and type_text session permissions require a user-declared reversible app-under-test scope."
    );

    return result(
      "block",
      [stop.reason],
      [...auditTags, "licensed_app_scope_required"],
      [stop],
      [
        "Declare licensedAppScope before granting click or type_text permissions.",
        "This does not enable real click or typing; it scopes future app-under-test authority."
      ]
    );
  }

  if (license.licensedAppScope !== undefined) {
    const appScope = license.licensedAppScope;
    const appScopeStops: DesktopSessionStopCondition[] = [];

    if (!appScope.userDeclaredReversible) {
      appScopeStops.push(
        stopCondition(
          "user_reversibility_declaration_required",
          license.sessionId,
          "The user must declare that the licensed app-under-test is reversible and safe for the requested UI testing task."
        )
      );
    }

    if (appScope.forbiddenBoundaries.length === 0) {
      appScopeStops.push(
        stopCondition(
          "forbidden_boundary_declaration_required",
          license.sessionId,
          "The licensed app-under-test scope must declare forbidden boundaries."
        )
      );
    }

    if (!isDesktopInteractionScopeAllowed(license, appScope.scope)) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          "The licensed app-under-test scope must be inside the session's allowed scopes."
        )
      );
    }

    const missingAppPermissions = requestedAppScopedActions.filter(
      (actionType) => !appScope.allowedActions.includes(actionType)
    );

    if (missingAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          `The licensed app-under-test scope does not grant requested action(s): ${missingAppPermissions.join(", ")}.`
        )
      );
    }

    const unlicensedAppPermissions = appScope.allowedActions.filter(
      (actionType) => !license.allowedActions.includes(actionType)
    );

    if (unlicensedAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          `The licensed app-under-test scope grants action(s) not allowed by the session: ${unlicensedAppPermissions.join(", ")}.`
        )
      );
    }

    const forbiddenAppPermissions = appScope.allowedActions.filter((actionType) =>
      license.forbiddenActions.includes(actionType)
    );

    if (forbiddenAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "forbidden_action",
          license.sessionId,
          `The licensed app-under-test scope grants action(s) forbidden by the session: ${forbiddenAppPermissions.join(", ")}.`
        )
      );
    }

    if (appScopeStops.length > 0) {
      return result(
        "block",
        appScopeStops.map((condition) => condition.reason),
        [...auditTags, "licensed_app_scope_invalid"],
        appScopeStops,
        [
          "The session was not started.",
          "No desktop observation, mouse movement, click, typing, or OS mutation occurred."
        ]
      );
    }
  }

  return result(
    "allow",
    ["The user granted a bounded desktop interaction session license."],
    [
      ...auditTags,
      "session_license_active",
      ...(license.licensedAppScope === undefined ? [] : ["licensed_app_scope_declared"])
    ]
  );
}

export function evaluateSessionActionPolicy(
  license: DesktopInteractionSessionLicense,
  action: DesktopActionPacket,
  context: DesktopSessionActionPolicyContext
): DesktopSessionPolicyResult {
  const sessionStart = evaluateSessionStartPolicy(license);
  const auditTags = ["desktop_interaction_session", action.actionType];

  if (sessionStart.decision !== "allow") {
    return {
      ...sessionStart,
      auditTags: [...sessionStart.auditTags, "session_not_licensed"]
    };
  }

  if (action.sessionId !== license.sessionId) {
    const stop = stopCondition(
      "invalid_session",
      license.sessionId,
      "Action session id does not match the active session license.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "session_mismatch"], [stop]);
  }

  if (hardBlockedActionTypes.has(action.actionType)) {
    const stop = stopCondition(
      "blocked_high_risk_action",
      license.sessionId,
      `${action.actionType} is blocked even inside a desktop interaction session.`,
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "blocked_high_risk_action"], [stop]);
  }

  if (license.forbiddenActions.includes(action.actionType)) {
    const stop = stopCondition(
      "forbidden_action",
      license.sessionId,
      `${action.actionType} is explicitly forbidden by the session license.`,
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "forbidden_action"], [stop]);
  }

  if (isExpired(license, context.now)) {
    const stop = stopCondition(
      "session_expired",
      license.sessionId,
      "The desktop interaction session duration limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "session_expired"], [stop]);
  }

  if (context.actionCountSoFar >= license.riskLimits.maxActionCount) {
    const stop = stopCondition(
      "max_action_count_reached",
      license.sessionId,
      "The desktop interaction session action-count limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "max_action_count_reached"], [stop]);
  }

  if (context.repairAttemptCount > license.riskLimits.maxConsecutiveRepairAttempts) {
    const stop = stopCondition(
      "max_repair_attempts_reached",
      license.sessionId,
      "The desktop interaction session repair-attempt limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "max_repair_attempts_reached"], [stop]);
  }

  if (!license.allowedActions.includes(action.actionType)) {
    const stop = stopCondition(
      "action_not_allowed",
      license.sessionId,
      `${action.actionType} is not allowed by the session license.`,
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "action_not_allowed"], [stop]);
  }

  if (appScopedActionTypes.has(action.actionType as DesktopLicensedAppActionType)) {
    const appScopedActionType = action.actionType as DesktopLicensedAppActionType;

    if (license.licensedAppScope === undefined) {
      const stop = stopCondition(
        "licensed_app_scope_required",
        license.sessionId,
        `${action.actionType} requires a declared reversible app-under-test scope.`,
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "licensed_app_scope_required"],
        [stop]
      );
    }

    if (!license.licensedAppScope.allowedActions.includes(appScopedActionType)) {
      const stop = stopCondition(
        "action_not_allowed",
        license.sessionId,
        `${action.actionType} is not allowed by the licensed app-under-test scope.`,
        action.actionId
      );

      return result("escalate", [stop.reason], [...auditTags, "app_scope_action_not_allowed"], [stop]);
    }

    if (!desktopInteractionScopesMatch(license.licensedAppScope.scope, action.targetScope)) {
      const stop = stopCondition(
        "outside_allowed_scope",
        license.sessionId,
        "The requested action target is outside the licensed app-under-test scope.",
        action.actionId
      );

      return result(
        "escalate",
        [stop.reason],
        [...auditTags, "outside_allowed_scope", "outside_licensed_app_scope"],
        [stop]
      );
    }
  }

  if (!isDesktopInteractionScopeAllowed(license, action.targetScope)) {
    const stop = stopCondition(
      "outside_allowed_scope",
      license.sessionId,
      "The requested action target is outside the session's allowed scope.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "outside_allowed_scope"], [stop]);
  }

  if (action.risk.credentialExposure || action.risk.destructive || action.risk.systemChange) {
    const stop = stopCondition(
      "blocked_high_risk_action",
      license.sessionId,
      "The action carries credential, destructive, or system-change risk and is blocked.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "blocked_high_risk_action"], [stop]);
  }

  if (action.risk.externalEffect || action.actionType === "external_publish" || action.actionType === "send_message") {
    const stop = stopCondition(
      "action_not_allowed",
      license.sessionId,
      "External side effects require escalation outside this session license.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "external_effect"], [stop]);
  }

  if (action.risk.recoverability === "low") {
    const stop = stopCondition(
      "low_recoverability",
      license.sessionId,
      "The requested action has low recoverability and requires escalation.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "low_recoverability"], [stop]);
  }

  if (!hasRequiredAuditEvent(action, context.auditEvents)) {
    const stop = stopCondition(
      "missing_audit_event",
      license.sessionId,
      "Every in-session action must have an action_requested audit event before execution.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "missing_audit_event"], [stop]);
  }

  const isStateChangingAction = stateChangingActionTypes.has(action.actionType);

  if (isStateChangingAction && action.preActionObservationId === undefined) {
    const stop = stopCondition(
      "missing_pre_action_observation",
      license.sessionId,
      "Every state-changing in-session action must reference a pre-action observation.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "missing_pre_action_observation"], [stop]);
  }

  if (isStateChangingAction) {
    const preActionObservation = findObservation(
      context.observations,
      action.preActionObservationId
    );

    if (preActionObservation === undefined) {
      const stop = stopCondition(
        "missing_pre_action_observation",
        license.sessionId,
        "The referenced pre-action observation does not exist in the session context.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "missing_pre_action_observation"], [stop]);
    }

    if (preActionObservation.sessionId !== license.sessionId) {
      const stop = stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced pre-action observation belongs to a different session.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "observation_session_mismatch"], [stop]);
    }

    if (!scopeMatches(preActionObservation.targetScope, action.targetScope)) {
      const stop = stopCondition(
        "pre_action_observation_scope_mismatch",
        license.sessionId,
        "The referenced pre-action observation does not match the action target scope.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "pre_action_observation_scope_mismatch"],
        [stop]
      );
    }

    if (!isObservationFresh(license, preActionObservation, action)) {
      const stop = stopCondition(
        "stale_pre_action_observation",
        license.sessionId,
        "The referenced pre-action observation is older than the session observation cadence allows.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "stale_pre_action_observation"], [stop]);
    }

    if (preActionObservation.frames.length === 0) {
      const stop = stopCondition(
        "missing_frame_evidence",
        license.sessionId,
        "The referenced pre-action observation contains no frame evidence.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "missing_frame_evidence"], [stop]);
    }

    if (!observationHasImagePayload(preActionObservation)) {
      const stop = stopCondition(
        "missing_frame_evidence",
        license.sessionId,
        "The referenced pre-action observation contains frame metadata but no screenshot image payload.",
        action.actionId,
        [
          "Relational navigation must be derived from screenshot-bearing frame evidence.",
          "Call desktop_observe with includeImages: true before requesting movement, click, or typing."
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "missing_screenshot_image_payload"],
        [stop]
      );
    }

    const perceptionDigestIssue =
      context.phase === "preflight"
        ? perceptionDigestStopConditionForAction(
            license,
            action,
            preActionObservation,
            context
          )
        : undefined;

    if (perceptionDigestIssue !== undefined) {
      return result(
        "block",
        [perceptionDigestIssue.stop.reason],
        [...auditTags, perceptionDigestIssue.auditTag],
        [perceptionDigestIssue.stop]
      );
    }

    if (
      action.compactRelationalClaim === undefined &&
      action.relationalNavigation === undefined
    ) {
      const stop = stopCondition(
        "missing_relational_navigation",
        license.sessionId,
        "Every state-changing action must include compactRelationalClaim or full relationalNavigation derived from the live pre-action observation.",
        action.actionId,
        [
          "Coordinates may be probe/action endpoints, but they are not evidence that the target is correct.",
          "Provide compactRelationalClaim for the mini-agent path or relationalNavigation for strict/debug clients."
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "missing_relational_navigation"],
        [stop]
      );
    }

    if (
      action.compactRelationalClaim !== undefined &&
      action.compactRelationalClaim.sourceObservationId !== preActionObservation.observationId
    ) {
      const stop = stopCondition(
        "missing_relational_navigation",
        license.sessionId,
        "compactRelationalClaim must be derived from the same live observation referenced by the action.",
        action.actionId,
        [
          `Action preActionObservationId: ${preActionObservation.observationId}.`,
          `Compact claim sourceObservationId: ${action.compactRelationalClaim.sourceObservationId}.`
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "compact_relational_claim_observation_mismatch"],
        [stop]
      );
    }

    if (
      action.compactRelationalClaim !== undefined &&
      action.intendedSemanticTarget !== undefined &&
      !semanticTargetsEquivalent(
        action.compactRelationalClaim.intendedTarget,
        action.intendedSemanticTarget
      )
    ) {
      const stop = stopCondition(
        "missing_relational_navigation",
        license.sessionId,
        "compactRelationalClaim.intendedTarget must match the action intendedSemanticTarget.",
        action.actionId,
        [
          `Action intendedSemanticTarget: ${action.intendedSemanticTarget}.`,
          `Compact claim intendedTarget: ${action.compactRelationalClaim.intendedTarget}.`,
          `Action target canonical: ${semanticTargetCanonicalForm(action.intendedSemanticTarget)}.`,
          `Compact claim target canonical: ${semanticTargetCanonicalForm(action.compactRelationalClaim.intendedTarget)}.`
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "compact_relational_claim_target_mismatch"],
        [stop]
      );
    }

    if (!pointProvenanceAllowedForAction(action)) {
      const stop = stopCondition(
        "invalid_point_provenance",
        license.sessionId,
        invalidPointProvenanceReason(action),
        action.actionId,
        [
          "Raw coordinates are allowed only as probe/action endpoints.",
          "Click requests must be backed by a hover witness, not by coordinate proximity alone."
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "invalid_point_provenance"],
        [stop]
      );
    }

    if (
      action.relationalNavigation !== undefined &&
      action.relationalNavigation.orientation.sourceObservationId !==
        preActionObservation.observationId
    ) {
      const stop = stopCondition(
        "missing_relational_navigation",
        license.sessionId,
        "relationalNavigation must be derived from the same live observation referenced by the action.",
        action.actionId,
        [
          `Action preActionObservationId: ${preActionObservation.observationId}.`,
          `Relational sourceObservationId: ${action.relationalNavigation.orientation.sourceObservationId}.`
        ]
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "relational_navigation_observation_mismatch"],
        [stop]
      );
    }

    if (action.relationalNavigation !== undefined) {
      const frameEvidenceIssues = relationalFrameEvidenceIssues(
        preActionObservation,
        action.relationalNavigation
      );

      if (frameEvidenceIssues.length > 0) {
        const stop = stopCondition(
          "missing_frame_evidence",
          license.sessionId,
          "relationalNavigation must reference screenshot-bearing frame evidence from the live pre-action observation.",
          action.actionId,
          frameEvidenceIssues
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "relational_navigation_frame_evidence_mismatch"],
          [stop]
        );
      }

      if (action.preActionNavigationCheck === undefined) {
        const stop = stopCondition(
          "missing_pre_action_navigation_check",
          license.sessionId,
          "Full relationalNavigation requires a pre-action navigation self-check before provider execution.",
          action.actionId,
          [
            "The self-check must confirm live-observation review, alternative comparison, contradiction review, and readiness to act."
          ]
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "missing_pre_action_navigation_check"],
          [stop]
        );
      }

      if (
        action.preActionNavigationCheck.sourceObservationId !==
        preActionObservation.observationId
      ) {
        const stop = stopCondition(
          "missing_pre_action_navigation_check",
          license.sessionId,
          "The pre-action navigation self-check must reference the same live observation as the action.",
          action.actionId,
          [
            `Action preActionObservationId: ${preActionObservation.observationId}.`,
            `Self-check sourceObservationId: ${action.preActionNavigationCheck.sourceObservationId}.`
          ]
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "pre_action_navigation_check_observation_mismatch"],
          [stop]
        );
      }

      if (action.preActionNavigationCheck.exploratoryAction && action.actionType !== "move_mouse") {
        const stop = stopCondition(
          "insufficient_reasoning_contract",
          license.sessionId,
          "Exploratory ambiguity-resolution actions must use desktop_move_mouse, not click or typing.",
          action.actionId,
          [
            "Click and typing require a non-exploratory relational path.",
            "Use desktop_move_mouse, observe the transition, and submit a semantic landing assessment first."
          ]
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "exploratory_action_requires_move_mouse"],
          [stop]
        );
      }
    }

    if (appScopedActionTypes.has(action.actionType as DesktopLicensedAppActionType)) {
      if (context.boundAppScope === undefined) {
        const stop = stopCondition(
          "app_scope_binding_required",
          license.sessionId,
          `${action.actionType} requires the licensed app-under-test scope to be bound to an observation before execution.`,
          action.actionId
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "app_scope_binding_required"],
          [stop]
        );
      }

      if (
        !isAppScopeBindingFresh(
          license,
          context.boundAppScope,
          context.now
        )
      ) {
        const stop = stopCondition(
          "app_scope_binding_stale",
          license.sessionId,
          "The licensed app-under-test binding is older than the session observation cadence allows.",
          action.actionId
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "app_scope_binding_stale"],
          [stop]
        );
      }

      if (!observationMatchesBoundAppScope(context.boundAppScope, preActionObservation)) {
        const stop = stopCondition(
          "outside_allowed_scope",
          license.sessionId,
          "The referenced pre-action observation does not match the bound app-under-test identity.",
          action.actionId
        );

        return result(
          "escalate",
          [stop.reason],
          [...auditTags, "outside_allowed_scope", "bound_app_scope_mismatch"],
          [stop]
        );
      }
    }

    const workflowStateIssue =
      context.phase === "preflight"
        ? workflowStateClaimStopConditionForAction(
            license,
            action,
            preActionObservation,
            context
          )
        : undefined;

    if (workflowStateIssue !== undefined) {
      return result(
        "block",
        [workflowStateIssue.stop.reason],
        [...auditTags, workflowStateIssue.auditTag],
        [workflowStateIssue.stop]
      );
    }
  }

  const requiresPostActionObservation = isStateChangingAction;

  if (
    context.phase === "completion" &&
    requiresPostActionObservation &&
    action.postActionObservationId === undefined
  ) {
    const stop = stopCondition(
      "missing_post_action_observation",
      license.sessionId,
      postActionObservationReason(action.actionType),
      action.actionId
    );

    return result(
      "block",
      [stop.reason],
      [...auditTags, "missing_post_action_observation"],
      [stop],
      [],
      true
    );
  }

  if (context.phase === "completion" && requiresPostActionObservation) {
    const postActionObservation = findObservation(
      context.observations,
      action.postActionObservationId
    );

    if (postActionObservation === undefined) {
      const stop = stopCondition(
        "missing_post_action_observation",
        license.sessionId,
        "The referenced post-action observation does not exist in the session context.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "missing_post_action_observation"],
        [stop],
        [],
        true
      );
    }

    if (postActionObservation.sessionId !== license.sessionId) {
      const stop = stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced post-action observation belongs to a different session.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "observation_session_mismatch"], [stop]);
    }

    if (!scopeMatches(postActionObservation.targetScope, action.targetScope)) {
      const stop = stopCondition(
        "post_action_observation_scope_mismatch",
        license.sessionId,
        "The referenced post-action observation does not match the action target scope.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "post_action_observation_scope_mismatch"],
        [stop],
        [],
        true
      );
    }
  }

  return result(
    "allow",
    ["The action is licensed by the active desktop interaction session."],
    [...auditTags, "session_action_licensed"],
    [],
    action.residue,
    requiresPostActionObservation
  );
}
