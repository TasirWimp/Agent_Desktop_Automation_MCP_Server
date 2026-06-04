import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import type {
  DesktopObserveRequest,
  DesktopObserveResult
} from "../../src/providers/desktopProvider.js";
import { MockDesktopProvider } from "../../src/providers/mockDesktopProvider.js";
import type { DesktopWindowMetadata } from "../../src/policy/sessionLicensePolicy.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";

const fixedNow = "2026-05-27T10:00:00.000Z";

interface ScriptedProviderOptions {
  postActionSummary?: string;
  postActionFrames?: "same" | "changed" | "empty";
  postActionActiveWindow?: DesktopWindowMetadata;
}

class ScriptedPostActionProvider extends MockDesktopProvider {
  private observeCount = 0;

  constructor(private readonly script: ScriptedProviderOptions = {}) {
    super();
  }

  override async observe(request: DesktopObserveRequest): Promise<DesktopObserveResult> {
    this.observeCount += 1;
    const result = await super.observe(request);

    if (this.observeCount < 2) {
      return result;
    }

    const summary = this.script.postActionSummary;
    const frames =
      this.script.postActionFrames === "empty"
        ? []
        : this.script.postActionFrames === "changed"
          ? result.frames.map((frame) => ({
              ...frame,
              byteLength: frame.byteLength + 1,
              sha256: `${frame.sha256}-changed-${this.observeCount}`
            }))
          : result.frames;

    return {
      ...result,
      activeWindow: this.script.postActionActiveWindow ?? result.activeWindow,
      frames,
      lastActionDeltaSummary: summary ?? result.lastActionDeltaSummary,
      residue: [...result.residue, ...(summary === undefined ? [] : [summary])]
    };
  }
}

async function createConnectedClient(
  provider = new ScriptedPostActionProvider(),
  startOverrides: Partial<typeof startArguments> = {}
) {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    desktopProvider: provider,
    now: () => fixedNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "post-action-repair-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    sessionStore,
    startArguments: {
      ...startArguments,
      ...startOverrides
    }
  };
}

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  return result.structuredContent as Record<string, unknown>;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const startArguments = {
  sessionId: "session-repair-001",
  userGoal: "Run the generated app UI test scenario.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowedScopes: [
    {
      kind: "window_title",
      value: "Generated Test App"
    }
  ],
  allowedActions: ["observe", "click", "type_text"],
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
    allowedActions: ["observe", "click", "type_text"],
    forbiddenBoundaries: [
      "credential_or_secret_prompt",
      "payment_or_purchase",
      "external_publish_or_deploy",
      "destructive_operation",
      "system_settings",
      "unrelated_private_window",
      "scope_exit",
      "uninterpretable_state"
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

async function startObserveClickAndPostObserve(client: Client) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: startArguments
  });

  const beforeResult = await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-repair-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      }
    }
  });
  const before = parseStructuredContent(beforeResult);
  const beforeObservation = nestedRecord(before.observation);
  const clickResult = await client.callTool({
    name: "desktop_click",
    arguments: {
      sessionId: "session-repair-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      preActionObservationId: beforeObservation.observationId,
      point: {
        x: 240,
        y: 120
      },
      intendedSemanticTarget: "Submit button"
    }
  });
  const click = parseStructuredContent(clickResult);
  const action = nestedRecord(click.action);

  const postResult = await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-repair-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      transitionActionId: action.actionId
    }
  });

  return {
    before,
    click,
    postResult,
    post: parseStructuredContent(postResult)
  };
}

describe("post-action observation and repair-loop classification", () => {
  it("classifies expected post-action delta and resets repair attempts", async () => {
    const { client, server, sessionStore } = await createConnectedClient(
      new ScriptedPostActionProvider({
        postActionSummary: "expected delta: visible state changes after click"
      })
    );

    try {
      const { postResult, post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(postResult.isError).not.toBe(true);
      expect(transitionGate).toMatchObject({
        status: "audited"
      });
      expect(classification).toMatchObject({
        kind: "expected_delta",
        disposition: "complete",
        repairLimitReached: false
      });
      expect(sessionStore.requireActiveSession("session-repair-001").repairAttemptCount).toBe(0);
      expect(sessionStore.requireActiveSession("session-repair-001").stopConditions).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("classifies no-op observations as bounded repair paths", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const { postResult, post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(postResult.isError).not.toBe(true);
      expect(transitionGate).toMatchObject({
        status: "audited"
      });
      expect(classification).toMatchObject({
        kind: "no_op",
        disposition: "repair_allowed",
        repairAttemptCount: 1,
        repairLimitReached: false
      });
      expect(sessionStore.requireActiveSession("session-repair-001").repairAttemptCount).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("classifies wrong-target observations as bounded repair paths", async () => {
    const { client, server, sessionStore } = await createConnectedClient(
      new ScriptedPostActionProvider({
        postActionSummary: "wrong target: nearby menu opened instead"
      })
    );

    try {
      const { post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(transitionGate).toMatchObject({
        status: "audited"
      });
      expect(classification).toMatchObject({
        kind: "wrong_target",
        disposition: "repair_allowed",
        repairAttemptCount: 1
      });
      expect(sessionStore.requireActiveSession("session-repair-001").repairAttemptCount).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("stops when bounded repairs reach the session repair limit", async () => {
    const { client, server, sessionStore, startArguments: limitedStartArguments } =
      await createConnectedClient(undefined, {
        riskLimits: {
          ...startArguments.riskLimits,
          maxConsecutiveRepairAttempts: 1
        }
      });

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: limitedStartArguments
      });
      const firstObserveResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-repair-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          }
        }
      });
      const firstObservation = nestedRecord(parseStructuredContent(firstObserveResult).observation);
      const firstClickResult = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-repair-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: firstObservation.observationId,
          point: {
            x: 240,
            y: 120
          }
        }
      });
      const firstAction = nestedRecord(parseStructuredContent(firstClickResult).action);
      const firstPostResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-repair-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          transitionActionId: firstAction.actionId
        }
      });
      const firstPostObservation = nestedRecord(
        parseStructuredContent(firstPostResult).observation
      );

      expect(sessionStore.requireActiveSession("session-repair-001").repairAttemptCount).toBe(1);

      const secondClickResult = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-repair-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: firstPostObservation.observationId,
          point: {
            x: 245,
            y: 124
          }
        }
      });
      const secondAction = nestedRecord(parseStructuredContent(secondClickResult).action);
      const secondPostResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-repair-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          transitionActionId: secondAction.actionId
        }
      });
      const secondPost = parseStructuredContent(secondPostResult);
      const transitionGate = nestedRecord(secondPost.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(transitionGate).toMatchObject({
        status: "escalation_required"
      });
      expect(classification).toMatchObject({
        kind: "no_op",
        repairAttemptCount: 1,
        repairLimitReached: true
      });
      expect(secondPost.postActionStopCondition).toMatchObject({
        condition: "max_repair_attempts_reached"
      });
      expect(sessionStore.findBlockingTransitionGate("session-repair-001")).toMatchObject({
        status: "escalation_required"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("escalates forbidden boundary prompts from post-action evidence", async () => {
    const { client, server, sessionStore } = await createConnectedClient(
      new ScriptedPostActionProvider({
        postActionSummary: "payment prompt appeared after click"
      })
    );

    try {
      const { post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(transitionGate).toMatchObject({
        status: "escalation_required"
      });
      expect(classification).toMatchObject({
        kind: "risk_prompt",
        disposition: "stop_or_escalate"
      });
      expect(post.postActionStopCondition).toMatchObject({
        condition: "forbidden_boundary_detected"
      });
      expect(sessionStore.requireActiveSession("session-repair-001").stopConditions).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("escalates uninterpretable post-action observations without frame evidence", async () => {
    const { client, server } = await createConnectedClient(
      new ScriptedPostActionProvider({
        postActionFrames: "empty"
      })
    );

    try {
      const { post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(transitionGate).toMatchObject({
        status: "escalation_required"
      });
      expect(classification).toMatchObject({
        kind: "uninterpretable_state",
        disposition: "stop_or_escalate"
      });
      expect(post.postActionStopCondition).toMatchObject({
        condition: "uninterpretable_post_action_state"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("marks transition gates as scope exit when post-action observation leaves the bound app", async () => {
    const { client, server, sessionStore } = await createConnectedClient(
      new ScriptedPostActionProvider({
        postActionActiveWindow: {
          title: "Private Browser Window",
          processName: "browser",
          appName: "Private Browser Window"
        }
      })
    );

    try {
      const { postResult, post } = await startObserveClickAndPostObserve(client);
      const transitionGate = nestedRecord(post.transitionGate);
      const classification = nestedRecord(transitionGate.postActionClassification);

      expect(postResult.isError).toBe(true);
      expect(post.status).toBe("scope_exit");
      expect(transitionGate).toMatchObject({
        status: "escalation_required"
      });
      expect(classification).toMatchObject({
        kind: "scope_exit",
        disposition: "stop_or_escalate"
      });
      expect(post.postActionAuditEvent).toMatchObject({
        eventType: "escalation_required"
      });
      expect(sessionStore.listObservations("session-repair-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
