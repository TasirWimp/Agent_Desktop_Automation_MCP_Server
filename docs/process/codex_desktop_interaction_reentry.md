# Codex Desktop Interaction Re-Entry

## Current Tool State

Available MCP tools:

- `desktop_capabilities`
- `automation_policy_check`
- `ui_intersection_plan`
- `desktop_start_interaction_session`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Unavailable MCP tools:

- `desktop_observe`
- `desktop_move_mouse`
- `desktop_click`
- `desktop_type_text`

No tool currently captures the desktop, moves the mouse, clicks, types, launches apps, or controls the OS.

## Current Session Workflow

Use the session tools only to create and inspect a bounded task license.

1. Call `desktop_start_interaction_session`.
2. Include a concrete `userGoal`.
3. Set `userConfirmed: true` only when the user has actually granted the task-level license.
4. Set `visibleContentAcknowledged: true` only when the user has acknowledged that future observation tools may capture visible desktop content.
5. Provide allowed scopes, allowed actions, forbidden actions, risk limits, and observation cadence.
6. Use `desktop_session_audit_log` to inspect the session trace.
7. Use `desktop_end_interaction_session` when the task license should stop.

The current implementation records session lifecycle audit events only. It cannot perform the observe-act-observe loop yet.

## Stop Or Escalate

Stop or ask the user before continuing if:

- user confirmation is absent,
- visible-content acknowledgement is absent,
- the requested scope is unrelated to the user's task,
- the request implies credentials, payments, messages, publishing, destructive operations, shell execution, or system settings,
- the user expects real desktop observation or control.

## Next Tool Sequence After Future Slices

After later slices expose observation and action tools, the intended sequence is:

1. Start a licensed session.
2. Observe the scoped app/window.
3. Move as a probe only after fresh observation.
4. Observe the movement delta.
5. Click or type only inside scope with current visual evidence.
6. Observe after every state-changing action.
7. Inspect audit logs and stop the session.

This future sequence is not yet executable in the current server.
