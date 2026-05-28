import { describe, expect, it } from "vitest";
import { DesktopProviderError } from "../src/providers/desktopProvider.js";
import {
  WindowsDesktopObservationProvider,
  type WindowsActiveWindowSnapshot,
  type WindowsCapturedFrame,
  type WindowsObservationBackend
} from "../src/providers/windowsDesktopObservationProvider.js";

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

  constructor(
    private readonly metadata: WindowsActiveWindowSnapshot = activeWindow,
    private readonly captured: WindowsCapturedFrame = {
      ...activeWindow,
      dataBase64: pngBase64
    }
  ) {}

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    this.getActiveWindowCount += 1;
    return this.metadata;
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    this.captureCount += 1;
    return this.captured;
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
    expect(observation.frames).toHaveLength(2);
    expect(observation.frames[0]).toMatchObject({
      index: 0,
      mimeType: "image/png",
      width: 640,
      height: 480,
      elapsedMs: 0
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

  it("maps permission failures to controlled provider errors", async () => {
    const backend: WindowsObservationBackend = {
      async getActiveWindow() {
        throw new Error("Access is denied.");
      },
      async captureActiveWindowPng() {
        throw new Error("should not capture");
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
