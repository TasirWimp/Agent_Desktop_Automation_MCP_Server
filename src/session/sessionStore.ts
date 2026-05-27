import {
  type DesktopActionPacket,
  type DesktopInteractionSessionLicense,
  type DesktopObservationPacket,
  type DesktopSessionActionPolicyContext,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition,
  desktopActionPacketSchema,
  desktopInteractionSessionLicenseSchema,
  desktopObservationPacketSchema,
  desktopSessionAuditEventSchema,
  desktopSessionStopConditionSchema,
  evaluateSessionStartPolicy
} from "../policy/sessionLicensePolicy.js";

export type DesktopSessionStatus = "active" | "ended";

export type SessionStoreErrorCode =
  | "session_already_exists"
  | "session_not_found"
  | "session_inactive"
  | "session_policy_rejected"
  | "session_id_mismatch"
  | "audit_event_already_exists"
  | "observation_already_exists"
  | "action_already_exists"
  | "action_count_limit_reached"
  | "repair_attempt_limit_reached";

export class SessionStoreError extends Error {
  constructor(
    public readonly code: SessionStoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SessionStoreError";
  }
}

export interface DesktopSessionSnapshot {
  sessionId: string;
  status: DesktopSessionStatus;
  license: DesktopInteractionSessionLicense;
  createdAt: string;
  endedAt?: string;
  endReason?: string;
  actionCount: number;
  repairAttemptCount: number;
  auditEvents: DesktopSessionAuditEvent[];
  observations: DesktopObservationPacket[];
  actions: DesktopActionPacket[];
  stopConditions: DesktopSessionStopCondition[];
}

export interface CreateSessionOptions {
  initialAuditEvent?: DesktopSessionAuditEvent;
}

export interface ActionPolicyContextOptions {
  now: string;
  phase: DesktopSessionActionPolicyContext["phase"];
}

interface DesktopSessionEntry {
  sessionId: string;
  status: DesktopSessionStatus;
  license: DesktopInteractionSessionLicense;
  createdAt: string;
  endedAt?: string;
  endReason?: string;
  actionCount: number;
  repairAttemptCount: number;
  auditEvents: DesktopSessionAuditEvent[];
  observations: Map<string, DesktopObservationPacket>;
  actions: Map<string, DesktopActionPacket>;
  stopConditions: DesktopSessionStopCondition[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertSameSession(
  actualSessionId: string,
  expectedSessionId: string,
  entityName: string
): void {
  if (actualSessionId !== expectedSessionId) {
    throw new SessionStoreError(
      "session_id_mismatch",
      `${entityName} belongs to session ${actualSessionId}, not ${expectedSessionId}.`
    );
  }
}

function snapshotFromEntry(entry: DesktopSessionEntry): DesktopSessionSnapshot {
  return {
    sessionId: entry.sessionId,
    status: entry.status,
    license: clone(entry.license),
    createdAt: entry.createdAt,
    endedAt: entry.endedAt,
    endReason: entry.endReason,
    actionCount: entry.actionCount,
    repairAttemptCount: entry.repairAttemptCount,
    auditEvents: clone(entry.auditEvents),
    observations: clone([...entry.observations.values()]),
    actions: clone([...entry.actions.values()]),
    stopConditions: clone(entry.stopConditions)
  };
}

export class InMemoryDesktopSessionStore {
  private readonly sessions = new Map<string, DesktopSessionEntry>();

  createSession(
    licenseInput: DesktopInteractionSessionLicense,
    options: CreateSessionOptions = {}
  ): DesktopSessionSnapshot {
    const license = desktopInteractionSessionLicenseSchema.parse(licenseInput);

    if (this.sessions.has(license.sessionId)) {
      throw new SessionStoreError(
        "session_already_exists",
        `Session ${license.sessionId} already exists.`
      );
    }

    const startPolicy = evaluateSessionStartPolicy(license);

    if (startPolicy.decision !== "allow") {
      throw new SessionStoreError(
        "session_policy_rejected",
        startPolicy.reasons.join(" ")
      );
    }

    const entry: DesktopSessionEntry = {
      sessionId: license.sessionId,
      status: "active",
      license: clone(license),
      createdAt: license.startedAt,
      actionCount: 0,
      repairAttemptCount: 0,
      auditEvents: [],
      observations: new Map(),
      actions: new Map(),
      stopConditions: []
    };

    if (options.initialAuditEvent !== undefined) {
      const initialAuditEvent = desktopSessionAuditEventSchema.parse(options.initialAuditEvent);
      assertSameSession(initialAuditEvent.sessionId, license.sessionId, "Audit event");
      entry.auditEvents.push(clone(initialAuditEvent));
    }

    this.sessions.set(license.sessionId, entry);

    return snapshotFromEntry(entry);
  }

  getSession(sessionId: string): DesktopSessionSnapshot | undefined {
    const entry = this.sessions.get(sessionId);
    return entry === undefined ? undefined : snapshotFromEntry(entry);
  }

  requireActiveSession(sessionId: string): DesktopSessionSnapshot {
    return snapshotFromEntry(this.requireActiveEntry(sessionId));
  }

  endSession(
    sessionId: string,
    stopAuditEventInput: DesktopSessionAuditEvent
  ): DesktopSessionSnapshot {
    const entry = this.requireActiveEntry(sessionId);
    const stopAuditEvent = desktopSessionAuditEventSchema.parse(stopAuditEventInput);
    assertSameSession(stopAuditEvent.sessionId, sessionId, "Audit event");

    if (entry.auditEvents.some((event) => event.eventId === stopAuditEvent.eventId)) {
      throw new SessionStoreError(
        "audit_event_already_exists",
        `Audit event ${stopAuditEvent.eventId} already exists.`
      );
    }

    entry.auditEvents.push(clone(stopAuditEvent));
    entry.status = "ended";
    entry.endedAt = stopAuditEvent.occurredAt;
    entry.endReason = stopAuditEvent.summary;

    return snapshotFromEntry(entry);
  }

  appendAuditEvent(auditEventInput: DesktopSessionAuditEvent): DesktopSessionAuditEvent[] {
    const auditEvent = desktopSessionAuditEventSchema.parse(auditEventInput);
    const entry = this.requireActiveEntry(auditEvent.sessionId);

    if (entry.auditEvents.some((event) => event.eventId === auditEvent.eventId)) {
      throw new SessionStoreError(
        "audit_event_already_exists",
        `Audit event ${auditEvent.eventId} already exists.`
      );
    }

    entry.auditEvents.push(clone(auditEvent));

    return clone(entry.auditEvents);
  }

  listAuditEvents(sessionId: string): DesktopSessionAuditEvent[] {
    return clone(this.requireEntry(sessionId).auditEvents);
  }

  recordObservation(
    observationInput: DesktopObservationPacket
  ): DesktopObservationPacket {
    const observation = desktopObservationPacketSchema.parse(observationInput);
    const entry = this.requireActiveEntry(observation.sessionId);

    if (entry.observations.has(observation.observationId)) {
      throw new SessionStoreError(
        "observation_already_exists",
        `Observation ${observation.observationId} already exists.`
      );
    }

    entry.observations.set(observation.observationId, clone(observation));

    return clone(observation);
  }

  getObservation(
    sessionId: string,
    observationId: string
  ): DesktopObservationPacket | undefined {
    const observation = this.requireEntry(sessionId).observations.get(observationId);
    return observation === undefined ? undefined : clone(observation);
  }

  listObservations(sessionId: string): DesktopObservationPacket[] {
    return clone([...this.requireEntry(sessionId).observations.values()]);
  }

  recordAction(actionInput: DesktopActionPacket): DesktopActionPacket {
    const action = desktopActionPacketSchema.parse(actionInput);
    const entry = this.requireActiveEntry(action.sessionId);

    if (entry.actions.has(action.actionId)) {
      throw new SessionStoreError(
        "action_already_exists",
        `Action ${action.actionId} already exists.`
      );
    }

    entry.actions.set(action.actionId, clone(action));

    return clone(action);
  }

  getAction(sessionId: string, actionId: string): DesktopActionPacket | undefined {
    const action = this.requireEntry(sessionId).actions.get(actionId);
    return action === undefined ? undefined : clone(action);
  }

  listActions(sessionId: string): DesktopActionPacket[] {
    return clone([...this.requireEntry(sessionId).actions.values()]);
  }

  incrementActionCount(sessionId: string): number {
    const entry = this.requireActiveEntry(sessionId);

    if (entry.actionCount >= entry.license.riskLimits.maxActionCount) {
      throw new SessionStoreError(
        "action_count_limit_reached",
        `Session ${sessionId} reached its action-count limit.`
      );
    }

    entry.actionCount += 1;
    return entry.actionCount;
  }

  incrementRepairAttemptCount(sessionId: string): number {
    const entry = this.requireActiveEntry(sessionId);

    if (
      entry.repairAttemptCount >=
      entry.license.riskLimits.maxConsecutiveRepairAttempts
    ) {
      throw new SessionStoreError(
        "repair_attempt_limit_reached",
        `Session ${sessionId} reached its repair-attempt limit.`
      );
    }

    entry.repairAttemptCount += 1;
    return entry.repairAttemptCount;
  }

  resetRepairAttemptCount(sessionId: string): number {
    const entry = this.requireActiveEntry(sessionId);
    entry.repairAttemptCount = 0;
    return entry.repairAttemptCount;
  }

  appendStopCondition(
    stopConditionInput: DesktopSessionStopCondition
  ): DesktopSessionStopCondition[] {
    const stopCondition = desktopSessionStopConditionSchema.parse(stopConditionInput);
    const entry = this.requireActiveEntry(stopCondition.sessionId);
    entry.stopConditions.push(clone(stopCondition));

    return clone(entry.stopConditions);
  }

  getActionPolicyContext(
    sessionId: string,
    options: ActionPolicyContextOptions
  ): DesktopSessionActionPolicyContext {
    const entry = this.requireActiveEntry(sessionId);

    return {
      phase: options.phase,
      actionCountSoFar: entry.actionCount,
      repairAttemptCount: entry.repairAttemptCount,
      auditEvents: clone(entry.auditEvents),
      observations: clone([...entry.observations.values()]),
      now: options.now
    };
  }

  private requireEntry(sessionId: string): DesktopSessionEntry {
    const entry = this.sessions.get(sessionId);

    if (entry === undefined) {
      throw new SessionStoreError(
        "session_not_found",
        `Session ${sessionId} does not exist.`
      );
    }

    return entry;
  }

  private requireActiveEntry(sessionId: string): DesktopSessionEntry {
    const entry = this.requireEntry(sessionId);

    if (entry.status !== "active") {
      throw new SessionStoreError(
        "session_inactive",
        `Session ${sessionId} is not active.`
      );
    }

    return entry;
  }
}
