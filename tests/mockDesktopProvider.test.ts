import { describe, expect, it } from "vitest";
import { MockDesktopProvider } from "../src/providers/mockDesktopProvider.js";

const observeRequest = {
  sessionId: "session-provider-001",
  targetScope: {
    kind: "window_title" as const,
    value: "Generated Test App"
  },
  observedAt: "2026-05-27T10:00:00.000Z",
  mode: "frame_session" as const,
  maxFrames: 3,
  durationMs: 300,
  frameFormat: "image/png" as const,
  includeImages: false
};

describe("MockDesktopProvider", () => {
  it("reports mock-only observation and simulated mouse capabilities with no real mutation support", () => {
    const provider = new MockDesktopProvider();

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "mock",
      supportsObservation: true,
      supportsMouse: true,
      supportsClick: false,
      supportsTyping: false,
      realDesktopCapture: false,
      realDesktopMutation: false
    });
  });

  it("returns deterministic bounded frame-session metadata without inline images by default", async () => {
    const provider = new MockDesktopProvider({
      maxFramesPerObservation: 2,
      maxObservationDurationMs: 100
    });

    const observation = await provider.observe({
      ...observeRequest,
      maxFrames: 8,
      durationMs: 2_000
    });

    expect(observation.frames).toHaveLength(2);
    expect(observation.frames.map((frame) => frame.elapsedMs)).toEqual([0, 100]);
    expect(observation.frames[0]).toMatchObject({
      index: 0,
      capturedAt: "2026-05-27T10:00:00.000Z",
      mimeType: "image/png",
      width: 1,
      height: 1
    });
    expect(observation.frames[0]?.dataBase64).toBeUndefined();
    expect(observation.activeWindow).toMatchObject({
      title: "Mock Desktop Window",
      processName: "mock-desktop-provider"
    });
    expect(observation.cursorPosition).toEqual({
      x: 320,
      y: 180
    });
    expect(observation.residue).toEqual(
      expect.arrayContaining([
        "Mock observation only: no real desktop pixels were captured.",
        "No OCR, localization, real mouse movement, click, typing, or background polling occurred."
      ])
    );
  });

  it("supports single-frame mode and optional inline mock image data", async () => {
    const provider = new MockDesktopProvider();

    const observation = await provider.observe({
      ...observeRequest,
      mode: "single_frame",
      maxFrames: 12,
      durationMs: 1_000,
      includeImages: true
    });

    expect(observation.frames).toHaveLength(1);
    expect(observation.frames[0]?.dataBase64).toEqual(expect.any(String));
    expect(observation.residue).toContain(
      "single_frame mode was used inside the session-first observation architecture."
    );
  });

  it("simulates mouse movement without mutating the real desktop", async () => {
    const provider = new MockDesktopProvider();
    const request = {
      sessionId: "session-provider-001",
      targetScope: observeRequest.targetScope,
      requestedAt: "2026-05-27T10:00:01.000Z",
      point: {
        x: 120,
        y: 90
      },
      intendedSemanticTarget: "Submit button"
    };

    await expect(provider.moveMouse(request)).resolves.toMatchObject({
      executed: true,
      simulated: true,
      cursorPosition: {
        x: 120,
        y: 90
      }
    });
    await expect(
      provider.observe({
        ...observeRequest,
        observedAt: "2026-05-27T10:00:02.000Z"
      })
    ).resolves.toMatchObject({
      cursorPosition: {
        x: 120,
        y: 90
      }
    });
  });

  it("does not execute click or typing methods", async () => {
    const provider = new MockDesktopProvider();
    const request = {
      sessionId: "session-provider-001",
      targetScope: observeRequest.targetScope,
      requestedAt: "2026-05-27T10:00:01.000Z"
    };

    await expect(provider.click(request)).resolves.toMatchObject({
      executed: false,
      simulated: false
    });
    await expect(provider.typeText(request)).resolves.toMatchObject({
      executed: false,
      simulated: false
    });
  });
});
