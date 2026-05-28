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

  constructor(private readonly metadata: WindowsActiveWindowSnapshot = activeWindow) {}

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    return this.metadata;
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    this.captureCount += 1;
    return {
      ...this.metadata,
      dataBase64: pngBase64
    };
  }
}

async function createConnectedClient(backend = new FakeWindowsBackend()) {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    desktopProvider: new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
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
        realDesktopMutation: false,
        supportsMouse: false,
        supportsClick: false,
        supportsTyping: false
      });
      expect(structured.capabilities).toMatchObject({
        mockDesktopProvider: false,
        realDesktopObservation: true,
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
        realDesktopMutation: false
      });
      expect(observation.activeWindow).toMatchObject({
        windowId: "hwnd:0x123",
        title: "Generated Test App",
        processName: "node"
      });
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({
        width: 640,
        height: 480,
        mimeType: "image/png"
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
