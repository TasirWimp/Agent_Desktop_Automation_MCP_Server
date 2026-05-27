# Product Requirements

## Goal

Build an MCP server that gives agents bounded desktop agency for UI-based development and testing while preserving user control, auditability, and narrow tool boundaries.

The target loop is:

observe -> infer -> act -> observe delta -> repair -> continue.

## MVP Scope

The MVP provides:

- a TypeScript MCP server over stdio,
- a capability-reporting tool,
- a policy-check tool for proposed desktop automation actions,
- a read-only UI intersection planning tool for future closed-loop click candidates,
- policy contracts for future task-scoped licensed desktop interaction sessions,
- session lifecycle tools, deterministic mock observation packets, and mock movement probes,
- documented safety boundaries for future execution tools,
- unit tests and CI for the initial policy behavior.

## MVP Non-Goals

- No hidden autonomous desktop control.
- No credential access.
- No broad shell-command execution.
- No destructive file operations.
- No system configuration changes.
- No persistent background watcher or keylogger.
- No unbounded autonomous desktop control outside a user-granted task license.
- No real desktop capture or real cursor movement in the current mock provider slices.

## Acceptance Criteria

- MCP server starts over stdio after `npm run build`.
- `desktop_capabilities` reports runtime and safety posture.
- `automation_policy_check` allows read-only observation with concrete intent.
- `automation_policy_check` requires confirmation for desktop state changes.
- `automation_policy_check` blocks shell commands, credential access, and system changes.
- `ui_intersection_plan` returns planning, residue, and policy reminder packets without moving the cursor or clicking.
- Session-license policy contracts require user confirmation to start a bounded task session and keep low-risk in-session actions auditable.
- `desktop_observe` requires an active session, stays bounded, records mock observation packets, and does not capture the real desktop.
- `desktop_move_mouse` requires a fresh pre-action observation, records an interaction transition gate, requires post-movement observation, and does not move the real cursor.
- `npm run typecheck`, `npm run test`, and `npm run build` pass locally and in CI.
