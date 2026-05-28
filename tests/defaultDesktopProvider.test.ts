import { describe, expect, it } from "vitest";
import { createDefaultDesktopProvider } from "../src/providers/defaultDesktopProvider.js";

describe("createDefaultDesktopProvider", () => {
  it("uses the mock provider by default", () => {
    const provider = createDefaultDesktopProvider({});

    expect(provider.getCapabilities()).toMatchObject({
      providerKind: "mock",
      realDesktopCapture: false,
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
      realDesktopMutation: false,
      supportsMouse: false,
      supportsClick: false,
      supportsTyping: false
    });
  });
});
