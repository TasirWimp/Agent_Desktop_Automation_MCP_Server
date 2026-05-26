import { describe, expect, it } from "vitest";
import { evaluateAutomationPolicy } from "../src/policy/automationPolicy.js";

describe("evaluateAutomationPolicy", () => {
  it("allows read-only observation when the intent is concrete", () => {
    const result = evaluateAutomationPolicy({
      actionType: "observe",
      intent: "Read the active window title for context."
    });

    expect(result.decision).toBe("allow");
    expect(result.requiresUserConfirmation).toBe(false);
  });

  it("requires confirmation for desktop state changes", () => {
    const result = evaluateAutomationPolicy({
      actionType: "open_url",
      intent: "Open a documentation page requested by the user.",
      target: "https://modelcontextprotocol.io"
    });

    expect(result.decision).toBe("requires_confirmation");
    expect(result.requiresUserConfirmation).toBe(true);
  });

  it("blocks shell commands in the initial safety model", () => {
    const result = evaluateAutomationPolicy({
      actionType: "shell_command",
      intent: "Run a local shell command."
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("blocked_high_risk_action");
  });

  it("blocks requests without a concrete intent", () => {
    const result = evaluateAutomationPolicy({
      actionType: "observe",
      intent: "   "
    });

    expect(result.decision).toBe("block");
    expect(result.auditTags).toContain("missing_intent");
  });
});
