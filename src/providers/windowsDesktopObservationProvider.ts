import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type {
  DesktopFrameArtifact,
  DesktopInteractionScope,
  DesktopPoint,
  DesktopRectangle,
  DesktopWindowMetadata
} from "../policy/sessionLicensePolicy.js";
import {
  DesktopProviderError,
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

export interface WindowsCapturedFrame extends WindowsActiveWindowSnapshot {
  dataBase64: string;
}

export interface WindowsObservationBackend {
  getActiveWindow(): Promise<WindowsActiveWindowSnapshot>;
  getCursorPosition(): Promise<DesktopPoint>;
  captureActiveWindowPng(): Promise<WindowsCapturedFrame>;
  moveMouseTo(point: DesktopPoint): Promise<DesktopPoint>;
}

export interface WindowsDesktopObservationProviderOptions {
  backend?: WindowsObservationBackend;
  platform?: NodeJS.Platform;
  enableRealMouseMovement?: boolean;
  maxFramesPerObservation?: number;
  maxObservationDurationMs?: number;
  frameDelay?: (milliseconds: number) => Promise<void>;
}

export class WindowsDesktopObservationProvider implements DesktopInteractionProvider {
  private readonly backend: WindowsObservationBackend;
  private readonly platform: NodeJS.Platform;
  private readonly enableRealMouseMovement: boolean;
  private readonly maxFramesPerObservation: number;
  private readonly maxObservationDurationMs: number;
  private readonly frameDelay: (milliseconds: number) => Promise<void>;

  constructor(options: WindowsDesktopObservationProviderOptions = {}) {
    this.backend = options.backend ?? new PowerShellWindowsObservationBackend();
    this.platform = options.platform ?? process.platform;
    this.enableRealMouseMovement = options.enableRealMouseMovement ?? false;
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
      supportsClick: false,
      supportsTyping: false,
      realDesktopCapture: true,
      realDesktopMouseMovement: this.enableRealMouseMovement,
      realDesktopMutation: false,
      maxFramesPerObservation: this.maxFramesPerObservation,
      maxObservationDurationMs: this.maxObservationDurationMs,
      residue: [
        "Provider captures bounded visible active-window frames only when explicitly selected.",
        this.enableRealMouseMovement
          ? "Provider may move the real mouse pointer as an opt-in active-window-scoped probe."
          : "Provider does not move the real mouse pointer unless the explicit movement gate is enabled.",
        "Provider does not click, type, launch apps, or make durable desktop changes.",
        "Provider performs no OCR, localization, hidden polling, or background capture."
      ]
    };
  }

  async observe(request: DesktopObserveRequest): Promise<DesktopObserveResult> {
    this.ensureAvailable();

    const activeWindow = await this.safeGetActiveWindow();
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);

    const frameCount = request.mode === "single_frame"
      ? 1
      : Math.min(request.maxFrames, this.maxFramesPerObservation);
    const durationMs = Math.min(request.durationMs, this.maxObservationDurationMs);
    const frameSpacingMs = frameCount <= 1 ? 0 : Math.floor(durationMs / (frameCount - 1));
    const frames: DesktopFrameArtifact[] = [];
    let latestActiveWindow = activeWindow;

    for (let index = 0; index < frameCount; index += 1) {
      if (index > 0 && frameSpacingMs > 0) {
        await this.frameDelay(frameSpacingMs);
      }

      const captured = await this.safeCaptureActiveWindow();
      this.assertTargetScopeMatchesActiveWindow(request.targetScope, captured);
      latestActiveWindow = captured;
      const bytes = Buffer.from(captured.dataBase64, "base64");
      const elapsedMs = index * frameSpacingMs;

      frames.push({
        index,
        capturedAt: addMilliseconds(request.observedAt, elapsedMs),
        elapsedMs,
        mimeType: "image/png",
        width: captured.bounds?.width ?? 1,
        height: captured.bounds?.height ?? 1,
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...(request.includeImages ? { dataBase64: captured.dataBase64 } : {})
      });
    }

    return {
      targetScope: request.targetScope,
      observedAt: request.observedAt,
      activeWindow: toWindowMetadata(latestActiveWindow),
      cursorPosition: await this.safeGetLocalCursorPosition(latestActiveWindow),
      frames,
      lastActionDeltaSummary:
        "Real active-window observation captured bounded frame evidence; no OCR or localization was performed.",
      residue: [
        "Real visible active-window capture occurred inside the bounded provider call.",
        `Observation was bounded to ${frames.length} frame(s) over ${durationMs} ms.`,
        "Cursor position is reported in active-window frame coordinates when available.",
        "No mouse movement, click, typing, OCR, localization, hidden polling, or background capture occurred."
      ]
    };
  }

  async moveMouse(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
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

    const activeWindow = await this.safeGetActiveWindow();
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, activeWindow);
    const screenPoint = pointToActiveWindowScreenPoint(request.point, activeWindow);
    const movedCursor = await this.safeMoveMouseTo(screenPoint);
    const postMoveActiveWindow = await this.safeGetActiveWindow();
    this.assertTargetScopeMatchesActiveWindow(request.targetScope, postMoveActiveWindow);

    return {
      executed: true,
      simulated: false,
      cursorPosition: cursorToActiveWindowPoint(movedCursor, postMoveActiveWindow),
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

  async click(_request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    return unsupportedActionResult("click");
  }

  async typeText(_request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    return unsupportedActionResult("type_text");
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

  private async safeGetLocalCursorPosition(
    activeWindow: WindowsActiveWindowSnapshot
  ): Promise<DesktopPoint> {
    try {
      return cursorToActiveWindowPoint(await this.backend.getCursorPosition(), activeWindow);
    } catch (error: unknown) {
      throw providerCaptureError(error, "Failed to read cursor position.");
    }
  }

  private async safeMoveMouseTo(point: DesktopPoint): Promise<DesktopPoint> {
    try {
      return await this.backend.moveMouseTo(point);
    } catch (error: unknown) {
      throw providerCaptureError(error, "Failed to move the mouse pointer.");
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

function pointToActiveWindowScreenPoint(
  point: DesktopPoint,
  activeWindow: WindowsActiveWindowSnapshot
): DesktopPoint {
  const bounds = activeWindow.bounds;

  if (bounds === undefined) {
    throw new DesktopProviderError(
      "invalid_action_target",
      "Active-window bounds are required before moving the mouse pointer.",
      ["No real cursor movement occurred."]
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
        "No real cursor movement occurred.",
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
}
"@

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
$window = Get-AdmcpActiveWindow
$bitmap = New-Object System.Drawing.Bitmap $window.bounds.width, $window.bounds.height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$stream = New-Object System.IO.MemoryStream
try {
  $graphics.CopyFromScreen($window.bounds.left, $window.bounds.top, 0, 0, $bitmap.Size)
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $window | Add-Member -NotePropertyName dataBase64 -NotePropertyValue ([Convert]::ToBase64String($bytes))
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
