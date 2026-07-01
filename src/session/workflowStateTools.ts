import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  desktopEvidenceFresh,
  desktopEvidenceFreshnessMaxAgeMs,
  desktopInteractionScopesMatch,
  desktopSubmitWorkflowStateClaimInputSchema,
  formatNullableStringForAudit,
  normalizeNoContradiction,
  semanticTargetCanonicalForm,
  semanticTargetsEquivalent,
  type DesktopObservationPacket,
  type DesktopPerceptionDigest,
  type DesktopSessionAuditEvent,
  type DesktopInteractionSessionLicense,
  type DesktopSessionStopCondition,
  type DesktopWorkflowStateClaim
} from "../policy/sessionLicensePolicy.js";
import {
  applyWorkflowPostconditionAssessment,
  repairDispositionRequiresAttempt,
  withExpectedDeltaRepairReset,
  withPostActionRepairAttempt,
  type InteractionTransitionGate
} from "./interactionTransitionGate.js";
import {
  buildDesktopAgentGuidance,
  guidanceCodeForToolError
} from "./agentGuidance.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError
} from "./sessionStore.js";

export interface WorkflowStateToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  now: () => string;
  generateId: (prefix: string) => string;
}

function structuredResult(value: Record<string, unknown>, isError = false) {
  return {
    structuredContent: value,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    isError
  };
}

function workflowStateToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No workflow-state claim was recorded."]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "workflow_state_tool_error",
        message:
          error instanceof Error ? error.message : "Unknown workflow-state tool error."
      },
      residue: ["No workflow-state claim was recorded."]
    },
    true
  );
}

function observationHasImagePayload(observation: DesktopObservationPacket): boolean {
  return observation.frames.some(
    (frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0
  );
}

function latestObservationId(observations: DesktopObservationPacket[]): string | undefined {
  return observations.at(-1)?.observationId;
}

function frameHashesMatch(
  sourceObservationFrameHashes: string[],
  observation: DesktopObservationPacket
): boolean {
  const observationHashes = observation.frames.map((frame) => frame.sha256);

  return (
    sourceObservationFrameHashes.length === observationHashes.length &&
    sourceObservationFrameHashes.every((hash, index) => hash === observationHashes[index])
  );
}

function validateWorkflowClaimInputs(input: {
  observation: DesktopObservationPacket;
  latestObservationId?: string;
  digest: DesktopPerceptionDigest | undefined;
  targetScope: DesktopWorkflowStateClaim["targetScope"];
  intendedElementTarget: string;
  perceptionDigestId: string;
  now: string;
  sessionLicense: DesktopInteractionSessionLicense;
}): { ok: true } | { ok: false; code: string; message: string; residue: string[] } {
  if (input.latestObservationId !== input.observation.observationId) {
    return {
      ok: false,
      code: "workflow_state_claim_not_latest",
      message:
        "Workflow-state claim must be submitted for the latest recorded observation.",
      residue: [
        `Latest observationId: ${input.latestObservationId ?? "none"}.`,
        `Workflow claim observationId: ${input.observation.observationId}.`
      ]
    };
  }

  if (!desktopInteractionScopesMatch(input.observation.targetScope, input.targetScope)) {
    return {
      ok: false,
      code: "workflow_state_claim_scope_mismatch",
      message:
        "Workflow-state claim target scope must match the referenced observation target scope.",
      residue: [
        "The agent must re-ground workflow readiness against the current scoped observation."
      ]
    };
  }

  if (input.observation.frames.length === 0 || !observationHasImagePayload(input.observation)) {
    return {
      ok: false,
      code: "missing_frame_evidence",
      message:
        "Workflow-state claim requires a screenshot-bearing observation with image payload.",
      residue: ["Call desktop_observe with includeImages: true before submitting a workflow-state claim."]
    };
  }

  if (input.digest === undefined) {
    return {
      ok: false,
      code: "perception_digest_not_found",
      message: "Workflow-state claim requires an existing perception digest.",
      residue: [`perceptionDigestId: ${input.perceptionDigestId}.`]
    };
  }

  if (input.digest.observationId !== input.observation.observationId) {
    return {
      ok: false,
      code: "workflow_state_claim_digest_mismatch",
      message:
        "Workflow-state claim perception digest must be bound to the same observation.",
      residue: [
        `Observation id: ${input.observation.observationId}.`,
        `Digest observationId: ${input.digest.observationId}.`
      ]
    };
  }

  if (!desktopInteractionScopesMatch(input.digest.targetScope, input.targetScope)) {
    return {
      ok: false,
      code: "workflow_state_claim_digest_mismatch",
      message:
        "Workflow-state claim target scope must match the perception digest target scope.",
      residue: ["No workflow-state claim was recorded."]
    };
  }

  if (!semanticTargetsEquivalent(input.digest.intendedTarget, input.intendedElementTarget)) {
    return {
      ok: false,
      code: "workflow_state_claim_target_mismatch",
      message:
        "Workflow-state claim intended element target must match the perception digest target.",
      residue: [
        `Digest target: ${input.digest.intendedTarget}.`,
        `Workflow target: ${input.intendedElementTarget}.`,
        `Digest target canonical: ${semanticTargetCanonicalForm(input.digest.intendedTarget)}.`,
        `Workflow target canonical: ${semanticTargetCanonicalForm(input.intendedElementTarget)}.`
      ]
    };
  }

  if (!frameHashesMatch(input.digest.sourceObservationFrameHashes, input.observation)) {
    return {
      ok: false,
      code: "workflow_state_claim_digest_mismatch",
      message:
        "Workflow-state claim perception digest frame hashes must match the referenced observation.",
      residue: ["No workflow-state claim was recorded."]
    };
  }

  if (
    !desktopEvidenceFresh(
      input.sessionLicense,
      "perception_digest",
      input.digest.createdAt,
      input.now
    )
  ) {
    return {
      ok: false,
      code: "stale_perception_digest",
      message:
        "Workflow-state claim perception digest is older than the perception-digest freshness tier allows.",
      residue: [
        `perceptionDigestMaxAgeMs: ${desktopEvidenceFreshnessMaxAgeMs(input.sessionLicense, "perception_digest")}.`,
        "Submit a fresh perception digest before workflow-state readiness."
      ]
    };
  }

  return { ok: true };
}

function validateTransitionClaim(input: {
  transitionGate: InteractionTransitionGate | undefined;
  transitionActionId: string | undefined;
  observationId: string;
  postconditionStatus: DesktopWorkflowStateClaim["postconditionStatus"];
}): { ok: true } | { ok: false; code: string; message: string; residue: string[] } {
  if (input.transitionActionId === undefined) {
    return { ok: true };
  }

  if (input.transitionGate === undefined) {
    return {
      ok: false,
      code: "transition_gate_not_found",
      message: "The referenced transition gate does not exist.",
      residue: ["No workflow-state claim was recorded."]
    };
  }

  if (input.transitionGate.followUpObservationId !== input.observationId) {
    return {
      ok: false,
      code: "workflow_state_claim_transition_mismatch",
      message:
        "Workflow postcondition claims must reference the transition follow-up observation.",
      residue: [
        `Workflow claim observationId: ${input.observationId}.`,
        `Transition followUpObservationId: ${input.transitionGate.followUpObservationId ?? "missing"}.`
      ]
    };
  }

  if (
    input.postconditionStatus === undefined ||
    input.postconditionStatus === "not_applicable"
  ) {
    return {
      ok: false,
      code: "workflow_postcondition_status_required",
      message:
        "Workflow postcondition claims with transitionActionId require satisfied, contradicted, or inconclusive status.",
      residue: ["No workflow-state claim was recorded."]
    };
  }

  return { ok: true };
}

function stopConditionForWorkflowAssessment(
  sessionId: string,
  gate: InteractionTransitionGate
): DesktopSessionStopCondition {
  return {
    condition:
      gate.postActionClassification?.kind === "wrong_target"
        ? "workflow_state_contradicted"
        : "workflow_precondition_not_satisfied",
    sessionId,
    actionId: gate.actionId,
    reason:
      gate.postActionClassification?.reason ??
      "Workflow postcondition requires repair or escalation before another action.",
    residue: gate.postActionClassification?.residue ?? gate.residue
  };
}

function accountForWorkflowAssessment(
  runtime: WorkflowStateToolRuntime,
  sessionId: string,
  gate: InteractionTransitionGate,
  alreadyAccountedRepair: boolean
): { transitionGate: InteractionTransitionGate; stopCondition?: DesktopSessionStopCondition } {
  const classification = gate.postActionClassification;

  if (classification === undefined) {
    return { transitionGate: gate };
  }

  if (classification.kind === "expected_delta") {
    runtime.sessionStore.resetRepairAttemptCount(sessionId);
    return {
      transitionGate: withExpectedDeltaRepairReset(gate, runtime.now())
    };
  }

  if (repairDispositionRequiresAttempt(classification)) {
    const session = runtime.sessionStore.requireActiveSession(sessionId);
    const currentRepairAttemptCount = session.repairAttemptCount;
    const maxRepairAttempts = session.license.riskLimits.maxConsecutiveRepairAttempts;

    if (alreadyAccountedRepair) {
      return {
        transitionGate: withPostActionRepairAttempt(
          gate,
          currentRepairAttemptCount,
          currentRepairAttemptCount >= maxRepairAttempts,
          runtime.now()
        )
      };
    }

    if (currentRepairAttemptCount >= maxRepairAttempts) {
      const transitionGate = withPostActionRepairAttempt(
        gate,
        currentRepairAttemptCount,
        true,
        runtime.now()
      );

      return {
        transitionGate,
        stopCondition: stopConditionForWorkflowAssessment(sessionId, transitionGate)
      };
    }

    const repairAttemptCount = runtime.sessionStore.incrementRepairAttemptCount(
      sessionId
    );
    return {
      transitionGate: withPostActionRepairAttempt(
        gate,
        repairAttemptCount,
        false,
        runtime.now()
      )
    };
  }

  return {
    transitionGate: gate,
    stopCondition: stopConditionForWorkflowAssessment(sessionId, gate)
  };
}

export type WorkflowStateRecordResult =
  | {
      ok: true;
      sessionId: string;
      status: "accepted";
      workflowStateClaim: DesktopWorkflowStateClaim;
      workflowStateClaimId: string;
      createdAt: string;
      sourceObservationFrameHashes: string[];
      transitionGate?: InteractionTransitionGate;
      postActionStopCondition?: DesktopSessionStopCondition;
      auditEvent: DesktopSessionAuditEvent;
      residue: string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
      residue: string[];
    };

export function recordWorkflowStateClaim(
  runtime: WorkflowStateToolRuntime,
  input: unknown
): WorkflowStateRecordResult {
  const parsedInput = desktopSubmitWorkflowStateClaimInputSchema.parse(input);
  const session = runtime.sessionStore.requireActiveSession(parsedInput.sessionId);
  const observation = runtime.sessionStore.getObservation(
    parsedInput.sessionId,
    parsedInput.observationId
  );

  if (observation === undefined) {
    return {
      ok: false,
      error: {
        code: "observation_not_found",
        message:
          `Observation ${parsedInput.observationId} does not exist in session ${parsedInput.sessionId}.`
      },
      residue: ["No workflow-state claim was recorded."]
    };
  }

  const perceptionDigest = runtime.sessionStore.getPerceptionDigest(
    parsedInput.sessionId,
    parsedInput.perceptionDigestId
  );
  const inputCheck = validateWorkflowClaimInputs({
    observation,
    latestObservationId: latestObservationId(
      runtime.sessionStore.listObservations(parsedInput.sessionId)
    ),
    digest: perceptionDigest,
    targetScope: parsedInput.targetScope,
    intendedElementTarget: parsedInput.intendedElementTarget,
    perceptionDigestId: parsedInput.perceptionDigestId,
    now: runtime.now(),
    sessionLicense: session.license
  });

  if (!inputCheck.ok) {
    return {
      ok: false,
      error: {
        code: inputCheck.code,
        message: inputCheck.message
      },
      residue: inputCheck.residue
    };
  }

  const transitionGate =
    parsedInput.transitionActionId === undefined
      ? undefined
      : runtime.sessionStore.getTransitionGate(
          parsedInput.sessionId,
          parsedInput.transitionActionId
        );
  const transitionCheck = validateTransitionClaim({
    transitionGate,
    transitionActionId: parsedInput.transitionActionId,
    observationId: parsedInput.observationId,
    postconditionStatus: parsedInput.postconditionStatus
  });

  if (!transitionCheck.ok) {
    return {
      ok: false,
      error: {
        code: transitionCheck.code,
        message: transitionCheck.message
      },
      residue: transitionCheck.residue
    };
  }

  const normalizedMissingConfirmation = normalizeNoContradiction(
    parsedInput.missingConfirmation
  );
  const normalizedCurrentContradiction = normalizeNoContradiction(
    parsedInput.currentContradiction
  );
  const normalizationResidue = [
    ...(parsedInput.missingConfirmation !== null && normalizedMissingConfirmation === null
      ? [
          `missingConfirmation sentinel ${JSON.stringify(parsedInput.missingConfirmation)} was normalized to JSON null.`
        ]
      : []),
    ...(parsedInput.currentContradiction !== null && normalizedCurrentContradiction === null
      ? [
          `currentContradiction sentinel ${JSON.stringify(parsedInput.currentContradiction)} was normalized to JSON null.`
        ]
      : [])
  ];
  const claim: DesktopWorkflowStateClaim = {
    ...parsedInput,
    missingConfirmation: normalizedMissingConfirmation,
    currentContradiction: normalizedCurrentContradiction,
    workflowStateClaimId: runtime.generateId("workflow-state"),
    createdAt: runtime.now(),
    sourceObservationFrameHashes: observation.frames.map((frame) => frame.sha256),
    status: "accepted"
  };
  const recordedClaim = runtime.sessionStore.recordWorkflowStateClaim(claim);
  const alreadyAccountedRepair =
    transitionGate !== undefined &&
    repairDispositionRequiresAttempt(transitionGate.postActionClassification) &&
    transitionGate.postActionClassification?.repairAttemptCount !== undefined;
  const assessedTransitionGate =
    transitionGate === undefined
      ? undefined
      : accountForWorkflowAssessment(
          runtime,
          parsedInput.sessionId,
          applyWorkflowPostconditionAssessment(
            transitionGate,
            recordedClaim,
            runtime.now()
          ),
          alreadyAccountedRepair
        );

  if (assessedTransitionGate !== undefined) {
    runtime.sessionStore.updateTransitionGate(
      assessedTransitionGate.transitionGate
    );

    if (assessedTransitionGate.stopCondition !== undefined) {
      runtime.sessionStore.appendStopCondition(
        assessedTransitionGate.stopCondition
      );
    }
  }

  const auditEvent: DesktopSessionAuditEvent = {
    eventId: `event-${recordedClaim.workflowStateClaimId}`,
    sessionId: parsedInput.sessionId,
    eventType: "workflow_state_claim_recorded",
    occurredAt: recordedClaim.createdAt,
    observationId: parsedInput.observationId,
    actionId: parsedInput.transitionActionId,
    summary:
      `Recorded workflow-state claim for ${parsedInput.intendedElementTarget}.`,
    residue: [
      "Workflow-state claim is client-authored; the server did not inspect or interpret pixels.",
      "Claim is bound to the latest screenshot-bearing observation, perception digest, and frame hashes.",
      `actionRole: ${recordedClaim.actionRole}.`,
      `preconditionStatus: ${recordedClaim.preconditionStatus}.`,
      `transientStateRisk: ${recordedClaim.transientStateRisk}.`,
      `currentContradiction: ${formatNullableStringForAudit(recordedClaim.currentContradiction)}.`,
      ...normalizationResidue
    ]
  };

  runtime.sessionStore.appendAuditEvent(auditEvent);

  return {
    ok: true,
    sessionId: parsedInput.sessionId,
    status: "accepted",
    workflowStateClaim: recordedClaim,
    workflowStateClaimId: recordedClaim.workflowStateClaimId,
    createdAt: recordedClaim.createdAt,
    sourceObservationFrameHashes: recordedClaim.sourceObservationFrameHashes,
    transitionGate: assessedTransitionGate?.transitionGate,
    postActionStopCondition: assessedTransitionGate?.stopCondition,
    auditEvent,
    residue: [
      "Workflow-state claim was recorded in session state and audit log.",
      "Future click/type actions must reference this claim before any newer observation is recorded, unless bounded workflow revalidation applies across observation/move-only evidence.",
      ...normalizationResidue
    ]
  };
}

export function registerWorkflowStateTools(
  server: McpServer,
  runtime: WorkflowStateToolRuntime
): void {
  server.registerTool(
    "desktop_submit_workflow_state_claim",
    {
      title: "Submit Desktop Workflow State Claim",
      description:
        "Record an agent-authored workflow-state claim for the latest screenshot-bearing observation. The server validates freshness and provenance only; it does not analyze pixels.",
      inputSchema: desktopSubmitWorkflowStateClaimInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const session = runtime.sessionStore.requireActiveSession(input.sessionId);
        const observation = runtime.sessionStore.getObservation(
          input.sessionId,
          input.observationId
        );

        if (observation === undefined) {
          return structuredResult(
            {
              error: {
                code: "observation_not_found",
                message:
                  `Observation ${input.observationId} does not exist in session ${input.sessionId}.`
              },
              residue: ["No workflow-state claim was recorded."]
            },
            true
          );
        }

        const perceptionDigest = runtime.sessionStore.getPerceptionDigest(
          input.sessionId,
          input.perceptionDigestId
        );
        const inputCheck = validateWorkflowClaimInputs({
          observation,
          latestObservationId: latestObservationId(
            runtime.sessionStore.listObservations(input.sessionId)
          ),
          digest: perceptionDigest,
          targetScope: input.targetScope,
          intendedElementTarget: input.intendedElementTarget,
          perceptionDigestId: input.perceptionDigestId,
          now: runtime.now(),
          sessionLicense: session.license
        });

        if (!inputCheck.ok) {
          return structuredResult(
            {
              error: {
                code: inputCheck.code,
                message: inputCheck.message
              },
              agentGuidance: buildDesktopAgentGuidance({
                code:
                  guidanceCodeForToolError(inputCheck.code) ??
                  "workflow_state_revalidation_required",
                sessionId: input.sessionId,
                observationId: input.observationId,
                targetScope: input.targetScope,
                intendedTarget: input.intendedElementTarget,
                perceptionDigestId: input.perceptionDigestId
              }),
              residue: inputCheck.residue
            },
            true
          );
        }

        const transitionGate =
          input.transitionActionId === undefined
            ? undefined
            : runtime.sessionStore.getTransitionGate(
                input.sessionId,
                input.transitionActionId
              );
        const transitionCheck = validateTransitionClaim({
          transitionGate,
          transitionActionId: input.transitionActionId,
          observationId: input.observationId,
          postconditionStatus: input.postconditionStatus
        });

        if (!transitionCheck.ok) {
          return structuredResult(
            {
              error: {
                code: transitionCheck.code,
                message: transitionCheck.message
              },
              agentGuidance: buildDesktopAgentGuidance({
                code:
                  guidanceCodeForToolError(transitionCheck.code) ??
                  "closed_loop_landing_assessment_required",
                sessionId: input.sessionId,
                observationId: input.observationId,
                targetScope: input.targetScope,
                intendedTarget: input.intendedElementTarget,
                perceptionDigestId: input.perceptionDigestId,
                transitionActionId: input.transitionActionId
              }),
              residue: transitionCheck.residue
            },
            true
          );
        }

        const normalizedMissingConfirmation = normalizeNoContradiction(
          input.missingConfirmation
        );
        const normalizedCurrentContradiction = normalizeNoContradiction(
          input.currentContradiction
        );
        const normalizationResidue = [
          ...(input.missingConfirmation !== null && normalizedMissingConfirmation === null
            ? [
                `missingConfirmation sentinel ${JSON.stringify(input.missingConfirmation)} was normalized to JSON null.`
              ]
            : []),
          ...(input.currentContradiction !== null && normalizedCurrentContradiction === null
            ? [
                `currentContradiction sentinel ${JSON.stringify(input.currentContradiction)} was normalized to JSON null.`
              ]
            : [])
        ];
        const claim: DesktopWorkflowStateClaim = {
          ...input,
          missingConfirmation: normalizedMissingConfirmation,
          currentContradiction: normalizedCurrentContradiction,
          workflowStateClaimId: runtime.generateId("workflow-state"),
          createdAt: runtime.now(),
          sourceObservationFrameHashes: observation.frames.map((frame) => frame.sha256),
          status: "accepted"
        };
        const recordedClaim = runtime.sessionStore.recordWorkflowStateClaim(claim);
        const alreadyAccountedRepair =
          transitionGate !== undefined &&
          repairDispositionRequiresAttempt(transitionGate.postActionClassification) &&
          transitionGate.postActionClassification?.repairAttemptCount !== undefined;
        const assessedTransitionGate =
          transitionGate === undefined
            ? undefined
            : accountForWorkflowAssessment(
                runtime,
                input.sessionId,
                applyWorkflowPostconditionAssessment(
                  transitionGate,
                  recordedClaim,
                  runtime.now()
                ),
                alreadyAccountedRepair
              );

        if (assessedTransitionGate !== undefined) {
          runtime.sessionStore.updateTransitionGate(
            assessedTransitionGate.transitionGate
          );

          if (assessedTransitionGate.stopCondition !== undefined) {
            runtime.sessionStore.appendStopCondition(
              assessedTransitionGate.stopCondition
            );
          }
        }

        const auditEvent: DesktopSessionAuditEvent = {
          eventId: `event-${recordedClaim.workflowStateClaimId}`,
          sessionId: input.sessionId,
          eventType: "workflow_state_claim_recorded",
          occurredAt: recordedClaim.createdAt,
          observationId: input.observationId,
          actionId: input.transitionActionId,
          summary:
            `Recorded workflow-state claim for ${input.intendedElementTarget}.`,
          residue: [
            "Workflow-state claim is client-authored; the server did not inspect or interpret pixels.",
            "Claim is bound to the latest screenshot-bearing observation, perception digest, and frame hashes.",
            `actionRole: ${recordedClaim.actionRole}.`,
            `preconditionStatus: ${recordedClaim.preconditionStatus}.`,
            `transientStateRisk: ${recordedClaim.transientStateRisk}.`,
            `currentContradiction: ${formatNullableStringForAudit(recordedClaim.currentContradiction)}.`,
            ...normalizationResidue
          ]
        };

        runtime.sessionStore.appendAuditEvent(auditEvent);

        return structuredResult({
          sessionId: input.sessionId,
          status: "accepted",
          workflowStateClaim: recordedClaim,
          workflowStateClaimId: recordedClaim.workflowStateClaimId,
          createdAt: recordedClaim.createdAt,
          sourceObservationFrameHashes: recordedClaim.sourceObservationFrameHashes,
          transitionGate: assessedTransitionGate?.transitionGate,
          postActionStopCondition: assessedTransitionGate?.stopCondition,
          auditEvent,
          residue: [
            "Workflow-state claim was recorded in session state and audit log.",
            "Future click/type actions must reference this claim before any newer observation is recorded.",
            ...normalizationResidue
          ]
        });
      } catch (error: unknown) {
        return workflowStateToolError(error);
      }
    }
  );
}
