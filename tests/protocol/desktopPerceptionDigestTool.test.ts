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
    name: "desktop-perception-digest-test-client",
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
  sessionId: "session-digest-001",
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

async function startAndObserve(client: Client, includeImages = true) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: startArguments
  });

  return client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-digest-001",
      targetScope,
      includeImages
    }
  });
}

function digestArguments(observationId: string) {
  return {
    sessionId: "session-digest-001",
    observationId,
    targetScope,
    intendedTarget: "Submit button",
    currentScene: "Generated Test App main view.",
    currentAnchor: "Submit row",
    targetVisibility: "visible",
    anchorVisibility: "visible",
    continuityWithPriorClaim: "consistent",
    contradictionToPriorClaim: null,
    staleCarryoverReviewed: true,
    currentEvidence: "The current screenshot shows the target row/control."
  };
}

describe("desktop_submit_perception_digest MCP tool", () => {
  it("records a digest for the latest screenshot-bearing observation", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_submit_perception_digest",
        arguments: digestArguments("observation-fixed-2")
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("accepted");
      expect(structured.perceptionDigest).toMatchObject({
        observationId: "observation-fixed-2",
        intendedTarget: "Submit button",
        status: "accepted"
      });
      expect(sessionStore.listPerceptionDigests("session-digest-001")).toHaveLength(1);
      expect(sessionStore.listAuditEvents("session-digest-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "perception_digest_recorded",
            observationId: "observation-fixed-2"
          })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("stores exact no-contradiction sentinel strings as JSON null", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_submit_perception_digest",
        arguments: {
          ...digestArguments("observation-fixed-2"),
          contradictionToPriorClaim: "none"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.perceptionDigest).toMatchObject({
        contradictionToPriorClaim: null
      });
      expect(structured.residue).toEqual(
        expect.arrayContaining([
          'contradictionToPriorClaim sentinel "none" was normalized to JSON null.'
        ])
      );
      expect(sessionStore.listPerceptionDigests("session-digest-001")[0]).toMatchObject({
        contradictionToPriorClaim: null
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps non-sentinel contradiction strings as blocking evidence", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_submit_perception_digest",
        arguments: {
          ...digestArguments("observation-fixed-2"),
          contradictionToPriorClaim: "none of the expected target is visible"
        }
      });

      expect(sessionStore.listPerceptionDigests("session-digest-001")[0]).toMatchObject({
        contradictionToPriorClaim: "none of the expected target is visible"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects digest submission for a non-latest observation", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-digest-001",
          targetScope,
          includeImages: true
        }
      });
      const result = await client.callTool({
        name: "desktop_submit_perception_digest",
        arguments: digestArguments("observation-fixed-2")
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.error).toMatchObject({
        code: "perception_digest_not_latest"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects digest submission without screenshot image payload", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client, false);
      const result = await client.callTool({
        name: "desktop_submit_perception_digest",
        arguments: digestArguments("observation-fixed-2")
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.error).toMatchObject({
        code: "missing_frame_evidence"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
