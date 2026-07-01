import { describe, expect, it } from "vitest";
import {
  type UiTestRunCarrier,
  type UiTestScenarioContract,
  type UiTestTransitionClassification,
  uiTestScenarioContractSchema,
  uiTestSchemaVersion
} from "../src/session/uiTestCarrierSchemas.js";
import {
  answerUiTestAsk,
  applyUiTestCheckpointStatus,
  applyUiTestClosureDecision,
  applyUiTestEvidencePhase,
  applyUiTestInteractionEvidenceIds,
  applyUiTestRouteCarrierTransition,
  applyUiTestTargetTrack,
  deriveUiTestProtectedOutcomeStatus,
  evaluateUiTestTargetTrack,
  evaluateUiTestWatchedSourceFreshness,
  refreshUiTestWatchedSource,
  requireUiTestAsk
} from "../src/session/uiTestCarrierUpdates.js";

function scenarioFixture(
  overrides: Partial<UiTestScenarioContract> = {}
): UiTestScenarioContract {
  return uiTestScenarioContractSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "scenario-carrier-updates",
    scenarioRevision: "rev-001",
    title: "Carrier update fixture",
    userGoal: "Verify carrier updates without running desktop actions.",
    sessionLicense: {
      userConfirmed: true,
      visibleContentAcknowledged: true,
      reversibleAppUnderTestDeclared: true,
      appUnderTestScope: {
        description: "Fixture app window.",
        scope: {
          kind: "window_title",
          value: "Fixture App"
        },
        userDeclaredReversible: true,
        allowedActions: ["observe", "move_mouse", "click", "type_text"],
        forbiddenBoundaries: [
          "credential_or_secret_prompt",
          "payment_or_purchase",
          "external_publish_or_deploy",
          "destructive_operation",
          "system_settings",
          "scope_exit"
        ],
        scopeExitStopConditions: ["outside_allowed_scope"]
      },
      allowedProbes: ["observe", "evaluate_click_candidate"],
      allowedActions: ["move_mouse", "click", "type_text"],
      forbiddenBoundaries: [
        "credential_or_secret_prompt",
        "payment_or_purchase",
        "external_publish_or_deploy",
        "destructive_operation",
        "system_settings",
        "scope_exit"
      ],
      riskLimits: {
        maxDurationMs: 3_600_000,
        maxActionCount: 100,
        maxConsecutiveRepairAttempts: 3,
        allowCredentialEntry: false,
        allowDestructiveFileOperations: false,
        allowSystemChanges: false,
        allowExternalPublishing: false
      },
      observationCadence: {
        beforeEveryAction: true,
        afterEveryStateChangingAction: true,
        maxObservationGapMs: 180_000
      }
    },
    challengePhenomena: ["visual_spatial_precision", "dynamic_environment"],
    watchedSources: [
      {
        sourceKey: "toolbar-selection",
        sourceKind: "app_panel",
        description: "Committed toolbar selection.",
        authoritativeFor: ["selected-tool"],
        recheckPolicy: "before_closure",
        semanticFreshnessWindowMs: 300_000,
        staleBlocks: ["execute_committed_action", "closure"]
      }
    ],
    protectedOutcome: {
      outcomeId: "submit-done",
      description: "Submit reaches done state.",
      checkpoints: [
        {
          checkpointId: "submit-committed",
          description: "Submit is committed.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["workflow_postcondition", "screenshot_reference"],
          insufficientEvidence: ["cursor_position", "frame_hash_delta"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        },
        {
          checkpointId: "done-visible",
          description: "Done state is visible.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["workflow_postcondition", "screenshot_reference"],
          insufficientEvidence: ["cursor_position", "frame_hash_delta"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        }
      ]
    },
    canonicalTargets: [
      {
        targetKey: "submit-button",
        canonicalIntendedTarget: "Submit button",
        description: "Submit control.",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        surfaceLabelHints: ["Submit"],
        forbiddenAliases: ["send"],
        workflowTargetInheritance: "inherit_digest_target_when_omitted",
        retargetingPolicy: "new_target_track_required"
      },
      {
        targetKey: "cancel-button",
        canonicalIntendedTarget: "Cancel button",
        description: "Cancel control.",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        surfaceLabelHints: ["Cancel"],
        forbiddenAliases: ["stop"],
        workflowTargetInheritance: "inherit_digest_target_when_omitted",
        retargetingPolicy: "new_target_track_required"
      }
    ],
    closurePolicy: {
      passRequiresAllRequiredCheckpoints: true,
      passRequiresNoOpenAsk: true,
      passRequiresFreshAuthoritativeWatchedSources: true,
      passRequiresLandfallReentryGeometry: true,
      partialLandfallAllowed: true
    },
    provenance: {
      scenarioSource: "unit-test",
      scenarioContractHash: "hash",
      gatedEvaluatorOrAnswerIncluded: false
    },
    residue: [],
    ...overrides
  });
}

function carrierFixture(overrides: Partial<UiTestRunCarrier> = {}): UiTestRunCarrier {
  const scenario = scenarioFixture();
  const carrier: UiTestRunCarrier = {
    schemaVersion: uiTestSchemaVersion,
    carrierId: "carrier-001",
    scenarioId: scenario.scenarioId,
    scenarioRevision: scenario.scenarioRevision,
    admcpServer: {
      serverVersion: "0.1.0"
    },
    session: {
      sessionId: "session-001"
    },
    current: {
      targetKey: "submit-button",
      canonicalIntendedTarget: "Submit button",
      targetScope: {
        kind: "window_title",
        value: "Fixture App"
      },
      observationId: "obs-001",
      perceptionDigestId: "digest-001",
      workflowStateClaimId: "workflow-001",
      transitionActionId: "move-001",
      hoverTargetWitnessId: "hover-001",
      repairExitRequired: false
    },
    targetRegistry: scenario.canonicalTargets,
    cycleIds: [],
    transitionActionIds: ["move-001"],
    challengePhenomenaStatus: [],
    protectedOutcomeStatus: {
      outcomeId: scenario.protectedOutcome.outcomeId,
      status: "in_progress",
      summary: "Protected outcome is in progress.",
      residue: []
    },
    checkpointStatus: [
      {
        checkpointId: "submit-committed",
        status: "not_reached",
        evidence: [],
        residue: []
      },
      {
        checkpointId: "done-visible",
        status: "not_reached",
        evidence: [],
        residue: []
      }
    ],
    watchedSourceStatus: [
      {
        sourceKey: "toolbar-selection",
        semanticFreshness: "current",
        lastCheckedAt: "2026-06-27T10:00:00.000Z",
        lastObservationId: "obs-001",
        summary: "Toolbar selection is current.",
        residue: []
      }
    ],
    askState: {
      status: "not_needed",
      invalidatedCarrierFields: [],
      revalidatedCarrierFields: [],
      residue: []
    },
    routeCarrier: {
      ladderLevel: "v0_source_pressure",
      status: "placeholder_only",
      protectedObservables: ["Submit committed", "Done visible"],
      satisfiedObservables: [],
      unsatisfiedResidue: [],
      residue: []
    },
    behaviorLabels: [],
    residue: [],
    closure: {
      status: "open",
      residue: []
    }
  };

  return {
    ...carrier,
    ...overrides
  };
}

function classification(
  kind: UiTestTransitionClassification["kind"],
  residue: string[] = []
): UiTestTransitionClassification {
  return {
    kind,
    confidence: "high",
    summary: `Transition classified as ${kind}.`,
    evidence: [
      {
        evidenceKind: "transition_classification",
        summary: `Transition classified as ${kind}.`,
        strength: "supporting",
        residue: []
      }
    ],
    residue
  };
}

describe("ADMCP-023B target and evidence phase updates", () => {
  it("matches canonical targets and blocks same-target retargeting drift", () => {
    const scenario = scenarioFixture();
    const carrier = carrierFixture();

    expect(
      evaluateUiTestTargetTrack({
        scenario,
        carrier,
        intendedTarget: "The Submit control",
        mode: "same_target"
      }).allowed
    ).toBe(true);

    const retarget = evaluateUiTestTargetTrack({
      scenario,
      carrier,
      intendedTarget: "Cancel button",
      mode: "same_target"
    });

    expect(retarget.allowed).toBe(false);
    expect(retarget.status).toBe("new_target_required");
    expect(retarget.behaviorLabels).toContain("target_string_drift");
  });

  it("blocks forbidden aliases and records target-drift residue", () => {
    const result = applyUiTestTargetTrack({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      intendedTarget: "Send button",
      mode: "new_target"
    });

    expect(result.targetCheck.allowed).toBe(false);
    expect(result.targetCheck.status).toBe("forbidden_alias");
    expect(result.carrier.behaviorLabels).toContain("target_string_drift");
  });

  it("carries helper ids forward without the agent restating them from memory", () => {
    const result = applyUiTestInteractionEvidenceIds({
      carrier: carrierFixture(),
      observationId: "obs-002",
      perceptionDigestId: "digest-002",
      workflowStateClaimId: "workflow-002",
      transitionActionId: "move-002",
      hoverTargetWitnessId: "hover-002"
    });

    expect(result.carrier.current.observationId).toBe("obs-002");
    expect(result.carrier.current.perceptionDigestId).toBe("digest-002");
    expect(result.carrier.current.workflowStateClaimId).toBe("workflow-002");
    expect(result.carrier.current.transitionActionId).toBe("move-002");
    expect(result.carrier.current.hoverTargetWitnessId).toBe("hover-002");
    expect(result.carrier.transitionActionIds).toEqual(["move-001", "move-002"]);
  });

  it("requires a clean digest after contradicted repair evidence before normal action", () => {
    const repairResult = applyUiTestEvidencePhase({
      carrier: carrierFixture(),
      mode: "repair_target",
      observationId: "obs-repair",
      perceptionDigestId: "digest-repair",
      targetVisibility: "uncertain",
      continuityWithPriorClaim: "changed",
      contradictionToPriorClaim: "Prior landing selected the wrong row."
    });

    expect(repairResult.carrier.current.repairExitRequired).toBe(true);

    const reusedRepairResult = applyUiTestEvidencePhase({
      carrier: repairResult.carrier,
      mode: "same_target",
      observationId: "obs-still-bad",
      perceptionDigestId: "digest-still-bad",
      targetVisibility: "visible",
      continuityWithPriorClaim: "changed",
      contradictionToPriorClaim: "Still carrying repair contradiction."
    });

    expect(reusedRepairResult.repairExit.allowed).toBe(false);
    expect(reusedRepairResult.carrier.current.repairExitRequired).toBe(true);
    expect(reusedRepairResult.carrier.behaviorLabels).toContain(
      "repair_digest_reused_as_clean"
    );

    const cleanResult = applyUiTestEvidencePhase({
      carrier: reusedRepairResult.carrier,
      mode: "recovered_target",
      observationId: "obs-clean",
      perceptionDigestId: "digest-clean",
      targetVisibility: "visible",
      continuityWithPriorClaim: "consistent",
      contradictionToPriorClaim: null
    });

    expect(cleanResult.repairExit.allowed).toBe(true);
    expect(cleanResult.repairExit.clearsRepairExit).toBe(true);
    expect(cleanResult.carrier.current.repairExitRequired).toBe(false);
  });
});

describe("ADMCP-023B watched-source, ask, checkpoint, and closure updates", () => {
  it("detects stale watched sources by age and refreshes them", () => {
    const scenario = scenarioFixture();
    const carrier = carrierFixture();
    const stale = evaluateUiTestWatchedSourceFreshness({
      scenario,
      carrier,
      blockKind: "closure",
      now: "2026-06-27T10:06:00.001Z"
    });

    expect(stale.blocked).toBe(true);
    expect(stale.staleSourceKeys).toEqual(["toolbar-selection"]);

    const refreshed = refreshUiTestWatchedSource({
      carrier,
      sourceKey: "toolbar-selection",
      semanticFreshness: "current",
      checkedAt: "2026-06-27T10:06:00.001Z",
      observationId: "obs-002",
      summary: "Toolbar selection was rechecked."
    });
    const current = evaluateUiTestWatchedSourceFreshness({
      scenario,
      carrier: refreshed.carrier,
      blockKind: "closure",
      now: "2026-06-27T10:06:01.000Z"
    });

    expect(current.blocked).toBe(false);
  });

  it("opens and answers ask state with explicit invalidation and revalidation fields", () => {
    const ask = requireUiTestAsk({
      carrier: carrierFixture(),
      question: "Which toolbar selection should be used?",
      whyNecessary: "The visual state shows conflicting labels.",
      invalidatedCarrierFields: ["current.targetKey"]
    });

    expect(ask.carrier.askState.status).toBe("ask_required");
    expect(ask.carrier.behaviorLabels).toContain("ask_needed");

    const answered = answerUiTestAsk({
      carrier: ask.carrier,
      answerSource: "user",
      answerSummary: "Use Submit.",
      revalidatedCarrierFields: ["current.targetKey"]
    });

    expect(answered.carrier.askState.status).toBe("answered");
    expect(answered.carrier.askState.revalidatedCarrierFields).toEqual([
      "current.targetKey"
    ]);
  });

  it("updates checkpoint state and derives protected outcome status", () => {
    const scenario = scenarioFixture();
    const firstCheckpoint = applyUiTestCheckpointStatus({
      scenario,
      carrier: carrierFixture(),
      checkpointId: "submit-committed",
      status: "satisfied",
      evidence: [
        {
          evidenceKind: "workflow_postcondition",
          summary: "Submit is committed.",
          strength: "supporting",
          residue: []
        }
      ]
    });

    expect(firstCheckpoint.carrier.protectedOutcomeStatus.status).toBe("partial");

    const secondCheckpoint = applyUiTestCheckpointStatus({
      scenario,
      carrier: firstCheckpoint.carrier,
      checkpointId: "done-visible",
      status: "satisfied"
    });

    expect(secondCheckpoint.carrier.protectedOutcomeStatus.status).toBe(
      "satisfied"
    );

    const contradicted = deriveUiTestProtectedOutcomeStatus(scenario, [
      {
        checkpointId: "submit-committed",
        status: "contradicted",
        evidence: [],
        residue: []
      }
    ]);

    expect(contradicted.status).toBe("contradicted");
  });

  it("blocks premature pass closure and labels it", () => {
    const scenario = scenarioFixture();
    const result = applyUiTestClosureDecision({
      scenario,
      carrier: carrierFixture(),
      requestedClosureStatus: "passed"
    });

    expect(result.gate.allowed).toBe(false);
    expect(result.carrier.closure.status).toBe("open");
    expect(result.carrier.behaviorLabels).toContain("premature_closure_attempt");
  });
});

describe("ADMCP-023B route-carrier updates", () => {
  it("demotes local events without lookback", () => {
    const result = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: classification("expected_delta"),
      hasLookback: false,
      satisfiedObservables: ["Submit highlighted"]
    });

    expect(result.carrier.routeCarrier.ladderLevel).toBe("v1_local_event");
    expect(result.carrier.routeCarrier.status).toBe("local_event");
    expect(result.carrier.routeCarrier.unsatisfiedResidue).toContain(
      "Transition has no lookback observation."
    );
  });

  it("promotes expected-delta lookback to route dynamics but not landfall without re-entry geometry", () => {
    const result = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: classification("expected_delta"),
      hasLookback: true,
      satisfiedObservables: ["Submit committed"],
      unsatisfiedResidue: []
    });

    expect(result.carrier.routeCarrier.ladderLevel).toBe("v2_route_dynamics");
    expect(result.carrier.routeCarrier.status).toBe("candidate_route");
  });

  it("promotes expected-delta lookback with re-entry geometry to landfall", () => {
    const result = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: classification("expected_delta"),
      hasLookback: true,
      satisfiedObservables: ["Submit committed", "Done visible"],
      unsatisfiedResidue: [],
      reentryGeometry: {
        entryObservationId: "obs-001",
        finalObservationId: "obs-003",
        reentryNotes: "Use final artifact to recover done-state geometry.",
        recoverable: true
      }
    });

    expect(result.carrier.routeCarrier.ladderLevel).toBe("v3_reentry_geometry");
    expect(result.carrier.routeCarrier.reentryGeometry?.recoverable).toBe(true);
  });

  it("carries wrong-target residue and behavior labels", () => {
    const result = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: classification("wrong_target", ["Wrong row opened."]),
      hasLookback: true,
      unsatisfiedResidue: ["Expected Submit path was not reached."]
    });

    expect(result.carrier.routeCarrier.ladderLevel).toBe("v2_route_dynamics");
    expect(result.carrier.routeCarrier.unsatisfiedResidue).toContain(
      "Transition classified as wrong_target."
    );
    expect(result.carrier.behaviorLabels).toContain("gui_visual_grounding_issue");
  });
});
