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

function compactClaim(
  sourceObservationId: string,
  intendedTarget = "Submit button",
  pointProvenance:
    | "relational_estimate"
    | "relative_probe"
    | "hover_witness" = "relational_estimate"
) {
  return {
    sourceObservationId,
    intendedTarget,
    scene: "Generated Test App main view.",
    anchor: "Submit row",
    relation: "target control in the same row/right-side action area",
    candidate: "point is inside that row action basin",
    rejectedAlternative: "nearby launch button for another app",
    expectedEvidence: "row/control highlights or opens target",
    contradiction: "another row/control highlights or opens",
    pointProvenance
  };
}

async function prepareHoverWitness(client: Client) {
  await client.callTool({
    name: "desktop_move_mouse",
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
      intendedSemanticTarget: "Submit button",
      compactRelationalClaim: compactClaim("observation-fixed-2")
    }
  });
  await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-click-type-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      includeImages: true,
      transitionActionId: "action-fixed-4"
    }
  });
  await client.callTool({
    name: "desktop_submit_transition_assessment",
    arguments: {
      sessionId: "session-click-type-001",
      actionId: "action-fixed-4",
      assessment: {
        outcome: "supported",
        relationHeld: true,
        candidateSupported: true,
        rejectedAlternativeAvoided: true,
        expectedEvidenceSeen: "row/control highlights or opens target",
        contradictionSeen: false,
        summary: "Follow-up screenshot supports the target row/control."
      }
    }
  });
  const candidateResult = await client.callTool({
    name: "desktop_evaluate_click_candidate",
    arguments: {
      sessionId: "session-click-type-001",
      observationId: "observation-fixed-8",
      movementActionId: "action-fixed-4",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      intendedSemanticTarget: "Submit button",
      candidatePoint: {
        x: 240,
        y: 120
      }
    }
  });
  const candidate = parseStructuredContent(candidateResult);
  const hoverTargetWitness = candidate.hoverTargetWitness as Record<string, unknown>;

  return {
    observationId: "observation-fixed-8",
    hoverTargetWitnessId: hoverTargetWitness.witnessId as string
  };
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
      },
      includeImages: true
    }
  });
}

describe("desktop_click and desktop_type_text MCP tools", () => {
  it("records a mock click and creates a pending transition gate", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const witness = await prepareHoverWitness(client);
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: witness.observationId,
          point: {
            x: 240,
            y: 120
          },
          button: "left",
          intendedSemanticTarget: "Submit button",
          hoverTargetWitnessId: witness.hoverTargetWitnessId,
          compactRelationalClaim: compactClaim(witness.observationId, "Submit button", "hover_witness")
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("requires_post_action_observation");
      expect(structured.action).toMatchObject({
        actionType: "click",
        preActionObservationId: witness.observationId,
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
        status: "pending_observation"
      });
      expect(sessionStore.listActions("session-click-type-001")).toHaveLength(2);
      expect(sessionStore.findBlockingTransitionGate("session-click-type-001")).toMatchObject({
        status: "pending_observation"
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
      const witness = await prepareHoverWitness(client);
      const clickResult = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: witness.observationId,
          point: {
            x: 240,
            y: 120
          },
          intendedSemanticTarget: "Submit button",
          hoverTargetWitnessId: witness.hoverTargetWitnessId,
          compactRelationalClaim: compactClaim(witness.observationId, "Submit button", "hover_witness")
        }
      });
      const clickAction = (parseStructuredContent(clickResult).action as Record<string, unknown>);

      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: clickAction.actionId
        }
      });
      const observeStructured = parseStructuredContent(observeResult);

      expect(observeResult.isError).not.toBe(true);
      expect(observeStructured.transitionGate).toMatchObject({
        actionId: clickAction.actionId,
        status: "audited",
      });
      expect(sessionStore.findBlockingTransitionGate("session-click-type-001")).toBeUndefined();
      const postObservation = observeStructured.observation as Record<string, unknown>;

      const typeResult = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: postObservation.observationId,
          text: "generated input",
          intendedSemanticTarget: "Name input",
          compactRelationalClaim: compactClaim(postObservation.observationId as string, "Name input")
        }
      });
      const typeStructured = parseStructuredContent(typeResult);

      expect(typeResult.isError).not.toBe(true);
      expect(typeStructured.action).toMatchObject({
        actionType: "type_text",
        input: {
          textLength: 15
        }
      });
      expect(sessionStore.requireActiveSession("session-click-type-001").actionCount).toBe(3);
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
          intendedSemanticTarget: "Name input",
          compactRelationalClaim: compactClaim("observation-fixed-2", "Name input")
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
          intendedSemanticTarget: "Password input",
          compactRelationalClaim: compactClaim("observation-fixed-2", "Password input")
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
          compactRelationalClaim: compactClaim("observation-fixed-2", "Submit button", "hover_witness"),
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
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-click-type-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          text: "first input",
          intendedSemanticTarget: "Name input",
          compactRelationalClaim: compactClaim("observation-fixed-2", "Name input")
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
          text: "generated input",
          compactRelationalClaim: compactClaim("observation-fixed-2", "Name input")
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
