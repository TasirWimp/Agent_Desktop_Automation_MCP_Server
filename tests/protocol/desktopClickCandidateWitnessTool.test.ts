import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";

const fixedNow = "2026-05-27T10:00:00.000Z";

async function createConnectedClient(initialNow = fixedNow) {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  let currentNow = initialNow;
  const server = createServer({
    sessionStore,
    now: () => currentNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "desktop-click-candidate-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    sessionStore,
    setNow: (nextNow: string) => {
      currentNow = nextNow;
    }
  };
}

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  return result.structuredContent as Record<string, unknown>;
}

function parseJsonText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const textBlock = result.content.find((block) => block.type === "text");

  if (textBlock === undefined || textBlock.type !== "text") {
    throw new Error("Expected a text content block.");
  }

  return JSON.parse(textBlock.text) as Record<string, unknown>;
}

function compactClaim(sourceObservationId: string) {
  return {
    sourceObservationId,
    intendedTarget: "Submit button",
    scene: "Generated Test App main view.",
    anchor: "Submit row",
    relation: "target control in the same row/right-side action area",
    candidate: "point is inside that row action basin",
    rejectedAlternative: "nearby launch button for another app",
    expectedEvidence: "row/control highlights or opens target",
    contradiction: "another row/control highlights or opens",
    pointProvenance: "relational_estimate"
  };
}

async function submitSupportedAssessment(client: Client, actionId: string) {
  await client.callTool({
    name: "desktop_submit_transition_assessment",
    arguments: {
      sessionId: "session-click-candidate-001",
      actionId,
      assessment: {
        outcome: "supported",
        relationHeld: true,
        candidateSupported: true,
        rejectedAlternativeAvoided: true,
        expectedEvidenceSeen: "row/control highlights or opens target",
        contradictionSeen: false,
        summary: "Follow-up screenshot supports the target row/control."
      }
    }
  });
}

const startArguments = {
  sessionId: "session-click-candidate-001",
  userGoal: "Run the generated app UI test scenario.",
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
  }
};

async function startAndObserve(client: Client, overrides: Record<string, unknown> = {}) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: {
      ...startArguments,
      ...overrides
    }
  });

  return client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-click-candidate-001",
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      includeImages: true
    }
  });
}

describe("desktop_evaluate_click_candidate MCP tool", () => {
  it("reports the click-candidate witness gate while real click remains unavailable", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const result = await client.callTool({
        name: "desktop_capabilities",
        arguments: {}
      });
      const structured = parseJsonText(result);

      expect(structured.capabilities).toMatchObject({
        clickCandidateWitnessGate: true,
        desktopEvaluateClickCandidateTool: true,
        realDesktopClick: false,
        closedLoopClickExecution: false
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not treat cursor proximity without semantic landing assessment as click-ready", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 320,
            y: 180
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("transition_not_audited");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        wouldExecuteClick: false,
        realClickExecutionAvailable: false,
        requiresPostClickObservation: true,
        candidateCursorDistancePx: 0,
        observationEvidence: {
          fresh: true,
          hasFrameEvidence: true,
          cursorObserved: true
        }
      });
      expect(structured.auditEvent).toMatchObject({
        eventType: "click_candidate_evaluated",
        observationId: "observation-fixed-2",
        summary: "Click candidate witness gate result: transition_not_audited."
      });
      expect(sessionStore.listActions("session-click-candidate-001")).toHaveLength(0);
      expect(sessionStore.listTransitionGates("session-click-candidate-001")).toHaveLength(0);
      expect(sessionStore.listAuditEvents("session-click-candidate-001")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "session_started"
          }),
          expect.objectContaining({
            eventType: "observation_recorded"
          }),
          expect.objectContaining({
            eventType: "app_scope_bound"
          }),
          expect.objectContaining({
            eventType: "click_candidate_evaluated"
          })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("uses audited movement evidence when evaluating a post-movement click candidate", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });
      await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: "action-fixed-4"
        }
      });
      await submitSupportedAssessment(client, "action-fixed-4");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-8",
          movementActionId: "action-fixed-4",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 120,
            y: 80
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("candidate_ready");
      expect(structured.clickCandidateWitness).toMatchObject({
        movementEvidence: {
          gateStatus: "audited",
          followUpObservationMatches: true,
          semanticLandingSupported: true,
          semanticLandingOutcome: "supported",
          cursorObserved: true,
          scopeStable: true,
          distanceFromIntendedPx: 0,
          confidence: "high"
        }
      });
      expect(structured.auditEvent).toMatchObject({
        actionId: "action-fixed-4",
        observationId: "observation-fixed-8"
      });
      expect(structured.hoverTargetWitness).toMatchObject({
        sourceMoveActionId: "action-fixed-4",
        followUpObservationId: "observation-fixed-8",
        visualConfirmation: {
          status: "confirmed",
          coordinateEvidenceOnlyIsInsufficient: true
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not treat an unaudited movement gate as click-ready evidence", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: "observation-fixed-2",
          point: {
            x: 120,
            y: 80
          },
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          movementActionId: "action-fixed-4",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 120,
            y: 80
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("transition_not_audited");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        movementEvidence: {
          gateStatus: "pending_observation",
          followUpObservationMatches: false
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("marks stale observations as not click-ready", async () => {
    const { client, server, setNow } = await createConnectedClient();

    try {
      await startAndObserve(client);
      setNow("2026-05-27T10:00:06.000Z");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 320,
            y: 180
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("stale_observation");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        observationEvidence: {
          fresh: false,
          ageMs: 6000,
          maxObservationGapMs: 5000
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("marks scope mismatches as not click-ready", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          targetScope: {
            kind: "window_title",
            value: "Unrelated Private Window"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 320,
            y: 180
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("scope_mismatch");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        scopeEvidence: {
          sessionScopeAllowed: false,
          observationScopeMatches: false
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps credential, destructive, external, system, and low-recoverability candidates blocked", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Delete production data",
          candidatePoint: {
            x: 320,
            y: 180
          },
          risk: {
            destructive: true,
            recoverability: "low"
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("risk_blocked");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        riskEvidence: {
          destructive: true,
          recoverability: "low"
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("requires click to be allowed by the session license before a candidate can be ready", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client, {
        allowedActions: ["observe", "move_mouse"],
        licensedAppScope: undefined
      });

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          intendedSemanticTarget: "Submit button",
          candidatePoint: {
            x: 320,
            y: 180
          }
        }
      });
      const structured = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(structured.status).toBe("action_not_allowed");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
