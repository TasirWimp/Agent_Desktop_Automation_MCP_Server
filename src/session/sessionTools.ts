import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopLicensedAppScopeSchema,
  desktopCompactSemanticLandingAssessmentSchema,
  desktopInteractionScopeSchema,
  desktopInteractionScopesMatch,
  desktopSessionActionTypes,
  desktopSessionObservationCadenceSchema,
  desktopSessionRiskLimitsSchema,
  evaluateSessionStartPolicy,
  type DesktopInteractionSessionLicense,
  type DesktopObservationPacket,
  type DesktopPerceptionDigest,
  type DesktopSessionStopCondition,
  type DesktopSessionAuditEvent
} from "../policy/sessionLicensePolicy.js";
import {
  applyCompactSemanticLandingAssessment,
  repairDispositionRequiresAttempt,
  withExpectedDeltaRepairReset,
  withPostActionRepairAttempt,
  type InteractionTransitionGate
} from "./interactionTransitionGate.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError,
  type DesktopSessionSnapshot
} from "./sessionStore.js";

export interface SessionToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  now: () => string;
  generateId: (prefix: string) => string;
}

const startInteractionSessionInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  userGoal: z.string().min(1).max(2000),
  userConfirmed: z.boolean(),
  visibleContentAcknowledged: z.boolean(),
  allowedScopes: z.array(desktopInteractionScopeSchema).min(1),
  allowedActions: z.array(z.enum(desktopSessionActionTypes)).min(1),
  forbiddenActions: z.array(z.enum(desktopSessionActionTypes)),
  licensedAppScope: desktopLicensedAppScopeSchema.optional(),
  riskLimits: desktopSessionRiskLimitsSchema,
  observationCadence: desktopSessionObservationCadenceSchema,
  expiresAt: z.string().min(1).optional()
});

const endInteractionSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().min(1).max(1000)
});

const sessionAuditLogInputSchema = z.object({
  sessionId: z.string().min(1)
});

const submitTransitionAssessmentInputSchema = z.object({
  sessionId: z.string().min(1),
  actionId: z.string().min(1),
  perceptionDigestId: z.string().min(1),
  assessment: desktopCompactSemanticLandingAssessmentSchema
});

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

function summarizeSession(snapshot: DesktopSessionSnapshot) {
  return {
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    endedAt: snapshot.endedAt,
    endReason: snapshot.endReason,
    userGoal: snapshot.license.userGoal,
    allowedScopes: snapshot.license.allowedScopes,
    allowedActions: snapshot.license.allowedActions,
    forbiddenActions: snapshot.license.forbiddenActions,
    licensedAppScope: snapshot.license.licensedAppScope,
    boundAppScope: snapshot.boundAppScope,
    actionCount: snapshot.actionCount,
    repairAttemptCount: snapshot.repairAttemptCount,
    auditEventCount: snapshot.auditEvents.length,
    observationCount: snapshot.observations.length,
    actionRecordCount: snapshot.actions.length,
    stopConditionCount: snapshot.stopConditions.length
  };
}

function sessionToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        }
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "session_tool_error",
        message: error instanceof Error ? error.message : "Unknown session tool error."
      }
    },
    true
  );
}

function stopConditionForAssessment(
  sessionId: string,
  gate: InteractionTransitionGate
): DesktopSessionStopCondition | undefined {
  const classification = gate.postActionClassification;

  if (classification === undefined) {
    return undefined;
  }

  if (classification.repairLimitReached) {
    return {
      condition: "max_repair_attempts_reached",
      sessionId,
      actionId: gate.actionId,
      reason:
        "The desktop interaction session reached its consecutive repair-attempt limit.",
      residue: classification.residue
    };
  }

  if (classification.kind === "risk_prompt") {
    return {
      condition: "forbidden_boundary_detected",
      sessionId,
      actionId: gate.actionId,
      reason:
        "The transition assessment indicates a forbidden or high-risk app boundary.",
      residue: classification.residue
    };
  }

  if (classification.kind === "scope_exit") {
    return {
      condition: "outside_allowed_scope",
      sessionId,
      actionId: gate.actionId,
      reason: "The transition assessment indicates scope exit.",
      residue: classification.residue
    };
  }

  if (classification.kind === "uninterpretable_state") {
    return {
      condition: "uninterpretable_post_action_state",
      sessionId,
      actionId: gate.actionId,
      reason: "The transition assessment could not be interpreted safely.",
      residue: classification.residue
    };
  }

  return undefined;
}

function observationHasImagePayload(observation: DesktopObservationPacket): boolean {
  return observation.frames.some(
    (frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0
  );
}

function latestObservationId(observations: DesktopObservationPacket[]): string | undefined {
  return observations.at(-1)?.observationId;
}

function digestFresh(
  digest: DesktopPerceptionDigest,
  now: string,
  maxObservationGapMs: number
): boolean {
  const createdMs = Date.parse(digest.createdAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(createdMs) || Number.isNaN(nowMs)) {
    return true;
  }

  return nowMs - createdMs <= maxObservationGapMs;
}

function digestFrameHashesMatch(
  digest: DesktopPerceptionDigest,
  observation: DesktopObservationPacket
): boolean {
  const hashes = observation.frames.map((frame) => frame.sha256);

  return (
    digest.sourceObservationFrameHashes.length === hashes.length &&
    digest.sourceObservationFrameHashes.every((hash, index) => hash === hashes[index])
  );
}

function intendedTargetForGate(gate: InteractionTransitionGate): string | undefined {
  return (
    gate.compactRelationalClaim?.intendedTarget ??
    gate.relationalNavigation?.actionJustification.intendedSemanticTarget ??
    gate.intendedSemanticTarget
  );
}

function digestSupportsSupportedAssessment(digest: DesktopPerceptionDigest): boolean {
  return (
    digest.targetVisibility === "visible" &&
    digest.anchorVisibility !== "not_visible" &&
    (digest.continuityWithPriorClaim === "consistent" ||
      digest.continuityWithPriorClaim === "not_applicable") &&
    digest.contradictionToPriorClaim === null
  );
}

function validateTransitionAssessmentDigest(input: {
  digest: DesktopPerceptionDigest | undefined;
  transitionGate: InteractionTransitionGate;
  followUpObservation: DesktopObservationPacket | undefined;
  latestObservationId?: string;
  now: string;
  maxObservationGapMs: number;
  assessmentOutcome: "supported" | "contradicted" | "inconclusive";
}):
  | { ok: true; perceptionDigest: DesktopPerceptionDigest }
  | { ok: false; code: string; message: string; residue: string[] } {
  if (input.digest === undefined) {
    return {
      ok: false,
      code: "perception_digest_not_found",
      message: "The referenced perception digest does not exist in the session.",
      residue: ["No transition assessment was recorded."]
    };
  }

  if (input.followUpObservation === undefined) {
    return {
      ok: false,
      code: "transition_follow_up_missing",
      message: "The transition follow-up observation does not exist in the session.",
      residue: ["No transition assessment was recorded."]
    };
  }

  if (input.digest.observationId !== input.followUpObservation.observationId) {
    return {
      ok: false,
      code: "perception_digest_observation_mismatch",
      message:
        "Transition assessment digest must be bound to the transition follow-up observation.",
      residue: [
        `Digest observationId: ${input.digest.observationId}.`,
        `Transition followUpObservationId: ${input.followUpObservation.observationId}.`
      ]
    };
  }

  if (input.latestObservationId !== input.digest.observationId) {
    return {
      ok: false,
      code: "perception_digest_not_latest",
      message:
        "Transition assessment digest must be bound to the latest recorded observation.",
      residue: [
        `Latest observationId: ${input.latestObservationId ?? "none"}.`,
        `Digest observationId: ${input.digest.observationId}.`
      ]
    };
  }

  if (!digestFresh(input.digest, input.now, input.maxObservationGapMs)) {
    return {
      ok: false,
      code: "stale_perception_digest",
      message: "Transition assessment digest is older than the session cadence allows.",
      residue: ["No transition assessment was recorded."]
    };
  }

  if (!desktopInteractionScopesMatch(input.digest.targetScope, input.transitionGate.targetScope)) {
    return {
      ok: false,
      code: "perception_digest_scope_mismatch",
      message: "Transition assessment digest scope does not match the transition scope.",
      residue: ["No transition assessment was recorded."]
    };
  }

  const intendedTarget = intendedTargetForGate(input.transitionGate);

  if (intendedTarget !== undefined && input.digest.intendedTarget !== intendedTarget) {
    return {
      ok: false,
      code: "perception_digest_target_mismatch",
      message: "Transition assessment digest target does not match the transition target.",
      residue: [
        `Transition target: ${intendedTarget}.`,
        `Digest target: ${input.digest.intendedTarget}.`
      ]
    };
  }

  if (
    input.followUpObservation.frames.length === 0 ||
    !observationHasImagePayload(input.followUpObservation) ||
    !digestFrameHashesMatch(input.digest, input.followUpObservation)
  ) {
    return {
      ok: false,
      code: "perception_digest_observation_mismatch",
      message:
        "Transition assessment digest must be bound to the screenshot-bearing follow-up frame hashes.",
      residue: ["No transition assessment was recorded."]
    };
  }

  if (
    input.assessmentOutcome === "supported" &&
    !digestSupportsSupportedAssessment(input.digest)
  ) {
    return {
      ok: false,
      code: "perception_digest_does_not_support_transition",
      message:
        "A supported transition assessment requires a visible, current, non-contradicted perception digest.",
      residue: [
        `targetVisibility: ${input.digest.targetVisibility}.`,
        `anchorVisibility: ${input.digest.anchorVisibility}.`,
        `continuityWithPriorClaim: ${input.digest.continuityWithPriorClaim}.`,
        `contradictionToPriorClaim: ${input.digest.contradictionToPriorClaim ?? "none"}.`
      ]
    };
  }

  return { ok: true, perceptionDigest: input.digest };
}

function classifyAndAccountForAssessment(
  runtime: SessionToolRuntime,
  sessionId: string,
  gate: InteractionTransitionGate
): {
  transitionGate: InteractionTransitionGate;
  stopCondition?: DesktopSessionStopCondition;
} {
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

    if (currentRepairAttemptCount >= maxRepairAttempts) {
      const transitionGate = withPostActionRepairAttempt(
        gate,
        currentRepairAttemptCount,
        true,
        runtime.now()
      );

      return {
        transitionGate,
        stopCondition: stopConditionForAssessment(sessionId, transitionGate)
      };
    }

    const repairAttemptCount = runtime.sessionStore.incrementRepairAttemptCount(
      sessionId
    );
    const transitionGate = withPostActionRepairAttempt(
      gate,
      repairAttemptCount,
      false,
      runtime.now()
    );

    return { transitionGate };
  }

  return {
    transitionGate: gate,
    stopCondition: stopConditionForAssessment(sessionId, gate)
  };
}

export function registerSessionTools(server: McpServer, runtime: SessionToolRuntime): void {
  server.registerTool(
    "desktop_start_interaction_session",
    {
      title: "Start Desktop Interaction Session",
      description:
        "Start a bounded, user-confirmed desktop interaction session. This does not observe the desktop or perform mouse/keyboard actions.",
      inputSchema: startInteractionSessionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      const now = runtime.now();
      const sessionId = input.sessionId ?? runtime.generateId("session");
      const license: DesktopInteractionSessionLicense = {
        sessionId,
        userGoal: input.userGoal,
        userConfirmed: input.userConfirmed,
        visibleContentAcknowledged: input.visibleContentAcknowledged,
        allowedScopes: input.allowedScopes,
        allowedActions: input.allowedActions,
        forbiddenActions: input.forbiddenActions,
        licensedAppScope: input.licensedAppScope,
        riskLimits: input.riskLimits,
        observationCadence: input.observationCadence,
        startedAt: now,
        expiresAt: input.expiresAt
      };
      const policy = evaluateSessionStartPolicy(license);

      if (policy.decision !== "allow") {
        return structuredResult(
          {
            sessionId,
            status: "not_started",
            policy,
            residue: [
              "No session state was created.",
              "No desktop observation, mouse movement, click, or typing occurred."
            ]
          },
          true
        );
      }

      const auditEvent: DesktopSessionAuditEvent = {
        eventId: runtime.generateId("event"),
        sessionId,
        eventType: "session_started",
        occurredAt: now,
        summary: "Started licensed desktop interaction session.",
        residue: ["No desktop observation, mouse movement, click, or typing occurred."]
      };

      try {
        const session = runtime.sessionStore.createSession(license, {
          initialAuditEvent: auditEvent
        });

        return structuredResult({
          sessionId,
          status: session.status,
          policy,
          session: summarizeSession(session),
          auditEvent,
          residue: ["Session state was created. No desktop action tools are enabled in this slice."]
        });
      } catch (error: unknown) {
        return sessionToolError(error);
      }
    }
  );

  server.registerTool(
    "desktop_end_interaction_session",
    {
      title: "End Desktop Interaction Session",
      description:
        "End an active desktop interaction session and preserve its audit log. This does not perform desktop actions.",
      inputSchema: endInteractionSessionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      const auditEvent: DesktopSessionAuditEvent = {
        eventId: runtime.generateId("event"),
        sessionId: input.sessionId,
        eventType: "session_stopped",
        occurredAt: runtime.now(),
        summary: input.reason,
        residue: ["The session was ended. No desktop observation, mouse movement, click, or typing occurred."]
      };

      try {
        const session = runtime.sessionStore.endSession(input.sessionId, auditEvent);

        return structuredResult({
          sessionId: input.sessionId,
          status: session.status,
          session: summarizeSession(session),
          auditEvent,
          residue: ["Session ended and audit log remains readable."]
        });
      } catch (error: unknown) {
        return sessionToolError(error);
      }
    }
  );

  server.registerTool(
    "desktop_submit_transition_assessment",
    {
      title: "Submit Desktop Transition Assessment",
      description:
        "Attach a compact semantic landing assessment to an observed relational movement transition. Cursor coordinates are telemetry only and do not prove the target was correct.",
      inputSchema: submitTransitionAssessmentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        runtime.sessionStore.requireActiveSession(input.sessionId);
        const transitionGate = runtime.sessionStore.requireTransitionGate(
          input.sessionId,
          input.actionId
        );

        if (transitionGate.status !== "observed") {
          return structuredResult(
            {
              error: {
                code: "transition_not_observed",
                message:
                  "The referenced transition gate must be observed before a semantic landing assessment can be submitted."
              },
              transitionGate,
              residue: ["No transition assessment was recorded."]
            },
            true
          );
        }

        if (
          transitionGate.compactRelationalClaim === undefined &&
          transitionGate.relationalNavigation === undefined
        ) {
          return structuredResult(
            {
              error: {
                code: "transition_assessment_not_applicable",
                message:
                  "The referenced transition gate is not claim-bound and does not accept semantic landing assessment."
              },
              transitionGate,
              residue: ["No transition assessment was recorded."]
            },
            true
          );
        }

        if (transitionGate.followUpObservationId === undefined) {
          return structuredResult(
            {
              error: {
                code: "transition_follow_up_missing",
                message:
                  "The referenced transition gate has no follow-up observation id."
              },
              transitionGate,
              residue: ["No transition assessment was recorded."]
            },
            true
          );
        }

        const session = runtime.sessionStore.requireActiveSession(input.sessionId);
        const followUpObservation = runtime.sessionStore.getObservation(
          input.sessionId,
          transitionGate.followUpObservationId
        );
        const perceptionDigest = runtime.sessionStore.getPerceptionDigest(
          input.sessionId,
          input.perceptionDigestId
        );
        const digestValidation = validateTransitionAssessmentDigest({
          digest: perceptionDigest,
          transitionGate,
          followUpObservation,
          latestObservationId: latestObservationId(
            runtime.sessionStore.listObservations(input.sessionId)
          ),
          now: runtime.now(),
          maxObservationGapMs: session.license.observationCadence.maxObservationGapMs,
          assessmentOutcome: input.assessment.outcome
        });

        if (!digestValidation.ok) {
          return structuredResult(
            {
              error: {
                code: digestValidation.code,
                message: digestValidation.message
              },
              transitionGate,
              perceptionDigest,
              residue: digestValidation.residue
            },
            true
          );
        }

        const assessedGate = applyCompactSemanticLandingAssessment(
          transitionGate,
          input.assessment,
          runtime.now()
        );
        const transitionAuditResult = classifyAndAccountForAssessment(
          runtime,
          input.sessionId,
          assessedGate
        );
        const updatedTransitionGate = runtime.sessionStore.updateTransitionGate(
          transitionAuditResult.transitionGate
        );
        const postActionStopCondition = transitionAuditResult.stopCondition;

        if (postActionStopCondition !== undefined) {
          runtime.sessionStore.appendStopCondition(postActionStopCondition);
        }

        const auditEvent: DesktopSessionAuditEvent = {
          eventId: runtime.generateId("event"),
          sessionId: input.sessionId,
          eventType: "transition_assessed",
          occurredAt: runtime.now(),
          actionId: updatedTransitionGate.actionId,
          observationId: updatedTransitionGate.followUpObservationId,
          summary:
            `Transition assessment classified as ${updatedTransitionGate.postActionClassification?.kind ?? "observed"} with status ${updatedTransitionGate.status}.`,
          residue: updatedTransitionGate.residue
        };

        runtime.sessionStore.appendAuditEvent(auditEvent);

        return structuredResult({
          sessionId: input.sessionId,
          status: updatedTransitionGate.status,
          transitionGate: updatedTransitionGate,
          perceptionDigest: digestValidation.perceptionDigest,
          postActionStopCondition,
          auditEvent,
          residue: [
            "Transition assessment was recorded in session state and audit log.",
            "The assessment is the agent's semantic comparison against the follow-up screenshot.",
            "Cursor coordinates and backend movement success remain telemetry only."
          ]
        });
      } catch (error: unknown) {
        return sessionToolError(error);
      }
    }
  );

  server.registerTool(
    "desktop_session_audit_log",
    {
      title: "Desktop Session Audit Log",
      description:
        "Read the audit log for a desktop interaction session. This is read-only and does not perform desktop actions.",
      inputSchema: sessionAuditLogInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const session = runtime.sessionStore.getSession(input.sessionId);

        if (session === undefined) {
          return structuredResult(
            {
              error: {
                code: "session_not_found",
                message: `Session ${input.sessionId} does not exist.`
              }
            },
            true
          );
        }

        return structuredResult({
          sessionId: input.sessionId,
          session: summarizeSession(session),
          auditEvents: runtime.sessionStore.listAuditEvents(input.sessionId),
          stopConditions: session.stopConditions,
          residue: ["Audit log read only. No desktop action occurred."]
        });
      } catch (error: unknown) {
        return sessionToolError(error);
      }
    }
  );
}
