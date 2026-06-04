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
  "observed_window_identity",
  "window_title",
  "process_name",
  "workspace_path",
  "local_url",
  "local_origin"
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

export const desktopAppForbiddenBoundaryTypes = [
  "credential_or_secret_prompt",
  "payment_or_purchase",
  "external_message_or_email",
  "external_publish_or_deploy",
  "destructive_operation",
  "system_settings",
  "unrelated_private_window",
  "scope_exit",
  "low_recoverability",
  "uninterpretable_state"
] as const;

export const desktopLicensedAppActionTypes = [
  "observe",
  "move_mouse",
  "click",
  "type_text"
] as const;

export type DesktopLicensedAppActionType = (typeof desktopLicensedAppActionTypes)[number];

export const desktopLicensedAppScopeExitStopConditions = [
  "outside_allowed_scope",
  "pre_action_observation_scope_mismatch",
  "post_action_observation_scope_mismatch"
] as const;

export const desktopLicensedAppScopeSchema = z.object({
  scopeId: z.string().min(1).optional(),
  description: z.string().min(1).max(1000),
  scope: desktopInteractionScopeSchema,
  userDeclaredReversible: z.boolean(),
  allowedActions: z.array(z.enum(desktopLicensedAppActionTypes)).min(1),
  forbiddenBoundaries: z.array(z.enum(desktopAppForbiddenBoundaryTypes)),
  scopeExitStopConditions: z
    .array(z.enum(desktopLicensedAppScopeExitStopConditions))
    .min(1)
    .default(["outside_allowed_scope"])
});

export type DesktopLicensedAppScope = z.infer<typeof desktopLicensedAppScopeSchema>;

export const desktopInteractionSessionLicenseSchema = z.object({
  sessionId: z.string().min(1),
  userGoal: z.string().min(1),
  userConfirmed: z.boolean(),
  visibleContentAcknowledged: z.boolean(),
  allowedScopes: z.array(desktopInteractionScopeSchema).min(1),
  allowedActions: z.array(z.enum(desktopSessionActionTypes)).min(1),
  forbiddenActions: z.array(z.enum(desktopSessionActionTypes)),
  licensedAppScope: desktopLicensedAppScopeSchema.optional(),
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

export const desktopRectangleSchema = z.object({
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export type DesktopRectangle = z.infer<typeof desktopRectangleSchema>;

export const desktopFrameArtifactSchema = z.object({
  index: z.number().int().nonnegative(),
  capturedAt: z.string().min(1),
  elapsedMs: z.number().int().nonnegative(),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  witness: z
    .object({
      pixelSource: z.enum(["raw", "cursor_annotated"]),
      cursorRenderedIntoFrame: z.boolean(),
      nativeCursorRenderedIntoFrame: z.boolean().optional(),
      witnessMarkerRenderedIntoFrame: z.boolean().optional(),
      cursorRenderingMethod: z.string().min(1).optional(),
      cursorFramePosition: desktopPointSchema.optional(),
      cursorHotspot: desktopPointSchema.optional(),
      residue: z.array(z.string())
    })
    .optional(),
  dataBase64: z.string().optional()
});

export type DesktopFrameArtifact = z.infer<typeof desktopFrameArtifactSchema>;

export const desktopWindowMetadataSchema = z.object({
  windowId: z.string().optional(),
  title: z.string().optional(),
  processName: z.string().optional(),
  appName: z.string().optional(),
  bounds: desktopRectangleSchema.optional()
});

export type DesktopWindowMetadata = z.infer<typeof desktopWindowMetadataSchema>;

export const desktopCursorWitnessSchema = z.object({
  status: z.enum(["observed", "unavailable"]),
  visible: z.boolean().optional(),
  position: desktopPointSchema.optional(),
  coordinateSpace: z.enum(["active_window_frame", "screen", "unknown"]),
  providerSource: z.string().min(1),
  observedAt: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  renderedIntoFrame: z.boolean(),
  nativeCursorRenderedIntoFrame: z.boolean().optional(),
  witnessMarkerRenderedIntoFrame: z.boolean().optional(),
  renderingMethod: z.string().min(1).optional(),
  residue: z.array(z.string())
});

export type DesktopCursorWitness = z.infer<typeof desktopCursorWitnessSchema>;

export const desktopHoverWitnessSchema = z.object({
  evaluated: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  signals: z.array(z.string()),
  residue: z.array(z.string())
});

export type DesktopHoverWitness = z.infer<typeof desktopHoverWitnessSchema>;

export const desktopProviderTimingEntrySchema = z.object({
  operation: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["completed", "failed", "skipped"]),
  residue: z.array(z.string())
});

export type DesktopProviderTimingEntry = z.infer<typeof desktopProviderTimingEntrySchema>;

export const desktopProviderTimingDiagnosticsSchema = z.object({
  providerName: z.string().min(1),
  providerKind: z.enum(["mock", "real"]),
  totalDurationMs: z.number().int().nonnegative(),
  entries: z.array(desktopProviderTimingEntrySchema),
  residue: z.array(z.string())
});

export type DesktopProviderTimingDiagnostics = z.infer<
  typeof desktopProviderTimingDiagnosticsSchema
>;

export const desktopObservationPacketSchema = z.object({
  observationId: z.string().min(1),
  sessionId: z.string().min(1),
  observedAt: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  activeWindow: desktopWindowMetadataSchema.optional(),
  cursorPosition: desktopPointSchema.optional(),
  cursorWitness: desktopCursorWitnessSchema.optional(),
  hoverWitness: desktopHoverWitnessSchema.optional(),
  providerTiming: desktopProviderTimingDiagnosticsSchema.optional(),
  frames: z.array(desktopFrameArtifactSchema).max(12),
  lastActionDeltaSummary: z.string().optional(),
  residue: z.array(z.string())
});

export type DesktopObservationPacket = z.infer<typeof desktopObservationPacketSchema>;

export const desktopAppScopeBindingSchema = z.object({
  bindingId: z.string().min(1),
  sessionId: z.string().min(1),
  licensedScope: desktopInteractionScopeSchema,
  boundScope: desktopInteractionScopeSchema,
  boundAt: z.string().min(1),
  observationId: z.string().min(1),
  activeWindow: desktopWindowMetadataSchema.optional(),
  observedWindowIdentity: z.string().min(1).optional(),
  residue: z.array(z.string())
});

export type DesktopAppScopeBinding = z.infer<typeof desktopAppScopeBindingSchema>;

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
  "app_scope_bound",
  "click_candidate_evaluated",
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
  "licensed_app_scope_required",
  "app_scope_binding_required",
  "app_scope_binding_stale",
  "user_reversibility_declaration_required",
  "forbidden_boundary_declaration_required",
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
  boundAppScope?: DesktopAppScopeBinding;
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

const appScopedActionTypes = new Set<DesktopLicensedAppActionType>([
  "click",
  "type_text"
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

export function observedWindowIdentity(
  activeWindow: DesktopWindowMetadata | undefined
): string | undefined {
  if (activeWindow?.windowId !== undefined && activeWindow.windowId.trim().length > 0) {
    return activeWindow.windowId;
  }

  const parts = [activeWindow?.processName, activeWindow?.title].filter(
    (part): part is string => part !== undefined && part.trim().length > 0
  );

  return parts.length === 0 ? undefined : parts.join(":");
}

function appScopedActionsRequested(
  license: DesktopInteractionSessionLicense
): DesktopLicensedAppActionType[] {
  return license.allowedActions.filter(
    (actionType): actionType is DesktopLicensedAppActionType =>
      appScopedActionTypes.has(actionType as DesktopLicensedAppActionType)
  );
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

export function desktopInteractionScopesMatch(
  firstScope: DesktopInteractionScope,
  secondScope: DesktopInteractionScope
): boolean {
  return scopeMatches(firstScope, secondScope);
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

function isAppScopeBindingFresh(
  binding: DesktopAppScopeBinding,
  now: string,
  maxObservationGapMs: number
): boolean {
  const boundMs = Date.parse(binding.boundAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(boundMs) || Number.isNaN(nowMs)) {
    return true;
  }

  return nowMs - boundMs <= maxObservationGapMs;
}

function observationMatchesBoundAppScope(
  binding: DesktopAppScopeBinding,
  observation: DesktopObservationPacket
): boolean {
  const observationIdentity = observedWindowIdentity(observation.activeWindow);

  if (
    binding.observedWindowIdentity !== undefined &&
    observationIdentity !== undefined
  ) {
    return normalize(binding.observedWindowIdentity) === normalize(observationIdentity);
  }

  return scopeMatches(binding.boundScope, observation.targetScope);
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

  const requestedAppScopedActions = appScopedActionsRequested(license);

  if (requestedAppScopedActions.length > 0 && license.licensedAppScope === undefined) {
    const stop = stopCondition(
      "licensed_app_scope_required",
      license.sessionId,
      "Click and type_text session permissions require a user-declared reversible app-under-test scope."
    );

    return result(
      "block",
      [stop.reason],
      [...auditTags, "licensed_app_scope_required"],
      [stop],
      [
        "Declare licensedAppScope before granting click or type_text permissions.",
        "This does not enable real click or typing; it scopes future app-under-test authority."
      ]
    );
  }

  if (license.licensedAppScope !== undefined) {
    const appScope = license.licensedAppScope;
    const appScopeStops: DesktopSessionStopCondition[] = [];

    if (!appScope.userDeclaredReversible) {
      appScopeStops.push(
        stopCondition(
          "user_reversibility_declaration_required",
          license.sessionId,
          "The user must declare that the licensed app-under-test is reversible and safe for the requested UI testing task."
        )
      );
    }

    if (appScope.forbiddenBoundaries.length === 0) {
      appScopeStops.push(
        stopCondition(
          "forbidden_boundary_declaration_required",
          license.sessionId,
          "The licensed app-under-test scope must declare forbidden boundaries."
        )
      );
    }

    if (!isDesktopInteractionScopeAllowed(license, appScope.scope)) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          "The licensed app-under-test scope must be inside the session's allowed scopes."
        )
      );
    }

    const missingAppPermissions = requestedAppScopedActions.filter(
      (actionType) => !appScope.allowedActions.includes(actionType)
    );

    if (missingAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          `The licensed app-under-test scope does not grant requested action(s): ${missingAppPermissions.join(", ")}.`
        )
      );
    }

    const unlicensedAppPermissions = appScope.allowedActions.filter(
      (actionType) => !license.allowedActions.includes(actionType)
    );

    if (unlicensedAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "invalid_session",
          license.sessionId,
          `The licensed app-under-test scope grants action(s) not allowed by the session: ${unlicensedAppPermissions.join(", ")}.`
        )
      );
    }

    const forbiddenAppPermissions = appScope.allowedActions.filter((actionType) =>
      license.forbiddenActions.includes(actionType)
    );

    if (forbiddenAppPermissions.length > 0) {
      appScopeStops.push(
        stopCondition(
          "forbidden_action",
          license.sessionId,
          `The licensed app-under-test scope grants action(s) forbidden by the session: ${forbiddenAppPermissions.join(", ")}.`
        )
      );
    }

    if (appScopeStops.length > 0) {
      return result(
        "block",
        appScopeStops.map((condition) => condition.reason),
        [...auditTags, "licensed_app_scope_invalid"],
        appScopeStops,
        [
          "The session was not started.",
          "No desktop observation, mouse movement, click, typing, or OS mutation occurred."
        ]
      );
    }
  }

  return result(
    "allow",
    ["The user granted a bounded desktop interaction session license."],
    [
      ...auditTags,
      "session_license_active",
      ...(license.licensedAppScope === undefined ? [] : ["licensed_app_scope_declared"])
    ]
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

  if (appScopedActionTypes.has(action.actionType as DesktopLicensedAppActionType)) {
    const appScopedActionType = action.actionType as DesktopLicensedAppActionType;

    if (license.licensedAppScope === undefined) {
      const stop = stopCondition(
        "licensed_app_scope_required",
        license.sessionId,
        `${action.actionType} requires a declared reversible app-under-test scope.`,
        action.actionId
      );

      return result(
        "block",
        [stop.reason],
        [...auditTags, "licensed_app_scope_required"],
        [stop]
      );
    }

    if (!license.licensedAppScope.allowedActions.includes(appScopedActionType)) {
      const stop = stopCondition(
        "action_not_allowed",
        license.sessionId,
        `${action.actionType} is not allowed by the licensed app-under-test scope.`,
        action.actionId
      );

      return result("escalate", [stop.reason], [...auditTags, "app_scope_action_not_allowed"], [stop]);
    }

    if (!desktopInteractionScopesMatch(license.licensedAppScope.scope, action.targetScope)) {
      const stop = stopCondition(
        "outside_allowed_scope",
        license.sessionId,
        "The requested action target is outside the licensed app-under-test scope.",
        action.actionId
      );

      return result(
        "escalate",
        [stop.reason],
        [...auditTags, "outside_allowed_scope", "outside_licensed_app_scope"],
        [stop]
      );
    }
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

    if (appScopedActionTypes.has(action.actionType as DesktopLicensedAppActionType)) {
      if (context.boundAppScope === undefined) {
        const stop = stopCondition(
          "app_scope_binding_required",
          license.sessionId,
          `${action.actionType} requires the licensed app-under-test scope to be bound to an observation before execution.`,
          action.actionId
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "app_scope_binding_required"],
          [stop]
        );
      }

      if (
        !isAppScopeBindingFresh(
          context.boundAppScope,
          context.now,
          license.observationCadence.maxObservationGapMs
        )
      ) {
        const stop = stopCondition(
          "app_scope_binding_stale",
          license.sessionId,
          "The licensed app-under-test binding is older than the session observation cadence allows.",
          action.actionId
        );

        return result(
          "block",
          [stop.reason],
          [...auditTags, "app_scope_binding_stale"],
          [stop]
        );
      }

      if (!observationMatchesBoundAppScope(context.boundAppScope, preActionObservation)) {
        const stop = stopCondition(
          "outside_allowed_scope",
          license.sessionId,
          "The referenced pre-action observation does not match the bound app-under-test identity.",
          action.actionId
        );

        return result(
          "escalate",
          [stop.reason],
          [...auditTags, "outside_allowed_scope", "bound_app_scope_mismatch"],
          [stop]
        );
      }
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
