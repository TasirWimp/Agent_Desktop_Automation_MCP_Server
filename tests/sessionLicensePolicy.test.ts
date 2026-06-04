import { describe, expect, it } from "vitest";
import {
  type DesktopActionPacket,
  type DesktopAppScopeBinding,
  type DesktopInteractionSessionLicense,
  type DesktopObservationPacket,
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
  licensedAppScope: {
    description: "Generated Test App is a local reversible UI test fixture.",
    scope: {
      kind: "window_title",
      value: "Generated Test App"
    },
    userDeclaredReversible: true,
    allowedActions: ["observe", "move_mouse", "click", "type_text"],
    forbiddenBoundaries: [
      "credential_or_secret_prompt",
      "payment_or_purchase",
      "external_publish_or_deploy",
      "destructive_operation",
      "system_settings",
      "unrelated_private_window",
      "scope_exit"
    ],
    scopeExitStopConditions: ["outside_allowed_scope"]
  },
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

function observationFixture(
  observationId: string,
  overrides: Partial<DesktopObservationPacket> = {}
): DesktopObservationPacket {
  return {
    observationId,
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
    residue: [],
    ...overrides,
    observationId
  };
}

function boundAppScopeFixture(
  overrides: Partial<DesktopAppScopeBinding> = {}
): DesktopAppScopeBinding {
  return {
    bindingId: "binding-generated-app",
    sessionId: baseLicense.sessionId,
    licensedScope: {
      kind: "window_title",
      value: "Generated Test App"
    },
    boundScope: {
      kind: "active_window",
      value: "node:Generated Test App"
    },
    boundAt: "2026-05-27T10:00:01.500Z",
    observationId: "obs-before-001",
    activeWindow: {
      title: "Generated Test App",
      processName: "node"
    },
    observedWindowIdentity: "node:Generated Test App",
    residue: ["Bound app scope fixture."],
    ...overrides
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
    repairAttemptCount: 0,
    auditEvents: [auditEventFor(action.actionId)],
    observations: [
      observationFixture("obs-before-001"),
      observationFixture("obs-after-001", {
        observedAt: "2026-05-27T10:00:02.500Z",
        lastActionDeltaSummary: "The visible control highlighted after the action."
      })
    ],
    boundAppScope: boundAppScopeFixture(),
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
      desktopObservationPacketSchema.parse(observationFixture("obs-before-001"))
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

  it("accepts app-scope kinds for future binding models", () => {
    expect(() =>
      desktopInteractionSessionLicenseSchema.parse({
        ...baseLicense,
        allowedScopes: [
          {
            kind: "observed_window_identity",
            value: "hwnd:0x123"
          }
        ],
        licensedAppScope: {
          ...baseLicense.licensedAppScope!,
          scope: {
            kind: "observed_window_identity",
            value: "hwnd:0x123"
          }
        }
      })
    ).not.toThrow();
    expect(() =>
      desktopInteractionSessionLicenseSchema.parse({
        ...baseLicense,
        allowedScopes: [
          {
            kind: "local_origin",
            value: "http://localhost:5173"
          }
        ],
        licensedAppScope: {
          ...baseLicense.licensedAppScope!,
          scope: {
            kind: "local_origin",
            value: "http://localhost:5173"
          }
        }
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

  it("requires a licensed app scope before click or type_text permissions are granted", () => {
    const result = evaluateSessionStartPolicy({
      ...baseLicense,
      licensedAppScope: undefined
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("licensed_app_scope_required");
    expect(result.stopConditions[0]?.condition).toBe("licensed_app_scope_required");
  });

  it("requires the user to declare the app-under-test reversible", () => {
    const result = evaluateSessionStartPolicy({
      ...baseLicense,
      licensedAppScope: {
        ...baseLicense.licensedAppScope!,
        userDeclaredReversible: false
      }
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("licensed_app_scope_invalid");
    expect(result.stopConditions[0]?.condition).toBe("user_reversibility_declaration_required");
  });

  it("requires forbidden boundaries on the licensed app scope", () => {
    const result = evaluateSessionStartPolicy({
      ...baseLicense,
      licensedAppScope: {
        ...baseLicense.licensedAppScope!,
        forbiddenBoundaries: []
      }
    });

    expect(result.decision).toBe("block");
    expect(result.stopConditions[0]?.condition).toBe("forbidden_boundary_declaration_required");
  });

  it("allows click and type_text permissions when a reversible app scope is declared", () => {
    const result = evaluateSessionStartPolicy(baseLicense);

    expect(result.decision).toBe("allow");
    expect(result.auditTags).toContain("licensed_app_scope_declared");
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
    expect(moveResult.requiresPostActionObservation).toBe(true);
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
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action, "completion"),
      observations: [observationFixture("obs-before-001")]
    });

    expect(result.decision).toBe("block");
    expect(result.requiresPostActionObservation).toBe(true);
    expect(result.auditTags).toContain("missing_post_action_observation");
  });

  it("blocks click actions when the licensed app scope has not been bound", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      boundAppScope: undefined
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("app_scope_binding_required");
    expect(result.stopConditions[0]?.condition).toBe("app_scope_binding_required");
  });

  it("blocks click actions when the bound app scope is stale", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      boundAppScope: boundAppScopeFixture({
        boundAt: "2026-05-27T09:59:00.000Z"
      })
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("app_scope_binding_stale");
    expect(result.stopConditions[0]?.condition).toBe("app_scope_binding_stale");
  });

  it("escalates click actions when the pre-action observation no longer matches the bound app", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      observations: [
        observationFixture("obs-before-001", {
          activeWindow: {
            title: "Private Window",
            processName: "browser"
          }
        })
      ]
    });

    expect(result.decision).toBe("escalate");
    expect(result.auditTags).toContain("bound_app_scope_mismatch");
    expect(result.stopConditions[0]?.condition).toBe("outside_allowed_scope");
  });

  it("requires post-movement observation before a mouse movement can be completed", () => {
    const action = actionFixture("move_mouse");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action, "completion"),
      observations: [observationFixture("obs-before-001")]
    });

    expect(result.decision).toBe("block");
    expect(result.requiresPostActionObservation).toBe(true);
    expect(result.reasons[0]).toContain("Mouse movement is a probe");
  });

  it("allows mouse movement completion when post-movement observation exists", () => {
    const action = actionFixture("move_mouse", {
      postActionObservationId: "obs-after-001"
    });
    const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action, "completion"));

    expect(result.decision).toBe("allow");
    expect(result.requiresPostActionObservation).toBe(true);
  });

  it("blocks state-changing actions when the pre-action observation is stale", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      observations: [
        observationFixture("obs-before-001", {
          observedAt: "2026-05-27T09:59:50.000Z"
        })
      ]
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("stale_pre_action_observation");
  });

  it("blocks state-changing actions when the pre-action observation scope does not match", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      observations: [
        observationFixture("obs-before-001", {
          targetScope: {
            kind: "window_title",
            value: "Different Window"
          }
        })
      ]
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("pre_action_observation_scope_mismatch");
  });

  it("blocks state-changing actions when the pre-action observation has no frame evidence", () => {
    const action = actionFixture("click");
    const result = evaluateSessionActionPolicy(baseLicense, action, {
      ...contextFor(action),
      observations: [
        observationFixture("obs-before-001", {
          frames: []
        })
      ]
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("missing_frame_evidence");
  });

  it("keeps bound active-window scope from following focus into another window identity", () => {
    const license: DesktopInteractionSessionLicense = {
      ...baseLicense,
      allowedScopes: [
        {
          kind: "active_window",
          value: "window-identity-generated-app"
        }
      ],
      licensedAppScope: {
        ...baseLicense.licensedAppScope!,
        scope: {
          kind: "active_window",
          value: "window-identity-generated-app"
        }
      }
    };
    const action = actionFixture("click", {
      targetScope: {
        kind: "active_window",
        value: "window-identity-private-window"
      }
    });
    const result = evaluateSessionActionPolicy(license, action, contextFor(action));

    expect(result.decision).toBe("escalate");
    expect(result.auditTags).toContain("outside_allowed_scope");
  });

  it("scopes click and type_text actions to the licensed app-under-test", () => {
    const license: DesktopInteractionSessionLicense = {
      ...baseLicense,
      allowedScopes: [
        {
          kind: "window_title",
          value: "Generated Test App"
        },
        {
          kind: "window_title",
          value: "Second Allowed Window"
        }
      ]
    };
    const action = actionFixture("click", {
      targetScope: {
        kind: "window_title",
        value: "Second Allowed Window"
      }
    });
    const result = evaluateSessionActionPolicy(license, action, contextFor(action));

    expect(result.decision).toBe("escalate");
    expect(result.auditTags).toContain("outside_licensed_app_scope");
  });

  it("does not require repeated user confirmation for low-risk actions inside a confirmed session", () => {
    const action = actionFixture("type_text");
    const result = evaluateSessionActionPolicy(baseLicense, action, contextFor(action));

    expect(result.decision).toBe("allow");
    expect(result.requiresUserConfirmation).toBe(false);
    expect(result.auditTags).toContain("session_action_licensed");
  });
});
