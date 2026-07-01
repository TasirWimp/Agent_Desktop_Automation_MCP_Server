import {
  appScopeBindingEvidenceMatchesBinding,
  desktopInteractionScopesMatch,
  desktopSubmitAppScopeBindingEvidenceInputSchema,
  normalizeNoContradiction,
  observedWindowIdentity,
  type DesktopAppScopeBindingEvidence,
  type DesktopObservationPacket,
  type DesktopSessionAuditEvent,
  type DesktopSubmitAppScopeBindingEvidenceInput
} from "../policy/sessionLicensePolicy.js";
import {
  InMemoryDesktopSessionStore
} from "./sessionStore.js";

export interface AppScopeBindingEvidenceRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  now: () => string;
  generateId: (prefix: string) => string;
  requirePlausibleBindingGeometry?: boolean;
}

export type RecordAppScopeBindingEvidenceResult =
  | {
      ok: true;
      appScopeBindingEvidence: DesktopAppScopeBindingEvidence;
      appScopeBindingEvidenceId: string;
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

function latestObservationId(observations: DesktopObservationPacket[]): string | undefined {
  return observations.at(-1)?.observationId;
}

function observationHasImagePayload(observation: DesktopObservationPacket): boolean {
  return observation.frames.some(
    (frame) => frame.dataBase64 !== undefined && frame.dataBase64.length > 0
  );
}

function frameHashes(observation: DesktopObservationPacket): string[] {
  return observation.frames.map((frame) => frame.sha256);
}

function geometryResidue(observation: DesktopObservationPacket): string[] {
  const frame = observation.frames[0];
  const bounds = observation.activeWindow?.bounds;
  const frameSuspect =
    frame !== undefined && (frame.width < 300 || frame.height < 120);
  const boundsSuspect =
    bounds !== undefined && (bounds.width < 300 || bounds.height < 120);
  const residue: string[] = [];

  if (frame !== undefined) {
    residue.push(`First frame size: ${frame.width}x${frame.height}.`);
  }

  if (bounds !== undefined) {
    residue.push(`Active window bounds: ${bounds.width}x${bounds.height}.`);
  }

  if (frameSuspect || boundsSuspect) {
    residue.push(
      "Window binding geometry is suspect; the capture may be a child/control surface rather than the app-under-test window."
    );
  }

  return residue;
}

function geometryLooksPlausible(observation: DesktopObservationPacket): boolean {
  const frame = observation.frames[0];
  const bounds = observation.activeWindow?.bounds;

  if (frame !== undefined && (frame.width < 300 || frame.height < 120)) {
    return false;
  }

  if (bounds !== undefined && (bounds.width < 300 || bounds.height < 120)) {
    return false;
  }

  return frame !== undefined || bounds !== undefined;
}

export function recordAppScopeBindingEvidence(
  runtime: AppScopeBindingEvidenceRuntime,
  input: DesktopSubmitAppScopeBindingEvidenceInput
): RecordAppScopeBindingEvidenceResult {
  const parsedInput = desktopSubmitAppScopeBindingEvidenceInputSchema.parse(input);
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
        message: `Observation ${parsedInput.observationId} does not exist in session ${parsedInput.sessionId}.`
      },
      residue: ["No app-scope binding evidence was recorded."]
    };
  }

  const latest = latestObservationId(
    runtime.sessionStore.listObservations(parsedInput.sessionId)
  );

  if (latest !== observation.observationId) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_not_latest",
        message:
          "App-scope binding evidence must reference the latest recorded screenshot-bearing observation."
      },
      residue: [
        `Latest observationId: ${latest ?? "none"}.`,
        `Binding evidence observationId: ${observation.observationId}.`,
        "Observe again with includeImages true and inspect the latest visual artifact before submitting binding evidence."
      ]
    };
  }

  if (!desktopInteractionScopesMatch(observation.targetScope, parsedInput.targetScope)) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_scope_mismatch",
        message:
          "App-scope binding evidence target scope must match the referenced observation target scope."
      },
      residue: [
        "No app-scope binding evidence was recorded.",
        `Observation scope: ${JSON.stringify(observation.targetScope)}.`,
        `Evidence scope: ${JSON.stringify(parsedInput.targetScope)}.`
      ]
    };
  }

  if (observation.frames.length === 0 || !observationHasImagePayload(observation)) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_requires_screenshot",
        message:
          "App-scope binding evidence requires a screenshot-bearing observation with image payload."
      },
      residue: [
        "Call desktop_observe with includeImages: true, inspect visualArtifacts[].path, then submit binding evidence."
      ]
    };
  }

  const binding = runtime.sessionStore.getBoundAppScope(parsedInput.sessionId);

  if (session.license.licensedAppScope !== undefined && binding === undefined) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_required",
        message:
          "The licensed app-under-test scope must be bound by desktop_observe before binding evidence can be recorded."
      },
      residue: [
        "No app-scope binding evidence was recorded.",
        "Call desktop_observe for the licensed app-under-test scope first."
      ]
    };
  }

  if (binding === undefined) {
    return {
      ok: false,
      error: {
        code: "licensed_app_scope_required",
        message:
          "App-scope binding evidence is only meaningful for sessions with licensedAppScope."
      },
      residue: ["No app-scope binding evidence was recorded."]
    };
  }

  if (binding.observationId !== observation.observationId) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_binding_mismatch",
        message:
          "The current app-scope binding is not bound to the referenced observation."
      },
      residue: [
        `Binding observationId: ${binding.observationId}.`,
        `Evidence observationId: ${observation.observationId}.`,
        "Observe the intended app again and submit binding evidence for the latest bound observation."
      ]
    };
  }

  const normalizedContradiction = normalizeNoContradiction(parsedInput.contradiction);

  if (parsedInput.bindingStatus !== "confirmed") {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_suspect",
        message:
          "App-scope binding evidence must be confirmed before app-scoped click or typing can proceed."
      },
      residue: [
        `bindingStatus: ${parsedInput.bindingStatus}.`,
        "No app-scope binding evidence was recorded.",
        "Refocus/restore the expected top-level app window, observe again, inspect the artifact, and submit confirmed binding evidence."
      ]
    };
  }

  if (normalizedContradiction !== null) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_contradicted",
        message:
          "App-scope binding evidence cannot be accepted while contradiction is present."
      },
      residue: [
        `contradiction: ${JSON.stringify(parsedInput.contradiction)}.`,
        "No app-scope binding evidence was recorded.",
        "Resolve the window/scope contradiction before app-scoped mutation."
      ]
    };
  }

  if (
    runtime.requirePlausibleBindingGeometry === true &&
    !geometryLooksPlausible(observation)
  ) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_suspect_geometry",
        message:
          "The observed active-window geometry is too small to accept as the app-under-test binding surface."
      },
      residue: [
        ...geometryResidue(observation),
        "No app-scope binding evidence was recorded.",
        "Focus or restore the top-level app window, then observe and submit binding evidence again."
      ]
    };
  }

  const evidence: DesktopAppScopeBindingEvidence = {
    ...parsedInput,
    contradiction: normalizedContradiction,
    appScopeBindingEvidenceId: runtime.generateId("app-scope-binding-evidence"),
    appScopeBindingId: binding.bindingId,
    createdAt: runtime.now(),
    sourceObservationFrameHashes: frameHashes(observation),
    observedWindowIdentity: observedWindowIdentity(observation.activeWindow),
    activeWindow: observation.activeWindow,
    status: "accepted"
  };

  if (
    !appScopeBindingEvidenceMatchesBinding({
      evidence,
      binding,
      observation,
      targetScope: parsedInput.targetScope
    })
  ) {
    return {
      ok: false,
      error: {
        code: "app_scope_binding_evidence_mismatch",
        message:
          "App-scope binding evidence does not match the current bound app-under-test identity, scope, observation, or frame hashes."
      },
      residue: [
        "No app-scope binding evidence was recorded.",
        `appScopeBindingId: ${binding.bindingId}.`,
        `observationId: ${observation.observationId}.`
      ]
    };
  }

  const recordedEvidence =
    runtime.sessionStore.recordAppScopeBindingEvidence(evidence);
  const normalizedResidue =
    parsedInput.contradiction !== null && normalizedContradiction === null
      ? [
          `contradiction sentinel ${JSON.stringify(parsedInput.contradiction)} was normalized to JSON null before recording app-scope binding evidence.`
        ]
      : [];
  const auditEvent: DesktopSessionAuditEvent = {
    eventId: `event-${recordedEvidence.appScopeBindingEvidenceId}`,
    sessionId: parsedInput.sessionId,
    eventType: "app_scope_binding_evidence_recorded",
    occurredAt: runtime.now(),
    observationId: observation.observationId,
    summary:
      "Recorded agent-authored app-scope binding evidence for the current observation.",
    residue: [
      "App-scope binding evidence is client-authored; the server did not inspect or interpret pixels.",
      "Evidence is bound to the latest screenshot-bearing observation, current app-scope binding, and frame hashes.",
      `bindingStatus: ${recordedEvidence.bindingStatus}.`,
      `appScopeBindingId: ${recordedEvidence.appScopeBindingId}.`,
      ...geometryResidue(observation),
      ...normalizedResidue
    ]
  };

  runtime.sessionStore.appendAuditEvent(auditEvent);

  return {
    ok: true,
    appScopeBindingEvidence: recordedEvidence,
    appScopeBindingEvidenceId: recordedEvidence.appScopeBindingEvidenceId,
    auditEvent,
    residue: [
      "App-scope binding evidence was recorded in session state and audit log.",
      "Future app-scoped click/type actions may use this binding witness until a newer observation or freshness limit requires revalidation."
    ]
  };
}
