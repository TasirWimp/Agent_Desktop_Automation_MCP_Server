import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadDesktopApplicationCatalog,
  resolveDesktopApplication,
  validateDesktopApplicationCatalog,
  type DesktopApplicationCatalog
} from "../src/providers/applicationCatalog.js";

const baseCatalog: DesktopApplicationCatalog = {
  applications: [
    {
      id: "zeiss_quality_suite",
      displayName: "ZEISS Quality Suite",
      aliases: ["quality suite", "zqs", "inspect xray"],
      windowsShortcutNames: ["ZEISS Quality Suite", "Quality Suite"],
      moduleHints: ["xray_inspection"]
    }
  ]
};

describe("desktop application catalog", () => {
  it("loads an added application from JSON without TypeScript changes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "admcp-catalog-"));
    const catalogPath = join(tempDir, "desktop_applications.json");

    try {
      writeFileSync(
        catalogPath,
        JSON.stringify(
          {
            applications: [
              ...baseCatalog.applications,
              {
                id: "generated_test_app",
                displayName: "Generated Test App",
                aliases: ["generated app"],
                windowsShortcutNames: ["Generated Test App"],
                moduleHints: ["fixture"]
              }
            ]
          },
          null,
          2
        )
      );

      const catalog = loadDesktopApplicationCatalog(catalogPath);
      const resolved = resolveDesktopApplication(catalog, {
        applicationQuery: "generated app"
      });

      expect(resolved).toMatchObject({
        resolvedFrom: "alias",
        definition: {
          id: "generated_test_app",
          displayName: "Generated Test App"
        }
      });
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects duplicate application ids", () => {
    expect(() =>
      validateDesktopApplicationCatalog({
        applications: [
          ...baseCatalog.applications,
          {
            id: "zeiss_quality_suite",
            displayName: "Other ZEISS Entry",
            aliases: [],
            windowsShortcutNames: [],
            moduleHints: []
          }
        ]
      })
    ).toThrow(/Duplicate desktop application id/u);
  });

  it("rejects ambiguous aliases across applications", () => {
    expect(() =>
      validateDesktopApplicationCatalog({
        applications: [
          ...baseCatalog.applications,
          {
            id: "other_quality_app",
            displayName: "Other Quality App",
            aliases: ["quality suite"],
            windowsShortcutNames: [],
            moduleHints: []
          }
        ]
      })
    ).toThrow(/Ambiguous desktop application alias/u);
  });

  it("does not resolve unknown app names or executable paths", () => {
    expect(
      resolveDesktopApplication(baseCatalog, {
        applicationQuery: "Unknown CAD Tool"
      })
    ).toBeUndefined();
    expect(
      resolveDesktopApplication(baseCatalog, {
        applicationQuery: "C:\\Windows\\notepad.exe"
      })
    ).toBeUndefined();
  });

  it("keeps module hints out of public query aliases", () => {
    expect(
      resolveDesktopApplication(baseCatalog, {
        applicationQuery: "xray_inspection"
      })
    ).toBeUndefined();
  });
});
