import { describe, expect, it } from "vitest";
import { createDefaultDesktopProvider } from "../src/providers/defaultDesktopProvider.js";

describe("createDefaultDesktopProvider", () => {
  it("uses the mock provider by default", () => {
    const provider = createDefaultDesktopProvider({});

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "mock",
      realDesktopCapture: false,
      realDesktopMouseMovement: false,
      realDesktopMutation: false
    });
  });

  it("requires explicit provider and enable flag for real Windows observation", () => {
    const provider = createDefaultDesktopProvider({
      ADMCP_DESKTOP_PROVIDER: "windows-active-window"
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "mock",
      realDesktopCapture: false
    });
  });

  it("selects the Windows real-observation provider only when explicitly enabled", () => {
    const provider = createDefaultDesktopProvider({
      ADMCP_DESKTOP_PROVIDER: "windows-active-window",
      ADMCP_ENABLE_REAL_OBSERVATION: "true"
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      realDesktopCapture: true,
      realDesktopMouseMovement: false,
      realDesktopMutation: false,
      supportsMouse: false,
      supportsClick: false,
      supportsTyping: false
    });
  });

  it("enables Windows real mouse movement only behind the explicit movement gate", () => {
    const provider = createDefaultDesktopProvider({
      ADMCP_DESKTOP_PROVIDER: "windows-active-window",
      ADMCP_ENABLE_REAL_OBSERVATION: "true",
      ADMCP_ENABLE_REAL_MOUSE_MOVEMENT: "true"
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      realDesktopCapture: true,
      realDesktopMouseMovement: true,
      realDesktopMutation: false,
      supportsMouse: true,
      supportsClick: false,
      supportsTyping: false
    });
  });

  it("enables Windows real clicking only behind the explicit click gate", () => {
    const provider = createDefaultDesktopProvider({
      ADMCP_DESKTOP_PROVIDER: "windows-active-window",
      ADMCP_ENABLE_REAL_OBSERVATION: "true",
      ADMCP_ENABLE_REAL_CLICK: "true"
    });

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "real",
      realDesktopCapture: true,
      realDesktopMouseMovement: true,
      realDesktopMutation: true,
      supportsMouse: false,
      supportsClick: true,
      supportsTyping: false
    });
  });
});
