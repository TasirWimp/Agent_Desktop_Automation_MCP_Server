# Scope-Enforced Interaction Model

## Default Posture

The server is policy-first, but the policy center for UI development/testing is scope enforcement. A tool that can change desktop state must have a documented contract before implementation and must expose enough audit data for a user or reviewer to understand what happened.

The long-term interaction model is task-scoped licensed autonomy, not confirmation before every micro-action. The user grants a bounded desktop interaction session, the agent acts inside that license, every action leaves an audit trace, and every state-changing action is followed by observation.

For real UI testing, the intended license is a user-declared app-under-test. The user identifies an app, window, process, workspace, or local URL and declares it safe and reversible for the requested test task. The server does not try to judge every in-app click as globally safe; it enforces that agent-triggered interactions stay inside the bound app scope and stops or escalates at boundary crossings.

## Initial Action Classes

- `observe` - read-only context gathering. Allowed when the intent is concrete.
- `open_application`, `open_url`, `file_operation`, `keyboard_input`, `mouse_input` - desktop state changes. Require user confirmation when proposed outside a confirmed interaction session.
- `shell_command`, `credential_access`, `system_change` - blocked in the initial model.

Inside a confirmed `desktop_interaction_session`, bounded low-risk actions such as observation, mouse movement, clicking visible controls in the allowed window, and typing generated test input may be licensed by the session instead of requiring repeated per-action confirmation as their tool contracts become available.

Inside a declared reversible app-under-test session, real click and future typing tools may be licensed as ordinary test interactions when they stay inside the bound app, use generated test data where relevant, leave an audit trace, and are followed by observation. The main block condition becomes scope exit or an explicitly forbidden boundary, not generic click risk.

## Tool Contract Requirements

Every execution tool must document:

- target shape,
- allowed and blocked inputs,
- user confirmation behavior,
- failure modes,
- audit output,
- tests required before release.

## Current Decision

The server exposes capability reporting, policy classification, read-only UI intersection planning, session lifecycle tools, mock observation, mock movement/click/type probes, cursor and movement-delta witness packets, licensed app-scope declarations, runtime app-scope binding, opt-in Windows active-window observation, an opt-in Windows real mouse-movement probe, and an opt-in app-scoped Windows real-click gate. The default provider remains mock-only. Real typing, shell commands, app launching, system changes, and broad desktop mutation remain disabled.

`ui_intersection_plan` may prepare a policy-gated candidate packet from semantic localization and frame evidence. It must not move the cursor, click, capture screens, or claim success. Actual `mouse_input` remains a state-changing action that requires either single-action policy confirmation or an active session license, audit logging, scope checks, and post-action observation.

`desktop_evaluate_click_candidate` is a session-aware targeting-quality gate. It checks that a future click candidate references an active session, allowed click action, fresh recorded observation, matching scope, frame evidence, cursor/candidate proximity, optional audited movement evidence, and a low-risk packet. It records a `click_candidate_evaluated` audit event. It does not click, move, type, capture new frames, or make real clicking available. For future app-scoped real click work, this evidence should reduce wrong-target clicks and guide repair; it is not the main governance boundary.

`desktop_move_mouse` is mock-only by default. When the Windows provider is selected with both `ADMCP_ENABLE_REAL_OBSERVATION=true` and `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true`, it may move the real cursor as a bounded active-window-scoped probe. The requested point is interpreted in active-window frame coordinates, must stay inside the observed active-window bounds, must pass session scope and freshness checks, is audited, and creates a transition gate requiring post-movement observation before any next non-observe action. This is allowed as a non-durable pointer probe; it does not license clicking, typing, app launching, shell execution, or persistent desktop changes.

`desktop_click` is mock-only by default. When the Windows provider is selected with `ADMCP_ENABLE_REAL_OBSERVATION=true` and `ADMCP_ENABLE_REAL_CLICK=true`, it may click only inside the bound app-under-test scope. It requires an active session, reversible `licensedAppScope`, fresh `boundAppScope`, fresh pre-action observation, in-frame point, app-scoped `click` permission, audit logging, and a post-click observation before another non-observe action. `desktop_type_text` remains mock-only and must block credential-like or secret-like text before provider calls; it must not store text content in action packets or audit events.

`desktop_observe` can use an opt-in Windows active-window observation provider when `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true` are set. The default remains mock-only. The real-observation spike captures bounded visible active-window frames only, reports active-window-relative cursor witness metadata when available, can render the visible cursor and a high-contrast cursor witness marker into active-window frames when provider cursor evidence is sufficient, validates active-window scope before capture, and does not enable real clicking, typing, or durable desktop mutation by itself.

When a session declares `licensedAppScope`, `desktop_observe` binds the declared app-under-test to observed provider identity and stores it as `boundAppScope`. Later observations must match that binding. If focus or active-window identity drifts outside the bound app, the tool returns `status: "scope_exit"`, appends an `outside_allowed_scope` stop condition and `escalation_required` audit event, and does not record or return the out-of-scope frame as session evidence.

## Session License Direction

The planned session model is documented in `licensed_desktop_interaction_sessions.md`.

Core boundary:

- User confirmation is required before starting a bounded task session.
- For real click and future real type, the user must declare the app-under-test safe and reversible. This declaration is represented by `licensedAppScope`.
- Low-risk actions inside the bound app, window, process, workspace, or local URL scope can proceed without repeated user confirmation.
- Boundary crossings require stop or escalation.
- Credential entry, payment, external publishing, destructive operations outside scope, unrelated private windows, and system changes remain blocked or escalated.
- `active_window` scope is provisional until `desktop_observe` binds it to concrete observed window identity before mutation.
- `observed_window_identity`, `local_url`, and `local_origin` scope kinds are modeled; URL/origin binding still needs a provider that can supply URL identity.
- Provider-backed tools must validate observation existence, freshness, session id, scope, and frame linkage before state-changing actions.
- No background capture, hidden polling loop, OCR dependency, real typing backend, shell backend, broad desktop-control backend, or unscoped durable OS mutation backend is part of the current implementation.
