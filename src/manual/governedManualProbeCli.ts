import { readFileSync, writeFileSync } from "node:fs";
import {
  runGovernedManualProbe,
  type GovernedManualProbeConfig
} from "./governedManualProbeRunner.js";
import { MockDesktopProvider } from "../providers/mockDesktopProvider.js";
import { createDefaultDesktopProvider } from "../providers/defaultDesktopProvider.js";
import { WindowsDesktopObservationProvider } from "../providers/windowsDesktopObservationProvider.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";

interface GovernedManualProbeCliConfig extends GovernedManualProbeConfig {
  provider?: "default" | "mock" | "windows-active-window";
  enableRealMouseMovement?: boolean;
  resultPath?: string;
}

const exampleConfig: GovernedManualProbeCliConfig = {
  provider: "windows-active-window",
  enableRealMouseMovement: true,
  userGoal: "Probe the active app File menu with real mouse movement only.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowRealMouseMovement: true,
  targetScope: {
    kind: "active_window"
  },
  intendedSemanticTarget: "File menu",
  areaOfInterest: {
    x: 126,
    y: 26
  },
  movementFractions: [0.6, 0.75, 1],
  maxAttempts: 3,
  observationCadenceMaxGapMs: 60_000,
  includeImages: true,
  artifactDirectory: "tmp/manual-probes/file-menu",
  verifyClickBlocked: true,
  manualWitnessNotes: {
    "2": ["Example: wrong-target hover evidence can be recorded here."]
  }
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--example")) {
    console.log(JSON.stringify(exampleConfig, null, 2));
    return;
  }

  const configPath = valueAfter(args, "--config") ?? firstPositionalArg(args);

  if (configPath === undefined) {
    throw new Error(
      "Missing config path. Use --example to print a sample governed probe config."
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf8")) as GovernedManualProbeCliConfig;
  const desktopProvider = providerFromConfig(config);
  const result = await runGovernedManualProbe(config, {
    desktopProvider
  });
  const output = JSON.stringify(result, null, 2);

  if (config.resultPath !== undefined) {
    writeFileSync(config.resultPath, `${output}\n`);
  }

  console.log(output);

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

function providerFromConfig(config: GovernedManualProbeCliConfig): DesktopInteractionProvider {
  if (config.provider === "mock") {
    return new MockDesktopProvider();
  }

  if (config.provider === "windows-active-window") {
    return new WindowsDesktopObservationProvider({
      enableRealMouseMovement: config.enableRealMouseMovement === true
    });
  }

  return createDefaultDesktopProvider();
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function firstPositionalArg(args: string[]): string | undefined {
  return args.find((arg) => arg !== "--" && !arg.startsWith("-"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown governed probe CLI error.");
  process.exitCode = 1;
});
