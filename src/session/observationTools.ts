import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopInteractionScopeSchema,
  desktopAppScopeBindingSchema,
  isDesktopInteractionScopeAllowed,
  observedWindowIdentity,
  type DesktopAppScopeBinding,
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
  markInteractionTransitionScopeExit,
  repairDispositionRequiresAttempt,
  transitionGateBlocksNonObserveAction,
  withExpectedDeltaRepairReset,
  withPostActionRepairAttempt,
  type InteractionTransitionGate
} from "./interactionTransitionGate.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError,
  type DesktopSessionSnapshot
} from "./sessionStore.js";
import {
  createAppScopeBindingFromObservation,
  observationMatchesAppScopeBinding
} from "./appScopeBinding.js";

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

function scopeExitObserveResult(
  sessionId: string,
  stopCondition: DesktopSessionStopCondition,
  auditEvent: DesktopSessionAuditEvent,
  boundAppScope: DesktopAppScopeBinding | undefined,
  observation: DesktopObservationPacket,
  residue: string[],
  transitionGate?: InteractionTransitionGate,
  postActionAuditEvent?: DesktopSessionAuditEvent
) {
  return structuredResult(
    {
      sessionId,
      status: "scope_exit",
      stopCondition,
      auditEvent,
      transitionGate,
      postActionAuditEvent,
      boundAppScope,
      observedTargetScope: observation.targetScope,
      observedActiveWindow: observation.activeWindow,
      residue: [
        ...residue,
        "Provider observation output was not recorded as a session observation.",
        "No image content was returned for the out-of-scope observation."
      ]
    },
    true
  );
}

function stopConditionForPostActionClassification(
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
        "The post-action observation indicates a forbidden or high-risk app boundary.",
      residue: classification.residue
    };
  }

  if (classification.kind === "scope_exit") {
    return {
      condition: "outside_allowed_scope",
      sessionId,
      actionId: gate.actionId,
      reason: "The post-action observation left the licensed app scope.",
      residue: classification.residue
    };
  }

  if (classification.kind === "uninterpretable_state") {
    return {
      condition: "uninterpretable_post_action_state",
      sessionId,
      actionId: gate.actionId,
      reason:
        "The post-action observation could not be interpreted safely.",
      residue: classification.residue
    };
  }

  return undefined;
}

function classifyAndAccountForRepair(
  runtime: ObservationToolRuntime,
  session: DesktopSessionSnapshot,
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
    runtime.sessionStore.resetRepairAttemptCount(session.sessionId);
    return {
      transitionGate: withExpectedDeltaRepairReset(gate, runtime.now())
    };
  }

  if (repairDispositionRequiresAttempt(classification)) {
    const currentRepairAttemptCount =
      runtime.sessionStore.requireActiveSession(session.sessionId).repairAttemptCount;
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
        stopCondition: stopConditionForPostActionClassification(session.sessionId, transitionGate)
      };
    }

    const repairAttemptCount = runtime.sessionStore.incrementRepairAttemptCount(
      session.sessionId
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
    stopCondition: stopConditionForPostActionClassification(session.sessionId, gate)
  };
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
          providerTiming: providerResult.providerTiming,
          frames: providerResult.frames,
          lastActionDeltaSummary: providerResult.lastActionDeltaSummary,
          residue: [
            ...providerResult.residue,
            ...(input.targetScope.kind === "active_window" && input.targetScope.value === undefined
              ? ["active_window scope was bound to observed window metadata for future policy checks."]
              : [])
          ]
        };
        const existingAppScopeBinding =
          session.boundAppScope ?? runtime.sessionStore.getBoundAppScope(input.sessionId);
        let appScopeBinding: DesktopAppScopeBinding | undefined;

        if (session.license.licensedAppScope !== undefined) {
          const strictActiveWindowMatch = providerCapabilities.providerKind === "real";
          const appScopeBindingResult =
            existingAppScopeBinding === undefined
              ? createAppScopeBindingFromObservation({
                  bindingId: `app-scope-binding-${observation.observationId}`,
                  sessionId: input.sessionId,
                  licensedScope: session.license.licensedAppScope.scope,
                  observation,
                  boundAt: runtime.now(),
                  strictActiveWindowMatch
                })
              : observationMatchesAppScopeBinding(existingAppScopeBinding, observation);

          if (!appScopeBindingResult.matches) {
            const stopCondition: DesktopSessionStopCondition = {
              condition: "outside_allowed_scope",
              sessionId: input.sessionId,
              reason:
                "Observed active-window identity is outside the bound app-under-test scope.",
              residue: appScopeBindingResult.residue
            };
            const scopeExitAuditEvent: DesktopSessionAuditEvent = {
              eventId: runtime.generateId("event"),
              sessionId: input.sessionId,
              eventType: "escalation_required",
              occurredAt: runtime.now(),
              summary:
                "Observation detected a scope exit from the bound app-under-test.",
              residue: appScopeBindingResult.residue
            };

            runtime.sessionStore.appendStopCondition(stopCondition);
            runtime.sessionStore.appendAuditEvent(scopeExitAuditEvent);

            const scopeExitTransitionGate =
              transitionGate === undefined
                ? undefined
                : runtime.sessionStore.updateTransitionGate(
                    markInteractionTransitionScopeExit(
                      transitionGate,
                      runtime.now(),
                      appScopeBindingResult.residue
                    )
                  );
            const postActionAuditEvent: DesktopSessionAuditEvent | undefined =
              scopeExitTransitionGate === undefined
                ? undefined
                : {
                    eventId: runtime.generateId("event"),
                    sessionId: input.sessionId,
                    eventType: "escalation_required",
                    occurredAt: runtime.now(),
                    actionId: scopeExitTransitionGate.actionId,
                    summary:
                      "Post-action observation detected scope exit and escalated the transition gate.",
                    residue: scopeExitTransitionGate.residue
                  };

            if (postActionAuditEvent !== undefined) {
              runtime.sessionStore.appendAuditEvent(postActionAuditEvent);
            }

            return scopeExitObserveResult(
              input.sessionId,
              stopCondition,
              scopeExitAuditEvent,
              existingAppScopeBinding,
              observation,
              appScopeBindingResult.residue,
              scopeExitTransitionGate,
              postActionAuditEvent
            );
          }

          const createdBinding =
            "binding" in appScopeBindingResult
              ? appScopeBindingResult.binding
              : undefined;

          if (createdBinding !== undefined) {
            appScopeBinding = desktopAppScopeBindingSchema.parse(createdBinding);
          } else if (existingAppScopeBinding !== undefined) {
            const identity = observedWindowIdentity(observation.activeWindow);

            appScopeBinding = desktopAppScopeBindingSchema.parse({
              ...existingAppScopeBinding,
              bindingId: `app-scope-binding-${observation.observationId}`,
              boundAt: runtime.now(),
              observationId: observation.observationId,
              activeWindow: observation.activeWindow,
              observedWindowIdentity: identity,
              boundScope:
                identity === undefined
                  ? observation.targetScope
                  : {
                      kind: "active_window",
                      value: identity
                    },
              residue: [
                "Licensed app-under-test binding was refreshed from a matching observation.",
                ...appScopeBindingResult.residue
              ]
            });
          }
        }
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
        const recordedAppScopeBinding =
          appScopeBinding === undefined
            ? undefined
            : runtime.sessionStore.bindAppScope(appScopeBinding);
        const appScopeBindingAuditEvent: DesktopSessionAuditEvent | undefined =
          recordedAppScopeBinding === undefined
            ? undefined
            : {
                eventId: `event-app-scope-bound-${recordedObservation.observationId}`,
                sessionId: input.sessionId,
                eventType: "app_scope_bound",
                occurredAt: runtime.now(),
                observationId: recordedObservation.observationId,
                summary:
                  "Licensed app-under-test scope was bound to observed provider identity.",
                residue: recordedAppScopeBinding.residue
              };

        if (appScopeBindingAuditEvent !== undefined) {
          runtime.sessionStore.appendAuditEvent(appScopeBindingAuditEvent);
        }

        const sourceObservation =
          transitionGate === undefined
            ? undefined
            : runtime.sessionStore.getObservation(
                input.sessionId,
                transitionGate.sourceObservationId
              );
        const transitionAuditResult =
          transitionGate === undefined
            ? undefined
            : classifyAndAccountForRepair(
                runtime,
                session,
                auditInteractionTransitionGate(
                  transitionGate,
                  recordedObservation,
                  runtime.now(),
                  sourceObservation
                )
              );
        const auditedTransitionGate =
          transitionAuditResult === undefined
            ? undefined
            : runtime.sessionStore.updateTransitionGate(
                transitionAuditResult.transitionGate
              );
        const postActionStopCondition = transitionAuditResult?.stopCondition;

        if (postActionStopCondition !== undefined) {
          runtime.sessionStore.appendStopCondition(postActionStopCondition);
        }
        const postActionAuditEvent: DesktopSessionAuditEvent | undefined =
          auditedTransitionGate === undefined
            ? undefined
            : {
                eventId: runtime.generateId("event"),
                sessionId: input.sessionId,
                eventType:
                  auditedTransitionGate.status === "escalation_required"
                    ? "escalation_required"
                    : "post_action_observed",
                occurredAt: runtime.now(),
                actionId: auditedTransitionGate.actionId,
                observationId: recordedObservation.observationId,
                summary:
                  auditedTransitionGate.status === "audited"
                    ? `Post-action observation classified as ${auditedTransitionGate.postActionClassification?.kind ?? "observed"}.`
                    : auditedTransitionGate.status === "observed"
                      ? "Post-action observation recorded; semantic landing assessment is required before the next non-observe action."
                      : `Post-action observation escalated as ${auditedTransitionGate.postActionClassification?.kind ?? "unresolved"}.`,
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
            appScopeBinding: recordedAppScopeBinding,
            appScopeBindingAuditEvent,
            transitionGate: auditedTransitionGate,
            postActionStopCondition,
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
