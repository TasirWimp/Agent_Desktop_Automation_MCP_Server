import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";
import {
  WindowsDesktopObservationProvider,
  type WindowsActiveWindowSnapshot,
  type WindowsCapturedFrame,
  type WindowsObservationBackend
} from "../../src/providers/windowsDesktopObservationProvider.js";
import type { DesktopPoint } from "../../src/policy/sessionLicensePolicy.js";

const fixedNow = "2026-05-28T10:00:00.000Z";
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const activeWindow: WindowsActiveWindowSnapshot = {
  windowId: "hwnd:0x123",
  title: "Generated Test App",
  processName: "node",
  appName: "Generated Test App",
  bounds: {
    left: 10,
    top: 20,
    width: 640,
    height: 480
  }
};

class FakeWindowsBackend implements WindowsObservationBackend {
  public captureCount = 0;
  public movedPoints: DesktopPoint[] = [];
  private cursorPosition: DesktopPoint;

  constructor(
    private readonly metadata: WindowsActiveWindowSnapshot = activeWindow,
    cursorPosition: DesktopPoint = {
      x: activeWindow.bounds.left + 12,
      y: activeWindow.bounds.top + 8
    }
  ) {
    this.cursorPosition = cursorPosition;
  }

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    return this.metadata;
  }

  async getCursorPosition(): Promise<DesktopPoint> {
    return this.cursorPosition;
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    this.captureCount += 1;
    return {
      ...this.metadata,
      dataBase64: pngBase64
    };
  }

  async moveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    this.movedPoints.push(point);
    this.cursorPosition = point;

    return this.cursorPosition;
  }
}

async function createConnectedClient(
  backend = new FakeWindowsBackend(),
  enableRealMouseMovement = false
) {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    desktopProvider: new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement,
      frameDelay: async () => undefined
    }),
    now: () => fixedNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "windows-observe-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    sessionStore,
    backend
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
  sessionId: "session-real-observe-001",
  userGoal: "Observe the generated app window.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowedScopes: [
    {
      kind: "window_title",
      value: "Generated Test App"
    }
  ],
  allowedActions: ["observe"],
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

describe("desktop_observe with WindowsDesktopObservationProvider", () => {
  it("reports real observation provider capabilities without real mutation", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_capabilities",
        arguments: {}
      });
      const structured = parseJsonText(result);

      expect(structured.provider).toMatchObject({
        providerKind: "real",
        realDesktopCapture: true,
        realDesktopMouseMovement: false,
        realDesktopMutation: false,
        supportsMouse: false,
        supportsClick: false,
        supportsTyping: false
      });
      expect(structured.capabilities).toMatchObject({
        mockDesktopProvider: false,
        realDesktopObservation: true,
        realDesktopMouseMovement: false,
        realDesktopMutation: false,
        desktopMouseKeyboardTools: false,
        executeDesktopActions: false
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records bounded real-provider observation metadata for a scoped active window", async () => {
    const { client, server, sessionStore, backend } = await createConnectedClient();

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          mode: "single_frame",
          includeImages: false
        }
      });
      const structured = parseStructuredContent(result);
      const observation = structured.observation as Record<string, unknown>;
      const frames = observation.frames as Record<string, unknown>[];

      expect(result.isError).not.toBe(true);
      expect(structured.providerCapabilities).toMatchObject({
        providerKind: "real",
        realDesktopCapture: true,
        realDesktopMouseMovement: false,
        realDesktopMutation: false
      });
      expect(observation.activeWindow).toMatchObject({
        windowId: "hwnd:0x123",
        title: "Generated Test App",
        processName: "node"
      });
      expect(observation.cursorPosition).toEqual({
        x: 12,
        y: 8
      });
      expect(observation.cursorWitness).toMatchObject({
        status: "observed",
        coordinateSpace: "active_window_frame",
        renderedIntoFrame: false,
        providerSource: "windows_active_window_observation_provider"
      });
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({
        width: 640,
        height: 480,
        mimeType: "image/png",
        witness: {
          pixelSource: "raw",
          cursorRenderedIntoFrame: false
        }
      });
      expect(observation.hoverWitness).toMatchObject({
        evaluated: false,
        confidence: "low"
      });
      expect(observation.providerTiming).toMatchObject({
        providerName: "windows_active_window_observation_provider",
        providerKind: "real",
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: "active_window_metadata_lookup"
          }),
          expect.objectContaining({
            operation: "frame_0_capture_active_window_png"
          })
        ]),
        residue: expect.arrayContaining([
          "Provider timing is diagnostic only and is not used as policy evidence."
        ])
      });
      expect(frames[0]?.dataBase64).toBeUndefined();
      expect(backend.captureCount).toBe(1);
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("binds active_window observation scope to concrete window identity", async () => {
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
          ]
        }
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
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
        value: "hwnd:0x123"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records opt-in real mouse movement and creates a pending transition gate", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(backend, true);

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "move_mouse"]
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          }
        }
      });
      const result = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          intendedSemanticTarget: "File menu"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("requires_post_action_observation");
      expect(structured.providerCapabilities).toMatchObject({
        supportsMouse: true,
        supportsClick: false,
        supportsTyping: false,
        realDesktopMouseMovement: true,
        realDesktopMutation: false
      });
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: false,
        cursorPosition: {
          x: 120,
          y: 80
        }
      });
      expect(structured.transitionGate).toMatchObject({
        status: "pending_observation",
        sourceObservationId: "observation-fixed-2"
      });
      expect(backend.movedPoints).toEqual([
        {
          x: 130,
          y: 100
        }
      ]);
      expect(sessionStore.findBlockingTransitionGate("session-real-observe-001")).toMatchObject({
        status: "pending_observation"
      });

      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
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
          scopeStable: true
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps click disabled even when real mouse movement is enabled", async () => {
    const { client, server, sessionStore } = await createConnectedClient(
      new FakeWindowsBackend(),
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "click"],
          licensedAppScope: {
            description: "Generated Test App is a local reversible UI test fixture.",
            scope: {
              kind: "window_title",
              value: "Generated Test App"
            },
            userDeclaredReversible: true,
            allowedActions: ["observe", "click"],
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
          }
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          }
        }
      });
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          intendedSemanticTarget: "File menu"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.status).toBe("blocked");
      expect(structured.providerCapabilities).toMatchObject({
        supportsMouse: true,
        supportsClick: false,
        realDesktopMouseMovement: true,
        realDesktopMutation: false
      });
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns controlled errors and records no observation on provider scope mismatch", async () => {
    const backend = new FakeWindowsBackend({
      ...activeWindow,
      title: "Private Browser Window"
    });
    const { client, server, sessionStore } = await createConnectedClient(backend);

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: startArguments
      });
      const result = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.error).toMatchObject({
        code: "scope_mismatch"
      });
      expect(backend.captureCount).toBe(0);
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
