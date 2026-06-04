import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopLicensedAppScopeSchema,
  desktopInteractionScopeSchema,
  desktopSessionActionTypes,
  desktopSessionObservationCadenceSchema,
  desktopSessionRiskLimitsSchema,
  evaluateSessionStartPolicy,
  type DesktopInteractionSessionLicense,
  type DesktopSessionAuditEvent
} from "../policy/sessionLicensePolicy.js";
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
