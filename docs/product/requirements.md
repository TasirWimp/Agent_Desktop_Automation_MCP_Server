# Product Requirements

## Goal

Build an MCP server that gives agents bounded desktop agency for UI-based development and testing while preserving user control, auditability, and narrow tool boundaries.

The target loop is:

observe -> infer -> act -> observe delta -> repair -> continue.

For future real click and typing, the target governance model is app-under-test scoped: the user declares a specific app/window/process/local URL safe and reversible for UI testing, and the server enforces that agent-triggered interactions stay inside that bound app.

## MVP Scope

The MVP provides:

- a TypeScript MCP server over stdio,
- a capability-reporting tool,
- a policy-check tool for proposed desktop automation actions,
- a read-only UI intersection planning tool for future closed-loop click candidates,
- policy contracts for future task-scoped licensed desktop interaction sessions,
- a user-declared reversible app-under-test scope model for click/type session permissions,
- session lifecycle tools, deterministic mock observation packets, mock movement/click/type probes, a click-candidate witness gate, an opt-in Windows real-observation spike, and an opt-in Windows real mouse-movement probe,
- a governed manual probe runner for repeatable observation/movement path-finding checks,
- documented scope-enforcement boundaries for future execution tools,
- unit tests and CI for the initial policy behavior.

## MVP Non-Goals

- No hidden autonomous desktop control.
- No credential access.
- No broad shell-command execution.
- No destructive file operations.
- No system configuration changes.
- No persistent background watcher or keylogger.
- No unbounded autonomous desktop control outside a user-granted task license.
- No real clicking by default and no real typing in the current provider slices.
- No real clicking or future real typing outside a user-declared reversible app-under-test scope.
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
- Sessions that grant `click` or `type_text` must declare a reversible `licensedAppScope` with forbidden boundaries, and click/type policy checks are scoped to that declared app-under-test.
- Sessions with `licensedAppScope` bind that app-under-test through `desktop_observe`, expose the binding as `boundAppScope`, and stop/escalate with `scope_exit` evidence if later observations drift outside the bound app.
- `desktop_observe` requires an active session, stays bounded, records observation packets, and captures real desktop frames only when the Windows active-window observation spike is explicitly enabled.
- `desktop_move_mouse` requires a fresh pre-action observation, records an interaction transition gate, requires post-movement observation, and moves the real cursor only when the Windows real mouse-movement gate is explicitly enabled.
- `desktop_evaluate_click_candidate` requires a current recorded observation, checks session scope, freshness, frame/cursor evidence, optional movement-transition evidence, and low-risk packet, records a witness audit event, and never clicks.
- `desktop_click` and `desktop_type_text` require fresh pre-action observation, record interaction transition gates, and require post-action observation. `desktop_click` can click the real desktop only when the explicit app-scoped Windows click gate is enabled; `desktop_type_text` does not type in the real desktop.
- `desktop_type_text` blocks credential-like or secret-like text before provider calls and does not store text content in action packets or audit events.
- The real click gate requires a user-declared reversible app-under-test, concrete scope binding, action audit, and post-action observation before success can be claimed. Future real typing must follow the same boundary.
- The Windows real-observation spike is disabled by default, requires explicit environment configuration, captures bounded active-window frames only, reports active-window-relative cursor position when available, and does not enable real clicking, typing, or durable desktop mutation by itself.
- The Windows real mouse-movement probe is disabled by default, requires explicit environment configuration, stays inside the scoped active-window capture frame, and does not enable real clicking, typing, or durable desktop mutation by itself.
- The Windows real-click gate is disabled by default, requires explicit environment configuration, stays inside the bound app-under-test scope, requires post-click observation, and keeps real typing, shell, app launch, and broad desktop control disabled.
- The governed manual probe runner uses existing session tools, preserves audit output, and does not add click, typing, shell, or raw desktop control authority.
- `npm run typecheck`, `npm run test`, and `npm run build` pass locally and in CI.
