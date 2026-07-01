import { describe, expect, it } from "vitest";
import {
  type UiTestRunCarrier,
  type UiTestSafetyReport,
  type UiTestScenarioContract,
  evaluateUiTestClosure,
  uiTestScenarioContractSchema,
  uiTestSafetyReportSchema,
  uiTestScenarioGuardDefaults,
  uiTestSchemaVersion
} from "../src/session/uiTestCarrierSchemas.js";
import {
  answerUiTestAsk,
  applyUiTestCheckpointStatus,
  applyUiTestClosureDecision,
  applyUiTestRouteCarrierTransition,
  evaluateUiTestWatchedSourceFreshness,
  refreshUiTestWatchedSource,
  requireUiTestAsk
} from "../src/session/uiTestCarrierUpdates.js";
import {
  applyUiTestRunnerInteractionEvidenceResult,
  applyUiTestRunnerObservationResult,
  planUiTestSubmitInteractionEvidence,
  type UiTestRunnerPerceptionEvidenceDraft
} from "../src/session/uiTestRunnerHarness.js";

const appScope = {
  kind: "window_title" as const,
  value: "Pressure Fixture App"
};

const cleanPerception: UiTestRunnerPerceptionEvidenceDraft = {
  currentScene: "Pressure Fixture App main view.",
  currentAnchor: "toolbar row",
  targetVisibility: "visible",
  anchorVisibility: "visible",
  contradictionToPriorClaim: null,
  staleCarryoverReviewed: true,
  currentEvidence: "The latest visual artifact shows the intended target."
};

function scenarioFixture(
  overrides: Partial<UiTestScenarioContract> = {}
): UiTestScenarioContract {
  return uiTestScenarioContractSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "scenario-osworld-inspired-pressure",
    scenarioRevision: "rev-001",
    title: "OSWorld-inspired ADMCP pressure fixture",
    userGoal:
      "Exercise long-horizon computer-use failure modes without running desktop actions.",
    sessionLicense: {
      userConfirmed: true,
      visibleContentAcknowledged: true,
      reversibleAppUnderTestDeclared: true,
      appUnderTestScope: {
        description: "Local reversible pressure fixture app.",
        scope: appScope,
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
        maxObservationGapMs: 180_000,
        evidenceFreshness: {
          preActionObservationMaxAgeMs: 180_000,
          clickCandidateObservationMaxAgeMs: 180_000,
          perceptionDigestMaxAgeMs: 300_000,
          workflowStateClaimMaxAgeMs: 300_000,
          appScopeBindingMaxAgeMs: 300_000,
          hoverWitnessMaxAgeMs: 300_000
        }
      }
    },
    challengePhenomena: [
      "visual_spatial_precision",
      "streaming_interaction",
      "dynamic_environment",
      "cross_source_reasoning",
      "implicit_state_inference",
      "multi_item_state_tracking",
      "conflict_disambiguation",
      "tutorial_following",
      "proactive_interaction"
    ],
    watchedSources: [
      {
        sourceKey: "source-instruction",
        sourceKind: "document",
        description: "External instruction source for the expected target.",
        authoritativeFor: ["which target to operate"],
        recheckPolicy: "before_commit",
        semanticFreshnessWindowMs: 300_000,
        staleBlocks: ["execute_committed_action", "closure"]
      },
      {
        sourceKey: "committed-selection",
        sourceKind: "app_panel",
        description: "Committed selector state inside the app.",
        authoritativeFor: ["which executable is selected"],
        recheckPolicy: "before_commit",
        semanticFreshnessWindowMs: 300_000,
        staleBlocks: ["execute_committed_action", "closure"]
      }
    ],
    protectedOutcome: {
      outcomeId: "pressure-flow-complete",
      description: "The selected app workflow reaches the intended done state.",
      checkpoints: [
        {
          checkpointId: "target-identified",
          description: "The target was identified without confusing nearby controls.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["screenshot_reference", "workflow_postcondition"],
          insufficientEvidence: ["cursor_position", "frame_hash_delta"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.25
        },
        {
          checkpointId: "selection-committed",
          description: "The transient highlighted row became committed app state.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["workflow_postcondition", "screenshot_reference"],
          insufficientEvidence: ["local_event_without_lookback", "cursor_position"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.25
        },
        {
          checkpointId: "all-items-configured",
          description: "All required items were configured.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["functional_state_check", "workflow_postcondition"],
          insufficientEvidence: ["frame_hash_delta", "cursor_position"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.25
        },
        {
          checkpointId: "done-visible",
          description: "The final done state is visible.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["screenshot_reference", "workflow_postcondition"],
          insufficientEvidence: ["frame_hash_delta", "cursor_position"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.25
        }
      ]
    },
    canonicalTargets: [
      {
        targetKey: "body-slide-run",
        canonicalIntendedTarget: "Run button for BodySlide row",
        description: "Run action in the BodySlide row.",
        targetScope: appScope,
        surfaceLabelHints: ["Run"],
        forbiddenAliases: ["generic run", "run"],
        workflowTargetInheritance: "inherit_digest_target_when_omitted",
        retargetingPolicy: "new_target_track_required"
      },
      {
        targetKey: "fnis-run",
        canonicalIntendedTarget: "Run button for FNIS row",
        description: "Nearby wrong Run action.",
        targetScope: appScope,
        surfaceLabelHints: ["Run"],
        forbiddenAliases: ["generic run"],
        workflowTargetInheritance: "inherit_digest_target_when_omitted",
        retargetingPolicy: "new_target_track_required"
      },
      {
        targetKey: "body-slide-selector-row",
        canonicalIntendedTarget: "BodySlide selector row",
        description: "Dropdown row that must be clicked to commit selection.",
        targetScope: appScope,
        surfaceLabelHints: ["BodySlide"],
        forbiddenAliases: [],
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
      scenarioSource: "local-osworld-inspired-fixture",
      scenarioContractHash: "pressurehash",
      externalBenchmarkName: "OSWorld-V2-inspired",
      externalBenchmarkVersion: "local-admcp-pressure-v1",
      gatedEvaluatorOrAnswerIncluded: false
    },
    residue: [
      "Synthetic fixture only; no OSWorld gated task, answer, evaluator, website, or provider image is copied."
    ],
    ...overrides
  });
}

function carrierFixture(overrides: Partial<UiTestRunCarrier> = {}): UiTestRunCarrier {
  const scenario = scenarioFixture();
  const carrier: UiTestRunCarrier = {
    schemaVersion: uiTestSchemaVersion,
    carrierId: "carrier-pressure-001",
    scenarioId: scenario.scenarioId,
    scenarioRevision: scenario.scenarioRevision,
    admcpServer: {
      serverVersion: "0.1.0",
      capabilitiesSnapshotHash: "capabilitieshash"
    },
    session: {
      sessionId: "session-pressure-001",
      appScopeBindingId: "binding-pressure-001"
    },
    current: {
      targetKey: "body-slide-run",
      canonicalIntendedTarget: "Run button for BodySlide row",
      targetScope: appScope,
      observationId: "obs-001",
      perceptionDigestId: "digest-001",
      workflowStateClaimId: "workflow-001",
      repairExitRequired: false
    },
    targetRegistry: scenario.canonicalTargets,
    cycleIds: [],
    transitionActionIds: [],
    challengePhenomenaStatus: scenario.challengePhenomena.map((phenomenon) => ({
      phenomenon,
      status: "active",
      residue: []
    })),
    protectedOutcomeStatus: {
      outcomeId: scenario.protectedOutcome.outcomeId,
      status: "in_progress",
      summary: "Pressure fixture outcome is in progress.",
      residue: []
    },
    checkpointStatus: scenario.protectedOutcome.checkpoints.map((checkpoint) => ({
      checkpointId: checkpoint.checkpointId,
      status: "not_reached",
      evidence: [],
      residue: []
    })),
    watchedSourceStatus: [
      {
        sourceKey: "source-instruction",
        semanticFreshness: "current",
        lastCheckedAt: "2026-06-27T10:00:00.000Z",
        lastObservationId: "obs-001",
        summary: "Instruction source is current.",
        residue: []
      },
      {
        sourceKey: "committed-selection",
        semanticFreshness: "current",
        lastCheckedAt: "2026-06-27T10:00:00.000Z",
        lastObservationId: "obs-001",
        summary: "Committed selection source is current.",
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
      protectedObservables: [
        "BodySlide row target",
        "Committed BodySlide selection",
        "All configured items",
        "Done state"
      ],
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

function safetyReportFixture(
  overrides: Partial<UiTestSafetyReport> = {}
): UiTestSafetyReport {
  return uiTestSafetyReportSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    reportId: "safety-pressure-001",
    scenarioId: "scenario-osworld-inspired-pressure",
    carrierId: "carrier-pressure-001",
    createdAt: "2026-06-27T10:10:00.000Z",
    providerMutationGates: {
      realMouseMovementEnabled: true,
      realClickEnabled: true,
      realTypingEnabled: false
    },
    secretsOrRawTypedTextStored: false,
    screenshotsPersisted: true,
    sideEffects: [],
    forbiddenBoundaryHits: [],
    scopeExitObserved: false,
    riskPromptObserved: false,
    externalEffectObserved: false,
    destructiveEffectObserved: false,
    credentialExposureObserved: false,
    residue: [],
    ...overrides
  });
}

function workflowPostconditionFailure() {
  return {
    status: "partial",
    perceptionDigestId: "digest-002",
    failures: [
      {
        step: "workflow_state_claim",
        error: {
          code: "workflow_postcondition_status_required"
        }
      }
    ]
  };
}

describe("OSWorld-inspired ADMCP pressure fixtures", () => {
  it("preserves benchmark-style provenance without gated evaluator leakage", () => {
    const scenario = scenarioFixture();
    const defaults = uiTestScenarioGuardDefaults(scenario);

    expect(scenario.provenance).toMatchObject({
      externalBenchmarkName: "OSWorld-V2-inspired",
      externalBenchmarkVersion: "local-admcp-pressure-v1",
      gatedEvaluatorOrAnswerIncluded: false
    });
    expect(defaults.requiresPreActionRevalidation).toBe(true);
    expect(defaults.requiresWatchedSources).toBe(true);
    expect(defaults.requiresSemanticFreshnessBeforeClosure).toBe(true);
    expect(defaults.askIsFirstClassOutcome).toBe(true);
    expect(defaults.frameHashOnlyInsufficientByDefault).toBe(true);
  });

  it("catches visual-spatial target drift between nearby same-label controls", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      evidenceMode: "same_target",
      targetKey: "fnis-run",
      perception: cleanPerception
    });

    expect(plan.status).toBe("blocked");
    expect(plan.status === "blocked" ? plan.reason : undefined).toContain(
      "target track check failed"
    );
    expect(plan.status === "blocked" ? plan.behaviorLabels : []).toContain(
      "target_string_drift"
    );
    expect(plan.status === "blocked" ? plan.agentGuidance : undefined).toMatchObject({
      code: "target_canonical_drift"
    });
  });

  it("keeps no-op and delayed transitions open until lookback evidence supports progress", () => {
    const update = applyUiTestRunnerObservationResult({
      carrier: carrierFixture(),
      result: {
        status: "observed",
        observation: {
          observationId: "obs-after-noop"
        },
        transitionGate: {
          actionId: "move-001",
          postActionClassification: {
            kind: "no_op",
            confidence: "medium",
            reason: "The follow-up frame showed no semantic change.",
            residue: ["No visible state change was witnessed."]
          }
        }
      }
    });
    const closure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: update.carrier,
      requestedClosureStatus: "passed"
    });

    expect(update.carrier.routeCarrier.status).toBe("carries_with_residual");
    expect(update.carrier.routeCarrier.unsatisfiedResidue).toContain(
      "Transition classified as no_op."
    );
    expect(update.carrier.behaviorLabels).toContain("gui_visual_grounding_issue");
    expect(closure.gate.allowed).toBe(false);
    expect(closure.gate.reasons).toContain(
      "required protected outcome checkpoints are not satisfied"
    );
  });

  it("blocks dynamic and cross-source commits when authoritative watched sources are stale", () => {
    const refreshed = refreshUiTestWatchedSource({
      carrier: carrierFixture(),
      sourceKey: "source-instruction",
      semanticFreshness: "stale",
      checkedAt: "2026-06-27T10:08:00.000Z",
      observationId: "obs-004",
      summary: "The external instruction source changed after initial planning."
    });
    const freshness = evaluateUiTestWatchedSourceFreshness({
      scenario: scenarioFixture(),
      carrier: refreshed.carrier,
      blockKind: "execute_committed_action",
      now: "2026-06-27T10:04:00.000Z"
    });
    const closure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: refreshed.carrier,
      requestedClosureStatus: "passed"
    });

    expect(freshness.blocked).toBe(true);
    expect(freshness.staleSourceKeys).toEqual(["source-instruction"]);
    expect(refreshed.carrier.behaviorLabels).toContain("watched_source_stale");
    expect(closure.gate.allowed).toBe(false);
    expect(closure.gate.staleWatchedSourceKeys).toContain("source-instruction");
  });

  it("treats transient dropdown highlight as insufficient implicit state", () => {
    const checkpoint = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      checkpointId: "selection-committed",
      status: "unsatisfied",
      evidence: [
        {
          evidenceKind: "workflow_postcondition",
          observationId: "obs-dropdown-open",
          summary:
            "The BodySlide row is highlighted in an open dropdown, but the selector has not collapsed to committed BodySlide state.",
          strength: "insufficient_alone"
        }
      ],
      residue: [
        "Transient dropdown highlight cannot prove committed executable selection."
      ]
    });
    const closure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: checkpoint.carrier,
      requestedClosureStatus: "passed"
    });

    expect(checkpoint.carrier.protectedOutcomeStatus.status).toBe("unresolved");
    expect(closure.gate.allowed).toBe(false);
    expect(closure.gate.blockingCheckpointIds).toContain("selection-committed");
  });

  it("keeps multi-item progress partial until every required checkpoint is satisfied", () => {
    const first = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      checkpointId: "target-identified",
      status: "satisfied"
    });
    const second = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: first.carrier,
      checkpointId: "selection-committed",
      status: "satisfied"
    });
    const closure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: second.carrier,
      requestedClosureStatus: "passed"
    });
    const partialClosure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: {
        ...second.carrier,
        routeCarrier: {
          ...second.carrier.routeCarrier,
          unsatisfiedResidue: ["Remaining items are not configured."]
        }
      },
      requestedClosureStatus: "partial_landfall"
    });

    expect(second.carrier.protectedOutcomeStatus.status).toBe("partial");
    expect(closure.gate.allowed).toBe(false);
    expect(closure.gate.blockingCheckpointIds).toEqual([
      "all-items-configured",
      "done-visible"
    ]);
    expect(partialClosure.gate.allowed).toBe(true);
  });

  it("labels missing workflow postcondition status in tutorial-following cycles", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      evidenceMode: "same_target",
      targetKey: "body-slide-run",
      perception: cleanPerception
    });
    const update = applyUiTestRunnerInteractionEvidenceResult({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      call: plan.status === "ready" ? plan.call : ({} as never),
      result: workflowPostconditionFailure()
    });

    expect(update.carrier.behaviorLabels).toContain(
      "missing_workflow_postcondition_status"
    );
    expect(update.residue).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Workflow evidence that references")
      ])
    );
  });

  it("opens ask state instead of guessing missing domain input", () => {
    const asked = requireUiTestAsk({
      carrier: carrierFixture(),
      question: "Which executable should remain selected before clicking Run?",
      whyNecessary:
        "The current screenshot does not disambiguate the intended committed executable.",
      invalidatedCarrierFields: ["current.workflowStateClaimId"],
      residue: ["Missing user/domain authority blocks a safe commit."]
    });
    const blockedClosure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: asked.carrier,
      requestedClosureStatus: "passed"
    });
    const answered = answerUiTestAsk({
      carrier: asked.carrier,
      answerSource: "user",
      answerSummary: "BodySlide should remain selected.",
      revalidatedCarrierFields: ["current.workflowStateClaimId"]
    });

    expect(asked.carrier.askState.status).toBe("ask_required");
    expect(asked.carrier.behaviorLabels).toContain("ask_needed");
    expect(blockedClosure.gate.allowed).toBe(false);
    expect(blockedClosure.gate.reasons).toContain(
      "ask-required state is still open"
    );
    expect(answered.carrier.askState.status).toBe("answered");
  });

  it("stops pass closure on scope exit even if local route evidence exists", () => {
    const route = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: {
        kind: "scope_exit",
        confidence: "high",
        summary: "The active window changed to an unrelated app.",
        evidence: [],
        residue: ["The app-under-test binding was lost."]
      },
      hasLookback: true
    });
    const closure = applyUiTestClosureDecision({
      scenario: scenarioFixture(),
      carrier: route.carrier,
      requestedClosureStatus: "passed"
    });

    expect(route.carrier.behaviorLabels).toContain("scope_drift");
    expect(closure.gate.allowed).toBe(false);
    expect(closure.gate.reasons).toContain(
      "required protected outcome checkpoints are not satisfied"
    );
  });

  it("uses the safety sidecar to block closure when scope exit is observed", () => {
    const route = applyUiTestRouteCarrierTransition({
      carrier: carrierFixture(),
      classification: {
        kind: "expected_delta",
        confidence: "high",
        summary: "Local route evidence exists.",
        evidence: [],
        residue: []
      },
      hasLookback: true,
      satisfiedObservables: [
        "BodySlide row target",
        "Committed BodySlide selection",
        "All configured items",
        "Done state"
      ],
      unsatisfiedResidue: [],
      reentryGeometry: {
        entryObservationId: "obs-001",
        finalObservationId: "obs-final",
        reentryNotes: "The final frame can be re-entered from the fixture route.",
        recoverable: true
      }
    });
    const target = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: route.carrier,
      checkpointId: "target-identified",
      status: "satisfied"
    });
    const selection = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: target.carrier,
      checkpointId: "selection-committed",
      status: "satisfied"
    });
    const configured = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: selection.carrier,
      checkpointId: "all-items-configured",
      status: "satisfied"
    });
    const done = applyUiTestCheckpointStatus({
      scenario: scenarioFixture(),
      carrier: configured.carrier,
      checkpointId: "done-visible",
      status: "satisfied"
    });
    const safetyReport = safetyReportFixture({
      scopeExitObserved: true,
      sideEffects: [
        {
          sideEffectKind: "scope_exit",
          status: "observed",
          summary: "The run left the app-under-test.",
          evidence: [],
          residue: []
        }
      ]
    });
    const gate = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: done.carrier,
      requestedClosureStatus: "passed",
      safetyReport
    });

    expect(safetyReport.scopeExitObserved).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.activeSideEffects).toEqual(["scope_exit"]);
    expect(gate.reasons).toContain("active safety side effects block closure");
  });
});
