import { describe, expect, it } from "vitest";
import {
  type UiTestRunCarrier,
  type UiTestSafetyReport,
  type UiTestScenarioContract,
  evaluateUiTestClosure,
  uiTestCyclePacketSchema,
  uiTestLandfallReentryPacketSchema,
  uiTestSafetyReportSchema,
  uiTestScenarioContractSchema,
  uiTestScenarioGuardDefaults,
  uiTestSchemaVersion
} from "../src/session/uiTestCarrierSchemas.js";

function scenarioFixture(
  overrides: Partial<UiTestScenarioContract> = {}
): UiTestScenarioContract {
  const scenario: UiTestScenarioContract = {
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "scenario-generated-app",
    scenarioRevision: "rev-001",
    title: "Generated app happy path",
    userGoal: "Verify that the generated app submit path reaches its done state.",
    sessionLicense: {
      userConfirmed: true,
      visibleContentAcknowledged: true,
      reversibleAppUnderTestDeclared: true,
      appUnderTestScope: {
        description: "Generated app window is a reversible local UI test fixture.",
        scope: {
          kind: "window_title",
          value: "Generated App"
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
      "dynamic_environment",
      "conflict_disambiguation"
    ],
    watchedSources: [
      {
        sourceKey: "selected-runner",
        sourceKind: "app_panel",
        description: "Committed runner selection shown in the app toolbar.",
        authoritativeFor: ["runner-selection"],
        recheckPolicy: "before_closure",
        semanticFreshnessWindowMs: 300_000,
        staleBlocks: ["execute_committed_action", "closure"]
      }
    ],
    protectedOutcome: {
      outcomeId: "submit-done-state",
      description: "The generated app reaches its done state after Submit.",
      checkpoints: [
        {
          checkpointId: "submit-control-committed",
          description: "Submit is the committed workflow action.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: [
            "screenshot_reference",
            "workflow_postcondition",
            "functional_state_check"
          ],
          insufficientEvidence: [
            "cursor_position",
            "frame_hash_delta",
            "local_event_without_lookback"
          ],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        },
        {
          checkpointId: "done-state-visible",
          description: "The done state is visible after the submit action.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: [
            "screenshot_reference",
            "workflow_postcondition",
            "functional_state_check"
          ],
          insufficientEvidence: ["frame_hash_delta", "cursor_position"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        }
      ]
    },
    canonicalTargets: [
      {
        targetKey: "submit-button",
        canonicalIntendedTarget: "Submit button",
        description: "The committed submit control.",
        targetScope: {
          kind: "window_title",
          value: "Generated App"
        },
        surfaceLabelHints: ["Submit"],
        forbiddenAliases: ["send", "delete"],
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
      scenarioSource: "local-fixture",
      scenarioContractHash: "scenariohash",
      gatedEvaluatorOrAnswerIncluded: false
    },
    residue: []
  };

  return uiTestScenarioContractSchema.parse({
    ...scenario,
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
      serverVersion: "0.1.0",
      capabilitiesSnapshotHash: "capabilitieshash"
    },
    session: {
      sessionId: "session-001",
      appScopeBindingId: "binding-001",
      licenseStartedAt: "2026-06-27T10:00:00.000Z",
      licenseExpiresAt: "2026-06-27T11:00:00.000Z"
    },
    current: {
      targetKey: "submit-button",
      canonicalIntendedTarget: "Submit button",
      targetScope: {
        kind: "window_title",
        value: "Generated App"
      },
      observationId: "obs-003",
      perceptionDigestId: "digest-003",
      workflowStateClaimId: "workflow-003",
      transitionActionId: "action-click-submit",
      hoverTargetWitnessId: "hover-003",
      repairExitRequired: false
    },
    targetRegistry: scenario.canonicalTargets,
    cycleIds: ["cycle-001", "cycle-002", "cycle-003"],
    transitionActionIds: ["action-click-submit"],
    challengePhenomenaStatus: scenario.challengePhenomena.map((phenomenon) => ({
      phenomenon,
      status: "handled",
      residue: []
    })),
    protectedOutcomeStatus: {
      outcomeId: scenario.protectedOutcome.outcomeId,
      status: "satisfied",
      summary: "All required checkpoints were satisfied.",
      residue: []
    },
    checkpointStatus: [
      {
        checkpointId: "submit-control-committed",
        status: "satisfied",
        evidence: [
          {
            evidenceKind: "workflow_postcondition",
            summary: "Workflow claim says Submit was the committed action.",
            strength: "supporting",
            residue: []
          }
        ],
        residue: []
      },
      {
        checkpointId: "done-state-visible",
        status: "satisfied",
        evidence: [
          {
            evidenceKind: "screenshot_reference",
            observationId: "obs-003",
            summary: "The final screenshot artifact shows the done state.",
            strength: "supporting",
            residue: []
          }
        ],
        residue: []
      }
    ],
    watchedSourceStatus: [
      {
        sourceKey: "selected-runner",
        semanticFreshness: "current",
        lastCheckedAt: "2026-06-27T10:05:00.000Z",
        lastObservationId: "obs-003",
        summary: "Selected runner source is current.",
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
      ladderLevel: "v3_reentry_geometry",
      status: "carries_with_residual",
      protectedObservables: ["Submit committed", "Done state visible"],
      satisfiedObservables: ["Submit committed", "Done state visible"],
      unsatisfiedResidue: [],
      reentryGeometry: {
        entryObservationId: "obs-001",
        finalObservationId: "obs-003",
        reentryNotes: "Reopen the app and inspect the done-state visual artifact.",
        recoverable: true
      },
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
    reportId: "safety-001",
    scenarioId: "scenario-generated-app",
    carrierId: "carrier-001",
    createdAt: "2026-06-27T10:06:00.000Z",
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

describe("ADMCP-023A scenario contract schema", () => {
  it("accepts a governed UI test scenario contract", () => {
    const scenario = scenarioFixture();

    expect(scenario.schemaVersion).toBe(uiTestSchemaVersion);
    expect(scenario.sessionLicense.allowedProbes).toContain("observe");
    expect(scenario.canonicalTargets[0]?.workflowTargetInheritance).toBe(
      "inherit_digest_target_when_omitted"
    );
  });

  it("rejects duplicate target, source, and checkpoint ids", () => {
    expect(() =>
      scenarioFixture({
        canonicalTargets: [
          ...scenarioFixture().canonicalTargets,
          {
            ...scenarioFixture().canonicalTargets[0]!,
            description: "Duplicate target key"
          }
        ]
      })
    ).toThrow(/canonical target keys must be unique/);

    expect(() =>
      scenarioFixture({
        watchedSources: [
          ...scenarioFixture().watchedSources,
          {
            ...scenarioFixture().watchedSources[0]!,
            description: "Duplicate source key"
          }
        ]
      })
    ).toThrow(/watched source keys must be unique/);

    expect(() =>
      scenarioFixture({
        protectedOutcome: {
          ...scenarioFixture().protectedOutcome,
          checkpoints: [
            ...scenarioFixture().protectedOutcome.checkpoints,
            {
              ...scenarioFixture().protectedOutcome.checkpoints[0]!,
              description: "Duplicate checkpoint id"
            }
          ]
        }
      })
    ).toThrow(/checkpoint ids must be unique/);
  });

  it("requires dynamic-environment scenarios to declare watched sources", () => {
    expect(() =>
      scenarioFixture({
        challengePhenomena: ["dynamic_environment"],
        watchedSources: []
      })
    ).toThrow(/dynamic_environment scenarios must declare watched sources/);
  });

  it("keeps frame-hash-only evidence insufficient unless explicitly declared", () => {
    expect(() =>
      scenarioFixture({
        challengePhenomena: ["visual_spatial_precision"],
        watchedSources: [],
        protectedOutcome: {
          outcomeId: "hash-only-outcome",
          description: "A hash-only outcome should not be sufficient by default.",
          checkpoints: [
            {
              checkpointId: "hash-only",
              description: "Only a frame hash changed.",
              requiredForPass: true,
              criticalBlocker: true,
              acceptableEvidence: ["frame_hash_delta"],
              insufficientEvidence: ["cursor_position"],
              frameHashEvidenceSufficient: false,
              partialCreditWeight: 0
            }
          ]
        }
      })
    ).toThrow(/frame_hash_delta cannot be the only acceptable evidence/);
  });

  it("derives challenge-driven guard defaults", () => {
    const defaults = uiTestScenarioGuardDefaults(scenarioFixture());

    expect(defaults.requiresPreActionRevalidation).toBe(true);
    expect(defaults.requiresWatchedSources).toBe(true);
    expect(defaults.requiresSemanticFreshnessBeforeClosure).toBe(true);
    expect(defaults.askIsFirstClassOutcome).toBe(true);
    expect(defaults.frameHashOnlyInsufficientByDefault).toBe(true);
  });
});

describe("ADMCP-023A cycle and artifact schemas", () => {
  const observation = {
    observationId: "obs-001",
    observedAt: "2026-06-27T10:00:00.000Z",
    targetScope: {
      kind: "window_title" as const,
      value: "Generated App"
    },
    hasScreenshot: true,
    frameHashes: ["framehash"],
    visualArtifactPaths: ["C:\\Temp\\frame.png"],
    residue: []
  };

  it("accepts observation-only, probe, and state-changing cycle packets", () => {
    expect(() =>
      uiTestCyclePacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        cycleId: "cycle-observe",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        cycleIndex: 0,
        cycleKind: "observation_only",
        pressure: "Need current visual state.",
        activeCut: "Observe the app window.",
        currentObservation: observation,
        residue: [],
        nextReentryPressure: "Submit evidence for the current target.",
        decision: "continue"
      })
    ).not.toThrow();

    expect(() =>
      uiTestCyclePacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        cycleId: "cycle-probe",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        cycleIndex: 1,
        cycleKind: "probe_action",
        pressure: "Need click-candidate readiness.",
        activeCut: "Evaluate candidate after supported hover.",
        currentObservation: observation,
        action: {
          tool: "evaluate_click_candidate",
          requestAssembledFromCarrier: true,
          evidenceIds: {
            perceptionDigestId: "digest-001",
            workflowStateClaimId: "workflow-001",
            hoverTargetWitnessId: "hover-001"
          }
        },
        residue: [],
        nextReentryPressure: "Click if candidate is ready.",
        decision: "continue"
      })
    ).not.toThrow();

    expect(() =>
      uiTestCyclePacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        cycleId: "cycle-click",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        cycleIndex: 2,
        cycleKind: "state_changing_action",
        pressure: "Need committed state transition.",
        activeCut: "Click Submit and observe lookback.",
        beforeObservation: observation,
        action: {
          tool: "click",
          actionId: "action-click-submit",
          intendedTargetKey: "submit-button",
          canonicalIntendedTarget: "Submit button",
          requestAssembledFromCarrier: true,
          evidenceIds: {
            perceptionDigestId: "digest-001",
            workflowStateClaimId: "workflow-001",
            hoverTargetWitnessId: "hover-001"
          }
        },
        afterObservation: {
          ...observation,
          observationId: "obs-002",
          frameHashes: ["framehash-after"]
        },
        transitionClassification: {
          kind: "expected_delta",
          confidence: "high",
          summary: "Done state appeared after click.",
          evidence: [
            {
              evidenceKind: "workflow_postcondition",
              summary: "Workflow postcondition was satisfied.",
              strength: "supporting",
              residue: []
            }
          ],
          residue: []
        },
        residue: [],
        nextReentryPressure: "Update carrier checkpoints.",
        decision: "continue"
      })
    ).not.toThrow();
  });

  it("rejects cycle packets that overclaim their cycle kind", () => {
    expect(() =>
      uiTestCyclePacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        cycleId: "cycle-bad-observe",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        cycleIndex: 0,
        cycleKind: "observation_only",
        pressure: "Observe only.",
        activeCut: "Observe current app.",
        currentObservation: observation,
        action: {
          tool: "click",
          actionId: "action-click-submit",
          requestAssembledFromCarrier: true,
          evidenceIds: {}
        },
        nextReentryPressure: "Unexpected.",
        decision: "continue"
      })
    ).toThrow(/observation_only cycles must not include an action/);

    expect(() =>
      uiTestCyclePacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        cycleId: "cycle-bad-click",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        cycleIndex: 1,
        cycleKind: "state_changing_action",
        pressure: "Click.",
        activeCut: "Click without lookback.",
        beforeObservation: observation,
        action: {
          tool: "click",
          actionId: "action-click-submit",
          requestAssembledFromCarrier: true,
          evidenceIds: {}
        },
        nextReentryPressure: "Missing transition.",
        decision: "continue"
      })
    ).toThrow(/state_changing_action cycles require afterObservation/);
  });

  it("accepts safety reports and landfall/re-entry packets", () => {
    const safetyReport = safetyReportFixture();
    const closureGate = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      requestedClosureStatus: "passed",
      safetyReport
    });

    expect(() =>
      uiTestLandfallReentryPacketSchema.parse({
        schemaVersion: uiTestSchemaVersion,
        packetId: "landfall-001",
        scenarioId: "scenario-generated-app",
        carrierId: "carrier-001",
        closureGate,
        protectedObservables: ["Submit committed", "Done state visible"],
        satisfiedObservables: ["Submit committed", "Done state visible"],
        unsatisfiedResidue: [],
        finalObservation: observation,
        auditEventCount: 8,
        stopConditions: [],
        reentryNotes: "Open the final visual artifact and inspect the done state.",
        replayArtifactRefs: ["artifact/run-001/carrier.json"]
      })
    ).not.toThrow();
  });
});

describe("ADMCP-023A closure gate", () => {
  it("allows passed closure when required checkpoints, watched sources, ask state, and landfall are clean", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      requestedClosureStatus: "passed",
      safetyReport: safetyReportFixture()
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain("closure status is allowed by the carrier gate");
  });

  it("blocks passed closure when a required checkpoint is unresolved", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        checkpointStatus: [
          {
            checkpointId: "submit-control-committed",
            status: "satisfied",
            evidence: [],
            residue: []
          },
          {
            checkpointId: "done-state-visible",
            status: "unresolved",
            evidence: [],
            residue: ["Done state was not proven."]
          }
        ]
      }),
      requestedClosureStatus: "passed"
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingCheckpointIds).toEqual(["done-state-visible"]);
    expect(result.reasons).toContain(
      "required protected outcome checkpoints are not satisfied"
    );
  });

  it("blocks passed closure when authoritative watched sources are stale or unknown", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        watchedSourceStatus: [
          {
            sourceKey: "selected-runner",
            semanticFreshness: "stale",
            summary: "Selected runner may have changed.",
            residue: ["Needs recheck before closure."]
          }
        ]
      }),
      requestedClosureStatus: "passed"
    });

    expect(result.allowed).toBe(false);
    expect(result.staleWatchedSourceKeys).toEqual(["selected-runner"]);
  });

  it("blocks passed closure while ask-required state is open", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        askState: {
          status: "ask_required",
          question: "Which runner should be selected?",
          whyNecessary: "The screenshot shows conflicting runner labels.",
          invalidatedCarrierFields: ["current.canonicalIntendedTarget"],
          revalidatedCarrierFields: [],
          residue: []
        }
      }),
      requestedClosureStatus: "passed"
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("ask-required state is still open");
  });

  it("blocks local-event and route-dynamics carriers from being promoted to passed", () => {
    const localEventResult = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        routeCarrier: {
          ladderLevel: "v1_local_event",
          status: "local_event",
          protectedObservables: ["Submit committed"],
          satisfiedObservables: ["Submit committed"],
          unsatisfiedResidue: [],
          residue: ["Only a cursor hover/local cue has been recorded."]
        }
      }),
      requestedClosureStatus: "passed"
    });
    const routeDynamicsResult = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        routeCarrier: {
          ladderLevel: "v2_route_dynamics",
          status: "candidate_route",
          protectedObservables: ["Submit committed"],
          satisfiedObservables: ["Submit committed"],
          unsatisfiedResidue: ["No re-entry geometry yet."],
          residue: []
        }
      }),
      requestedClosureStatus: "passed"
    });

    expect(localEventResult.allowed).toBe(false);
    expect(routeDynamicsResult.allowed).toBe(false);
    expect(localEventResult.reasons).toContain(
      "landfall/re-entry geometry is not established"
    );
  });

  it("allows partial landfall with explicit residue when passed closure is not justified", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        protectedOutcomeStatus: {
          outcomeId: "submit-done-state",
          status: "partial",
          summary: "Submit was committed, but the done state remains unresolved.",
          residue: ["Done-state checkpoint unresolved."]
        },
        checkpointStatus: [
          {
            checkpointId: "submit-control-committed",
            status: "satisfied",
            evidence: [],
            residue: []
          },
          {
            checkpointId: "done-state-visible",
            status: "unresolved",
            evidence: [],
            residue: ["Done state unresolved."]
          }
        ],
        routeCarrier: {
          ladderLevel: "v2_route_dynamics",
          status: "carries_with_residual",
          protectedObservables: ["Submit committed", "Done state visible"],
          satisfiedObservables: ["Submit committed"],
          unsatisfiedResidue: ["Done state visible remains unresolved."],
          residue: []
        },
        residue: ["Done state visible remains unresolved."]
      }),
      requestedClosureStatus: "partial_landfall"
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks closure when safety side effects are suspected or observed", () => {
    const result = evaluateUiTestClosure({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      requestedClosureStatus: "passed",
      safetyReport: safetyReportFixture({
        sideEffects: [
          {
            sideEffectKind: "scope_exit",
            status: "observed",
            summary: "The run left the licensed app-under-test scope.",
            evidence: [],
            residue: []
          }
        ]
      })
    });

    expect(result.allowed).toBe(false);
    expect(result.activeSideEffects).toEqual(["scope_exit"]);
    expect(result.reasons).toContain("active safety side effects block closure");
  });
});
