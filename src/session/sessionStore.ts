import {
  type DesktopActionPacket,
  type DesktopAppScopeBindingEvidence,
  type DesktopAppScopeBinding,
  type DesktopInteractionSessionLicense,
  type DesktopObservationPacket,
  type DesktopPerceptionDigest,
  type DesktopSessionActionPolicyContext,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition,
  type DesktopWorkflowStateClaim,
  desktopActionPacketSchema,
  desktopAppScopeBindingEvidenceSchema,
  desktopAppScopeBindingSchema,
  desktopInteractionSessionLicenseSchema,
  desktopObservationPacketSchema,
  desktopPerceptionDigestSchema,
  desktopSessionAuditEventSchema,
  desktopSessionStopConditionSchema,
  desktopWorkflowStateClaimSchema,
  evaluateSessionStartPolicy
} from "../policy/sessionLicensePolicy.js";
import {
  type InteractionTransitionGate,
  interactionTransitionGateSchema,
  transitionGateBlocksNonObserveAction
} from "./interactionTransitionGate.js";
import {
  type HoverTargetWitness,
  hoverTargetWitnessSchema
} from "./hoverTargetWitness.js";

export type DesktopSessionStatus = "active" | "ended";

export type SessionStoreErrorCode =
  | "session_already_exists"
  | "session_not_found"
  | "session_inactive"
  | "session_policy_rejected"
  | "session_id_mismatch"
  | "audit_event_already_exists"
  | "observation_already_exists"
  | "perception_digest_already_exists"
  | "workflow_state_claim_already_exists"
  | "app_scope_binding_evidence_already_exists"
  | "action_already_exists"
  | "transition_gate_already_exists"
  | "transition_gate_not_found"
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
  perceptionDigests: DesktopPerceptionDigest[];
  workflowStateClaims: DesktopWorkflowStateClaim[];
  appScopeBindingEvidenceClaims: DesktopAppScopeBindingEvidence[];
  actions: DesktopActionPacket[];
  transitionGates: InteractionTransitionGate[];
  hoverTargetWitnesses: HoverTargetWitness[];
  stopConditions: DesktopSessionStopCondition[];
  boundAppScope?: DesktopAppScopeBinding;
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
  perceptionDigests: Map<string, DesktopPerceptionDigest>;
  workflowStateClaims: Map<string, DesktopWorkflowStateClaim>;
  appScopeBindingEvidenceClaims: Map<string, DesktopAppScopeBindingEvidence>;
  actions: Map<string, DesktopActionPacket>;
  transitionGates: Map<string, InteractionTransitionGate>;
  hoverTargetWitnesses: Map<string, HoverTargetWitness>;
  stopConditions: DesktopSessionStopCondition[];
  boundAppScope?: DesktopAppScopeBinding;
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
    perceptionDigests: clone([...entry.perceptionDigests.values()]),
    workflowStateClaims: clone([...entry.workflowStateClaims.values()]),
    appScopeBindingEvidenceClaims: clone([
      ...entry.appScopeBindingEvidenceClaims.values()
    ]),
    actions: clone([...entry.actions.values()]),
    transitionGates: clone([...entry.transitionGates.values()]),
    hoverTargetWitnesses: clone([...entry.hoverTargetWitnesses.values()]),
    stopConditions: clone(entry.stopConditions),
    boundAppScope: entry.boundAppScope === undefined ? undefined : clone(entry.boundAppScope)
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
      perceptionDigests: new Map(),
      workflowStateClaims: new Map(),
      appScopeBindingEvidenceClaims: new Map(),
      actions: new Map(),
      transitionGates: new Map(),
      hoverTargetWitnesses: new Map(),
      stopConditions: [],
      boundAppScope: undefined
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

  recordPerceptionDigest(
    digestInput: DesktopPerceptionDigest
  ): DesktopPerceptionDigest {
    const digest = desktopPerceptionDigestSchema.parse(digestInput);
    const entry = this.requireActiveEntry(digest.sessionId);

    if (entry.perceptionDigests.has(digest.perceptionDigestId)) {
      throw new SessionStoreError(
        "perception_digest_already_exists",
        `Perception digest ${digest.perceptionDigestId} already exists.`
      );
    }

    entry.perceptionDigests.set(digest.perceptionDigestId, clone(digest));

    return clone(digest);
  }

  getPerceptionDigest(
    sessionId: string,
    perceptionDigestId: string
  ): DesktopPerceptionDigest | undefined {
    const digest = this.requireEntry(sessionId).perceptionDigests.get(perceptionDigestId);
    return digest === undefined ? undefined : clone(digest);
  }

  listPerceptionDigests(sessionId: string): DesktopPerceptionDigest[] {
    return clone([...this.requireEntry(sessionId).perceptionDigests.values()]);
  }

  recordWorkflowStateClaim(
    claimInput: DesktopWorkflowStateClaim
  ): DesktopWorkflowStateClaim {
    const claim = desktopWorkflowStateClaimSchema.parse(claimInput);
    const entry = this.requireActiveEntry(claim.sessionId);

    if (entry.workflowStateClaims.has(claim.workflowStateClaimId)) {
      throw new SessionStoreError(
        "workflow_state_claim_already_exists",
        `Workflow state claim ${claim.workflowStateClaimId} already exists.`
      );
    }

    entry.workflowStateClaims.set(claim.workflowStateClaimId, clone(claim));

    return clone(claim);
  }

  getWorkflowStateClaim(
    sessionId: string,
    workflowStateClaimId: string
  ): DesktopWorkflowStateClaim | undefined {
    const claim = this.requireEntry(sessionId).workflowStateClaims.get(workflowStateClaimId);
    return claim === undefined ? undefined : clone(claim);
  }

  listWorkflowStateClaims(sessionId: string): DesktopWorkflowStateClaim[] {
    return clone([...this.requireEntry(sessionId).workflowStateClaims.values()]);
  }

  recordAppScopeBindingEvidence(
    evidenceInput: DesktopAppScopeBindingEvidence
  ): DesktopAppScopeBindingEvidence {
    const evidence = desktopAppScopeBindingEvidenceSchema.parse(evidenceInput);
    const entry = this.requireActiveEntry(evidence.sessionId);

    if (
      entry.appScopeBindingEvidenceClaims.has(
        evidence.appScopeBindingEvidenceId
      )
    ) {
      throw new SessionStoreError(
        "app_scope_binding_evidence_already_exists",
        `App scope binding evidence ${evidence.appScopeBindingEvidenceId} already exists.`
      );
    }

    entry.appScopeBindingEvidenceClaims.set(
      evidence.appScopeBindingEvidenceId,
      clone(evidence)
    );

    return clone(evidence);
  }

  getAppScopeBindingEvidence(
    sessionId: string,
    appScopeBindingEvidenceId: string
  ): DesktopAppScopeBindingEvidence | undefined {
    const evidence = this.requireEntry(sessionId).appScopeBindingEvidenceClaims.get(
      appScopeBindingEvidenceId
    );
    return evidence === undefined ? undefined : clone(evidence);
  }

  listAppScopeBindingEvidence(
    sessionId: string
  ): DesktopAppScopeBindingEvidence[] {
    return clone([...this.requireEntry(sessionId).appScopeBindingEvidenceClaims.values()]);
  }

  bindAppScope(bindingInput: DesktopAppScopeBinding): DesktopAppScopeBinding {
    const binding = desktopAppScopeBindingSchema.parse(bindingInput);
    const entry = this.requireActiveEntry(binding.sessionId);

    entry.boundAppScope = clone(binding);

    return clone(binding);
  }

  getBoundAppScope(sessionId: string): DesktopAppScopeBinding | undefined {
    const boundAppScope = this.requireEntry(sessionId).boundAppScope;
    return boundAppScope === undefined ? undefined : clone(boundAppScope);
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

  recordTransitionGate(
    transitionGateInput: InteractionTransitionGate
  ): InteractionTransitionGate {
    const transitionGate = interactionTransitionGateSchema.parse(transitionGateInput);
    const entry = this.requireActiveEntry(transitionGate.sessionId);

    if (entry.transitionGates.has(transitionGate.actionId)) {
      throw new SessionStoreError(
        "transition_gate_already_exists",
        `Transition gate for action ${transitionGate.actionId} already exists.`
      );
    }

    entry.transitionGates.set(transitionGate.actionId, clone(transitionGate));

    return clone(transitionGate);
  }

  updateTransitionGate(
    transitionGateInput: InteractionTransitionGate
  ): InteractionTransitionGate {
    const transitionGate = interactionTransitionGateSchema.parse(transitionGateInput);
    const entry = this.requireActiveEntry(transitionGate.sessionId);

    if (!entry.transitionGates.has(transitionGate.actionId)) {
      throw new SessionStoreError(
        "transition_gate_not_found",
        `Transition gate for action ${transitionGate.actionId} does not exist.`
      );
    }

    entry.transitionGates.set(transitionGate.actionId, clone(transitionGate));

    return clone(transitionGate);
  }

  getTransitionGate(
    sessionId: string,
    actionId: string
  ): InteractionTransitionGate | undefined {
    const transitionGate = this.requireEntry(sessionId).transitionGates.get(actionId);
    return transitionGate === undefined ? undefined : clone(transitionGate);
  }

  requireTransitionGate(
    sessionId: string,
    actionId: string
  ): InteractionTransitionGate {
    const transitionGate = this.requireEntry(sessionId).transitionGates.get(actionId);

    if (transitionGate === undefined) {
      throw new SessionStoreError(
        "transition_gate_not_found",
        `Transition gate for action ${actionId} does not exist.`
      );
    }

    return clone(transitionGate);
  }

  listTransitionGates(sessionId: string): InteractionTransitionGate[] {
    return clone([...this.requireEntry(sessionId).transitionGates.values()]);
  }

  recordHoverTargetWitness(
    witnessInput: HoverTargetWitness
  ): HoverTargetWitness {
    const witness = hoverTargetWitnessSchema.parse(witnessInput);
    const entry = this.requireActiveEntry(witness.sessionId);

    if (entry.hoverTargetWitnesses.has(witness.witnessId)) {
      throw new SessionStoreError(
        "transition_gate_already_exists",
        `Hover target witness ${witness.witnessId} already exists.`
      );
    }

    entry.hoverTargetWitnesses.set(witness.witnessId, clone(witness));

    return clone(witness);
  }

  getHoverTargetWitness(
    sessionId: string,
    witnessId: string
  ): HoverTargetWitness | undefined {
    const witness = this.requireEntry(sessionId).hoverTargetWitnesses.get(witnessId);
    return witness === undefined ? undefined : clone(witness);
  }

  listHoverTargetWitnesses(sessionId: string): HoverTargetWitness[] {
    return clone([...this.requireEntry(sessionId).hoverTargetWitnesses.values()]);
  }

  findBlockingTransitionGate(sessionId: string): InteractionTransitionGate | undefined {
    const entry = this.requireActiveEntry(sessionId);
    const transitionGate = [...entry.transitionGates.values()].find(
      transitionGateBlocksNonObserveAction
    );

    return transitionGate === undefined ? undefined : clone(transitionGate);
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
      perceptionDigests: clone([...entry.perceptionDigests.values()]),
      workflowStateClaims: clone([...entry.workflowStateClaims.values()]),
      appScopeBindingEvidenceClaims: clone([
        ...entry.appScopeBindingEvidenceClaims.values()
      ]),
      actions: clone([...entry.actions.values()]),
      transitionGates: clone([...entry.transitionGates.values()]),
      stopConditions: clone(entry.stopConditions),
      boundAppScope:
        entry.boundAppScope === undefined ? undefined : clone(entry.boundAppScope),
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
