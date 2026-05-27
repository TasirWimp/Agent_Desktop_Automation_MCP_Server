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
    name: "session-tools-test-client",
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
  sessionId: "session-protocol-001",
  userGoal: "Run the generated app UI test scenario.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowedScopes: [
    {
      kind: "window_title",
      value: "Generated Test App"
    }
  ],
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

describe("session MCP tools", () => {
  it("lists session, observe, and mock action tools", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          "desktop_start_interaction_session",
          "desktop_end_interaction_session",
          "desktop_session_audit_log",
          "desktop_observe",
          "desktop_move_mouse",
          "desktop_click",
          "desktop_type_text"
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("starts a confirmed interaction session and writes the initial audit event", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.sessionId).toBe("session-protocol-001");
      expect(structured.status).toBe("active");
      expect(structured.policy).toMatchObject({
        decision: "allow",
        requiresUserConfirmation: false
      });
      expect(sessionStore.listAuditEvents("session-protocol-001")).toHaveLength(1);
      expect(sessionStore.listAuditEvents("session-protocol-001")[0]).toMatchObject({
        eventType: "session_started",
        summary: "Started licensed desktop interaction session."
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects session start without user confirmation", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          userConfirmed: false
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "requires_session_confirmation",
        requiresUserConfirmation: true
      });
      expect(sessionStore.getSession("session-protocol-001")).toBeUndefined();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects session start without visible-content acknowledgement", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          visibleContentAcknowledged: false
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "requires_session_confirmation",
        requiresUserConfirmation: true
      });
      expect(sessionStore.getSession("session-protocol-001")).toBeUndefined();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("ends a session and returns its audit log", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const endResult = await client.callTool({
        name: "desktop_end_interaction_session",
        arguments: {
          sessionId: "session-protocol-001",
          reason: "Scenario complete."
        }
      });
      const endStructured = parseStructuredContent(endResult);

      expect(endResult.isError).not.toBe(true);
      expect(endStructured.status).toBe("ended");
      expect(endStructured.auditEvent).toMatchObject({
        eventType: "session_stopped",
        summary: "Scenario complete."
      });

      const auditResult = await client.callTool({
        name: "desktop_session_audit_log",
        arguments: {
          sessionId: "session-protocol-001"
        }
      });
      const auditStructured = parseStructuredContent(auditResult);

      expect(auditResult.isError).not.toBe(true);
      expect(auditStructured.auditEvents).toHaveLength(2);
      expect(auditStructured.session).toMatchObject({
        sessionId: "session-protocol-001",
        status: "ended"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
