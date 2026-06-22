# Licensed Desktop Interaction Sessions

## Purpose

The project goal is bounded desktop agency for UI-based development and testing:

observe -> infer -> act -> observe delta -> repair -> continue.

The server should not become a screenshot utility. Screenshots and frame sequences are the eye of the system, but the target architecture is eyes plus hands plus feedback loop plus repair inside a user-granted task license.

## Design Principle

The user grants a bounded task license. Codex acts inside the license. Every action leaves a trace. Every action is followed by observation. Failures produce repair paths, not blind retries.

This is different from brittle coordinate clicking:

- not: LLM sees a screenshot, predicts an exact button coordinate, clicks,
- instead: Codex observes the desktop, identifies a rough semantic target, moves toward the area of interest, observes visual deltas, looks for interaction hints, and chooses the next bounded action.

For desktop RGB automation, frame sequences are a primary witness channel. A single screenshot does not license action by itself, but bounded frame sequences are the observation substrate for later semantic localization, cursor tracking, hover deltas, intersection stability, and post-action verification.

## CRPM Compatibility

The session model is a CRPM-compatible governed re-entry loop without requiring CRPM vocabulary in public tool inputs. The server carries the global path structurally: it records the current session window, witness artifacts, interaction evidence, transition gates, residue, and next required re-entry step. The agent carries the lived local interpretation: it inspects the latest screenshot artifact, declares the target/workflow meaning, and updates that claim after each observed transition.

In this mapping:

- `desktop_observe` creates the current witness surface,
- `desktop_submit_interaction_evidence` records a reviewed carrier for the next action,
- `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` create transition edges that must be observed,
- transition assessment and workflow postcondition claims decide whether the route still carries, requires repair, or must stop,
- click readiness is only provisional landfall inside the licensed app scope until a follow-up observation confirms the expected workflow state.

The compatibility constraint is operational: do not collapse the loop into raw coordinate clicking, hidden model memory, or server-side visual interpretation. The server should keep the path recoverable; the agent should keep the current witness interpretation fresh.

## Session License

A `desktop_interaction_session` defines the task boundary before low-risk actions are allowed:

- user goal,
- user-declared reversible app-under-test when real click or typing may be requested,
- allowed app, window, process, or workspace scope,
- allowed action types,
- forbidden action types,
- risk limits,
- max duration,
- max action count,
- observation cadence,
- audit-log requirements,
- recovery and stop conditions.

Starting a session requires explicit user confirmation. Within a confirmed session, the agent may perform bounded low-risk actions without asking before every micro-action when those actions stay inside the license.

For UI development and testing, the preferred future real-control model is app-under-test scoped. The user declares the specific app, window, process, workspace, or local URL as safe and reversible for the task. The user is responsible for preparing that app/test fixture so permanent damage cannot occur. The server's primary responsibility is then to bind the session to the declared app and stop or escalate when an agent-triggered action would leave it.

The current license schema includes `licensedAppScope` for this declaration. It records:

- app-under-test description,
- app scope,
- `userDeclaredReversible`,
- app-scoped allowed actions,
- forbidden boundaries,
- scope-exit stop conditions.

Sessions that grant `click` or `type_text` must include a reversible `licensedAppScope` with forbidden boundaries. The current implementation enforces that declaration, binds it to observed provider identity through `desktop_observe`, stores the result as `boundAppScope`, and scopes click/type policy checks to that binding.

`active_window` is a provisional scope kind until the first matching observation. Mock policy may use it as shorthand, but a real provider must bind it to a concrete observed window identity, such as title, process, window id, or a stable provider-specific handle, before allowing desktop mutation. An active-window license must not silently follow focus into unrelated private windows; later observations that drift from `boundAppScope` return `scope_exit` evidence and append a stop condition instead of recording the out-of-scope frame.

Examples of session-licensed low-risk actions:

- capture screenshots or frame sequences,
- move the mouse inside the allowed window,
- click visible controls inside the allowed window,
- type generated test input when the session permits typing,
- observe the result,
- retry or repair within configured limits.

## Escalation Boundaries

The agent must stop or escalate when it reaches a boundary:

- credential entry or credential exposure,
- payment or purchase,
- sending messages or email,
- external publishing or deployment,
- deleting files outside the project workspace,
- changing system settings,
- accessing unrelated private windows,
- leaving the allowed app, window, process, or workspace scope,
- high uncertainty with low recoverability,
- max action count or max duration reached,
- post-action state cannot be interpreted.

Credential access, broad shell execution, destructive file operations outside the licensed workspace, and system changes remain blocked unless a future safety model explicitly narrows and documents them.

## Core MCP Tools

Planned tools:

- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_evaluate_click_candidate`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

The first implementation slices may use mock or provider-based backends. The public contracts should still preserve the future real desktop loop.

## Observation Contract

`desktop_observe` should return:

- screenshot or bounded frame-session metadata,
- active window metadata when available,
- cursor position when available,
- optional last-action delta summary,
- timestamp,
- session id,
- residue and uncertainty notes.

Observation must be bounded. There must be no hidden polling loop, no background capture after a tool returns, and no OCR or localization requirement in the first version.

When a session has `licensedAppScope`, `desktop_observe` is also the app-scope binding point. The first matching observation creates `boundAppScope`; later matching observations refresh it; mismatching observations stop or escalate with `outside_allowed_scope` and are not recorded as session observations. This keeps the visual witness session attached to the declared app-under-test instead of whatever window happens to become active later.

## Action Contract

`desktop_move_mouse`, `desktop_click`, and `desktop_type_text` must:

- require an active session,
- check that the action is inside the allowed scope,
- check that the action type is allowed by the session,
- log the pre-action observation id,
- require a fresh perception digest for the current screenshot-bearing observation,
- log the intended semantic target when known,
- execute only if the session license permits it,
- require post-action observation for every state-changing action,
- return an action result with residue.

Mouse movement is a probe. It can move roughly toward a semantic target, observe visual delta, and refine the next movement or click decision. A `move_mouse` action therefore requires post-movement observation before the next non-observe action. Clicks and typing require post-action observation before success can be claimed.

State-changing actions should be mediated by interaction transition gates. A transition gate records the source observation, action id, target scope, protected observables, expected follow-up evidence, follow-up observation id, status, and residue. The next non-observe action is blocked until the relevant gate has been audited or escalated.

When the follow-up observation is attached, the transition gate also records a post-action classification:

- `expected_delta` - the follow-up has enough evidence to treat the action as completed and reset consecutive repair attempts,
- `no_op`, `wrong_target`, or `repair_needed` - a bounded repair path remains available inside the licensed app scope until the session repair limit is reached,
- `scope_exit`, `risk_prompt`, or `uninterpretable_state` - the session must stop or escalate before another non-observe action.

Classification is based on available witness packets, scope/frame evidence, frame-hash deltas, provider delta summaries, and forbidden-boundary terms. It is not OCR, semantic localization, or a guarantee that the target UI state is semantically correct.

Clicking is licensed by:

- active session scope,
- bound app-under-test identity for real clicks,
- rough semantic target,
- current visual evidence,
- session permission for app-scoped click,
- user's declaration that the app-under-test is reversible,
- audit logging,
- post-action verification.

`desktop_submit_interaction_evidence` is the preferred operational evidence helper for click targeting. It can record the fresh perception digest, workflow-state claim, follow-up transition assessment, and click-candidate witness after the client has inspected the latest visual artifact. The compact path is `observe -> inspect visual artifact -> submit_interaction_evidence -> move_mouse -> observe transitionActionId -> submit_interaction_evidence with transition/candidate evidence`. Strict/debug clients can still call `desktop_evaluate_click_candidate` directly after fresh perception/workflow evidence and supported semantic landing assessment. Candidate evaluation checks whether the current session has enough scope, frame, cursor, supported semantic landing, no-contradiction, digest, committed workflow-state or bounded workflow revalidation, and risk evidence to request a future app-scoped click. It records audit residue and a hover target witness when ready, and never executes a click. A ready candidate is evidence for targeting quality and workflow readiness, not permission to click outside the licensed app-under-test model.

Workflow-state claims sit above element targeting. They are still client-authored evidence, not server image analysis. The server only enforces freshness, observation/digest/frame binding, scope, target equivalence, and role/precondition rules. For example, an open Mod Organizer dropdown with the BodySlide row highlighted can support a `commit_precondition` click on the BodySlide row, but it cannot support an `execute_committed_action` click on Run until a later observation and workflow claim state that BodySlide is the committed selection.

The current policy slice validates observation references when observation packets are supplied to the evaluator. Provider-backed tools must make those packets trustworthy by validating observation existence, freshness, session id, target scope, and frame linkage against real captured state before executing any desktop action.

The current scope-binding runtime validates that app-scoped click/type policy has a fresh `boundAppScope` and that the referenced pre-action observation still matches that bound app identity. Real clicking is available only through the explicit app-scoped Windows provider gate. Real typing is available only through the explicit app-scoped Windows generated-test-input provider gate, and credential-like or secret-like text is blocked before provider execution.

## Relationship To Existing Policy

`automation_policy_check` remains the conservative single-action policy for actions that are not inside a confirmed interaction session.

The session policy evolves that model:

- confirmation is required to start the session,
- actions inside the bound reversible app-under-test license do not require repeated user confirmation,
- boundary crossings stop or escalate,
- blocked action classes remain blocked,
- every action is auditable,
- every state-changing action must be followed by observation,
- every click or typing action must be followed by observation before success is claimed.

## First Safe Implementation Slice

The first safe slice should add schemas, policy evaluators, tests, and mock/provider seams before real OS control:

- session license packet,
- observation packet,
- action packet,
- audit event packet,
- stop condition packet,
- policy evaluator for session start,
- policy evaluator for in-session action preflight and completion,
- deterministic tests for scope, risk, audit, and post-action observation requirements.

This first slice did not implement a real OS mutation backend, real clicking, real typing, OCR, accessibility-tree interpretation, or autonomous background loops. Later slices added explicit app-scoped click and generated-test-input typing gates without adding raw broad desktop control.

## Current Implementation Note

The Windows provider now has four opt-in real gates:

- real active-window observation with `ADMCP_ENABLE_REAL_OBSERVATION=true`,
- real mouse movement with `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true`,
- app-scoped real clicking with `ADMCP_ENABLE_REAL_CLICK=true`,
- app-scoped generated-test-input typing with `ADMCP_ENABLE_REAL_TYPING=true`.

Real mouse movement is treated as a non-durable pointer probe, not as permission to click or type. It requires a licensed session, fresh screenshot-bearing pre-action observation, relational navigation evidence, active-window scope validation, an in-frame target point, audit logging, post-movement observation, and semantic landing assessment before click readiness. Real click and real typing require a bound reversible app-under-test scope and post-action observation. Shell execution, arbitrary app launching, command-line launch arguments, system changes, external publishing, and broad desktop mutation remain disabled.
