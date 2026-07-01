import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopLicensedAppScopeSchema,
  desktopSessionObservationCadenceSchema,
  desktopSessionRiskLimitsSchema
} from "../policy/sessionLicensePolicy.js";

const nonEmptyStringSchema = z.string().min(1);
const residueSchema = z.array(nonEmptyStringSchema);

export const uiTestSchemaVersion = "admcp-023a" as const;

export const uiTestAllowedProbeKinds = [
  "observe",
  "evaluate_click_candidate"
] as const;

export type UiTestAllowedProbeKind = (typeof uiTestAllowedProbeKinds)[number];

export const uiTestAllowedActionKinds = [
  "move_mouse",
  "click",
  "type_text"
] as const;

export type UiTestAllowedActionKind = (typeof uiTestAllowedActionKinds)[number];

export const uiTestCycleKinds = [
  "observation_only",
  "probe_action",
  "state_changing_action"
] as const;

export type UiTestCycleKind = (typeof uiTestCycleKinds)[number];

export const uiTestCycleDecisions = [
  "continue",
  "repair",
  "ask",
  "partial_landfall",
  "close",
  "stop"
] as const;

export type UiTestCycleDecision = (typeof uiTestCycleDecisions)[number];

export const uiTestChallengePhenomena = [
  "visual_spatial_precision",
  "streaming_interaction",
  "dynamic_environment",
  "proactive_interaction",
  "cross_source_reasoning",
  "implicit_state_inference",
  "multi_item_state_tracking",
  "conflict_disambiguation",
  "tutorial_following",
  "multimodal_editing"
] as const;

export type UiTestChallengePhenomenon =
  (typeof uiTestChallengePhenomena)[number];

export const uiTestWatchedSourceKinds = [
  "active_window",
  "app_panel",
  "file",
  "document",
  "message_channel",
  "user_channel",
  "external_artifact",
  "runtime_artifact"
] as const;

export type UiTestWatchedSourceKind = (typeof uiTestWatchedSourceKinds)[number];

export const uiTestWatchedSourceRecheckPolicies = [
  "before_commit",
  "before_closure",
  "after_transition",
  "on_visible_change",
  "not_applicable"
] as const;

export type UiTestWatchedSourceRecheckPolicy =
  (typeof uiTestWatchedSourceRecheckPolicies)[number];

export const uiTestWatchedSourceStaleBlockKinds = [
  "execute_committed_action",
  "type_text",
  "closure"
] as const;

export type UiTestWatchedSourceStaleBlockKind =
  (typeof uiTestWatchedSourceStaleBlockKinds)[number];

export const uiTestSemanticFreshnessStatuses = [
  "current",
  "stale",
  "unknown",
  "not_applicable"
] as const;

export type UiTestSemanticFreshnessStatus =
  (typeof uiTestSemanticFreshnessStatuses)[number];

export const uiTestEvidenceKinds = [
  "screenshot_reference",
  "visual_artifact_reference",
  "scenario_declared_visual_cue",
  "provider_delta_summary",
  "transition_classification",
  "workflow_postcondition",
  "functional_state_check",
  "frame_hash_delta",
  "cursor_position",
  "local_event_without_lookback",
  "user_answer",
  "external_source_recheck"
] as const;

export type UiTestEvidenceKind = (typeof uiTestEvidenceKinds)[number];

export const uiTestCheckpointStatuses = [
  "not_reached",
  "satisfied",
  "unsatisfied",
  "unresolved",
  "contradicted"
] as const;

export type UiTestCheckpointStatus = (typeof uiTestCheckpointStatuses)[number];

export const uiTestProtectedOutcomeStatuses = [
  "not_started",
  "in_progress",
  "satisfied",
  "partial",
  "unresolved",
  "contradicted"
] as const;

export type UiTestProtectedOutcomeStatus =
  (typeof uiTestProtectedOutcomeStatuses)[number];

export const uiTestRouteLadderLevels = [
  "v0_source_pressure",
  "v1_local_event",
  "v2_route_dynamics",
  "v3_reentry_geometry"
] as const;

export type UiTestRouteLadderLevel =
  (typeof uiTestRouteLadderLevels)[number];

export const uiTestRouteCarrierStatuses = [
  "local_event",
  "candidate_route",
  "carries_with_residual",
  "placeholder_only",
  "carrier_overpromotion_risk"
] as const;

export type UiTestRouteCarrierStatus =
  (typeof uiTestRouteCarrierStatuses)[number];

export const uiTestAskStatuses = [
  "not_needed",
  "ask_required",
  "asked",
  "answered",
  "unresolved"
] as const;

export type UiTestAskStatus = (typeof uiTestAskStatuses)[number];

export const uiTestClosureStatuses = [
  "open",
  "repair",
  "ask",
  "partial_landfall",
  "passed",
  "stopped"
] as const;

export type UiTestClosureStatus = (typeof uiTestClosureStatuses)[number];

export const uiTestTransitionClassificationKinds = [
  "expected_delta",
  "no_op",
  "wrong_target",
  "scope_exit",
  "risk_prompt",
  "uninterpretable_state",
  "repair_needed"
] as const;

export type UiTestTransitionClassificationKind =
  (typeof uiTestTransitionClassificationKinds)[number];

export const uiTestBehaviorLabels = [
  "gui_visual_grounding_issue",
  "target_string_drift",
  "stale_memory_carryover",
  "repair_digest_reused_as_clean",
  "missing_workflow_postcondition_status",
  "workflow_precondition_missing",
  "watched_source_stale",
  "premature_closure_attempt",
  "coordinate_only_success_claim",
  "frame_hash_only_success_claim",
  "scope_drift",
  "ask_needed"
] as const;

export type UiTestBehaviorLabel = (typeof uiTestBehaviorLabels)[number];

export const uiTestSideEffectKinds = [
  "credential_exposure",
  "destructive_file_operation",
  "system_change",
  "external_publish",
  "payment_or_purchase",
  "send_message",
  "scope_exit",
  "raw_typed_text_retained",
  "unbounded_desktop_control"
] as const;

export type UiTestSideEffectKind = (typeof uiTestSideEffectKinds)[number];

export const uiTestSideEffectStatuses = [
  "none",
  "blocked",
  "suspected",
  "observed"
] as const;

export type UiTestSideEffectStatus =
  (typeof uiTestSideEffectStatuses)[number];

export const uiTestObservationReferenceSchema = z
  .object({
    observationId: nonEmptyStringSchema,
    observedAt: nonEmptyStringSchema.optional(),
    targetScope: desktopInteractionScopeSchema.optional(),
    hasScreenshot: z.boolean(),
    frameHashes: z.array(nonEmptyStringSchema).default([]),
    visualArtifactPaths: z.array(nonEmptyStringSchema).default([]),
    residue: residueSchema.default([])
  })
  .superRefine((observation, context) => {
    if (observation.hasScreenshot && observation.frameHashes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "screenshot-bearing observations must include frame hashes.",
        path: ["frameHashes"]
      });
    }
  });

export type UiTestObservationReference = z.infer<
  typeof uiTestObservationReferenceSchema
>;

export const uiTestEvidenceReferenceSchema = z.object({
  evidenceId: nonEmptyStringSchema.optional(),
  evidenceKind: z.enum(uiTestEvidenceKinds),
  observationId: nonEmptyStringSchema.optional(),
  transitionActionId: nonEmptyStringSchema.optional(),
  sourceKey: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema,
  strength: z.enum(["insufficient_alone", "supporting", "sufficient_when_declared"]),
  residue: residueSchema.default([])
});

export type UiTestEvidenceReference = z.infer<
  typeof uiTestEvidenceReferenceSchema
>;

export const uiTestProtectedOutcomeCheckpointSchema = z
  .object({
    checkpointId: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    requiredForPass: z.boolean(),
    criticalBlocker: z.boolean().default(false),
    acceptableEvidence: z.array(z.enum(uiTestEvidenceKinds)).min(1),
    insufficientEvidence: z.array(z.enum(uiTestEvidenceKinds)).default([
      "frame_hash_delta",
      "cursor_position",
      "local_event_without_lookback"
    ]),
    frameHashEvidenceSufficient: z.boolean().default(false),
    partialCreditWeight: z.number().finite().min(0).max(1).default(0)
  })
  .superRefine((checkpoint, context) => {
    const onlyFrameHashEvidence =
      checkpoint.acceptableEvidence.length > 0 &&
      checkpoint.acceptableEvidence.every(
        (evidenceKind) => evidenceKind === "frame_hash_delta"
      );

    if (onlyFrameHashEvidence && !checkpoint.frameHashEvidenceSufficient) {
      context.addIssue({
        code: "custom",
        message:
          "frame_hash_delta cannot be the only acceptable evidence unless frameHashEvidenceSufficient is true.",
        path: ["acceptableEvidence"]
      });
    }
  });

export type UiTestProtectedOutcomeCheckpoint = z.infer<
  typeof uiTestProtectedOutcomeCheckpointSchema
>;

export const uiTestProtectedOutcomeSchema = z.object({
  outcomeId: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
  checkpoints: z.array(uiTestProtectedOutcomeCheckpointSchema).min(1)
});

export type UiTestProtectedOutcome = z.infer<
  typeof uiTestProtectedOutcomeSchema
>;

export const uiTestWatchedSourceSchema = z
  .object({
    sourceKey: nonEmptyStringSchema,
    sourceKind: z.enum(uiTestWatchedSourceKinds),
    description: nonEmptyStringSchema,
    authoritativeFor: z.array(nonEmptyStringSchema).min(1),
    recheckPolicy: z.enum(uiTestWatchedSourceRecheckPolicies),
    semanticFreshnessWindowMs: z.number().int().positive().optional(),
    staleBlocks: z
      .array(z.enum(uiTestWatchedSourceStaleBlockKinds))
      .default(["closure"])
  })
  .superRefine((source, context) => {
    if (
      source.recheckPolicy !== "not_applicable" &&
      source.semanticFreshnessWindowMs === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "semanticFreshnessWindowMs is required when a watched source has a recheck policy.",
        path: ["semanticFreshnessWindowMs"]
      });
    }
  });

export type UiTestWatchedSource = z.infer<typeof uiTestWatchedSourceSchema>;

export const uiTestCanonicalTargetSchema = z.object({
  targetKey: nonEmptyStringSchema,
  canonicalIntendedTarget: nonEmptyStringSchema,
  description: nonEmptyStringSchema,
  targetScope: desktopInteractionScopeSchema.optional(),
  surfaceLabelHints: z.array(nonEmptyStringSchema).min(1),
  forbiddenAliases: z.array(nonEmptyStringSchema).default([]),
  workflowTargetInheritance: z
    .enum(["inherit_digest_target_when_omitted", "explicit_target_required"])
    .default("inherit_digest_target_when_omitted"),
  retargetingPolicy: z
    .enum(["new_target_track_required", "same_target_only"])
    .default("new_target_track_required")
});

export type UiTestCanonicalTarget = z.infer<
  typeof uiTestCanonicalTargetSchema
>;

export const uiTestSessionLicenseContractSchema = z.object({
  userConfirmed: z.literal(true),
  visibleContentAcknowledged: z.literal(true),
  reversibleAppUnderTestDeclared: z.literal(true),
  appUnderTestScope: desktopLicensedAppScopeSchema,
  allowedProbes: z.array(z.enum(uiTestAllowedProbeKinds)).min(1),
  allowedActions: z.array(z.enum(uiTestAllowedActionKinds)).min(1),
  forbiddenBoundaries: z.array(nonEmptyStringSchema).min(1),
  riskLimits: desktopSessionRiskLimitsSchema,
  observationCadence: desktopSessionObservationCadenceSchema
});

export type UiTestSessionLicenseContract = z.infer<
  typeof uiTestSessionLicenseContractSchema
>;

export const uiTestClosurePolicySchema = z.object({
  passRequiresAllRequiredCheckpoints: z.literal(true),
  passRequiresNoOpenAsk: z.literal(true),
  passRequiresFreshAuthoritativeWatchedSources: z.literal(true),
  passRequiresLandfallReentryGeometry: z.literal(true),
  partialLandfallAllowed: z.boolean()
});

export type UiTestClosurePolicy = z.infer<typeof uiTestClosurePolicySchema>;

export const uiTestScenarioProvenanceSchema = z.object({
  author: nonEmptyStringSchema.optional(),
  scenarioSource: nonEmptyStringSchema.optional(),
  scenarioContractHash: nonEmptyStringSchema.optional(),
  externalBenchmarkName: nonEmptyStringSchema.optional(),
  externalBenchmarkVersion: nonEmptyStringSchema.optional(),
  gatedEvaluatorOrAnswerIncluded: z.literal(false).default(false)
});

export type UiTestScenarioProvenance = z.infer<
  typeof uiTestScenarioProvenanceSchema
>;

export const uiTestScenarioContractSchema = z
  .object({
    schemaVersion: z.literal(uiTestSchemaVersion),
    scenarioId: nonEmptyStringSchema,
    scenarioRevision: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    userGoal: nonEmptyStringSchema,
    sessionLicense: uiTestSessionLicenseContractSchema,
    challengePhenomena: z.array(z.enum(uiTestChallengePhenomena)).min(1),
    watchedSources: z.array(uiTestWatchedSourceSchema).default([]),
    protectedOutcome: uiTestProtectedOutcomeSchema,
    canonicalTargets: z.array(uiTestCanonicalTargetSchema).min(1),
    closurePolicy: uiTestClosurePolicySchema,
    provenance: uiTestScenarioProvenanceSchema.default({
      gatedEvaluatorOrAnswerIncluded: false
    }),
    residue: residueSchema.default([])
  })
  .superRefine((contract, context) => {
    addDuplicateIssues(
      contract.canonicalTargets.map((target) => target.targetKey),
      context,
      ["canonicalTargets"],
      "canonical target keys must be unique."
    );
    addDuplicateIssues(
      contract.protectedOutcome.checkpoints.map((checkpoint) => checkpoint.checkpointId),
      context,
      ["protectedOutcome", "checkpoints"],
      "protected outcome checkpoint ids must be unique."
    );
    addDuplicateIssues(
      contract.watchedSources.map((source) => source.sourceKey),
      context,
      ["watchedSources"],
      "watched source keys must be unique."
    );

    if (
      contract.challengePhenomena.includes("dynamic_environment") &&
      contract.watchedSources.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "dynamic_environment scenarios must declare watched sources for semantic freshness checks.",
        path: ["watchedSources"]
      });
    }

    if (
      contract.challengePhenomena.includes("proactive_interaction") &&
      contract.sessionLicense.riskLimits.maxConsecutiveRepairAttempts === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "proactive_interaction scenarios need a nonzero repair/ask budget instead of forced guessing.",
        path: ["sessionLicense", "riskLimits", "maxConsecutiveRepairAttempts"]
      });
    }
  });

export type UiTestScenarioContract = z.infer<
  typeof uiTestScenarioContractSchema
>;

export const uiTestCheckpointStateSchema = z.object({
  checkpointId: nonEmptyStringSchema,
  status: z.enum(uiTestCheckpointStatuses),
  evidence: z.array(uiTestEvidenceReferenceSchema).default([]),
  residue: residueSchema.default([])
});

export type UiTestCheckpointState = z.infer<typeof uiTestCheckpointStateSchema>;

export const uiTestWatchedSourceStateSchema = z.object({
  sourceKey: nonEmptyStringSchema,
  semanticFreshness: z.enum(uiTestSemanticFreshnessStatuses),
  lastCheckedAt: nonEmptyStringSchema.optional(),
  lastObservationId: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  residue: residueSchema.default([])
});

export type UiTestWatchedSourceState = z.infer<
  typeof uiTestWatchedSourceStateSchema
>;

export const uiTestAskStateSchema = z.object({
  status: z.enum(uiTestAskStatuses),
  question: nonEmptyStringSchema.optional(),
  whyNecessary: nonEmptyStringSchema.optional(),
  answerSource: nonEmptyStringSchema.optional(),
  answerSummary: nonEmptyStringSchema.optional(),
  invalidatedCarrierFields: z.array(nonEmptyStringSchema).default([]),
  revalidatedCarrierFields: z.array(nonEmptyStringSchema).default([]),
  residue: residueSchema.default([])
});

export type UiTestAskState = z.infer<typeof uiTestAskStateSchema>;

export const uiTestRouteCarrierStateSchema = z.object({
  ladderLevel: z.enum(uiTestRouteLadderLevels),
  status: z.enum(uiTestRouteCarrierStatuses),
  protectedObservables: z.array(nonEmptyStringSchema).default([]),
  satisfiedObservables: z.array(nonEmptyStringSchema).default([]),
  unsatisfiedResidue: residueSchema.default([]),
  reentryGeometry: z
    .object({
      entryObservationId: nonEmptyStringSchema,
      finalObservationId: nonEmptyStringSchema,
      reentryNotes: nonEmptyStringSchema,
      recoverable: z.boolean()
    })
    .optional(),
  residue: residueSchema.default([])
});

export type UiTestRouteCarrierState = z.infer<
  typeof uiTestRouteCarrierStateSchema
>;

export const uiTestRunCarrierSchema = z
  .object({
    schemaVersion: z.literal(uiTestSchemaVersion),
    carrierId: nonEmptyStringSchema,
    scenarioId: nonEmptyStringSchema,
    scenarioRevision: nonEmptyStringSchema,
    admcpServer: z.object({
      serverVersion: nonEmptyStringSchema.optional(),
      capabilitiesSnapshotHash: nonEmptyStringSchema.optional()
    }),
    session: z.object({
      sessionId: nonEmptyStringSchema,
      appScopeBindingId: nonEmptyStringSchema.optional(),
      licenseStartedAt: nonEmptyStringSchema.optional(),
      licenseExpiresAt: nonEmptyStringSchema.optional()
    }),
    current: z.object({
      targetKey: nonEmptyStringSchema.optional(),
      canonicalIntendedTarget: nonEmptyStringSchema.optional(),
      targetScope: desktopInteractionScopeSchema.optional(),
      observationId: nonEmptyStringSchema.optional(),
      perceptionDigestId: nonEmptyStringSchema.optional(),
      workflowStateClaimId: nonEmptyStringSchema.optional(),
      transitionActionId: nonEmptyStringSchema.optional(),
      hoverTargetWitnessId: nonEmptyStringSchema.optional(),
      repairExitRequired: z.boolean().default(false)
    }),
    targetRegistry: z.array(uiTestCanonicalTargetSchema).default([]),
    cycleIds: z.array(nonEmptyStringSchema).default([]),
    transitionActionIds: z.array(nonEmptyStringSchema).default([]),
    challengePhenomenaStatus: z
      .array(
        z.object({
          phenomenon: z.enum(uiTestChallengePhenomena),
          status: z.enum(["not_reached", "active", "handled", "blocked", "untested"]),
          residue: residueSchema.default([])
        })
      )
      .default([]),
    protectedOutcomeStatus: z.object({
      outcomeId: nonEmptyStringSchema,
      status: z.enum(uiTestProtectedOutcomeStatuses),
      summary: nonEmptyStringSchema,
      residue: residueSchema.default([])
    }),
    checkpointStatus: z.array(uiTestCheckpointStateSchema).default([]),
    watchedSourceStatus: z.array(uiTestWatchedSourceStateSchema).default([]),
    askState: uiTestAskStateSchema.default({
      status: "not_needed",
      invalidatedCarrierFields: [],
      revalidatedCarrierFields: [],
      residue: []
    }),
    routeCarrier: uiTestRouteCarrierStateSchema,
    behaviorLabels: z.array(z.enum(uiTestBehaviorLabels)).default([]),
    residue: residueSchema.default([]),
    closure: z.object({
      status: z.enum(uiTestClosureStatuses),
      requestedAt: nonEmptyStringSchema.optional(),
      summary: nonEmptyStringSchema.optional(),
      residue: residueSchema.default([])
    })
  })
  .superRefine((carrier, context) => {
    addDuplicateIssues(
      carrier.targetRegistry.map((target) => target.targetKey),
      context,
      ["targetRegistry"],
      "carrier target registry keys must be unique."
    );
    addDuplicateIssues(
      carrier.checkpointStatus.map((checkpoint) => checkpoint.checkpointId),
      context,
      ["checkpointStatus"],
      "carrier checkpoint state ids must be unique."
    );
    addDuplicateIssues(
      carrier.watchedSourceStatus.map((source) => source.sourceKey),
      context,
      ["watchedSourceStatus"],
      "carrier watched source state keys must be unique."
    );
  });

export type UiTestRunCarrier = z.infer<typeof uiTestRunCarrierSchema>;

export const uiTestTransitionClassificationSchema = z.object({
  kind: z.enum(uiTestTransitionClassificationKinds),
  confidence: z.enum(["low", "medium", "high"]),
  summary: nonEmptyStringSchema,
  evidence: z.array(uiTestEvidenceReferenceSchema).default([]),
  residue: residueSchema.default([])
});

export type UiTestTransitionClassification = z.infer<
  typeof uiTestTransitionClassificationSchema
>;

export const uiTestActionReferenceSchema = z.object({
  tool: z.enum([
    ...uiTestAllowedProbeKinds,
    ...uiTestAllowedActionKinds
  ]),
  actionId: nonEmptyStringSchema.optional(),
  intendedTargetKey: nonEmptyStringSchema.optional(),
  canonicalIntendedTarget: nonEmptyStringSchema.optional(),
  requestAssembledFromCarrier: z.boolean(),
  evidenceIds: z
    .object({
      perceptionDigestId: nonEmptyStringSchema.optional(),
      workflowStateClaimId: nonEmptyStringSchema.optional(),
      transitionActionId: nonEmptyStringSchema.optional(),
      hoverTargetWitnessId: nonEmptyStringSchema.optional()
    })
    .default({})
});

export type UiTestActionReference = z.infer<typeof uiTestActionReferenceSchema>;

export const uiTestCyclePacketSchema = z
  .object({
    schemaVersion: z.literal(uiTestSchemaVersion),
    cycleId: nonEmptyStringSchema,
    scenarioId: nonEmptyStringSchema,
    carrierId: nonEmptyStringSchema,
    cycleIndex: z.number().int().nonnegative(),
    cycleKind: z.enum(uiTestCycleKinds),
    pressure: nonEmptyStringSchema,
    activeCut: nonEmptyStringSchema,
    currentObservation: uiTestObservationReferenceSchema.optional(),
    beforeObservation: uiTestObservationReferenceSchema.optional(),
    action: uiTestActionReferenceSchema.optional(),
    afterObservation: uiTestObservationReferenceSchema.optional(),
    transitionClassification: uiTestTransitionClassificationSchema.optional(),
    carrierUpdate: z
      .object({
        updatedFields: z.array(nonEmptyStringSchema).default([]),
        invalidatedFields: z.array(nonEmptyStringSchema).default([]),
        residueAdded: residueSchema.default([])
      })
      .optional(),
    residue: residueSchema.default([]),
    nextReentryPressure: nonEmptyStringSchema,
    decision: z.enum(uiTestCycleDecisions)
  })
  .superRefine((cycle, context) => {
    if (cycle.cycleKind === "observation_only") {
      if (cycle.currentObservation === undefined) {
        context.addIssue({
          code: "custom",
          message: "observation_only cycles require currentObservation.",
          path: ["currentObservation"]
        });
      }

      if (cycle.action !== undefined) {
        context.addIssue({
          code: "custom",
          message: "observation_only cycles must not include an action.",
          path: ["action"]
        });
      }

      if (cycle.transitionClassification !== undefined) {
        context.addIssue({
          code: "custom",
          message:
            "observation_only cycles must not include transitionClassification.",
          path: ["transitionClassification"]
        });
      }
    }

    if (cycle.cycleKind === "probe_action") {
      if (cycle.currentObservation === undefined) {
        context.addIssue({
          code: "custom",
          message: "probe_action cycles require currentObservation.",
          path: ["currentObservation"]
        });
      }

      if (cycle.action === undefined) {
        context.addIssue({
          code: "custom",
          message: "probe_action cycles require an action reference.",
          path: ["action"]
        });
      } else if (cycle.action.tool !== "evaluate_click_candidate") {
        context.addIssue({
          code: "custom",
          message:
            "probe_action cycles currently support evaluate_click_candidate only.",
          path: ["action", "tool"]
        });
      }

      if (cycle.afterObservation !== undefined) {
        context.addIssue({
          code: "custom",
          message: "probe_action cycles must not include afterObservation.",
          path: ["afterObservation"]
        });
      }
    }

    if (cycle.cycleKind === "state_changing_action") {
      if (cycle.beforeObservation === undefined) {
        context.addIssue({
          code: "custom",
          message: "state_changing_action cycles require beforeObservation.",
          path: ["beforeObservation"]
        });
      }

      if (cycle.action === undefined) {
        context.addIssue({
          code: "custom",
          message: "state_changing_action cycles require an action reference.",
          path: ["action"]
        });
      } else if (
        cycle.action.tool !== "move_mouse" &&
        cycle.action.tool !== "click" &&
        cycle.action.tool !== "type_text"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "state_changing_action cycles require move_mouse, click, or type_text.",
          path: ["action", "tool"]
        });
      } else if (cycle.action.actionId === undefined) {
        context.addIssue({
          code: "custom",
          message: "state-changing action references require actionId.",
          path: ["action", "actionId"]
        });
      }

      if (cycle.afterObservation === undefined) {
        context.addIssue({
          code: "custom",
          message: "state_changing_action cycles require afterObservation.",
          path: ["afterObservation"]
        });
      }

      if (cycle.transitionClassification === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "state_changing_action cycles require transitionClassification.",
          path: ["transitionClassification"]
        });
      }
    }
  });

export type UiTestCyclePacket = z.infer<typeof uiTestCyclePacketSchema>;

export const uiTestSideEffectReportSchema = z.object({
  sideEffectKind: z.enum(uiTestSideEffectKinds),
  status: z.enum(uiTestSideEffectStatuses),
  summary: nonEmptyStringSchema,
  evidence: z.array(uiTestEvidenceReferenceSchema).default([]),
  residue: residueSchema.default([])
});

export type UiTestSideEffectReport = z.infer<
  typeof uiTestSideEffectReportSchema
>;

export const uiTestSafetyReportSchema = z.object({
  schemaVersion: z.literal(uiTestSchemaVersion),
  reportId: nonEmptyStringSchema,
  scenarioId: nonEmptyStringSchema,
  carrierId: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  providerMutationGates: z.object({
    realMouseMovementEnabled: z.boolean(),
    realClickEnabled: z.boolean(),
    realTypingEnabled: z.boolean()
  }),
  secretsOrRawTypedTextStored: z.literal(false),
  screenshotsPersisted: z.boolean(),
  sideEffects: z.array(uiTestSideEffectReportSchema).default([]),
  forbiddenBoundaryHits: z.array(nonEmptyStringSchema).default([]),
  scopeExitObserved: z.boolean().default(false),
  riskPromptObserved: z.boolean().default(false),
  externalEffectObserved: z.boolean().default(false),
  destructiveEffectObserved: z.boolean().default(false),
  credentialExposureObserved: z.boolean().default(false),
  residue: residueSchema.default([])
});

export type UiTestSafetyReport = z.infer<typeof uiTestSafetyReportSchema>;

export const uiTestClosureGateResultSchema = z.object({
  requestedClosureStatus: z.enum(uiTestClosureStatuses),
  allowed: z.boolean(),
  reasons: z.array(nonEmptyStringSchema),
  residue: residueSchema,
  blockingCheckpointIds: z.array(nonEmptyStringSchema),
  staleWatchedSourceKeys: z.array(nonEmptyStringSchema),
  activeSideEffects: z.array(z.enum(uiTestSideEffectKinds))
});

export type UiTestClosureGateResult = z.infer<
  typeof uiTestClosureGateResultSchema
>;

export const uiTestLandfallReentryPacketSchema = z.object({
  schemaVersion: z.literal(uiTestSchemaVersion),
  packetId: nonEmptyStringSchema,
  scenarioId: nonEmptyStringSchema,
  carrierId: nonEmptyStringSchema,
  closureGate: uiTestClosureGateResultSchema,
  protectedObservables: z.array(nonEmptyStringSchema),
  satisfiedObservables: z.array(nonEmptyStringSchema),
  unsatisfiedResidue: residueSchema,
  finalObservation: uiTestObservationReferenceSchema.optional(),
  auditEventCount: z.number().int().nonnegative(),
  stopConditions: z.array(nonEmptyStringSchema).default([]),
  reentryNotes: nonEmptyStringSchema,
  replayArtifactRefs: z.array(nonEmptyStringSchema).default([])
});

export type UiTestLandfallReentryPacket = z.infer<
  typeof uiTestLandfallReentryPacketSchema
>;

export interface UiTestScenarioGuardDefaults {
  requiresPreActionRevalidation: boolean;
  requiresWatchedSources: boolean;
  requiresSemanticFreshnessBeforeClosure: boolean;
  askIsFirstClassOutcome: boolean;
  frameHashOnlyInsufficientByDefault: boolean;
}

export function uiTestScenarioGuardDefaults(
  contractInput: UiTestScenarioContract
): UiTestScenarioGuardDefaults {
  const contract = uiTestScenarioContractSchema.parse(contractInput);
  const challengeSet = new Set(contract.challengePhenomena);
  const sourceSensitivePhenomena: UiTestChallengePhenomenon[] = [
    "dynamic_environment",
    "cross_source_reasoning",
    "implicit_state_inference",
    "multi_item_state_tracking",
    "conflict_disambiguation"
  ];
  const sourceSensitive = sourceSensitivePhenomena.some((phenomenon) =>
    challengeSet.has(phenomenon)
  );

  return {
    requiresPreActionRevalidation:
      challengeSet.has("streaming_interaction") ||
      challengeSet.has("visual_spatial_precision"),
    requiresWatchedSources: sourceSensitive,
    requiresSemanticFreshnessBeforeClosure: sourceSensitive,
    askIsFirstClassOutcome:
      challengeSet.has("proactive_interaction") ||
      challengeSet.has("conflict_disambiguation"),
    frameHashOnlyInsufficientByDefault: true
  };
}

export interface EvaluateUiTestClosureInput {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  requestedClosureStatus: UiTestClosureStatus;
  safetyReport?: UiTestSafetyReport;
}

export function evaluateUiTestClosure(
  input: EvaluateUiTestClosureInput
): UiTestClosureGateResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const safetyReport =
    input.safetyReport === undefined
      ? undefined
      : uiTestSafetyReportSchema.parse(input.safetyReport);
  const reasons: string[] = [];
  const residue: string[] = [];
  const blockingCheckpointIds: string[] = [];
  const staleWatchedSourceKeys: string[] = [];
  const activeSideEffects = activeSafetySideEffects(safetyReport);
  const requestedClosureStatus = input.requestedClosureStatus;

  if (requestedClosureStatus === "passed") {
    const requiredCheckpointIds = scenario.protectedOutcome.checkpoints
      .filter((checkpoint) => checkpoint.requiredForPass)
      .map((checkpoint) => checkpoint.checkpointId);

    for (const checkpointId of requiredCheckpointIds) {
      const checkpointState = carrier.checkpointStatus.find(
        (state) => state.checkpointId === checkpointId
      );

      if (checkpointState?.status !== "satisfied") {
        blockingCheckpointIds.push(checkpointId);
      }
    }

    if (blockingCheckpointIds.length > 0) {
      reasons.push("required protected outcome checkpoints are not satisfied");
      residue.push(
        `Blocking checkpoint ids: ${blockingCheckpointIds.join(", ")}.`
      );
    }

    if (scenario.closurePolicy.passRequiresFreshAuthoritativeWatchedSources) {
      for (const source of scenario.watchedSources) {
        if (!source.staleBlocks.includes("closure")) {
          continue;
        }

        const sourceState = carrier.watchedSourceStatus.find(
          (state) => state.sourceKey === source.sourceKey
        );

        if (
          sourceState === undefined ||
          sourceState.semanticFreshness === "stale" ||
          sourceState.semanticFreshness === "unknown"
        ) {
          staleWatchedSourceKeys.push(source.sourceKey);
        }
      }

      if (staleWatchedSourceKeys.length > 0) {
        reasons.push("authoritative watched sources are stale or unknown");
        residue.push(
          `Stale or unchecked source keys: ${staleWatchedSourceKeys.join(", ")}.`
        );
      }
    }

    if (
      scenario.closurePolicy.passRequiresNoOpenAsk &&
      (carrier.askState.status === "ask_required" ||
        carrier.askState.status === "unresolved")
    ) {
      reasons.push("ask-required state is still open");
      residue.push("A required ask must be answered or residualized before pass closure.");
    }

    if (
      scenario.closurePolicy.passRequiresLandfallReentryGeometry &&
      carrier.routeCarrier.ladderLevel !== "v3_reentry_geometry"
    ) {
      reasons.push("landfall/re-entry geometry is not established");
      residue.push(
        `Current route ladder level is ${carrier.routeCarrier.ladderLevel}.`
      );
    }
  } else if (requestedClosureStatus === "partial_landfall") {
    if (!scenario.closurePolicy.partialLandfallAllowed) {
      reasons.push("partial landfall is not allowed by the scenario closure policy");
    }

    if (carrier.residue.length === 0 && carrier.routeCarrier.unsatisfiedResidue.length === 0) {
      reasons.push("partial landfall requires explicit carried residue");
    }
  }

  if (activeSideEffects.length > 0) {
    reasons.push("active safety side effects block closure");
    residue.push(`Active side effects: ${activeSideEffects.join(", ")}.`);
  }

  const allowed = reasons.length === 0;

  return uiTestClosureGateResultSchema.parse({
    requestedClosureStatus,
    allowed,
    reasons: allowed ? ["closure status is allowed by the carrier gate"] : reasons,
    residue,
    blockingCheckpointIds,
    staleWatchedSourceKeys,
    activeSideEffects
  });
}

function activeSafetySideEffects(
  safetyReport: UiTestSafetyReport | undefined
): UiTestSideEffectKind[] {
  if (safetyReport === undefined) {
    return [];
  }

  const activeFromReports = safetyReport.sideEffects
    .filter(
      (sideEffect) =>
        sideEffect.status === "suspected" || sideEffect.status === "observed"
    )
    .map((sideEffect) => sideEffect.sideEffectKind);
  const activeFromFlags: UiTestSideEffectKind[] = [];

  if (safetyReport.scopeExitObserved) {
    activeFromFlags.push("scope_exit");
  }
  if (safetyReport.externalEffectObserved) {
    activeFromFlags.push("external_publish");
  }
  if (safetyReport.destructiveEffectObserved) {
    activeFromFlags.push("destructive_file_operation");
  }
  if (safetyReport.credentialExposureObserved) {
    activeFromFlags.push("credential_exposure");
  }

  return [...new Set([...activeFromReports, ...activeFromFlags])];
}

function addDuplicateIssues(
  values: string[],
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string
): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message,
        path
      });
      return;
    }

    seen.add(value);
  }
}
