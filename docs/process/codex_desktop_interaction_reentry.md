# Codex Desktop Interaction Re-Entry

## Current Tool State

Available MCP tools:

- `desktop_capabilities`
- `automation_policy_check`
- `ui_intersection_plan`
- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Unavailable MCP tools:

- real mouse movement
- real clicking
- real typing

Default server behavior is mock-only. By default, no tool captures the real desktop, moves the real mouse, clicks the real desktop, types into the real desktop, launches apps, or controls the OS. `desktop_observe`, `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` are backed by a deterministic mock provider unless the server is started with the real-observation spike enabled.

Real observation spike:

- Opt-in only with `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true`.
- Captures bounded visible active-window PNG frames through `desktop_observe`.
- Requires an active session, visible-content acknowledgement, allowed observation scope, and bounded frame/duration inputs.
- Does not enable real mouse movement, real clicking, real typing, OCR, localization, hidden polling, background capture, app launching, shell tools, or OS mutation.

## Current Session Workflow

Use the session tools to create a bounded task license, record mock observation packets, run mock movement/click/type probes, and inspect the audit trail.

1. Call `desktop_start_interaction_session`.
2. Include a concrete `userGoal`.
3. Set `userConfirmed: true` only when the user has actually granted the task-level license.
4. Set `visibleContentAcknowledged: true` only when the user has acknowledged that future observation tools may capture visible desktop content.
5. Provide allowed scopes, allowed actions, forbidden actions, risk limits, and observation cadence.
6. Call `desktop_observe` only after the session is active.
7. Keep `mode: "frame_session"` unless a single-frame witness is explicitly enough for the test.
8. Keep `maxFrames` and `durationMs` bounded. The current tool caps requests at 12 frames and 5000 ms.
9. Treat observation output as mock evidence unless `desktop_capabilities.provider.providerKind` is `real`.
10. Call `desktop_move_mouse` only after a fresh observation and pass that observation id as `preActionObservationId`.
11. Treat `desktop_move_mouse` as a probe. It returns an interaction transition gate in `pending_observation` state.
12. Call `desktop_click` or `desktop_type_text` only after a fresh observation and only when no prior transition gate is pending.
13. For `desktop_type_text`, use generated test input only. The tool records text length but not text content.
14. After every movement, click, or typing probe, call `desktop_observe` with `transitionActionId` set to the action id.
15. Do not call another non-observe action until the transition gate returns `audited`.
16. Use `desktop_session_audit_log` to inspect the session trace.
17. Use `desktop_end_interaction_session` when the task license should stop.

The current implementation records session lifecycle, mock observation, mock movement, mock click, and mock typing audit events. It can exercise the mock `observe -> act -> observe transitionActionId` loop, but cannot capture the real desktop, move the real cursor, click the real desktop, or type into the real desktop.

## Stop Or Escalate

Stop or ask the user before continuing if:

- user confirmation is absent,
- visible-content acknowledgement is absent,
- the requested scope is unrelated to the user's task,
- an interaction transition gate is blocked or cannot be audited from the available observation,
- the request implies credentials, payments, messages, publishing, destructive operations, shell execution, or system settings,
- `desktop_type_text` input is credential-like, secret-like, private, or not generated test input,
- the user expects real desktop control,
- real observation is enabled but the active window does not match the requested scope.

## Current Mock Loop

Executable mock sequence:

1. Start a licensed session.
2. Observe the scoped app/window with mock bounded frame evidence.
3. Move as a mock probe only after fresh observation.
4. Observe with `transitionActionId` to audit the movement transition.
5. Click or type as a mock probe only after the transition gate is audited.
6. Observe with `transitionActionId` to audit the click or typing transition.
7. Inspect audit logs and stop the session.

Future real providers must reuse the same transition gate discipline before any real desktop backend is enabled.

## Real Observation Manual Check

Use `../testing/manual_real_observation_checklist.md` before relying on the Windows real-observation spike outside unit tests.
