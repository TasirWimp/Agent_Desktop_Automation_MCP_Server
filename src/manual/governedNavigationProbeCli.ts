import { readFileSync, writeFileSync } from "node:fs";
import {
  runGovernedNavigationProbe,
  type GovernedNavigationProbeConfig
} from "./governedNavigationProbeRunner.js";
import { MockDesktopProvider } from "../providers/mockDesktopProvider.js";
import { createDefaultDesktopProvider } from "../providers/defaultDesktopProvider.js";
import { WindowsDesktopObservationProvider } from "../providers/windowsDesktopObservationProvider.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";

interface GovernedNavigationProbeCliConfig extends GovernedNavigationProbeConfig {
  provider?: "default" | "mock" | "windows-active-window";
  enableRealMouseMovement?: boolean;
  resultPath?: string;
}

const exampleConfig: GovernedNavigationProbeCliConfig = {
  provider: "windows-active-window",
  enableRealMouseMovement: true,
  userGoal:
    "Run a bounded hover-reveal navigation probe in the active app without clicking or typing.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowRealMouseMovement: true,
  targetScope: {
    kind: "active_window"
  },
  steps: [
    {
      stepId: "hover-parent-landmark",
      intendedSemanticTarget: "Visible parent navigation landmark that may reveal the target",
      areaOfInterest: {
        x: 565,
        y: 180
      },
      movementFraction: 1,
      pauseAfterMoveMs: 800,
      witnessNotes: [
        "Record whether the post-movement frame reveals the requested target before adding another step."
      ]
    }
  ],
  maxDurationMs: 3_600_000,
  observationCadenceMaxGapMs: 180_000,
  includeImages: true,
  artifactDirectory: "tmp/navigation-probes/example",
  requestTimeoutMs: 180_000,
  resultPath: "tmp/navigation-probes/example/result.json"
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
      "Missing config path. Use --example to print a sample governed navigation probe config."
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf8")) as GovernedNavigationProbeCliConfig;
  const desktopProvider = providerFromConfig(config);
  const result = await runGovernedNavigationProbe(config, {
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

function providerFromConfig(config: GovernedNavigationProbeCliConfig): DesktopInteractionProvider {
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
  console.error(
    error instanceof Error ? error.message : "Unknown governed navigation probe CLI error."
  );
  process.exitCode = 1;
});
