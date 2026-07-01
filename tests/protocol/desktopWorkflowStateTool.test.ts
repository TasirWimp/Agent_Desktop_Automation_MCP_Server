import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";

const fixedNow = "2026-05-27T10:00:00.000Z";
const targetScope = {
  kind: "window_title",
  value: "Generated Test App"
};

async function createConnectedClient() {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    now: () => fixedNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "desktop-workflow-state-test-client",
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

const startArguments = {
  sessionId: "session-workflow-001",
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

async function startAndObserve(client: Client) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: startArguments
  });

  return client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-workflow-001",
      targetScope,
      includeImages: true
    }
  });
}

async function submitDigest(client: Client, observationId: string, intendedTarget = "Run button") {
  const result = await client.callTool({
    name: "desktop_submit_perception_digest",
    arguments: {
      sessionId: "session-workflow-001",
      observationId,
      targetScope,
      intendedTarget,
      currentScene: "Generated Test App main view.",
      currentAnchor: `${intendedTarget} row`,
      targetVisibility: "visible",
      anchorVisibility: "visible",
      continuityWithPriorClaim: "consistent",
      contradictionToPriorClaim: null,
      staleCarryoverReviewed: true,
      currentEvidence: `The current screenshot shows ${intendedTarget}.`
    }
  });
  const structured = parseStructuredContent(result);

  return structured.perceptionDigestId as string;
}

function workflowClaimArguments(
  observationId: string,
  perceptionDigestId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    sessionId: "session-workflow-001",
    observationId,
    perceptionDigestId,
    targetScope,
    workflowGoal: "Open BodySlide in Mod Organizer.",
    workflowStep: "Run only after the executable selection is committed.",
    intendedElementTarget: "Run button",
    intendedActionMeaning: "click Run after BodySlide is committed",
    actionRole: "execute_committed_action",
    requiredPrecondition: "BodySlide is the committed executable selection.",
    preconditionStatus: "satisfied",
    committedStateEvidence: "The collapsed executable selector shows BodySlide.",
    transientStateRisk: "none",
    missingConfirmation: null,
    expectedPostcondition: "BodySlide opens.",
    postconditionContradiction: "FNIS or another executable opens.",
    currentContradiction: null,
    staleCarryoverReviewed: true,
    ...overrides
  };
}

describe("desktop_submit_workflow_state_claim MCP tool", () => {
  it("records a workflow-state claim for the latest screenshot-bearing observation", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const result = await client.callTool({
        name: "desktop_submit_workflow_state_claim",
        arguments: workflowClaimArguments("observation-fixed-2", digestId)
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("accepted");
      expect(structured.workflowStateClaim).toMatchObject({
        observationId: "observation-fixed-2",
        perceptionDigestId: digestId,
        intendedElementTarget: "Run button",
        status: "accepted"
      });
      expect(sessionStore.listWorkflowStateClaims("session-workflow-001")).toHaveLength(1);
      expect(sessionStore.listAuditEvents("session-workflow-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "workflow_state_claim_recorded",
            observationId: "observation-fixed-2"
          })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("normalizes safe none sentinels without erasing contradiction text", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const result = await client.callTool({
        name: "desktop_submit_workflow_state_claim",
        arguments: workflowClaimArguments("observation-fixed-2", digestId, {
          missingConfirmation: "none",
          currentContradiction: "no contradiction observed"
        })
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.workflowStateClaim).toMatchObject({
        missingConfirmation: null,
        currentContradiction: null
      });
      expect(structured.residue).toEqual(
        expect.arrayContaining([
          'missingConfirmation sentinel "none" was normalized to JSON null.',
          'currentContradiction sentinel "no contradiction observed" was normalized to JSON null.'
        ])
      );
      expect(sessionStore.listWorkflowStateClaims("session-workflow-001")[0]).toMatchObject({
        missingConfirmation: null,
        currentContradiction: null
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects stale and target-mismatched workflow claims", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const secondObserveResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-workflow-001",
          targetScope,
          includeImages: true
        }
      });
      const secondObservation = parseStructuredContent(secondObserveResult).observation as Record<string, unknown>;
      const staleResult = await client.callTool({
        name: "desktop_submit_workflow_state_claim",
        arguments: workflowClaimArguments("observation-fixed-2", digestId)
      });
      const freshDigestId = await submitDigest(
        client,
        secondObservation.observationId as string
      );
      const mismatchResult = await client.callTool({
        name: "desktop_submit_workflow_state_claim",
        arguments: workflowClaimArguments(secondObservation.observationId as string, freshDigestId, {
          intendedElementTarget: "Delete button"
        })
      });

      expect(staleResult.isError).toBe(true);
      expect(parseStructuredContent(staleResult).error).toMatchObject({
        code: "workflow_state_claim_not_latest"
      });
      expect(mismatchResult.isError).toBe(true);
      const mismatchContent = parseStructuredContent(mismatchResult);
      expect(mismatchContent.error).toMatchObject({
        code: "workflow_state_claim_target_mismatch"
      });
      expect(mismatchContent.agentGuidance).toMatchObject({
        code: "target_canonical_drift",
        immediateAction: expect.stringContaining("omit workflow.intendedElementTarget"),
        sourceDocs: expect.arrayContaining([
          expect.objectContaining({
            path: "docs/planning/admcp_023_carrier_state_design.md"
          })
        ])
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records contradicted workflow postconditions on observed transition gates", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const workflowStateClaimId = (
        parseStructuredContent(
          await client.callTool({
            name: "desktop_submit_workflow_state_claim",
            arguments: workflowClaimArguments("observation-fixed-2", digestId, {
              actionRole: "text_entry",
              intendedActionMeaning: "type generated input into the workflow field"
            })
          })
        ).workflowStateClaimId
      ) as string;
      const actionResult = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-workflow-001",
          targetScope,
          preActionObservationId: "observation-fixed-2",
          perceptionDigestId: digestId,
          workflowStateClaimId,
          text: "generated input",
          intendedSemanticTarget: "Run button",
          compactRelationalClaim: {
            sourceObservationId: "observation-fixed-2",
            intendedTarget: "Run button",
            scene: "Generated Test App main view.",
            anchor: "Run button row",
            relation: "target control in the same row/right-side action area",
            candidate: "point is inside that row action basin",
            rejectedAlternative: "nearby launch button for another app",
            expectedEvidence: "row/control highlights or opens target",
            contradiction: "another row/control highlights or opens",
            pointProvenance: "relational_estimate"
          }
        }
      });
      const action = parseStructuredContent(actionResult).action as Record<string, unknown>;
      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-workflow-001",
          targetScope,
          includeImages: true,
          transitionActionId: action.actionId
        }
      });
      const followUpObservation = parseStructuredContent(observeResult).observation as Record<string, unknown>;
      const followUpDigestId = await submitDigest(
        client,
        followUpObservation.observationId as string
      );
      const result = await client.callTool({
        name: "desktop_submit_workflow_state_claim",
        arguments: workflowClaimArguments(followUpObservation.observationId as string, followUpDigestId, {
          transitionActionId: action.actionId,
          postconditionStatus: "contradicted",
          currentContradiction: "FNIS opened instead of BodySlide.",
          committedStateEvidence: "The follow-up screenshot shows the wrong executable window."
        })
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.transitionGate).toMatchObject({
        actionId: action.actionId,
        workflowPostconditionAssessment: {
          postconditionStatus: "contradicted"
        },
        postActionClassification: {
          kind: "wrong_target",
          disposition: "repair_allowed"
        }
      });
      expect(sessionStore.requireActiveSession("session-workflow-001").repairAttemptCount).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
