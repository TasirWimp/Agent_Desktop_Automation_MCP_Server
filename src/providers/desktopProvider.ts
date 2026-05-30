import type {
  DesktopCursorWitness,
  DesktopFrameArtifact,
  DesktopHoverWitness,
  DesktopInteractionScope,
  DesktopPoint,
  DesktopProviderTimingDiagnostics,
  DesktopWindowMetadata
} from "../policy/sessionLicensePolicy.js";

export const desktopObservationModes = ["frame_session", "single_frame"] as const;

export type DesktopObservationMode = (typeof desktopObservationModes)[number];

export const desktopFrameFormats = ["image/png", "image/jpeg"] as const;

export type DesktopFrameFormat = (typeof desktopFrameFormats)[number];

export interface DesktopProviderCapabilities {
  providerName: string;
  providerKind: "mock" | "real";
  supportsObservation: boolean;
  supportsMouse: boolean;
  supportsClick: boolean;
  supportsTyping: boolean;
  realDesktopCapture: boolean;
  realDesktopMouseMovement: boolean;
  realDesktopMutation: boolean;
  maxFramesPerObservation: number;
  maxObservationDurationMs: number;
  residue: string[];
}

export type DesktopProviderErrorCode =
  | "real_observation_unavailable"
  | "real_control_disabled"
  | "permission_denied"
  | "scope_mismatch"
  | "invalid_action_target"
  | "capture_failed";

export class DesktopProviderError extends Error {
  constructor(
    public readonly code: DesktopProviderErrorCode,
    message: string,
    public readonly residue: string[] = []
  ) {
    super(message);
    this.name = "DesktopProviderError";
  }
}

export interface DesktopObserveRequest {
  sessionId: string;
  targetScope: DesktopInteractionScope;
  observedAt: string;
  mode: DesktopObservationMode;
  maxFrames: number;
  durationMs: number;
  frameFormat: DesktopFrameFormat;
  includeImages: boolean;
}

export interface DesktopObserveResult {
  targetScope: DesktopInteractionScope;
  observedAt: string;
  activeWindow?: DesktopWindowMetadata;
  cursorPosition?: DesktopPoint;
  cursorWitness?: DesktopCursorWitness;
  hoverWitness?: DesktopHoverWitness;
  providerTiming?: DesktopProviderTimingDiagnostics;
  frames: DesktopFrameArtifact[];
  lastActionDeltaSummary?: string;
  residue: string[];
}

export interface DesktopProviderActionRequest {
  sessionId: string;
  targetScope: DesktopInteractionScope;
  requestedAt: string;
  point?: DesktopPoint;
  button?: "left" | "middle" | "right";
  text?: string;
  textLength?: number;
  intendedSemanticTarget?: string;
}

export interface DesktopProviderActionResult {
  executed: boolean;
  simulated: boolean;
  cursorPosition?: DesktopPoint;
  clickedButton?: "left" | "middle" | "right";
  typedTextLength?: number;
  providerTiming?: DesktopProviderTimingDiagnostics;
  residue: string[];
}

export interface DesktopInteractionProvider {
  getCapabilities(): DesktopProviderCapabilities;
  observe(request: DesktopObserveRequest): Promise<DesktopObserveResult>;
  moveMouse(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
  click(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
  typeText(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
  dispose?(): void;
}
