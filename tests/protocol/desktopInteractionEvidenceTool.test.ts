import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";

const fixedNow = "2026-05-27T10:00:00.000Z";

async function createConnectedClient() {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    now: () => fixedNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "desktop-interaction-evidence-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    sessionStore
  };
}

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  return result.structuredContent as Record<string, unknown>;
}

const targetScope = {
  kind: "window_title",
  value: "Generated Test App"
};

const startArguments = {
  sessionId: "session-interaction-evidence-001",
  userGoal: "Run the generated app UI test scenario.",
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
    description: "Generated Test App is a local reversible UI test fixture.",
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
    maxDurationMs: 60_000,
    maxActionCount: 20,
    maxConsecutiveRepairAttempts: 3,
    allowCredentialEntry: false,
    allowDestructiveFileOperations: false,
    allowSystemChanges: false,
    allowExternalPublishing: false
  },
  observationCadence: {
    beforeEveryAction: true,
    afterEveryStateChangingAction: true,
    maxObservationGapMs: 5_000
  }
};

function compactClaim(sourceObservationId: string) {
  return {
    sourceObservationId,
    intendedTarget: "Submit button",
    scene: "Generated Test App main view.",
    anchor: "Submit row",
    relation: "target control in the same row/right-side action area",
    candidate: "point is inside that row action basin",
    rejectedAlternative: "nearby launch button for another app",
    expectedEvidence: "row/control highlights or opens target",
    contradiction: "another row/control highlights or opens",
    pointProvenance: "relational_estimate"
  };
}

async function startAndObserve(client: Client) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: startArguments
  });

  const observeResult = await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-interaction-evidence-001",
      targetScope,
      includeImages: true
    }
  });

  return parseStructuredContent(observeResult).observation as Record<string, unknown>;
}

function perceptionEvidence(evidence: string) {
  return {
    currentScene: "Generated Test App main view.",
    currentAnchor: "Submit row",
    targetVisibility: "visible",
    anchorVisibility: "visible",
    contradictionToPriorClaim: null,
    staleCarryoverReviewed: true,
    currentEvidence: evidence
  };
}

function workflowEvidence() {
  return {
    workflowGoal: "Run the generated app UI test scenario.",
    workflowStep: "Submit the generated app form.",
    intendedElementTarget: "Submit button",
    intendedActionMeaning: "click Submit after committed workflow state is ready",
    actionRole: "execute_committed_action",
    requiredPrecondition: "The Submit button is the committed next workflow action.",
    preconditionStatus: "satisfied",
    committedStateEvidence: "The current screenshot shows Submit as the committed next action.",
    transientStateRisk: "none",
    missingConfirmation: null,
    expectedPostcondition: "The submit action changes the generated app state.",
    postconditionContradiction: "A different control or workflow state changes.",
    currentContradiction: null,
    staleCarryoverReviewed: true
  };
}

describe("desktop_submit_interaction_evidence MCP tool", () => {
  it("records digest, workflow, transition assessment, and click candidate without desktop mutation", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const initialObservation = await startAndObserve(client);
      const initialObservationId = initialObservation.observationId as string;
      const initialEvidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: initialObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: perceptionEvidence("Initial screenshot shows the Submit control.")
        }
      });
      const initialEvidence = parseStructuredContent(initialEvidenceResult);

      expect(initialEvidenceResult.isError).not.toBe(true);
      expect(initialEvidence.status).toBe("accepted");

      const moveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          preActionObservationId: initialObservationId,
          point: {
            x: 120,
            y: 80
          },
          perceptionDigestId: initialEvidence.perceptionDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim(initialObservationId)
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const followUpResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(followUpResult)
        .observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const evidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "same_target",
          perception: perceptionEvidence("Follow-up screenshot confirms Submit hover target."),
          workflow: workflowEvidence(),
          transitionAssessment: {
            actionId: moveActionId,
            assessment: {
              outcome: "supported",
              relationHeld: true,
              candidateSupported: true,
              rejectedAlternativeAvoided: true,
              expectedEvidenceSeen: "row/control highlights or opens target",
              contradictionSeen: false,
              summary: "Follow-up screenshot supports the target row/control."
            }
          },
          clickCandidate: {
            movementActionId: moveActionId,
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const evidence = parseStructuredContent(evidenceResult);

      expect(evidenceResult.isError).not.toBe(true);
      expect(evidence.status).toBe("accepted");
      expect(evidence.perceptionDigestId).toEqual(expect.stringMatching(/^perception-digest-/u));
      expect(evidence.workflowStateClaimId).toEqual(expect.stringMatching(/^workflow-state-/u));
      expect(evidence.hoverTargetWitnessId).toEqual(expect.stringMatching(/^hover-witness-/u));
      expect(evidence.clickCandidateStatus).toBe("candidate_ready");
      expect(evidence.created).toMatchObject({
        workflowStateClaim: {
          actionRole: "execute_committed_action"
        },
        transitionGate: {
          status: "audited"
        },
        hoverTargetWitness: {
          sourceMoveActionId: moveActionId
        }
      });
      expect(evidence.nextRequiredStep).toMatchObject({
        tool: "desktop_click"
      });
      expect(sessionStore.listActions("session-interaction-evidence-001")).toHaveLength(1);
      expect(sessionStore.listHoverTargetWitnesses("session-interaction-evidence-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
