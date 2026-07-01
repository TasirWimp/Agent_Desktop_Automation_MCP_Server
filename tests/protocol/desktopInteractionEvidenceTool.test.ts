import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { InMemoryDesktopSessionStore } from "../../src/session/sessionStore.js";

const fixedNow = "2026-05-27T10:00:00.000Z";

async function createConnectedClient() {
  const sessionStore = new InMemoryDesktopSessionStore();
  let idCounter = 0;
  const server = createServer({
    sessionStore,
    now: () => fixedNow,
    generateId: (prefix) => `${prefix}-fixed-${++idCounter}`
  });
  const client = new Client({
    name: "desktop-interaction-evidence-test-client",
    version: "0.1.0"
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    sessionStore
  };
}

function parseStructuredContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  return result.structuredContent as Record<string, unknown>;
}

const targetScope = {
  kind: "window_title",
  value: "Generated Test App"
};

const startArguments = {
  sessionId: "session-interaction-evidence-001",
  userGoal: "Run the generated app UI test scenario.",
  userConfirmed: true,
  visibleContentAcknowledged: true,
  allowedScopes: [targetScope],
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
    scope: targetScope,
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

async function startAndObserve(client: Client) {
  await client.callTool({
    name: "desktop_start_interaction_session",
    arguments: startArguments
  });

  const observeResult = await client.callTool({
    name: "desktop_observe",
    arguments: {
      sessionId: "session-interaction-evidence-001",
      targetScope,
      includeImages: true
    }
  });

  return parseStructuredContent(observeResult).observation as Record<string, unknown>;
}

function perceptionEvidence(evidence: string) {
  return {
    currentScene: "Generated Test App main view.",
    currentAnchor: "Submit row",
    targetVisibility: "visible",
    anchorVisibility: "visible",
    contradictionToPriorClaim: null,
    staleCarryoverReviewed: true,
    currentEvidence: evidence
  };
}

function workflowEvidence() {
  return {
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
    staleCarryoverReviewed: true
  };
}

function bindingEvidence() {
  return {
    expectedApp: "Generated Test App",
    expectedWindow: "Generated Test App",
    bindingStatus: "confirmed",
    windowIdentityEvidence:
      "Active-window metadata identifies the Generated Test App.",
    visualBindingEvidence:
      "The visual artifact shows the Generated Test App body.",
    geometryEvidence:
      "The observation frame is app-sized and not a tiny child surface.",
    contradiction: null,
    staleCarryoverReviewed: true
  };
}

describe("desktop_submit_interaction_evidence MCP tool", () => {
  it("returns repair guidance when clean evidence carries a contradiction", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const observation = await startAndObserve(client);
      const observationId = observation.observationId as string;
      const result = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: {
            ...perceptionEvidence("Corrected screenshot shows the Submit control."),
            contradictionToPriorClaim: "The prior attempt hovered the wrong row."
          }
        }
      });
      const evidence = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(evidence.error).toMatchObject({
        code: "interaction_evidence_contradiction_present"
      });
      expect(evidence.agentGuidance).toMatchObject({
        code: "repair_digest_requires_clean_exit",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          arguments: expect.objectContaining({
            sessionId: "session-interaction-evidence-001",
            observationId,
            intendedTarget: "Submit button",
            evidenceMode: "same_target"
          })
        },
        sourceDocs: expect.arrayContaining([
          expect.objectContaining({
            path: "docs/process/codex_desktop_interaction_reentry.md"
          })
        ])
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("blocks suspect app-scope binding evidence before recording target evidence", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const observation = await startAndObserve(client);
      const observationId = observation.observationId as string;
      const result = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          bindingEvidence: {
            ...bindingEvidence(),
            bindingStatus: "suspect"
          },
          perception: perceptionEvidence("Initial screenshot shows the Submit control.")
        }
      });
      const evidence = parseStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(evidence.status).toBe("blocked");
      expect(evidence.error).toMatchObject({
        code: "app_scope_binding_evidence_suspect"
      });
      expect(evidence.nextRequiredStep).toMatchObject({
        tool: "desktop_submit_interaction_evidence"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records digest, workflow, transition assessment, and click candidate without desktop mutation", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const initialObservation = await startAndObserve(client);
      const initialObservationId = initialObservation.observationId as string;
      const initialEvidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: initialObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: perceptionEvidence("Initial screenshot shows the Submit control.")
        }
      });
      const initialEvidence = parseStructuredContent(initialEvidenceResult);

      expect(initialEvidenceResult.isError).not.toBe(true);
      expect(initialEvidence.status).toBe("accepted");

      const moveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          preActionObservationId: initialObservationId,
          point: {
            x: 120,
            y: 80
          },
          perceptionDigestId: initialEvidence.perceptionDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim(initialObservationId)
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const followUpResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(followUpResult)
        .observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const evidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "same_target",
          bindingEvidence: bindingEvidence(),
          perception: perceptionEvidence("Follow-up screenshot confirms Submit hover target."),
          workflow: workflowEvidence(),
          transitionAssessment: {
            actionId: moveActionId,
            assessment: {
              outcome: "supported",
              relationHeld: true,
              candidateSupported: true,
              rejectedAlternativeAvoided: true,
              expectedEvidenceSeen: "row/control highlights or opens target",
              contradictionSeen: false,
              summary: "Follow-up screenshot supports the target row/control."
            }
          },
          clickCandidate: {
            movementActionId: moveActionId,
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const evidence = parseStructuredContent(evidenceResult);

      expect(evidenceResult.isError).not.toBe(true);
      expect(evidence.status).toBe("accepted");
      expect(evidence.appScopeBindingEvidenceId).toEqual(
        expect.stringMatching(/^app-scope-binding-evidence-/u)
      );
      expect(evidence.perceptionDigestId).toEqual(expect.stringMatching(/^perception-digest-/u));
      expect(evidence.workflowStateClaimId).toEqual(expect.stringMatching(/^workflow-state-/u));
      expect(evidence.hoverTargetWitnessId).toEqual(expect.stringMatching(/^hover-witness-/u));
      expect(evidence.clickCandidateStatus).toBe("candidate_ready");
      expect(evidence.created).toMatchObject({
        workflowStateClaim: {
          actionRole: "execute_committed_action"
        },
        transitionGate: {
          status: "audited"
        },
        hoverTargetWitness: {
          sourceMoveActionId: moveActionId
        }
      });
      expect(evidence.nextRequiredStep).toMatchObject({
        tool: "desktop_click"
      });
      expect(sessionStore.listActions("session-interaction-evidence-001")).toHaveLength(1);
      expect(sessionStore.listHoverTargetWitnesses("session-interaction-evidence-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("records semantic landing before workflow postcondition and infers click candidate movement action", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const initialObservation = await startAndObserve(client);
      const initialObservationId = initialObservation.observationId as string;
      const initialEvidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: initialObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: perceptionEvidence("Initial screenshot shows the Submit control.")
        }
      });
      const initialEvidence = parseStructuredContent(initialEvidenceResult);
      const moveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          preActionObservationId: initialObservationId,
          point: {
            x: 120,
            y: 80
          },
          perceptionDigestId: initialEvidence.perceptionDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim(initialObservationId)
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const followUpResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(followUpResult)
        .observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const evidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "same_target",
          bindingEvidence: bindingEvidence(),
          perception: perceptionEvidence("Follow-up screenshot confirms Submit hover target."),
          transitionAssessment: {
            actionId: moveActionId,
            assessment: {
              outcome: "supported",
              relationHeld: true,
              candidateSupported: true,
              rejectedAlternativeAvoided: true,
              expectedEvidenceSeen: "row/control highlights or opens target",
              contradictionSeen: false,
              summary: "Follow-up screenshot supports the target row/control."
            }
          },
          workflow: {
            ...workflowEvidence(),
            transitionActionId: moveActionId,
            postconditionStatus: "satisfied",
            expectedPostcondition:
              "The prior movement leaves the cursor on the Submit button, ready for click."
          },
          clickCandidate: {
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const evidence = parseStructuredContent(evidenceResult);

      expect(evidenceResult.isError).not.toBe(true);
      expect(evidence.status).toBe("accepted");
      expect(evidence.hoverTargetWitnessId).toEqual(expect.stringMatching(/^hover-witness-/u));
      expect(evidence.clickCandidateStatus).toBe("candidate_ready");
      expect(evidence.created).toMatchObject({
        transitionGate: {
          semanticLandingAssessment: {
            outcome: "supported"
          }
        },
        workflowTransitionGate: {
          status: "audited",
          workflowPostconditionAssessment: {
            postconditionStatus: "satisfied"
          },
          semanticLandingAssessment: {
            outcome: "supported"
          }
        },
        hoverTargetWitness: {
          sourceMoveActionId: moveActionId
        }
      });
      expect(sessionStore.listHoverTargetWitnesses("session-interaction-evidence-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reuses recorded semantic landing when retrying after a workflow postcondition repair", async () => {
    const { client, server, sessionStore } = await createConnectedClient();

    try {
      const initialObservation = await startAndObserve(client);
      const initialObservationId = initialObservation.observationId as string;
      const initialEvidenceResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: initialObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: perceptionEvidence("Initial screenshot shows the Submit control.")
        }
      });
      const initialEvidence = parseStructuredContent(initialEvidenceResult);
      const moveResult = await client.callTool({
        name: "desktop_move_mouse",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          preActionObservationId: initialObservationId,
          point: {
            x: 120,
            y: 80
          },
          perceptionDigestId: initialEvidence.perceptionDigestId,
          intendedSemanticTarget: "Submit button",
          compactRelationalClaim: compactClaim(initialObservationId)
        }
      });
      const moveAction = parseStructuredContent(moveResult).action as Record<string, unknown>;
      const moveActionId = moveAction.actionId as string;
      const followUpResult = await client.callTool({
        name: "desktop_observe",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          targetScope,
          includeImages: true,
          transitionActionId: moveActionId
        }
      });
      const followUpObservation = parseStructuredContent(followUpResult)
        .observation as Record<string, unknown>;
      const followUpObservationId = followUpObservation.observationId as string;
      const transitionAssessment = {
        actionId: moveActionId,
        assessment: {
          outcome: "supported",
          relationHeld: true,
          candidateSupported: true,
          rejectedAlternativeAvoided: true,
          expectedEvidenceSeen: "row/control highlights or opens target",
          contradictionSeen: false,
          summary: "Follow-up screenshot supports the target row/control."
        }
      };
      const partialResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "same_target",
          bindingEvidence: bindingEvidence(),
          perception: perceptionEvidence("Follow-up screenshot confirms Submit hover target."),
          transitionAssessment,
          workflow: {
            ...workflowEvidence(),
            transitionActionId: moveActionId,
            postconditionStatus: "not_applicable"
          },
          clickCandidate: {
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const partialEvidence = parseStructuredContent(partialResult);

      expect(partialEvidence.status).toBe("partial");
      expect(partialEvidence.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: "workflow_state_claim",
            error: expect.objectContaining({
              code: "workflow_postcondition_status_required"
            })
          })
        ])
      );
      expect(partialEvidence.created).toMatchObject({
        transitionGate: {
          semanticLandingAssessment: {
            outcome: "supported"
          }
        }
      });
      expect(partialEvidence.agentGuidance).toMatchObject({
        code: "workflow_postcondition_status_required",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence"
        }
      });

      const retryResult = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId: followUpObservationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "same_target",
          bindingEvidence: bindingEvidence(),
          perception: perceptionEvidence("Follow-up screenshot confirms Submit hover target."),
          transitionAssessment,
          workflow: {
            ...workflowEvidence(),
            transitionActionId: moveActionId,
            postconditionStatus: "satisfied"
          },
          clickCandidate: {
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const retryEvidence = parseStructuredContent(retryResult);

      expect(retryResult.isError).not.toBe(true);
      expect(retryEvidence.status).toBe("accepted");
      expect(retryEvidence.hoverTargetWitnessId).toEqual(expect.stringMatching(/^hover-witness-/u));
      expect(retryEvidence.clickCandidateStatus).toBe("candidate_ready");
      expect(retryEvidence.residue).toEqual(
        expect.arrayContaining([
          "Existing semantic landing assessment was reused for the requested transition action."
        ])
      );
      expect(sessionStore.listHoverTargetWitnesses("session-interaction-evidence-001")).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("requires click candidate movement binding when no transition assessment can infer it", async () => {
    const { client, server } = await createConnectedClient();

    try {
      const observation = await startAndObserve(client);
      const observationId = observation.observationId as string;
      const result = await client.callTool({
        name: "desktop_submit_interaction_evidence",
        arguments: {
          sessionId: "session-interaction-evidence-001",
          observationId,
          targetScope,
          intendedTarget: "Submit button",
          evidenceMode: "new_target",
          perception: perceptionEvidence("Initial screenshot shows the Submit control."),
          clickCandidate: {
            candidatePoint: {
              x: 120,
              y: 80
            }
          }
        }
      });
      const evidence = parseStructuredContent(result);

      expect(result.isError).not.toBe(true);
      expect(evidence.status).toBe("partial");
      expect(evidence.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: "click_candidate",
            error: expect.objectContaining({
              code: "click_candidate_movement_action_required"
            })
          })
        ])
      );
      expect(evidence.nextRequiredStep).toMatchObject({
        tool: "desktop_submit_interaction_evidence"
      });
      expect(evidence.agentGuidance).toMatchObject({
        code: "click_candidate_movement_binding_required",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence"
        }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
