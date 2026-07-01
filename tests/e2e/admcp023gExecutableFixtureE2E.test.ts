import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import process from "node:process";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import {
  type UiTestClosureGateResult,
  type UiTestCyclePacket,
  type UiTestObservationReference,
  type UiTestRunCarrier,
  type UiTestSafetyReport,
  type UiTestScenarioContract,
  uiTestClosureGateResultSchema,
  uiTestSafetyReportSchema,
  uiTestScenarioContractSchema,
  uiTestSchemaVersion
} from "../../src/session/uiTestCarrierSchemas.js";
import { writeUiTestRunArtifacts } from "../../src/session/uiTestArtifactWriter.js";

const sessionId = "session-admcp-023g-e2e";
const targetScope = {
  kind: "window_title",
  value: "Mock Desktop Window"
} as const;
const workflowGoal = "Open BodySlide from the ADMCP-023G local fixture workflow.";
const canonicalTarget = "Run button for committed BodySlide selection";
const clickPoint = {
  x: 240,
  y: 120
};

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  if (result.structuredContent !== undefined) {
    return result.structuredContent as Record<string, unknown>;
  }

  const textBlock = result.content.find(
    (block): block is { type: "text"; text: string } =>
      block.type === "text" && typeof block.text === "string"
  );

  return JSON.parse(textBlock?.text ?? "{}") as Record<string, unknown>;
}

function allStringEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    ...overrides
  };
}

async function connectActualServer() {
  const stderrChunks: string[] = [];
  const transport = new StdioClientTransport({
    command: join(
      process.cwd(),
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsx.cmd" : "tsx"
    ),
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: allStringEnv({
      ADMCP_DESKTOP_PROVIDER: "mock",
      ADMCP_ENABLE_REAL_OBSERVATION: "false",
      ADMCP_ENABLE_REAL_MOUSE_MOVEMENT: "false",
      ADMCP_ENABLE_REAL_CLICK: "false",
      ADMCP_ENABLE_REAL_TYPING: "false",
      ADMCP_ENABLE_REAL_APP_LAUNCH: "false"
    })
  });
  const stderr = transport.stderr;

  stderr?.on("data", (chunk) => {
    stderrChunks.push(String(chunk));
  });

  const client = new Client({
    name: "admcp-023g-executable-fixture-e2e",
    version: "0.1.0"
  });

  await client.connect(transport);

  return {
    client,
    stderrText: () => stderrChunks.join("")
  };
}

function startArguments() {
  return {
    sessionId,
    userGoal: workflowGoal,
    userConfirmed: true,
    visibleContentAcknowledged: true,
    allowedScopes: [targetScope],
    allowedActions: ["observe", "move_mouse", "click", "type_text"],
    forbiddenActions: [
      "credential_entry",
      "payment_or_purchase",
      "send_message",
      "external_publish",
      "destructive_file_operation",
      "shell_command",
      "system_change"
    ],
    licensedAppScope: {
      description:
        "ADMCP-023G executable local fixture scoped through the mock desktop provider.",
      scope: targetScope,
      userDeclaredReversible: true,
      allowedActions: ["observe", "move_mouse", "click", "type_text"],
      forbiddenBoundaries: [
        "credential_or_secret_prompt",
        "payment_or_purchase",
        "external_publish_or_deploy",
        "destructive_operation",
        "system_settings",
        "unrelated_private_window",
        "scope_exit"
      ],
      scopeExitStopConditions: ["outside_allowed_scope"]
    },
    riskLimits: {
      maxDurationMs: 3_600_000,
      maxActionCount: 30,
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
  };
}

function perceptionEvidence(evidence: string) {
  return {
    currentScene:
      "ADMCP-023G fixture main view with executable selector and same-label Run controls.",
    currentAnchor: "Committed executable selector and toolbar Run control",
    targetVisibility: "visible",
    anchorVisibility: "visible",
    contradictionToPriorClaim: null,
    staleCarryoverReviewed: true,
    currentEvidence: evidence
  };
}

function workflowEvidence(overrides: Record<string, unknown> = {}) {
  return {
    workflowGoal,
    workflowStep: "Run BodySlide only after the executable selector is committed to BodySlide.",
    intendedActionMeaning:
      "click the toolbar Run control after committed selector evidence proves BodySlide is selected",
    actionRole: "execute_committed_action",
    requiredPrecondition: "Collapsed executable selector shows BodySlide as the committed selection.",
    preconditionStatus: "satisfied",
    committedStateEvidence:
      "The current screenshot shows the selector collapsed with BodySlide committed; a transient dropdown highlight is not being used as proof.",
    transientStateRisk: "none",
    missingConfirmation: null,
    expectedPostcondition: "BodySlide launch state is visible after the Run click.",
    postconditionContradiction: "FNIS launches, no launch state appears, or a nearby Run control fires instead.",
    currentContradiction: null,
    staleCarryoverReviewed: true,
    ...overrides
  };
}

function compactClaim(
  sourceObservationId: string,
  pointProvenance:
    | "relational_estimate"
    | "relative_probe"
    | "hover_witness" = "relational_estimate"
) {
  return {
    sourceObservationId,
    intendedTarget: canonicalTarget,
    scene:
      "ADMCP-023G fixture main view; committed executable selector is the workflow anchor.",
    anchor: "Collapsed executable selector showing BodySlide",
    relation: "toolbar Run control to the right of the committed executable selector",
    candidate: "point is inside the toolbar Run action basin for the committed BodySlide selector",
    rejectedAlternative: "same-label Run button in a neighboring executable row",
    expectedEvidence: "hover or click transition keeps the toolbar Run relation to the committed selector",
    contradiction: "nearby row Run button or FNIS default launch is activated",
    pointProvenance
  };
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({
    name,
    arguments: args
  });

  if (result.isError) {
    throw new Error(
      `${name} failed: ${JSON.stringify(parseStructuredContent(result), null, 2)}`
    );
  }

  return parseStructuredContent(result);
}

function frameRecords(observation: Record<string, unknown>) {
  return (observation.frames as Array<Record<string, unknown>> | undefined) ?? [];
}

function observationReference(
  observation: Record<string, unknown>
): UiTestObservationReference {
  const frames = frameRecords(observation);
  const visualArtifactPaths = frames
    .map((frame) => (frame.visualArtifact as Record<string, unknown> | undefined)?.path)
    .filter((path): path is string => typeof path === "string");

  return {
    observationId: observation.observationId as string,
    observedAt: observation.observedAt as string | undefined,
    targetScope,
    hasScreenshot: frames.length > 0,
    frameHashes: frames
      .map((frame) => frame.sha256)
      .filter((sha): sha is string => typeof sha === "string"),
    visualArtifactPaths,
    residue: [
      "Observation was produced by the actual MCP stdio server using the mock provider.",
      ...(observation.residue as string[] | undefined ?? [])
    ]
  };
}

function sha256Text(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixturePath(): string {
  return join(process.cwd(), "fixtures", "admcp-023g-local-fixture", "index.html");
}

function scenarioFixture(fixtureSha256: string): UiTestScenarioContract {
  return uiTestScenarioContractSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    scenarioId: "admcp-023g-local-fixture",
    scenarioRevision: "rev-001",
    title: "ADMCP-023G executable local fixture e2e",
    userGoal: workflowGoal,
    sessionLicense: {
      userConfirmed: true,
      visibleContentAcknowledged: true,
      reversibleAppUnderTestDeclared: true,
      appUnderTestScope: {
        description:
          "The local fixture is reversible; automated e2e executes through the mock provider.",
        scope: targetScope,
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
      riskLimits: startArguments().riskLimits,
      observationCadence: startArguments().observationCadence
    },
    challengePhenomena: [
      "visual_spatial_precision",
      "dynamic_environment",
      "implicit_state_inference",
      "multi_item_state_tracking",
      "proactive_interaction"
    ],
    watchedSources: [
      {
        sourceKey: "committed-executable-selector",
        sourceKind: "app_panel",
        description:
          "Collapsed executable selector; transient dropdown highlight is insufficient.",
        authoritativeFor: ["committed-body-slide-selection"],
        recheckPolicy: "before_commit",
        semanticFreshnessWindowMs: 300_000,
        staleBlocks: ["execute_committed_action", "closure"]
      }
    ],
    protectedOutcome: {
      outcomeId: "body-slide-opened",
      description: "BodySlide is opened from the committed selector workflow.",
      checkpoints: [
        {
          checkpointId: "committed-selector-body-slide",
          description:
            "The collapsed selector shows BodySlide before the toolbar Run click.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["screenshot_reference", "workflow_postcondition"],
          insufficientEvidence: ["cursor_position", "frame_hash_delta"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        },
        {
          checkpointId: "body-slide-launch-result",
          description: "The post-click state supports BodySlide launch.",
          requiredForPass: true,
          criticalBlocker: true,
          acceptableEvidence: ["screenshot_reference", "workflow_postcondition"],
          insufficientEvidence: ["cursor_position", "frame_hash_delta"],
          frameHashEvidenceSufficient: false,
          partialCreditWeight: 0.5
        }
      ]
    },
    canonicalTargets: [
      {
        targetKey: "toolbar-run-body-slide",
        canonicalIntendedTarget: canonicalTarget,
        description:
          "Toolbar Run control licensed only after the committed selector is BodySlide.",
        targetScope,
        surfaceLabelHints: ["Run", "BodySlide"],
        forbiddenAliases: ["Run button for FNIS row", "nearby row Run button"],
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
      scenarioContractHash: fixtureSha256,
      gatedEvaluatorOrAnswerIncluded: false,
      externalReferences: [
        {
          kind: "runtime_artifact",
          ref: "fixtures/admcp-023g-local-fixture/index.html",
          revision: fixtureSha256
        }
      ]
    },
    residue: [
      "Automated CI path uses the mock provider against the actual MCP stdio server.",
      "Manual Windows path opens the static fixture outside the MCP server."
    ]
  });
}

function carrierFixture(input: {
  scenario: UiTestScenarioContract;
  capabilities: Record<string, unknown>;
  initialObservationId: string;
  finalObservationId: string;
  initialDigestId: string;
  finalDigestId: string;
  finalWorkflowStateClaimId: string;
  clickActionId: string;
  hoverTargetWitnessId: string;
}): UiTestRunCarrier {
  return {
    schemaVersion: uiTestSchemaVersion,
    carrierId: "carrier-admcp-023g-e2e",
    scenarioId: input.scenario.scenarioId,
    scenarioRevision: input.scenario.scenarioRevision,
    admcpServer: {
      serverVersion:
        ((input.capabilities.server as Record<string, unknown> | undefined)
          ?.version as string | undefined) ?? "0.1.0",
      capabilitiesSnapshotHash: sha256Text(input.capabilities)
    },
    session: {
      sessionId
    },
    current: {
      targetKey: "toolbar-run-body-slide",
      canonicalIntendedTarget: canonicalTarget,
      targetScope,
      observationId: input.finalObservationId,
      perceptionDigestId: input.finalDigestId,
      workflowStateClaimId: input.finalWorkflowStateClaimId,
      transitionActionId: input.clickActionId,
      hoverTargetWitnessId: input.hoverTargetWitnessId,
      repairExitRequired: false
    },
    targetRegistry: input.scenario.canonicalTargets,
    cycleIds: ["cycle-admcp-023g-hover", "cycle-admcp-023g-click"],
    transitionActionIds: [input.clickActionId],
    challengePhenomenaStatus: [
      {
        phenomenon: "visual_spatial_precision",
        status: "handled",
        residue: [
          "Click readiness required semantic landing and a hover witness; cursor position alone was not accepted."
        ]
      },
      {
        phenomenon: "implicit_state_inference",
        status: "handled",
        residue: [
          "Workflow evidence explicitly claimed committed BodySlide selection before Run."
        ]
      },
      {
        phenomenon: "dynamic_environment",
        status: "untested",
        residue: [
          "Static fixture exposes watched-source mutation; this mock e2e records the source as current."
        ]
      }
    ],
    protectedOutcomeStatus: {
      outcomeId: "body-slide-opened",
      status: "satisfied",
      summary:
        "The run reached the protected BodySlide launch postcondition through governed evidence.",
      residue: []
    },
    checkpointStatus: [
      {
        checkpointId: "committed-selector-body-slide",
        status: "satisfied",
        evidence: [
          {
            evidenceKind: "workflow_postcondition",
            observationId: input.initialObservationId,
            summary:
              "Initial workflow evidence declared the collapsed selector committed to BodySlide before Run.",
            strength: "sufficient_when_declared",
            residue: []
          }
        ],
        residue: []
      },
      {
        checkpointId: "body-slide-launch-result",
        status: "satisfied",
        evidence: [
          {
            evidenceKind: "workflow_postcondition",
            observationId: input.finalObservationId,
            transitionActionId: input.clickActionId,
            summary: "Post-click workflow evidence declared BodySlide launch state.",
            strength: "sufficient_when_declared",
            residue: []
          }
        ],
        residue: []
      }
    ],
    watchedSourceStatus: [
      {
        sourceKey: "committed-executable-selector",
        semanticFreshness: "current",
        lastCheckedAt: "2026-07-01T00:00:00.000Z",
        lastObservationId: input.initialObservationId,
        summary: "Committed selector was checked before executing toolbar Run.",
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
      protectedObservables: [
        "Committed selector shows BodySlide",
        "BodySlide launch postcondition satisfied"
      ],
      satisfiedObservables: [
        "Committed selector shows BodySlide",
        "BodySlide launch postcondition satisfied"
      ],
      unsatisfiedResidue: [],
      reentryGeometry: {
        entryObservationId: input.initialObservationId,
        finalObservationId: input.finalObservationId,
        reentryNotes:
          "Replay the observations, helper evidence, hover witness, click transition, and workflow postcondition artifacts.",
        recoverable: true
      },
      residue: [
        "Frame hashes and cursor position are recorded as telemetry, not proof by themselves."
      ]
    },
    behaviorLabels: [],
    residue: [
      "ADMCP-023G executable e2e used public MCP tools through stdio.",
      "No fixture startup, app launch, shell command, OCR, hidden polling, or real desktop mutation was added to the MCP server."
    ],
    closure: {
      status: "passed",
      summary: "Protected outcome satisfied with replayable governed evidence.",
      residue: []
    }
  };
}

function hoverCycle(input: {
  scenario: UiTestScenarioContract;
  before: UiTestObservationReference;
  after: UiTestObservationReference;
  moveActionId: string;
  initialDigestId: string;
  followUpDigestId: string;
  followUpWorkflowStateClaimId: string;
  hoverTargetWitnessId: string;
}): UiTestCyclePacket {
  return {
    schemaVersion: uiTestSchemaVersion,
    cycleId: "cycle-admcp-023g-hover",
    scenarioId: input.scenario.scenarioId,
    carrierId: "carrier-admcp-023g-e2e",
    cycleIndex: 0,
    cycleKind: "state_changing_action",
    pressure:
      "Need closed-loop hover evidence for the toolbar Run control without treating coordinates as proof.",
    activeCut:
      "Move to the relationally estimated Run point, observe the transition, submit semantic landing and click-candidate evidence.",
    beforeObservation: input.before,
    action: {
      tool: "move_mouse",
      actionId: input.moveActionId,
      intendedTargetKey: "toolbar-run-body-slide",
      canonicalIntendedTarget: canonicalTarget,
      requestAssembledFromCarrier: true,
      evidenceIds: {
        perceptionDigestId: input.initialDigestId
      }
    },
    afterObservation: input.after,
    transitionClassification: {
      kind: "expected_delta",
      confidence: "high",
      summary:
        "Semantic landing assessment supported the relation/candidate/rejected-alternative claim.",
      evidence: [
        {
          evidenceKind: "transition_classification",
          observationId: input.after.observationId,
          transitionActionId: input.moveActionId,
          summary: "Supported transition assessment unlocked hover witness readiness.",
          strength: "supporting",
          residue: []
        }
      ],
      residue: []
    },
    carrierUpdate: {
      updatedFields: [
        "current.perceptionDigestId",
        "current.workflowStateClaimId",
        "current.hoverTargetWitnessId"
      ],
      invalidatedFields: [],
      residueAdded: [
        `Hover witness ${input.hoverTargetWitnessId} became the click readiness witness.`
      ]
    },
    nextReentryPressure:
      "Click only with the current digest, workflow claim, hover witness, and matching point.",
    decision: "continue",
    residue: [
      `followUpDigestId=${input.followUpDigestId}`,
      `followUpWorkflowStateClaimId=${input.followUpWorkflowStateClaimId}`
    ]
  };
}

function clickCycle(input: {
  scenario: UiTestScenarioContract;
  before: UiTestObservationReference;
  after: UiTestObservationReference;
  clickActionId: string;
  perceptionDigestId: string;
  workflowStateClaimId: string;
  hoverTargetWitnessId: string;
}): UiTestCyclePacket {
  return {
    schemaVersion: uiTestSchemaVersion,
    cycleId: "cycle-admcp-023g-click",
    scenarioId: input.scenario.scenarioId,
    carrierId: "carrier-admcp-023g-e2e",
    cycleIndex: 1,
    cycleKind: "state_changing_action",
    pressure: "Execute the committed BodySlide Run action and verify the lookback.",
    activeCut:
      "Click the toolbar Run control using the hover witness, then observe and record workflow postcondition.",
    beforeObservation: input.before,
    action: {
      tool: "click",
      actionId: input.clickActionId,
      intendedTargetKey: "toolbar-run-body-slide",
      canonicalIntendedTarget: canonicalTarget,
      requestAssembledFromCarrier: true,
      evidenceIds: {
        perceptionDigestId: input.perceptionDigestId,
        workflowStateClaimId: input.workflowStateClaimId,
        hoverTargetWitnessId: input.hoverTargetWitnessId
      }
    },
    afterObservation: input.after,
    transitionClassification: {
      kind: "expected_delta",
      confidence: "high",
      summary:
        "Follow-up workflow postcondition was satisfied for the protected BodySlide launch outcome.",
      evidence: [
        {
          evidenceKind: "workflow_postcondition",
          observationId: input.after.observationId,
          transitionActionId: input.clickActionId,
          summary: "Post-click workflow claim recorded satisfied launch state.",
          strength: "sufficient_when_declared",
          residue: []
        }
      ],
      residue: []
    },
    carrierUpdate: {
      updatedFields: [
        "protectedOutcomeStatus",
        "checkpointStatus",
        "routeCarrier.reentryGeometry",
        "closure.status"
      ],
      invalidatedFields: [],
      residueAdded: []
    },
    nextReentryPressure: "Close as passed because protected outcome and reentry geometry are present.",
    decision: "close",
    residue: []
  };
}

function closureGateFixture(): UiTestClosureGateResult {
  return uiTestClosureGateResultSchema.parse({
    requestedClosureStatus: "passed",
    allowed: true,
    reasons: [
      "all required protected checkpoints are satisfied",
      "authoritative watched sources are current",
      "landfall reentry geometry is recoverable"
    ],
    residue: [],
    blockingCheckpointIds: [],
    staleWatchedSourceKeys: [],
    activeSideEffects: []
  });
}

function safetyReportFixture(input: {
  scenarioId: string;
  carrierId: string;
}): UiTestSafetyReport {
  return uiTestSafetyReportSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    reportId: "safety-admcp-023g-e2e",
    scenarioId: input.scenarioId,
    carrierId: input.carrierId,
    createdAt: "2026-07-01T00:00:00.000Z",
    providerMutationGates: {
      realMouseMovementEnabled: false,
      realClickEnabled: false,
      realTypingEnabled: false
    },
    secretsOrRawTypedTextStored: false,
    screenshotsPersisted: true,
    sideEffects: [
      {
        sideEffectKind: "scope_exit",
        status: "blocked",
        summary: "Scope exit did not occur during the mock-provider e2e.",
        evidence: [],
        residue: []
      },
      {
        sideEffectKind: "unbounded_desktop_control",
        status: "blocked",
        summary: "The server exposed no shell, arbitrary app launch, hidden polling, or broad desktop authority.",
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

describe("ADMCP-023G executable local fixture e2e", () => {
  it("drives the public MCP stdio protocol on the mock provider and writes replayable artifacts", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "admcp-023g-e2e-artifacts-"));
    const { client, stderrText } = await connectActualServer();

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          "desktop_observe",
          "desktop_submit_interaction_evidence",
          "desktop_move_mouse",
          "desktop_click",
          "desktop_session_audit_log"
        ])
      );

      const capabilities = await callTool(client, "desktop_capabilities", {});

      expect(capabilities.provider).toMatchObject({
        providerKind: "mock",
        realDesktopMutation: false
      });
      expect(capabilities.capabilities).toMatchObject({
        shellCommands: false,
        realDesktopMutation: false,
        applicationCatalogLaunchOnly: true,
        interactionEvidenceHelper: true
      });

      const start = await callTool(
        client,
        "desktop_start_interaction_session",
        startArguments()
      );

      expect(start.status).toBe("active");
      expect(start.nextRequiredStep).toMatchObject({
        tool: "desktop_observe",
        arguments: expect.objectContaining({
          sessionId,
          includeImages: true
        })
      });

      const initialObserve = await callTool(client, "desktop_observe", {
        sessionId,
        targetScope,
        includeImages: true
      });
      const initialObservation = initialObserve.observation as Record<string, unknown>;
      const initialObservationId = initialObservation.observationId as string;
      const initialObservationRef = observationReference(initialObservation);

      expect(initialObserve.visualArtifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "local_file",
            mimeType: "image/png"
          })
        ])
      );
      for (const path of initialObservationRef.visualArtifactPaths) {
        expect(existsSync(path)).toBe(true);
      }

      const initialEvidence = await callTool(
        client,
        "desktop_submit_interaction_evidence",
        {
          sessionId,
          observationId: initialObservationId,
          targetScope,
          intendedTarget: canonicalTarget,
          evidenceMode: "new_target",
          perception: perceptionEvidence(
            "Screenshot artifact was inspected; selector is collapsed with BodySlide committed and toolbar Run is visible."
          ),
          workflow: workflowEvidence()
        }
      );
      const initialDigestId = initialEvidence.perceptionDigestId as string;

      const move = await callTool(client, "desktop_move_mouse", {
        sessionId,
        targetScope,
        preActionObservationId: initialObservationId,
        point: clickPoint,
        perceptionDigestId: initialDigestId,
        intendedSemanticTarget: canonicalTarget,
        compactRelationalClaim: compactClaim(initialObservationId)
      });
      const moveAction = move.action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;

      expect(move.status).toBe("requires_post_action_observation");
      expect(move.providerResult).toMatchObject({
        executed: true,
        simulated: true
      });

      const followUpObserve = await callTool(client, "desktop_observe", {
        sessionId,
        targetScope,
        includeImages: true,
        transitionActionId: moveActionId
      });
      const followUpObservation = followUpObserve.observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const followUpObservationRef = observationReference(followUpObservation);

      const clickReadiness = await callTool(
        client,
        "desktop_submit_interaction_evidence",
        {
          sessionId,
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: canonicalTarget,
          evidenceMode: "same_target",
          perception: perceptionEvidence(
            "Follow-up screenshot artifact was inspected; hover remains on toolbar Run tied to committed BodySlide selector."
          ),
          workflow: workflowEvidence({
            transitionActionId: moveActionId,
            postconditionStatus: "satisfied",
            expectedPostcondition:
              "Movement leaves the cursor on the toolbar Run control for the committed BodySlide selector."
          }),
          transitionAssessment: {
            actionId: moveActionId,
            assessment: {
              outcome: "supported",
              relationHeld: true,
              candidateSupported: true,
              rejectedAlternativeAvoided: true,
              expectedEvidenceSeen:
                "Run control remains related to the committed BodySlide selector; row Run alternatives are avoided.",
              contradictionSeen: false,
              summary:
                "Semantic landing supports toolbar Run for committed BodySlide, not a same-label row Run."
            }
          },
          clickCandidate: {
            candidatePoint: clickPoint
          }
        }
      );

      expect(clickReadiness.clickCandidateStatus).toBe("candidate_ready");
      expect(clickReadiness.nextRequiredStep).toMatchObject({
        tool: "desktop_click"
      });

      const followUpDigestId = clickReadiness.perceptionDigestId as string;
      const followUpWorkflowStateClaimId =
        clickReadiness.workflowStateClaimId as string;
      const hoverTargetWitnessId = clickReadiness.hoverTargetWitnessId as string;

      const click = await callTool(client, "desktop_click", {
        sessionId,
        targetScope,
        preActionObservationId: followUpObservationId,
        point: clickPoint,
        button: "left",
        perceptionDigestId: followUpDigestId,
        workflowStateClaimId: followUpWorkflowStateClaimId,
        hoverTargetWitnessId,
        intendedSemanticTarget: canonicalTarget,
        compactRelationalClaim: compactClaim(followUpObservationId, "hover_witness")
      });
      const clickAction = click.action as Record<string, unknown>;
      const clickActionId = clickAction.actionId as string;

      expect(click.status).toBe("requires_post_action_observation");
      expect(click.providerResult).toMatchObject({
        executed: true,
        simulated: true,
        clickedButton: "left"
      });

      const postClickObserve = await callTool(client, "desktop_observe", {
        sessionId,
        targetScope,
        includeImages: true,
        transitionActionId: clickActionId
      });
      const postClickObservation = postClickObserve.observation as Record<string, unknown>;
      const postClickObservationId = postClickObservation.observationId as string;
      const postClickObservationRef = observationReference(postClickObservation);

      const postClickEvidence = await callTool(
        client,
        "desktop_submit_interaction_evidence",
        {
          sessionId,
          observationId: postClickObservationId,
          targetScope,
          intendedTarget: "BodySlide launched state",
          evidenceMode: "new_target",
          perception: {
            currentScene: "ADMCP-023G fixture launch-result view.",
            currentAnchor: "Protected outcome panel",
            targetVisibility: "visible",
            anchorVisibility: "visible",
            contradictionToPriorClaim: null,
            staleCarryoverReviewed: true,
            currentEvidence:
              "Follow-up screenshot artifact was inspected; BodySlide launch state is visible."
          },
          workflow: {
            workflowGoal,
            workflowStep: "Verify BodySlide launch postcondition after Run click.",
            intendedActionMeaning:
              "record the satisfied launch postcondition without requesting another desktop mutation",
            actionRole: "not_applicable",
            requiredPrecondition: "No further desktop mutation is needed for closure.",
            preconditionStatus: "not_applicable",
            committedStateEvidence:
              "The post-click screenshot supports the BodySlide launch postcondition.",
            transientStateRisk: "none",
            missingConfirmation: null,
            expectedPostcondition: "BodySlide launch result remains visible.",
            postconditionContradiction:
              "FNIS launch result appears, no launch result appears, or scope exits.",
            currentContradiction: null,
            transitionActionId: clickActionId,
            postconditionStatus: "satisfied",
            staleCarryoverReviewed: true
          }
        }
      );

      expect(postClickEvidence.status).toBe("accepted");

      const audit = await callTool(client, "desktop_session_audit_log", {
        sessionId
      });

      expect(audit.auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "action_allowed",
            actionId: clickActionId
          })
        ])
      );

      const fixtureSha256 = sha256File(fixturePath());
      const scenario = scenarioFixture(fixtureSha256);
      const carrier = carrierFixture({
        scenario,
        capabilities,
        initialObservationId,
        finalObservationId: postClickObservationId,
        initialDigestId,
        finalDigestId: postClickEvidence.perceptionDigestId as string,
        finalWorkflowStateClaimId:
          postClickEvidence.workflowStateClaimId as string,
        clickActionId,
        hoverTargetWitnessId
      });
      const cycles = [
        hoverCycle({
          scenario,
          before: initialObservationRef,
          after: followUpObservationRef,
          moveActionId,
          initialDigestId,
          followUpDigestId,
          followUpWorkflowStateClaimId,
          hoverTargetWitnessId
        }),
        clickCycle({
          scenario,
          before: followUpObservationRef,
          after: postClickObservationRef,
          clickActionId,
          perceptionDigestId: followUpDigestId,
          workflowStateClaimId: followUpWorkflowStateClaimId,
          hoverTargetWitnessId
        })
      ];
      const closureGate = closureGateFixture();
      const safetyReport = safetyReportFixture({
        scenarioId: scenario.scenarioId,
        carrierId: carrier.carrierId
      });
      const artifactResult = writeUiTestRunArtifacts({
        rootDirectory: artifactRoot,
        runId: "admcp-023g-mock-stdio",
        createdAt: "2026-07-01T00:00:00.000Z",
        scenario,
        carrier,
        cycles,
        closureGate,
        safetyReport,
        observations: [initialObservation, followUpObservation, postClickObservation],
        actions: [moveAction, clickAction],
        auditEvents: audit.auditEvents as unknown[],
        stopConditions: audit.stopConditions as unknown[]
      });

      expect(artifactResult.manifest.artifactPolicy).toMatchObject({
        storesRawTypedText: false,
        storesSecrets: false,
        storesInlineImageBase64: false,
        storesDesktopMutationAuthority: false
      });
      expect(artifactResult.manifest.artifacts.map((artifact) => artifact.kind)).toEqual(
        expect.arrayContaining([
          "scenario",
          "carrier",
          "cycles",
          "observations",
          "actions",
          "audit_events",
          "stop_conditions",
          "closure_gate",
          "landfall_reentry",
          "safety_sidecar"
        ])
      );
      expect(artifactResult.manifestArtifact.kind).toBe("manifest");
      expect(existsSync(artifactResult.manifestArtifact.path)).toBe(true);
      expect(existsSync(artifactResult.manifest.replayEntryPoints.scenario)).toBe(
        true
      );
      expect(existsSync(artifactResult.manifest.replayEntryPoints.carrier)).toBe(
        true
      );
      expect(artifactResult.sanitizerResidue).not.toEqual(
        expect.arrayContaining([expect.stringContaining("secret")])
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nServer stderr:\n${stderrText()}`
      );
    } finally {
      await client.close();
      rmSync(artifactRoot, {
        recursive: true,
        force: true
      });
    }
  }, 60_000);
});
