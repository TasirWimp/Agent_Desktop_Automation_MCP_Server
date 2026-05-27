import { describe, expect, it } from "vitest";
import {
  type DesktopActionPacket,
  type DesktopInteractionSessionLicense,
  type DesktopSessionActionType,
  type DesktopSessionAuditEvent,
  desktopActionPacketSchema,
  desktopInteractionSessionLicenseSchema,
  desktopObservationPacketSchema,
  desktopSessionAuditEventSchema,
  desktopSessionStopConditionSchema,
  evaluateSessionActionPolicy,
  evaluateSessionStartPolicy
} from "../src/policy/sessionLicensePolicy.js";

const baseLicense: DesktopInteractionSessionLicense = {
  sessionId: "session-001",
  userGoal: "Launch the generated app and exercise the generated UI test scenario.",
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
    maxActionCount: 20,
    maxConsecutiveRepairAttempts: 3,
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

function auditEventFor(actionId: string): DesktopSessionAuditEvent {
  return {
    eventId: `audit-${actionId}`,
    sessionId: baseLicense.sessionId,
    eventType: "action_requested",
    occurredAt: "2026-05-27T10:00:01.000Z",
    actionId,
    summary: "Action was requested inside the licensed UI test session.",
    residue: []
  };
}

function actionFixture(
  actionType: DesktopSessionActionType,
  overrides: Partial<DesktopActionPacket> = {}
): DesktopActionPacket {
  const actionId = overrides.actionId ?? `action-${actionType}`;

  return {
    actionId,
    sessionId: baseLicense.sessionId,
    actionType,
    requestedAt: "2026-05-27T10:00:02.000Z",
    targetScope: {
      kind: "window_title",
      value: "Generated Test App"
    },
    preActionObservationId: actionType === "observe" ? undefined : "obs-before-001",
    intendedSemanticTarget: "Submit button",
    input: {
      point: {
        x: 320,
        y: 240
      },
      button: actionType === "click" ? "left" : undefined,
      textLength: actionType === "type_text" ? 12 : undefined
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

function contextFor(action: DesktopActionPacket, phase: "preflight" | "completion" = "preflight") {
  return {
    phase,
    actionCountSoFar: 1,
    auditEvents: [auditEventFor(action.actionId)],
    now: "2026-05-27T10:00:03.000Z"
  };
}

describe("desktop interaction session schemas", () => {
  it("accepts session, observation, action, audit, and stop-condition packets", () => {
    const action = actionFixture("click", {
      postActionObservationId: "obs-after-001"
    });

    expect(() => desktopInteractionSessionLicenseSchema.parse(baseLicense)).not.toThrow();
    expect(() => desktopActionPacketSchema.parse(action)).not.toThrow();
    expect(() => desktopSessionAuditEventSchema.parse(auditEventFor(action.actionId))).not.toThrow();
    expect(() =>
      desktopObservationPacketSchema.parse({
        observationId: "obs-before-001",
        sessionId: baseLicense.sessionId,
        observedAt: "2026-05-27T10:00:01.500Z",
        targetScope: {
          kind: "window_title",
          value: "Generated Test App"
        },
        activeWindow: {
          title: "Generated Test App",
          processName: "node"
        },
        cursorPosition: {
          x: 300,
          y: 220
        },
        frames: [
          {
            index: 0,
            capturedAt: "2026-05-27T10:00:01.500Z",
            elapsedMs: 0,
            mimeType: "image/png",
            width: 1280,
            height: 720,
            byteLength: 128,
            sha256: "framehash"
          }
        ],
        lastActionDeltaSummary: "No prior action in this session.",
        residue: []
      })
    ).not.toThrow();
    expect(() =>
      desktopSessionStopConditionSchema.parse({
        condition: "missing_post_action_observation",
        sessionId: baseLicense.sessionId,
        actionId: action.actionId,
        reason: "Click requires observation after execution.",
        residue: []
      })
    ).not.toThrow();
  });
});

describe("evaluateSessionStartPolicy", () => {
  it("requires user confirmation for session start", () => {
    const result = evaluateSessionStartPolicy({
      ...baseLicense,
      userConfirmed: false
    });

    expect(result.decision).toBe("requires_session_confirmation");
    expect(result.requiresUserConfirmation).toBe(true);
    expect(result.auditTags).toContain("session_confirmation_required");
  });
});

describe("evaluateSessionActionPolicy", () => {
  it("allows bounded mouse and click actions within the licensed scope", () => {
    const moveAction = actionFixture("move_mouse");
    const clickAction = actionFixture("click");

    const moveResult = evaluateSessionActionPolicy(
      baseLicense,
      moveAction,
      contextFor(moveAction)
    );
    const clickResult = evaluateSessionActionPolicy(
      baseLicense,
      clickAction,
      contextFor(clickAction)
    );

    expect(moveResult.decision).toBe("allow");
    expect(moveResult.requiresUserConfirmation).toBe(false);
    expect(clickResult.decision).toBe("allow");
    expect(clickResult.requiresPostActionObservation).toBe(true);
  });

  it("escalates actions outside the licensed scope", () => {
    const action = actionFixture("click", {
      targetScope: {
        kind: "window_title",
        value: "Private Browser Window"
      }
    });
    const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action));

    expect(result.decision).toBe("escalate");
    expect(result.auditTags).toContain("outside_allowed_scope");
    expect(result.stopConditions[0]?.condition).toBe("outside_allowed_scope");
  });

  it("blocks credential, destructive, and system actions even inside a session", () => {
    const blockedActions: DesktopSessionActionType[] = [
      "credential_entry",
      "destructive_file_operation",
      "system_change"
    ];

    for (const actionType of blockedActions) {
      const action = actionFixture(actionType);
      const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action));

      expect(result.decision).toBe("block");
      expect(result.auditTags).toContain("blocked_high_risk_action");
    }
  });

  it("blocks in-session actions without audit logging", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      auditEvents: []
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("missing_audit_event");
  });

  it("requires post-action observation before a click can be completed", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action, "completion"));

    expect(result.decision).toBe("block");
    expect(result.requiresPostActionObservation).toBe(true);
    expect(result.auditTags).toContain("missing_post_action_observation");
  });

  it("does not require repeated user confirmation for low-risk actions inside a confirmed session", () => {
    const action = actionFixture("type_text");
    const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action));

    expect(result.decision).toBe("allow");
    expect(result.requiresUserConfirmation).toBe(false);
    expect(result.auditTags).toContain("session_action_licensed");
  });
});
