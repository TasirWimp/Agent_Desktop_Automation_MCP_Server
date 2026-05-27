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

## Session License

A `desktop_interaction_session` defines the task boundary before low-risk actions are allowed:

- user goal,
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

`active_window` is a provisional scope kind. Mock policy may use it as shorthand, but a real provider must bind it to a concrete observed window identity, such as title, process, window id, or a stable provider-specific handle, before allowing desktop mutation. An unbound active-window license must not silently follow focus into unrelated private windows.

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

## Action Contract

`desktop_move_mouse`, `desktop_click`, and `desktop_type_text` must:

- require an active session,
- check that the action is inside the allowed scope,
- check that the action type is allowed by the session,
- log the pre-action observation id,
- log the intended semantic target when known,
- execute only if the session license permits it,
- require post-action observation for every state-changing action,
- return an action result with residue.

Mouse movement is a probe. It can move roughly toward a semantic target, observe visual delta, and refine the next movement or click decision. A `move_mouse` action therefore requires post-movement observation before the next non-observe action. Clicks and typing require post-action observation before success can be claimed.

State-changing actions should be mediated by interaction transition gates. A transition gate records the source observation, action id, target scope, protected observables, expected follow-up evidence, follow-up observation id, status, and residue. The next non-observe action is blocked until the relevant gate has been audited or escalated.

Clicking is licensed by:

- active session scope,
- rough semantic target,
- current visual evidence,
- low-risk action class,
- recoverability,
- audit logging,
- post-action verification.

The current policy slice validates observation references when observation packets are supplied to the evaluator. Future provider-backed tools must make those packets trustworthy by validating observation existence, freshness, session id, target scope, and frame linkage against real captured state before executing any desktop mutation.

## Relationship To Existing Policy

`automation_policy_check` remains the conservative single-action policy for actions that are not inside a confirmed interaction session.

The session policy evolves that model:

- confirmation is required to start the session,
- low-risk actions inside the license do not require repeated user confirmation,
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

This slice should not implement a real OS backend, clicking, typing, OCR, accessibility-tree interpretation, or autonomous background loops.
