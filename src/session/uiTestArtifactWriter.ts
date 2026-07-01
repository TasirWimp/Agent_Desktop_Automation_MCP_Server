import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  type UiTestClosureGateResult,
  type UiTestCyclePacket,
  type UiTestLandfallReentryPacket,
  type UiTestRunCarrier,
  type UiTestSafetyReport,
  type UiTestScenarioContract,
  uiTestClosureGateResultSchema,
  uiTestCyclePacketSchema,
  uiTestLandfallReentryPacketSchema,
  uiTestRunCarrierSchema,
  uiTestSafetyReportSchema,
  uiTestScenarioContractSchema,
  uiTestSchemaVersion
} from "./uiTestCarrierSchemas.js";

const uiTestArtifactKinds = [
  "scenario",
  "carrier",
  "cycles",
  "observations",
  "actions",
  "audit_events",
  "stop_conditions",
  "closure_gate",
  "landfall_reentry",
  "safety_sidecar",
  "manifest"
] as const;

export type UiTestArtifactKind = (typeof uiTestArtifactKinds)[number];

export const uiTestArtifactRecordSchema = z.object({
  kind: z.enum(uiTestArtifactKinds),
  path: z.string().min(1),
  fileUri: z.string().min(1),
  sha256: z.string().min(1),
  byteLength: z.number().int().nonnegative()
});

export type UiTestArtifactRecord = z.infer<typeof uiTestArtifactRecordSchema>;

export const uiTestRunArtifactManifestSchema = z.object({
  schemaVersion: z.literal(uiTestSchemaVersion),
  manifestId: z.string().min(1),
  runId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioRevision: z.string().min(1),
  carrierId: z.string().min(1),
  createdAt: z.string().min(1),
  rootDirectory: z.string().min(1),
  artifactPolicy: z.object({
    storesRawTypedText: z.literal(false),
    storesSecrets: z.literal(false),
    storesInlineImageBase64: z.literal(false),
    storesGatedEvaluatorOrHiddenAnswer: z.literal(false),
    storesDesktopMutationAuthority: z.literal(false)
  }),
  artifacts: z.array(uiTestArtifactRecordSchema),
  sanitizerResidue: z.array(z.string()),
  replayEntryPoints: z.object({
    scenario: z.string().min(1),
    carrier: z.string().min(1),
    cycles: z.string().min(1),
    safetySidecar: z.string().min(1),
    landfallReentry: z.string().min(1)
  }),
  residue: z.array(z.string())
});

export type UiTestRunArtifactManifest = z.infer<
  typeof uiTestRunArtifactManifestSchema
>;

export interface WriteUiTestRunArtifactsInput {
  rootDirectory: string;
  runId: string;
  createdAt: string;
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  cycles: UiTestCyclePacket[];
  closureGate: UiTestClosureGateResult;
  safetyReport: UiTestSafetyReport;
  landfallReentry?: UiTestLandfallReentryPacket;
  observations?: unknown[];
  actions?: unknown[];
  auditEvents?: unknown[];
  stopConditions?: unknown[];
}

export interface WriteUiTestRunArtifactsResult {
  runDirectory: string;
  manifest: UiTestRunArtifactManifest;
  manifestArtifact: UiTestArtifactRecord;
  artifacts: UiTestArtifactRecord[];
  sanitizerResidue: string[];
}

interface SanitizedValue {
  value: unknown;
  residue: string[];
}

export function writeUiTestRunArtifacts(
  input: WriteUiTestRunArtifactsInput
): WriteUiTestRunArtifactsResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const cycles = input.cycles.map((cycle) => uiTestCyclePacketSchema.parse(cycle));
  const closureGate = uiTestClosureGateResultSchema.parse(input.closureGate);
  const safetyReport = uiTestSafetyReportSchema.parse(input.safetyReport);
  const landfallReentry = uiTestLandfallReentryPacketSchema.parse(
    input.landfallReentry ??
      buildDefaultLandfallReentry({
        runId: input.runId,
        scenario,
        carrier,
        closureGate,
        auditEventCount: input.auditEvents?.length ?? 0,
        stopConditions: input.stopConditions ?? []
      })
  );

  const rootDirectory = resolve(input.rootDirectory);
  const runDirectory = join(rootDirectory, safePathSegment(input.runId));
  const sanitizerResidue: string[] = [];
  const artifacts: UiTestArtifactRecord[] = [];

  mkdirSync(runDirectory, { recursive: true });

  const writeArtifact = (kind: UiTestArtifactKind, filename: string, value: unknown) => {
    const sanitized = sanitizeForUiTestArtifact(value);

    sanitizerResidue.push(...sanitized.residue);
    artifacts.push(writeJsonArtifact(runDirectory, kind, filename, sanitized.value));
  };

  writeArtifact("scenario", "scenario.json", scenario);
  writeArtifact("carrier", "carrier.json", carrier);
  writeArtifact("cycles", "cycles.json", cycles);
  writeArtifact("observations", "observations.json", input.observations ?? []);
  writeArtifact("actions", "actions.json", input.actions ?? []);
  writeArtifact("audit_events", "audit-events.json", input.auditEvents ?? []);
  writeArtifact("stop_conditions", "stop-conditions.json", input.stopConditions ?? []);
  writeArtifact("closure_gate", "closure-gate.json", closureGate);
  writeArtifact("landfall_reentry", "landfall-reentry.json", landfallReentry);
  writeArtifact("safety_sidecar", "safety-sidecar.json", {
    ...safetyReport,
    secretsOrRawTypedTextStored: false
  });

  const manifest = uiTestRunArtifactManifestSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    manifestId: `manifest-${input.runId}`,
    runId: input.runId,
    scenarioId: scenario.scenarioId,
    scenarioRevision: scenario.scenarioRevision,
    carrierId: carrier.carrierId,
    createdAt: input.createdAt,
    rootDirectory: runDirectory,
    artifactPolicy: {
      storesRawTypedText: false,
      storesSecrets: false,
      storesInlineImageBase64: false,
      storesGatedEvaluatorOrHiddenAnswer: false,
      storesDesktopMutationAuthority: false
    },
    artifacts,
    sanitizerResidue: uniqueStrings(sanitizerResidue),
    replayEntryPoints: {
      scenario: artifactPathFor(artifacts, "scenario"),
      carrier: artifactPathFor(artifacts, "carrier"),
      cycles: artifactPathFor(artifacts, "cycles"),
      safetySidecar: artifactPathFor(artifacts, "safety_sidecar"),
      landfallReentry: artifactPathFor(artifacts, "landfall_reentry")
    },
    residue: [
      "ADMCP-023D artifact writer persisted replayable run metadata.",
      "Artifacts intentionally omit sensitive payload fields, inline image payloads, evaluator/answer authority, and desktop mutation authority.",
      "The server did not inspect pixels while writing artifacts."
    ]
  });
  const manifestArtifact = writeJsonArtifact(
    runDirectory,
    "manifest",
    "manifest.json",
    manifest
  );

  return {
    runDirectory,
    manifest,
    manifestArtifact,
    artifacts,
    sanitizerResidue: manifest.sanitizerResidue
  };
}

export function sanitizeForUiTestArtifact(value: unknown): SanitizedValue {
  return sanitizeUnknown(value, []);
}

function buildDefaultLandfallReentry(input: {
  runId: string;
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  closureGate: UiTestClosureGateResult;
  auditEventCount: number;
  stopConditions: unknown[];
}): UiTestLandfallReentryPacket {
  return uiTestLandfallReentryPacketSchema.parse({
    schemaVersion: uiTestSchemaVersion,
    packetId: `landfall-${input.runId}`,
    scenarioId: input.scenario.scenarioId,
    carrierId: input.carrier.carrierId,
    closureGate: input.closureGate,
    protectedObservables: input.carrier.routeCarrier.protectedObservables,
    satisfiedObservables: input.carrier.routeCarrier.satisfiedObservables,
    unsatisfiedResidue: input.carrier.routeCarrier.unsatisfiedResidue,
    auditEventCount: input.auditEventCount,
    stopConditions: input.stopConditions
      .map((condition) =>
        isRecord(condition)
          ? stringFrom(condition.reason) ?? stringFrom(condition.condition)
          : typeof condition === "string"
            ? condition
            : undefined
      )
      .filter((condition): condition is string => condition !== undefined),
    reentryNotes:
      input.carrier.routeCarrier.reentryGeometry?.reentryNotes ??
      "Recover this run from the scenario, carrier, cycle, safety sidecar, and closure artifacts.",
    replayArtifactRefs: []
  });
}

function writeJsonArtifact(
  runDirectory: string,
  kind: UiTestArtifactKind,
  filename: string,
  value: unknown
): UiTestArtifactRecord {
  const path = join(runDirectory, filename);

  return overwriteJsonArtifact(path, value, kind);
}

function overwriteJsonArtifact(
  path: string,
  value: unknown,
  kind: UiTestArtifactKind = "manifest"
): UiTestArtifactRecord {
  const text = `${JSON.stringify(value, null, 2)}\n`;

  writeFileSync(path, text, "utf8");

  const byteLength = Buffer.byteLength(text, "utf8");

  return uiTestArtifactRecordSchema.parse({
    kind,
    path,
    fileUri: pathToFileURL(path).href,
    sha256: createHash("sha256").update(text).digest("hex"),
    byteLength
  });
}

function sanitizeUnknown(value: unknown, path: string[]): SanitizedValue {
  if (Array.isArray(value)) {
    const residue: string[] = [];
    const sanitizedValues = value.map((entry, index) => {
      const sanitized = sanitizeUnknown(entry, [...path, String(index)]);

      residue.push(...sanitized.residue);
      return sanitized.value;
    });

    return {
      value: sanitizedValues,
      residue
    };
  }

  if (isRecord(value)) {
    const residue: string[] = [];
    const sanitizedEntries: Array<[string, unknown]> = [];

    for (const [key, entry] of Object.entries(value)) {
      if (blockedArtifactKey(key)) {
        residue.push(`Removed blocked artifact field at ${artifactPath(path)}.`);
        continue;
      }

      const sanitized = sanitizeUnknown(entry, [...path, key]);

      residue.push(...sanitized.residue);
      sanitizedEntries.push([key, sanitized.value]);
    }

    return {
      value: Object.fromEntries(sanitizedEntries),
      residue
    };
  }

  if (typeof value === "string") {
    const redacted = redactSensitiveString(value);

    return {
      value: redacted.redacted,
      residue:
        redacted.redacted === value
          ? []
          : [`Redacted sensitive string at ${artifactPath(path)}.`]
    };
  }

  return {
    value,
    residue: []
  };
}

function blockedArtifactKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return new Set([
    "database64",
    "text",
    "rawtext",
    "typedtext",
    "rawtypedtext",
    "password",
    "passphrase",
    "secret",
    "token",
    "accesstoken",
    "refreshtoken",
    "apikey",
    "credential",
    "credentials",
    "hiddenanswer",
    "hiddenanswers",
    "answerkey",
    "gatedanswer",
    "evaluatorcode",
    "gatedevaluatorcode",
    "privatekey"
  ]).has(normalized);
}

function redactSensitiveString(value: string): { redacted: string } {
  const sensitivePatterns = [
    /\bpassword\s*[:=]\s*\S+/giu,
    /\bpassphrase\s*[:=]\s*\S+/giu,
    /\bapi[_-]?key\s*[:=]\s*\S+/giu,
    /\btoken\s*[:=]\s*\S+/giu,
    /\bsecret\s*[:=]\s*\S+/giu,
    /\bbearer\s+[a-z0-9._-]+/giu,
    /\bsk-[a-z0-9]{12,}/giu,
    /\bghp_[a-z0-9_]{12,}/giu,
    /-----begin [a-z ]+private key-----[\s\S]*?-----end [a-z ]+private key-----/giu
  ];
  let redacted = value;

  for (const pattern of sensitivePatterns) {
    redacted = redacted.replace(pattern, "[redacted:sensitive_string]");
  }

  return { redacted };
}

function artifactPath(path: string[]): string {
  return path.length === 0 ? "<root>" : path.join(".");
}

function safePathSegment(value: string): string {
  const segment = value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);

  return segment.length > 0 ? segment : "run";
}

function normalizeKey(key: string): string {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function artifactPathFor(
  artifacts: UiTestArtifactRecord[],
  kind: UiTestArtifactKind
): string {
  const artifact = artifacts.find((entry) => entry.kind === kind);

  if (artifact === undefined) {
    throw new Error(`Missing artifact kind ${kind}.`);
  }

  return artifact.path;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
