import { z } from "zod";

export const desktopSessionActionTypes = [
  "observe",
  "move_mouse",
  "click",
  "type_text",
  "open_application",
  "open_url",
  "file_operation",
  "credential_entry",
  "payment_or_purchase",
  "send_message",
  "external_publish",
  "destructive_file_operation",
  "shell_command",
  "system_change"
] as const;

export type DesktopSessionActionType = (typeof desktopSessionActionTypes)[number];

export const desktopInteractionScopeKinds = [
  "active_window",
  "window_title",
  "process_name",
  "workspace_path"
] as const;

export const desktopInteractionScopeSchema = z
  .object({
    kind: z.enum(desktopInteractionScopeKinds),
    value: z.string().min(1).optional()
  })
  .superRefine((scope, context) => {
    if (scope.kind !== "active_window" && scope.value === undefined) {
      context.addIssue({
        code: "custom",
        message: `${scope.kind} scope requires a value.`,
        path: ["value"]
      });
    }
  });

export type DesktopInteractionScope = z.infer<typeof desktopInteractionScopeSchema>;

export const desktopSessionRiskLimitsSchema = z.object({
  maxDurationMs: z.number().int().positive().max(60 * 60 * 1000),
  maxActionCount: z.number().int().positive().max(1000),
  maxConsecutiveRepairAttempts: z.number().int().nonnegative().max(100),
  allowCredentialEntry: z.literal(false),
  allowDestructiveFileOperations: z.literal(false),
  allowSystemChanges: z.literal(false),
  allowExternalPublishing: z.literal(false)
});

export type DesktopSessionRiskLimits = z.infer<typeof desktopSessionRiskLimitsSchema>;

export const desktopSessionObservationCadenceSchema = z.object({
  beforeEveryAction: z.literal(true),
  afterEveryStateChangingAction: z.literal(true),
  maxObservationGapMs: z.number().int().positive().max(60_000)
});

export type DesktopSessionObservationCadence = z.infer<
  typeof desktopSessionObservationCadenceSchema
>;

export const desktopInteractionSessionLicenseSchema = z.object({
  sessionId: z.string().min(1),
  userGoal: z.string().min(1),
  userConfirmed: z.boolean(),
  visibleContentAcknowledged: z.boolean(),
  allowedScopes: z.array(desktopInteractionScopeSchema).min(1),
  allowedActions: z.array(z.enum(desktopSessionActionTypes)).min(1),
  forbiddenActions: z.array(z.enum(desktopSessionActionTypes)),
  riskLimits: desktopSessionRiskLimitsSchema,
  observationCadence: desktopSessionObservationCadenceSchema,
  startedAt: z.string().min(1),
  expiresAt: z.string().min(1).optional()
});

export type DesktopInteractionSessionLicense = z.infer<
  typeof desktopInteractionSessionLicenseSchema
>;

export const desktopPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export type DesktopPoint = z.infer<typeof desktopPointSchema>;

export const desktopFrameArtifactSchema = z.object({
  index: z.number().int().nonnegative(),
  capturedAt: z.string().min(1),
  elapsedMs: z.number().int().nonnegative(),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  dataBase64: z.string().optional()
});

export type DesktopFrameArtifact = z.infer<typeof desktopFrameArtifactSchema>;

export const desktopWindowMetadataSchema = z.object({
  title: z.string().optional(),
  processName: z.string().optional(),
  appName: z.string().optional()
});

export type DesktopWindowMetadata = z.infer<typeof desktopWindowMetadataSchema>;

export const desktopObservationPacketSchema = z.object({
  observationId: z.string().min(1),
  sessionId: z.string().min(1),
  observedAt: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  activeWindow: desktopWindowMetadataSchema.optional(),
  cursorPosition: desktopPointSchema.optional(),
  frames: z.array(desktopFrameArtifactSchema).max(12),
  lastActionDeltaSummary: z.string().optional(),
  residue: z.array(z.string())
});

export type DesktopObservationPacket = z.infer<typeof desktopObservationPacketSchema>;

export const desktopActionRiskSchema = z.object({
  credentialExposure: z.boolean(),
  destructive: z.boolean(),
  externalEffect: z.boolean(),
  systemChange: z.boolean(),
  recoverability: z.enum(["high", "medium", "low"])
});

export type DesktopActionRisk = z.infer<typeof desktopActionRiskSchema>;

export const desktopActionInputSchema = z.object({
  point: desktopPointSchema.optional(),
  button: z.enum(["left", "middle", "right"]).optional(),
  textLength: z.number().int().nonnegative().optional()
});

export type DesktopActionInput = z.infer<typeof desktopActionInputSchema>;

export const desktopActionPacketSchema = z.object({
  actionId: z.string().min(1),
  sessionId: z.string().min(1),
  actionType: z.enum(desktopSessionActionTypes),
  requestedAt: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  preActionObservationId: z.string().min(1).optional(),
  postActionObservationId: z.string().min(1).optional(),
  intendedSemanticTarget: z.string().min(1).optional(),
  input: desktopActionInputSchema,
  risk: desktopActionRiskSchema,
  residue: z.array(z.string())
});

export type DesktopActionPacket = z.infer<typeof desktopActionPacketSchema>;

export const desktopSessionAuditEventTypes = [
  "session_started",
  "observation_recorded",
  "action_requested",
  "action_allowed",
  "action_blocked",
  "action_completed",
  "post_action_observed",
  "session_stopped",
  "escalation_required"
] as const;

export const desktopSessionAuditEventSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.enum(desktopSessionAuditEventTypes),
  occurredAt: z.string().min(1),
  actionId: z.string().min(1).optional(),
  observationId: z.string().min(1).optional(),
  summary: z.string().min(1),
  residue: z.array(z.string())
});

export type DesktopSessionAuditEvent = z.infer<typeof desktopSessionAuditEventSchema>;

export const desktopSessionStopConditionTypes = [
  "session_confirmation_required",
  "visible_content_acknowledgement_required",
  "invalid_session",
  "session_expired",
  "max_action_count_reached",
  "max_repair_attempts_reached",
  "outside_allowed_scope",
  "action_not_allowed",
  "forbidden_action",
  "blocked_high_risk_action",
  "missing_pre_action_observation",
  "stale_pre_action_observation",
  "pre_action_observation_scope_mismatch",
  "missing_frame_evidence",
  "missing_post_action_observation",
  "post_action_observation_scope_mismatch",
  "missing_audit_event",
  "low_recoverability"
] as const;

export const desktopSessionStopConditionSchema = z.object({
  condition: z.enum(desktopSessionStopConditionTypes),
  sessionId: z.string().min(1),
  actionId: z.string().min(1).optional(),
  reason: z.string().min(1),
  residue: z.array(z.string())
});

export type DesktopSessionStopCondition = z.infer<
  typeof desktopSessionStopConditionSchema
>;

export type DesktopSessionPolicyDecision =
  | "allow"
  | "requires_session_confirmation"
  | "escalate"
  | "block";

export interface DesktopSessionPolicyResult {
  decision: DesktopSessionPolicyDecision;
  requiresUserConfirmation: boolean;
  requiresPostActionObservation: boolean;
  reasons: string[];
  auditTags: string[];
  stopConditions: DesktopSessionStopCondition[];
  residue: string[];
}

export interface DesktopSessionActionPolicyContext {
  phase: "preflight" | "completion";
  actionCountSoFar: number;
  repairAttemptCount: number;
  auditEvents: DesktopSessionAuditEvent[];
  observations: DesktopObservationPacket[];
  now: string;
}

const hardBlockedActionTypes = new Set<DesktopSessionActionType>([
  "credential_entry",
  "payment_or_purchase",
  "destructive_file_operation",
  "shell_command",
  "system_change"
]);

const stateChangingActionTypes = new Set<DesktopSessionActionType>([
  "move_mouse",
  "click",
  "type_text",
  "open_application",
  "open_url",
  "file_operation"
]);

function stopCondition(
  condition: DesktopSessionStopCondition["condition"],
  sessionId: string,
  reason: string,
  actionId?: string,
  residue: string[] = []
): DesktopSessionStopCondition {
  return {
    condition,
    sessionId,
    actionId,
    reason,
    residue
  };
}

function result(
  decision: DesktopSessionPolicyDecision,
  reasons: string[],
  auditTags: string[],
  stopConditions: DesktopSessionStopCondition[] = [],
  residue: string[] = [],
  requiresPostActionObservation = false
): DesktopSessionPolicyResult {
  return {
    decision,
    requiresUserConfirmation: decision === "requires_session_confirmation",
    requiresPostActionObservation,
    reasons,
    auditTags,
    stopConditions,
    residue
  };
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function scopeMatches(
  allowedScope: DesktopInteractionScope,
  targetScope: DesktopInteractionScope
): boolean {
  if (allowedScope.kind !== targetScope.kind) {
    return false;
  }

  if (allowedScope.kind === "active_window") {
    const allowedWindowIdentity = normalize(allowedScope.value);
    const targetWindowIdentity = normalize(targetScope.value);

    return allowedWindowIdentity.length === 0
      ? true
      : targetWindowIdentity === allowedWindowIdentity;
  }

  if (allowedScope.kind === "workspace_path") {
    const allowedPath = normalize(allowedScope.value);
    const targetPath = normalize(targetScope.value);
    return targetPath === allowedPath || targetPath.startsWith(`${allowedPath}\\`);
  }

  return normalize(allowedScope.value) === normalize(targetScope.value);
}

export function isDesktopInteractionScopeAllowed(
  license: DesktopInteractionSessionLicense,
  targetScope: DesktopInteractionScope
): boolean {
  return license.allowedScopes.some((allowedScope) => scopeMatches(allowedScope, targetScope));
}

function hasRequiredAuditEvent(
  action: DesktopActionPacket,
  auditEvents: DesktopSessionAuditEvent[]
): boolean {
  return auditEvents.some(
    (event) =>
      event.sessionId === action.sessionId &&
      event.actionId === action.actionId &&
      event.eventType === "action_requested"
  );
}

function isExpired(license: DesktopInteractionSessionLicense, now: string): boolean {
  const nowMs = Date.parse(now);
  const startedMs = Date.parse(license.startedAt);
  const expiresMs = license.expiresAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(license.expiresAt);

  if (Number.isNaN(nowMs) || Number.isNaN(startedMs)) {
    return false;
  }

  return nowMs - startedMs > license.riskLimits.maxDurationMs || nowMs >= expiresMs;
}

function isObservationFresh(
  license: DesktopInteractionSessionLicense,
  observation: DesktopObservationPacket,
  action: DesktopActionPacket
): boolean {
  const observedMs = Date.parse(observation.observedAt);
  const requestedMs = Date.parse(action.requestedAt);

  if (Number.isNaN(observedMs) || Number.isNaN(requestedMs)) {
    return true;
  }

  return requestedMs - observedMs <= license.observationCadence.maxObservationGapMs;
}

function findObservation(
  observations: DesktopObservationPacket[],
  observationId: string | undefined
): DesktopObservationPacket | undefined {
  return observations.find((observation) => observation.observationId === observationId);
}

function postActionObservationReason(actionType: DesktopSessionActionType): string {
  if (actionType === "move_mouse") {
    return "Mouse movement is a probe and requires post-movement observation before the next non-observe action.";
  }

  if (actionType === "click" || actionType === "type_text") {
    return "Clicking and typing require post-action observation before success can be claimed.";
  }

  return "State-changing actions require post-action observation before the next non-observe action.";
}

export function evaluateSessionStartPolicy(
  license: DesktopInteractionSessionLicense
): DesktopSessionPolicyResult {
  const auditTags = ["desktop_interaction_session"];
  const stopConditions: DesktopSessionStopCondition[] = [];

  if (license.userGoal.trim().length === 0) {
    stopConditions.push(
      stopCondition(
        "invalid_session",
        license.sessionId,
        "A desktop interaction session requires a concrete user goal."
      )
    );
  }

  if (license.allowedScopes.length === 0) {
    stopConditions.push(
      stopCondition(
        "invalid_session",
        license.sessionId,
        "A desktop interaction session requires at least one allowed scope."
      )
    );
  }

  if (stopConditions.length > 0) {
    return result(
      "block",
      stopConditions.map((condition) => condition.reason),
      [...auditTags, "invalid_session"],
      stopConditions
    );
  }

  if (!license.userConfirmed) {
    const stop = stopCondition(
      "session_confirmation_required",
      license.sessionId,
      "User confirmation is required before a desktop interaction session can start."
    );

    return result(
      "requires_session_confirmation",
      [stop.reason],
      [...auditTags, "session_confirmation_required"],
      [stop]
    );
  }

  if (!license.visibleContentAcknowledged) {
    const stop = stopCondition(
      "visible_content_acknowledgement_required",
      license.sessionId,
      "The user must acknowledge that visible desktop content may be captured during observation."
    );

    return result(
      "requires_session_confirmation",
      [stop.reason],
      [...auditTags, "visible_content_acknowledgement_required"],
      [stop]
    );
  }

  return result(
    "allow",
    ["The user granted a bounded desktop interaction session license."],
    [...auditTags, "session_license_active"]
  );
}

export function evaluateSessionActionPolicy(
  license: DesktopInteractionSessionLicense,
  action: DesktopActionPacket,
  context: DesktopSessionActionPolicyContext
): DesktopSessionPolicyResult {
  const sessionStart = evaluateSessionStartPolicy(license);
  const auditTags = ["desktop_interaction_session", action.actionType];

  if (sessionStart.decision !== "allow") {
    return {
      ...sessionStart,
      auditTags: [...sessionStart.auditTags, "session_not_licensed"]
    };
  }

  if (action.sessionId !== license.sessionId) {
    const stop = stopCondition(
      "invalid_session",
      license.sessionId,
      "Action session id does not match the active session license.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "session_mismatch"], [stop]);
  }

  if (hardBlockedActionTypes.has(action.actionType)) {
    const stop = stopCondition(
      "blocked_high_risk_action",
      license.sessionId,
      `${action.actionType} is blocked even inside a desktop interaction session.`,
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "blocked_high_risk_action"], [stop]);
  }

  if (license.forbiddenActions.includes(action.actionType)) {
    const stop = stopCondition(
      "forbidden_action",
      license.sessionId,
      `${action.actionType} is explicitly forbidden by the session license.`,
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "forbidden_action"], [stop]);
  }

  if (isExpired(license, context.now)) {
    const stop = stopCondition(
      "session_expired",
      license.sessionId,
      "The desktop interaction session duration limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "session_expired"], [stop]);
  }

  if (context.actionCountSoFar >= license.riskLimits.maxActionCount) {
    const stop = stopCondition(
      "max_action_count_reached",
      license.sessionId,
      "The desktop interaction session action-count limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "max_action_count_reached"], [stop]);
  }

  if (context.repairAttemptCount > license.riskLimits.maxConsecutiveRepairAttempts) {
    const stop = stopCondition(
      "max_repair_attempts_reached",
      license.sessionId,
      "The desktop interaction session repair-attempt limit has been reached.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "max_repair_attempts_reached"], [stop]);
  }

  if (!license.allowedActions.includes(action.actionType)) {
    const stop = stopCondition(
      "action_not_allowed",
      license.sessionId,
      `${action.actionType} is not allowed by the session license.`,
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "action_not_allowed"], [stop]);
  }

  if (!isDesktopInteractionScopeAllowed(license, action.targetScope)) {
    const stop = stopCondition(
      "outside_allowed_scope",
      license.sessionId,
      "The requested action target is outside the session's allowed scope.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "outside_allowed_scope"], [stop]);
  }

  if (action.risk.credentialExposure || action.risk.destructive || action.risk.systemChange) {
    const stop = stopCondition(
      "blocked_high_risk_action",
      license.sessionId,
      "The action carries credential, destructive, or system-change risk and is blocked.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "blocked_high_risk_action"], [stop]);
  }

  if (action.risk.externalEffect || action.actionType === "external_publish" || action.actionType === "send_message") {
    const stop = stopCondition(
      "action_not_allowed",
      license.sessionId,
      "External side effects require escalation outside this session license.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "external_effect"], [stop]);
  }

  if (action.risk.recoverability === "low") {
    const stop = stopCondition(
      "low_recoverability",
      license.sessionId,
      "The requested action has low recoverability and requires escalation.",
      action.actionId
    );

    return result("escalate", [stop.reason], [...auditTags, "low_recoverability"], [stop]);
  }

  if (!hasRequiredAuditEvent(action, context.auditEvents)) {
    const stop = stopCondition(
      "missing_audit_event",
      license.sessionId,
      "Every in-session action must have an action_requested audit event before execution.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "missing_audit_event"], [stop]);
  }

  const isStateChangingAction = stateChangingActionTypes.has(action.actionType);

  if (isStateChangingAction && action.preActionObservationId === undefined) {
    const stop = stopCondition(
      "missing_pre_action_observation",
      license.sessionId,
      "Every state-changing in-session action must reference a pre-action observation.",
      action.actionId
    );

    return result("block", [stop.reason], [...auditTags, "missing_pre_action_observation"], [stop]);
  }

  if (isStateChangingAction) {
    const preActionObservation = findObservation(
      context.observations,
      action.preActionObservationId
    );

    if (preActionObservation === undefined) {
      const stop = stopCondition(
        "missing_pre_action_observation",
        license.sessionId,
        "The referenced pre-action observation does not exist in the session context.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "missing_pre_action_observation"], [stop]);
    }

    if (preActionObservation.sessionId !== license.sessionId) {
      const stop = stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced pre-action observation belongs to a different session.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "observation_session_mismatch"], [stop]);
    }

    if (!scopeMatches(preActionObservation.targetScope, action.targetScope)) {
      const stop = stopCondition(
        "pre_action_observation_scope_mismatch",
        license.sessionId,
        "The referenced pre-action observation does not match the action target scope.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "pre_action_observation_scope_mismatch"],
        [stop]
      );
    }

    if (!isObservationFresh(license, preActionObservation, action)) {
      const stop = stopCondition(
        "stale_pre_action_observation",
        license.sessionId,
        "The referenced pre-action observation is older than the session observation cadence allows.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "stale_pre_action_observation"], [stop]);
    }

    if (preActionObservation.frames.length === 0) {
      const stop = stopCondition(
        "missing_frame_evidence",
        license.sessionId,
        "The referenced pre-action observation contains no frame evidence.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "missing_frame_evidence"], [stop]);
    }
  }

  const requiresPostActionObservation = isStateChangingAction;

  if (
    context.phase === "completion" &&
    requiresPostActionObservation &&
    action.postActionObservationId === undefined
  ) {
    const stop = stopCondition(
      "missing_post_action_observation",
      license.sessionId,
      postActionObservationReason(action.actionType),
      action.actionId
    );

    return result(
      "block",
      [stop.reason],
      [...auditTags, "missing_post_action_observation"],
      [stop],
      [],
      true
    );
  }

  if (context.phase === "completion" && requiresPostActionObservation) {
    const postActionObservation = findObservation(
      context.observations,
      action.postActionObservationId
    );

    if (postActionObservation === undefined) {
      const stop = stopCondition(
        "missing_post_action_observation",
        license.sessionId,
        "The referenced post-action observation does not exist in the session context.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "missing_post_action_observation"],
        [stop],
        [],
        true
      );
    }

    if (postActionObservation.sessionId !== license.sessionId) {
      const stop = stopCondition(
        "invalid_session",
        license.sessionId,
        "The referenced post-action observation belongs to a different session.",
        action.actionId
      );

      return result("block", [stop.reason], [...auditTags, "observation_session_mismatch"], [stop]);
    }

    if (!scopeMatches(postActionObservation.targetScope, action.targetScope)) {
      const stop = stopCondition(
        "post_action_observation_scope_mismatch",
        license.sessionId,
        "The referenced post-action observation does not match the action target scope.",
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "post_action_observation_scope_mismatch"],
        [stop],
        [],
        true
      );
    }
  }

  return result(
    "allow",
    ["The action is licensed by the active desktop interaction session."],
    [...auditTags, "session_action_licensed"],
    [],
    action.residue,
    requiresPostActionObservation
  );
}
