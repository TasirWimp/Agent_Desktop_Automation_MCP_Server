import { describe, expect, it } from "vitest";
import {
  type UiTestRunCarrier,
  type UiTestScenarioContract,
  uiTestScenarioContractSchema,
  uiTestSchemaVersion
} from "../src/session/uiTestCarrierSchemas.js";
import {
  applyUiTestRunnerActionResult,
  applyUiTestRunnerInteractionEvidenceResult,
  applyUiTestRunnerObservationResult,
  planUiTestClick,
  planUiTestMoveMouse,
  planUiTestObserve,
  planUiTestStartSession,
  planUiTestSubmitInteractionEvidence,
  planUiTestTypeText,
  type UiTestRunnerPerceptionEvidenceDraft,
  type UiTestRunnerRelationalClaimDraft,
  type UiTestRunnerWorkflowEvidenceDraft
} from "../src/session/uiTestRunnerHarness.js";

function scenarioFixture(
  overrides: Partial<UiTestScenarioContract> = {}
): UiTestScenarioContract {
  return uiTestScenarioContractSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "scenario-runner-harness",
    scenarioRevision: "rev-001",
    title: "Runner harness fixture",
    userGoal: "Exercise the governed runner harness without executing tools.",
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
        targetKey: "comment-field",
        canonicalIntendedTarget: "Comment field",
        description: "Comment text field.",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        surfaceLabelHints: ["Comment"],
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
      targetScope: {
        kind: "window_title",
        value: "Fixture App"
      },
      observationId: "obs-001",
      repairExitRequired: false
    },
    targetRegistry: scenario.canonicalTargets,
    cycleIds: [],
    transitionActionIds: [],
    challengePhenomenaStatus: [],
    protectedOutcomeStatus: {
      outcomeId: scenario.protectedOutcome.outcomeId,
      status: "in_progress",
      summary: "Protected outcome is in progress.",
      residue: []
    },
    checkpointStatus: [],
    watchedSourceStatus: [],
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

const perception: UiTestRunnerPerceptionEvidenceDraft = {
  currentScene: "Fixture App main view.",
  currentAnchor: "Submit row",
  targetVisibility: "visible",
  anchorVisibility: "visible",
  contradictionToPriorClaim: null,
  staleCarryoverReviewed: true,
  currentEvidence: "The current visual artifact shows the Submit button."
};

const workflow: UiTestRunnerWorkflowEvidenceDraft = {
  workflowGoal: "Submit the fixture form.",
  workflowStep: "Click Submit.",
  intendedActionMeaning: "click the committed Submit action",
  actionRole: "execute_committed_action",
  requiredPrecondition: "Submit is the committed next action.",
  preconditionStatus: "satisfied",
  committedStateEvidence: "The current screenshot shows Submit as committed.",
  transientStateRisk: "none",
  missingConfirmation: null,
  expectedPostcondition: "Done state appears.",
  postconditionContradiction: "A different state appears.",
  currentContradiction: null,
  staleCarryoverReviewed: true
};

const relationalClaim: UiTestRunnerRelationalClaimDraft = {
  sourceObservationId: "placeholder-observation",
  intendedTarget: "Wrong target text",
  scene: "Fixture App main view.",
  anchor: "Submit row",
  relation: "target control in the same row/right-side action area",
  candidate: "point is inside that row action basin",
  rejectedAlternative: "nearby Cancel button",
  expectedEvidence: "Submit hover highlight appears",
  contradiction: "Cancel hover highlight appears",
  pointProvenance: "external_coordinate"
};

function ready(plan: ReturnType<typeof planUiTestObserve>) {
  expect(plan.status).toBe("ready");
  return plan.status === "ready" ? plan.call : undefined;
}

describe("ADMCP-023C runner harness planning", () => {
  it("plans session start and screenshot-bearing observation using existing tools only", () => {
    const scenario = scenarioFixture();
    const start = planUiTestStartSession({
      scenario,
      sessionId: "session-001"
    });
    const observe = planUiTestObserve({
      scenario,
      carrier: carrierFixture({ current: { repairExitRequired: false } })
    });

    expect(start.status).toBe("ready");
    expect(start.status === "ready" ? start.call.tool : undefined).toBe(
      "desktop_start_interaction_session"
    );
    expect(start.status === "ready" ? start.call.mutatesDesktop : true).toBe(false);
    expect(start.status === "ready" ? start.call.arguments : {}).toMatchObject({
      sessionId: "session-001",
      userConfirmed: true,
      visibleContentAcknowledged: true,
      allowedActions: ["observe", "move_mouse", "click", "type_text"]
    });

    expect(observe.status).toBe("ready");
    expect(observe.status === "ready" ? observe.call.tool : undefined).toBe(
      "desktop_observe"
    );
    expect(observe.status === "ready" ? observe.call.arguments : {}).toMatchObject({
      sessionId: "session-001",
      includeImages: true
    });
    expect(observe.status === "ready" ? observe.call.mutatesDesktop : true).toBe(false);
  });

  it("plans interaction evidence with canonical target and workflow target inheritance", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      evidenceMode: "new_target",
      targetKey: "submit-button",
      perception,
      workflow
    });

    expect(plan.status).toBe("ready");
    const call = plan.status === "ready" ? plan.call : undefined;

    expect(call?.tool).toBe("desktop_submit_interaction_evidence");
    expect(call?.mutatesDesktop).toBe(false);
    expect(call?.requiresVisualInspectionBefore).toBe(true);
    expect(call?.arguments).toMatchObject({
      sessionId: "session-001",
      observationId: "obs-001",
      intendedTarget: "Submit button",
      evidenceMode: "new_target"
    });
    expect((call?.arguments.workflow as Record<string, unknown>).intendedElementTarget).toBeUndefined();
  });

  it("blocks same-target evidence before a target track is opened", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      evidenceMode: "same_target",
      targetKey: "submit-button",
      perception
    });

    expect(plan.status).toBe("blocked");
    expect(plan.status === "blocked" ? plan.nextRequiredStep.tool : undefined).toBe(
      "desktop_submit_interaction_evidence"
    );
    expect(plan.status === "blocked" ? plan.behaviorLabels : []).toContain(
      "target_string_drift"
    );
  });

  it("plans movement from carrier-held observation and digest ids while overriding stale claim ids", () => {
    const carrier = carrierFixture({
      current: {
        targetKey: "submit-button",
        canonicalIntendedTarget: "Submit button",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        observationId: "obs-002",
        perceptionDigestId: "digest-002",
        repairExitRequired: false
      }
    });
    const plan = planUiTestMoveMouse({
      scenario: scenarioFixture(),
      carrier,
      point: {
        x: 120,
        y: 80
      },
      compactRelationalClaim: relationalClaim
    });

    expect(plan.status).toBe("ready");
    const call = plan.status === "ready" ? plan.call : undefined;
    const claim = call?.arguments.compactRelationalClaim as Record<string, unknown>;

    expect(call?.tool).toBe("desktop_move_mouse");
    expect(call?.mutatesDesktop).toBe(true);
    expect(call?.arguments).toMatchObject({
      preActionObservationId: "obs-002",
      perceptionDigestId: "digest-002",
      intendedSemanticTarget: "Submit button"
    });
    expect(claim.sourceObservationId).toBe("obs-002");
    expect(claim.intendedTarget).toBe("Submit button");
    expect(claim.pointProvenance).toBe("external_coordinate");
  });

  it("blocks click until workflow and hover witness ids are carried", () => {
    const carrier = carrierFixture({
      current: {
        targetKey: "submit-button",
        canonicalIntendedTarget: "Submit button",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        observationId: "obs-002",
        perceptionDigestId: "digest-002",
        repairExitRequired: false
      }
    });
    const plan = planUiTestClick({
      scenario: scenarioFixture(),
      carrier,
      point: {
        x: 120,
        y: 80
      },
      compactRelationalClaim: relationalClaim
    });

    expect(plan.status).toBe("blocked");
    expect(plan.status === "blocked" ? plan.nextRequiredStep.tool : undefined).toBe(
      "desktop_submit_interaction_evidence"
    );
    expect(plan.status === "blocked" ? plan.behaviorLabels : []).toContain(
      "workflow_precondition_missing"
    );
  });

  it("plans click and type requests from carried evidence ids", () => {
    const carrier = carrierFixture({
      current: {
        targetKey: "submit-button",
        canonicalIntendedTarget: "Submit button",
        targetScope: {
          kind: "window_title",
          value: "Fixture App"
        },
        observationId: "obs-003",
        perceptionDigestId: "digest-003",
        workflowStateClaimId: "workflow-003",
        hoverTargetWitnessId: "hover-003",
        repairExitRequired: false
      }
    });
    const click = planUiTestClick({
      scenario: scenarioFixture(),
      carrier,
      point: {
        x: 120,
        y: 80
      },
      compactRelationalClaim: relationalClaim
    });
    const textCarrier = {
      ...carrier,
      current: {
        ...carrier.current,
        targetKey: "comment-field",
        canonicalIntendedTarget: "Comment field",
        hoverTargetWitnessId: undefined
      }
    };
    const typeText = planUiTestTypeText({
      scenario: scenarioFixture(),
      carrier: textCarrier,
      text: "generated test input",
      compactRelationalClaim: relationalClaim
    });

    expect(click.status).toBe("ready");
    expect(click.status === "ready" ? click.call.arguments : {}).toMatchObject({
      perceptionDigestId: "digest-003",
      workflowStateClaimId: "workflow-003",
      hoverTargetWitnessId: "hover-003",
      intendedSemanticTarget: "Submit button"
    });
    expect(
      (click.status === "ready"
        ? click.call.arguments.compactRelationalClaim
        : {}) as Record<string, unknown>
    ).toMatchObject({
      pointProvenance: "hover_witness",
      intendedTarget: "Submit button",
      sourceObservationId: "obs-003"
    });

    expect(typeText.status).toBe("ready");
    expect(typeText.status === "ready" ? typeText.call.arguments : {}).toMatchObject({
      perceptionDigestId: "digest-003",
      workflowStateClaimId: "workflow-003",
      intendedSemanticTarget: "Comment field",
      text: "generated test input"
    });
  });
});

describe("ADMCP-023C runner harness carrier updates", () => {
  it("applies observation and action results to carried ids", () => {
    const observed = applyUiTestRunnerObservationResult({
      carrier: carrierFixture(),
      result: {
        status: "observed",
        observation: {
          observationId: "obs-002"
        }
      }
    });
    const actioned = applyUiTestRunnerActionResult({
      carrier: observed.carrier,
      result: {
        status: "requires_post_action_observation",
        action: {
          actionId: "move-001"
        },
        transitionGate: {
          actionId: "move-001"
        }
      }
    });
    const observeTransition = planUiTestObserve({
      scenario: scenarioFixture(),
      carrier: actioned.carrier,
      transitionActionId: actioned.carrier.current.transitionActionId
    });

    expect(observed.carrier.current.observationId).toBe("obs-002");
    expect(actioned.carrier.current.transitionActionId).toBe("move-001");
    expect(actioned.carrier.transitionActionIds).toEqual(["move-001"]);
    expect(ready(observeTransition)?.arguments).toMatchObject({
      transitionActionId: "move-001"
    });
  });

  it("applies interaction evidence results to target track, evidence phase, and carried ids", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      evidenceMode: "new_target",
      targetKey: "submit-button",
      perception,
      workflow
    });

    expect(plan.status).toBe("ready");

    const result = applyUiTestRunnerInteractionEvidenceResult({
      scenario: scenarioFixture(),
      carrier: carrierFixture(),
      call: plan.status === "ready" ? plan.call : ({} as never),
      result: {
        status: "accepted",
        perceptionDigestId: "digest-002",
        workflowStateClaimId: "workflow-002",
        hoverTargetWitnessId: "hover-002"
      }
    });

    expect(result.carrier.current.targetKey).toBe("submit-button");
    expect(result.carrier.current.canonicalIntendedTarget).toBe("Submit button");
    expect(result.carrier.current.perceptionDigestId).toBe("digest-002");
    expect(result.carrier.current.workflowStateClaimId).toBe("workflow-002");
    expect(result.carrier.current.hoverTargetWitnessId).toBe("hover-002");
  });

  it("carries repair evidence residue and clears it only after fresh clean evidence", () => {
    const repairPlan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        current: {
          targetKey: "submit-button",
          canonicalIntendedTarget: "Submit button",
          targetScope: {
            kind: "window_title",
            value: "Fixture App"
          },
          observationId: "obs-repair",
          repairExitRequired: false
        }
      }),
      evidenceMode: "repair_target",
      perception: {
        ...perception,
        targetVisibility: "uncertain",
        contradictionToPriorClaim: "Wrong row highlighted."
      }
    });
    const repaired = applyUiTestRunnerInteractionEvidenceResult({
      scenario: scenarioFixture(),
      carrier:
        repairPlan.status === "ready"
          ? carrierFixture({
              current: {
                targetKey: "submit-button",
                canonicalIntendedTarget: "Submit button",
                targetScope: {
                  kind: "window_title",
                  value: "Fixture App"
                },
                observationId: "obs-repair",
                repairExitRequired: false
              }
            })
          : ({} as never),
      call: repairPlan.status === "ready" ? repairPlan.call : ({} as never),
      result: {
        status: "accepted",
        perceptionDigestId: "digest-repair"
      }
    });

    expect(repaired.carrier.current.repairExitRequired).toBe(true);

    const cleanPlan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: {
        ...repaired.carrier,
        current: {
          ...repaired.carrier.current,
          observationId: "obs-clean"
        }
      },
      evidenceMode: "same_target",
      perception: {
        ...perception,
        contradictionToPriorClaim: "none"
      }
    });
    const clean = applyUiTestRunnerInteractionEvidenceResult({
      scenario: scenarioFixture(),
      carrier:
        cleanPlan.status === "ready"
          ? {
              ...repaired.carrier,
              current: {
                ...repaired.carrier.current,
                observationId: "obs-clean"
              }
            }
          : ({} as never),
      call: cleanPlan.status === "ready" ? cleanPlan.call : ({} as never),
      result: {
        status: "accepted",
        perceptionDigestId: "digest-clean"
      }
    });

    expect(clean.carrier.current.repairExitRequired).toBe(false);
  });

  it("labels partial evidence failures from helper output", () => {
    const plan = planUiTestSubmitInteractionEvidence({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        current: {
          targetKey: "submit-button",
          canonicalIntendedTarget: "Submit button",
          targetScope: {
            kind: "window_title",
            value: "Fixture App"
          },
          observationId: "obs-002",
          repairExitRequired: false
        }
      }),
      evidenceMode: "same_target",
      perception
    });
    const result = applyUiTestRunnerInteractionEvidenceResult({
      scenario: scenarioFixture(),
      carrier: carrierFixture({
        current: {
          targetKey: "submit-button",
          canonicalIntendedTarget: "Submit button",
          targetScope: {
            kind: "window_title",
            value: "Fixture App"
          },
          observationId: "obs-002",
          repairExitRequired: false
        }
      }),
      call: plan.status === "ready" ? plan.call : ({} as never),
      result: {
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
      }
    });

    expect(result.carrier.behaviorLabels).toContain(
      "missing_workflow_postcondition_status"
    );
  });

  it("applies transition observation classifications to the route carrier", () => {
    const result = applyUiTestRunnerObservationResult({
      carrier: carrierFixture(),
      result: {
        status: "observed",
        observation: {
          observationId: "obs-after"
        },
        transitionGate: {
          actionId: "click-001",
          postActionClassification: {
            kind: "wrong_target",
            confidence: "high",
            reason: "Wrong target opened.",
            residue: ["Wrong target opened."]
          }
        }
      }
    });

    expect(result.carrier.current.observationId).toBe("obs-after");
    expect(result.carrier.current.transitionActionId).toBe("click-001");
    expect(result.carrier.routeCarrier.ladderLevel).toBe("v2_route_dynamics");
    expect(result.carrier.routeCarrier.unsatisfiedResidue).toContain(
      "Transition classified as wrong_target."
    );
    expect(result.carrier.behaviorLabels).toContain("gui_visual_grounding_issue");
  });
});
