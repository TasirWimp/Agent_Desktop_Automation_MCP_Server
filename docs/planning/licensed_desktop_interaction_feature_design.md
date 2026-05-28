# Licensed Desktop Interaction Feature Design

## Purpose

Turn the licensed desktop interaction architecture into implementable feature slices.

This document is not a new safety model. The source of truth for the session concept is `../architecture/licensed_desktop_interaction_sessions.md`. This design document extracts concrete tools, provider seams, state objects, tests, and delivery order from that architecture.

## Design Target

The target product behavior is bounded UI-based development and testing agency:

observe -> infer -> act -> observe delta -> repair -> continue.

Codex should be able to launch or use a project app inside a user-granted session, interact with the UI like a user, observe the result, and repair the implementation or test scenario. The server must not collapse into a screenshot utility and must not expose raw desktop control without a session license.

## Interaction Transition Gates

The observe-act-observe loop should be governed as a transition path between visual witnesses, not as isolated tool calls and not as a brittle coordinate-click sequence.

Local transition shape:

```text
observation_i
  -> action probe / state change
    -> observation_i+1
      -> transition audit
        -> next licensed action or repair
```

This is the desktop-interaction analogue of a governed navigation transition: the system starts from a declared witness, performs a bounded licensed move, observes what changed, records residue, and only then decides whether the next non-observe action is licensed.

Use repo-local names for the implementation. Do not import a broad CRPM or discourse-topology schema into this repo yet. The useful local object is an `interaction transition gate`, not a general theory object.

An interaction transition gate should record:

- session id,
- action id,
- transition status,
- source observation id,
- required follow-up observation,
- follow-up observation id when available,
- target scope,
- intended semantic target when known,
- protected observables,
- expected evidence after the action,
- observed delta summary when available,
- residue and uncertainty notes.

Initial transition statuses:

- `pending_observation`: action has run or been simulated and must be followed by observation before any next non-observe action.
- `observed`: follow-up observation exists and is attached to the transition.
- `audited`: the follow-up observation has enough evidence for the next low-risk action or for a repair decision.
- `blocked`: the transition cannot be closed inside the current evidence, scope, or risk limits.
- `escalation_required`: the transition exposed a boundary condition that requires user review.

Movement is the key first case. `desktop_move_mouse` is not merely cursor placement. It is a probe that changes the evidence surface by producing possible hover highlights, cursor changes, tooltips, focus states, enabled or disabled affordances, and other visual deltas. Therefore `move_mouse -> click` must pass through a transition gate:

```text
observe -> move_mouse -> observe transition delta -> click or repair
```

A bare `pendingPostActionObservation` boolean is acceptable only as an internal shortcut if it is backed by transition state that can identify which action requires follow-up observation, what evidence must be protected, what residue remains, and why the next action is allowed or blocked.

## External Pattern Inputs

The web survey provides protocol and loop witnesses, not behavior to copy wholesale:

- MCP TypeScript SDK: `registerTool`, Zod schemas, `structuredContent`, image content blocks, embedded resources, and controlled tool errors.
- MCP ToolAnnotations: useful client hints for read-only, destructive, idempotent, and open-world behavior, but never enforcement.
- MCP resources: useful for larger frame and audit artifacts via resource links instead of inline base64 everywhere.
- Filesystem reference server: useful analogy for scope validation against allowed boundaries.
- Playwright MCP: useful for capability gating, fresh state after actions, short-lived target references, and optional vision mode.
- OpenAI and Anthropic computer-use docs: useful witness for the screenshot/action/screenshot loop, max-iteration limits, isolation, allowlists, and human escalation.
- MCP elicitation: useful for session start and escalation prompts, but not for sensitive information.

Reference links:

- https://ts.sdk.modelcontextprotocol.io/documents/server.html
- https://modelcontextprotocol.io/specification/draft/server/tools
- https://modelcontextprotocol.io/specification/draft/server/resources
- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts
- https://playwright.dev/mcp/capabilities
- https://playwright.dev/mcp/snapshots
- https://playwright.dev/mcp/tools/interaction
- https://playwright.dev/mcp/vision-mode
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool

## Product Shape

The server should expose a small coherent desktop interaction surface:

- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Initial tools may be mock/provider-backed. Real OS mutation is a later backend decision, not part of the first tool-contract slice.

## Capability Groups

Use capability groups so clients and tests can reason about what is enabled:

- `policy`: capability reporting and single-action policy checks.
- `planning`: read-only UI intersection planning.
- `session_policy`: session-license schemas and evaluators.
- `session_mock`: mock/provider-backed session tools with no OS mutation.
- `desktop_observe`: bounded real observation backend, when available.
- `desktop_control`: real mouse/keyboard backend, disabled until manually enabled and tested.

Default posture should keep `desktop_control` disabled.

## Tool Contract Summaries

### desktop_start_interaction_session

Goal: create a bounded session license after explicit user confirmation.

Input:

- user goal,
- allowed scopes,
- allowed actions,
- forbidden actions,
- risk limits,
- max duration,
- max action count,
- observation cadence,
- visible-content acknowledgement.

Output:

- session id,
- session license packet,
- initial audit event,
- policy result,
- residue.

Required behavior:

- reject missing user confirmation,
- reject missing visible-content acknowledgement,
- reject sessions without scope,
- initialize session state and audit log only after policy allows.

Annotations:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_observe

Goal: capture bounded visual state for the active session.

Input:

- session id,
- target scope,
- max frames,
- duration,
- frame format,
- optional include-image policy.

Output:

- observation packet,
- window metadata when available,
- cursor position when available,
- frame metadata,
- optional image content or resource links,
- audit event,
- residue.

Required behavior:

- require active session,
- enforce bounded duration and frame count,
- bind `active_window` to concrete observed identity before mutation can use it,
- no OCR or localization in the first version,
- no background capture after tool return.

Annotations:

- `readOnlyHint: true`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_move_mouse

Goal: perform a movement probe inside session scope.

Input:

- session id,
- pre-action observation id,
- target scope,
- rough target point or vector,
- intended semantic target when known.

Output:

- action packet,
- policy result,
- audit event,
- residue,
- `requiresPostActionObservation: true`.

Required behavior:

- require active session,
- require fresh pre-action observation,
- validate observation session id, scope, freshness, and frame evidence,
- validate action scope,
- log before execution,
- require post-movement observation before the next non-observe action.

Annotations:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_click

Goal: click a visible control inside licensed scope after current visual evidence.

Input:

- session id,
- pre-action observation id,
- target scope,
- point,
- button,
- intended semantic target,
- recoverability assessment.

Output:

- action packet,
- policy result,
- audit event,
- residue,
- `requiresPostActionObservation: true`.

Required behavior:

- require active session,
- require fresh pre-action observation,
- validate observation session id, scope, freshness, and frame evidence,
- block or escalate high-risk or low-recoverability actions,
- require post-action observation before success can be claimed.

Annotations:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_type_text

Goal: type generated test input inside licensed scope.

Input:

- session id,
- pre-action observation id,
- target scope,
- text or text reference,
- intended semantic target,
- sensitivity classification.

Output:

- action packet,
- policy result,
- audit event,
- residue,
- `requiresPostActionObservation: true`.

Required behavior:

- require session permission for typing,
- block credential-like or sensitive text,
- require fresh pre-action observation,
- require post-action observation before success can be claimed.

Annotations:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_end_interaction_session

Goal: stop the session and make its final state auditable.

Input:

- session id,
- reason.

Output:

- final session state,
- final audit event,
- summary counts,
- residue.

Required behavior:

- prevent further non-audit actions for the session,
- preserve audit log for configured retention,
- report stop reason.

### desktop_session_audit_log

Goal: inspect the session trace.

Input:

- session id,
- optional cursor or event filter.

Output:

- audit events,
- action and observation ids,
- stop/escalation events,
- residue.

Implementation option:

- expose as a read-only tool first,
- later add `desktop-session-audit://{sessionId}` resources when resource support is useful.

## Resources Versus Tool Results

Use tool results for immediate control flow and compact metadata. Use resources or resource links for larger artifacts:

- frame images,
- frame sequences,
- audit logs,
- long residue reports.

The first implementation can return inline image content for small mock observations. Real observation should prefer metadata plus resource links when frame payloads get large.

## State Model

Minimum runtime state:

- active sessions by session id,
- session license packet,
- observation packets by observation id,
- action packets by action id,
- interaction transition gates by action id,
- audit events by session id,
- stop condition state,
- provider capabilities.

Initial runtime can be in-memory. Persistent audit storage is a later feature.

Transition gate state is required for action tools. It is the runtime mechanism that prevents blind action chains such as `move_mouse -> click` without an intervening observation and transition audit.

## Provider Interface

Define a provider seam before real OS control:

```ts
interface DesktopInteractionProvider {
  getCapabilities(): DesktopProviderCapabilities;
  observe(request: ObserveRequest): Promise<ObservationProviderResult>;
  moveMouse(request: MoveMouseRequest): Promise<ActionProviderResult>;
  click(request: ClickRequest): Promise<ActionProviderResult>;
  typeText(request: TypeTextRequest): Promise<ActionProviderResult>;
}
```

Provider rules:

- mock provider never mutates OS state,
- real observe provider may capture bounded visible frames only,
- real control provider is disabled by default,
- every provider result is converted into session packets and audit events,
- providers never bypass policy evaluators.

## Stop And Escalation Conditions

Stop or escalate when:

- session confirmation is absent,
- visible-content acknowledgement is absent,
- session is expired,
- max action count is reached,
- max repair attempts are reached,
- action target is outside allowed scope,
- observation is missing, stale, wrong-session, wrong-scope, or has no frame evidence,
- credential, payment, external publishing, system-change, or destructive risk appears,
- `active_window` identity cannot be bound before mutation,
- post-action state cannot be interpreted,
- provider reports permission denied or capture unavailable.

## Feature Slices

### ADMCP-007 Session Runtime And Audit Store

Goal: add in-memory session state for licenses, observations, actions, audit events, and stop state.

Depends on:

- existing `sessionLicensePolicy.ts`.

Expected files:

- `src/session/sessionStore.ts`
- `tests/sessionStore.test.ts`

Acceptance criteria:

- create, read, end, and reject inactive sessions,
- append audit events immutably,
- look up observations and actions by id,
- enforce action-count and repair-count bookkeeping,
- no MCP wiring yet.

### ADMCP-008 Session MCP Tool Registration

Goal: expose start, end, and audit-log tools without OS observation or mutation.

Depends on:

- ADMCP-007.

Expected files:

- `src/server.ts`
- `src/session/sessionTools.ts`
- `tests/protocol/sessionTools.test.ts`

Acceptance criteria:

- `tools/list` exposes session tools,
- start session requires user confirmation and visible-content acknowledgement,
- audit log records session start and end,
- no mouse, click, type, or real observe tool yet.

### ADMCP-009 Mock Observation Provider

Goal: add `desktop_observe` using a deterministic mock provider.

Status: implemented.

Depends on:

- ADMCP-007,
- ADMCP-008.

Expected files:

- `src/providers/desktopProvider.ts`
- `src/providers/mockDesktopProvider.ts`
- `src/session/observationTools.ts`
- `tests/mockDesktopProvider.test.ts`
- protocol tests for `desktop_observe`.

Acceptance criteria:

- observe requires active session,
- observation is bounded by max frames and duration,
- observation packet includes session id, scope, timestamp, frame metadata, and residue,
- audit event records observation,
- optional image content uses MCP image blocks or resource links,
- no OCR, localization, or OS capture.

Implemented notes:

- The first provider is `MockDesktopProvider`; it never captures real desktop pixels.
- `desktop_observe` validates active session state, `observe` permission, and target scope before provider calls.
- `active_window` observations are bound to mock window identity when provider metadata is available.
- Output may include inline MCP image blocks only when `includeImages` is set.

### ADMCP-010 Mock Movement Probe Tool

Goal: add `desktop_move_mouse` in mock/provider-backed mode.

Status: implemented.

Depends on:

- ADMCP-009.

Expected files:

- `src/session/actionTools.ts`
- tests for movement preflight/completion.

Acceptance criteria:

- move requires active session,
- move requires fresh pre-action observation,
- move validates session id, scope, freshness, and frame evidence,
- move logs action request before provider call,
- move creates an interaction transition gate in `pending_observation` state,
- move returns `requiresPostActionObservation: true`,
- subsequent non-observe action is blocked until post-movement observation is attached to the transition gate,
- post-movement observation can close or escalate the transition based on scope, frame evidence, and residue,
- mock provider does not move the real cursor.

Implemented notes:

- `desktop_move_mouse` is registered as a mock-only action tool.
- The mock provider simulates cursor position in memory and does not move the real OS cursor.
- Allowed movement records an action packet, increments action count, and creates a transition gate.
- The transition gate blocks later non-observe actions until `desktop_observe` is called with `transitionActionId`.
- Post-movement observation audits the transition gate using session id, scope, and frame evidence.
- ADMCP-011 registers mock click and type tools using the same transition-gate discipline.

### ADMCP-011 Mock Click And Type Tools

Goal: add `desktop_click` and `desktop_type_text` in mock/provider-backed mode.

Status: implemented.

Depends on:

- ADMCP-010.

Expected files:

- `src/session/actionTools.ts`
- tests for click/type contracts.

Acceptance criteria:

- click/type require active session and fresh pre-action observation,
- credential-like text is blocked,
- external/destructive/system risks block or escalate,
- click/type require post-action observation before success,
- mock provider does not click or type in the real OS.

Implemented notes:

- `desktop_click` and `desktop_type_text` are registered as mock-only action tools.
- The mock provider simulates click and typing results in memory and does not click or type in the real OS.
- Allowed click/type actions record action packets, increment action count, and create transition gates.
- A prior unaudited transition gate blocks click/type before provider calls.
- `desktop_type_text` records text length only; text content is not stored in action packets or audit events.
- Credential-like, secret-like, or private text is blocked before provider calls.

### ADMCP-012 Real Observation Provider Spike

Goal: evaluate a bounded real frame observation backend without enabling mutation.

Status: implemented.

Depends on:

- ADMCP-009.

Expected files:

- provider-specific module,
- manual acceptance checklist,
- docs update.

Acceptance criteria:

- active-window observation is bounded and explicit,
- active-window identity can be bound,
- permission-denied failure is controlled,
- visible-content warning is preserved,
- no hidden polling loop,
- no mouse or keyboard control.

Implemented notes:

- Adds an opt-in Windows active-window observation provider selected only by `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true`.
- Default server behavior remains mock-only.
- Real observation uses `desktop_observe`; no new real control tools are registered.
- Provider validates active-window scope before capture for `window_title`, `process_name`, and bound `active_window` requests.
- Provider returns controlled errors for unsupported platform, permission/capture failures, and scope mismatch.
- Real observation frames are bounded by `maxFrames`, `durationMs`, and provider caps.
- Manual acceptance checklist lives in `../testing/manual_real_observation_checklist.md`.

### ADMCP-013 Real Control Provider Gate

Goal: prepare, but not automatically enable, real movement/click/type provider support.

Depends on:

- ADMCP-010,
- ADMCP-011,
- ADMCP-012.

Acceptance criteria:

- real control capability is disabled by default,
- enabling requires explicit configuration,
- manual acceptance tests exist,
- provider enforces scope, observation freshness, post-action observation, and audit logging,
- stop conditions are tested before any real mutation release.

## Test Matrix

Unit tests:

- session store state transitions,
- audit event append and retrieval,
- session start policy,
- action preflight policy,
- post-action completion policy,
- observation freshness and scope validation,
- stop conditions.

Protocol tests:

- tool registration,
- input schema validation,
- structured output shape,
- controlled errors,
- image/resource content shape for observation.

Provider tests:

- mock provider returns deterministic frames,
- mock provider does not mutate OS state,
- provider permission failures become residue and stop conditions,
- real provider tests stay manual until stable.

Manual tests:

- only for real observation/control providers,
- must include visible target, expected result, rollback/cleanup, and stop conditions.

## Next Recommended Implementation

After ADMCP-012, continue with ADMCP-013.

That keeps the implementation aligned with the core design: session license first, session lifecycle tools second, mock observation third, actions fourth, real OS control last.
