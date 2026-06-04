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
    name: "desktop-move-mouse-test-client",
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
  sessionId: "session-move-001",
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
      sessionId: "session-move-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      }
    }
  });
}

describe("desktop_move_mouse MCP tool", () => {
  it("rejects movement without an active session", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "missing-session",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "obs-before-001",
          point: {
            x: 120,
            y: 80
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.error).toMatchObject({
        code: "session_not_found"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks movement without a real pre-action observation record", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "missing-observation",
          point: {
            x: 120,
            y: 80
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "block"
      });
      expect(sessionStore.listActions("session-move-001")).toHaveLength(0);
      expect(sessionStore.listTransitionGates("session-move-001")).toHaveLength(0);
      expect(sessionStore.listAuditEvents("session-move-001")).toHaveLength(3);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records a mock movement probe and creates a pending transition gate", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);

      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          intendedSemanticTarget: "Submit button"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("requires_post_action_observation");
      expect(structured.action).toMatchObject({
        actionId: "action-fixed-4",
        actionType: "move_mouse",
        preActionObservationId: "observation-fixed-2"
      });
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: true,
        cursorPosition: {
          x: 120,
          y: 80
        }
      });
      expect(structured.transitionGate).toMatchObject({
        transitionId: "transition-fixed-6",
        actionId: "action-fixed-4",
        status: "pending_observation",
        sourceObservationId: "observation-fixed-2"
      });
      expect(sessionStore.listActions("session-move-001")).toHaveLength(1);
      expect(sessionStore.requireActiveSession("session-move-001").actionCount).toBe(1);
      expect(sessionStore.findBlockingTransitionGate("session-move-001")).toMatchObject({
        actionId: "action-fixed-4"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks the next non-observe action until the movement transition is observed", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          }
        }
      });

      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 160,
            y: 100
          }
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
      expect(sessionStore.listActions("session-move-001")).toHaveLength(1);
      expect(sessionStore.requireActiveSession("session-move-001").actionCount).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("audits post-movement observation and then allows another movement probe", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          }
        }
      });

      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-move-001",
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
        followUpObservationId: "observation-fixed-8",
        movementDeltaWitness: {
          intendedPoint: {
            x: 120,
            y: 80
          },
          providerReportedPoint: {
            x: 120,
            y: 80
          },
          observedPoint: {
            x: 120,
            y: 80
          },
          distanceFromIntendedPx: 0,
          cursorObserved: true,
          scopeStable: true,
          confidence: "high"
        }
      });
      expect(observeStructured.postActionAuditEvent).toMatchObject({
        eventType: "post_action_observed",
        actionId: "action-fixed-4",
        observationId: "observation-fixed-8"
      });
      expect(sessionStore.findBlockingTransitionGate("session-move-001")).toBeUndefined();

      const secondMoveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-8",
          point: {
            x: 160,
            y: 100
          }
        }
      });
      const secondMoveStructured = parseStructuredContent(secondMoveResult);

      expect(secondMoveResult.isError).not.toBe(true);
      expect(secondMoveStructured.action).toMatchObject({
        actionId: "action-fixed-11",
        actionType: "move_mouse",
        preActionObservationId: "observation-fixed-8"
      });
      expect(sessionStore.requireActiveSession("session-move-001").actionCount).toBe(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("escalates movement outside the licensed scope before provider calls", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);

      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-move-001",
          targetScope: {
            kind: "window_title",
            value: "Unrelated Private Window"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.policy).toMatchObject({
        decision: "escalate"
      });
      expect(sessionStore.listActions("session-move-001")).toHaveLength(0);
      expect(sessionStore.listTransitionGates("session-move-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
