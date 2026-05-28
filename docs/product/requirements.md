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
- session lifecycle tools, deterministic mock observation packets, mock movement/click/type probes, an opt-in Windows real-observation spike, and an opt-in Windows real mouse-movement probe,
- a governed manual probe runner for repeatable observation/movement path-finding checks,
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
- No real clicking or real typing in the current provider slices.
- No real desktop capture unless the Windows active-window observation spike is explicitly enabled.
- No real cursor movement unless the Windows real-observation provider and the explicit real mouse-movement gate are both enabled.

## Acceptance Criteria

- MCP server starts over stdio after `npm run build`.
- `desktop_capabilities` reports runtime and safety posture.
- `automation_policy_check` allows read-only observation with concrete intent.
- `automation_policy_check` requires confirmation for desktop state changes.
- `automation_policy_check` blocks shell commands, credential access, and system changes.
- `ui_intersection_plan` returns planning, residue, and policy reminder packets without moving the cursor or clicking.
- Session-license policy contracts require user confirmation to start a bounded task session and keep low-risk in-session actions auditable.
- `desktop_observe` requires an active session, stays bounded, records observation packets, and captures real desktop frames only when the Windows active-window observation spike is explicitly enabled.
- `desktop_move_mouse` requires a fresh pre-action observation, records an interaction transition gate, requires post-movement observation, and moves the real cursor only when the Windows real mouse-movement gate is explicitly enabled.
- `desktop_click` and `desktop_type_text` require fresh pre-action observation, record interaction transition gates, require post-action observation, and do not click or type in the real desktop.
- `desktop_type_text` blocks credential-like or secret-like text before provider calls and does not store text content in action packets or audit events.
- The Windows real-observation spike is disabled by default, requires explicit environment configuration, captures bounded active-window frames only, reports active-window-relative cursor position when available, and keeps real clicking, typing, and durable desktop mutation disabled.
- The Windows real mouse-movement probe is disabled by default, requires explicit environment configuration, stays inside the scoped active-window capture frame, and keeps real clicking, typing, and durable desktop mutation disabled.
- The governed manual probe runner uses existing session tools, preserves audit output, and does not add click, typing, shell, or raw desktop control authority.
- `npm run typecheck`, `npm run test`, and `npm run build` pass locally and in CI.
