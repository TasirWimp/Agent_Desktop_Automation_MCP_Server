import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
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
  generateId: (prefix: string) => string;
}

export type PerceptionDigestRecordResult =
  | {
      ok: true;
      sessionId: string;
      status: "accepted";
      perceptionDigest: DesktopPerceptionDigest;
      perceptionDigestId: string;
      createdAt: string;
      sourceObservationFrameHashes: string[];
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

export function recordPerceptionDigest(
  runtime: PerceptionDigestToolRuntime,
  input: unknown
): PerceptionDigestRecordResult {
  const parsedInput = desktopSubmitPerceptionDigestInputSchema.parse(input);

  runtime.sessionStore.requireActiveSession(parsedInput.sessionId);
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
      residue: ["No perception digest was recorded."]
    };
  }

  const observationCheck = assertDigestObservationUsable({
    observation,
    latestObservationId: latestObservationId(
      runtime.sessionStore.listObservations(parsedInput.sessionId)
    ),
    targetScope: parsedInput.targetScope
  });

  if (!observationCheck.ok) {
    return {
      ok: false,
      error: {
        code: observationCheck.code,
        message: observationCheck.message
      },
      residue: observationCheck.residue
    };
  }

  const normalizedContradiction = normalizeNoContradiction(
    parsedInput.contradictionToPriorClaim
  );
  const normalizedNoContradictionSentinel =
    parsedInput.contradictionToPriorClaim !== null &&
    normalizedContradiction === null;
  const normalizationResidue = normalizedNoContradictionSentinel
    ? [
        `contradictionToPriorClaim sentinel ${JSON.stringify(parsedInput.contradictionToPriorClaim)} was normalized to JSON null.`
      ]
    : [];
  const digest: DesktopPerceptionDigest = {
    ...parsedInput,
    contradictionToPriorClaim: normalizedContradiction,
    perceptionDigestId: `perception-digest-${randomUUID()}`,
    createdAt: runtime.now(),
    sourceObservationFrameHashes: observation.frames.map((frame) => frame.sha256),
    status: "accepted"
  };
  const recordedDigest = runtime.sessionStore.recordPerceptionDigest(digest);
  const auditEvent: DesktopSessionAuditEvent = {
    eventId: `event-${recordedDigest.perceptionDigestId}`,
    sessionId: parsedInput.sessionId,
    eventType: "perception_digest_recorded",
    occurredAt: recordedDigest.createdAt,
    observationId: parsedInput.observationId,
    summary:
      `Recorded fresh perception digest for ${parsedInput.intendedTarget}.`,
    residue: [
      "Digest is client-authored; the server did not inspect or interpret pixels.",
      "Digest is bound to the latest screenshot-bearing observation and frame hashes.",
      ...normalizationResidue
    ]
  };

  runtime.sessionStore.appendAuditEvent(auditEvent);

  return {
    ok: true,
    sessionId: parsedInput.sessionId,
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
  };
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
        const recordResult = recordPerceptionDigest(runtime, input);

        return structuredResult(recordResult.ok ? recordResult : {
          error: recordResult.error,
          residue: recordResult.residue
        }, !recordResult.ok);
      } catch (error: unknown) {
        return perceptionDigestToolError(error);
      }
    }
  );
}
