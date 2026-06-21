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

async function submitDigest(
  client: Client,
  observationId: string,
  overrides: Record<string, unknown> = {}
) {
  const result = await client.callTool({
    name: "desktop_submit_perception_digest",
    arguments: {
      sessionId: "session-click-candidate-001",
      observationId,
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      intendedTarget: "Submit button",
      currentScene: "Generated Test App main view.",
      currentAnchor: "Submit row",
      targetVisibility: "visible",
      anchorVisibility: "visible",
      continuityWithPriorClaim: "consistent",
      contradictionToPriorClaim: null,
      staleCarryoverReviewed: true,
      currentEvidence: "The current screenshot shows the target row/control.",
      ...overrides
    }
  });
  const structured = parseStructuredContent(result);

  return structured.perceptionDigestId as string;
}

async function submitWorkflowStateClaim(
  client: Client,
  observationId: string,
  perceptionDigestId: string,
  overrides: Record<string, unknown> = {}
) {
  const result = await client.callTool({
    name: "desktop_submit_workflow_state_claim",
    arguments: {
      sessionId: "session-click-candidate-001",
      observationId,
      perceptionDigestId,
      targetScope: {
        kind: "window_title",
        value: "Generated Test App"
      },
      workflowGoal: "Run the generated app UI test scenario.",
      workflowStep: "Submit the generated app form.",
      intendedElementTarget: "Submit button",
      intendedActionMeaning: "click Submit after committed workflow state is ready",
      actionRole: "execute_committed_action",
      requiredPrecondition: "The Submit button is the committed next workflow action.",
      preconditionStatus: "satisfied",
      committedStateEvidence: "The current screenshot shows Submit as the committed next action.",
      transientStateRisk: "none",
      missingConfirmation: null,
      expectedPostcondition: "The submit action changes the generated app state.",
      postconditionContradiction: "A different control or workflow state changes.",
      currentContradiction: null,
      staleCarryoverReviewed: true,
      ...overrides
    }
  });
  const structured = parseStructuredContent(result);

  return structured.workflowStateClaimId as string;
}

async function submitSupportedAssessment(
  client: Client,
  actionId: string,
  perceptionDigestId: string
) {
  await client.callTool({
    name: "desktop_submit_transition_assessment",
    arguments: {
      sessionId: "session-click-candidate-001",
      actionId,
      perceptionDigestId,
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
      const digestId = await submitDigest(client, "observation-fixed-2");
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        "observation-fixed-2",
        digestId
      );
      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
          workflowStateClaimId,
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

  it("requires a workflow-state claim before click-candidate readiness", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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
      expect(structured.status).toBe("workflow_state_invalid");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        workflowStateEvidence: {
          workflowStateClaimId: undefined,
          observationMatches: false
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks committed-action candidates when workflow precondition is not satisfied", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2");
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        "observation-fixed-2",
        digestId,
        {
          preconditionStatus: "not_satisfied",
          transientStateRisk: "present",
          missingConfirmation: "click the Submit row first"
        }
      );
      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
          workflowStateClaimId,
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
      expect(structured.status).toBe("workflow_precondition_not_ready");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        workflowStateEvidence: {
          preconditionStatus: "not_satisfied",
          transientStateRisk: "present"
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("uses audited movement evidence when evaluating a post-movement click candidate", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const initialDigestId = await submitDigest(client, "observation-fixed-2");
      const moveResult = await client.callTool({
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
          perceptionDigestId: initialDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(observeResult).observation as Record<
        string,
        unknown
      >;
      const followUpObservationId = followUpObservation.observationId as string;
      const followUpDigestId = await submitDigest(client, followUpObservationId);
      await submitSupportedAssessment(client, moveActionId, followUpDigestId);
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        followUpObservationId,
        followUpDigestId
      );

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: followUpObservationId,
          perceptionDigestId: followUpDigestId,
          workflowStateClaimId,
          movementActionId: moveActionId,
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
        actionId: moveActionId,
        observationId: followUpObservationId
      });
      expect(structured.hoverTargetWitness).toMatchObject({
        sourceMoveActionId: moveActionId,
        followUpObservationId,
        semanticLandingObservationId: followUpObservationId,
        revalidationObservationId: followUpObservationId,
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

  it("allows an older supported movement when latest digest and workflow revalidate it", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const initialObserveResult = await startAndObserve(client);
      const initialObservation = parseStructuredContent(initialObserveResult)
        .observation as Record<string, unknown>;
      const initialObservationId = initialObservation.observationId as string;
      const initialDigestId = await submitDigest(client, initialObservationId);
      const moveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          preActionObservationId: initialObservationId,
          point: {
            x: 120,
            y: 80
          },
          perceptionDigestId: initialDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim(initialObservationId)
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const followUpResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(followUpResult)
        .observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const followUpDigestId = await submitDigest(client, followUpObservationId);

      await submitSupportedAssessment(client, moveActionId, followUpDigestId);

      const revalidationResult = await client.callTool({
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
      const revalidationObservation = parseStructuredContent(revalidationResult)
        .observation as Record<string, unknown>;
      const revalidationObservationId = revalidationObservation.observationId as string;
      const revalidationDigestId = await submitDigest(client, revalidationObservationId);
      const revalidationWorkflowStateClaimId = await submitWorkflowStateClaim(
        client,
        revalidationObservationId,
        revalidationDigestId
      );

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: revalidationObservationId,
          perceptionDigestId: revalidationDigestId,
          workflowStateClaimId: revalidationWorkflowStateClaimId,
          movementActionId: moveActionId,
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
          followUpObservationMatches: false,
          revalidatedByLatestObservation: true,
          candidatePointMatchesMovement: true,
          semanticLandingSupported: true
        }
      });
      expect(structured.hoverTargetWitness).toMatchObject({
        sourceMoveActionId: moveActionId,
        followUpObservationId,
        semanticLandingObservationId: followUpObservationId,
        revalidationObservationId,
        revalidatedOlderMovement: true,
        perceptionDigestId: revalidationDigestId,
        workflowStateClaimId: revalidationWorkflowStateClaimId
      });
      expect((structured.clickCandidateWitness as Record<string, unknown>).residue).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Older supported movement was revalidated")
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("allows commit-precondition candidates for missing workflow confirmation", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const initialDigestId = await submitDigest(client, "observation-fixed-2");
      const moveResult = await client.callTool({
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
          perceptionDigestId: initialDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(observeResult).observation as Record<
        string,
        unknown
      >;
      const followUpObservationId = followUpObservation.observationId as string;
      const followUpDigestId = await submitDigest(client, followUpObservationId);
      await submitSupportedAssessment(client, moveActionId, followUpDigestId);
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        followUpObservationId,
        followUpDigestId,
        {
          actionRole: "commit_precondition",
          preconditionStatus: "not_satisfied",
          transientStateRisk: "present",
          missingConfirmation: "click Submit row to commit the workflow state",
          intendedActionMeaning: "click Submit row to commit the workflow precondition"
        }
      );

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: followUpObservationId,
          perceptionDigestId: followUpDigestId,
          workflowStateClaimId,
          movementActionId: moveActionId,
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
      expect(structured.hoverTargetWitness).toMatchObject({
        workflowActionRole: "commit_precondition"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("accepts equivalent digest and click-candidate target wording", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const initialDigestId = await submitDigest(client, "observation-fixed-2");
      const moveResult = await client.callTool({
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
          perceptionDigestId: initialDigestId,
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const observeResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-click-candidate-001",
          targetScope: {
            kind: "window_title",
            value: "Generated Test App"
          },
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(observeResult).observation as Record<
        string,
        unknown
      >;
      const followUpObservationId = followUpObservation.observationId as string;
      const followUpDigestId = await submitDigest(client, followUpObservationId, {
        intendedTarget: "The Submit control"
      });
      await submitSupportedAssessment(client, moveActionId, followUpDigestId);
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        followUpObservationId,
        followUpDigestId,
        {
          intendedElementTarget: "Submit target"
        }
      );

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: followUpObservationId,
          perceptionDigestId: followUpDigestId,
          workflowStateClaimId,
          movementActionId: moveActionId,
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
        perceptionDigestEvidence: {
          targetMatches: true,
          requestedTargetCanonical: "submit",
          digestTargetCanonical: "submit"
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
      const digestId = await submitDigest(client, "observation-fixed-2");
      const workflowStateClaimId = await submitWorkflowStateClaim(
        client,
        "observation-fixed-2",
        digestId
      );
      const moveResult = await client.callTool({
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
          perceptionDigestId: digestId,
          compactRelationalClaim: compactClaim("observation-fixed-2")
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
          workflowStateClaimId,
          movementActionId: moveAction.actionId,
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
      const digestId = await submitDigest(client, "observation-fixed-2");
      setNow("2026-05-27T10:00:06.000Z");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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

  it("marks non-visible perception digests as not click-ready", async () => {
    const { client, server } = await createConnectedClient();

    try {
      await startAndObserve(client);
      const digestId = await submitDigest(client, "observation-fixed-2", {
        targetVisibility: "not_visible",
        continuityWithPriorClaim: "changed",
        contradictionToPriorClaim: "The target is no longer visible in the live screenshot.",
        currentEvidence: "The current screenshot no longer shows the target row/control."
      });

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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
      expect(structured.status).toBe("perception_digest_not_visible");
      expect(structured.clickCandidateWitness).toMatchObject({
        readyForClickRequest: false,
        perceptionDigestEvidence: {
          targetVisibility: "not_visible",
          continuityWithPriorClaim: "changed"
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
      const digestId = await submitDigest(client, "observation-fixed-2");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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
      const digestId = await submitDigest(client, "observation-fixed-2");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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
      const digestId = await submitDigest(client, "observation-fixed-2");

      const result = await client.callTool({
        name: "desktop_evaluate_click_candidate",
        arguments: {
          sessionId: "session-click-candidate-001",
          observationId: "observation-fixed-2",
          perceptionDigestId: digestId,
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
