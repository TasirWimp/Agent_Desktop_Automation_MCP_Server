import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runGovernedManualProbe,
  type GovernedManualProbeConfig
} from "../src/manual/governedManualProbeRunner.js";
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
  const dir = mkdtempSync(join(tmpdir(), "admcp-manual-probe-test-"));
  tempDirs.push(dir);

  return dir;
}

function configFixture(overrides: Partial<GovernedManualProbeConfig> = {}): GovernedManualProbeConfig {
  return {
    sessionId: "manual-probe-test-session",
    userGoal: "Probe a generated test app button with real movement disabled in tests.",
    userConfirmed: true,
    visibleContentAcknowledged: true,
    allowRealMouseMovement: true,
    targetScope: {
      kind: "active_window"
    },
    intendedSemanticTarget: "Generated Test App File menu",
    areaOfInterest: {
      x: 100,
      y: 60
    },
    movementFractions: [0.5, 0.5, 1],
    maxAttempts: 3,
    observationCadenceMaxGapMs: 60_000,
    includeImages: true,
    artifactDirectory: tempArtifactDir(),
    verifyClickBlocked: true,
    manualWitnessNotes: {
      "2": ["Wrong-target hover evidence: sidebar row highlighted."]
    },
    ...overrides
  };
}

describe("runGovernedManualProbe", () => {
  it("runs a bounded three-attempt movement probe through session tools and verifies click blocking", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement: true
    });
    const config = configFixture();

    const result = await runGovernedManualProbe(config, {
      desktopProvider: provider
    });

    expect(result.status).toBe("completed");
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.map((attempt) => attempt.move?.plannedPoint)).toEqual([
      { x: 300, y: 180 },
      { x: 200, y: 120 },
      { x: 100, y: 60 }
    ]);
    expect(backend.movedPoints).toEqual([
      { x: 310, y: 200 },
      { x: 210, y: 140 },
      { x: 110, y: 80 }
    ]);
    expect(result.attempts[1]?.visibleWitnessNotes).toEqual([
      "Wrong-target hover evidence: sidebar row highlighted."
    ]);
    expect(result.attempts.every((attempt) => attempt.transitionGate !== undefined)).toBe(true);
    expect(result.clickBlock).toMatchObject({
      attempted: true,
      isError: true,
      status: "block"
    });
    expect(result.clickBlock?.residue).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/provider|policy/i)
      ])
    );
    expect(result.residue).toContain("No raw OS input was used by the runner.");
    expect(result.attempts[0]?.preObservation?.frames[0]?.imagePath).toEqual(expect.any(String));
    expect(existsSync(result.attempts[0]?.preObservation?.frames[0]?.imagePath ?? "")).toBe(true);
  });

  it("records stale-observation movement blocks without moving the cursor", async () => {
    const backend = new FakeWindowsBackend();
    const provider = new WindowsDesktopObservationProvider({
      backend,
      platform: "win32",
      enableRealMouseMovement: true
    });
    let tick = 0;
    const result = await runGovernedManualProbe(
      configFixture({
        sessionId: "manual-probe-stale-session",
        observationCadenceMaxGapMs: 1_000,
        includeImages: false,
        verifyClickBlocked: false
      }),
      {
        desktopProvider: provider,
        now: () => new Date(Date.UTC(2026, 4, 28, 10, 0, tick++ * 10)).toISOString()
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.move).toMatchObject({
      isError: true,
      status: "block"
    });
    expect(result.attempts[0]?.move?.policy).toMatchObject({
      decision: "block",
      auditTags: expect.arrayContaining(["stale_pre_action_observation"])
    });
    expect(result.attempts[0]?.postObservation).toBeUndefined();
    expect(backend.movedPoints).toEqual([]);
  });

  it("refuses real mouse movement unless explicitly allowed by runner config", async () => {
    const result = await runGovernedManualProbe(
      configFixture({
        sessionId: "manual-probe-missing-real-gate",
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
  });
});
