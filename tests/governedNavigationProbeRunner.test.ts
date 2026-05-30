import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runGovernedNavigationProbe,
  type GovernedNavigationProbeConfig
} from "../src/manual/governedNavigationProbeRunner.js";
import type { DesktopPoint } from "../src/policy/sessionLicensePolicy.js";
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
  public movedPoints: DesktopPoint[] = [];
  public captureCount = 0;
  private cursorPosition: DesktopPoint;

  constructor(cursorPosition: DesktopPoint = { x: 510, y: 320 }) {
    this.cursorPosition = cursorPosition;
  }

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    return activeWindow;
  }

  async getCursorPosition(): Promise<DesktopPoint> {
    return this.cursorPosition;
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    this.captureCount += 1;

    return {
      ...activeWindow,
      dataBase64: pngBase64
    };
  }

  async moveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    this.movedPoints.push(point);
    this.cursorPosition = point;

    return point;
  }
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});

function tempArtifactDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "admcp-navigation-probe-test-"));
  tempDirs.push(dir);

  return dir;
}

function configFixture(
  overrides: Partial<GovernedNavigationProbeConfig> = {}
): GovernedNavigationProbeConfig {
  return {
    sessionId: "navigation-probe-test-session",
    userGoal: "Probe generated app navigation with carried observations.",
    userConfirmed: true,
    visibleContentAcknowledged: true,
    allowRealMouseMovement: true,
    targetScope: {
      kind: "active_window"
    },
    steps: [
      {
        stepId: "hover-parent",
        intendedSemanticTarget: "Generated Test App parent nav",
        areaOfInterest: {
          x: 300,
          y: 180
        },
        movementFraction: 1,
        witnessNotes: ["Parent menu should reveal a child target."]
      },
      {
        stepId: "hover-child",
        intendedSemanticTarget: "Generated Test App child nav item",
        areaOfInterest: {
          x: 100,
          y: 60
        },
        movementFraction: 0.5
      }
    ],
    observationCadenceMaxGapMs: 60_000,
    includeImages: true,
    artifactDirectory: tempArtifactDir(),
    requestTimeoutMs: 30_000,
    ...overrides
  };
}

describe("runGovernedNavigationProbe", () => {
  it("carries post-movement observations forward to reduce capture count", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement: true
    });
    const result = await runGovernedNavigationProbe(configFixture(), {
      desktopProvider: provider
    });

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(2);
    expect(backend.captureCount).toBe(3);
    expect(result.initialObservation?.observationId).toBe(
      result.steps[0]?.preObservation.observationId
    );
    expect(result.steps[0]?.postObservation?.observationId).toBe(
      result.steps[1]?.preObservation.observationId
    );
    expect(result.steps.map((step) => step.move.plannedPoint)).toEqual([
      { x: 300, y: 180 },
      { x: 200, y: 120 }
    ]);
    expect(backend.movedPoints).toEqual([
      { x: 310, y: 200 },
      { x: 210, y: 140 }
    ]);
    expect(result.steps[0]?.witnessNotes).toEqual([
      "Parent menu should reveal a child target."
    ]);
    expect(result.steps.every((step) => step.transitionGate !== undefined)).toBe(true);
    expect(result.residue).toContain(
      "Each post-movement observation was carried forward as the next pre-action witness."
    );
    expect(result.initialObservation?.frames[0]?.imagePath).toEqual(expect.any(String));
    expect(existsSync(result.initialObservation?.frames[0]?.imagePath ?? "")).toBe(true);
  });

  it("records per-tool timing diagnostics", async () => {
    const provider = new WindowsDesktopObservationProvider({
      backend: new FakeWindowsBackend(),
      platform: "win32",
      enableRealMouseMovement: true
    });
    const result = await runGovernedNavigationProbe(
      configFixture({
        includeImages: false
      }),
      {
        desktopProvider: provider
      }
    );

    expect(result.status).toBe("completed");
    expect(result.timings.map((timing) => timing.operation)).toEqual([
      "desktop_capabilities",
      "desktop_start_interaction_session",
      "desktop_observe:initial",
      "desktop_move_mouse:step-1",
      "desktop_observe:step-1:post",
      "desktop_move_mouse:step-2",
      "desktop_observe:step-2:post",
      "desktop_session_audit_log",
      "desktop_end_interaction_session"
    ]);
    expect(result.timings.every((timing) => Number.isFinite(timing.durationMs))).toBe(true);
    expect(result.timings.every((timing) => timing.isError === false)).toBe(true);
    expect(result.initialObservation?.providerTiming).toMatchObject({
      providerName: "windows_active_window_observation_provider",
      providerKind: "real"
    });
    expect(result.steps[0]?.postObservation?.providerTiming).toMatchObject({
      providerName: "windows_active_window_observation_provider",
      providerKind: "real"
    });
    expect(result.steps[0]?.move.providerResult).toMatchObject({
      providerTiming: {
        providerName: "windows_active_window_observation_provider",
        providerKind: "real",
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: "set_cursor_position"
          })
        ])
      }
    });
  });

  it("refuses real mouse movement unless explicitly allowed by runner config", async () => {
    const result = await runGovernedNavigationProbe(
      configFixture({
        sessionId: "navigation-probe-missing-real-gate",
        allowRealMouseMovement: false,
        includeImages: false
      }),
      {
        desktopProvider: new WindowsDesktopObservationProvider({
          backend: new FakeWindowsBackend(),
          platform: "win32",
          enableRealMouseMovement: true
        })
      }
    );

    expect(result.status).toBe("failed");
    expect(result.residue).toContain(
      "Real mouse movement provider is active; config must set allowRealMouseMovement: true."
    );
    expect(result.timings.map((timing) => timing.operation)).toEqual([
      "desktop_capabilities"
    ]);
  });
});
