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
      "desktop_submit_interaction_evidence with perception evidence and optional workflow/candidate/transition evidence",
      "desktop_move_mouse, desktop_click, or desktop_type_text with compact relational claim and returned evidence ids",
      "desktop_observe with transitionActionId",
      "desktop_submit_interaction_evidence for the follow-up observation and transition assessment",
      "continue, repair, or stop based on nextRequiredStep"
    ],
    evidenceRules: [
      "desktop_observe({ includeImages: true }) returns screenshot-bearing visualArtifacts[].path entries and MCP image content blocks.",
      "Raw frame dataBase64 is omitted from normal public JSON; request includeInlineBase64: true only for compatibility/debug use.",
      "desktop_submit_interaction_evidence is the preferred compact path; strict/debug clients may still call digest, workflow, transition assessment, and click-candidate tools separately.",
      "Perception digests must reference the latest screenshot-bearing observation.",
      "Any newer desktop_observe invalidates older perception digests for future actions.",
      "Workflow-state claims normally bind to the latest screenshot-bearing observation; older workflow claims may only be revalidated across observation-only and audited move-only hover/probe changes.",
      "The server is a witness/path governor, not a visual meaning authority; the client must author current perception and workflow claims from the inspected artifact.",
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
      "If a digest is stale, call desktop_observe with includeImages: true and submit desktop_submit_interaction_evidence for the latest observation.",
      "If click-candidate readiness fails on workflow state, submit workflow evidence through desktop_submit_interaction_evidence or reuse an older workflowStateClaimId only when bounded revalidation applies.",
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
        path: "docs/architecture/safety_model.md",
        description: "Safety model, CRPM-compatible witness-bound runtime, and protected invariants."
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
      "Inspect visualArtifacts[].path or the returned MCP image content block before submitting desktop_submit_interaction_evidence for the latest screenshot-bearing observation."
  };
}
