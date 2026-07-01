import type { DesktopInteractionScope } from "../policy/sessionLicensePolicy.js";
import type { UiTestBehaviorLabel } from "./uiTestCarrierSchemas.js";

export const desktopAgentGuidanceCodes = [
  "target_canonical_drift",
  "repair_digest_requires_clean_exit",
  "workflow_postcondition_status_required",
  "click_candidate_movement_binding_required",
  "closed_loop_landing_assessment_required",
  "workflow_state_revalidation_required",
  "perception_digest_current_clean_required",
  "app_scope_binding_evidence_required",
  "scope_rebind_required"
] as const;

export type DesktopAgentGuidanceCode =
  (typeof desktopAgentGuidanceCodes)[number];

export interface DesktopAgentGuidance {
  code: DesktopAgentGuidanceCode;
  summary: string;
  immediateAction: string;
  nextRequiredStep: {
    tool:
      | "desktop_observe"
      | "desktop_submit_interaction_evidence"
      | "desktop_submit_workflow_state_claim";
    instruction: string;
    arguments: Record<string, unknown>;
  };
  checklist: string[];
  behaviorLabels: UiTestBehaviorLabel[];
  sourceDocs: Array<{
    path: string;
    section: string;
  }>;
}

export function buildDesktopAgentGuidance(input: {
  code: DesktopAgentGuidanceCode;
  sessionId?: string;
  observationId?: string;
  targetScope?: DesktopInteractionScope;
  intendedTarget?: string;
  perceptionDigestId?: string;
  workflowStateClaimId?: string;
  movementActionId?: string;
  transitionActionId?: string;
}): DesktopAgentGuidance {
  const baseArguments = compactRecord({
    sessionId: input.sessionId,
    observationId: input.observationId,
    targetScope: input.targetScope,
    intendedTarget: input.intendedTarget,
    perceptionDigestId: input.perceptionDigestId,
    workflowStateClaimId: input.workflowStateClaimId
  });

  switch (input.code) {
    case "target_canonical_drift":
      return {
        code: input.code,
        summary:
          "The evidence path changed target wording enough that the server cannot prove it is the same UI object.",
        immediateAction:
          "Reuse the exact helper intendedTarget string, omit workflow.intendedElementTarget so it inherits that target, or deliberately open a new target track.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Resubmit current evidence with one canonical intendedTarget. If this is a different UI object, use evidenceMode new_target and treat it as a new target track.",
          arguments: compactRecord({
            ...baseArguments,
            evidenceMode: "new_target"
          })
        },
        checklist: [
          "Do not shorten or paraphrase the target between perception, workflow, transition, candidate, click, and type steps.",
          "When using desktop_submit_interaction_evidence, omit workflow.intendedElementTarget unless it intentionally differs.",
          "If the semantic object changed, start a new target track instead of forcing equivalence."
        ],
        behaviorLabels: ["target_string_drift"],
        sourceDocs: sourceDocs()
      };

    case "repair_digest_requires_clean_exit":
      return {
        code: input.code,
        summary:
          "Repair/probe evidence may record a miss or contradiction, but it cannot license the next normal action.",
        immediateAction:
          "After the corrected target is visible, submit a fresh non-contradicted new_target or same_target digest for the latest observation before moving, clicking, or typing.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Inspect the latest visual artifact and submit clean evidence with targetVisibility visible, contradictionToPriorClaim null, and evidenceMode new_target or same_target.",
          arguments: compactRecord({
            ...baseArguments,
            evidenceMode: "same_target"
          })
        },
        checklist: [
          "Use repair_target only to record contradicted repair/probe state.",
          "Do not reuse a contradicted repair digest for desktop_move_mouse, desktop_click, or desktop_type_text.",
          "Clear repair exit with a fresh clean digest bound to the latest screenshot-bearing observation."
        ],
        behaviorLabels: [
          "repair_digest_reused_as_clean",
          "stale_memory_carryover"
        ],
        sourceDocs: sourceDocs()
      };

    case "workflow_postcondition_status_required":
      return {
        code: input.code,
        summary:
          "Workflow evidence that references a transitionActionId must classify the workflow postcondition.",
        immediateAction:
          "Resubmit workflow evidence for the same follow-up observation with postconditionStatus satisfied, contradicted, or inconclusive.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Include workflow.transitionActionId and workflow.postconditionStatus; use satisfied only when the follow-up screenshot supports the expected workflow progress.",
          arguments: compactRecord({
            ...baseArguments,
            workflow: compactRecord({
              transitionActionId: input.transitionActionId,
              postconditionStatus: "satisfied | contradicted | inconclusive"
            })
          })
        },
        checklist: [
          "Do not use not_applicable when workflow evidence references transitionActionId.",
          "Use contradicted for wrong workflow state and inconclusive when the screenshot does not settle it.",
          "The server records semantic landing before workflow postcondition when both are submitted in the same helper call."
        ],
        behaviorLabels: ["missing_workflow_postcondition_status"],
        sourceDocs: sourceDocs()
      };

    case "click_candidate_movement_binding_required":
      return {
        code: input.code,
        summary:
          "Click-candidate readiness must be bound to an audited movement/hover witness.",
        immediateAction:
          "Resubmit the helper call with clickCandidate.movementActionId, or include transitionAssessment.actionId for the same movement in that helper call.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Bind clickCandidate to the movement action and do not call desktop_click until the response returns hoverTargetWitnessId.",
          arguments: compactRecord({
            ...baseArguments,
            clickCandidate: compactRecord({
              movementActionId: input.movementActionId ?? input.transitionActionId
            })
          })
        },
        checklist: [
          "Click-candidate readiness is read-only; it never clicks.",
          "Cursor proximity alone is not enough.",
          "A later desktop_click must use the returned hoverTargetWitnessId and the matching click point."
        ],
        behaviorLabels: ["gui_visual_grounding_issue"],
        sourceDocs: sourceDocs()
      };

    case "closed_loop_landing_assessment_required":
      return {
        code: input.code,
        summary:
          "The click path is closed-loop; a move is not enough until the follow-up screenshot supports the semantic landing.",
        immediateAction:
          "Observe with transitionActionId, inspect the visual artifact, then submit same_target evidence with transitionAssessment and clickCandidate.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Submit follow-up evidence with transitionAssessment for the movement and clickCandidate for the same target; repair or move again if contradicted/inconclusive.",
          arguments: compactRecord({
            ...baseArguments,
            transitionAssessment: compactRecord({
              actionId: input.transitionActionId ?? input.movementActionId
            }),
            clickCandidate: compactRecord({
              movementActionId: input.movementActionId ?? input.transitionActionId
            })
          })
        },
        checklist: [
          "Required loop: observe, submit evidence, move, observe transition, validate landing, get hover witness, click, observe again.",
          "A raw coordinate landing is telemetry only.",
          "Wrong-target or inconclusive landing must go through repair evidence and then a fresh clean digest."
        ],
        behaviorLabels: ["gui_visual_grounding_issue"],
        sourceDocs: sourceDocs()
      };

    case "workflow_state_revalidation_required":
      return {
        code: input.code,
        summary:
          "The workflow claim is missing, stale, mismatched, or cannot be revalidated across the intervening actions.",
        immediateAction:
          "Submit workflow evidence for the latest observation, or reuse an older workflowStateClaimId only when bounded revalidation is valid.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Submit workflow evidence for the latest screenshot-bearing observation with the same canonical target and current perception digest.",
          arguments: baseArguments
        },
        checklist: [
          "Older workflow claims can cross observation-only and audited move-only hover/probe changes.",
          "Do not reuse workflow claims across click, type, app launch, scope exit, risk prompt, wrong-target, or repair-needed transitions.",
          "Committed actions require satisfied precondition and no current contradiction."
        ],
        behaviorLabels: ["workflow_precondition_missing"],
        sourceDocs: sourceDocs()
      };

    case "perception_digest_current_clean_required":
      return {
        code: input.code,
        summary:
          "The current perception digest is missing, stale, not visible, uncertain, changed, or contradicted.",
        immediateAction:
          "Inspect the latest visual artifact and submit clean current perception evidence before requesting mutation.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Submit a digest for the latest screenshot-bearing observation with visible target, visible/acceptable anchor, staleCarryoverReviewed true, and no contradiction.",
          arguments: baseArguments
        },
        checklist: [
          "Any newer desktop_observe invalidates older perception digests for future actions.",
          "Use repair_target for contradicted/uncertain repair probes, then mint a clean digest before normal action.",
          "Do not infer from memory when the latest screenshot changed."
        ],
        behaviorLabels: ["stale_memory_carryover"],
        sourceDocs: sourceDocs()
      };

    case "app_scope_binding_evidence_required":
      return {
        code: input.code,
        summary:
          "The app-under-test scope is provider-bound, but the agent has not verified that the latest screenshot is the intended app/window surface.",
        immediateAction:
          "Inspect the latest visual artifact and submit desktop_submit_interaction_evidence with bindingEvidence before click/type readiness or mutation.",
        nextRequiredStep: {
          tool: "desktop_submit_interaction_evidence",
          instruction:
            "Submit bindingEvidence with bindingStatus confirmed, current visual binding evidence, geometry evidence, staleCarryoverReviewed true, and contradiction null.",
          arguments: compactRecord({
            ...baseArguments,
            bindingEvidence: {
              bindingStatus: "confirmed",
              contradiction: null,
              staleCarryoverReviewed: true
            }
          })
        },
        checklist: [
          "Confirm the screenshot shows the app-under-test body, not only browser chrome, a tab strip, or a tiny child/control surface.",
          "Check the returned active-window metadata and window/frame size before trusting active_window binding.",
          "If the binding is suspect, refocus or restore the top-level app window, observe again, then submit confirmed binding evidence."
        ],
        behaviorLabels: ["scope_drift", "gui_visual_grounding_issue"],
        sourceDocs: sourceDocs()
      };

    case "scope_rebind_required":
      return {
        code: input.code,
        summary:
          "The active window or observation scope is not bound to the licensed app-under-test.",
        immediateAction:
          "Bring the intended app back to foreground, then observe again with includeImages true.",
        nextRequiredStep: {
          tool: "desktop_observe",
          instruction:
            "Observe the intended app scope again before submitting new evidence.",
          arguments: compactRecord({
            sessionId: input.sessionId,
            targetScope: input.targetScope,
            includeImages: true
          })
        },
        checklist: [
          "Out-of-scope observations are not usable evidence for actions.",
          "Do not continue from a scope_exit frame.",
          "Start a fresh bounded session if the app-under-test binding cannot be restored."
        ],
        behaviorLabels: ["scope_drift"],
        sourceDocs: sourceDocs()
      };
  }
}

export function guidanceCodeForToolError(
  errorCode: string | undefined
): DesktopAgentGuidanceCode | undefined {
  if (errorCode === undefined) {
    return undefined;
  }

  if (errorCode === "workflow_state_claim_target_mismatch") {
    return "target_canonical_drift";
  }

  if (errorCode === "interaction_evidence_contradiction_present") {
    return "repair_digest_requires_clean_exit";
  }

  if (errorCode === "workflow_postcondition_status_required") {
    return "workflow_postcondition_status_required";
  }

  if (errorCode === "click_candidate_movement_action_required") {
    return "click_candidate_movement_binding_required";
  }

  if (
    errorCode.includes("perception_digest") ||
    errorCode === "stale_perception_digest"
  ) {
    return "perception_digest_current_clean_required";
  }

  if (errorCode.includes("app_scope_binding_evidence")) {
    return "app_scope_binding_evidence_required";
  }

  if (errorCode.includes("scope")) {
    return "scope_rebind_required";
  }

  return undefined;
}

export function guidanceCodeForClickCandidateStatus(
  status: string | undefined
): DesktopAgentGuidanceCode | undefined {
  if (status === undefined || status === "candidate_ready") {
    return undefined;
  }

  if (
    status === "perception_digest_invalid" ||
    status === "perception_digest_not_current" ||
    status === "perception_digest_not_visible"
  ) {
    return "perception_digest_current_clean_required";
  }

  if (
    status === "workflow_state_invalid" ||
    status === "workflow_state_not_current" ||
    status === "workflow_precondition_not_ready"
  ) {
    return "workflow_state_revalidation_required";
  }

  if (status === "transition_not_audited" || status === "insufficient_witness") {
    return "closed_loop_landing_assessment_required";
  }

  if (status === "scope_unbound" || status === "scope_mismatch") {
    return "scope_rebind_required";
  }

  if (status === "app_scope_binding_unverified") {
    return "app_scope_binding_evidence_required";
  }

  return undefined;
}

function compactRecord(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function sourceDocs(): DesktopAgentGuidance["sourceDocs"] {
  return [
    {
      path: "README.md",
      section: "Preferred compact loop and tool list"
    },
    {
      path: "docs/process/codex_desktop_interaction_reentry.md",
      section: "Desktop interaction re-entry loop"
    },
    {
      path: "docs/planning/admcp_023_carrier_state_design.md",
      section: "Runner UX Requirements"
    }
  ];
}
