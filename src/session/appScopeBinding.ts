import {
  desktopAppScopeBindingSchema,
  desktopInteractionScopesMatch,
  observedWindowIdentity,
  type DesktopAppScopeBinding,
  type DesktopInteractionScope,
  type DesktopObservationPacket
} from "../policy/sessionLicensePolicy.js";

export interface AppScopeBindingCreateInput {
  bindingId: string;
  sessionId: string;
  licensedScope: DesktopInteractionScope;
  observation: DesktopObservationPacket;
  boundAt: string;
  strictActiveWindowMatch: boolean;
}

export interface AppScopeBindingCheck {
  matches: boolean;
  observedWindowIdentity?: string;
  residue: string[];
}

export interface AppScopeBindingCreateResult extends AppScopeBindingCheck {
  binding?: DesktopAppScopeBinding;
}

export function createAppScopeBindingFromObservation(
  input: AppScopeBindingCreateInput
): AppScopeBindingCreateResult {
  const check = observationMatchesLicensedScope(
    input.licensedScope,
    input.observation,
    input.strictActiveWindowMatch
  );

  if (!check.matches) {
    return check;
  }

  const identity = check.observedWindowIdentity;
  const binding = desktopAppScopeBindingSchema.parse({
    bindingId: input.bindingId,
    sessionId: input.sessionId,
    licensedScope: input.licensedScope,
    boundScope:
      identity === undefined
        ? input.observation.targetScope
        : {
            kind: "active_window",
            value: identity
          },
    boundAt: input.boundAt,
    observationId: input.observation.observationId,
    activeWindow: input.observation.activeWindow,
    observedWindowIdentity: identity,
    residue: [
      "Licensed app-under-test scope was bound from a recorded observation.",
      ...check.residue
    ]
  });

  return {
    matches: true,
    observedWindowIdentity: identity,
    binding,
    residue: binding.residue
  };
}

export function observationMatchesAppScopeBinding(
  binding: DesktopAppScopeBinding,
  observation: DesktopObservationPacket
): AppScopeBindingCheck {
  const identity = observedWindowIdentity(observation.activeWindow);

  if (binding.observedWindowIdentity !== undefined && identity !== undefined) {
    const matches = normalize(binding.observedWindowIdentity) === normalize(identity);

    return {
      matches,
      observedWindowIdentity: identity,
      residue: [
        matches
          ? "Observed active-window identity matches the bound app-under-test identity."
          : "Observed active-window identity does not match the bound app-under-test identity."
      ]
    };
  }

  const matches = desktopInteractionScopesMatch(binding.boundScope, observation.targetScope);

  return {
    matches,
    observedWindowIdentity: identity,
    residue: [
      matches
        ? "Observation target scope matches the bound app-under-test scope."
        : "Observation target scope does not match the bound app-under-test scope.",
      ...(identity === undefined
        ? ["Observed active-window identity was unavailable for binding validation."]
        : [])
    ]
  };
}

function observationMatchesLicensedScope(
  scope: DesktopInteractionScope,
  observation: DesktopObservationPacket,
  strictActiveWindowMatch: boolean
): AppScopeBindingCheck {
  const identity = observedWindowIdentity(observation.activeWindow);
  const targetScopeMatches = desktopInteractionScopesMatch(scope, observation.targetScope);

  if (scope.kind === "active_window") {
    if (scope.value === undefined) {
      if (strictActiveWindowMatch && identity === undefined) {
        return {
          matches: false,
          observedWindowIdentity: identity,
          residue: [
            "Active-window app scope requires concrete observed window identity for real-provider binding."
          ]
        };
      }

      return {
        matches: identity !== undefined || targetScopeMatches,
        observedWindowIdentity: identity,
        residue: [
          identity === undefined
            ? "Active-window identity was unavailable; target scope was used as provisional binding evidence."
            : "Active-window identity is available for app-scope binding."
        ]
      };
    }

    const matches =
      normalize(scope.value) === normalize(identity) || targetScopeMatches;

    return {
      matches,
      observedWindowIdentity: identity,
      residue: [
        matches
          ? "Observed active-window identity matches the declared active-window scope."
          : "Observed active-window identity does not match the declared active-window scope."
      ]
    };
  }

  if (scope.kind === "observed_window_identity") {
    const matches =
      normalize(scope.value) === normalize(identity) || targetScopeMatches;

    return {
      matches,
      observedWindowIdentity: identity,
      residue: [
        matches
          ? "Observed window identity matches the declared app scope."
          : "Observed window identity does not match the declared app scope."
      ]
    };
  }

  if (scope.kind === "window_title") {
    const title = observation.activeWindow?.title;
    const activeWindowMatches = title === undefined
      ? undefined
      : normalize(title) === normalize(scope.value);
    const matches =
      activeWindowMatches === true ||
      (activeWindowMatches === undefined || !strictActiveWindowMatch
        ? targetScopeMatches
        : false);

    return {
      matches,
      observedWindowIdentity: identity,
      residue: [
        matches
          ? "Observed window title or requested target scope matches the declared app scope."
          : "Observed window title does not match the declared app scope."
      ]
    };
  }

  if (scope.kind === "process_name") {
    const processName = observation.activeWindow?.processName;
    const activeWindowMatches = processName === undefined
      ? undefined
      : normalize(processName) === normalize(scope.value);
    const matches =
      activeWindowMatches === true ||
      (activeWindowMatches === undefined || !strictActiveWindowMatch
        ? targetScopeMatches
        : false);

    return {
      matches,
      observedWindowIdentity: identity,
      residue: [
        matches
          ? "Observed process name or requested target scope matches the declared app scope."
          : "Observed process name does not match the declared app scope."
      ]
    };
  }

  return {
    matches: targetScopeMatches,
    observedWindowIdentity: identity,
    residue: [
      targetScopeMatches
        ? "Observation target scope matches the declared app scope."
        : "Observation target scope does not match the declared app scope.",
      "Provider-specific binding for this scope kind is reserved for a later backend."
    ]
  };
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
