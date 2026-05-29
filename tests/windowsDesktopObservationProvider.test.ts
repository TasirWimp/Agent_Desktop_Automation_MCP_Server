import { describe, expect, it } from "vitest";
import { DesktopProviderError } from "../src/providers/desktopProvider.js";
import {
  WindowsDesktopObservationProvider,
  type WindowsActiveWindowSnapshot,
  type WindowsCapturedFrame,
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
          renderingMethod: "win32:GetCursorInfo+GetIconInfo+DrawIconEx",
          residue: ["Visible cursor was rendered into the active-window frame."]
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
      renderingMethod: "win32:GetCursorInfo+GetIconInfo+DrawIconEx",
      confidence: "high"
    });
    expect(observation.frames[0]?.witness).toMatchObject({
      pixelSource: "cursor_annotated",
      cursorRenderedIntoFrame: true,
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
