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
    name: "desktop-click-type-test-client",
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
  sessionId: "session-click-type-001",
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
  licensedAppScope: {
    description: "Generated Test App is a local reversible UI test fixture.",
    scope: {
      kind: "window_title",
      value: "Generated Test App"
    },
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
      sessionId: "session-click-type-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      }
    }
  });
}

describe("desktop_click and desktop_type_text MCP tools", () => {
  it("records a mock click and creates a pending transition gate", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 240,
            y: 120
          },
          button: "left",
          intendedSemanticTarget: "Submit button"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("requires_post_action_observation");
      expect(structured.action).toMatchObject({
        actionId: "action-fixed-4",
        actionType: "click",
        preActionObservationId: "observation-fixed-2",
        input: {
          point: {
            x: 240,
            y: 120
          },
          button: "left"
        }
      });
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: true,
        clickedButton: "left"
      });
      expect(structured.transitionGate).toMatchObject({
        transitionId: "transition-fixed-6",
        actionId: "action-fixed-4",
        status: "pending_observation"
      });
      expect(sessionStore.listActions("session-click-type-001")).toHaveLength(1);
      expect(sessionStore.findBlockingTransitionGate("session-click-type-001")).toMatchObject({
        actionId: "action-fixed-4"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("audits post-click observation before allowing another non-observe action", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 240,
            y: 120
          }
        }
      });

      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          transitionActionId: "action-fixed-4"
        }
      });
      const observeStructured = parseStructuredContent(observeResult);

      expect(observeResult.isError).not.toBe(true);
      expect(observeStructured.transitionGate).toMatchObject({
        actionId: "action-fixed-4",
        status: "audited",
        followUpObservationId: "observation-fixed-8"
      });
      expect(sessionStore.findBlockingTransitionGate("session-click-type-001")).toBeUndefined();

      const typeResult = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-8",
          text: "generated input",
          intendedSemanticTarget: "Name input"
        }
      });
      const typeStructured = parseStructuredContent(typeResult);

      expect(typeResult.isError).not.toBe(true);
      expect(typeStructured.action).toMatchObject({
        actionId: "action-fixed-11",
        actionType: "type_text",
        input: {
          textLength: 15
        }
      });
      expect(sessionStore.requireActiveSession("session-click-type-001").actionCount).toBe(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records mock text entry without storing text content", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          text: "generated input",
          intendedSemanticTarget: "Name input"
        }
      });
      const structured = parseStructuredContent(result);
      const action = structured.action as Record<string, unknown>;

      expect(result.isError).not.toBe(true);
      expect(action).toMatchObject({
        actionId: "action-fixed-4",
        actionType: "type_text",
        input: {
          textLength: 15
        }
      });
      expect(JSON.stringify(action)).not.toContain("generated input");
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: true,
        typedTextLength: 15
      });
      expect(sessionStore.findBlockingTransitionGate("session-click-type-001")).toMatchObject({
        actionId: "action-fixed-4"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks credential-like text before provider calls and does not store text content", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          text: "password=supersecret",
          intendedSemanticTarget: "Password input"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "block"
      });
      expect(JSON.stringify(structured.action)).not.toContain("supersecret");
      expect(sessionStore.listActions("session-click-type-001")).toHaveLength(0);
      expect(sessionStore.listTransitionGates("session-click-type-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("escalates low-recoverability clicks before provider calls", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 240,
            y: 120
          },
          risk: {
            recoverability: "low"
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "escalate"
      });
      expect(sessionStore.listActions("session-click-type-001")).toHaveLength(0);
      expect(sessionStore.listTransitionGates("session-click-type-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks click or typing while a previous transition gate is pending", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 240,
            y: 120
          }
        }
      });

      const result = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          text: "generated input"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.stopCondition).toMatchObject({
        condition: "missing_post_action_observation"
      });
      expect(structured.blockingTransitionGate).toMatchObject({
        actionId: "action-fixed-4",
        status: "pending_observation"
      });
      expect(sessionStore.listActions("session-click-type-001")).toHaveLength(1);
      expect(sessionStore.requireActiveSession("session-click-type-001").actionCount).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
