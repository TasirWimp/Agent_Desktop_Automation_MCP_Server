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
  captureActiveWindowPng(): Promise<WindowsCapturedFrame>;
}

export interface WindowsDesktopObservationProviderOptions {
  backend?: WindowsObservationBackend;
  platform?: NodeJS.Platform;
  maxFramesPerObservation?: number;
  maxObservationDurationMs?: number;
  frameDelay?: (milliseconds: number) => Promise<void>;
}

export class WindowsDesktopObservationProvider implements DesktopInteractionProvider {
  private readonly backend: WindowsObservationBackend;
  private readonly platform: NodeJS.Platform;
  private readonly maxFramesPerObservation: number;
  private readonly maxObservationDurationMs: number;
  private readonly frameDelay: (milliseconds: number) => Promise<void>;

  constructor(options: WindowsDesktopObservationProviderOptions = {}) {
    this.backend = options.backend ?? new PowerShellWindowsObservationBackend();
    this.platform = options.platform ?? process.platform;
    this.maxFramesPerObservation = options.maxFramesPerObservation ?? 6;
    this.maxObservationDurationMs = options.maxObservationDurationMs ?? 2_000;
    this.frameDelay = options.frameDelay ?? delay;
  }

  getCapabilities(): DesktopProviderCapabilities {
    return {
      providerName: "windows_active_window_observation_provider",
      providerKind: "real",
      supportsObservation: true,
      supportsMouse: false,
      supportsClick: false,
      supportsTyping: false,
      realDesktopCapture: true,
      realDesktopMutation: false,
      maxFramesPerObservation: this.maxFramesPerObservation,
      maxObservationDurationMs: this.maxObservationDurationMs,
      residue: [
        "Provider captures bounded visible active-window frames only when explicitly selected.",
        "Provider does not move the mouse, click, type, launch apps, or mutate OS state.",
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
      frames,
      lastActionDeltaSummary:
        "Real active-window observation captured bounded frame evidence; no OCR or localization was performed.",
      residue: [
        "Real visible active-window capture occurred inside the bounded provider call.",
        `Observation was bounded to ${frames.length} frame(s) over ${durationMs} ms.`,
        "No mouse movement, click, typing, OCR, localization, hidden polling, or background capture occurred."
      ]
    };
  }

  async moveMouse(_request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult> {
    return unsupportedActionResult("move_mouse");
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

  async captureActiveWindowPng(): Promise<WindowsCapturedFrame> {
    return runPowerShellJson<WindowsCapturedFrame>(activeWindowCaptureScript);
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
    ["No desktop frame was recorded for the session."]
  );
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

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
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
`;

const activeWindowMetadataScript = String.raw`
${activeWindowPreamble}
$window = Get-AdmcpActiveWindow
$window | ConvertTo-Json -Compress -Depth 6
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
