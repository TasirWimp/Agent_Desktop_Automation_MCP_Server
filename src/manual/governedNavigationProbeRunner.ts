import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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

export interface GovernedNavigationProbeStepConfig {
  stepId?: string;
  intendedSemanticTarget: string;
  areaOfInterest: DesktopPoint;
  movementFraction?: number;
  pauseAfterMoveMs?: number;
  witnessNotes?: string[];
}

export interface GovernedNavigationProbeConfig {
  sessionId?: string;
  userGoal: string;
  userConfirmed: boolean;
  visibleContentAcknowledged: boolean;
  allowRealMouseMovement?: boolean;
  targetScope: DesktopInteractionScope;
  steps: GovernedNavigationProbeStepConfig[];
  observationCadenceMaxGapMs?: number;
  includeImages?: boolean;
  artifactDirectory?: string;
  requestTimeoutMs?: number;
}

export interface GovernedNavigationProbeRunnerOptions {
  desktopProvider?: DesktopInteractionProvider;
  now?: () => string;
  generateId?: (prefix: string) => string;
}

export interface NavigationProbeTiming {
  operation: string;
  durationMs: number;
  isError: boolean;
  status?: string;
  errorMessage?: string;
}

export interface NavigationFrameArtifactSummary {
  index: number;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  imagePath?: string;
}

export interface NavigationObservationSummary {
  observationId: string;
  targetScope: DesktopInteractionScope;
  cursorPosition?: DesktopPoint;
  activeWindow?: unknown;
  providerTiming?: unknown;
  frames: NavigationFrameArtifactSummary[];
  residue: string[];
}

export interface NavigationMoveSummary {
  status?: string;
  isError: boolean;
  actionId?: string;
  plannedPoint: DesktopPoint;
  providerResult?: unknown;
  policy?: unknown;
  stopCondition?: unknown;
  residue: string[];
}

export interface NavigationProbeStepSummary {
  stepIndex: number;
  stepId: string;
  intendedSemanticTarget: string;
  relativePlan: {
    fromCursor?: DesktopPoint;
    areaOfInterest: DesktopPoint;
    vectorToArea?: DesktopPoint;
    fraction: number;
    plannedPoint?: DesktopPoint;
  };
  preObservation: NavigationObservationSummary;
  move: NavigationMoveSummary;
  postObservation?: NavigationObservationSummary;
  transitionGate?: unknown;
  witnessNotes: string[];
  residue: string[];
}

export interface GovernedNavigationProbeResult {
  sessionId: string;
  status: "completed" | "blocked" | "failed";
  providerCapabilities?: unknown;
  initialObservation?: NavigationObservationSummary;
  steps: NavigationProbeStepSummary[];
  auditEventCount?: number;
  stopConditions?: unknown[];
  artifactDirectory?: string;
  timings: NavigationProbeTiming[];
  residue: string[];
}

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

export async function runGovernedNavigationProbe(
  config: GovernedNavigationProbeConfig,
  options: GovernedNavigationProbeRunnerOptions = {}
): Promise<GovernedNavigationProbeResult> {
  validateConfig(config);

  const sessionId =
    config.sessionId ?? `navigation-probe-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const artifactDirectory =
    config.artifactDirectory ?? join("tmp", "navigation-probes", sessionId);
  const includeImages = config.includeImages ?? true;
  const requestTimeoutMs = config.requestTimeoutMs ?? 120_000;
  const desktopProvider = options.desktopProvider ?? createDefaultDesktopProvider();
  const timings: NavigationProbeTiming[] = [];
  let providerCapabilities: Record<string, unknown> | undefined;
  let initialObservation: NavigationObservationSummary | undefined;
  const steps: NavigationProbeStepSummary[] = [];
  let idCounter = 0;
  const sessionStore = new InMemoryDesktopSessionStore();
  const server = createServer({
    sessionStore,
    desktopProvider,
    now: options.now,
    generateId:
      options.generateId ?? ((prefix: string) => `${prefix}-navigation-${++idCounter}`)
  });
  const client = new Client({
    name: "governed-navigation-probe-runner",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const capabilities = await callToolJsonTimed(
      client,
      "desktop_capabilities",
      "desktop_capabilities",
      {},
      requestTimeoutMs,
      timings
    );
    providerCapabilities = asRecord(capabilities.provider, "provider capabilities");
    assertRealMovementGate(config, providerCapabilities);

    await callToolJsonTimed(
      client,
      "desktop_start_interaction_session",
      "desktop_start_interaction_session",
      {
        sessionId,
        userGoal: config.userGoal,
        userConfirmed: config.userConfirmed,
        visibleContentAcknowledged: config.visibleContentAcknowledged,
        allowedScopes: [config.targetScope],
        allowedActions: ["observe", "move_mouse"],
        forbiddenActions: [...defaultForbiddenActions],
        riskLimits: {
          maxDurationMs: Math.max(60_000, requestTimeoutMs * Math.max(config.steps.length + 1, 2)),
          maxActionCount: Math.max(config.steps.length + 2, 5),
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
      },
      requestTimeoutMs,
      timings
    );

    initialObservation = await observe({
      client,
      sessionId,
      targetScope: config.targetScope,
      artifactDirectory,
      includeImages,
      requestTimeoutMs,
      timings,
      artifactPrefix: "initial"
    });
    let currentObservation = initialObservation;
    let targetScope = initialObservation.targetScope;

    for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex += 1) {
      const stepConfig = config.steps[stepIndex] as GovernedNavigationProbeStepConfig;
      const step = await runStep({
        client,
        sessionId,
        targetScope,
        stepConfig,
        stepIndex: stepIndex + 1,
        preObservation: currentObservation,
        artifactDirectory,
        includeImages,
        requestTimeoutMs,
        timings
      });

      steps.push(step);

      if (step.move.isError || step.postObservation === undefined) {
        const audit = await readAuditIfPossible(client, sessionId, requestTimeoutMs, timings);

        await callToolJsonTimed(
          client,
          "desktop_end_interaction_session",
          "desktop_end_interaction_session",
          {
            sessionId,
            reason: "Governed navigation probe runner stopped after a blocked movement."
          },
          requestTimeoutMs,
          timings
        );

        return {
          sessionId,
          status: "blocked",
          providerCapabilities,
          initialObservation,
          steps,
          auditEventCount: audit.auditEventCount,
          stopConditions: audit.stopConditions,
          artifactDirectory: includeImages ? artifactDirectory : undefined,
          timings,
          residue: [
            "Navigation probe stopped after a movement policy/provider block.",
            "Runner used MCP session tools and provider-backed action tools.",
            "No raw OS input was used by the runner.",
            "Real click and typing were not enabled by the runner."
          ]
        };
      }

      currentObservation = step.postObservation;
      targetScope = currentObservation.targetScope;
    }

    const audit = await readAuditIfPossible(client, sessionId, requestTimeoutMs, timings);

    await callToolJsonTimed(
      client,
      "desktop_end_interaction_session",
      "desktop_end_interaction_session",
      {
        sessionId,
        reason: "Governed navigation probe runner completed."
      },
      requestTimeoutMs,
      timings
    );

    return {
      sessionId,
      status: "completed",
      providerCapabilities,
      initialObservation,
      steps,
      auditEventCount: audit.auditEventCount,
      stopConditions: audit.stopConditions,
      artifactDirectory: includeImages ? artifactDirectory : undefined,
      timings,
      residue: [
        "Runner used one active session for the full navigation path.",
        "Each post-movement observation was carried forward as the next pre-action witness.",
        "Runner used MCP session tools and provider-backed action tools.",
        "No raw OS input was used by the runner.",
        "Real click and typing were not enabled by the runner."
      ]
    };
  } catch (error: unknown) {
    return {
      sessionId,
      status: "failed",
      providerCapabilities,
      initialObservation,
      steps,
      artifactDirectory: includeImages ? artifactDirectory : undefined,
      timings,
      residue: [
        error instanceof Error ? error.message : "Unknown governed navigation probe failure."
      ]
    };
  } finally {
    await client.close();
    await server.close();
    desktopProvider.dispose?.();
  }
}

async function runStep(args: {
  client: Client;
  sessionId: string;
  targetScope: DesktopInteractionScope;
  stepConfig: GovernedNavigationProbeStepConfig;
  stepIndex: number;
  preObservation: NavigationObservationSummary;
  artifactDirectory: string;
  includeImages: boolean;
  requestTimeoutMs: number;
  timings: NavigationProbeTiming[];
}): Promise<NavigationProbeStepSummary> {
  const fraction = args.stepConfig.movementFraction ?? 1;
  const plannedPoint = planRelativePoint(
    args.preObservation.cursorPosition,
    args.stepConfig.areaOfInterest,
    fraction
  );
  const moveResult = await callToolResultTimed(
    args.client,
    `desktop_move_mouse:step-${args.stepIndex}`,
    "desktop_move_mouse",
    {
      sessionId: args.sessionId,
      targetScope: args.targetScope,
      preActionObservationId: args.preObservation.observationId,
      point: plannedPoint,
      intendedSemanticTarget: args.stepConfig.intendedSemanticTarget,
      compactRelationalClaim: buildCompactRelationalClaim(
        args.preObservation.observationId,
        args.stepConfig.intendedSemanticTarget,
        args.stepIndex
      )
    },
    args.requestTimeoutMs,
    args.timings
  );
  const movePayload = parseToolResult(moveResult);
  const move = summarizeMove(movePayload, moveResult.isError === true, plannedPoint);
  const summary: NavigationProbeStepSummary = {
    stepIndex: args.stepIndex,
    stepId: args.stepConfig.stepId ?? `step-${args.stepIndex}`,
    intendedSemanticTarget: args.stepConfig.intendedSemanticTarget,
    relativePlan: {
      fromCursor: args.preObservation.cursorPosition,
      areaOfInterest: args.stepConfig.areaOfInterest,
      vectorToArea:
        args.preObservation.cursorPosition === undefined
          ? undefined
          : {
              x: args.stepConfig.areaOfInterest.x - args.preObservation.cursorPosition.x,
              y: args.stepConfig.areaOfInterest.y - args.preObservation.cursorPosition.y
            },
      fraction,
      plannedPoint
    },
    preObservation: args.preObservation,
    move,
    witnessNotes: args.stepConfig.witnessNotes ?? [],
    residue: []
  };

  if (move.isError || move.actionId === undefined) {
    summary.residue.push("Movement did not execute; no post-movement observation was recorded.");

    return summary;
  }

  if ((args.stepConfig.pauseAfterMoveMs ?? 0) > 0) {
    await delay(args.stepConfig.pauseAfterMoveMs);
  }

  const postObservationResult = await callToolJsonTimed(
    args.client,
    `desktop_observe:step-${args.stepIndex}:post`,
    "desktop_observe",
    {
      sessionId: args.sessionId,
      targetScope: args.targetScope,
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      includeImages: true,
      transitionActionId: move.actionId
    },
    args.requestTimeoutMs,
    args.timings
  );
  const postObservation = summarizeObservation(
    asRecord(postObservationResult.observation, "post observation"),
    args.artifactDirectory,
    args.includeImages,
    `step-${args.stepIndex}-post`
  );

  summary.postObservation = postObservation;
  const assessmentResult = await callToolJsonTimed(
    args.client,
    `desktop_submit_transition_assessment:step-${args.stepIndex}`,
    "desktop_submit_transition_assessment",
    {
      sessionId: args.sessionId,
      actionId: move.actionId,
      assessment: buildSemanticLandingAssessment(args.stepConfig.witnessNotes ?? [])
    },
    args.requestTimeoutMs,
    args.timings
  );

  summary.transitionGate = assessmentResult.transitionGate;
  summary.residue.push("Post-movement observation recorded through transitionActionId.");

  return summary;
}

function buildCompactRelationalClaim(
  sourceObservationId: string,
  intendedTarget: string,
  stepIndex: number
) {
  return {
    sourceObservationId,
    intendedTarget,
    scene: "Governed navigation probe active-window scene.",
    anchor: `navigation step ${stepIndex} cursor origin and area of interest`,
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
      expectedEvidenceSeen: witnessNotes.join("; ") || "navigation witness contradicted the target",
      contradictionSeen: true,
      summary: witnessNotes.join("; ") || "Navigation witness notes contradicted the movement target."
    };
  }

  if (joinedNotes.includes("inconclusive") || joinedNotes.includes("uncertain")) {
    return {
      outcome: "inconclusive",
      relationHeld: false,
      candidateSupported: false,
      rejectedAlternativeAvoided: true,
      expectedEvidenceSeen: witnessNotes.join("; ") || "navigation witness was inconclusive",
      contradictionSeen: false,
      summary: witnessNotes.join("; ") || "Navigation witness notes were inconclusive."
    };
  }

  return {
    outcome: "supported",
    relationHeld: true,
    candidateSupported: true,
    rejectedAlternativeAvoided: true,
    expectedEvidenceSeen: witnessNotes.join("; ") || "navigation probe follow-up remained in the intended target area",
    contradictionSeen: false,
    summary: witnessNotes.join("; ") || "Navigation probe runner treated the configured movement relation as supported."
  };
}

async function observe(args: {
  client: Client;
  sessionId: string;
  targetScope: DesktopInteractionScope;
  artifactDirectory: string;
  includeImages: boolean;
  requestTimeoutMs: number;
  timings: NavigationProbeTiming[];
  artifactPrefix: string;
}): Promise<NavigationObservationSummary> {
  const result = await callToolJsonTimed(
    args.client,
    `desktop_observe:${args.artifactPrefix}`,
    "desktop_observe",
    {
      sessionId: args.sessionId,
      targetScope: args.targetScope,
      mode: "single_frame",
      maxFrames: 1,
      durationMs: 0,
      includeImages: true
    },
    args.requestTimeoutMs,
    args.timings
  );

  return summarizeObservation(
    asRecord(result.observation, "observation"),
    args.artifactDirectory,
    args.includeImages,
    args.artifactPrefix
  );
}

async function readAuditIfPossible(
  client: Client,
  sessionId: string,
  requestTimeoutMs: number,
  timings: NavigationProbeTiming[]
): Promise<{ auditEventCount?: number; stopConditions?: unknown[] }> {
  const audit = await callToolJsonTimed(
    client,
    "desktop_session_audit_log",
    "desktop_session_audit_log",
    { sessionId },
    requestTimeoutMs,
    timings
  );

  return {
    auditEventCount: Array.isArray(audit.auditEvents) ? audit.auditEvents.length : undefined,
    stopConditions: Array.isArray(audit.stopConditions) ? audit.stopConditions : undefined
  };
}

function summarizeObservation(
  observation: Record<string, unknown>,
  artifactDirectory: string,
  includeImages: boolean,
  artifactPrefix: string
): NavigationObservationSummary {
  const observationId = stringField(observation, "observationId");
  const targetScope = asDesktopInteractionScope(observation.targetScope);
  const cursorPosition =
    observation.cursorPosition === undefined
      ? undefined
      : asDesktopPoint(observation.cursorPosition);
  const frames = Array.isArray(observation.frames)
    ? observation.frames.map((frame, index) =>
        summarizeFrame(
          asRecord(frame, "frame"),
          artifactDirectory,
          includeImages,
          artifactPrefix,
          index
        )
      )
    : [];

  return {
    observationId,
    targetScope,
    cursorPosition,
    activeWindow: observation.activeWindow,
    providerTiming: observation.providerTiming,
    frames,
    residue: stringArray(observation.residue)
  };
}

function summarizeFrame(
  frame: Record<string, unknown>,
  artifactDirectory: string,
  includeImages: boolean,
  artifactPrefix: string,
  fallbackIndex: number
): NavigationFrameArtifactSummary {
  const index = numberField(frame, "index", fallbackIndex);
  const summary: NavigationFrameArtifactSummary = {
    index,
    width: numberField(frame, "width", 0),
    height: numberField(frame, "height", 0),
    byteLength: numberField(frame, "byteLength", 0),
    sha256: stringField(frame, "sha256")
  };
  const dataBase64 = typeof frame.dataBase64 === "string" ? frame.dataBase64 : undefined;

  if (includeImages && dataBase64 !== undefined) {
    mkdirSync(artifactDirectory, { recursive: true });
    const imagePath = join(artifactDirectory, `${artifactPrefix}-frame-${index}.png`);
    writeFileSync(imagePath, Buffer.from(dataBase64, "base64"));
    summary.imagePath = imagePath;
  }

  return summary;
}

function summarizeMove(
  payload: Record<string, unknown>,
  isError: boolean,
  plannedPoint: DesktopPoint
): NavigationMoveSummary {
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
    throw new Error("Cursor position is required for relative navigation probe movement.");
  }

  return {
    x: Math.round(current.x + (areaOfInterest.x - current.x) * fraction),
    y: Math.round(current.y + (areaOfInterest.y - current.y) * fraction)
  };
}

async function callToolJsonTimed(
  client: Client,
  operation: string,
  toolName: string,
  args: Record<string, unknown>,
  requestTimeoutMs: number,
  timings: NavigationProbeTiming[]
): Promise<Record<string, unknown>> {
  return parseToolResult(
    await callToolResultTimed(client, operation, toolName, args, requestTimeoutMs, timings)
  );
}

async function callToolResultTimed(
  client: Client,
  operation: string,
  toolName: string,
  args: Record<string, unknown>,
  requestTimeoutMs: number,
  timings: NavigationProbeTiming[]
): Promise<ToolResult> {
  const startedAt = Date.now();

  try {
    const result = await client.callTool(
      {
        name: toolName,
        arguments: args
      },
      undefined,
      {
        timeout: requestTimeoutMs
      }
    );
    const payload = parseToolResult(result);

    timings.push({
      operation,
      durationMs: Date.now() - startedAt,
      isError: result.isError === true,
      status: typeof payload.status === "string" ? payload.status : undefined
    });

    return result;
  } catch (error: unknown) {
    timings.push({
      operation,
      durationMs: Date.now() - startedAt,
      isError: true,
      errorMessage: error instanceof Error ? error.message : "Unknown MCP tool error."
    });

    throw error;
  }
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

function validateConfig(config: GovernedNavigationProbeConfig): void {
  if (!config.userConfirmed) {
    throw new Error("Governed navigation probe requires userConfirmed: true.");
  }

  if (!config.visibleContentAcknowledged) {
    throw new Error("Governed navigation probe requires visibleContentAcknowledged: true.");
  }

  if (config.steps.length === 0) {
    throw new Error("Governed navigation probe requires at least one step.");
  }

  for (const [index, step] of config.steps.entries()) {
    const fraction = step.movementFraction ?? 1;

    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new Error(`steps[${index}].movementFraction must be between 0 and 1.`);
    }

    if (step.pauseAfterMoveMs !== undefined && step.pauseAfterMoveMs < 0) {
      throw new Error(`steps[${index}].pauseAfterMoveMs must be non-negative.`);
    }
  }

  if (config.requestTimeoutMs !== undefined && config.requestTimeoutMs <= 0) {
    throw new Error("requestTimeoutMs must be positive when provided.");
  }
}

function assertRealMovementGate(
  config: GovernedNavigationProbeConfig,
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
