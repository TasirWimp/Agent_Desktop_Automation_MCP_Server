import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type UiTestClosureGateResult,
  type UiTestCyclePacket,
  type UiTestRunCarrier,
  type UiTestSafetyReport,
  type UiTestScenarioContract,
  uiTestClosureGateResultSchema,
  uiTestSafetyReportSchema,
  uiTestScenarioContractSchema,
  uiTestSchemaVersion
} from "../src/session/uiTestCarrierSchemas.js";
import {
  sanitizeForUiTestArtifact,
  writeUiTestRunArtifacts
} from "../src/session/uiTestArtifactWriter.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "admcp-ui-test-artifacts-"));
}

function scenarioFixture(): UiTestScenarioContract {
  return uiTestScenarioContractSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "scenario-artifact-writer",
    scenarioRevision: "rev-001",
    title: "Artifact writer fixture",
    userGoal: "Persist replayable governed UI test artifacts.",
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
      outcomeId: "done-state",
      description: "Done state visible.",
      checkpoints: [
        {
          checkpointId: "done-visible",
          description: "Done state is visible.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["screenshot_reference", "workflow_postcondition"],
          insufficientEvidence: ["frame_hash_delta", "cursor_position"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 1
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
      scenarioContractHash: "scenariohash",
      gatedEvaluatorOrAnswerIncluded: false
    },
    residue: []
  });
}

function carrierFixture(): UiTestRunCarrier {
  return {
    schemaVersion: uiTestSchemaVersion,
    carrierId: "carrier-001",
    scenarioId: "scenario-artifact-writer",
    scenarioRevision: "rev-001",
    admcpServer: {
      serverVersion: "0.1.0",
      capabilitiesSnapshotHash: "capabilitieshash"
    },
    session: {
      sessionId: "session-001",
      appScopeBindingId: "binding-001"
    },
    current: {
      targetKey: "submit-button",
      canonicalIntendedTarget: "Submit button",
      observationId: "obs-final",
      perceptionDigestId: "digest-final",
      workflowStateClaimId: "workflow-final",
      transitionActionId: "click-final",
      hoverTargetWitnessId: "hover-final",
      repairExitRequired: false
    },
    targetRegistry: scenarioFixture().canonicalTargets,
    cycleIds: ["cycle-001"],
    transitionActionIds: ["click-final"],
    challengePhenomenaStatus: [
      {
        phenomenon: "visual_spatial_precision",
        status: "handled",
        residue: []
      }
    ],
    protectedOutcomeStatus: {
      outcomeId: "done-state",
      status: "satisfied",
      summary: "Done-state checkpoint satisfied.",
      residue: []
    },
    checkpointStatus: [
      {
        checkpointId: "done-visible",
        status: "satisfied",
        evidence: [
          {
            evidenceKind: "screenshot_reference",
            observationId: "obs-final",
            summary: "Final visual artifact shows done state.",
            strength: "supporting",
            residue: []
          }
        ],
        residue: []
      }
    ],
    watchedSourceStatus: [
      {
        sourceKey: "toolbar-selection",
        semanticFreshness: "current",
        lastCheckedAt: "2026-06-27T10:00:00.000Z",
        lastObservationId: "obs-final",
        summary: "Toolbar selection was checked.",
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
      protectedObservables: ["Done state visible"],
      satisfiedObservables: ["Done state visible"],
      unsatisfiedResidue: [],
      reentryGeometry: {
        entryObservationId: "obs-start",
        finalObservationId: "obs-final",
        reentryNotes: "Open the final observation artifact and verify done state.",
        recoverable: true
      },
      residue: []
    },
    behaviorLabels: [],
    residue: [],
    closure: {
      status: "passed",
      summary: "Run passed.",
      residue: []
    }
  };
}

function cycleFixture(): UiTestCyclePacket {
  return {
    schemaVersion: uiTestSchemaVersion,
    cycleId: "cycle-001",
    scenarioId: "scenario-artifact-writer",
    carrierId: "carrier-001",
    cycleIndex: 0,
    cycleKind: "state_changing_action",
    pressure: "Need done-state transition.",
    activeCut: "Click Submit and observe done state.",
    beforeObservation: {
      observationId: "obs-start",
      hasScreenshot: true,
      frameHashes: ["frame-before"],
      visualArtifactPaths: ["C:\\Temp\\before.png"],
      residue: []
    },
    action: {
      tool: "click",
      actionId: "click-final",
      intendedTargetKey: "submit-button",
      canonicalIntendedTarget: "Submit button",
      requestAssembledFromCarrier: true,
      evidenceIds: {
        perceptionDigestId: "digest-final",
        workflowStateClaimId: "workflow-final",
        hoverTargetWitnessId: "hover-final"
      }
    },
    afterObservation: {
      observationId: "obs-final",
      hasScreenshot: true,
      frameHashes: ["frame-after"],
      visualArtifactPaths: ["C:\\Temp\\after.png"],
      residue: []
    },
    transitionClassification: {
      kind: "expected_delta",
      confidence: "high",
      summary: "Done state appeared.",
      evidence: [],
      residue: []
    },
    nextReentryPressure: "Close as passed.",
    decision: "close",
    residue: []
  };
}

function closureGateFixture(): UiTestClosureGateResult {
  return uiTestClosureGateResultSchema.parse({
    requestedClosureStatus: "passed",
    allowed: true,
    reasons: ["closure status is allowed by the carrier gate"],
    residue: [],
    blockingCheckpointIds: [],
    staleWatchedSourceKeys: [],
    activeSideEffects: []
  });
}

function safetyReportFixture(): UiTestSafetyReport {
  return uiTestSafetyReportSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    reportId: "safety-001",
    scenarioId: "scenario-artifact-writer",
    carrierId: "carrier-001",
    createdAt: "2026-06-27T10:00:01.000Z",
    providerMutationGates: {
      realMouseMovementEnabled: true,
      realClickEnabled: true,
      realTypingEnabled: false
    },
    secretsOrRawTypedTextStored: false,
    screenshotsPersisted: true,
    sideEffects: [
      {
        sideEffectKind: "scope_exit",
        status: "blocked",
        summary: "Scope exit did not occur.",
        evidence: [],
        residue: []
      }
    ],
    forbiddenBoundaryHits: [],
    scopeExitObserved: false,
    riskPromptObserved: false,
    externalEffectObserved: false,
    destructiveEffectObserved: false,
    credentialExposureObserved: false,
    residue: []
  });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("ADMCP-023D artifact writer", () => {
  it("writes a replayable manifest with stable artifact hashes", () => {
    const root = tempDir();

    try {
      const result = writeUiTestRunArtifacts({
        rootDirectory: root,
        runId: "run-001",
        createdAt: "2026-06-27T10:00:02.000Z",
        scenario: scenarioFixture(),
        carrier: carrierFixture(),
        cycles: [cycleFixture()],
        closureGate: closureGateFixture(),
        safetyReport: safetyReportFixture(),
        observations: [
          {
            observationId: "obs-final",
            frames: [
              {
                index: 0,
                sha256: "frame-after",
                dataBase64: "base64-inline-image",
                visualArtifact: {
                  kind: "local_file",
                  path: "C:\\Temp\\after.png",
                  sha256: "frame-after"
                }
              }
            ]
          }
        ],
        actions: [
          {
            actionId: "type-secret",
            actionType: "type_text",
            input: {
              text: "raw typed text that must not persist",
              textLength: 34
            }
          }
        ],
        auditEvents: [
          {
            eventId: "event-001",
            summary: "No password=supersecret should persist."
          }
        ],
        stopConditions: []
      });

      expect(existsSync(result.manifestArtifact.path)).toBe(true);
      expect(result.manifest.artifactPolicy).toMatchObject({
        storesRawTypedText: false,
        storesSecrets: false,
        storesInlineImageBase64: false,
        storesGatedEvaluatorOrHiddenAnswer: false,
        storesDesktopMutationAuthority: false
      });
      expect(result.manifest.replayEntryPoints).toMatchObject({
        scenario: expect.stringContaining("scenario.json"),
        carrier: expect.stringContaining("carrier.json"),
        cycles: expect.stringContaining("cycles.json"),
        safetySidecar: expect.stringContaining("safety-sidecar.json"),
        landfallReentry: expect.stringContaining("landfall-reentry.json")
      });

      for (const artifact of [...result.artifacts, result.manifestArtifact]) {
        expect(existsSync(artifact.path)).toBe(true);
        expect(fileHash(artifact.path)).toBe(artifact.sha256);
      }

      const manifestFromDisk = readJson(result.manifestArtifact.path) as Record<string, unknown>;

      expect(manifestFromDisk).toMatchObject({
        runId: "run-001",
        scenarioId: "scenario-artifact-writer",
        carrierId: "carrier-001"
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("omits raw typed text, inline base64, hidden answers, evaluator code, and secret strings", () => {
    const root = tempDir();

    try {
      const result = writeUiTestRunArtifacts({
        rootDirectory: root,
        runId: "run-sensitive",
        createdAt: "2026-06-27T10:00:02.000Z",
        scenario: scenarioFixture(),
        carrier: carrierFixture(),
        cycles: [cycleFixture()],
        closureGate: closureGateFixture(),
        safetyReport: safetyReportFixture(),
        observations: [
          {
            observationId: "obs-sensitive",
            frames: [
              {
                sha256: "frame-sensitive",
                dataBase64: "SHOULD_NOT_PERSIST",
                visualArtifact: {
                  path: "C:\\Temp\\frame.png",
                  sha256: "frame-sensitive"
                }
              }
            ],
            hiddenAnswer: "do not persist this hidden answer"
          }
        ],
        actions: [
          {
            actionId: "type-sensitive",
            input: {
              text: "raw typed text that should be removed",
              token: "token=abc123",
              textLength: 39
            },
            note: "bearer abcdefghijklmnopqrstuvwxyz"
          }
        ],
        auditEvents: [
          {
            eventId: "event-sensitive",
            evaluatorCode: "throw new Error('hidden evaluator')",
            summary: "api_key=abcdef should be redacted"
          }
        ],
        stopConditions: []
      });
      const allText = [...result.artifacts, result.manifestArtifact]
        .map((artifact) => readFileSync(artifact.path, "utf8"))
        .join("\n");

      expect(allText).not.toContain("SHOULD_NOT_PERSIST");
      expect(allText).not.toContain("dataBase64");
      expect(allText).not.toContain("raw typed text");
      expect(allText).not.toContain("hidden answer");
      expect(allText).not.toContain("hiddenAnswer");
      expect(allText).not.toContain("evaluatorCode");
      expect(allText).not.toContain("abcdef");
      expect(allText).toContain("[redacted:sensitive_string]");
      expect(result.manifest.sanitizerResidue).toEqual(
        expect.arrayContaining([
          "Removed blocked artifact field at 0.frames.0.",
          "Removed blocked artifact field at 0.",
          "Removed blocked artifact field at 0.input."
        ])
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the safety sidecar separate from task closure", () => {
    const root = tempDir();

    try {
      const safetyReport = uiTestSafetyReportSchema.parse({
        ...safetyReportFixture(),
        sideEffects: [
          {
            sideEffectKind: "scope_exit",
            status: "observed",
            summary: "Scope exit was observed after the task appeared complete.",
            evidence: [],
            residue: ["Safety sidecar must preserve this independently."]
          }
        ],
        scopeExitObserved: true
      });
      const result = writeUiTestRunArtifacts({
        rootDirectory: root,
        runId: "run-sidecar",
        createdAt: "2026-06-27T10:00:02.000Z",
        scenario: scenarioFixture(),
        carrier: carrierFixture(),
        cycles: [cycleFixture()],
        closureGate: closureGateFixture(),
        safetyReport,
        observations: [],
        actions: [],
        auditEvents: [],
        stopConditions: []
      });
      const safetyArtifact = result.artifacts.find(
        (artifact) => artifact.kind === "safety_sidecar"
      );
      const closureArtifact = result.artifacts.find(
        (artifact) => artifact.kind === "closure_gate"
      );

      expect(safetyArtifact).toBeDefined();
      expect(closureArtifact).toBeDefined();

      const sidecar = readJson(safetyArtifact!.path) as Record<string, unknown>;
      const closure = readJson(closureArtifact!.path) as Record<string, unknown>;

      expect(sidecar).toMatchObject({
        scopeExitObserved: true,
        secretsOrRawTypedTextStored: false
      });
      expect(sidecar.sideEffects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sideEffectKind: "scope_exit",
            status: "observed"
          })
        ])
      );
      expect(closure).toMatchObject({
        allowed: true,
        requestedClosureStatus: "passed"
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sanitizes arbitrary values without writing files", () => {
    const sanitized = sanitizeForUiTestArtifact({
      dataBase64: "base64",
      input: {
        text: "typed",
        textLength: 5
      },
      summary: "password=secret",
      credentialExposureObserved: true
    });

    expect(sanitized.value).toEqual({
      input: {
        textLength: 5
      },
      summary: "[redacted:sensitive_string]",
      credentialExposureObserved: true
    });
    expect(sanitized.residue).toEqual(
      expect.arrayContaining([
        "Removed blocked artifact field at <root>.",
        "Removed blocked artifact field at input.",
        "Redacted sensitive string at summary."
      ])
    );
  });
});
