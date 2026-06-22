import type { DesktopInteractionScope } from "./policy/sessionLicensePolicy.js";

export interface DesktopFirstUseGuide {
  summary: string;
  firstCall: {
    tool: "desktop_first_use_guide";
    when: string;
  };
  requiredLoop: string[];
  evidenceRules: string[];
  scopeRules: string[];
  realProviderRules: string[];
  commonFailureRecovery: string[];
  sourceDocs: Array<{
    path: string;
    description: string;
  }>;
}

export function buildDesktopFirstUseGuide(): DesktopFirstUseGuide {
  return {
    summary:
      "First-use guide for running the desktop automation protocol without stale visual claims or raw-coordinate proof.",
    firstCall: {
      tool: "desktop_first_use_guide",
      when:
        "Call this before starting a first desktop interaction session, or read usageGuidance.firstUseGuide from desktop_capabilities."
    },
    requiredLoop: [
      "desktop_observe with includeImages: true",
      "inspect visualArtifacts[].path or the returned MCP image content block",
      "desktop_submit_perception_digest for the latest screenshot-bearing observation",
      "desktop_submit_workflow_state_claim for click/type readiness",
      "desktop_move_mouse with compact relational claim",
      "desktop_observe with transitionActionId",
      "desktop_submit_perception_digest for the follow-up observation",
      "desktop_submit_transition_assessment for semantic landing",
      "desktop_evaluate_click_candidate",
      "desktop_click with the latest digest, workflow claim, and hover witness",
      "desktop_observe with transitionActionId after the click"
    ],
    evidenceRules: [
      "desktop_observe({ includeImages: true }) returns screenshot-bearing visualArtifacts[].path entries and MCP image content blocks.",
      "Raw frame dataBase64 is omitted from normal public JSON; request includeInlineBase64: true only for compatibility/debug use.",
      "Perception digests and workflow-state claims must reference the latest screenshot-bearing observation.",
      "Any newer desktop_observe invalidates older perception digests and workflow-state claims for future actions.",
      "Coordinates are action endpoints only; they never prove that the semantic target was correct.",
      "Supported semantic landing requires the follow-up screenshot to support the stored relation, candidate, rejected alternative, and expected evidence."
    ],
    scopeRules: [
      "Sessions with licensedAppScope bind the app-under-test during desktop_observe.",
      "scope_exit means the active window drifted away from the bound app-under-test; refocus the app or start a fresh session.",
      "Out-of-scope observations are not recorded as usable session evidence."
    ],
    realProviderRules: [
      "Real observation, movement, click, typing, and app launch are individually opt-in provider gates.",
      "Real click and typing require a reversible app-scoped session and current boundAppScope evidence.",
      "The server performs no OCR or screenshot analysis; the client authors perception and workflow claims from the returned image."
    ],
    commonFailureRecovery: [
      "If a digest or workflow claim is stale, call desktop_observe with includeImages: true and submit fresh claims.",
      "If click-candidate readiness fails on workflow state, submit a current workflow-state claim for the same target and digest.",
      "If scope_exit appears, bring the intended app back to the foreground before continuing or start a new bounded session."
    ],
    sourceDocs: [
      {
        path: "README.md",
        description: "Tool list, provider gates, and compact usage loop."
      },
      {
        path: "docs/process/codex_desktop_interaction_reentry.md",
        description: "Operational re-entry workflow for Codex desktop interaction sessions."
      },
      {
        path: "docs/testing/manual_real_observation_checklist.md",
        description: "Manual real-provider checks for observation, movement, click, and typing gates."
      }
    ]
  };
}

export function buildDesktopSessionNextRequiredStep(
  sessionId: string,
  targetScope: DesktopInteractionScope
) {
  return {
    tool: "desktop_observe",
    arguments: {
      sessionId,
      targetScope,
      includeImages: true
    },
    instruction:
      "Inspect visualArtifacts[].path or the returned MCP image content block before submitting desktop_submit_perception_digest for the latest screenshot-bearing observation."
  };
}
