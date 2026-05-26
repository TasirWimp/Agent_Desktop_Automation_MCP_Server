# Product Requirements

## Goal

Build an MCP server that lets agents assist with desktop automation while preserving user control, auditability, and narrow tool boundaries.

## MVP Scope

The MVP provides:

- a TypeScript MCP server over stdio,
- a capability-reporting tool,
- a policy-check tool for proposed desktop automation actions,
- a read-only UI intersection planning tool for future closed-loop click candidates,
- documented safety boundaries for future execution tools,
- unit tests and CI for the initial policy behavior.

## MVP Non-Goals

- No hidden autonomous desktop control.
- No credential access.
- No broad shell-command execution.
- No destructive file operations.
- No system configuration changes.
- No persistent background watcher or keylogger.

## Acceptance Criteria

- MCP server starts over stdio after `npm run build`.
- `desktop_capabilities` reports runtime and safety posture.
- `automation_policy_check` allows read-only observation with concrete intent.
- `automation_policy_check` requires confirmation for desktop state changes.
- `automation_policy_check` blocks shell commands, credential access, and system changes.
- `ui_intersection_plan` returns planning, residue, and policy reminder packets without moving the cursor or clicking.
- `npm run typecheck`, `npm run test`, and `npm run build` pass locally and in CI.
