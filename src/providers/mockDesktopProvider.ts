import { createHash } from "node:crypto";
import type {
  DesktopCursorWitness,
  DesktopFrameArtifact,
  DesktopHoverWitness,
  DesktopPoint,
  DesktopWindowMetadata
} from "../policy/sessionLicensePolicy.js";
import type {
  DesktopInteractionProvider,
  DesktopObserveRequest,
  DesktopObserveResult,
  DesktopProviderActionRequest,
  DesktopProviderActionResult,
  DesktopProviderCapabilities
} from "./desktopProvider.js";

const mockPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export interface MockDesktopProviderOptions {
  maxFramesPerObservation?: number;
  maxObservationDurationMs?: number;
  activeWindow?: DesktopWindowMetadata;
  cursorPosition?: DesktopPoint;
}

export class MockDesktopProvider implements DesktopInteractionProvider {
  private readonly maxFramesPerObservation: number;
  private readonly maxObservationDurationMs: number;
  private readonly activeWindow: DesktopWindowMetadata;
  private cursorPosition: DesktopPoint;

  constructor(options: MockDesktopProviderOptions = {}) {
    this.maxFramesPerObservation = options.maxFramesPerObservation ?? 12;
    this.maxObservationDurationMs = options.maxObservationDurationMs ?? 5_000;
    this.activeWindow = options.activeWindow ?? {
      title: "Mock Desktop Window",
      processName: "mock-desktop-provider",
      appName: "Agent Desktop Automation Mock"
    };
    this.cursorPosition = options.cursorPosition ?? {
      x: 320,
      y: 180
    };
  }

  getCapabilities(): DesktopProviderCapabilities {
    return {
      providerName: "mock_desktop_provider",
      providerKind: "mock",
      supportsObservation: true,
      supportsMouse: true,
      supportsClick: true,
      supportsTyping: true,
      realDesktopCapture: false,
      realDesktopMouseMovement: false,
      realDesktopMutation: false,
      maxFramesPerObservation: this.maxFramesPerObservation,
      maxObservationDurationMs: this.maxObservationDurationMs,
      residue: [
        "Provider returns deterministic mock frame metadata.",
        "Provider does not capture the real desktop.",
        "Provider simulates mouse movement in memory only.",
        "Provider simulates click and typing results in memory only.",
        "Provider does not move the real mouse, click the real desktop, type into the real desktop, launch apps, or mutate OS state."
      ]
    };
  }

  async observe(request: DesktopObserveRequest): Promise<DesktopObserveResult> {
    const effectiveFrameCount = this.effectiveFrameCount(request);
    const effectiveDurationMs = Math.min(request.durationMs, this.maxObservationDurationMs);
    const frames = Array.from({ length: effectiveFrameCount }, (_, index) =>
      this.buildFrame(request, index, effectiveFrameCount, effectiveDurationMs)
    );
    const residue = [
      "Mock observation only: no real desktop pixels were captured.",
      "No OCR, localization, real mouse movement, real click, real typing, or background polling occurred.",
      `Observation was bounded to ${effectiveFrameCount} frame(s) over ${effectiveDurationMs} ms.`
    ];

    if (request.mode === "single_frame") {
      residue.push("single_frame mode was used inside the session-first observation architecture.");
    }

    return {
      targetScope: request.targetScope,
      observedAt: request.observedAt,
      activeWindow: this.activeWindow,
      cursorPosition: this.cursorPosition,
      cursorWitness: this.buildCursorWitness(request.observedAt),
      hoverWitness: this.buildHoverWitness(),
      frames,
      lastActionDeltaSummary: "No prior action delta is available in the mock observation provider.",
      residue
    };
  }

  async moveMouse(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    if (request.point !== undefined) {
      this.cursorPosition = request.point;
    }

    return {
      executed: true,
      simulated: true,
      cursorPosition: this.cursorPosition,
      residue: [
        "Mock provider simulated mouse movement in memory only.",
        "No real cursor movement or OS mutation occurred.",
        ...(request.intendedSemanticTarget === undefined
          ? []
          : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
      ]
    };
  }

  async click(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    if (request.point !== undefined) {
      this.cursorPosition = request.point;
    }

    return {
      executed: true,
      simulated: true,
      cursorPosition: this.cursorPosition,
      clickedButton: request.button ?? "left",
      residue: [
        "Mock provider simulated click in memory only.",
        "No real click or OS mutation occurred.",
        ...(request.intendedSemanticTarget === undefined
          ? []
          : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
      ]
    };
  }

  async typeText(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    return {
      executed: true,
      simulated: true,
      typedTextLength: request.textLength ?? request.text?.length ?? 0,
      residue: [
        "Mock provider simulated text entry in memory only.",
        "No real typing or OS mutation occurred.",
        "Text content was not stored by the mock provider.",
        ...(request.intendedSemanticTarget === undefined
          ? []
          : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
      ]
    };
  }

  private effectiveFrameCount(request: DesktopObserveRequest): number {
    if (request.mode === "single_frame") {
      return 1;
    }

    return Math.min(request.maxFrames, this.maxFramesPerObservation);
  }

  private buildFrame(
    request: DesktopObserveRequest,
    index: number,
    frameCount: number,
    durationMs: number
  ): DesktopFrameArtifact {
    const elapsedMs = frameCount <= 1 ? 0 : Math.min(durationMs, Math.floor((durationMs * index) / (frameCount - 1)));
    const capturedAt = addMilliseconds(request.observedAt, elapsedMs);
    const bytes = Buffer.from(mockPngBase64, "base64");

    return {
      index,
      capturedAt,
      elapsedMs,
      mimeType: request.frameFormat,
      width: 1,
      height: 1,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      witness: {
        pixelSource: "raw",
        cursorRenderedIntoFrame: false,
        residue: [
          "Mock frame pixels are deterministic raw fixtures and do not contain a rendered cursor."
        ]
      },
      ...(request.includeImages ? { dataBase64: mockPngBase64 } : {})
    };
  }

  private buildCursorWitness(observedAt: string): DesktopCursorWitness {
    return {
      status: "observed",
      visible: true,
      position: this.cursorPosition,
      coordinateSpace: "active_window_frame",
      providerSource: "mock_desktop_provider",
      observedAt,
      confidence: "medium",
      renderedIntoFrame: false,
      residue: [
        "Mock provider reports a deterministic active-window-relative cursor position.",
        "Mock frame pixels are not cursor-annotated."
      ]
    };
  }

  private buildHoverWitness(): DesktopHoverWitness {
    return {
      evaluated: false,
      confidence: "low",
      signals: [],
      residue: [
        "Mock provider does not evaluate hover highlights, tooltips, cursor shape, or visual deltas."
      ]
    };
  }

}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) {
    return timestamp;
  }

  return new Date(parsed + milliseconds).toISOString();
}
