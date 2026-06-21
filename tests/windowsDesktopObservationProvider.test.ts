import { describe, expect, it } from "vitest";
import {
  DesktopProviderError,
  type DesktopApplicationLaunchRequest,
  type DesktopApplicationLaunchResult
} from "../src/providers/desktopProvider.js";
import {
  PersistentPowerShellWindowsObservationBackend,
  WindowsDesktopObservationProvider,
  type WindowsActiveWindowSnapshot,
  type WindowsCapturedFrame,
  type WindowsObservationHelperClient,
  type WindowsObservationBackend
} from "../src/providers/windowsDesktopObservationProvider.js";
import type { DesktopPoint } from "../src/policy/sessionLicensePolicy.js";

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
  public getActiveWindowCount = 0;
  public captureCount = 0;
  public movedPoints: DesktopPoint[] = [];
  public clickedPoints: Array<{ point: DesktopPoint; button: "left" | "middle" | "right" }> = [];
  public typedTexts: string[] = [];
  public launchedApplications: string[] = [];
  public disposed = false;
  private cursorPosition: DesktopPoint;

  constructor(
    private readonly metadata: WindowsActiveWindowSnapshot = activeWindow,
    private readonly captured: WindowsCapturedFrame = {
      ...activeWindow,
      dataBase64: pngBase64
    },
    cursorPosition: DesktopPoint = {
      x: activeWindow.bounds.left + 12,
      y: activeWindow.bounds.top + 8
    }
  ) {
    this.cursorPosition = cursorPosition;
  }

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    this.getActiveWindowCount += 1;
    return this.metadata;
  }

  async getCursorPosition(): Promise<DesktopPoint> {
    return this.cursorPosition;
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    this.captureCount += 1;
    return this.captured;
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

  async openApplication(
    request: DesktopApplicationLaunchRequest
  ): Promise<DesktopApplicationLaunchResult> {
    this.launchedApplications.push(request.application.id);

    return {
      executed: true,
      simulated: false,
      applicationId: request.application.id,
      displayName: request.application.displayName,
      residue: [
        "Fake backend recorded catalog application launch.",
        "No real application was launched during the test."
      ]
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

class FakeWindowsHelperClient implements WindowsObservationHelperClient {
  public commands: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  public disposed = false;

  constructor(private readonly failCommand?: string) {}

  async request<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    this.commands.push({
      command,
      payload
    });

    if (command === this.failCommand) {
      throw new Error(`helper failed: ${command}`);
    }

    const result =
      command === "get_active_window"
        ? activeWindow
        : command === "get_cursor_position"
          ? {
              x: 22,
              y: 28
            }
          : command === "capture_active_window_png"
            ? {
                ...activeWindow,
                dataBase64: pngBase64,
                timing: {
                  entries: [
                    {
                      operation: "screen_capture",
                      durationMs: 4,
                      status: "completed",
                      residue: []
                    }
                  ],
                  residue: []
                }
              }
            : command === "move_mouse"
              ? payload?.point
              : command === "click_mouse"
                ? payload?.point
                : command === "type_text"
                  ? {
                      typedTextLength:
                        typeof payload?.text === "string" ? payload.text.length : 0
                    }
                  : command === "open_application"
                    ? {
                        executed: true,
                        simulated: false,
                        applicationId: "generated_test_app",
                        displayName: "Generated Test App",
                        residue: ["Fake helper recorded catalog application launch."]
                      }
                  : {};

    return result as T;
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe("WindowsDesktopObservationProvider", () => {
  it("reports real observation capabilities without control support", () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32"
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      supportsObservation: true,
      supportsMouse: false,
      supportsClick: false,
      supportsTyping: false,
      realDesktopCapture: true,
      realDesktopMouseMovement: false,
      realDesktopMutation: false
    });
  });

  it("uses the persistent PowerShell helper by default for real Windows observation", () => {
    const provider = new WindowsDesktopObservationProvider({
      platform: "win32"
    });

    expect(provider.getCapabilities().residue).toContain(
      "Provider uses a persistent PowerShell helper to keep Win32 observation setup warm."
    );
  });

  it("can opt back to per-call PowerShell execution for diagnostics", () => {
    const provider = new WindowsDesktopObservationProvider({
      platform: "win32",
      usePersistentPowerShellHelper: false
    });

    expect(provider.getCapabilities().residue).toContain(
      "Provider uses per-call PowerShell execution."
    );
  });

  it("disposes the observation backend when provider cleanup is requested", () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    provider.dispose();

    expect(backend.disposed).toBe(true);
  });

  it("delegates backend calls through the persistent helper client", async () => {
    const helperClient = new FakeWindowsHelperClient();
    const backend = new PersistentPowerShellWindowsObservationBackend({
      helperClient
    });

    await expect(backend.getActiveWindow()).resolves.toEqual(activeWindow);
    await expect(backend.getCursorPosition()).resolves.toEqual({
      x: 22,
      y: 28
    });
    await expect(backend.captureActiveWindowPng()).resolves.toMatchObject({
      title: "Generated Test App",
      dataBase64: pngBase64
    });
    await expect(backend.moveMouseTo({ x: 33, y: 44 })).resolves.toEqual({
      x: 33,
      y: 44
    });
    await expect(backend.clickMouseAt({ x: 35, y: 46 }, "left")).resolves.toEqual({
      x: 35,
      y: 46
    });
    await expect(backend.typeText("abc")).resolves.toBe(3);
    await expect(
      backend.openApplication({
        application: {
          id: "generated_test_app",
          displayName: "Generated Test App",
          aliases: ["generated app"],
          windowsShortcutNames: ["Generated Test App"],
          moduleHints: ["fixture"]
        },
        requestedAt: "2026-06-21T10:00:00.000Z"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      applicationId: "generated_test_app"
    });
    backend.dispose();

    expect(helperClient.commands).toEqual([
      {
        command: "get_active_window",
        payload: undefined
      },
      {
        command: "get_cursor_position",
        payload: undefined
      },
      {
        command: "capture_active_window_png",
        payload: undefined
      },
      {
        command: "move_mouse",
        payload: {
          point: {
            x: 33,
            y: 44
          }
        }
      },
      {
        command: "click_mouse",
        payload: {
          point: {
            x: 35,
            y: 46
          },
          button: "left"
        }
      },
      {
        command: "type_text",
        payload: {
          text: "abc"
        }
      },
      {
        command: "open_application",
        payload: {
          application: {
            id: "generated_test_app",
            displayName: "Generated Test App",
            aliases: ["generated app"],
            windowsShortcutNames: ["Generated Test App"],
            moduleHints: ["fixture"]
          },
          requestedAt: "2026-06-21T10:00:00.000Z"
        }
      }
    ]);
    expect(helperClient.disposed).toBe(true);
  });

  it("maps persistent helper failures to controlled provider errors", async () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new PersistentPowerShellWindowsObservationBackend({
        helperClient: new FakeWindowsHelperClient("capture_active_window_png")
      }),
      platform: "win32"
    });

    await expect(
      provider.observe({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        observedAt: "2026-05-28T10:00:00.000Z",
        mode: "single_frame",
        maxFrames: 1,
        durationMs: 0,
        frameFormat: "image/png",
        includeImages: false
      })
    ).rejects.toMatchObject({
      code: "capture_failed"
    });
  });

  it("reports opt-in real mouse movement capability without click or typing support", () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32",
      enableRealMouseMovement: true
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      supportsMouse: true,
      supportsClick: false,
      supportsTyping: false,
      realDesktopCapture: true,
      realDesktopMouseMovement: true,
      realDesktopMutation: false
    });
  });

  it("reports opt-in real click capability behind a separate gate", () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32",
      enableRealClick: true
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      supportsMouse: false,
      supportsClick: true,
      supportsTyping: false,
      realDesktopCapture: true,
      realDesktopMouseMovement: true,
      realDesktopMutation: true
    });
  });

  it("reports opt-in real typing capability behind a separate gate", () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32",
      enableRealTyping: true
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      supportsMouse: false,
      supportsClick: false,
      supportsTyping: true,
      realDesktopCapture: true,
      realDesktopMouseMovement: false,
      realDesktopMutation: true
    });
    expect(provider.getCapabilities().residue).toContain(
      "Provider may type generated test input only through the explicit app-scoped real-typing gate."
    );
  });

  it("reports and delegates opt-in catalog application launch behind a separate gate", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealApplicationLaunch: true
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      supportsApplicationLaunch: true,
      realDesktopApplicationLaunch: true,
      realDesktopMutation: false
    });

    await expect(
      provider.openApplication({
        application: {
          id: "generated_test_app",
          displayName: "Generated Test App",
          aliases: ["generated app"],
          windowsShortcutNames: ["Generated Test App"],
          moduleHints: ["fixture"]
        },
        requestedAt: "2026-06-21T10:00:00.000Z"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      applicationId: "generated_test_app"
    });
    expect(backend.launchedApplications).toEqual(["generated_test_app"]);
  });

  it("captures bounded active-window frame metadata without inline image data by default", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      maxFramesPerObservation: 2,
      maxObservationDurationMs: 100,
      frameDelay: async () => undefined
    });

    const observation = await provider.observe({
      sessionId: "session-real-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      observedAt: "2026-05-28T10:00:00.000Z",
      mode: "frame_session",
      maxFrames: 6,
      durationMs: 1_000,
      frameFormat: "image/png",
      includeImages: false
    });

    expect(backend.getActiveWindowCount).toBe(1);
    expect(backend.captureCount).toBe(2);
    expect(observation.activeWindow).toMatchObject({
      windowId: "hwnd:0x123",
      title: "Generated Test App",
      processName: "node",
      bounds: {
        width: 640,
        height: 480
      }
    });
    expect(observation.cursorPosition).toEqual({
      x: 12,
      y: 8
    });
    expect(observation.cursorWitness).toMatchObject({
      status: "observed",
      visible: true,
      position: {
        x: 12,
        y: 8
      },
      coordinateSpace: "active_window_frame",
      providerSource: "windows_active_window_observation_provider",
      renderedIntoFrame: false
    });
    expect(observation.frames).toHaveLength(2);
    expect(observation.frames[0]).toMatchObject({
      index: 0,
      mimeType: "image/png",
      width: 640,
      height: 480,
      elapsedMs: 0,
      witness: {
        pixelSource: "raw",
        cursorRenderedIntoFrame: false
      }
    });
    expect(observation.frames[1]).toMatchObject({
      index: 1,
      elapsedMs: 100
    });
    expect(observation.frames[0]?.dataBase64).toBeUndefined();
    expect(observation.providerTiming).toMatchObject({
      providerName: "windows_active_window_observation_provider",
      providerKind: "real"
    });
    expect(observation.providerTiming?.entries.map((entry) => entry.operation)).toEqual(
      expect.arrayContaining([
        "active_window_metadata_lookup",
        "frame_0_capture_active_window_png",
        "frame_0.powershell.timing_unavailable",
        "frame_0_decode_frame_bytes",
        "frame_0_build_frame_artifact",
        "cursor_position_fallback_lookup"
      ])
    );
    expect(observation.providerTiming?.residue).toContain(
      "Provider timing is diagnostic only and is not used as policy evidence."
    );
  });

  it("includes PowerShell capture substage timings when the backend reports them", async () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(activeWindow, {
        ...activeWindow,
        dataBase64: pngBase64,
        timing: {
          entries: [
            {
              operation: "screen_capture",
              durationMs: 7,
              status: "completed",
              residue: []
            },
            {
              operation: "png_encode",
              durationMs: 11,
              status: "completed",
              residue: []
            },
            {
              operation: "base64_payload_construction",
              durationMs: 3,
              status: "completed",
              residue: []
            }
          ],
          residue: ["PowerShell capture substage timings are diagnostic only."]
        }
      }),
      platform: "win32"
    });

    const observation = await provider.observe({
      sessionId: "session-real-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      observedAt: "2026-05-28T10:00:00.000Z",
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      frameFormat: "image/png",
      includeImages: false
    });

    expect(observation.providerTiming).toMatchObject({
      providerName: "windows_active_window_observation_provider",
      providerKind: "real"
    });
    expect(observation.providerTiming?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "frame_0.powershell.screen_capture",
          durationMs: 7,
          status: "completed"
        }),
        expect.objectContaining({
          operation: "frame_0.powershell.png_encode",
          durationMs: 11,
          status: "completed"
        }),
        expect.objectContaining({
          operation: "frame_0.powershell.base64_payload_construction",
          durationMs: 3,
          status: "completed"
        }),
        expect.objectContaining({
          operation: "frame_0.powershell.timing_residue",
          status: "skipped",
          residue: ["PowerShell capture substage timings are diagnostic only."]
        })
      ])
    );
  });

  it("returns inline image data only when requested", async () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32"
    });

    const observation = await provider.observe({
      sessionId: "session-real-001",
      targetScope: {
        kind: "process_name",
        value: "node"
      },
      observedAt: "2026-05-28T10:00:00.000Z",
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      frameFormat: "image/png",
      includeImages: true
    });

    expect(observation.frames).toHaveLength(1);
    expect(observation.frames[0]?.dataBase64).toBe(pngBase64);
  });

  it("marks captured frames as cursor-annotated when the backend renders the cursor", async () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(activeWindow, {
        ...activeWindow,
        dataBase64: pngBase64,
        cursor: {
          visible: true,
          screenPosition: {
            x: 24,
            y: 31
          },
          framePosition: {
            x: 14,
            y: 11
          },
          hotspot: {
            x: 2,
            y: 3
          },
          renderedIntoFrame: true,
          nativeCursorRenderedIntoFrame: true,
          witnessMarkerRenderedIntoFrame: true,
          renderingMethod: "win32:GetCursorInfo+GetIconInfo+DrawIconEx+HighContrastWitnessMarker",
          residue: [
            "Native visible cursor was rendered into the active-window frame.",
            "High-contrast cursor witness marker was rendered around the cursor hotspot."
          ]
        }
      }),
      platform: "win32"
    });

    const observation = await provider.observe({
      sessionId: "session-real-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      observedAt: "2026-05-28T10:00:00.000Z",
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      frameFormat: "image/png",
      includeImages: false
    });

    expect(observation.cursorPosition).toEqual({
      x: 14,
      y: 11
    });
    expect(observation.cursorWitness).toMatchObject({
      status: "observed",
      visible: true,
      renderedIntoFrame: true,
      nativeCursorRenderedIntoFrame: true,
      witnessMarkerRenderedIntoFrame: true,
      renderingMethod: "win32:GetCursorInfo+GetIconInfo+DrawIconEx+HighContrastWitnessMarker",
      confidence: "high"
    });
    expect(observation.frames[0]?.witness).toMatchObject({
      pixelSource: "cursor_annotated",
      cursorRenderedIntoFrame: true,
      nativeCursorRenderedIntoFrame: true,
      witnessMarkerRenderedIntoFrame: true,
      cursorFramePosition: {
        x: 14,
        y: 11
      },
      cursorHotspot: {
        x: 2,
        y: 3
      }
    });
  });

  it("keeps observation successful when cursor position is unavailable", async () => {
    const backend: WindowsObservationBackend = {
      async getActiveWindow() {
        return activeWindow;
      },
      async getCursorPosition() {
        throw new Error("cursor API unavailable");
      },
      async captureActiveWindowPng() {
        return {
          ...activeWindow,
          dataBase64: pngBase64
        };
      },
      async moveMouseTo() {
        throw new Error("should not move");
      }
    };
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    const observation = await provider.observe({
      sessionId: "session-real-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      observedAt: "2026-05-28T10:00:00.000Z",
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      frameFormat: "image/png",
      includeImages: false
    });

    expect(observation.cursorPosition).toBeUndefined();
    expect(observation.cursorWitness).toMatchObject({
      status: "unavailable",
      coordinateSpace: "unknown",
      confidence: "low",
      renderedIntoFrame: false
    });
    expect(observation.cursorWitness?.residue).toEqual(
      expect.arrayContaining([
        "Observation frame capture still succeeded; no cursor position claim is made."
      ])
    );
  });

  it("rejects scope mismatch before capture", async () => {
    const backend = new FakeWindowsBackend({
      ...activeWindow,
      title: "Private Browser Window"
    });
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    await expect(
      provider.observe({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        observedAt: "2026-05-28T10:00:00.000Z",
        mode: "single_frame",
        maxFrames: 1,
        durationMs: 0,
        frameFormat: "image/png",
        includeImages: false
      })
    ).rejects.toMatchObject({
      code: "scope_mismatch"
    });
    expect(backend.captureCount).toBe(0);
  });

  it("reports unavailable provider on non-Windows platforms before reading metadata", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "linux"
    });

    await expect(
      provider.observe({
        sessionId: "session-real-001",
        targetScope: {
          kind: "active_window"
        },
        observedAt: "2026-05-28T10:00:00.000Z",
        mode: "single_frame",
        maxFrames: 1,
        durationMs: 0,
        frameFormat: "image/png",
        includeImages: false
      })
    ).rejects.toMatchObject({
      code: "real_observation_unavailable"
    });
    expect(backend.getActiveWindowCount).toBe(0);
  });

  it("moves the real cursor through the backend only when explicitly enabled", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement: true
    });

    await expect(
      provider.moveMouse({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 120,
          y: 80
        },
        intendedSemanticTarget: "File menu"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      cursorPosition: {
        x: 120,
        y: 80
      },
      providerTiming: {
        providerName: "windows_active_window_observation_provider",
        providerKind: "real",
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: "pre_move_active_window_metadata_lookup"
          }),
          expect.objectContaining({
            operation: "set_cursor_position"
          }),
          expect.objectContaining({
            operation: "post_move_active_window_metadata_lookup"
          })
        ])
      }
    });
    expect(backend.movedPoints).toEqual([
      {
        x: 130,
        y: 100
      }
    ]);
  });

  it("keeps real mouse movement disabled by default", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    await expect(
      provider.moveMouse({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 120,
          y: 80
        }
      })
    ).resolves.toMatchObject({
      executed: false,
      simulated: false
    });
    expect(backend.movedPoints).toEqual([]);
  });

  it("clicks through the backend only when explicitly enabled", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealClick: true
    });

    await expect(
      provider.click({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 120,
          y: 80
        },
        button: "left",
        intendedSemanticTarget: "Submit button"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      clickedButton: "left",
      cursorPosition: {
        x: 120,
        y: 80
      },
      providerTiming: {
        providerName: "windows_active_window_observation_provider",
        providerKind: "real",
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: "pre_click_active_window_metadata_lookup"
          }),
          expect.objectContaining({
            operation: "click_mouse"
          }),
          expect.objectContaining({
            operation: "post_click_active_window_metadata_lookup"
          })
        ])
      }
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
  });

  it("keeps real clicking disabled by default", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    await expect(
      provider.click({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 120,
          y: 80
        },
        button: "left"
      })
    ).resolves.toMatchObject({
      executed: false,
      simulated: false
    });
    expect(backend.clickedPoints).toEqual([]);
  });

  it("types through the backend only when explicitly enabled", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealTyping: true
    });

    await expect(
      provider.typeText({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        text: "generated input",
        textLength: 15,
        sensitivityClassification: "test_input",
        intendedSemanticTarget: "Name input"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      typedTextLength: 15,
      providerTiming: {
        providerName: "windows_active_window_observation_provider",
        providerKind: "real",
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: "pre_type_active_window_metadata_lookup"
          }),
          expect.objectContaining({
            operation: "type_text"
          }),
          expect.objectContaining({
            operation: "post_type_active_window_metadata_lookup"
          })
        ])
      },
      residue: expect.arrayContaining([
        "Real desktop typing occurred through the explicit app-scoped real-typing gate.",
        "Typed text content is not returned by the provider.",
        "Post-typing active-window metadata still matches the requested scope."
      ])
    });
    expect(backend.typedTexts).toEqual(["generated input"]);
  });

  it("keeps real typing disabled by default", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    await expect(
      provider.typeText({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        text: "generated input",
        textLength: 15
      })
    ).resolves.toMatchObject({
      executed: false,
      simulated: false
    });
    expect(backend.typedTexts).toEqual([]);
  });

  it("rejects out-of-window clicks before clicking", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealClick: true
    });

    await expect(
      provider.click({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 700,
          y: 80
        },
        button: "left"
      })
    ).rejects.toMatchObject({
      code: "invalid_action_target"
    });
    expect(backend.clickedPoints).toEqual([]);
  });

  it("records click execution residue when post-click metadata cannot be verified", async () => {
    let activeWindowCalls = 0;
    const clickedPoints: DesktopPoint[] = [];
    const backend: WindowsObservationBackend = {
      async getActiveWindow() {
        activeWindowCalls += 1;

        if (activeWindowCalls > 1) {
          throw new Error("post-click metadata unavailable");
        }

        return activeWindow;
      },
      async getCursorPosition() {
        return {
          x: 130,
          y: 100
        };
      },
      async captureActiveWindowPng() {
        return {
          ...activeWindow,
          dataBase64: pngBase64
        };
      },
      async moveMouseTo(point) {
        return point;
      },
      async clickMouseAt(point) {
        clickedPoints.push(point);

        return point;
      }
    };
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealClick: true
    });

    await expect(
      provider.click({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 120,
          y: 80
        },
        button: "left"
      })
    ).resolves.toMatchObject({
      executed: true,
      simulated: false,
      residue: expect.arrayContaining([
        "Post-click active-window metadata could not be verified; follow-up observation must audit the transition."
      ])
    });
    expect(clickedPoints).toEqual([
      {
        x: 130,
        y: 100
      }
    ]);
  });

  it("rejects out-of-window movement before moving the cursor", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement: true
    });

    await expect(
      provider.moveMouse({
        sessionId: "session-real-001",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        requestedAt: "2026-05-28T10:00:01.000Z",
        point: {
          x: 700,
          y: 80
        }
      })
    ).rejects.toMatchObject({
      code: "invalid_action_target"
    });
    expect(backend.movedPoints).toEqual([]);
  });

  it("maps permission failures to controlled provider errors", async () => {
    const backend: WindowsObservationBackend = {
      async getActiveWindow() {
        throw new Error("Access is denied.");
      },
      async getCursorPosition() {
        throw new Error("should not read cursor");
      },
      async captureActiveWindowPng() {
        throw new Error("should not capture");
      },
      async moveMouseTo() {
        throw new Error("should not move");
      }
    };
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32"
    });

    await expect(
      provider.observe({
        sessionId: "session-real-001",
        targetScope: {
          kind: "active_window"
        },
        observedAt: "2026-05-28T10:00:00.000Z",
        mode: "single_frame",
        maxFrames: 1,
        durationMs: 0,
        frameFormat: "image/png",
        includeImages: false
      })
    ).rejects.toBeInstanceOf(DesktopProviderError);
    await expect(
      provider.observe({
        sessionId: "session-real-001",
        targetScope: {
          kind: "active_window"
        },
        observedAt: "2026-05-28T10:00:00.000Z",
        mode: "single_frame",
        maxFrames: 1,
        durationMs: 0,
        frameFormat: "image/png",
        includeImages: false
      })
    ).rejects.toMatchObject({
      code: "permission_denied"
    });
  });
});
