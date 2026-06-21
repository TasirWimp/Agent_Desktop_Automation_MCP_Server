import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  desktopInteractionScopesMatch,
  desktopSubmitPerceptionDigestInputSchema,
  normalizeNoContradiction,
  type DesktopObservationPacket,
  type DesktopPerceptionDigest,
  type DesktopSessionAuditEvent
} from "../policy/sessionLicensePolicy.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError
} from "./sessionStore.js";

export interface PerceptionDigestToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  now: () => string;
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

function perceptionDigestToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["No perception digest was recorded."]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "perception_digest_tool_error",
        message:
          error instanceof Error ? error.message : "Unknown perception digest tool error."
      },
      residue: ["No perception digest was recorded."]
    },
    true
  );
}

function observationHasImagePayload(observation: DesktopObservationPacket): boolean {
  return observation.frames.some(
    (frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0
  );
}

function digestIdFor(observationId: string, intendedTarget: string): string {
  const targetSlug = intendedTarget
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);

  return `perception-digest-${observationId}-${targetSlug || "target"}`;
}

function latestObservationId(observations: DesktopObservationPacket[]): string | undefined {
  return observations.at(-1)?.observationId;
}

function assertDigestObservationUsable(input: {
  observation: DesktopObservationPacket;
  latestObservationId?: string;
  targetScope: DesktopPerceptionDigest["targetScope"];
}): { ok: true } | { ok: false; code: string; message: string; residue: string[] } {
  if (input.latestObservationId !== input.observation.observationId) {
    return {
      ok: false,
      code: "perception_digest_not_latest",
      message:
        "Perception digest must be submitted for the latest recorded observation.",
      residue: [
        `Latest observationId: ${input.latestObservationId ?? "none"}.`,
        `Digest observationId: ${input.observation.observationId}.`
      ]
    };
  }

  if (!desktopInteractionScopesMatch(input.observation.targetScope, input.targetScope)) {
    return {
      ok: false,
      code: "perception_digest_scope_mismatch",
      message:
        "Perception digest target scope must match the referenced observation target scope.",
      residue: [
        "The agent must re-ground the claim against the current scoped observation."
      ]
    };
  }

  if (input.observation.frames.length === 0) {
    return {
      ok: false,
      code: "missing_frame_evidence",
      message:
        "Perception digest requires a screenshot-bearing observation with frame evidence.",
      residue: ["Call desktop_observe with includeImages: true before submitting a digest."]
    };
  }

  if (!observationHasImagePayload(input.observation)) {
    return {
      ok: false,
      code: "missing_frame_evidence",
      message:
        "Perception digest requires screenshot image payload, not frame metadata only.",
      residue: ["Call desktop_observe with includeImages: true before submitting a digest."]
    };
  }

  return { ok: true };
}

export function registerPerceptionDigestTools(
  server: McpServer,
  runtime: PerceptionDigestToolRuntime
): void {
  server.registerTool(
    "desktop_submit_perception_digest",
    {
      title: "Submit Fresh Desktop Perception Digest",
      description:
        "Record an agent-authored perception digest for the latest screenshot-bearing observation. The server validates freshness and provenance only; it does not analyze pixels.",
      inputSchema: desktopSubmitPerceptionDigestInputSchema,
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
              residue: ["No perception digest was recorded."]
            },
            true
          );
        }

        const observationCheck = assertDigestObservationUsable({
          observation,
          latestObservationId: latestObservationId(
            runtime.sessionStore.listObservations(input.sessionId)
          ),
          targetScope: input.targetScope
        });

        if (!observationCheck.ok) {
          return structuredResult(
            {
              error: {
                code: observationCheck.code,
                message: observationCheck.message
              },
              residue: observationCheck.residue
            },
            true
          );
        }

        const normalizedContradiction = normalizeNoContradiction(
          input.contradictionToPriorClaim
        );
        const normalizedNoContradictionSentinel =
          input.contradictionToPriorClaim !== null &&
          normalizedContradiction === null;
        const normalizationResidue = normalizedNoContradictionSentinel
          ? [
              `contradictionToPriorClaim sentinel ${JSON.stringify(input.contradictionToPriorClaim)} was normalized to JSON null.`
            ]
          : [];
        const digest: DesktopPerceptionDigest = {
          ...input,
          contradictionToPriorClaim: normalizedContradiction,
          perceptionDigestId: digestIdFor(input.observationId, input.intendedTarget),
          createdAt: runtime.now(),
          sourceObservationFrameHashes: observation.frames.map((frame) => frame.sha256),
          status: "accepted"
        };
        const recordedDigest = runtime.sessionStore.recordPerceptionDigest(digest);
        const auditEvent: DesktopSessionAuditEvent = {
          eventId: `event-${recordedDigest.perceptionDigestId}`,
          sessionId: input.sessionId,
          eventType: "perception_digest_recorded",
          occurredAt: recordedDigest.createdAt,
          observationId: input.observationId,
          summary:
            `Recorded fresh perception digest for ${input.intendedTarget}.`,
          residue: [
            "Digest is client-authored; the server did not inspect or interpret pixels.",
            "Digest is bound to the latest screenshot-bearing observation and frame hashes.",
            ...normalizationResidue
          ]
        };

        runtime.sessionStore.appendAuditEvent(auditEvent);

        return structuredResult({
          sessionId: input.sessionId,
          status: "accepted",
          perceptionDigest: recordedDigest,
          perceptionDigestId: recordedDigest.perceptionDigestId,
          createdAt: recordedDigest.createdAt,
          sourceObservationFrameHashes: recordedDigest.sourceObservationFrameHashes,
          auditEvent,
          residue: [
            "Perception digest was recorded in session state and audit log.",
            "Future actions must reference this digest before any newer observation is recorded.",
            ...normalizationResidue
          ]
        });
      } catch (error: unknown) {
        return perceptionDigestToolError(error);
      }
    }
  );
}
