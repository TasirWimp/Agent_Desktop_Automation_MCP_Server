# Licensed Desktop Interaction Feature Design

## Purpose

Turn the licensed desktop interaction architecture into implementable feature slices.

This document is not a new safety model. The source of truth for the session concept is `../architecture/licensed_desktop_interaction_sessions.md`. This design document extracts concrete tools, provider seams, state objects, tests, and delivery order from that architecture.

## Design Target

The target product behavior is bounded UI-based development and testing agency:

observe -> infer -> act -> observe delta -> repair -> continue.

Codex should be able to launch or use a project app inside a user-granted session, interact with the UI like a user, observe the result, and repair the implementation or test scenario. The server must not collapse into a screenshot utility and must not expose raw desktop control without a session license.

## Licensed App-Under-Test Model

Future real click and typing capability should be governed primarily by app scope. The user declares a specific app, window, process, workspace, or local URL as the reversible app-under-test. The user is responsible for ensuring that app/test fixture cannot cause permanent damage outside the MCP server. The server is then responsible for binding that declaration to observed provider identity and enforcing that every agent-triggered interaction stays inside it.

The governance target is:

```text
The user declares the app-under-test safe and reversible.
The server binds the session to that app.
Codex may act inside the bound app license.
Every action is audited and followed by observation.
Leaving scope stops or escalates.
```

Click-candidate evidence remains useful, but its role changes: it is a targeting-quality and repair signal inside the licensed app, not the main gate for whether clicking is globally safe.

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
- `desktop_evaluate_click_candidate`
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
- licensed app-under-test scope when real click or typing may be requested,
- user declaration that the app-under-test is reversible and safe for the requested UI testing task,
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
- reject click/type session permissions unless a reversible app-under-test scope is declared,
- reject app scopes without forbidden-boundary declarations,
- reject app-scoped action grants outside the session's allowed actions,
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
- validate bound app-under-test scope before real provider execution,
- validate action scope,
- log before execution,
- require post-movement observation before the next non-observe action.

Annotations:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

### desktop_evaluate_click_candidate

Goal: evaluate whether the current observed cursor/target state is ready for a future app-scoped click request.

Input:

- session id,
- observation id,
- target scope,
- intended semantic target,
- candidate point or candidate bounding box,
- optional movement action id for the audited movement-transition witness,
- recoverability/risk assessment.

Output:

- click-candidate witness packet,
- readiness status,
- audit event,
- provider click capability summary,
- residue,
- `wouldExecuteClick: false`,
- `realClickExecutionAvailable: false`,
- `requiresPostClickObservation: true`.

Required behavior:

- require active session,
- require a recorded observation from the same session,
- require `click` to be allowed by the session before a candidate can be ready,
- validate observation freshness, target scope, and frame evidence,
- validate cursor evidence and cursor/candidate proximity,
- if a movement action id is supplied, require the transition gate to be audited and to match the follow-up observation,
- preserve hover uncertainty instead of inventing hover success,
- block candidate readiness for credential, destructive, external-effect, system-change, or low-recoverability risk,
- append a `click_candidate_evaluated` audit event,
- never move the cursor, click, type, capture new frames, or mutate OS state.

Design boundary:

- This is a targeting-quality and repair gate, not the main safety boundary for future real clicking.
- Future real click tools must still require declared reversible app-under-test scope, bound app identity, provider click gate, audit logging, and post-click observation.

Annotations:

- `readOnlyHint: true`
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
- require declared reversible app-under-test scope for real clicks,
- require bound observed app identity before provider execution,
- require fresh pre-action observation,
- validate observation session id, scope, freshness, and frame evidence,
- validate that the click target is inside the bound app-under-test scope,
- use targeting-quality evidence to reduce wrong-target clicks inside the licensed app,
- block or escalate scope exits, system dialogs, credential/payment/private prompts, external publishing, or other forbidden boundaries,
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
- require declared reversible app-under-test scope for real typing,
- require bound observed app identity before provider execution,
- validate that typing target is inside the bound app-under-test scope,
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
- licensed app-under-test declaration,
- bound app/window/process/local URL identity when available,
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
  dispose?(): void;
}
```

Provider rules:

- mock provider never mutates OS state,
- real observe provider may capture bounded visible frames only,
- real helper processes are provider implementation details and must be cleaned up through provider disposal,
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

### ADMCP-013 Real Mouse Movement Provider Gate

Goal: enable one non-durable real control probe, mouse movement, without enabling click/type or durable desktop mutation.

Depends on:

- ADMCP-010,
- ADMCP-011,
- ADMCP-012.

Acceptance criteria:

- real mouse movement is disabled by default,
- enabling requires explicit configuration in addition to real observation,
- movement requires active session scope, fresh pre-action observation, audit logging, and post-movement observation,
- movement points are interpreted in active-window frame coordinates and rejected if outside the active-window capture frame,
- click/type remain disabled by the real provider,
- durable desktop mutation capability remains disabled,
- manual acceptance tests exist,
- provider enforces active-window scope before movement,
- provider returns cursor position in active-window frame coordinates,
- stop conditions are tested before any real click/type release.

Implemented notes:

- `WindowsDesktopObservationProvider` now supports opt-in real mouse movement only when constructed with `enableRealMouseMovement: true`.
- `createDefaultDesktopProvider` enables that gate only when `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` is set alongside the real-observation provider configuration.
- `desktop_move_mouse` uses the existing session policy, action audit, and transition-gate path; no raw mouse tool is exposed.
- The provider converts active-window frame coordinates to screen coordinates internally and rejects out-of-frame targets before moving.
- `desktop_click` and `desktop_type_text` remain unsupported by the real Windows provider.
- `realDesktopMutation` remains false; the new capability is reported separately as `realDesktopMouseMovement`.

### ADMCP-013A Governed Manual Probe Runner

Goal: make governed real-observation and pointer-movement path-finding experiments repeatable before adding richer cursor/hover witness packets.

Status: implemented.

Design reason:

- The first manual path-finding try showed that the governed loop is viable, but ad hoc harnessing is too fragile.
- The runner should exercise the same tool path a model or client would use: session start, observation, movement, post-movement observation, optional blocked click check, and audit review.
- It should not introduce new control authority. It is a repeatability and evidence-capture aid.

Runner contract:

- Inputs: session goal, allowed scope, intended semantic target, area-of-interest point or envelope, movement fractions or strategy, max attempts, observation cadence, and whether to verify click blocking.
- Outputs: per-attempt pre/post observation ids, cursor positions, planned movement vector, provider result, transition-gate status, screenshot path or frame hash, visible witness notes, blocked-click result when requested, and residue.
- Safety: no raw OS input, no bypass of MCP/session policy, no real click, no typing, no shell/app-launch behavior beyond the local runner process itself.

Acceptance criteria:

- Can reproduce a three-attempt relative cursor-to-area probe against the active Windows provider.
- Records stale-observation policy blocks as a timing finding instead of silently widening the cadence.
- Records wrong-target hover evidence, such as a sidebar hover, as useful negative witness residue.
- Records final target hover evidence as a witness, but does not claim that it licenses real click.
- Verifies `desktop_click` remains blocked by provider capability when requested.

Implemented notes:

- The reusable runner lives in `src/manual/governedManualProbeRunner.ts`.
- The CLI wrapper lives in `src/manual/governedManualProbeCli.ts`.
- `npm run manual:probe:example` prints a sample JSON config.
- `npm run manual:probe -- <path>` runs a bounded probe from a config file.
- The runner uses the existing in-process MCP server and client transport; it does not call provider methods directly except through registered tools.
- The runner requires explicit `userConfirmed`, `visibleContentAcknowledged`, and `allowRealMouseMovement` gates before a real mouse provider can be used.
- Tests use a fake Windows backend, so CI verifies the governed path without moving the real cursor.

### First Governed Path-Finding Lessons

The first real movement experiment against the Codex app produced these design constraints:

- `observe -> move_mouse -> observe` is operationally viable with the Windows provider and transition-gate audit path.
- Relative movement from observed cursor position toward an area of interest is more useful than one-shot coordinate guessing.
- Wrong-target hover evidence is valuable. It can diagnose that the cursor intersected a different UI element and guide the next move.
- A final hover highlight on the intended target is a cursor-target intersection witness, not a click license.
- The real click block behaved correctly: provider capability prevented a click before any provider click call.
- The current transition gate verifies follow-up frame evidence and scope, but does not yet verify that the movement accomplished the intended probe.
- The default five-second observation freshness window can be too tight for the current PowerShell real-capture path; future implementation should either reduce provider latency or make real-provider cadence defaults explicit.
- A stable test app will produce cleaner hover and delta evidence than the Codex app itself, because the conversation surface changes while the experiment is being observed.

### ADMCP-014 Cursor And Hover Witness Refinement

Goal: turn movement follow-up observations into explicit witness packets that support iterative pointer probing without licensing a real click.

Status: implemented.

Depends on:

- ADMCP-010,
- ADMCP-012,
- ADMCP-013.

Design intent:

- Movement is useful only when the next observation can explain what changed.
- The provider should not merely say "cursor moved"; the runtime should preserve enough evidence for the next model step to decide whether to move again, wait, repair, or later request a click candidate.
- This slice is still observation and witness refinement. It must not implement real click, real typing, OCR, accessibility-tree interpretation, or autonomous semantic localization.

New or refined packets:

- `cursorWitness`: cursor position, cursor visibility, coordinate space, provider source, timestamp, confidence, whether the cursor was rendered into any returned frame, rendering method, and residue.
- `movementDeltaWitness`: intended point, provider result point, follow-up observed point, distance from intended point, scope stability, and residue.
- `hoverWitness`: optional evidence fields for hover highlight, tooltip, cursor shape, enabled state, or visual delta; absent evidence must be represented as uncertainty, not guessed.

Cursor rendering rule:

- Windows `CopyFromScreen` may omit the mouse pointer because the cursor can be a separate desktop overlay.
- ADMCP-014 should add provider-rendered cursor overlays when the provider can read cursor visibility, cursor position, cursor handle, and hotspot.
- The implementation should use Win32 cursor APIs such as `GetCursorInfo`, `GetIconInfo`, and `DrawIconEx` or an equivalent provider-specific path.
- Rendered cursor coordinates must be active-window-relative: `cursorScreenPosition - activeWindowTopLeft - cursorHotspot`.
- Cursor-annotated frames may add a small high-contrast witness marker around the cursor hotspot when the native cursor shape is too subtle to be a reliable visual witness.
- Frames must explicitly state whether they are raw or cursor-annotated. Cursor rendering must not be silent.
- If cursor rendering fails, is outside the captured frame, or cannot prove visibility, the observation should preserve cursor metadata and add residue rather than claiming cursor-overlay evidence.

Acceptance criteria:

- `desktop_observe` returns cursor witness metadata when the provider supplies cursor position.
- Cursor witness metadata includes visibility, coordinate space, rendered-into-frame status, rendering method, and residue.
- The Windows provider can render the visible cursor into returned frame images when cursor evidence is available and in bounds.
- Raw versus cursor-annotated frame semantics are explicit in frame metadata.
- A post-movement `desktop_observe` with `transitionActionId` records a movement delta witness on the interaction transition gate.
- The transition gate can say whether cursor position was observed, whether the active window stayed in scope, and what residue remains before another action.
- Missing cursor or hover evidence does not fail observation, but it prevents claiming interaction readiness.
- The real Windows provider still supports only observation and optional mouse movement.
- `desktop_click` and `desktop_type_text` remain unsupported by the real provider.
- Tests cover witness shape, missing-witness residue, movement delta audit output, and continued click blocking.

Delivered implementation:

- Observations can include `cursorWitness` and `hoverWitness` packets.
- Frame artifacts include witness metadata that marks each frame as `raw` or `cursor_annotated`.
- The Windows active-window provider renders the visible cursor into captured PNG frames with `GetCursorInfo`, `GetIconInfo`, and `DrawIconEx` when the cursor is visible and inside the captured active-window frame.
- The Windows provider also renders a high-contrast cursor witness marker around the cursor hotspot, with metadata distinguishing native cursor rendering from marker rendering.
- Cursor rendering failure, hidden cursor state, outside-frame cursor position, or cursor API failure is reported as residue; successful frame capture does not fail only because cursor evidence is unavailable.
- Post-movement transition audits produce `movementDeltaWitness` with intended point, provider result point, follow-up observed point, distance from intended point, scope stability, confidence, and residue.
- `hoverWitness` is present as an unevaluated low-confidence packet; ADMCP-014 does not infer hover readiness, semantic localization, or click readiness.

Expected files:

- `src/providers/desktopProvider.ts`
- `src/session/observationTools.ts`
- `src/session/interactionTransitionGate.ts`
- `src/uiPlanning/closedLoopUiTypes.ts`
- protocol tests for `desktop_observe` and `desktop_move_mouse`
- provider tests for Windows cursor witness behavior

Exit criteria:

- The system can run `observe -> move_mouse -> observe transitionActionId` and produce a structured explanation of cursor movement and residual uncertainty.
- The system still cannot execute a real click.
- Later app-scoped click work can consume ADMCP-014 witness packets as targeting-quality evidence after licensed app scope and scope binding exist.

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

ADMCP-018 implemented the licensed app-under-test scope model. ADMCP-019 implemented runtime binding of that declared scope to concrete observed provider identity through `desktop_observe`, including `boundAppScope` session state and `scope_exit` stop/audit evidence on drift. ADMCP-020 implemented the explicit app-scoped Windows real-click provider gate without adding a raw click primitive or weakening the binding requirement. ADMCP-021 implemented app-scoped generated test-input typing behind its own provider gate, preserving text-content non-persistence, credential-like input blocking, bound app scope, and post-type observation. ADMCP-022 implemented post-action observation classification and bounded repair accounting on interaction transition gates.

ADMCP-022 keeps the loop session-first instead of adding a new runner:

- `desktop_observe` with `transitionActionId` classifies the follow-up as `expected_delta`, `no_op`, `wrong_target`, `scope_exit`, `risk_prompt`, `uninterpretable_state`, or `repair_needed`.
- The transition gate keeps the action id, source observation id, follow-up observation id when recorded, expected evidence, observed delta summary, classification, repair count, and residue.
- Expected deltas reset consecutive repair attempts.
- No-op, wrong-target, and repair-needed classifications allow bounded in-scope repair until the session repair limit is reached.
- Scope exit, forbidden-boundary/risk prompts, uninterpretable state, and repair-limit exhaustion stop or escalate.
- This does not add OCR, semantic localization, a UI test runner, shell/app launch authority, or any new desktop mutation gate.

Recommended sequence:

1. ADMCP-023 Governed UI Test Cycle Runner For Local Apps.

Click-candidate witness evidence should be consumed by app-scoped click work as targeting-quality evidence. It should help avoid wrong-target clicks and guide repair, but it should not be the main governance boundary. The main governance boundary is whether the action remains inside the user-declared reversible app-under-test.

ADMCP-023 should be implemented as a governed multi-cycle UI test carrier, not as a generic UI automation runner. The runner's purpose is to preserve orientation and residue across real app test cycles:

```text
test pressure
  -> active cut
    -> observe bound app
      -> licensed probe/action
        -> observe transition
          -> classify delta
            -> carry residue
              -> continue / repair / ask / partial landfall / close
```

For Phaser/Vite applications, the runner must assume that the useful witness may be visual/canvas-based and that DOM or accessibility evidence may not be enough. A test case can require multiple cycles because game state, canvas rendering, animation timing, hover effects, disabled controls, and wrong-target deltas can all produce plausible but incomplete pressure reduction. The runner should therefore preserve a cycle carrier rather than merely execute a list of actions.

ADMCP-023 implementation guardrails:

- Use existing MCP tools only; do not add new desktop authority.
- Keep app/dev-server launch outside this server unless a later workspace-runner contract is documented.
- Require a scenario contract with user goal, session-license confirmation fields, app-under-test scope, allowed probes, allowed actions, max cycle/action/time limits, forbidden boundaries, protected outcome, allowed evidence, evidence strength, and closure policy.
- Require one cycle packet per runner cycle with current pressure, cycle kind, active cut, observations, probe/action data, transition classification when applicable, residue, next re-entry pressure, and cycle decision.
- Separate `observation_only`, `probe_action`, and `state_changing_action` cycles. Observation-only cycles may not have an action id; state-changing cycles must have before observation, action id, after observation through `transitionActionId`, and transition classification.
- Maintain a run-level test-state carrier with protected outcome status, cycle ids, action ids, candidate targets, residue classes, and closure status.
- Treat `expected_delta` as evidence to evaluate against the protected test goal, not as automatic test success.
- Treat `no_op`, `wrong_target`, and `repair_needed` as bounded repair paths with residue carried forward.
- Treat `scope_exit`, `risk_prompt`, `uninterpretable_state`, and repair-limit exhaustion as stop/escalation conditions.
- Require a final landfall/re-entry packet before claiming test closure.
- Preserve enough artifact data for a later Codex agent to re-enter without hidden session memory.

The runner owns these local artifacts:

- scenario contract,
- cycle packet,
- test-state carrier,
- closure gate,
- compact artifact writer,
- final landfall/re-entry packet.

The MCP session tools remain the only action surface. ADMCP-023 must not add raw desktop-control primitives, hidden polling, OCR as a dependency, semantic localization as a prerequisite, shell execution, app launch, deployment, external publishing, or cross-app authority.

Scenario contract:

```yaml
ui_test_scenario_contract:
  scenario_id:
  test_goal:
  session_license:
    user_confirmed: true
    visible_content_acknowledged: true
    reversible_app_under_test_declared: true
  app_under_test:
    scope:
      kind: active_window | process_name | window_title | local_url | local_origin
      value:
    reversible: true
    forbidden_boundaries:
      - credential_or_secret_prompt
      - payment_or_purchase
      - external_message_or_email
      - external_publish_or_deploy
      - destructive_operation
      - system_settings
      - unrelated_private_window
      - scope_exit
      - low_recoverability
      - uninterpretable_state
  allowed_probes:
    - observe
    - evaluate_click_candidate
  allowed_actions:
    - move_mouse
    - click
    - type_text
  max_cycles:
  max_actions:
  max_duration_ms:
  observation_cadence:
    max_observation_gap_ms:
  protected_test_outcome:
    - "declared scenario observable"
  allowed_evidence:
    - frame_hash_delta
    - screenshot_reference
    - cursor_position
    - transition_classification
    - provider_delta_summary
    - audit_log_event
    - human_supplied_expected_visual_cue
  evidence_strength:
    frame_hash_delta: weak_by_default
    screenshot_reference: witness_only
    cursor_position: targeting_or_probe_evidence
    transition_classification: transition_evidence
    provider_delta_summary: provider_transition_evidence
    audit_log_event: trace_evidence
    human_supplied_expected_visual_cue: scenario_authority
  closure_policy:
    passed_allowed_if:
      - protected_outcome_satisfied
      - no_target_relevant_residue
      - scope_remained_bound
      - no_pending_transition_gate
      - artifact_replayable
    partial_landfall_allowed_if:
      - protected_outcome_residualized
      - residue_visible
      - no_same_license_probe_can_reduce_remaining_residue
      - scope_remained_bound
      - no_pending_transition_gate
      - artifact_replayable
    close_blocked_if:
      - protected_outcome_only_residualized_but_status_marked_passed
      - frame_hash_delta_used_as_visual_success_without_scenario_authority
```

Evidence-strength rule:

- `frame_hash_delta` is weak by default and can only say that some pixels changed.
- A frame hash or screenshot reference cannot satisfy a protected visual outcome by itself unless the scenario contract explicitly declares that exact hash, visual region, or cue sufficient.
- For Phaser/Vite canvas tests, the runner should classify declared visual/test evidence against protected outcomes; it must not infer arbitrary semantic canvas state.

The runner should make this packet mandatory:

```yaml
ui_test_cycle:
  cycle_id:
  cycle_kind: observation_only | probe_action | state_changing_action
  test_goal:
  active_cut:
  current_pressure:
  licensed_probe_or_action:
    type: observe | evaluate_click_candidate | move_mouse | click | type_text
    semantic_target:
    target_scope:
  before_observation:
    observation_id:
    frame_hashes:
    active_window:
    cursor:
  action: # required for state_changing_action, omitted for observation_only
    action_id:
    result:
  after_observation: # required for state_changing_action through transitionActionId
    observation_id:
    frame_hashes:
    active_window:
  transition_classification: # required after state-changing actions
    kind:
    evidence:
    residue:
  carrier_update:
    satisfied_observables:
    newly_visible:
    forgotten_or_compressed:
    remaining_residue:
  next_reentry_pressure:
  cycle_decision:
```

The run-level carrier prevents hidden drift between cycles:

```yaml
ui_test_carrier:
  scenario_id:
  session_id:
  bound_app_scope:
  test_goal:
  current_model:
    active_screen_or_state: unknown
    known_controls:
    candidate_targets:
    protected_outcome_status:
      - observable:
        status: yes | no | unresolved
        evidence:
  cycle_ids:
  transition_action_ids:
  residue:
    unresolved_visual_state:
    ambiguous_targeting:
    timing_or_animation_uncertainty:
    missing_expected_evidence:
    repair_limit_pressure:
    domain_authority_needed:
  closure_status:
    status: open | partial_landfall | passed | failed | ask_required | stopped
    reason:
    replayable_from_artifact: true | false
```

Closure gate:

```yaml
closure_gate:
  passed_allowed_if:
    - session_scope_still_bound
    - no_pending_transition_gate
    - protected_test_outcome_satisfied
    - no_target_relevant_residue
    - repair_budget_not_silently_exhausted
    - final_artifact_replayable
  partial_landfall_allowed_if:
    - session_scope_still_bound
    - no_pending_transition_gate
    - protected_test_outcome_residualized
    - residue_visible
    - no_same_license_probe_can_reduce_remaining_residue
    - repair_budget_not_silently_exhausted
    - final_artifact_replayable
  close_blocked_if:
    - pending_transition_requires_observation
    - scope_exit
    - risk_prompt
    - uninterpretable_state
    - repair_limit_exhausted_without_final_residue_status
    - expected_delta_occurred_but_protected_goal_not_checked
    - no_op_or_wrong_target_relabelled_as_success
    - protected_outcome_only_residualized_but_status_marked_passed
    - frame_hash_delta_used_as_visual_success_without_scenario_authority
```

The runner should also end every scenario with:

```yaml
ui_test_landfall:
  test_goal:
  declared_scope:
  protected_observables:
  satisfied_observables:
  unsatisfied_residue:
  cycle_history:
  audit_event_count:
  stop_conditions:
  closure_status:
  closure_allowed:
  reentry_notes:
```

This blocks the default UI-runner failure mode where a sequence of actions is executed, a visible change lowers pressure, and the agent prematurely treats that as a passed test.

Recommended ADMCP-023 split:

- ADMCP-023A Scenario Contract And Artifact Schemas: validate scenario, cycle, carrier, closure, and landfall schemas without executing desktop actions.
- ADMCP-023B Mock Cycle Runner: run the loop against deterministic mock/provider fixtures and verify carrier updates, residue carry-forward, closure gates, and replayable artifacts.
- ADMCP-023C Local App Manual Runner: use real observation/click/type only behind existing gates against a user-launched reversible app-under-test.
- ADMCP-023D Phaser/Vite Fixture Pressure Test: pressure-test pass, no-op, wrong-target, delayed-transition, and scope-exit cases in a deliberately small local fixture.

Implementation readiness:

- ADMCP-023 planning is ready.
- ADMCP-023A is ready after these schema constraints are preserved in code.
- ADMCP-023B, ADMCP-023C, and ADMCP-023D remain later slices.
- The next code change should implement ADMCP-023A only: scenario contract schema, cycle packet schema, carrier schema, closure gate schema, landfall packet schema, and schema tests. It must execute no desktop actions and must not add runner orchestration.
