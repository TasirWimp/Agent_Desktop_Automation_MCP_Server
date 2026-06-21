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
  public clickedPoints: Array<{ point: DesktopPoint; button: "left" | "middle" | "right" }> = [];
  public typedTexts: string[] = [];
  private cursorPosition: DesktopPoint;

  constructor(
    public metadata: WindowsActiveWindowSnapshot = activeWindow,
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

  async clickMouseAt(
    point: DesktopPoint,
    button: "left" | "middle" | "right"
  ): Promise<DesktopPoint> {
    this.clickedPoints.push({
      point,
      button
    });
    this.cursorPosition = point;

    return this.cursorPosition;
  }

  async typeText(text: string): Promise<number> {
    this.typedTexts.push(text);

    return text.length;
  }
}

async function createConnectedClient(
  backend = new FakeWindowsBackend(),
  enableRealMouseMovement = false,
  enableRealClick = false,
  enableRealTyping = false,
  initialNow = fixedNow
) {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  let currentNow = initialNow;
  const server = createServer({
    sessionStore,
    desktopProvider: new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement,
      enableRealClick,
      enableRealTyping,
      frameDelay: async () => undefined
    }),
    now: () => currentNow,
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
    backend,
    setNow: (nextNow: string) => {
      currentNow = nextNow;
    }
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
    scene: "Generated Test App active window.",
    anchor: "target control row",
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
      intendedSemanticTarget: "Submit button",
      compactRelationalClaim: compactClaim("observation-fixed-2")
    }
  });
  await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-real-observe-001",
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
      sessionId: "session-real-observe-001",
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
      sessionId: "session-real-observe-001",
      observationId: "observation-fixed-8",
      movementActionId: "action-fixed-4",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      intendedSemanticTarget: "Submit button",
      candidatePoint: {
        x: 120,
        y: 80
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

function licensedAppScopeFor(
  scope: Record<string, unknown>,
  allowedActions = ["observe"]
) {
  return {
    description: "Generated Test App is a local reversible UI test fixture.",
    scope,
    userDeclaredReversible: true,
    allowedActions,
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
  };
}

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

  it("reports app-scoped real click capability only when the click gate is enabled", async () => {
    const { client, server } = await createConnectedClient(
      new FakeWindowsBackend(),
      false,
      true
    );

    try {
      const result = await client.callTool({
        name: "desktop_capabilities",
        arguments: {}
      });
      const structured = parseJsonText(result);

      expect(structured.provider).toMatchObject({
        providerKind: "real",
        realDesktopCapture: true,
        realDesktopMouseMovement: true,
        realDesktopMutation: true,
        supportsMouse: false,
        supportsClick: true,
        supportsTyping: false
      });
      expect(structured.capabilities).toMatchObject({
        executeDesktopActions: true,
        realDesktopClick: true,
        realDesktopMutation: true,
        closedLoopClickExecution: false
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reports app-scoped real typing capability only when the typing gate is enabled", async () => {
    const { client, server } = await createConnectedClient(
      new FakeWindowsBackend(),
      false,
      false,
      true
    );

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
        realDesktopMutation: true,
        supportsMouse: false,
        supportsClick: false,
        supportsTyping: true
      });
      expect(structured.capabilities).toMatchObject({
        executeDesktopActions: true,
        realDesktopClick: false,
        realDesktopTyping: true,
        realDesktopMutation: true
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

  it("stops observation when focus drifts from the bound active window", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(backend);

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
          licensedAppScope: licensedAppScopeFor({
            kind: "active_window"
          })
        }
      });
      const initialResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "active_window"
          }
        }
      });
      const initialStructured = parseStructuredContent(initialResult);

      expect(initialResult.isError).not.toBe(true);
      expect(initialStructured.appScopeBinding).toMatchObject({
        observedWindowIdentity: "hwnd:0x123"
      });
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(1);

      backend.metadata = {
        ...activeWindow,
        windowId: "hwnd:0x999",
        title: "Unrelated Private Window",
        processName: "browser",
        appName: "Browser"
      };

      const driftResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "active_window"
          }
        }
      });
      const driftStructured = parseStructuredContent(driftResult);

      expect(driftResult.isError).toBe(true);
      expect(driftStructured).toMatchObject({
        status: "scope_exit",
        stopCondition: {
          condition: "outside_allowed_scope"
        },
        auditEvent: {
          eventType: "escalation_required"
        },
        boundAppScope: {
          observedWindowIdentity: "hwnd:0x123"
        },
        observedActiveWindow: {
          windowId: "hwnd:0x999",
          title: "Unrelated Private Window",
          processName: "browser"
        }
      });
      expect(driftStructured).not.toHaveProperty("observation");
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(1);
      expect(sessionStore.requireActiveSession("session-real-observe-001")).toMatchObject({
        stopConditions: [
          {
            condition: "outside_allowed_scope"
          }
        ]
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not capture or bind real active_window scope without concrete window identity", async () => {
    const backend = new FakeWindowsBackend({
      windowId: undefined,
      title: undefined,
      processName: undefined,
      appName: undefined,
      bounds: activeWindow.bounds
    });
    const { client, server, sessionStore } = await createConnectedClient(backend);

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
          licensedAppScope: licensedAppScopeFor({
            kind: "active_window"
          })
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

      expect(result.isError).toBe(true);
      expect(structured).toMatchObject({
        error: {
          code: "scope_mismatch"
        },
        residue: expect.arrayContaining([
          "No desktop frame was recorded for the session."
        ])
      });
      expect(backend.captureCount).toBe(0);
      expect(sessionStore.getBoundAppScope("session-real-observe-001")).toBeUndefined();
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("stops observation when a bound title scope no longer matches the active window identity", async () => {
    const backend = new FakeWindowsBackend({
      ...activeWindow,
      windowId: undefined
    });
    const { client, server, sessionStore } = await createConnectedClient(backend);

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedScopes: [
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            {
              kind: "active_window"
            }
          ],
          licensedAppScope: licensedAppScopeFor({
            kind: "window_title",
            value: "Generated Test App"
          })
        }
      });
      const initialResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true
        }
      });
      const initialStructured = parseStructuredContent(initialResult);

      expect(initialResult.isError).not.toBe(true);
      expect(initialStructured.appScopeBinding).toMatchObject({
        observedWindowIdentity: "node:Generated Test App"
      });

      backend.metadata = {
        ...activeWindow,
        windowId: undefined,
        title: "Different Test App"
      };

      const mismatchResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "active_window"
          }
        }
      });
      const mismatchStructured = parseStructuredContent(mismatchResult);

      expect(mismatchResult.isError).toBe(true);
      expect(mismatchStructured).toMatchObject({
        status: "scope_exit",
        stopCondition: {
          condition: "outside_allowed_scope"
        },
        observedActiveWindow: {
          title: "Different Test App",
          processName: "node"
        }
      });
      expect(sessionStore.listObservations("session-real-observe-001")).toHaveLength(1);
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
          },
          includeImages: true
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
          intendedSemanticTarget: "File menu",
          compactRelationalClaim: compactClaim("observation-fixed-2", "File menu")
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
          includeImages: true,
          transitionActionId: "action-fixed-4"
        }
      });
      const observeStructured = parseStructuredContent(observeResult);

      expect(observeResult.isError).not.toBe(true);
      expect(observeStructured.transitionGate).toMatchObject({
        status: "observed",
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
          allowedActions: ["observe", "move_mouse", "click"],
          licensedAppScope: {
            description: "Generated Test App is a local reversible UI test fixture.",
            scope: {
              kind: "window_title",
              value: "Generated Test App"
            },
            userDeclaredReversible: true,
            allowedActions: ["observe", "move_mouse", "click"],
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
          },
          includeImages: true
        }
      });
      const witness = await prepareHoverWitness(client);
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: witness.observationId,
          point: {
            x: 120,
            y: 80
          },
          intendedSemanticTarget: "Submit button",
          hoverTargetWitnessId: witness.hoverTargetWitnessId,
          compactRelationalClaim: compactClaim(witness.observationId, "Submit button", "hover_witness")
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
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("executes a real provider click only inside the bound licensed app scope", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(
      backend,
      true,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "move_mouse", "click"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "move_mouse", "click"]
          )
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true
        }
      });
      const witness = await prepareHoverWitness(client);
      const result = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: witness.observationId,
          point: {
            x: 120,
            y: 80
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
      expect(structured.providerCapabilities).toMatchObject({
        supportsClick: true,
        realDesktopMutation: true
      });
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: false,
        clickedButton: "left",
        cursorPosition: {
          x: 120,
          y: 80
        }
      });
      expect(structured.transitionGate).toMatchObject({
        status: "pending_observation",
        sourceObservationId: witness.observationId
      });
      expect(backend.clickedPoints).toEqual([
        {
          point: {
            x: 130,
            y: 100
          },
          button: "left"
        }
      ]);
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(2);
      expect(sessionStore.findBlockingTransitionGate("session-real-observe-001")).toMatchObject({
        status: "pending_observation"
      });

      const blockedResult = await client.callTool({
        name: "desktop_click",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: witness.observationId,
          point: {
            x: 121,
            y: 81
          },
          button: "left",
          intendedSemanticTarget: "Second click before post-click observation",
          hoverTargetWitnessId: witness.hoverTargetWitnessId,
          compactRelationalClaim: compactClaim(witness.observationId, "Second click before post-click observation", "hover_witness")
        }
      });
      const blockedStructured = parseStructuredContent(blockedResult);

      expect(blockedResult.isError).toBe(true);
      expect(blockedStructured.status).toBe("blocked");
      expect(backend.clickedPoints).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("executes real provider typing only inside the bound licensed app scope", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(
      backend,
      false,
      false,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "type_text"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "type_text"]
          )
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true
        }
      });
      const result = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          text: "generated input",
          sensitivityClassification: "test_input",
          intendedSemanticTarget: "Name input",
          compactRelationalClaim: compactClaim("observation-fixed-2", "Name input")
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("requires_post_action_observation");
      expect(structured.action).toMatchObject({
        actionType: "type_text",
        input: {
          textLength: 15
        }
      });
      expect(JSON.stringify(structured.action)).not.toContain("generated input");
      expect(JSON.stringify(structured.auditEvents)).not.toContain("generated input");
      expect(structured.providerCapabilities).toMatchObject({
        supportsTyping: true,
        realDesktopMutation: true
      });
      expect(structured.providerResult).toMatchObject({
        executed: true,
        simulated: false,
        typedTextLength: 15
      });
      expect(structured.transitionGate).toMatchObject({
        status: "pending_observation",
        sourceObservationId: "observation-fixed-2"
      });
      expect(backend.typedTexts).toEqual(["generated input"]);
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(1);
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
          includeImages: true,
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
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks real provider typing when the typing gate is disabled", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(backend);

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "type_text"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "type_text"]
          )
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true
        }
      });
      const result = await client.callTool({
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-real-observe-001",
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

      expect(result.isError).toBe(true);
      expect(structured.status).toBe("blocked");
      expect(structured.providerCapabilities).toMatchObject({
        supportsTyping: false,
        realDesktopMutation: false
      });
      expect(backend.typedTexts).toEqual([]);
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks credential-like real typing before provider calls and without storing text content", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(
      backend,
      false,
      false,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "type_text"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "type_text"]
          )
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
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-real-observe-001",
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
      expect(JSON.stringify(structured.auditEvents)).not.toContain("supersecret");
      expect(backend.typedTexts).toEqual([]);
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks real provider typing outside the bound licensed app scope", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, sessionStore } = await createConnectedClient(
      backend,
      false,
      false,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "type_text"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "type_text"]
          )
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
        name: "desktop_type_text",
        arguments: {
          sessionId: "session-real-observe-001",
          targetScope: {
            kind: "window_title",
            value: "Private Browser Window"
          },
          preActionObservationId: "observation-fixed-2",
          text: "generated input",
          intendedSemanticTarget: "Private input"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.status).toBe("escalate");
      expect(backend.typedTexts).toEqual([]);
      expect(sessionStore.listActions("session-real-observe-001")).toHaveLength(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks real provider click when the pre-action observation is stale", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server, setNow } = await createConnectedClient(
      backend,
      false,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedActions: ["observe", "click"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "click"]
          )
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

      setNow("2026-05-28T10:00:06.000Z");

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
          button: "left",
          intendedSemanticTarget: "Submit button"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.status).toBe("block");
      expect(structured.policy).toMatchObject({
        stopConditions: [
          {
            condition: "stale_pre_action_observation"
          }
        ]
      });
      expect(backend.clickedPoints).toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks real provider click outside the licensed app scope before provider execution", async () => {
    const backend = new FakeWindowsBackend();
    const { client, server } = await createConnectedClient(
      backend,
      false,
      true
    );

    try {
      await client.callTool({
        name: "desktop_start_interaction_session",
        arguments: {
          ...startArguments,
          allowedScopes: [
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            {
              kind: "process_name",
              value: "node"
            }
          ],
          allowedActions: ["observe", "click"],
          licensedAppScope: licensedAppScopeFor(
            {
              kind: "window_title",
              value: "Generated Test App"
            },
            ["observe", "click"]
          )
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
            kind: "process_name",
            value: "node"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          button: "left",
          intendedSemanticTarget: "Outside licensed app target"
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured.status).toBe("escalate");
      expect(structured.policy).toMatchObject({
        stopConditions: [
          {
            condition: "outside_allowed_scope"
          }
        ]
      });
      expect(backend.clickedPoints).toEqual([]);
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
