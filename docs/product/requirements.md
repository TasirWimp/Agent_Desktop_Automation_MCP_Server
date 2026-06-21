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
- session lifecycle tools, deterministic mock observation packets, mock movement/click/type probes, a click-candidate witness gate, an opt-in Windows real-observation spike, an opt-in Windows real mouse-movement probe, an opt-in app-scoped Windows real-click gate, and an opt-in app-scoped Windows generated-text typing gate,
- compact relational navigation claims for smaller agents, with server-expanded audit packets and semantic landing assessment before click readiness,
- fresh perception digests that force clients to re-ground action and assessment claims against the latest screenshot-bearing observation without server-side image analysis,
- a catalog-only desktop application bootstrap tool backed by `config/desktop_applications.json`,
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
- No real clicking or real typing by default.
- No real clicking or real typing outside a user-declared reversible app-under-test scope.
- No real desktop capture unless the Windows active-window observation spike is explicitly enabled.
- No real cursor movement unless the Windows real-observation provider and the explicit real mouse-movement gate are both enabled.
- No coordinate-only proof for state-changing desktop actions. Coordinates may be used as probe/action endpoints, but relational evidence must carry the target claim.
- No stale visual-memory carryover as action proof. State-changing desktop actions, transition assessments, and click-candidate readiness require a current client-authored perception digest bound to the latest screenshot-bearing observation.
- No arbitrary executable path, command-line argument, or shell-based application launch through desktop application bootstrap.

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
- State-changing desktop action tools require either `compactRelationalClaim` or the full `relationalNavigation` packet before provider execution. Compact claims bind to screenshot-bearing live observations and are expanded server-side into audit evidence.
- State-changing desktop action tools also require `perceptionDigestId` from `desktop_submit_perception_digest`. The digest must be bound to the latest screenshot-bearing observation, match scope and intended target, and declare visible/non-contradicted current evidence unless the request is a relative-probe repair movement.
- Click-candidate evaluation, clicking, and typing also require `workflowStateClaimId` from `desktop_submit_workflow_state_claim`. The claim must be bound to the latest screenshot-bearing observation and perception digest, match scope and target, and declare whether the app is in the required committed workflow state.
- `desktop_move_mouse` accepts relational estimates and relative probes as endpoints, but cursor landing is telemetry only. The follow-up `desktop_observe({ transitionActionId })` leaves semantic movement transitions awaiting `desktop_submit_transition_assessment`.
- `desktop_submit_transition_assessment` records whether the follow-up screenshot supports, contradicts, or cannot conclude the stored relation/candidate/rejected-alternative/expected-evidence claim, and supported assessments require a current digest for the follow-up observation.
- `desktop_evaluate_click_candidate` requires a current recorded observation, current perception digest, current workflow-state claim, session scope, freshness, frame/cursor evidence, supported semantic landing assessment, no contradiction, and low-risk packet, records a hover target witness audit event, and never clicks.
- `desktop_click` requires hover-witness point provenance and a stored hover target witness for normal clicks. Cursor/candidate proximity is necessary telemetry but insufficient by itself.
- `desktop_click` and `desktop_type_text` require fresh pre-action observation, relational evidence, workflow-state evidence, record interaction transition gates, and require post-action observation. `desktop_click` can click the real desktop only when the explicit app-scoped Windows click gate is enabled; `desktop_type_text` can type generated test input in the real desktop only when the explicit app-scoped Windows typing gate is enabled.
- `desktop_open_application` accepts only catalog IDs or aliases from `config/desktop_applications.json`, requires user confirmation, and never accepts arbitrary executable paths or command-line arguments.
- Post-action observations classify transition outcomes as expected delta, no-op, wrong target, scope exit, risk prompt, uninterpretable state, or repair needed, and they update bounded repair-attempt accounting.
- `desktop_type_text` blocks credential-like or secret-like text before provider calls and does not store text content in action packets or audit events.
- The real click and typing gates require a user-declared reversible app-under-test, concrete scope binding, action audit, and post-action observation before success can be claimed.
- The Windows real-observation spike is disabled by default, requires explicit environment configuration, captures bounded active-window frames only, reports active-window-relative cursor position when available, and does not enable real clicking, typing, or durable desktop mutation by itself.
- The Windows real mouse-movement probe is disabled by default, requires explicit environment configuration, stays inside the scoped active-window capture frame, and does not enable real clicking, typing, or durable desktop mutation by itself.
- The Windows real-click gate is disabled by default, requires explicit environment configuration, stays inside the bound app-under-test scope, requires post-click observation, and keeps shell, app launch, and broad desktop control disabled.
- The Windows real-typing gate is disabled by default, requires explicit environment configuration, types only generated test input inside the bound app-under-test scope, records only text length/classification, requires post-type observation, and keeps shell, app launch, and broad desktop control disabled.
- The governed manual probe runner uses existing session tools, preserves audit output, and does not add click, typing, shell, or raw desktop control authority.
- `npm run typecheck`, `npm run test`, and `npm run build` pass locally and in CI.
