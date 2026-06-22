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
    name: "desktop-observe-test-client",
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

function parseJsonText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const textBlock = result.content.find((block) => block.type === "text");

  if (textBlock === undefined || textBlock.type !== "text") {
    throw new Error("Expected a text content block.");
  }

  return JSON.parse(textBlock.text) as Record<string, unknown>;
}

const startArguments = {
  sessionId: "session-observe-001",
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

describe("desktop_observe MCP tool", () => {
  it("reports mock observation capability without real desktop observation or control", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_capabilities",
        arguments: {}
      });
      const structured = parseJsonText(result);

      expect(structured.capabilities).toMatchObject({
        mockDesktopProvider: true,
        mockDesktopMovement: true,
        mockDesktopClick: true,
        mockDesktopTyping: true,
        desktopObserveTool: true,
        desktopMoveMouseTool: true,
        desktopClickTool: true,
        desktopTypeTextTool: true,
        postActionRepairClassification: true,
        realDesktopObservation: false,
        realDesktopMutation: false,
        desktopMouseKeyboardTools: false,
        executeDesktopActions: false,
        tieredEvidenceFreshness: true,
        hoverWitnessRevalidation: true,
        firstUseGuide: true
      });
      expect(structured.usageGuidance).toMatchObject({
        firstUseGuide: {
          firstCall: {
            tool: "desktop_first_use_guide"
          },
          requiredLoop: expect.arrayContaining([
            "desktop_observe with includeImages: true",
            "inspect the returned MCP image content block from frame dataBase64",
            "desktop_submit_perception_digest for the latest screenshot-bearing observation"
          ]),
          evidenceRules: expect.arrayContaining([
            expect.stringContaining("MCP image content blocks"),
            expect.stringContaining("latest screenshot-bearing observation"),
            expect.stringContaining("newer desktop_observe invalidates older"),
            expect.stringContaining("Coordinates are action endpoints only")
          ]),
          scopeRules: expect.arrayContaining([
            expect.stringContaining("scope_exit means the active window drifted")
          ])
        },
        recommendedObservationCadence: {
          realWindowsProviderMaxDurationMs: 3_600_000,
          realWindowsProviderMaxObservationGapMs: 180_000,
          realWindowsProviderEvidenceFreshness: {
            perceptionDigestMaxAgeMs: 300_000,
            hoverWitnessMaxAgeMs: 300_000
          }
        }
      });
      expect(
        structured.usageGuidance.recommendedObservationCadence.rule
      ).toContain("observationCadence.maxObservationGapMs=180000");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns the compact first-use guide as a read-only tool", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const tools = await client.listTools();
      const guideTool = tools.tools.find((tool) => tool.name === "desktop_first_use_guide");

      expect(guideTool).toBeDefined();
      expect(guideTool?.inputSchema).toMatchObject({
        type: "object",
        properties: {}
      });
      expect(guideTool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false
      });

      const capabilitiesResult = await client.callTool({
        name: "desktop_capabilities",
        arguments: {}
      });
      const guideResult = await client.callTool({
        name: "desktop_first_use_guide",
        arguments: {}
      });
      const capabilities = parseJsonText(capabilitiesResult);
      const guide = parseJsonText(guideResult);

      expect(guide).toEqual(capabilities.usageGuidance.firstUseGuide);
      expect(guide.sourceDocs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "docs/process/codex_desktop_interaction_reentry.md"
          })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects observation without an active session", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "missing-session",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
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

  it("records a bounded mock observation and audit event for an active session", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          maxFrames: 2,
          durationMs: 100
        }
      });
      const structured = parseStructuredContent(result);
      const observation = structured.observation as Record<string, unknown>;
      const frames = observation.frames as Record<string, unknown>[];

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("observed");
      expect(observation).toMatchObject({
        observationId: "observation-fixed-2",
        sessionId: "session-observe-001",
        observedAt: fixedNow,
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        }
      });
      expect(frames).toHaveLength(2);
      expect(frames[0]).toMatchObject({
        index: 0,
        mimeType: "image/png",
        width: 1,
        height: 1,
        witness: {
          pixelSource: "raw",
          cursorRenderedIntoFrame: false
        }
      });
      expect(observation.cursorWitness).toMatchObject({
        status: "observed",
        position: {
          x: 320,
          y: 180
        },
        coordinateSpace: "active_window_frame",
        renderedIntoFrame: false
      });
      expect(structured.providerCapabilities).toMatchObject({
        providerKind: "mock",
        realDesktopCapture: false,
        realDesktopMutation: false
      });
      expect(structured.appScopeBinding).toMatchObject({
        sessionId: "session-observe-001",
        licensedScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        observationId: "observation-fixed-2"
      });
      expect(sessionStore.getBoundAppScope("session-observe-001")).toMatchObject({
        observationId: "observation-fixed-2"
      });
      expect(sessionStore.listObservations("session-observe-001")).toHaveLength(1);
      expect(sessionStore.listAuditEvents("session-observe-001")).toHaveLength(3);
      expect(sessionStore.listAuditEvents("session-observe-001")[1]).toMatchObject({
        eventType: "observation_recorded",
        observationId: "observation-fixed-2"
      });
      expect(sessionStore.listAuditEvents("session-observe-001")[2]).toMatchObject({
        eventType: "app_scope_bound",
        observationId: "observation-fixed-2"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns optional MCP image blocks for inline mock frames", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          mode: "single_frame",
          includeImages: true
        }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "image",
            mimeType: "image/png"
          })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("binds provisional active_window scope to observed mock window identity", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedScopes: [
            {
              kind: "active_window"
            }
          ],
          allowedActions: ["observe"],
          licensedAppScope: undefined
        }
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-observe-001",
          targetScope: {
            kind: "active_window"
          }
        }
      });
      const structured = parseStructuredContent(result);
      const observation = structured.observation as Record<string, unknown>;

      expect(result.isError).not.toBe(true);
      expect(observation.targetScope).toEqual({
        kind: "active_window",
        value: "mock-desktop-provider:Mock Desktop Window"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks observation outside the session scope without recording provider output", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Unrelated Private Window"
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.stopCondition).toMatchObject({
        condition: "outside_allowed_scope"
      });
      expect(sessionStore.listObservations("session-observe-001")).toHaveLength(0);
      expect(sessionStore.listAuditEvents("session-observe-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks observation when observe is not licensed by the session", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["move_mouse"],
          licensedAppScope: undefined
        }
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.stopCondition).toMatchObject({
        condition: "action_not_allowed"
      });
      expect(sessionStore.listObservations("session-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
