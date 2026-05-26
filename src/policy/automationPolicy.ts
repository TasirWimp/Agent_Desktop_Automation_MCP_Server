export const automationActionTypes = [
  "observe",
  "open_application",
  "open_url",
  "file_operation",
  "keyboard_input",
  "mouse_input",
  "shell_command",
  "credential_access",
  "system_change"
] as const;

export type AutomationActionType = (typeof automationActionTypes)[number];

export type PolicyDecision = "allow" | "requires_confirmation" | "block";

export interface AutomationPolicyRequest {
  actionType: AutomationActionType;
  intent: string;
  target?: string;
}

export interface AutomationPolicyResult {
  decision: PolicyDecision;
  requiresUserConfirmation: boolean;
  reasons: string[];
  auditTags: string[];
}

const blockedActionTypes = new Set<AutomationActionType>([
  "credential_access",
  "shell_command",
  "system_change"
]);

const confirmationActionTypes = new Set<AutomationActionType>([
  "open_application",
  "open_url",
  "file_operation",
  "keyboard_input",
  "mouse_input"
]);

export function evaluateAutomationPolicy(
  request: AutomationPolicyRequest
): AutomationPolicyResult {
  const intent = request.intent.trim();
  const target = request.target?.trim();
  const reasons: string[] = [];
  const auditTags: string[] = [request.actionType];

  if (intent.length === 0) {
    return {
      decision: "block",
      requiresUserConfirmation: false,
      reasons: ["Automation requests must include a concrete user-facing intent."],
      auditTags: [...auditTags, "missing_intent"]
    };
  }

  if (blockedActionTypes.has(request.actionType)) {
    return {
      decision: "block",
      requiresUserConfirmation: false,
      reasons: [
        `${request.actionType} is blocked in the initial safety model.`,
        "Document and review a narrower tool contract before enabling this action type."
      ],
      auditTags: [...auditTags, "blocked_high_risk_action"]
    };
  }

  if (confirmationActionTypes.has(request.actionType)) {
    reasons.push("This action can change desktop state and needs explicit user confirmation.");

    if (!target) {
      reasons.push("A target is required before this action can be executed.");
      auditTags.push("missing_target");
    }

    return {
      decision: "requires_confirmation",
      requiresUserConfirmation: true,
      reasons,
      auditTags
    };
  }

  return {
    decision: "allow",
    requiresUserConfirmation: false,
    reasons: ["Read-only observation is allowed when it has a concrete intent."],
    auditTags
  };
}
