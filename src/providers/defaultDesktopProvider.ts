import { MockDesktopProvider } from "./mockDesktopProvider.js";
import { WindowsDesktopObservationProvider } from "./windowsDesktopObservationProvider.js";
import type { DesktopInteractionProvider } from "./desktopProvider.js";

export const desktopProviderKinds = ["mock", "windows-active-window"] as const;

export type DesktopProviderKind = (typeof desktopProviderKinds)[number];

export interface DesktopProviderEnvironment {
  ADMCP_DESKTOP_PROVIDER?: string;
  ADMCP_ENABLE_REAL_OBSERVATION?: string;
  ADMCP_ENABLE_REAL_MOUSE_MOVEMENT?: string;
  ADMCP_ENABLE_REAL_CLICK?: string;
}

export function createDefaultDesktopProvider(
  env: DesktopProviderEnvironment = process.env
): DesktopInteractionProvider {
  if (
    env.ADMCP_DESKTOP_PROVIDER === "windows-active-window" &&
    env.ADMCP_ENABLE_REAL_OBSERVATION === "true"
  ) {
    return new WindowsDesktopObservationProvider({
      enableRealMouseMovement: env.ADMCP_ENABLE_REAL_MOUSE_MOVEMENT === "true",
      enableRealClick: env.ADMCP_ENABLE_REAL_CLICK === "true"
    });
  }

  return new MockDesktopProvider();
}
