import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  DesktopCursorWitness,
  DesktopFrameArtifact,
  DesktopHoverWitness,
  DesktopInteractionScope,
  DesktopPoint,
  DesktopProviderTimingDiagnostics,
  DesktopProviderTimingEntry,
  DesktopRectangle,
  DesktopWindowMetadata
} from "../policy/sessionLicensePolicy.js";
import {
  DesktopProviderError,
  type DesktopApplicationLaunchRequest,
  type DesktopApplicationLaunchResult,
  type DesktopInteractionProvider,
  type DesktopObserveRequest,
  type DesktopObserveResult,
  type DesktopProviderActionRequest,
  type DesktopProviderActionResult,
  type DesktopProviderCapabilities
} from "./desktopProvider.js";

const execFileAsync = promisify(execFile);

export interface WindowsActiveWindowSnapshot {
  windowId?: string;
  title?: string;
  processName?: string;
  appName?: string;
  bounds?: DesktopRectangle;
}

export interface WindowsCursorCaptureMetadata {
  visible?: boolean;
  screenPosition?: DesktopPoint;
  framePosition?: DesktopPoint;
  hotspot?: DesktopPoint;
  renderedIntoFrame: boolean;
  nativeCursorRenderedIntoFrame?: boolean;
  witnessMarkerRenderedIntoFrame?: boolean;
  renderingMethod?: string;
  residue: string[];
}

export interface WindowsCaptureTiming {
  entries: DesktopProviderTimingEntry[];
  residue: string[];
}

export interface WindowsCapturedFrame extends WindowsActiveWindowSnapshot {
  dataBase64: string;
  cursor?: WindowsCursorCaptureMetadata;
  timing?: WindowsCaptureTiming;
}

export interface WindowsObservationBackend {
  getActiveWindow(): Promise<WindowsActiveWindowSnapshot>;
  getCursorPosition(): Promise<DesktopPoint>;
  captureActiveWindowPng(): Promise<WindowsCapturedFrame>;
  moveMouseTo(point: DesktopPoint): Promise<DesktopPoint>;
  clickMouseAt?(
    point: DesktopPoint,
    button: "left" | "middle" | "right"
  ): Promise<DesktopPoint>;
  typeText?(text: string): Promise<number>;
  openApplication?(
    request: DesktopApplicationLaunchRequest
  ): Promise<DesktopApplicationLaunchResult>;
  dispose?(): void;
}

export interface WindowsDesktopObservationProviderOptions {
  backend?: WindowsObservationBackend;
  platform?: NodeJS.Platform;
  enableRealMouseMovement?: boolean;
  enableRealClick?: boolean;
  enableRealTyping?: boolean;
  enableRealApplicationLaunch?: boolean;
  maxFramesPerObservation?: number;
  maxObservationDurationMs?: number;
  frameDelay?: (milliseconds: number) => Promise<void>;
  usePersistentPowerShellHelper?: boolean;
}

export class WindowsDesktopObservationProvider implements DesktopInteractionProvider {
  private readonly backend: WindowsObservationBackend;
  private readonly platform: NodeJS.Platform;
  private readonly enableRealMouseMovement: boolean;
  private readonly enableRealClick: boolean;
  private readonly enableRealTyping: boolean;
  private readonly enableRealApplicationLaunch: boolean;
  private readonly maxFramesPerObservation: number;
  private readonly maxObservationDurationMs: number;
  private readonly frameDelay: (milliseconds: number) => Promise<void>;

  constructor(options: WindowsDesktopObservationProviderOptions = {}) {
    this.backend =
      options.backend ??
      (options.usePersistentPowerShellHelper === false
        ? new PowerShellWindowsObservationBackend()
        : new PersistentPowerShellWindowsObservationBackend());
    this.platform = options.platform ?? process.platform;
    this.enableRealMouseMovement = options.enableRealMouseMovement ?? false;
    this.enableRealClick = options.enableRealClick ?? false;
    this.enableRealTyping = options.enableRealTyping ?? false;
    this.enableRealApplicationLaunch = options.enableRealApplicationLaunch ?? false;
    this.maxFramesPerObservation = options.maxFramesPerObservation ?? 6;
    this.maxObservationDurationMs = options.maxObservationDurationMs ?? 2_000;
    this.frameDelay = options.frameDelay ?? delay;
  }

  getCapabilities(): DesktopProviderCapabilities {
    return {
      providerName: "windows_active_window_observation_provider",
      providerKind: "real",
      supportsObservation: true,
      supportsMouse: this.enableRealMouseMovement,
      supportsClick: this.enableRealClick,
      supportsTyping: this.enableRealTyping,
      supportsApplicationLaunch:
        this.enableRealApplicationLaunch && this.backend.openApplication !== undefined,
      realDesktopCapture: true,
      realDesktopMouseMovement: this.enableRealMouseMovement || this.enableRealClick,
      realDesktopApplicationLaunch:
        this.enableRealApplicationLaunch && this.backend.openApplication !== undefined,
      realDesktopMutation: this.enableRealClick || this.enableRealTyping,
      maxFramesPerObservation: this.maxFramesPerObservation,
      maxObservationDurationMs: this.maxObservationDurationMs,
      residue: [
        "Provider captures bounded visible active-window frames only when explicitly selected.",
        this.backend instanceof PersistentPowerShellWindowsObservationBackend
          ? "Provider uses a persistent PowerShell helper to keep Win32 observation setup warm."
          : "Provider uses per-call PowerShell execution.",
        this.enableRealMouseMovement
          ? "Provider may move the real mouse pointer as an opt-in active-window-scoped probe."
          : "Provider does not move the real mouse pointer unless the explicit movement gate is enabled.",
        this.enableRealClick
          ? "Provider may click the real desktop only through the explicit app-scoped real-click gate."
          : "Provider does not click unless the explicit app-scoped real-click gate is enabled.",
        this.enableRealTyping
          ? "Provider may type generated test input only through the explicit app-scoped real-typing gate."
          : "Provider does not type unless the explicit app-scoped real-typing gate is enabled.",
        this.enableRealApplicationLaunch
          ? "Provider may launch catalog allowlisted applications only through the explicit app-launch gate."
          : "Provider does not launch applications unless the explicit app-launch gate is enabled.",
        "Provider does not accept arbitrary executable paths, command-line arguments, shell commands, or broad desktop-control requests.",
        "Provider performs no OCR, localization, hidden polling, or background capture."
      ]
    };
  }

  dispose(): void {
    this.backend.dispose?.();
  }

  async observe(request: DesktopObserveRequest): Promise<DesktopObserveResult> {
    const timing = new ProviderTimingCollector(
      "windows_active_window_observation_provider",
      "real"
    );

    this.ensureAvailable();

    const activeWindow = await timing.measure("active_window_metadata_lookup", () =>
      this.safeGetActiveWindow()
    );
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);

    const frameCount = request.mode === "single_frame"
      ? 1
      : Math.min(request.maxFrames, this.maxFramesPerObservation);
    const durationMs = Math.min(request.durationMs, this.maxObservationDurationMs);
    const frameSpacingMs = frameCount <= 1 ? 0 : Math.floor(durationMs / (frameCount - 1));
    const frames: DesktopFrameArtifact[] = [];
    let latestActiveWindow = activeWindow;
    let latestCursorCapture: WindowsCursorCaptureMetadata | undefined;

    for (let index = 0; index < frameCount; index += 1) {
      if (index > 0 && frameSpacingMs > 0) {
        await this.frameDelay(frameSpacingMs);
      }

      const captured = await timing.measure(`frame_${index}_capture_active_window_png`, () =>
        this.safeCaptureActiveWindow()
      );
      timing.addEntries(prefixTimingEntries(`frame_${index}.powershell`, captured.timing));
      this.assertTargetScopeMatchesActiveWindow(request.targetScope, captured);
      latestActiveWindow = captured;
      latestCursorCapture = captured.cursor;
      const bytes = timing.measureSync(`frame_${index}_decode_frame_bytes`, () =>
        Buffer.from(captured.dataBase64, "base64")
      );
      const elapsedMs = index * frameSpacingMs;

      frames.push(
        timing.measureSync(`frame_${index}_build_frame_artifact`, () => ({
          index,
          capturedAt: addMilliseconds(request.observedAt, elapsedMs),
          elapsedMs,
          mimeType: "image/png" as const,
          width: captured.bounds?.width ?? 1,
          height: captured.bounds?.height ?? 1,
          byteLength: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          witness: frameWitnessFromCursorCapture(captured.cursor),
          ...(request.includeImages ? { dataBase64: captured.dataBase64 } : {})
        }))
      );
    }

    const cursorWitness = await this.safeGetCursorWitness(
      request.observedAt,
      latestActiveWindow,
      latestCursorCapture,
      timing
    );

    return {
      targetScope: request.targetScope,
      observedAt: request.observedAt,
      activeWindow: toWindowMetadata(latestActiveWindow),
      cursorPosition: cursorWitness.position,
      cursorWitness,
      hoverWitness: buildUnavailableHoverWitness(),
      providerTiming: timing.finish([
        "Provider timing is diagnostic only and is not used as policy evidence.",
        "PowerShell substage timings, when present, are reported by the capture script."
      ]),
      frames,
      lastActionDeltaSummary:
        "Real active-window observation captured bounded frame evidence; no OCR or localization was performed.",
      residue: [
        "Real visible active-window capture occurred inside the bounded provider call.",
        `Observation was bounded to ${frames.length} frame(s) over ${durationMs} ms.`,
        cursorWitness.position === undefined
          ? "Cursor position was unavailable; cursor witness residue explains why."
          : "Cursor position is reported in active-window frame coordinates.",
        "No mouse movement, click, typing, OCR, localization, hidden polling, or background capture occurred."
      ]
    };
  }

  async moveMouse(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    const timing = new ProviderTimingCollector(
      "windows_active_window_observation_provider",
      "real"
    );

    if (!this.enableRealMouseMovement) {
      return unsupportedActionResult("move_mouse");
    }

    this.ensureAvailable();

    if (request.point === undefined) {
      throw new DesktopProviderError(
        "invalid_action_target",
        "Mouse movement requires a target point.",
        ["No real cursor movement occurred."]
      );
    }

    const activeWindow = await timing.measure("pre_move_active_window_metadata_lookup", () =>
      this.safeGetActiveWindow()
    );
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);
    const screenPoint = pointToActiveWindowScreenPoint(request.point, activeWindow);
    const movedCursor = await timing.measure("set_cursor_position", () =>
      this.safeMoveMouseTo(screenPoint)
    );
    const postMoveActiveWindow = await timing.measure(
      "post_move_active_window_metadata_lookup",
      () => this.safeGetActiveWindow()
    );
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, postMoveActiveWindow);

    return {
      executed: true,
      simulated: false,
      cursorPosition: cursorToActiveWindowPoint(movedCursor, postMoveActiveWindow),
      providerTiming: timing.finish([
        "Provider movement timing is diagnostic only and is not used as policy evidence."
      ]),
      residue: [
        "Real mouse pointer movement occurred as an opt-in bounded probe.",
        "Requested point was interpreted in active-window frame coordinates.",
        "No click, typing, app launch, shell command, or durable desktop mutation occurred.",
        "A post-movement observation is required before the next non-observe action.",
        ...(request.intendedSemanticTarget === undefined
          ? []
          : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
      ]
    };
  }

  async click(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    const timing = new ProviderTimingCollector(
      "windows_active_window_observation_provider",
      "real"
    );

    if (!this.enableRealClick) {
      return unsupportedActionResult("click");
    }

    this.ensureAvailable();

    if (request.point === undefined) {
      throw new DesktopProviderError(
        "invalid_action_target",
        "Clicking requires a target point.",
        ["No real click occurred."]
      );
    }

    const button = request.button ?? "left";
    const activeWindow = await timing.measure("pre_click_active_window_metadata_lookup", () =>
      this.safeGetActiveWindow()
    );
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);
    const screenPoint = pointToActiveWindowScreenPoint(
      request.point,
      activeWindow,
      "No real click occurred."
    );
    const clickedCursor = await timing.measure("click_mouse", () =>
      this.safeClickMouseAt(screenPoint, button)
    );
    const residue = [
      "Real desktop click occurred through the explicit app-scoped real-click gate.",
      "Requested point was interpreted in active-window frame coordinates.",
      "A post-click observation is required before the next non-observe action.",
      ...(request.intendedSemanticTarget === undefined
        ? []
        : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
    ];
    let cursorPosition = cursorToActiveWindowPoint(clickedCursor, activeWindow);

    try {
      const postClickActiveWindow = await timing.measure(
        "post_click_active_window_metadata_lookup",
        () => this.safeGetActiveWindow()
      );
      this.assertTargetScopeMatchesActiveWindow(request.targetScope, postClickActiveWindow);
      cursorPosition = cursorToActiveWindowPoint(clickedCursor, postClickActiveWindow);
      residue.push("Post-click active-window metadata still matches the requested scope.");
    } catch (error: unknown) {
      if (error instanceof DesktopProviderError) {
        residue.push(
          error.code === "scope_mismatch"
            ? "Post-click active-window metadata no longer matches the requested scope; follow-up observation must audit the transition."
            : "Post-click active-window metadata could not be verified; follow-up observation must audit the transition."
        );
        residue.push(...error.residue);
      } else {
        throw error;
      }
    }

    return {
      executed: true,
      simulated: false,
      cursorPosition,
      clickedButton: button,
      providerTiming: timing.finish([
        "Provider click timing is diagnostic only and is not used as policy evidence."
      ]),
      residue
    };
  }

  async typeText(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    const timing = new ProviderTimingCollector(
      "windows_active_window_observation_provider",
      "real"
    );

    if (!this.enableRealTyping) {
      return unsupportedActionResult("type_text");
    }

    this.ensureAvailable();

    if (request.text === undefined || request.text.length === 0) {
      throw new DesktopProviderError(
        "invalid_action_target",
        "Typing requires non-empty generated test text.",
        ["No real typing occurred."]
      );
    }

    const activeWindow = await timing.measure("pre_type_active_window_metadata_lookup", () =>
      this.safeGetActiveWindow()
    );
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);
    const typedTextLength = await timing.measure("type_text", () =>
      this.safeTypeText(request.text as string)
    );
    const residue = [
      "Real desktop typing occurred through the explicit app-scoped real-typing gate.",
      `Typed text length: ${typedTextLength}.`,
      request.sensitivityClassification === undefined
        ? "Text sensitivity classification was not provided to the provider."
        : `Text sensitivity classification: ${request.sensitivityClassification}.`,
      "Typed text content is not returned by the provider.",
      "A post-typing observation is required before the next non-observe action.",
      ...(request.intendedSemanticTarget === undefined
        ? []
        : [`Intended semantic target: ${request.intendedSemanticTarget}.`])
    ];

    try {
      const postTypeActiveWindow = await timing.measure(
        "post_type_active_window_metadata_lookup",
        () => this.safeGetActiveWindow()
      );
      this.assertTargetScopeMatchesActiveWindow(request.targetScope, postTypeActiveWindow);
      residue.push("Post-typing active-window metadata still matches the requested scope.");
    } catch (error: unknown) {
      if (error instanceof DesktopProviderError) {
        residue.push(
          error.code === "scope_mismatch"
            ? "Post-typing active-window metadata no longer matches the requested scope; follow-up observation must audit the transition."
            : "Post-typing active-window metadata could not be verified; follow-up observation must audit the transition."
        );
        residue.push(...error.residue);
      } else {
        throw error;
      }
    }

    return {
      executed: true,
      simulated: false,
      typedTextLength,
      providerTiming: timing.finish([
        "Provider typing timing is diagnostic only and is not used as policy evidence."
      ]),
      residue
    };
  }

  async openApplication(
    request: DesktopApplicationLaunchRequest
  ): Promise<DesktopApplicationLaunchResult> {
    if (!this.enableRealApplicationLaunch || this.backend.openApplication === undefined) {
      return {
        executed: false,
        simulated: false,
        applicationId: request.application.id,
        displayName: request.application.displayName,
        residue: [
          "Application launch is disabled for the Windows provider unless ADMCP_ENABLE_REAL_APP_LAUNCH=true and the backend supports catalog launch.",
          "No application was launched."
        ]
      };
    }

    this.ensureAvailable();

    return this.backend.openApplication(request);
  }

  private ensureAvailable(): void {
    if (this.platform !== "win32") {
      throw new DesktopProviderError(
        "real_observation_unavailable",
        "Windows active-window observation is available only on win32 platforms.",
        ["No desktop frame was captured."]
      );
    }
  }

  private async safeGetActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    try {
      return await this.backend.getActiveWindow();
    } catch (error: unknown) {
      throw providerCaptureError(error, "Failed to read active-window metadata.");
    }
  }

  private async safeCaptureActiveWindow(): Promise<WindowsCapturedFrame> {
    try {
      return await this.backend.captureActiveWindowPng();
    } catch (error: unknown) {
      throw providerCaptureError(error, "Failed to capture the active window.");
    }
  }

  private async safeGetCursorWitness(
    observedAt: string,
    activeWindow: WindowsActiveWindowSnapshot,
    cursorCapture: WindowsCursorCaptureMetadata | undefined,
    timing: ProviderTimingCollector
  ): Promise<DesktopCursorWitness> {
    if (cursorCapture !== undefined) {
      return cursorWitnessFromCapture(observedAt, cursorCapture);
    }

    try {
      const cursorPosition = cursorToActiveWindowPoint(
        await timing.measure("cursor_position_fallback_lookup", () =>
          this.backend.getCursorPosition()
        ),
        activeWindow
      );

      return {
        status: "observed",
        visible: true,
        position: cursorPosition,
        coordinateSpace: "active_window_frame",
        providerSource: "windows_active_window_observation_provider",
        observedAt,
        confidence: "medium",
        renderedIntoFrame: false,
        residue: [
          "Cursor position was read after frame capture.",
          "The captured frame did not include provider cursor-rendering metadata."
        ]
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to read cursor position.";

      return {
        status: "unavailable",
        coordinateSpace: "unknown",
        providerSource: "windows_active_window_observation_provider",
        observedAt,
        confidence: "low",
        renderedIntoFrame: false,
        residue: [
          message,
          "Observation frame capture still succeeded; no cursor position claim is made."
        ]
      };
    }
  }

  private async safeMoveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    try {
      return await this.backend.moveMouseTo(point);
    } catch (error: unknown) {
      throw providerCaptureError(error, "Failed to move the mouse pointer.");
    }
  }

  private async safeClickMouseAt(
    point: DesktopPoint,
    button: "left" | "middle" | "right"
  ): Promise<DesktopPoint> {
    if (this.backend.clickMouseAt === undefined) {
      throw new DesktopProviderError(
        "real_control_disabled",
        "The Windows observation backend does not support real clicking.",
        ["No real click occurred."]
      );
    }

    try {
      return await this.backend.clickMouseAt(point, button);
    } catch (error: unknown) {
      throw providerControlError(error, "Failed to click the mouse pointer.");
    }
  }

  private async safeTypeText(text: string): Promise<number> {
    if (this.backend.typeText === undefined) {
      throw new DesktopProviderError(
        "real_control_disabled",
        "The Windows observation backend does not support real typing.",
        ["No real typing occurred."]
      );
    }

    try {
      return await this.backend.typeText(text);
    } catch (error: unknown) {
      throw providerControlError(error, "Failed to type generated test input.");
    }
  }

  private assertTargetScopeMatchesActiveWindow(
    targetScope: DesktopInteractionScope,
    activeWindow: WindowsActiveWindowSnapshot
  ): void {
    if (scopeMatchesActiveWindow(targetScope, activeWindow)) {
      return;
    }

    throw new DesktopProviderError(
      "scope_mismatch",
      "The active window does not match the requested observation scope.",
      [
        "No desktop frame was recorded for the session.",
        `Requested scope: ${targetScope.kind}${targetScope.value === undefined ? "" : `=${targetScope.value}`}.`,
        `Active window: ${activeWindowIdentity(activeWindow) ?? "unknown"}.`
      ]
    );
  }
}

type WindowsHelperCommand =
  | "get_active_window"
  | "get_cursor_position"
  | "capture_active_window_png"
  | "move_mouse"
  | "click_mouse"
  | "type_text"
  | "open_application"
  | "shutdown";

export interface WindowsObservationHelperClient {
  request<T>(command: WindowsHelperCommand, payload?: Record<string, unknown>): Promise<T>;
  dispose(): void;
}

export interface PersistentPowerShellWindowsObservationBackendOptions {
  helperClient?: WindowsObservationHelperClient;
  requestTimeoutMs?: number;
  powershellCommand?: string;
}

export class PersistentPowerShellWindowsObservationBackend implements WindowsObservationBackend {
  private readonly helperClient: WindowsObservationHelperClient;

  constructor(options: PersistentPowerShellWindowsObservationBackendOptions = {}) {
    this.helperClient =
      options.helperClient ??
      new PowerShellWindowsObservationHelperClient({
        requestTimeoutMs: options.requestTimeoutMs,
        powershellCommand: options.powershellCommand
      });
  }

  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    return this.helperClient.request<WindowsActiveWindowSnapshot>("get_active_window");
  }

  async getCursorPosition(): Promise<DesktopPoint> {
    return this.helperClient.request<DesktopPoint>("get_cursor_position");
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    return this.helperClient.request<WindowsCapturedFrame>("capture_active_window_png");
  }

  async moveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    return this.helperClient.request<DesktopPoint>("move_mouse", {
      point
    });
  }

  async clickMouseAt(
    point: DesktopPoint,
    button: "left" | "middle" | "right"
  ): Promise<DesktopPoint> {
    return this.helperClient.request<DesktopPoint>("click_mouse", {
      point,
      button
    });
  }

  async typeText(text: string): Promise<number> {
    const result = await this.helperClient.request<{ typedTextLength: number }>(
      "type_text",
      {
        text
      }
    );

    return result.typedTextLength;
  }

  async openApplication(
    request: DesktopApplicationLaunchRequest
  ): Promise<DesktopApplicationLaunchResult> {
    return this.helperClient.request<DesktopApplicationLaunchResult>("open_application", {
      application: request.application,
      requestedAt: request.requestedAt
    });
  }

  dispose(): void {
    this.helperClient.dispose();
  }
}

interface PowerShellWindowsObservationHelperClientOptions {
  requestTimeoutMs?: number;
  powershellCommand?: string;
}

interface PendingHelperRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class PowerShellWindowsObservationHelperClient implements WindowsObservationHelperClient {
  private readonly requestTimeoutMs: number;
  private readonly powershellCommand: string;
  private helperProcess?: ChildProcessWithoutNullStreams;
  private helperScriptDirectory?: string;
  private helperScriptPath?: string;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private requestCounter = 0;
  private readonly pendingRequests = new Map<string, PendingHelperRequest>();

  constructor(options: PowerShellWindowsObservationHelperClientOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.powershellCommand = options.powershellCommand ?? "powershell.exe";
  }

  request<T>(command: WindowsHelperCommand, payload: Record<string, unknown> = {}): Promise<T> {
    const helperProcess = this.ensureProcess();
    const id = `request-${++this.requestCounter}`;
    const message = `${JSON.stringify({
      id,
      command,
      ...payload
    })}\n`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.dispose();
        reject(
          new Error(
            `Persistent Windows observation helper timed out after ${this.requestTimeoutMs} ms while handling ${command}.`
          )
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout
      });

      helperProcess.stdin.write(message, (error: Error | null | undefined) => {
        if (error !== undefined && error !== null) {
          this.rejectPendingRequest(id, error);
        }
      });
    });
  }

  dispose(): void {
    const helperProcess = this.helperProcess;

    this.helperProcess = undefined;

    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Persistent Windows observation helper was stopped."));
      this.pendingRequests.delete(id);
    }

    if (helperProcess !== undefined && !helperProcess.killed) {
      try {
        helperProcess.stdin.end();
      } catch {
        // Best-effort cleanup only.
      }

      try {
        helperProcess.kill();
      } catch {
        // Best-effort cleanup only.
      }
    }

    if (this.helperScriptDirectory !== undefined) {
      rmSync(this.helperScriptDirectory, {
        recursive: true,
        force: true
      });
      this.helperScriptDirectory = undefined;
      this.helperScriptPath = undefined;
    }
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.helperProcess !== undefined && !this.helperProcess.killed) {
      return this.helperProcess;
    }

    this.stderrBuffer = "";
    this.stdoutBuffer = "";
    this.ensureHelperScriptFile();
    const helperProcess = spawn(
      this.powershellCommand,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.helperScriptPath as string
      ],
      {
        windowsHide: true,
        stdio: "pipe"
      }
    );

    helperProcess.stdout.setEncoding("utf8");
    helperProcess.stderr.setEncoding("utf8");
    helperProcess.unref();
    unrefStream(helperProcess.stdin);
    unrefStream(helperProcess.stdout);
    unrefStream(helperProcess.stderr);
    helperProcess.stdout.on("data", (chunk: string) => {
      this.handleStdout(chunk);
    });
    helperProcess.stderr.on("data", (chunk: string) => {
      this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-4000);
    });
    helperProcess.on("error", (error) => {
      this.failAllPending(error);
    });
    helperProcess.on("exit", (code, signal) => {
      this.helperProcess = undefined;
      this.failAllPending(
        new Error(
          `Persistent Windows observation helper exited unexpectedly with code ${String(code)} and signal ${String(signal)}.${this.stderrBuffer.length === 0 ? "" : ` stderr: ${this.stderrBuffer}`}`
        )
      );
    });

    this.helperProcess = helperProcess;

    return helperProcess;
  }

  private ensureHelperScriptFile(): void {
    if (this.helperScriptPath !== undefined) {
      return;
    }

    const directory = mkdtempSync(join(tmpdir(), "admcp-windows-helper-"));
    const scriptPath = join(directory, "windows-observation-helper.ps1");

    writeFileSync(scriptPath, persistentWindowsObservationHelperScript, "utf8");
    this.helperScriptDirectory = directory;
    this.helperScriptPath = scriptPath;
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.handleResponseLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleResponseLine(line: string): void {
    let response: Record<string, unknown>;

    try {
      response = JSON.parse(line) as Record<string, unknown>;
    } catch (error: unknown) {
      this.failAllPending(
        new Error(
          `Persistent Windows observation helper returned malformed JSON: ${line.slice(0, 200)}`
        )
      );
      this.dispose();

      return;
    }

    const id = typeof response.id === "string" ? response.id : undefined;

    if (id === undefined) {
      this.failAllPending(
        new Error("Persistent Windows observation helper returned a response without an id.")
      );
      this.dispose();

      return;
    }

    const pending = this.pendingRequests.get(id);

    if (pending === undefined) {
      return;
    }

    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);

    if (response.ok === true) {
      pending.resolve(response.result);
      return;
    }

    const errorRecord =
      typeof response.error === "object" && response.error !== null
        ? (response.error as Record<string, unknown>)
        : {};
    const message =
      typeof errorRecord.message === "string"
        ? errorRecord.message
        : "Persistent Windows observation helper returned an error.";

    pending.reject(new Error(message));
  }

  private rejectPendingRequest(id: string, error: Error): void {
    const pending = this.pendingRequests.get(id);

    if (pending === undefined) {
      return;
    }

    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}

class PowerShellWindowsObservationBackend implements WindowsObservationBackend {
  async getActiveWindow(): Promise<WindowsActiveWindowSnapshot> {
    return runPowerShellJson<WindowsActiveWindowSnapshot>(activeWindowMetadataScript);
  }

  async getCursorPosition(): Promise<DesktopPoint> {
    return runPowerShellJson<DesktopPoint>(cursorPositionScript);
  }

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    return runPowerShellJson<WindowsCapturedFrame>(activeWindowCaptureScript);
  }

  async moveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    return runPowerShellJson<DesktopPoint>(moveMouseScript(point));
  }

  async clickMouseAt(
    point: DesktopPoint,
    button: "left" | "middle" | "right"
  ): Promise<DesktopPoint> {
    return runPowerShellJson<DesktopPoint>(clickMouseScript(point, button));
  }

  async typeText(text: string): Promise<number> {
    const result = await runPowerShellJson<{ typedTextLength: number }>(typeTextScript(text));

    return result.typedTextLength;
  }

  async openApplication(
    request: DesktopApplicationLaunchRequest
  ): Promise<DesktopApplicationLaunchResult> {
    return runPowerShellControlJson<DesktopApplicationLaunchResult>(
      openApplicationScript(request)
    );
  }
}

async function runPowerShellJson<T>(script: string): Promise<T> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 64 * 1024 * 1024
      }
    );

    return JSON.parse(stdout.trim()) as T;
  } catch (error: unknown) {
    throw providerCaptureError(error, "PowerShell active-window observation failed.");
  }
}

async function runPowerShellControlJson<T>(script: string): Promise<T> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 64 * 1024 * 1024
      }
    );

    return JSON.parse(stdout.trim()) as T;
  } catch (error: unknown) {
    throw providerControlError(error, "PowerShell desktop control command failed.");
  }
}

class ProviderTimingCollector {
  private readonly startedAtMs = Date.now();
  private readonly entries: DesktopProviderTimingEntry[] = [];

  constructor(
    private readonly providerName: string,
    private readonly providerKind: DesktopProviderTimingDiagnostics["providerKind"]
  ) {}

  async measure<T>(operation: string, callback: () => Promise<T>): Promise<T> {
    const startedAtMs = Date.now();

    try {
      const result = await callback();

      this.entries.push({
        operation,
        durationMs: elapsedSince(startedAtMs),
        status: "completed",
        residue: []
      });

      return result;
    } catch (error: unknown) {
      this.entries.push({
        operation,
        durationMs: elapsedSince(startedAtMs),
        status: "failed",
        residue: [
          error instanceof Error ? error.message : "Unknown provider timing failure."
        ]
      });

      throw error;
    }
  }

  measureSync<T>(operation: string, callback: () => T): T {
    const startedAtMs = Date.now();

    try {
      const result = callback();

      this.entries.push({
        operation,
        durationMs: elapsedSince(startedAtMs),
        status: "completed",
        residue: []
      });

      return result;
    } catch (error: unknown) {
      this.entries.push({
        operation,
        durationMs: elapsedSince(startedAtMs),
        status: "failed",
        residue: [
          error instanceof Error ? error.message : "Unknown provider timing failure."
        ]
      });

      throw error;
    }
  }

  addEntries(entries: DesktopProviderTimingEntry[]): void {
    this.entries.push(...entries);
  }

  finish(residue: string[]): DesktopProviderTimingDiagnostics {
    return {
      providerName: this.providerName,
      providerKind: this.providerKind,
      totalDurationMs: elapsedSince(this.startedAtMs),
      entries: this.entries,
      residue
    };
  }
}

function prefixTimingEntries(
  prefix: string,
  timing: WindowsCaptureTiming | undefined
): DesktopProviderTimingEntry[] {
  if (timing === undefined) {
    return [
      {
        operation: `${prefix}.timing_unavailable`,
        durationMs: 0,
        status: "skipped",
        residue: ["Capture backend did not report PowerShell substage timing."]
      }
    ];
  }

  const entries = timing.entries.map((entry) => ({
    operation: `${prefix}.${entry.operation}`,
    durationMs: Math.max(0, Math.round(entry.durationMs)),
    status: entry.status,
    residue: entry.residue
  }));

  if (timing.residue.length > 0) {
    entries.push({
      operation: `${prefix}.timing_residue`,
      durationMs: 0,
      status: "skipped" as const,
      residue: timing.residue
    });
  }

  return entries;
}

function elapsedSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function unrefStream(stream: unknown): void {
  const candidate = stream as { unref?: () => void };

  candidate.unref?.();
}

function providerCaptureError(error: unknown, fallbackMessage: string): DesktopProviderError {
  if (error instanceof DesktopProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  const denied = /access is denied|permission|denied/i.test(message);

  return new DesktopProviderError(
    denied ? "permission_denied" : "capture_failed",
    message,
    ["No desktop frame or pointer movement was recorded for the session."]
  );
}

function providerControlError(error: unknown, fallbackMessage: string): DesktopProviderError {
  if (error instanceof DesktopProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  const denied = /access is denied|permission|denied/i.test(message);

  return new DesktopProviderError(
    denied ? "permission_denied" : "control_failed",
    message,
    ["No real desktop control action was recorded for the session."]
  );
}

function pointToActiveWindowScreenPoint(
  point: DesktopPoint,
  activeWindow: WindowsActiveWindowSnapshot,
  blockedResidue = "No real cursor movement occurred."
): DesktopPoint {
  const bounds = activeWindow.bounds;

  if (bounds === undefined) {
    throw new DesktopProviderError(
      "invalid_action_target",
      "Active-window bounds are required before moving the mouse pointer.",
      [blockedResidue]
    );
  }

  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= bounds.width ||
    point.y >= bounds.height
  ) {
    throw new DesktopProviderError(
      "invalid_action_target",
      "The requested mouse point is outside the active-window capture frame.",
      [
        blockedResidue,
        `Requested point: x=${point.x}, y=${point.y}.`,
        `Active-window frame: width=${bounds.width}, height=${bounds.height}.`
      ]
    );
  }

  return {
    x: Math.round(bounds.left + point.x),
    y: Math.round(bounds.top + point.y)
  };
}

function cursorToActiveWindowPoint(
  cursorPosition: DesktopPoint,
  activeWindow: WindowsActiveWindowSnapshot
): DesktopPoint {
  const bounds = activeWindow.bounds;

  if (bounds === undefined) {
    return cursorPosition;
  }

  return {
    x: cursorPosition.x - bounds.left,
    y: cursorPosition.y - bounds.top
  };
}

function scopeMatchesActiveWindow(
  targetScope: DesktopInteractionScope,
  activeWindow: WindowsActiveWindowSnapshot
): boolean {
  if (targetScope.kind === "active_window") {
    return targetScope.value === undefined
      ? activeWindowIdentity(activeWindow) !== undefined
      : normalize(activeWindowIdentity(activeWindow)) === normalize(targetScope.value);
  }

  if (targetScope.kind === "window_title") {
    return normalize(activeWindow.title) === normalize(targetScope.value);
  }

  if (targetScope.kind === "process_name") {
    return normalize(activeWindow.processName) === normalize(targetScope.value);
  }

  return false;
}

function activeWindowIdentity(activeWindow: WindowsActiveWindowSnapshot): string | undefined {
  if (activeWindow.windowId !== undefined && activeWindow.windowId.trim().length > 0) {
    return activeWindow.windowId;
  }

  const parts = [activeWindow.processName, activeWindow.title].filter(
    (part): part is string => part !== undefined && part.trim().length > 0
  );

  return parts.length === 0 ? undefined : parts.join(":");
}

function toWindowMetadata(snapshot: WindowsActiveWindowSnapshot): DesktopWindowMetadata {
  return {
    windowId: snapshot.windowId,
    title: snapshot.title,
    processName: snapshot.processName,
    appName: snapshot.appName,
    bounds: snapshot.bounds
  };
}

function frameWitnessFromCursorCapture(
  cursor: WindowsCursorCaptureMetadata | undefined
): NonNullable<DesktopFrameArtifact["witness"]> {
  const cursorResidue = cursor?.residue;

  if (cursor?.renderedIntoFrame === true) {
    return {
      pixelSource: "cursor_annotated",
      cursorRenderedIntoFrame: true,
      nativeCursorRenderedIntoFrame: cursor.nativeCursorRenderedIntoFrame,
      witnessMarkerRenderedIntoFrame: cursor.witnessMarkerRenderedIntoFrame,
      cursorRenderingMethod: cursor.renderingMethod,
      cursorFramePosition: cursor.framePosition,
      cursorHotspot: cursor.hotspot,
      residue:
        cursorResidue === undefined || cursorResidue.length === 0
          ? ["Visible cursor was rendered into the active-window frame."]
          : cursorResidue
    };
  }

  return {
    pixelSource: "raw",
    cursorRenderedIntoFrame: false,
    nativeCursorRenderedIntoFrame: cursor?.nativeCursorRenderedIntoFrame,
    witnessMarkerRenderedIntoFrame: cursor?.witnessMarkerRenderedIntoFrame,
    cursorRenderingMethod: cursor?.renderingMethod,
    cursorFramePosition: cursor?.framePosition,
    cursorHotspot: cursor?.hotspot,
    residue:
      cursorResidue === undefined || cursorResidue.length === 0
        ? ["Frame is a raw active-window capture without a rendered cursor overlay."]
        : cursorResidue
  };
}

function cursorWitnessFromCapture(
  observedAt: string,
  cursor: WindowsCursorCaptureMetadata
): DesktopCursorWitness {
  if (cursor.framePosition === undefined) {
    return {
      status: "unavailable",
      visible: cursor.visible,
      coordinateSpace: "unknown",
      providerSource: "windows_active_window_observation_provider",
      observedAt,
      confidence: "low",
      renderedIntoFrame: false,
      renderingMethod: cursor.renderingMethod,
      residue:
        cursor.residue.length === 0
          ? ["Cursor capture metadata did not include a usable position."]
          : cursor.residue
    };
  }

  return {
    status: "observed",
    visible: cursor.visible,
    position: cursor.framePosition,
    coordinateSpace: cursor.framePosition === undefined ? "screen" : "active_window_frame",
    providerSource: "windows_active_window_observation_provider",
    observedAt,
    confidence:
      cursor.visible === true && cursor.framePosition !== undefined ? "high" : "medium",
    renderedIntoFrame: cursor.renderedIntoFrame,
    nativeCursorRenderedIntoFrame: cursor.nativeCursorRenderedIntoFrame,
    witnessMarkerRenderedIntoFrame: cursor.witnessMarkerRenderedIntoFrame,
    renderingMethod: cursor.renderingMethod,
    residue: cursor.residue
  };
}

function buildUnavailableHoverWitness(): DesktopHoverWitness {
  return {
    evaluated: false,
    confidence: "low",
    signals: [],
    residue: [
      "Hover, tooltip, cursor-shape, enabled-state, and visual-delta witnesses are not evaluated in ADMCP-014."
    ]
  };
}

function unsupportedActionResult(actionName: string): DesktopProviderActionResult {
  return {
    executed: false,
    simulated: false,
    residue: [
      `${actionName} is not supported by the Windows real-observation provider.`,
      "No real desktop mutation occurred."
    ]
  };
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) {
    return timestamp;
  }

  return new Date(parsed + milliseconds).toISOString();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const activeWindowPreamble = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class AdmcpWin32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetCursorInfo(ref CURSORINFO pci);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetIconInfo(IntPtr hIcon, out ICONINFO piconinfo);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool DrawIconEx(
    IntPtr hdc,
    int xLeft,
    int yTop,
    IntPtr hIcon,
    int cxWidth,
    int cyWidth,
    int istepIfAniCur,
    IntPtr hbrFlickerFreeDraw,
    int diFlags
  );

  [DllImport("gdi32.dll", SetLastError=true)]
  public static extern bool DeleteObject(IntPtr hObject);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct CURSORINFO {
    public int cbSize;
    public int flags;
    public IntPtr hCursor;
    public POINT ptScreenPos;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct ICONINFO {
    public bool fIcon;
    public int xHotspot;
    public int yHotspot;
    public IntPtr hbmMask;
    public IntPtr hbmColor;
  }
}
"@

function Add-AdmcpTimingEntry {
  param(
    [Parameter(Mandatory = $true)] $Timing,
    [Parameter(Mandatory = $true)] [string] $Operation,
    [Parameter(Mandatory = $true)] [long] $DurationMs,
    [string] $Status = "completed",
    [string[]] $Residue = @()
  )

  $Timing.Add([pscustomobject]@{
    operation = $Operation
    durationMs = [Math]::Max(0, $DurationMs)
    status = $Status
    residue = @($Residue)
  })
}

function Get-AdmcpActiveWindow {
  $handle = [AdmcpWin32]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) {
    throw "No active foreground window is available."
  }

  $titleBuilder = New-Object System.Text.StringBuilder 4096
  [void][AdmcpWin32]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)
  [uint32]$processId = 0
  [void][AdmcpWin32]::GetWindowThreadProcessId($handle, [ref]$processId)
  $process = Get-Process -Id $processId -ErrorAction Stop
  $rect = New-Object AdmcpWin32+RECT
  if (-not [AdmcpWin32]::GetWindowRect($handle, [ref]$rect)) {
    throw "Could not read active-window bounds."
  }

  $width = [Math]::Max(1, $rect.Right - $rect.Left)
  $height = [Math]::Max(1, $rect.Bottom - $rect.Top)

  [pscustomobject]@{
    windowId = ("hwnd:0x{0:X}" -f $handle.ToInt64())
    title = $titleBuilder.ToString()
    processName = $process.ProcessName
    appName = $process.MainWindowTitle
    bounds = [pscustomobject]@{
      left = $rect.Left
      top = $rect.Top
      width = $width
      height = $height
    }
  }
}

function Get-AdmcpCursorPosition {
  $point = New-Object AdmcpWin32+POINT
  if (-not [AdmcpWin32]::GetCursorPos([ref]$point)) {
    throw "Could not read cursor position."
  }

  [pscustomobject]@{
    x = $point.X
    y = $point.Y
  }
}

function Invoke-AdmcpMouseClick {
  param(
    [Parameter(Mandatory = $true)] [int] $X,
    [Parameter(Mandatory = $true)] [int] $Y,
    [Parameter(Mandatory = $true)] [string] $Button
  )

  if (-not [AdmcpWin32]::SetCursorPos($X, $Y)) {
    throw "Could not move cursor position before click."
  }

  $downFlag = 0
  $upFlag = 0

  switch ($Button) {
    "left" {
      $downFlag = 0x0002
      $upFlag = 0x0004
    }
    "right" {
      $downFlag = 0x0008
      $upFlag = 0x0010
    }
    "middle" {
      $downFlag = 0x0020
      $upFlag = 0x0040
    }
    default {
      throw ("Unsupported click button: {0}" -f $Button)
    }
  }

  [AdmcpWin32]::mouse_event([uint32]$downFlag, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [AdmcpWin32]::mouse_event([uint32]$upFlag, 0, 0, 0, [UIntPtr]::Zero)

  Get-AdmcpCursorPosition
}

function ConvertTo-AdmcpSendKeysLiteral {
  param(
    [Parameter(Mandatory = $true)] [string] $Text
  )

  $builder = New-Object System.Text.StringBuilder

  foreach ($char in $Text.ToCharArray()) {
    $value = [string]$char
    $code = [int][char]$char

    if ($code -eq 13) {
      continue
    }

    if ($code -eq 10) {
      [void]$builder.Append("{ENTER}")
      continue
    }

    if ($code -eq 9) {
      [void]$builder.Append("{TAB}")
      continue
    }

    switch ($value) {
      "+" { [void]$builder.Append("{+}") }
      "^" { [void]$builder.Append("{^}") }
      "%" { [void]$builder.Append("{%}") }
      "~" { [void]$builder.Append("{~}") }
      "(" { [void]$builder.Append("{(}") }
      ")" { [void]$builder.Append("{)}") }
      "{" { [void]$builder.Append("{{}") }
      "}" { [void]$builder.Append("{}}") }
      "[" { [void]$builder.Append("{[}") }
      "]" { [void]$builder.Append("{]}") }
      default { [void]$builder.Append($value) }
    }
  }

  $builder.ToString()
}

function Invoke-AdmcpTypeText {
  param(
    [Parameter(Mandatory = $true)] [string] $Text
  )

  if ([string]::IsNullOrEmpty($Text)) {
    throw "Typing requires non-empty generated test text."
  }

  $keys = ConvertTo-AdmcpSendKeysLiteral -Text $Text
  [System.Windows.Forms.SendKeys]::SendWait($keys)
  Start-Sleep -Milliseconds 40

  [pscustomobject]@{
    typedTextLength = $Text.Length
  }
}

function Get-AdmcpCatalogShortcutNames {
  param(
    [Parameter(Mandatory = $true)] $Application
  )

  $seen = New-Object 'System.Collections.Generic.HashSet[string]' -ArgumentList ([System.StringComparer]::OrdinalIgnoreCase)
  $names = New-Object 'System.Collections.Generic.List[string]'
  $candidateValues = @(
    $Application.displayName,
    $Application.id
  )

  foreach ($name in @($Application.aliases)) {
    $candidateValues += $name
  }

  foreach ($name in @($Application.windowsShortcutNames)) {
    $candidateValues += $name
  }

  foreach ($candidate in $candidateValues) {
    $value = ([string]$candidate).Trim()

    if ($value.Length -gt 0 -and $seen.Add($value)) {
      $names.Add($value)
    }
  }

  return @($names)
}

function Get-AdmcpApplicationShortcutRoots {
  $roots = New-Object 'System.Collections.Generic.List[string]'
  $candidateRoots = @(
    [System.IO.Path]::Combine([Environment]::GetFolderPath("StartMenu"), "Programs"),
    [System.IO.Path]::Combine([Environment]::GetFolderPath("CommonStartMenu"), "Programs"),
    [Environment]::GetFolderPath("DesktopDirectory"),
    [Environment]::GetFolderPath("CommonDesktopDirectory")
  )

  foreach ($root in $candidateRoots) {
    if (-not [string]::IsNullOrWhiteSpace($root) -and (Test-Path -LiteralPath $root)) {
      $roots.Add($root)
    }
  }

  return @($roots)
}

function Invoke-AdmcpOpenCatalogApplication {
  param(
    [Parameter(Mandatory = $true)] $Application
  )

  $applicationId = [string]$Application.id
  $displayName = [string]$Application.displayName
  $shortcutNames = Get-AdmcpCatalogShortcutNames -Application $Application

  if ($shortcutNames.Count -eq 0) {
    throw ("Catalog application {0} has no shortcut names to resolve." -f $applicationId)
  }

  $allowedNames = New-Object 'System.Collections.Generic.HashSet[string]' -ArgumentList ([System.StringComparer]::OrdinalIgnoreCase)

  foreach ($shortcutName in $shortcutNames) {
    [void]$allowedNames.Add([string]$shortcutName)
  }

  $matches = New-Object 'System.Collections.Generic.List[object]'

  foreach ($root in (Get-AdmcpApplicationShortcutRoots)) {
    foreach ($shortcut in (Get-ChildItem -LiteralPath $root -Filter "*.lnk" -File -Recurse -ErrorAction SilentlyContinue)) {
      if ($allowedNames.Contains($shortcut.BaseName)) {
        $matches.Add($shortcut)
      }
    }
  }

  if ($matches.Count -eq 0) {
    throw ("No Windows shortcut matched catalog application {0}. Allowed shortcut names: {1}" -f $applicationId, ($shortcutNames -join ", "))
  }

  $match = @($matches | Sort-Object FullName)[0]
  Start-Process -FilePath $match.FullName

  $residue = @(
    "Launched catalog application through a Windows shortcut resolved from the allowlist.",
    ("Matched shortcut name: {0}." -f $match.BaseName),
    "No executable path, command-line argument, shell command, or arbitrary launch string was accepted from the agent."
  )

  if ($matches.Count -gt 1) {
    $residue += ("Multiple matching shortcuts were found; launched the first deterministic path for {0}." -f $match.BaseName)
  }

  [pscustomobject]@{
    executed = $true
    simulated = $false
    applicationId = $applicationId
    displayName = $displayName
    residue = $residue
  }
}

function Add-AdmcpCursorOverlay {
  param(
    [Parameter(Mandatory = $true)] $Graphics,
    [Parameter(Mandatory = $true)] $Window,
    [Parameter(Mandatory = $false)] $Timing
  )

  $residue = New-Object System.Collections.Generic.List[string]
  $cursorInfo = New-Object AdmcpWin32+CURSORINFO
  $cursorInfo.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($cursorInfo)

  $cursorMetadataWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $cursorInfoSucceeded = [AdmcpWin32]::GetCursorInfo([ref]$cursorInfo)
  $cursorMetadataWatch.Stop()
  if ($Timing -ne $null) {
    if ($cursorInfoSucceeded) {
      Add-AdmcpTimingEntry -Timing $Timing -Operation "cursor_metadata_lookup" -DurationMs $cursorMetadataWatch.ElapsedMilliseconds
    } else {
      Add-AdmcpTimingEntry -Timing $Timing -Operation "cursor_metadata_lookup" -DurationMs $cursorMetadataWatch.ElapsedMilliseconds -Status "failed" -Residue @("GetCursorInfo failed.")
    }
  }

  if (-not $cursorInfoSucceeded) {
    $residue.Add("GetCursorInfo failed; frame remains raw without a rendered cursor.")
    return [pscustomobject]@{
      visible = $false
      renderedIntoFrame = $false
      residue = @($residue)
    }
  }

  $cursorVisible = (($cursorInfo.flags -band 0x00000001) -ne 0)
  $screenPosition = [pscustomobject]@{
    x = $cursorInfo.ptScreenPos.X
    y = $cursorInfo.ptScreenPos.Y
  }
  $localX = $cursorInfo.ptScreenPos.X - $Window.bounds.left
  $localY = $cursorInfo.ptScreenPos.Y - $Window.bounds.top
  $framePosition = [pscustomobject]@{
    x = $localX
    y = $localY
  }
  $hotspot = $null
  $renderingMethod = "win32:GetCursorInfo+GetIconInfo+DrawIconEx+HighContrastWitnessMarker"
  $renderedIntoFrame = $false
  $nativeCursorRenderedIntoFrame = $false
  $witnessMarkerRenderedIntoFrame = $false

  if (-not $cursorVisible) {
    $residue.Add("Cursor is not visible according to GetCursorInfo; frame remains raw.")
    return [pscustomobject]@{
      visible = $cursorVisible
      screenPosition = $screenPosition
      framePosition = $framePosition
      renderedIntoFrame = $renderedIntoFrame
      nativeCursorRenderedIntoFrame = $nativeCursorRenderedIntoFrame
      witnessMarkerRenderedIntoFrame = $witnessMarkerRenderedIntoFrame
      renderingMethod = $renderingMethod
      residue = @($residue)
    }
  }

  if (
    $localX -lt 0 -or
    $localY -lt 0 -or
    $localX -ge $Window.bounds.width -or
    $localY -ge $Window.bounds.height
  ) {
    $residue.Add("Cursor screen position is outside the captured active-window frame; frame remains raw.")
    return [pscustomobject]@{
      visible = $cursorVisible
      screenPosition = $screenPosition
      framePosition = $framePosition
      renderedIntoFrame = $renderedIntoFrame
      nativeCursorRenderedIntoFrame = $nativeCursorRenderedIntoFrame
      witnessMarkerRenderedIntoFrame = $witnessMarkerRenderedIntoFrame
      renderingMethod = $renderingMethod
      residue = @($residue)
    }
  }

  if ($cursorInfo.hCursor -eq [IntPtr]::Zero) {
    $residue.Add("GetCursorInfo returned no cursor handle; frame remains raw.")
    return [pscustomobject]@{
      visible = $cursorVisible
      screenPosition = $screenPosition
      framePosition = $framePosition
      renderedIntoFrame = $renderedIntoFrame
      nativeCursorRenderedIntoFrame = $nativeCursorRenderedIntoFrame
      witnessMarkerRenderedIntoFrame = $witnessMarkerRenderedIntoFrame
      renderingMethod = $renderingMethod
      residue = @($residue)
    }
  }

  $iconInfo = New-Object AdmcpWin32+ICONINFO
  $iconInfoWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $iconInfoSucceeded = [AdmcpWin32]::GetIconInfo($cursorInfo.hCursor, [ref]$iconInfo)
  $iconInfoWatch.Stop()
  if ($Timing -ne $null) {
    if ($iconInfoSucceeded) {
      Add-AdmcpTimingEntry -Timing $Timing -Operation "cursor_icon_info_lookup" -DurationMs $iconInfoWatch.ElapsedMilliseconds
    } else {
      Add-AdmcpTimingEntry -Timing $Timing -Operation "cursor_icon_info_lookup" -DurationMs $iconInfoWatch.ElapsedMilliseconds -Status "failed" -Residue @("GetIconInfo failed.")
    }
  }

  if (-not $iconInfoSucceeded) {
    $residue.Add("GetIconInfo failed; frame remains raw without a rendered cursor.")
    return [pscustomobject]@{
      visible = $cursorVisible
      screenPosition = $screenPosition
      framePosition = $framePosition
      renderedIntoFrame = $renderedIntoFrame
      nativeCursorRenderedIntoFrame = $nativeCursorRenderedIntoFrame
      witnessMarkerRenderedIntoFrame = $witnessMarkerRenderedIntoFrame
      renderingMethod = $renderingMethod
      residue = @($residue)
    }
  }

  try {
    $hotspot = [pscustomobject]@{
      x = $iconInfo.xHotspot
      y = $iconInfo.yHotspot
    }
    $drawX = [int]($localX - $iconInfo.xHotspot)
    $drawY = [int]($localY - $iconInfo.yHotspot)
    $hdc = $Graphics.GetHdc()

    try {
      $nativeRenderWatch = [System.Diagnostics.Stopwatch]::StartNew()
      $nativeCursorRenderedIntoFrame = [AdmcpWin32]::DrawIconEx($hdc, $drawX, $drawY, $cursorInfo.hCursor, 0, 0, 0, [IntPtr]::Zero, 0x0003)
      $nativeRenderWatch.Stop()
      if ($Timing -ne $null) {
        if ($nativeCursorRenderedIntoFrame) {
          Add-AdmcpTimingEntry -Timing $Timing -Operation "native_cursor_render" -DurationMs $nativeRenderWatch.ElapsedMilliseconds
        } else {
          Add-AdmcpTimingEntry -Timing $Timing -Operation "native_cursor_render" -DurationMs $nativeRenderWatch.ElapsedMilliseconds -Status "failed" -Residue @("DrawIconEx returned false.")
        }
      }
    } finally {
      $Graphics.ReleaseHdc($hdc)
    }

    if ($nativeCursorRenderedIntoFrame) {
      $residue.Add("Native visible cursor was rendered into the active-window frame.")
    } else {
      $residue.Add("Native DrawIconEx cursor rendering failed; high-contrast marker may still provide cursor witness evidence.")
    }

    $outerPen = $null
    $innerPen = $null
    $markerWatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $radius = 11
      $outerPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::Black), 4
      $innerPen = New-Object System.Drawing.Pen -ArgumentList ([System.Drawing.Color]::FromArgb(255, 255, 0, 255)), 2
      $Graphics.DrawEllipse($outerPen, [int]($localX - $radius), [int]($localY - $radius), [int]($radius * 2), [int]($radius * 2))
      $Graphics.DrawEllipse($innerPen, [int]($localX - $radius), [int]($localY - $radius), [int]($radius * 2), [int]($radius * 2))
      $Graphics.DrawLine($outerPen, [int]($localX - 16), [int]$localY, [int]($localX - 5), [int]$localY)
      $Graphics.DrawLine($outerPen, [int]($localX + 5), [int]$localY, [int]($localX + 16), [int]$localY)
      $Graphics.DrawLine($outerPen, [int]$localX, [int]($localY - 16), [int]$localX, [int]($localY - 5))
      $Graphics.DrawLine($outerPen, [int]$localX, [int]($localY + 5), [int]$localX, [int]($localY + 16))
      $Graphics.DrawLine($innerPen, [int]($localX - 16), [int]$localY, [int]($localX - 5), [int]$localY)
      $Graphics.DrawLine($innerPen, [int]($localX + 5), [int]$localY, [int]($localX + 16), [int]$localY)
      $Graphics.DrawLine($innerPen, [int]$localX, [int]($localY - 16), [int]$localX, [int]($localY - 5))
      $Graphics.DrawLine($innerPen, [int]$localX, [int]($localY + 5), [int]$localX, [int]($localY + 16))
      $witnessMarkerRenderedIntoFrame = $true
      $residue.Add("High-contrast cursor witness marker was rendered around the cursor hotspot.")
      $markerWatch.Stop()
      if ($Timing -ne $null) {
        Add-AdmcpTimingEntry -Timing $Timing -Operation "high_contrast_witness_marker_render" -DurationMs $markerWatch.ElapsedMilliseconds
      }
    } catch {
      $markerWatch.Stop()
      if ($Timing -ne $null) {
        Add-AdmcpTimingEntry -Timing $Timing -Operation "high_contrast_witness_marker_render" -DurationMs $markerWatch.ElapsedMilliseconds -Status "failed" -Residue @($_.Exception.Message)
      }
      $residue.Add(("High-contrast cursor witness marker failed: {0}" -f $_.Exception.Message))
    } finally {
      if ($outerPen -ne $null) {
        $outerPen.Dispose()
      }
      if ($innerPen -ne $null) {
        $innerPen.Dispose()
      }
    }

    $renderedIntoFrame = $nativeCursorRenderedIntoFrame -or $witnessMarkerRenderedIntoFrame
  } finally {
    if ($iconInfo.hbmMask -ne [IntPtr]::Zero) {
      [void][AdmcpWin32]::DeleteObject($iconInfo.hbmMask)
    }
    if ($iconInfo.hbmColor -ne [IntPtr]::Zero) {
      [void][AdmcpWin32]::DeleteObject($iconInfo.hbmColor)
    }
  }

  [pscustomobject]@{
    visible = $cursorVisible
    screenPosition = $screenPosition
    framePosition = $framePosition
    hotspot = $hotspot
    renderedIntoFrame = $renderedIntoFrame
    nativeCursorRenderedIntoFrame = $nativeCursorRenderedIntoFrame
    witnessMarkerRenderedIntoFrame = $witnessMarkerRenderedIntoFrame
    renderingMethod = $renderingMethod
    residue = @($residue)
  }
}
`;

const activeWindowMetadataScript = String.raw`
${activeWindowPreamble}
$window = Get-AdmcpActiveWindow
$window | ConvertTo-Json -Compress -Depth 6
`;

const cursorPositionScript = String.raw`
${activeWindowPreamble}
Get-AdmcpCursorPosition | ConvertTo-Json -Compress -Depth 6
`;

const activeWindowCaptureScript = String.raw`
${activeWindowPreamble}
$timing = New-Object System.Collections.Generic.List[object]
$stage = [System.Diagnostics.Stopwatch]::StartNew()
$window = Get-AdmcpActiveWindow
$stage.Stop()
Add-AdmcpTimingEntry -Timing $timing -Operation "active_window_metadata_lookup" -DurationMs $stage.ElapsedMilliseconds
$stage = [System.Diagnostics.Stopwatch]::StartNew()
$bitmap = New-Object System.Drawing.Bitmap $window.bounds.width, $window.bounds.height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$stream = New-Object System.IO.MemoryStream
$stage.Stop()
Add-AdmcpTimingEntry -Timing $timing -Operation "bitmap_and_graphics_setup" -DurationMs $stage.ElapsedMilliseconds
try {
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $graphics.CopyFromScreen($window.bounds.left, $window.bounds.top, 0, 0, $bitmap.Size)
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "screen_capture" -DurationMs $stage.ElapsedMilliseconds
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $cursor = Add-AdmcpCursorOverlay -Graphics $graphics -Window $window -Timing $timing
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "cursor_overlay_total" -DurationMs $stage.ElapsedMilliseconds
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "png_encode" -DurationMs $stage.ElapsedMilliseconds
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $bytes = $stream.ToArray()
  $dataBase64 = [Convert]::ToBase64String($bytes)
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "base64_payload_construction" -DurationMs $stage.ElapsedMilliseconds
  $timingEntries = @()
  foreach ($timingEntry in $timing) {
    $timingEntries += $timingEntry
  }
  $timingObject = New-Object PSObject -Property @{
    entries = $timingEntries
    residue = @("PowerShell capture substage timings are diagnostic only.")
  }
  $window | Add-Member -NotePropertyName cursor -NotePropertyValue $cursor
  $window | Add-Member -NotePropertyName dataBase64 -NotePropertyValue $dataBase64
  $window | Add-Member -NotePropertyName timing -NotePropertyValue $timingObject
  $window | ConvertTo-Json -Compress -Depth 6
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
  $stream.Dispose()
}
`;

function moveMouseScript(point: DesktopPoint): string {
  const x = Math.round(point.x);
  const y = Math.round(point.y);

  return String.raw`
${activeWindowPreamble}
if (-not [AdmcpWin32]::SetCursorPos(${x}, ${y})) {
  throw "Could not move cursor position."
}
Get-AdmcpCursorPosition | ConvertTo-Json -Compress -Depth 6
`;
}

function clickMouseScript(
  point: DesktopPoint,
  button: "left" | "middle" | "right"
): string {
  const x = Math.round(point.x);
  const y = Math.round(point.y);

  return String.raw`
${activeWindowPreamble}
Invoke-AdmcpMouseClick -X ${x} -Y ${y} -Button "${button}" | ConvertTo-Json -Compress -Depth 6
`;
}

function typeTextScript(text: string): string {
  const textBase64 = Buffer.from(text, "utf8").toString("base64");

  return String.raw`
${activeWindowPreamble}
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${textBase64}"))
Invoke-AdmcpTypeText -Text $text | ConvertTo-Json -Compress -Depth 6
`;
}

function openApplicationScript(request: DesktopApplicationLaunchRequest): string {
  const applicationBase64 = Buffer.from(
    JSON.stringify(request.application),
    "utf8"
  ).toString("base64");

  return String.raw`
${activeWindowPreamble}
$applicationJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${applicationBase64}"))
$application = $applicationJson | ConvertFrom-Json
Invoke-AdmcpOpenCatalogApplication -Application $application | ConvertTo-Json -Compress -Depth 6
`;
}

const persistentWindowsObservationHelperScript = String.raw`
${activeWindowPreamble}

function Get-AdmcpActiveWindowCapturePng {
  $timing = New-Object System.Collections.Generic.List[object]
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $window = Get-AdmcpActiveWindow
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "active_window_metadata_lookup" -DurationMs $stage.ElapsedMilliseconds
  $stage = [System.Diagnostics.Stopwatch]::StartNew()
  $bitmap = New-Object System.Drawing.Bitmap $window.bounds.width, $window.bounds.height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $stream = New-Object System.IO.MemoryStream
  $stage.Stop()
  Add-AdmcpTimingEntry -Timing $timing -Operation "bitmap_and_graphics_setup" -DurationMs $stage.ElapsedMilliseconds
  try {
    $stage = [System.Diagnostics.Stopwatch]::StartNew()
    $graphics.CopyFromScreen($window.bounds.left, $window.bounds.top, 0, 0, $bitmap.Size)
    $stage.Stop()
    Add-AdmcpTimingEntry -Timing $timing -Operation "screen_capture" -DurationMs $stage.ElapsedMilliseconds
    $stage = [System.Diagnostics.Stopwatch]::StartNew()
    $cursor = Add-AdmcpCursorOverlay -Graphics $graphics -Window $window -Timing $timing
    $stage.Stop()
    Add-AdmcpTimingEntry -Timing $timing -Operation "cursor_overlay_total" -DurationMs $stage.ElapsedMilliseconds
    $stage = [System.Diagnostics.Stopwatch]::StartNew()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $stage.Stop()
    Add-AdmcpTimingEntry -Timing $timing -Operation "png_encode" -DurationMs $stage.ElapsedMilliseconds
    $stage = [System.Diagnostics.Stopwatch]::StartNew()
    $bytes = $stream.ToArray()
    $dataBase64 = [Convert]::ToBase64String($bytes)
    $stage.Stop()
    Add-AdmcpTimingEntry -Timing $timing -Operation "base64_payload_construction" -DurationMs $stage.ElapsedMilliseconds
    $timingEntries = @()
    foreach ($timingEntry in $timing) {
      $timingEntries += $timingEntry
    }
    $timingObject = New-Object PSObject -Property @{
      entries = $timingEntries
      residue = @("PowerShell capture substage timings are diagnostic only.")
    }
    $window | Add-Member -NotePropertyName cursor -NotePropertyValue $cursor
    $window | Add-Member -NotePropertyName dataBase64 -NotePropertyValue $dataBase64
    $window | Add-Member -NotePropertyName timing -NotePropertyValue $timingObject

    return $window
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $stream.Dispose()
  }
}

function Write-AdmcpHelperResponse {
  param(
    [Parameter(Mandatory = $true)] [string] $Id,
    [Parameter(Mandatory = $true)] [bool] $Ok,
    $Result = $null,
    $ErrorPayload = $null
  )

  $response = [pscustomobject]@{
    id = $Id
    ok = $Ok
    result = $Result
    error = $ErrorPayload
  }
  $json = $response | ConvertTo-Json -Compress -Depth 20
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

$shouldStop = $false

while (-not $shouldStop) {
  $line = [Console]::In.ReadLine()

  if ($line -eq $null) {
    break
  }

  if ($line.Trim().Length -eq 0) {
    continue
  }

  $request = $null

  try {
    $request = $line | ConvertFrom-Json
    $id = [string]$request.id

    if ([string]::IsNullOrWhiteSpace($id)) {
      throw "Helper request is missing an id."
    }

    switch ([string]$request.command) {
      "get_active_window" {
        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Get-AdmcpActiveWindow)
      }
      "get_cursor_position" {
        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Get-AdmcpCursorPosition)
      }
      "capture_active_window_png" {
        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Get-AdmcpActiveWindowCapturePng)
      }
      "move_mouse" {
        $x = [int][Math]::Round([double]$request.point.x)
        $y = [int][Math]::Round([double]$request.point.y)

        if (-not [AdmcpWin32]::SetCursorPos($x, $y)) {
          throw "Could not move cursor position."
        }

        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Get-AdmcpCursorPosition)
      }
      "click_mouse" {
        $x = [int][Math]::Round([double]$request.point.x)
        $y = [int][Math]::Round([double]$request.point.y)
        $button = [string]$request.button

        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Invoke-AdmcpMouseClick -X $x -Y $y -Button $button)
      }
      "type_text" {
        $text = [string]$request.text

        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Invoke-AdmcpTypeText -Text $text)
      }
      "open_application" {
        Write-AdmcpHelperResponse -Id $id -Ok $true -Result (Invoke-AdmcpOpenCatalogApplication -Application $request.application)
      }
      "shutdown" {
        Write-AdmcpHelperResponse -Id $id -Ok $true -Result ([pscustomobject]@{
          status = "shutdown"
        })
        $shouldStop = $true
      }
      default {
        throw ("Unknown helper command: {0}" -f [string]$request.command)
      }
    }
  } catch {
    $id = "unknown"

    if ($request -ne $null -and -not [string]::IsNullOrWhiteSpace([string]$request.id)) {
      $id = [string]$request.id
    }

    Write-AdmcpHelperResponse -Id $id -Ok $false -ErrorPayload ([pscustomobject]@{
      message = $_.Exception.Message
    })
  }
}
`;
