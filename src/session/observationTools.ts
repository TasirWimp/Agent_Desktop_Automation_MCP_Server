import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  isDesktopInteractionScopeAllowed,
  type DesktopInteractionScope,
  type DesktopObservationPacket,
  type DesktopSessionAuditEvent,
  type DesktopSessionStopCondition
} from "../policy/sessionLicensePolicy.js";
import {
  DesktopProviderError,
  desktopObservationModes,
  type DesktopInteractionProvider
} from "../providers/desktopProvider.js";
import {
  auditInteractionTransitionGate,
  transitionGateBlocksNonObserveAction,
  type InteractionTransitionGate
} from "./interactionTransitionGate.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError,
  type DesktopSessionSnapshot
} from "./sessionStore.js";

export interface ObservationToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  desktopProvider: DesktopInteractionProvider;
  now: () => string;
  generateId: (prefix: string) => string;
}

const observeInputSchema = z.object({
  sessionId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  mode: z.enum(desktopObservationModes).default("frame_session"),
  maxFrames: z.number().int().positive().max(12).default(3),
  durationMs: z.number().int().nonnegative().max(5_000).default(250),
  frameFormat: z.literal("image/png").default("image/png"),
  includeImages: z.boolean().default(false),
  transitionActionId: z.string().min(1).optional()
});

function structuredResult(
  value: Record<string, unknown>,
  isError = false,
  extraContent: ContentBlock[] = []
) {
  return {
    structuredContent: value,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      },
      ...extraContent
    ],
    isError
  };
}

function observationToolError(error: unknown) {
  if (error instanceof DesktopProviderError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: error.residue
      },
      true
    );
  }

  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No desktop observation was recorded."]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "observation_tool_error",
        message: error instanceof Error ? error.message : "Unknown observation tool error."
      },
      residue: ["No desktop observation was recorded."]
    },
    true
  );
}

function sessionExpired(session: DesktopSessionSnapshot, now: string): boolean {
  const nowMs = Date.parse(now);
  const startedMs = Date.parse(session.license.startedAt);
  const expiresMs =
    session.license.expiresAt === undefined
      ? Number.POSITIVE_INFINITY
      : Date.parse(session.license.expiresAt);

  if (Number.isNaN(nowMs) || Number.isNaN(startedMs)) {
    return false;
  }

  return nowMs - startedMs > session.license.riskLimits.maxDurationMs || nowMs >= expiresMs;
}

function observedWindowIdentity(
  activeWindow: DesktopObservationPacket["activeWindow"]
): string | undefined {
  if (activeWindow?.windowId !== undefined && activeWindow.windowId.trim().length > 0) {
    return activeWindow.windowId;
  }

  const parts = [activeWindow?.processName, activeWindow?.title].filter(
    (part): part is string => part !== undefined && part.trim().length > 0
  );

  return parts.length === 0 ? undefined : parts.join(":");
}

function bindActiveWindowScope(
  requestedScope: DesktopInteractionScope,
  activeWindow: DesktopObservationPacket["activeWindow"]
): DesktopInteractionScope {
  if (requestedScope.kind !== "active_window" || requestedScope.value !== undefined) {
    return requestedScope;
  }

  const identity = observedWindowIdentity(activeWindow);

  return identity === undefined
    ? requestedScope
    : {
        kind: "active_window",
        value: identity
      };
}

function imageContentBlocks(observation: DesktopObservationPacket): ContentBlock[] {
  return observation.frames
    .filter((frame) => frame.dataBase64 !== undefined)
    .map((frame) => ({
      type: "image" as const,
      data: frame.dataBase64 as string,
      mimeType: frame.mimeType
    }));
}

function blockedObserveResult(
  sessionId: string,
  stopCondition: DesktopSessionStopCondition
) {
  return structuredResult(
    {
      sessionId,
      status: "not_observed",
      stopCondition,
      residue: ["No provider call was made and no desktop observation was recorded."]
    },
    true
  );
}

function transitionGateNotPendingResult(
  sessionId: string,
  transitionGate: InteractionTransitionGate
) {
  return structuredResult(
    {
      sessionId,
      status: "not_observed",
      transitionGate,
      residue: [
        `Transition gate for action ${transitionGate.actionId} is already ${transitionGate.status}.`,
        "No provider call was made and no desktop observation was recorded."
      ]
    },
    true
  );
}

export function registerObservationTools(
  server: McpServer,
  runtime: ObservationToolRuntime
): void {
  server.registerTool(
    "desktop_observe",
    {
      title: "Observe Desktop Session Frames",
      description:
        "Record a bounded, observation-only frame session for an active desktop interaction session. The default provider is mock-only and does not capture the real desktop.",
      inputSchema: observeInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const session = runtime.sessionStore.requireActiveSession(input.sessionId);
        const observedAt = runtime.now();
        const transitionGate =
          input.transitionActionId === undefined
            ? undefined
            : runtime.sessionStore.requireTransitionGate(
                input.sessionId,
                input.transitionActionId
              );

        if (!session.license.allowedActions.includes("observe")) {
          return blockedObserveResult(input.sessionId, {
            condition: "action_not_allowed",
            sessionId: input.sessionId,
            reason: "observe is not allowed by the active session license.",
            residue: ["The session remains active. No provider call was made."]
          });
        }

        if (sessionExpired(session, observedAt)) {
          return blockedObserveResult(input.sessionId, {
            condition: "session_expired",
            sessionId: input.sessionId,
            reason: "The desktop interaction session duration limit has been reached.",
            residue: ["The session remains active. No provider call was made."]
          });
        }

        if (!isDesktopInteractionScopeAllowed(session.license, input.targetScope)) {
          return blockedObserveResult(input.sessionId, {
            condition: "outside_allowed_scope",
            sessionId: input.sessionId,
            reason: "The requested observation target is outside the session's allowed scope.",
            residue: ["The session remains active. No provider call was made."]
          });
        }

        if (
          transitionGate !== undefined &&
          !transitionGateBlocksNonObserveAction(transitionGate)
        ) {
          return transitionGateNotPendingResult(input.sessionId, transitionGate);
        }

        const providerCapabilities = runtime.desktopProvider.getCapabilities();
        const providerResult = await runtime.desktopProvider.observe({
          sessionId: input.sessionId,
          targetScope: input.targetScope,
          observedAt,
          mode: input.mode,
          maxFrames: input.maxFrames,
          durationMs: input.durationMs,
          frameFormat: input.frameFormat,
          includeImages: input.includeImages
        });
        const targetScope = bindActiveWindowScope(
          providerResult.targetScope,
          providerResult.activeWindow
        );
        const observation: DesktopObservationPacket = {
          observationId: runtime.generateId("observation"),
          sessionId: input.sessionId,
          observedAt: providerResult.observedAt,
          targetScope,
          activeWindow: providerResult.activeWindow,
          cursorPosition: providerResult.cursorPosition,
          cursorWitness: providerResult.cursorWitness,
          hoverWitness: providerResult.hoverWitness,
          frames: providerResult.frames,
          lastActionDeltaSummary: providerResult.lastActionDeltaSummary,
          residue: [
            ...providerResult.residue,
            ...(input.targetScope.kind === "active_window" && input.targetScope.value === undefined
              ? ["active_window scope was bound to observed window metadata for future policy checks."]
              : [])
          ]
        };
        const auditEvent: DesktopSessionAuditEvent = {
          eventId: runtime.generateId("event"),
          sessionId: input.sessionId,
          eventType: "observation_recorded",
          occurredAt: runtime.now(),
          observationId: observation.observationId,
          summary: `Recorded ${observation.frames.length} bounded ${providerCapabilities.providerKind} observation frame(s).`,
          residue: observation.residue
        };

        const recordedObservation = runtime.sessionStore.recordObservation(observation);
        runtime.sessionStore.appendAuditEvent(auditEvent);
        const auditedTransitionGate =
          transitionGate === undefined
            ? undefined
            : runtime.sessionStore.updateTransitionGate(
                auditInteractionTransitionGate(
                  transitionGate,
                  recordedObservation,
                  runtime.now()
                )
              );
        const postActionAuditEvent: DesktopSessionAuditEvent | undefined =
          auditedTransitionGate === undefined
            ? undefined
            : {
                eventId: runtime.generateId("event"),
                sessionId: input.sessionId,
                eventType:
                  auditedTransitionGate.status === "audited"
                    ? "post_action_observed"
                    : "escalation_required",
                occurredAt: runtime.now(),
                actionId: auditedTransitionGate.actionId,
                observationId: recordedObservation.observationId,
                summary:
                  auditedTransitionGate.status === "audited"
                    ? "Post-action observation audited the interaction transition gate."
                    : "Post-action observation could not close the interaction transition gate.",
                residue: auditedTransitionGate.residue
              };

        if (postActionAuditEvent !== undefined) {
          runtime.sessionStore.appendAuditEvent(postActionAuditEvent);
        }

        return structuredResult(
          {
            sessionId: input.sessionId,
            status: "observed",
            observation: recordedObservation,
            auditEvent,
            transitionGate: auditedTransitionGate,
            postActionAuditEvent,
            providerCapabilities,
            residue: [
              "Observation was recorded in session state and audit log.",
              "No mouse movement, click, typing, OCR, localization, or background polling occurred."
            ]
          },
          false,
          imageContentBlocks(recordedObservation)
        );
      } catch (error: unknown) {
        return observationToolError(error);
      }
    }
  );
}
