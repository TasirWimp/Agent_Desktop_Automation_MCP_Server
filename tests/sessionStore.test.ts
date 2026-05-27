import { describe, expect, it } from "vitest";
import {
  type DesktopActionPacket,
  type DesktopInteractionSessionLicense,
  type DesktopObservationPacket,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition
} from "../src/policy/sessionLicensePolicy.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError
} from "../src/session/sessionStore.js";
import {
  createPendingInteractionTransitionGate
} from "../src/session/interactionTransitionGate.js";

const baseLicense: DesktopInteractionSessionLicense = {
  sessionId: "session-001",
  userGoal: "Exercise the generated app test scenario.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowedScopes: [
    {
      kind: "window_title",
      value: "Generated Test App"
    }
  ],
  allowedActions: ["observe", "move_mouse", "click", "type_text"],
  forbiddenActions: [
    "credential_entry",
    "payment_or_purchase",
    "send_message",
    "external_publish",
    "destructive_file_operation",
    "shell_command",
    "system_change"
  ],
  riskLimits: {
    maxDurationMs: 60_000,
    maxActionCount: 3,
    maxConsecutiveRepairAttempts: 2,
    allowCredentialEntry: false,
    allowDestructiveFileOperations: false,
    allowSystemChanges: false,
    allowExternalPublishing: false
  },
  observationCadence: {
    beforeEveryAction: true,
    afterEveryStateChangingAction: true,
    maxObservationGapMs: 5_000
  },
  startedAt: "2026-05-27T10:00:00.000Z",
  expiresAt: "2026-05-27T10:01:00.000Z"
};

function auditEvent(
  eventId: string,
  eventType: DesktopSessionAuditEvent["eventType"],
  overrides: Partial<DesktopSessionAuditEvent> = {}
): DesktopSessionAuditEvent {
  return {
    eventId,
    sessionId: baseLicense.sessionId,
    eventType,
    occurredAt: "2026-05-27T10:00:01.000Z",
    summary: `${eventType} event`,
    residue: [],
    ...overrides
  };
}

function observationFixture(
  observationId: string,
  overrides: Partial<DesktopObservationPacket> = {}
): DesktopObservationPacket {
  return {
    observationId,
    sessionId: baseLicense.sessionId,
    observedAt: "2026-05-27T10:00:02.000Z",
    targetScope: {
      kind: "window_title",
      value: "Generated Test App"
    },
    activeWindow: {
      title: "Generated Test App",
      processName: "node"
    },
    cursorPosition: {
      x: 200,
      y: 120
    },
    frames: [
      {
        index: 0,
        capturedAt: "2026-05-27T10:00:02.000Z",
        elapsedMs: 0,
        mimeType: "image/png",
        width: 800,
        height: 600,
        byteLength: 64,
        sha256: "framehash"
      }
    ],
    residue: [],
    ...overrides,
    observationId
  };
}

function actionFixture(
  actionId: string,
  overrides: Partial<DesktopActionPacket> = {}
): DesktopActionPacket {
  return {
    actionId,
    sessionId: baseLicense.sessionId,
    actionType: "click",
    requestedAt: "2026-05-27T10:00:03.000Z",
    targetScope: {
      kind: "window_title",
      value: "Generated Test App"
    },
    preActionObservationId: "obs-001",
    intendedSemanticTarget: "Submit button",
    input: {
      point: {
        x: 320,
        y: 240
      },
      button: "left"
    },
    risk: {
      credentialExposure: false,
      destructive: false,
      externalEffect: false,
      systemChange: false,
      recoverability: "high"
    },
    residue: [],
    ...overrides,
    actionId
  };
}

function stopCondition(
  overrides: Partial<DesktopSessionStopCondition> = {}
): DesktopSessionStopCondition {
  return {
    condition: "missing_post_action_observation",
    sessionId: baseLicense.sessionId,
    actionId: "action-001",
    reason: "Click completion requires post-action observation.",
    residue: [],
    ...overrides
  };
}

function expectStoreError(error: unknown, code: SessionStoreError["code"]): void {
  expect(error).toBeInstanceOf(SessionStoreError);
  expect((error as SessionStoreError).code).toBe(code);
}

function expectStoreErrorFrom(fn: () => unknown, code: SessionStoreError["code"]): void {
  let caught: unknown;

  try {
    fn();
  } catch (error: unknown) {
    caught = error;
  }

  expectStoreError(caught, code);
}

describe("InMemoryDesktopSessionStore", () => {
  it("creates and reads an active session with an initial audit event", () => {
    const store = new InMemoryDesktopSessionStore();
    const initialAuditEvent = auditEvent("event-start", "session_started");

    const created = store.createSession(baseLicense, { initialAuditEvent });
    const read = store.requireActiveSession(baseLicense.sessionId);

    expect(created.status).toBe("active");
    expect(created.actionCount).toBe(0);
    expect(created.repairAttemptCount).toBe(0);
    expect(read.auditEvents).toHaveLength(1);
    expect(read.auditEvents[0]).toMatchObject({
      eventId: "event-start",
      eventType: "session_started"
    });
  });

  it("rejects sessions that have not passed start policy", () => {
    const store = new InMemoryDesktopSessionStore();

    expectStoreErrorFrom(
      () =>
        store.createSession({
          ...baseLicense,
          userConfirmed: false
        }),
      "session_policy_rejected"
    );

    expect(store.getSession(baseLicense.sessionId)).toBeUndefined();
  });

  it("rejects duplicate session ids", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense);

    expectStoreErrorFrom(() => store.createSession(baseLicense), "session_already_exists");
  });

  it("returns immutable audit event copies", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense, {
      initialAuditEvent: auditEvent("event-start", "session_started")
    });

    const events = store.appendAuditEvent(auditEvent("event-observe", "observation_recorded"));
    events[0]?.residue.push("mutated outside the store");

    expect(store.listAuditEvents(baseLicense.sessionId)[0]?.residue).toEqual([]);
    expect(store.listAuditEvents(baseLicense.sessionId)).toHaveLength(2);
  });

  it("records and looks up observations and actions by id", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense);

    const observation = store.recordObservation(observationFixture("obs-001"));
    const action = store.recordAction(actionFixture("action-001"));

    expect(store.getObservation(baseLicense.sessionId, "obs-001")).toEqual(observation);
    expect(store.getAction(baseLicense.sessionId, "action-001")).toEqual(action);
    expect(store.getObservation(baseLicense.sessionId, "missing")).toBeUndefined();
    expect(store.getAction(baseLicense.sessionId, "missing")).toBeUndefined();
  });

  it("records, updates, and lists interaction transition gates by action id", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense);
    store.recordObservation(observationFixture("obs-001"));
    const action = store.recordAction(
      actionFixture("action-001", {
        actionType: "move_mouse"
      })
    );
    const transitionGate = createPendingInteractionTransitionGate({
      transitionId: "transition-001",
      action,
      createdAt: "2026-05-27T10:00:04.000Z",
      protectedObservables: ["cursor position"],
      expectedEvidenceAfterAction: ["cursor position changed"],
      residue: ["Post-movement observation is required."]
    });

    store.recordTransitionGate(transitionGate);

    expect(store.getTransitionGate(baseLicense.sessionId, action.actionId)).toEqual(
      transitionGate
    );
    expect(store.listTransitionGates(baseLicense.sessionId)).toHaveLength(1);
    expect(store.findBlockingTransitionGate(baseLicense.sessionId)).toMatchObject({
      actionId: action.actionId,
      status: "pending_observation"
    });

    const updated = store.updateTransitionGate({
      ...transitionGate,
      status: "audited",
      updatedAt: "2026-05-27T10:00:05.000Z",
      followUpObservationId: "obs-after-001"
    });

    expect(updated.status).toBe("audited");
    expect(store.findBlockingTransitionGate(baseLicense.sessionId)).toBeUndefined();
  });

  it("tracks action and repair counts within session limits", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense);

    expect(store.incrementActionCount(baseLicense.sessionId)).toBe(1);
    expect(store.incrementActionCount(baseLicense.sessionId)).toBe(2);
    expect(store.incrementActionCount(baseLicense.sessionId)).toBe(3);

    expectStoreErrorFrom(
      () => store.incrementActionCount(baseLicense.sessionId),
      "action_count_limit_reached"
    );

    expect(store.incrementRepairAttemptCount(baseLicense.sessionId)).toBe(1);
    expect(store.incrementRepairAttemptCount(baseLicense.sessionId)).toBe(2);

    expectStoreErrorFrom(
      () => store.incrementRepairAttemptCount(baseLicense.sessionId),
      "repair_attempt_limit_reached"
    );

    expect(store.resetRepairAttemptCount(baseLicense.sessionId)).toBe(0);
  });

  it("records stop conditions and exposes a policy context snapshot", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense, {
      initialAuditEvent: auditEvent("event-start", "session_started")
    });
    store.recordObservation(observationFixture("obs-001"));
    store.recordAction(actionFixture("action-001"));
    store.appendStopCondition(stopCondition());
    store.incrementActionCount(baseLicense.sessionId);

    const snapshot = store.requireActiveSession(baseLicense.sessionId);
    const context = store.getActionPolicyContext(baseLicense.sessionId, {
      now: "2026-05-27T10:00:04.000Z",
      phase: "preflight"
    });

    expect(snapshot.stopConditions).toHaveLength(1);
    expect(context.actionCountSoFar).toBe(1);
    expect(context.auditEvents).toHaveLength(1);
    expect(context.observations).toHaveLength(1);
  });

  it("ends sessions, keeps audit readable, and rejects inactive-session mutation", () => {
    const store = new InMemoryDesktopSessionStore();
    store.createSession(baseLicense);

    const ended = store.endSession(
      baseLicense.sessionId,
      auditEvent("event-stop", "session_stopped", {
        occurredAt: "2026-05-27T10:00:05.000Z"
      })
    );

    expect(ended.status).toBe("ended");
    expect(ended.endedAt).toBe("2026-05-27T10:00:05.000Z");
    expect(store.getSession(baseLicense.sessionId)?.status).toBe("ended");
    expect(store.listAuditEvents(baseLicense.sessionId)).toHaveLength(1);

    for (const mutate of [
      () => store.requireActiveSession(baseLicense.sessionId),
      () => store.appendAuditEvent(auditEvent("event-after-stop", "action_requested")),
      () => store.recordObservation(observationFixture("obs-001")),
      () => store.recordAction(actionFixture("action-001")),
      () =>
        store.recordTransitionGate(
          createPendingInteractionTransitionGate({
            transitionId: "transition-001",
            action: actionFixture("action-001"),
            createdAt: "2026-05-27T10:00:06.000Z",
            protectedObservables: ["cursor position"],
            expectedEvidenceAfterAction: ["cursor position changed"],
            residue: ["Post-action observation is required."]
          })
        ),
      () => store.incrementActionCount(baseLicense.sessionId)
    ]) {
      expectStoreErrorFrom(mutate, "session_inactive");
    }
  });
});
