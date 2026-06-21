import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import type {
  DesktopInteractionScope,
  DesktopPoint
} from "../policy/sessionLicensePolicy.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";
import { createDefaultDesktopProvider } from "../providers/defaultDesktopProvider.js";
import { InMemoryDesktopSessionStore } from "../session/sessionStore.js";

const defaultForbiddenActions = [
  "credential_entry",
  "payment_or_purchase",
  "send_message",
  "external_publish",
  "destructive_file_operation",
  "shell_command",
  "system_change"
] as const;

const defaultForbiddenBoundaries = [
  "credential_or_secret_prompt",
  "payment_or_purchase",
  "external_publish_or_deploy",
  "destructive_operation",
  "system_settings",
  "unrelated_private_window",
  "scope_exit",
  "uninterpretable_state"
] as const;

const defaultMaxDurationMs = 600_000;
const maxAllowedDurationMs = 60 * 60 * 1000;

export interface GovernedManualProbeConfig {
  sessionId?: string;
  userGoal: string;
  userConfirmed: boolean;
  visibleContentAcknowledged: boolean;
  allowRealMouseMovement?: boolean;
  targetScope: DesktopInteractionScope;
  intendedSemanticTarget?: string;
  areaOfInterest: DesktopPoint;
  movementFractions?: number[];
  maxAttempts?: number;
  maxDurationMs?: number;
  observationCadenceMaxGapMs?: number;
  includeImages?: boolean;
  artifactDirectory?: string;
  verifyClickBlocked?: boolean;
  manualWitnessNotes?: Record<string, string[]>;
}

export interface GovernedManualProbeRunnerOptions {
  desktopProvider?: DesktopInteractionProvider;
  now?: () => string;
  generateId?: (prefix: string) => string;
}

export interface FrameArtifactSummary {
  index: number;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  imagePath?: string;
}

export interface ProbeObservationSummary {
  observationId: string;
  targetScope: DesktopInteractionScope;
  cursorPosition?: DesktopPoint;
  activeWindow?: unknown;
  frames: FrameArtifactSummary[];
  residue: string[];
}

export interface ProbeMoveSummary {
  status?: string;
  isError: boolean;
  actionId?: string;
  plannedPoint: DesktopPoint;
  providerResult?: unknown;
  policy?: unknown;
  stopCondition?: unknown;
  residue: string[];
}

export interface ProbeAttemptSummary {
  attempt: number;
  relativePlan: {
    fromCursor?: DesktopPoint;
    areaOfInterest: DesktopPoint;
    vectorToArea?: DesktopPoint;
    fraction: number;
    plannedPoint?: DesktopPoint;
  };
  preObservation?: ProbeObservationSummary;
  move?: ProbeMoveSummary;
  postObservation?: ProbeObservationSummary;
  transitionGate?: unknown;
  visibleWitnessNotes: string[];
  residue: string[];
}

export interface ProbeClickBlockSummary {
  attempted: boolean;
  isError?: boolean;
  status?: string;
  providerCapabilities?: unknown;
  stopCondition?: unknown;
  residue: string[];
}

export interface GovernedManualProbeResult {
  sessionId: string;
  status: "completed" | "blocked" | "failed";
  providerCapabilities?: unknown;
  attempts: ProbeAttemptSummary[];
  clickBlock?: ProbeClickBlockSummary;
  auditEventCount?: number;
  stopConditions?: unknown[];
  artifactDirectory?: string;
  residue: string[];
}

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

export async function runGovernedManualProbe(
  config: GovernedManualProbeConfig,
  options: GovernedManualProbeRunnerOptions = {}
): Promise<GovernedManualProbeResult> {
  validateConfig(config);

  const sessionId = config.sessionId ?? `manual-probe-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const artifactDirectory = config.artifactDirectory ?? join("tmp", "manual-probes", sessionId);
  const includeImages = config.includeImages ?? true;
  const desktopProvider = options.desktopProvider ?? createDefaultDesktopProvider();
  let idCounter = 0;
  const sessionStore = new InMemoryDesktopSessionStore();
  const server = createServer({
    sessionStore,
    desktopProvider,
    now: options.now,
    generateId:
      options.generateId ?? ((prefix: string) => `${prefix}-manual-${++idCounter}`)
  });
  const client = new Client({
    name: "governed-manual-probe-runner",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const capabilities = await callToolJson(client, "desktop_capabilities", {});
    const providerCapabilities = asRecord(capabilities.provider, "provider capabilities");
    assertRealMovementGate(config, providerCapabilities);

    await callToolJson(client, "desktop_start_interaction_session", {
      sessionId,
      userGoal: config.userGoal,
      userConfirmed: config.userConfirmed,
      visibleContentAcknowledged: config.visibleContentAcknowledged,
      allowedScopes: [config.targetScope],
      allowedActions: config.verifyClickBlocked === true
        ? ["observe", "move_mouse", "click"]
        : ["observe", "move_mouse"],
      forbiddenActions: [...defaultForbiddenActions],
      ...(config.verifyClickBlocked === true
        ? {
            licensedAppScope: {
              description:
                "Manual probe target is treated as a reversible app-under-test for blocked-click verification.",
              scope: config.targetScope,
              userDeclaredReversible: true,
              allowedActions: ["observe", "move_mouse", "click"],
              forbiddenBoundaries: [...defaultForbiddenBoundaries],
              scopeExitStopConditions: ["outside_allowed_scope"]
            }
          }
        : {}),
      riskLimits: {
        maxDurationMs: config.maxDurationMs ?? defaultMaxDurationMs,
        maxActionCount: Math.max((config.maxAttempts ?? 3) + 2, 5),
        maxConsecutiveRepairAttempts: 3,
        allowCredentialEntry: false,
        allowDestructiveFileOperations: false,
        allowSystemChanges: false,
        allowExternalPublishing: false
      },
      observationCadence: {
        beforeEveryAction: true,
        afterEveryStateChangingAction: true,
        maxObservationGapMs: config.observationCadenceMaxGapMs ?? 60_000
      }
    });

    const attempts = await runAttempts({
      client,
      config,
      sessionId,
      artifactDirectory,
      includeImages
    });
    const clickBlock = config.verifyClickBlocked === true
      ? await verifyClickBlocked(client, sessionId, attempts, providerCapabilities)
      : undefined;
    const audit = await callToolJson(client, "desktop_session_audit_log", { sessionId });

    await callToolJson(client, "desktop_end_interaction_session", {
      sessionId,
      reason: "Governed manual probe runner completed."
    });

    return {
      sessionId,
      status: attempts.some((attempt) => attempt.move?.isError === true) ? "blocked" : "completed",
      providerCapabilities,
      attempts,
      clickBlock,
      auditEventCount: Array.isArray(audit.auditEvents) ? audit.auditEvents.length : undefined,
      stopConditions: Array.isArray(audit.stopConditions) ? audit.stopConditions : undefined,
      artifactDirectory: includeImages ? artifactDirectory : undefined,
      residue: [
        "Runner used MCP session tools and provider-backed action tools.",
        "No raw OS input was used by the runner.",
        "Real click and typing were not enabled by the runner."
      ]
    };
  } catch (error: unknown) {
    return {
      sessionId,
      status: "failed",
      attempts: [],
      artifactDirectory: includeImages ? artifactDirectory : undefined,
      residue: [
        error instanceof Error ? error.message : "Unknown governed manual probe failure."
      ]
    };
  } finally {
    await client.close();
    await server.close();
    desktopProvider.dispose?.();
  }
}

async function runAttempts(args: {
  client: Client;
  config: GovernedManualProbeConfig;
  sessionId: string;
  artifactDirectory: string;
  includeImages: boolean;
}): Promise<ProbeAttemptSummary[]> {
  const movementFractions = args.config.movementFractions ?? [0.6, 0.75, 1];
  const maxAttempts = args.config.maxAttempts ?? movementFractions.length;
  const attempts: ProbeAttemptSummary[] = [];
  let targetScope = args.config.targetScope;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1;
    const fraction = movementFractions[attemptIndex] ?? movementFractions[movementFractions.length - 1] ?? 1;
    const preObservation = await observe(
      args.client,
      args.sessionId,
      targetScope,
      args.artifactDirectory,
      args.includeImages,
      attemptNumber,
      "pre"
    );
    targetScope = preObservation.targetScope;
    const preObservationDigestId = await submitPerceptionDigest(
      args.client,
      args.sessionId,
      preObservation,
      args.config.intendedSemanticTarget ?? "manual movement probe target"
    );
    const plannedPoint = planRelativePoint(
      preObservation.cursorPosition,
      args.config.areaOfInterest,
      fraction
    );
    const moveResult = await callToolResult(args.client, "desktop_move_mouse", {
      sessionId: args.sessionId,
      targetScope,
      preActionObservationId: preObservation.observationId,
      perceptionDigestId: preObservationDigestId,
      point: plannedPoint,
      intendedSemanticTarget: args.config.intendedSemanticTarget,
      compactRelationalClaim: buildCompactRelationalClaim(
        preObservation.observationId,
        args.config.intendedSemanticTarget ?? "manual movement probe target",
        attemptNumber
      )
    });
    const movePayload = parseToolResult(moveResult);
    const move = summarizeMove(movePayload, moveResult.isError === true, plannedPoint);
    const attempt: ProbeAttemptSummary = {
      attempt: attemptNumber,
      relativePlan: {
        fromCursor: preObservation.cursorPosition,
        areaOfInterest: args.config.areaOfInterest,
        vectorToArea: preObservation.cursorPosition === undefined
          ? undefined
          : {
              x: args.config.areaOfInterest.x - preObservation.cursorPosition.x,
              y: args.config.areaOfInterest.y - preObservation.cursorPosition.y
            },
        fraction,
        plannedPoint
      },
      preObservation,
      move,
      visibleWitnessNotes: args.config.manualWitnessNotes?.[String(attemptNumber)] ?? [],
      residue: []
    };

    if (move.isError || move.actionId === undefined) {
      attempt.residue.push("Movement did not execute; no post-movement observation was recorded.");
      attempts.push(attempt);
      break;
    }

    const postObservationResult = await callToolJson(args.client, "desktop_observe", {
      sessionId: args.sessionId,
      targetScope,
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      includeImages: true,
      transitionActionId: move.actionId
    });
    const postObservation = summarizeObservation(
      asRecord(postObservationResult.observation, "post observation"),
      args.artifactDirectory,
      args.includeImages,
      attemptNumber,
      "post"
    );

    attempt.postObservation = postObservation;
    const postObservationDigestId = await submitPerceptionDigest(
      args.client,
      args.sessionId,
      postObservation,
      args.config.intendedSemanticTarget ?? "manual movement probe target",
      attempt.visibleWitnessNotes
    );
    const assessment = await callToolJson(args.client, "desktop_submit_transition_assessment", {
      sessionId: args.sessionId,
      actionId: move.actionId,
      perceptionDigestId: postObservationDigestId,
      assessment: buildSemanticLandingAssessment(attempt.visibleWitnessNotes)
    });

    attempt.transitionGate = assessment.transitionGate;
    attempt.residue.push("Post-movement observation recorded through transitionActionId.");
    attempts.push(attempt);
  }

  return attempts;
}

function buildCompactRelationalClaim(
  sourceObservationId: string,
  intendedTarget: string,
  attemptNumber: number
) {
  return {
    sourceObservationId,
    intendedTarget,
    scene: "Manual probe active-window scene.",
    anchor: `manual probe attempt ${attemptNumber} cursor origin and area of interest`,
    relation: "point moves along the configured vector toward the intended target area",
    candidate: "planned point is inside the intended target approach basin",
    rejectedAlternative: "nearby unrelated control or row",
    expectedEvidence: "cursor/hover witness remains in the intended target area",
    contradiction: "another control, row, or unrelated area highlights",
    pointProvenance: "relative_probe"
  };
}

function buildSemanticLandingAssessment(witnessNotes: string[]) {
  const joinedNotes = witnessNotes.join(" ").toLowerCase();

  if (joinedNotes.includes("wrong") || joinedNotes.includes("contradict")) {
    return {
      outcome: "contradicted",
      relationHeld: false,
      candidateSupported: false,
      rejectedAlternativeAvoided: false,
      expectedEvidenceSeen: witnessNotes.join("; ") || "manual witness contradicted the target",
      contradictionSeen: true,
      summary: witnessNotes.join("; ") || "Manual witness notes contradicted the movement target."
    };
  }

  if (joinedNotes.includes("inconclusive") || joinedNotes.includes("uncertain")) {
    return {
      outcome: "inconclusive",
      relationHeld: false,
      candidateSupported: false,
      rejectedAlternativeAvoided: true,
      expectedEvidenceSeen: witnessNotes.join("; ") || "manual witness was inconclusive",
      contradictionSeen: false,
      summary: witnessNotes.join("; ") || "Manual witness notes were inconclusive."
    };
  }

  return {
    outcome: "supported",
    relationHeld: true,
    candidateSupported: true,
    rejectedAlternativeAvoided: true,
    expectedEvidenceSeen: witnessNotes.join("; ") || "manual probe follow-up remained in the intended target area",
    contradictionSeen: false,
    summary: witnessNotes.join("; ") || "Manual probe runner treated the configured movement relation as supported."
  };
}

async function observe(
  client: Client,
  sessionId: string,
  targetScope: DesktopInteractionScope,
  artifactDirectory: string,
  includeImages: boolean,
  attempt: number,
  phase: "pre" | "post"
): Promise<ProbeObservationSummary> {
  const result = await callToolJson(client, "desktop_observe", {
    sessionId,
    targetScope,
    mode: "single_frame",
    maxFrames: 1,
    durationMs: 0,
    includeImages: true
  });

  return summarizeObservation(
    asRecord(result.observation, `${phase} observation`),
    artifactDirectory,
    includeImages,
    attempt,
    phase
  );
}

async function verifyClickBlocked(
  client: Client,
  sessionId: string,
  attempts: ProbeAttemptSummary[],
  providerCapabilities: Record<string, unknown>
): Promise<ProbeClickBlockSummary> {
  const supportsClick = providerCapabilities.supportsClick === true;
  const finalObservation = [...attempts]
    .reverse()
    .find((attempt) => attempt.postObservation !== undefined)?.postObservation;

  if (supportsClick) {
    return {
      attempted: false,
      residue: [
        "Click verification skipped because the provider reports click support.",
        "The manual runner only verifies blocking when the active provider cannot click."
      ]
    };
  }

  if (finalObservation === undefined) {
    return {
      attempted: false,
      residue: ["Click verification skipped because no post-movement observation was available."]
    };
  }

  const clickPoint = finalObservation.cursorPosition ?? attempts[attempts.length - 1]?.move?.plannedPoint;

  if (clickPoint === undefined) {
    return {
      attempted: false,
      residue: ["Click verification skipped because no cursor or planned point was available."]
    };
  }

  const perceptionDigestId = await submitPerceptionDigest(
    client,
    sessionId,
    finalObservation,
    "blocked click verification"
  );
  const clickResult = await callToolResult(client, "desktop_click", {
    sessionId,
    targetScope: finalObservation.targetScope,
    preActionObservationId: finalObservation.observationId,
    perceptionDigestId,
    point: clickPoint,
    button: "left",
    intendedSemanticTarget: "blocked click verification",
    compactRelationalClaim: {
      ...buildCompactRelationalClaim(
        finalObservation.observationId,
        "blocked click verification",
        attempts.length
      ),
      pointProvenance: "hover_witness"
    },
    risk: {
      credentialExposure: false,
      destructive: false,
      externalEffect: false,
      systemChange: false,
      recoverability: "high"
    }
  });
  const payload = parseToolResult(clickResult);

  return {
    attempted: true,
    isError: clickResult.isError === true,
    status: typeof payload.status === "string" ? payload.status : undefined,
    providerCapabilities: payload.providerCapabilities,
    stopCondition: payload.stopCondition,
    residue: Array.isArray(payload.residue)
      ? payload.residue.filter((item): item is string => typeof item === "string")
      : []
  };
}

async function submitPerceptionDigest(
  client: Client,
  sessionId: string,
  observation: ProbeObservationSummary,
  intendedTarget: string,
  witnessNotes: string[] = []
): Promise<string> {
  const joinedNotes = witnessNotes.join("; ");
  const lowerNotes = joinedNotes.toLowerCase();
  const result = await callToolJson(client, "desktop_submit_perception_digest", {
    sessionId,
    observationId: observation.observationId,
    targetScope: observation.targetScope,
    intendedTarget,
    currentScene: "Manual probe active-window scene.",
    currentAnchor: "manual probe cursor origin and area of interest",
    targetVisibility: lowerNotes.includes("not visible") ? "not_visible" : "visible",
    anchorVisibility: "visible",
    continuityWithPriorClaim:
      lowerNotes.includes("wrong") || lowerNotes.includes("contradict")
        ? "changed"
        : "consistent",
    contradictionToPriorClaim:
      lowerNotes.includes("wrong") || lowerNotes.includes("contradict")
        ? joinedNotes || "Manual witness notes contradicted the prior target claim."
        : null,
    staleCarryoverReviewed: true,
    currentEvidence:
      joinedNotes || "Manual probe runner re-grounded against the current screenshot."
  });

  return stringField(result, "perceptionDigestId");
}

function summarizeObservation(
  observation: Record<string, unknown>,
  artifactDirectory: string,
  includeImages: boolean,
  attempt: number,
  phase: "pre" | "post"
): ProbeObservationSummary {
  const observationId = stringField(observation, "observationId");
  const targetScope = asDesktopInteractionScope(observation.targetScope);
  const cursorPosition = observation.cursorPosition === undefined
    ? undefined
    : asDesktopPoint(observation.cursorPosition);
  const frames = Array.isArray(observation.frames)
    ? observation.frames.map((frame, index) =>
        summarizeFrame(asRecord(frame, "frame"), artifactDirectory, includeImages, attempt, phase, index)
      )
    : [];

  return {
    observationId,
    targetScope,
    cursorPosition,
    activeWindow: observation.activeWindow,
    frames,
    residue: stringArray(observation.residue)
  };
}

function summarizeFrame(
  frame: Record<string, unknown>,
  artifactDirectory: string,
  includeImages: boolean,
  attempt: number,
  phase: "pre" | "post",
  fallbackIndex: number
): FrameArtifactSummary {
  const index = numberField(frame, "index", fallbackIndex);
  const summary: FrameArtifactSummary = {
    index,
    width: numberField(frame, "width", 0),
    height: numberField(frame, "height", 0),
    byteLength: numberField(frame, "byteLength", 0),
    sha256: stringField(frame, "sha256")
  };
  const dataBase64 = typeof frame.dataBase64 === "string" ? frame.dataBase64 : undefined;

  if (includeImages && dataBase64 !== undefined) {
    mkdirSync(artifactDirectory, { recursive: true });
    const imagePath = join(artifactDirectory, `attempt-${attempt}-${phase}-frame-${index}.png`);
    writeFileSync(imagePath, Buffer.from(dataBase64, "base64"));
    summary.imagePath = imagePath;
  }

  return summary;
}

function summarizeMove(
  payload: Record<string, unknown>,
  isError: boolean,
  plannedPoint: DesktopPoint
): ProbeMoveSummary {
  const action = payload.action === undefined ? undefined : asRecord(payload.action, "action");

  return {
    status: typeof payload.status === "string" ? payload.status : undefined,
    isError,
    actionId: action === undefined ? undefined : stringField(action, "actionId"),
    plannedPoint,
    providerResult: payload.providerResult,
    policy: payload.policy,
    stopCondition: payload.stopCondition,
    residue: stringArray(payload.residue)
  };
}

function planRelativePoint(
  current: DesktopPoint | undefined,
  areaOfInterest: DesktopPoint,
  fraction: number
): DesktopPoint {
  if (current === undefined) {
    throw new Error("Cursor position is required for relative manual probe movement.");
  }

  return {
    x: Math.round(current.x + (areaOfInterest.x - current.x) * fraction),
    y: Math.round(current.y + (areaOfInterest.y - current.y) * fraction)
  };
}

async function callToolJson(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return parseToolResult(await callToolResult(client, name, args));
}

async function callToolResult(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  return client.callTool({
    name,
    arguments: args
  });
}

function parseToolResult(result: ToolResult): Record<string, unknown> {
  if (
    result.structuredContent !== undefined &&
    typeof result.structuredContent === "object" &&
    result.structuredContent !== null &&
    Object.keys(result.structuredContent).length > 0
  ) {
    return result.structuredContent as Record<string, unknown>;
  }

  const content = Array.isArray(result.content) ? result.content : [];
  const textBlock = content.find(isTextContentBlock);

  if (textBlock === undefined) {
    throw new Error("Tool result did not include JSON text content.");
  }

  return JSON.parse(textBlock.text) as Record<string, unknown>;
}

function isTextContentBlock(value: unknown): value is { type: "text"; text: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return record.type === "text" && typeof record.text === "string";
}

function validateConfig(config: GovernedManualProbeConfig): void {
  if (!config.userConfirmed) {
    throw new Error("Governed probe requires userConfirmed: true.");
  }

  if (!config.visibleContentAcknowledged) {
    throw new Error("Governed probe requires visibleContentAcknowledged: true.");
  }

  if (config.maxAttempts !== undefined && config.maxAttempts <= 0) {
    throw new Error("maxAttempts must be positive when provided.");
  }

  if (
    config.maxDurationMs !== undefined &&
    (!Number.isInteger(config.maxDurationMs) ||
      config.maxDurationMs <= 0 ||
      config.maxDurationMs > maxAllowedDurationMs)
  ) {
    throw new Error("maxDurationMs must be a positive integer no greater than 3600000.");
  }

  for (const fraction of config.movementFractions ?? []) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new Error("movementFractions must be finite values between 0 and 1.");
    }
  }
}

function assertRealMovementGate(
  config: GovernedManualProbeConfig,
  providerCapabilities: Record<string, unknown>
): void {
  if (
    providerCapabilities.providerKind === "real" &&
    providerCapabilities.supportsMouse === true &&
    config.allowRealMouseMovement !== true
  ) {
    throw new Error(
      "Real mouse movement provider is active; config must set allowRealMouseMovement: true."
    );
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function asDesktopInteractionScope(value: unknown): DesktopInteractionScope {
  const record = asRecord(value, "desktop interaction scope");
  const kind = stringField(record, "kind") as DesktopInteractionScope["kind"];
  const valueField = typeof record.value === "string" ? record.value : undefined;

  return valueField === undefined ? { kind } : { kind, value: valueField };
}

function asDesktopPoint(value: unknown): DesktopPoint {
  const record = asRecord(value, "desktop point");

  return {
    x: numberField(record, "x", 0),
    y: numberField(record, "y", 0)
  };
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];

  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be a string.`);
  }

  return value;
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  fallback?: number
): number {
  const value = record[field];

  if (typeof value === "number") {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Expected ${field} to be a number.`);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
