import type {
  DesktopFrameArtifact,
  DesktopInteractionScope,
  DesktopPoint,
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
  realDesktopMutation: boolean;
  maxFramesPerObservation: number;
  maxObservationDurationMs: number;
  residue: string[];
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
  frames: DesktopFrameArtifact[];
  lastActionDeltaSummary?: string;
  residue: string[];
}

export interface DesktopProviderActionRequest {
  sessionId: string;
  targetScope: DesktopInteractionScope;
  requestedAt: string;
}

export interface DesktopProviderActionResult {
  executed: boolean;
  residue: string[];
}

export interface DesktopInteractionProvider {
  getCapabilities(): DesktopProviderCapabilities;
  observe(request: DesktopObserveRequest): Promise<DesktopObserveResult>;
  moveMouse(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
  click(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
  typeText(request: DesktopProviderActionRequest): Promise<DesktopProviderActionResult>;
}
