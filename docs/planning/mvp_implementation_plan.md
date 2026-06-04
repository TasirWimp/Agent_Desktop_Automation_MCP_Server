# MVP Implementation Plan

## Current Status

Phase 0 foundation is established: repository scaffold, Codex subagents, GitHub Actions CI, MCP stdio entrypoint, initial policy tests, read-only UI intersection planning, session-license policy contracts, in-memory session runtime/audit store, MCP session lifecycle tools, mock provider-backed observation, mock action probes with transition gates, a click-candidate witness gate, a licensed app scope model, runtime app-scope binding and scope-exit auditing, an opt-in Windows real-observation spike, an opt-in Windows real mouse-movement probe, an opt-in app-scoped Windows real-click gate, an opt-in app-scoped Windows generated-text typing gate, governed manual/navigation probe runners, Windows provider performance instrumentation, and a persistent Windows observation helper.

## Planning Document Roles

- This file tracks implementation sequence, current status, and acceptance gates.
- `licensed_desktop_interaction_feature_design.md` extracts detailed tool contracts, provider seams, runtime state, and feature slices from the licensed-session architecture.
- `../architecture/licensed_desktop_interaction_sessions.md` remains the source of truth for the session safety and agency model.

## Feature Slices

### ADMCP-001 Repository And MCP Server Scaffold

Goal: Create the TypeScript MCP server foundation with npm scripts, CI, Codex subagents, docs, and a working stdio entrypoint.

Expected files:

- `package.json`
- `tsconfig.json`
- `.github/workflows/ci.yml`
- `.codex/agents/*.toml`
- `src/index.ts`
- `src/server.ts`
- `README.md`
- `AGENTS.md`
- `docs/`

Verification:

- `npm run typecheck`
- `npm run test`
- `npm run build`

### ADMCP-002 Policy Classification Tool

Goal: Classify proposed automation actions before any execution tool is added.

Expected files:

- `src/policy/automationPolicy.ts`
- `src/server.ts`
- `tests/automationPolicy.test.ts`
- `docs/architecture/safety_model.md`

Verification:

- Policy unit tests cover allow, requires-confirmation, and block decisions.
- Build passes.

### ADMCP-003 Protocol Smoke Tests

Goal: Add tests or fixture checks that prove the MCP server can expose and call the registered tools.

Expected files:

- `tests/protocol/`
- possible MCP test helper utilities

### ADMCP-004 First Read-Only Desktop Context Tool

Goal: Add one narrow observation or planning tool with no desktop mutation.

Candidate: active-window metadata, environment context, or closed-loop UI intersection planning packets, depending on available stable inputs.

Requirements before implementation:

- tool contract documented,
- no credential or hidden input capture,
- audit output defined,
- tests planned.

Current pilot:

- `ui_intersection_plan` is a read-only planning tool.
- It accepts semantic localization, cursor observation, and intersection signal packets.
- It returns a policy-gated click candidate packet, location residue, and a policy reminder.
- It does not capture frames, move the cursor, click, or execute desktop actions.

### ADMCP-005 Licensed Desktop Interaction Session Policy

Goal: Evolve from single-action confirmation to task-scoped licensed desktop interaction sessions.

Requirements before implementation:

- session license schema,
- observation packet schema,
- action packet schema,
- audit event schema,
- stop condition schema,
- policy evaluator for session start,
- policy evaluator for in-session action preflight and completion,
- deterministic unit tests for scope, risk, audit, and post-action observation.

Current policy slice:

- User confirmation is required to start a bounded session.
- Low-risk actions inside the allowed session scope do not require repeated per-action confirmation.
- Mouse movement is modeled as a probe that requires post-movement observation before the next non-observe action.
- Clicks and typing require active session scope, audit logging, low-risk classification, recoverability, and post-action observation before success can be claimed.
- State-changing actions require a fresh pre-action observation reference.
- The policy evaluator validates observation existence, freshness, session id, scope, and frame evidence when observation packets are supplied.
- Credential entry, system changes, and destructive operations remain blocked.
- No real OS mutation backend, real clicking, real typing, OCR, accessibility-tree interpretation, or autonomous background loop is implemented.

### ADMCP-006 Provider-Backed Desktop Interaction Tools

Goal: Track the transition from session policy contracts to provider-backed MCP tools for the protected loop.

Design source:

- `licensed_desktop_interaction_feature_design.md`

Status:

- Not started.
- The detailed tool contracts and provider seam are defined in the design source.
- Real OS observation and control remain disabled until later gated slices.

Requirements before implementation:

- implement the extracted slices in order,
- keep mock/provider-backed behavior separate from real OS control,
- add protocol smoke tests as tools are registered,
- preserve session scope, audit, observation cadence, and stop-condition behavior.

Extracted implementation slices:

- ADMCP-007 Session Runtime And Audit Store - implemented.
- ADMCP-008 Session MCP Tool Registration - implemented.
- ADMCP-009 Mock Observation Provider - implemented.
- ADMCP-010 Mock Movement Probe Tool - implemented.
- ADMCP-011 Mock Click And Type Tools - implemented.
- ADMCP-012 Real Observation Provider Spike - implemented.
- ADMCP-013 Real Mouse Movement Provider Gate - implemented.
- ADMCP-013A Governed Manual Probe Runner - implemented.
- ADMCP-013B Governed Navigation Probe Runner - implemented.
- ADMCP-014 Cursor And Hover Witness Refinement - implemented.
- ADMCP-015 Windows Provider Performance Instrumentation - implemented.
- ADMCP-016 Persistent Windows Observation Helper - implemented.
- ADMCP-017 Click-Candidate Witness Gate - implemented.
- ADMCP-018 Licensed App Scope Model - implemented.
- ADMCP-019 Scope Binding Runtime - implemented.
- ADMCP-020 App-Scoped Real Click Gate - implemented.
- ADMCP-021 App-Scoped Type Text Gate - implemented.
- ADMCP-022 Post-Action Observation And Repair Loop - implemented.
- ADMCP-023 Governed UI Test Cycle Runner For Local Apps - planned.

Acceptance gate before app-scoped real click, typing, or durable OS mutation:

- active session state is enforced,
- audit log is complete and queryable,
- observation references are validated against provider state,
- the user can declare a specific app/window/process/local URL as the safe reversible app-under-test,
- the declared app-under-test is bound to concrete observed identity before real click or typing,
- every real action is checked against that bound app scope before provider execution,
- leaving the allowed app/window/process/local URL scope stops or escalates the session,
- post-action observation is enforced for movement, click, and typing,
- cursor and hover witnesses are represented explicitly after real movement probes,
- targeting-quality witnesses are available to reduce wrong-target clicks inside the licensed app,
- stop/escalation conditions are covered by tests,
- manual acceptance checks are documented for the target backend.

### ADMCP-007 Session Runtime And Audit Store

Goal: Add in-memory session state for licenses, observations, actions, audit events, counters, and stop state.

Status:

- Implemented.

Delivered behavior:

- Creates active sessions only after session-start policy allows.
- Rejects duplicate, missing, inactive, and policy-rejected sessions.
- Keeps audit events readable and returns defensive copies.
- Records and looks up observations and actions by id.
- Tracks action count and repair-attempt count against session risk limits.
- Records stop conditions.
- Builds action-policy context snapshots from stored audit events, observations, and counters.
- Ends sessions and rejects further mutation while keeping the audit log readable.

Implemented files:

- `src/session/sessionStore.ts`
- `tests/sessionStore.test.ts`

Verification:

- `npm run test -- tests/sessionStore.test.ts`
- `npm run check`

Residual scope:

- MCP session lifecycle tools are registered by ADMCP-008.
- No provider, observation capture, mouse movement, click, typing, OCR, accessibility, shell, or real OS backend behavior is implemented.
- Re-entry instructions are available for current session lifecycle tools.

### ADMCP-008 Session MCP Tool Registration

Goal: Expose start, end, and audit-log tools without OS observation or mutation.

Status:

- Implemented.

Delivered behavior:

- Registers `desktop_start_interaction_session`.
- Registers `desktop_end_interaction_session`.
- Registers `desktop_session_audit_log`.
- Lists session tools through MCP `tools/list`.
- Starts only confirmed sessions with visible-content acknowledgement.
- Writes `session_started` and `session_stopped` audit events.
- Keeps audit logs readable after session end.
- Reports controlled tool errors without creating rejected sessions.
- Mock click and type support is registered by ADMCP-011.

Implemented files:

- `src/session/sessionTools.ts`
- `src/server.ts`
- `tests/protocol/sessionTools.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/protocol/sessionTools.test.ts`
- `npm run check`

Residual scope:

- Mock provider-backed observation is registered by ADMCP-009.
- Mock movement probe support is registered by ADMCP-010.
- No real mouse movement, real click, real typing, OCR, accessibility, shell, real observation capture, or real OS mutation backend behavior is implemented.
- Current re-entry instructions cover session lifecycle, mock observation, mock action probes, transition-gate observation, and audit inspection.

### ADMCP-009 Mock Observation Provider

Goal: Add `desktop_observe` using a deterministic mock provider.

Status:

- Implemented.

Delivered behavior:

- Defines a `DesktopInteractionProvider` seam for observation and future action providers.
- Adds `MockDesktopProvider` with deterministic bounded frame metadata.
- Registers `desktop_observe` as an active-session observation tool.
- Requires the session license to allow `observe`.
- Validates observation target scope against the session license before provider calls.
- Records observation packets in session state.
- Writes `observation_recorded` audit events.
- Supports `frame_session` and `single_frame` modes.
- Supports optional MCP image content blocks with mock inline PNG data.
- Binds provisional `active_window` observations to mock active-window identity for future policy checks.
- Keeps real desktop capture, OCR, localization, real mouse movement, real clicking, real typing, and background polling disabled.

Implemented files:

- `src/providers/desktopProvider.ts`
- `src/providers/mockDesktopProvider.ts`
- `src/session/observationTools.ts`
- `src/server.ts`
- `tests/mockDesktopProvider.test.ts`
- `tests/protocol/desktopObserveTool.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/mockDesktopProvider.test.ts tests/protocol/desktopObserveTool.test.ts`

Residual scope:

- Provider output is mock evidence only and must not be treated as real screen capture.
- Mock click and type support is registered by ADMCP-011.
- Real observation is implemented by ADMCP-012 as an opt-in spike.
- ADMCP-010 provides the mock movement probe used by later action slices.

### ADMCP-010 Mock Movement Probe Tool

Goal: Add `desktop_move_mouse` in mock/provider-backed mode.

Status:

- Implemented.

Delivered behavior:

- Registers `desktop_move_mouse`.
- Requires an active session.
- Requires `move_mouse` to be allowed by the session license.
- Requires a fresh pre-action observation id with matching session, scope, and frame evidence.
- Logs `action_requested` before policy evaluation and provider calls.
- Uses the session action policy evaluator before provider calls.
- Simulates mouse movement in `MockDesktopProvider` memory only.
- Records action packets and increments action count for allowed movement probes.
- Creates an interaction transition gate in `pending_observation` state after each movement probe.
- Blocks subsequent non-observe actions while a transition gate remains unaudited.
- Extends `desktop_observe` with `transitionActionId` so post-movement observation can audit and close the transition gate.
- Keeps real cursor movement, real clicking, real typing, OS capture, OCR, localization, shell, and OS mutation disabled.

Implemented files:

- `src/session/actionTools.ts`
- `src/session/interactionTransitionGate.ts`
- `src/session/sessionStore.ts`
- `src/providers/desktopProvider.ts`
- `src/providers/mockDesktopProvider.ts`
- `src/session/observationTools.ts`
- `src/server.ts`
- `tests/protocol/desktopMoveMouseTool.test.ts`
- `tests/mockDesktopProvider.test.ts`
- `tests/sessionStore.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/sessionStore.test.ts tests/mockDesktopProvider.test.ts tests/protocol/desktopMoveMouseTool.test.ts tests/protocol/desktopObserveTool.test.ts tests/protocol/sessionTools.test.ts`

Residual scope:

- Movement is simulated provider state only and must not be treated as real cursor movement.
- Mock click and type support is registered by ADMCP-011.
- Transition-gate audit is currently frame/scope based; richer visual-delta interpretation remains a future provider/model layer.
- ADMCP-011 completes the mock action-tool surface.

### ADMCP-011 Mock Click And Type Tools

Goal: Add `desktop_click` and `desktop_type_text` in mock/provider-backed mode.

Status:

- Implemented.

Delivered behavior:

- Registers `desktop_click`.
- Registers `desktop_type_text`.
- Requires an active session.
- Requires click/type actions to be allowed by the session license.
- Requires fresh pre-action observation ids with matching session, scope, and frame evidence.
- Blocks blind action chains while any prior transition gate remains unaudited.
- Uses the session action policy evaluator before provider calls.
- Simulates clicking and typing in `MockDesktopProvider` memory only.
- Records click/type action packets and increments action count for allowed actions.
- Creates an interaction transition gate in `pending_observation` state after each click/type action.
- Requires `desktop_observe` with `transitionActionId` before another non-observe action may continue.
- Blocks credential-like, secret-like, or private typing before provider calls.
- Records only text length for typing; text content is not stored in action packets or audit events.
- Escalates low-recoverability click/type requests before provider calls.
- Keeps real cursor movement, real clicking, real typing, OS capture, OCR, localization, shell, and OS mutation disabled.

Implemented files:

- `src/session/actionTools.ts`
- `src/providers/desktopProvider.ts`
- `src/providers/mockDesktopProvider.ts`
- `src/server.ts`
- `tests/protocol/desktopClickTypeTools.test.ts`
- `tests/mockDesktopProvider.test.ts`
- `tests/protocol/sessionTools.test.ts`
- `tests/protocol/desktopObserveTool.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/mockDesktopProvider.test.ts tests/protocol/desktopClickTypeTools.test.ts tests/protocol/desktopMoveMouseTool.test.ts tests/protocol/desktopObserveTool.test.ts tests/protocol/sessionTools.test.ts`

Residual scope:

- Click and typing are simulated provider state only and must not be treated as real desktop input.
- Transition-gate audit is currently frame/scope based; richer visual-delta interpretation remains a future provider/model layer.
- Real observation is implemented by ADMCP-012 as an opt-in spike.
- Real click, typing, and durable desktop mutation remain deferred to later provider gates.

### ADMCP-012 Real Observation Provider Spike

Goal: Evaluate a bounded real frame observation backend without enabling mutation.

Status:

- Implemented.

Delivered behavior:

- Adds `WindowsDesktopObservationProvider`.
- Adds `createDefaultDesktopProvider`.
- Keeps the default provider mock-only.
- Enables Windows real observation only when both `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true` are set.
- Captures bounded visible active-window PNG frames through `desktop_observe`.
- Validates active-window metadata against `window_title`, `process_name`, or bound `active_window` target scope before capture.
- Binds `active_window` observations to concrete `windowId` metadata when available.
- Reports controlled provider errors for unsupported platform, permission/capture failures, and scope mismatch.
- Exposes dynamic provider capabilities through `desktop_capabilities`.
- Keeps real mouse movement disabled unless the later ADMCP-013 movement gate is explicitly enabled; real clicking, real typing, OCR, localization, hidden polling, background capture, app launching, shell tools, and durable OS mutation remain disabled.
- Adds a manual acceptance checklist for the real-observation spike.

Implemented files:

- `src/providers/windowsDesktopObservationProvider.ts`
- `src/providers/defaultDesktopProvider.ts`
- `src/providers/desktopProvider.ts`
- `src/policy/sessionLicensePolicy.ts`
- `src/session/observationTools.ts`
- `src/server.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `tests/defaultDesktopProvider.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `docs/testing/manual_real_observation_checklist.md`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/defaultDesktopProvider.test.ts tests/windowsDesktopObservationProvider.test.ts tests/protocol/windowsDesktopObserveTool.test.ts tests/protocol/desktopObserveTool.test.ts`

Residual scope:

- Real observation is Windows active-window only.
- Real observation is opt-in and disabled by default.
- Real observation manual acceptance is documented but not automated.
- Real clicking, typing, shell, app launching, and durable OS mutation remain disabled.
- ADMCP-013 implements the first opt-in non-durable real pointer probe.

### ADMCP-013 Real Mouse Movement Provider Gate

Goal: Enable bounded real mouse movement as a non-durable probe without enabling real click, typing, shell, app launch, or persistent desktop mutation.

Status:

- Implemented.

Delivered behavior:

- Keeps default provider mock-only.
- Enables real Windows mouse movement only when `ADMCP_DESKTOP_PROVIDER=windows-active-window`, `ADMCP_ENABLE_REAL_OBSERVATION=true`, and `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` are set.
- Reports `realDesktopMouseMovement` separately from `realDesktopMutation`.
- Keeps `realDesktopMutation`, real clicking, real typing, shell, app launch, system changes, OCR, localization, hidden polling, and background capture disabled.
- Reports cursor position in active-window frame coordinates during real observation.
- Interprets `desktop_move_mouse.point` as active-window frame coordinates for the Windows real provider.
- Converts active-window frame coordinates to screen coordinates internally.
- Rejects out-of-frame movement targets before moving the cursor.
- Uses existing active session, pre-action observation freshness, scope validation, audit logging, action count, and transition-gate enforcement.
- Requires post-movement observation before any next non-observe action.
- Keeps `desktop_click` and `desktop_type_text` unsupported by the real Windows provider.
- Updates the manual checklist to cover observation-only and optional pointer-movement gates.

Implemented files:

- `src/providers/windowsDesktopObservationProvider.ts`
- `src/providers/defaultDesktopProvider.ts`
- `src/providers/desktopProvider.ts`
- `src/session/actionTools.ts`
- `src/server.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `tests/defaultDesktopProvider.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `docs/testing/manual_real_observation_checklist.md`
- `docs/process/codex_desktop_interaction_reentry.md`

Verification:

- `npm run test -- tests/defaultDesktopProvider.test.ts tests/windowsDesktopObservationProvider.test.ts tests/protocol/windowsDesktopObserveTool.test.ts tests/protocol/desktopMoveMouseTool.test.ts`
- `npm run check`

Residual scope:

- Real mouse movement is Windows active-window only and disabled by default.
- Cursor visibility and hover/cursor-shape deltas are not yet interpreted automatically.
- Real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, and durable desktop mutation remain disabled.
- Next implementation should improve cursor/hover witness packets before enabling any real click backend.

### ADMCP-013A Governed Manual Probe Runner

Goal: Make real observation and pointer-movement experiments repeatable before adding richer witness logic.

Status:

- Implemented.

Reason:

- The first governed path-finding try proved that `observe -> move_mouse -> observe` works, but manual harnessing was clunky and error-prone.
- A reusable runner should reduce one-off script mistakes, preserve audit output, and make timing, scope, and witness gaps easier to compare across attempts.

Required behavior:

- Run bounded manual probe scenarios through the existing MCP tools or server runtime; do not bypass policy, scope checks, provider gates, transition gates, or audit logging.
- Accept a session goal, target scope, intended semantic target, movement strategy, max attempts, and observation cadence.
- Use observed cursor position as the movement starting point.
- Support relative movement planning from cursor position toward an area of interest.
- Save compact run artifacts: pre/post observation ids, cursor points, planned vectors, transition-gate status, screenshot paths or frame hashes, click-block result when requested, and residue.
- Keep real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, and durable desktop mutation disabled.

Delivered behavior:

- Adds a reusable governed manual probe runner module.
- Adds `npm run manual:probe`.
- Requires `userConfirmed: true` and `visibleContentAcknowledged: true` in runner config.
- Requires `allowRealMouseMovement: true` before using a real provider that reports mouse support.
- Runs through the existing MCP session tools and provider-backed `desktop_observe`, `desktop_move_mouse`, `desktop_click`, and audit-log tools.
- Supports bounded relative movement from observed cursor position toward an area of interest.
- Saves compact per-attempt summaries, frame hashes, optional screenshot artifacts, cursor positions, planned vectors, transition-gate status, manual witness notes, click-block results, and residue.
- Preserves stale-observation policy blocks instead of hiding them.
- Skips click verification if a provider reports click support; when the current Windows provider reports no click support, the runner verifies `desktop_click` blocking without a real click.
- Keeps real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, and durable desktop mutation disabled.

Expected files:

- `src/manual/governedManualProbeRunner.ts`
- `src/manual/governedManualProbeCli.ts`
- `tests/governedManualProbeRunner.test.ts`
- `package.json`
- `docs/testing/manual_real_observation_checklist.md`
- `docs/process/codex_desktop_interaction_reentry.md`

Acceptance criteria:

- Runner can execute a bounded three-attempt `observe -> move_mouse -> observe` scenario against the active Windows provider.
- Runner records when policy blocks movement because an observation is stale.
- Runner records hover or wrong-target visual evidence as residue, without claiming click readiness.
- Runner can attempt `desktop_click` only to verify provider blocking; no real click occurs.
- Runner output is concise enough to paste into implementation notes or test reports.

Residual scope:

- The runner is for governed manual experiments, not autonomous desktop control.
- The runner should not add new MCP behavior or replace protocol tests.
- ADMCP-014 remains responsible for first-class cursor and hover witness packets.

Verification:

- `npm run test -- tests/governedManualProbeRunner.test.ts`
- `npm run check`

### ADMCP-013B Governed Navigation Probe Runner

Goal: Reduce manual UI-navigation pressure-test time without adding new desktop authority.

Status:

- Implemented.

Reason:

- The first real hover-reveal pressure tests proved that `observe -> move_mouse -> observe` can discover hidden targets, but full runs were too slow for iteration.
- The existing manual probe runner is useful for repeated independent attempts, but compact navigation paths should carry the last post-movement observation forward instead of recording a redundant pre-observation for the next step.
- Real-provider timings must be visible before investing in lower-level provider optimization such as a persistent Windows helper.

Delivered behavior:

- Adds a governed navigation probe runner module.
- Adds `npm run manual:navigation-probe`.
- Uses one active session for the full navigation path.
- Records one initial observation, then runs each configured movement step against the latest observation.
- Calls `desktop_observe` with `transitionActionId` after every movement step.
- Carries each post-movement observation forward as the next step's pre-action witness.
- Records per-tool timing diagnostics for capabilities, session start, observations, movement probes, audit-log read, and session end.
- Saves compact frame hashes and optional screenshot artifacts for before/after review.
- Requires `userConfirmed: true`, `visibleContentAcknowledged: true`, and `allowRealMouseMovement: true` before using a real provider that reports mouse support.
- Keeps real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, and durable desktop mutation disabled.

Implemented files:

- `src/manual/governedNavigationProbeRunner.ts`
- `src/manual/governedNavigationProbeCli.ts`
- `tests/governedNavigationProbeRunner.test.ts`
- `package.json`
- `README.md`
- `docs/process/codex_desktop_interaction_reentry.md`
- `docs/testing/manual_real_observation_checklist.md`
- `docs/testing/test_strategy.md`

Acceptance criteria:

- A two-step hover path uses three observations: initial, first post-move, second post-move.
- The runner preserves session policy, transition gates, and audit output by using the existing MCP tools.
- The runner records per-tool timing diagnostics.
- The runner refuses real mouse movement unless the config explicitly allows it.
- The runner does not add click, typing, shell, app launch, system change, or durable desktop mutation authority.

Verification:

- `npm run test -- tests/governedNavigationProbeRunner.test.ts`
- `npm run check`

Residual scope:

- This is a manual pressure-test harness, not autonomous navigation.
- The runner does not interpret screenshots, OCR labels, classify hover highlights, or decide click readiness.
- Provider observations may still be slow until a later slice adds a persistent Windows capture helper or more efficient region capture.

### ADMCP-014 Cursor And Hover Witness Refinement

Goal: Make the post-movement observation evidence explicit enough for iterative pointer probing without enabling real click or typing.

Status:

- Implemented.

Depends on:

- ADMCP-010 Mock Movement Probe Tool.
- ADMCP-012 Real Observation Provider Spike.
- ADMCP-013 Real Mouse Movement Provider Gate.

Required behavior:

- Preserve the current session, scope, audit, and transition-gate discipline.
- Keep real click, real typing, shell, app launch, system changes, OCR, accessibility interpretation, and durable desktop mutation disabled.
- Represent cursor witness metadata explicitly in observations when available, including coordinate space, provider source, confidence or residue, and active-window-relative position.
- Render the visible Windows cursor into captured frames when the provider can prove cursor visibility and position, add a small high-contrast cursor witness marker around the cursor hotspot for visual salience, and mark the frame as cursor-annotated rather than raw.
- Preserve raw-versus-annotated frame semantics in metadata so downstream policy can distinguish provider-rendered cursor evidence from unmodified pixels.
- Record post-movement transition deltas that compare intended target point, provider-reported cursor point, and follow-up observed cursor point.
- Record whether the active window identity and scope stayed stable after movement.
- Add hover/cursor-shape/visual-change witness fields as optional residue-bearing evidence, not as a click license.
- Keep `desktop_click` blocked by the real provider until a later slice adds a separate click candidate witness and real click gate.

Expected files:

- `src/providers/desktopProvider.ts`
- `src/session/observationTools.ts`
- `src/session/interactionTransitionGate.ts`
- `src/uiPlanning/closedLoopUiTypes.ts`
- `tests/protocol/desktopObserveTool.test.ts`
- `tests/protocol/desktopMoveMouseTool.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`
- `docs/testing/manual_real_observation_checklist.md`

Acceptance criteria:

- `desktop_observe` returns structured cursor witness metadata when the provider supplies cursor position.
- Cursor witness metadata includes cursor visibility, coordinate space, whether the cursor was rendered into the frame, rendering method, and residue.
- When the cursor is visible and inside the active-window frame, the Windows provider can produce a frame with the cursor rendered into the bitmap.
- When cursor rendering is unavailable, outside-frame, or uncertain, the observation still succeeds with explicit residue and does not claim cursor-overlay evidence.
- Post-movement observation with `transitionActionId` records a transition delta packet with intended point, observed point, distance residue, and scope-stability evidence.
- Missing cursor data does not fail observation, but it produces explicit uncertainty residue and prevents claiming hover/intersection readiness.
- Movement outside the scoped active-window frame remains blocked before provider movement.
- A pending movement transition still blocks all next non-observe actions until follow-up observation is audited.
- Real click and typing remain unsupported by the Windows provider.
- Tests cover cursor witness presence, missing cursor witness residue, transition delta recording, scope stability, and continued real click blocking.

Implemented behavior:

- `DesktopObservationPacket` now carries optional `cursorWitness` and `hoverWitness` fields.
- Frame artifacts now carry witness metadata that distinguishes `raw` frames from `cursor_annotated` frames.
- The mock provider reports deterministic cursor witness metadata and raw mock frame semantics.
- The Windows provider uses `GetCursorInfo`, `GetIconInfo`, and `DrawIconEx` to render the visible cursor into captured active-window PNG frames when available and in bounds.
- Cursor-annotated Windows frames also include a high-contrast witness marker so thin cursor shapes such as I-beams remain visible in screenshots.
- Cursor API failure no longer fails observation after frame capture; it returns explicit cursor-witness residue instead.
- Movement transition gates now record `movementDeltaWitness` with intended point, provider-reported cursor point, follow-up observed cursor point, distance, scope stability, and residue.
- Hover, tooltip, cursor-shape, enabled-state, and visual-delta evidence remain unevaluated and residue-bearing only.

Verification:

- `npm run test -- tests/windowsDesktopObservationProvider.test.ts tests/protocol/windowsDesktopObserveTool.test.ts tests/protocol/desktopMoveMouseTool.test.ts tests/protocol/desktopObserveTool.test.ts`
- `npm run check`

Residual scope:

- ADMCP-014 should not decide that a click is ready.
- ADMCP-014 should not add OCR, accessibility-tree parsing, semantic localization, or real click execution.
- Later slices must first define licensed app-under-test scope and runtime scope binding; click-candidate evidence then becomes targeting-quality input for app-scoped click work.

### ADMCP-015 Windows Provider Performance Instrumentation

Goal: Measure real-observation latency at the provider boundary before changing the Windows backend architecture.

Status:

- Implemented.

Reason:

- Real pressure-test runs are dominated by observation latency, but the current timing surface is mostly at the runner/MCP-call level.
- Before building a persistent helper, the repo needs provider-level timings that distinguish active-window metadata lookup, frame capture, cursor overlay, image encoding, JSON/base64 transfer, MCP serialization, artifact writing, and policy/session overhead.
- Performance work must not weaken the current safety posture or introduce new desktop authority.

Required behavior:

- Preserve all existing session, scope, freshness, transition-gate, and audit requirements.
- Keep real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, hidden polling, background capture, and durable desktop mutation disabled.
- Add timing diagnostics to the Windows provider observation path for:
  - active-window metadata lookup,
  - screen capture,
  - cursor metadata lookup,
  - native cursor rendering,
  - high-contrast witness marker rendering,
  - PNG encoding,
  - base64 payload construction,
  - provider total duration.
- Surface timing diagnostics as residue-bearing metadata in observation output without requiring consumers to trust the timing as policy evidence.
- Keep the timing packet compact enough for manual runner summaries.
- Update the governed navigation probe runner to include provider timing diagnostics when available.

Delivered behavior:

- Adds optional `providerTiming` diagnostics to desktop observation packets.
- Adds optional `providerTiming` diagnostics to provider action results.
- Leaves mock and future providers absence-tolerant; timing packets are optional.
- Records Windows provider observation timings for active-window metadata lookup, capture call duration, PowerShell capture substages when available, frame-byte decoding, frame artifact construction, fallback cursor-position lookup, and total provider duration.
- Records Windows provider movement timings for pre-move active-window metadata lookup, cursor-position setting, post-move active-window metadata lookup, and total provider duration.
- Extends the PowerShell active-window capture script with substage timings for active-window metadata lookup, bitmap/graphics setup, screen capture, cursor metadata lookup, cursor icon lookup, native cursor rendering, high-contrast witness marker rendering, cursor overlay total, PNG encoding, and base64 payload construction.
- Propagates provider timing diagnostics through `desktop_observe` into recorded session observations.
- Includes observation provider timing diagnostics in governed navigation probe summaries.
- Keeps timing diagnostics residue-bearing and explicitly diagnostic only; they do not affect policy decisions.
- Adds no new real click, typing, shell, app launch, system change, hidden polling, background capture, or durable desktop mutation authority.

Expected files:

- `src/policy/sessionLicensePolicy.ts`
- `src/providers/desktopProvider.ts`
- `src/providers/windowsDesktopObservationProvider.ts`
- `src/session/observationTools.ts`
- `src/manual/governedNavigationProbeRunner.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `tests/governedNavigationProbeRunner.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`
- `docs/testing/manual_real_observation_checklist.md`

Acceptance criteria:

- Real Windows observations include provider timing diagnostics when the provider can measure them.
- Timing diagnostics are optional and absence-tolerant for mock and future providers.
- Tests cover timing packets with fake Windows backends.
- Manual navigation probe output makes slow steps visible without needing ad hoc debug scripts.
- No new real desktop action capability is added.

Verification:

- `npm run test -- tests/windowsDesktopObservationProvider.test.ts tests/protocol/windowsDesktopObserveTool.test.ts tests/governedNavigationProbeRunner.test.ts`
- `npm run check`

Residual scope:

- This slice measures latency; it does not optimize the backend yet.
- Timing values are diagnostic evidence only and must not affect action policy decisions.
- Persistent helper work remains deferred to ADMCP-016.

### ADMCP-016 Persistent Windows Observation Helper

Goal: Reduce real-observation latency by replacing per-capture PowerShell startup and repeated Win32 setup with a bounded persistent helper.

Status:

- Implemented.

Depends on:

- ADMCP-015 Windows Provider Performance Instrumentation.

Reason:

- The current Windows provider starts PowerShell and loads Win32 interop code for each provider call.
- If ADMCP-015 confirms startup/setup dominates capture time, a persistent helper can keep Win32 setup warm while preserving the same MCP/session policy boundary.
- The helper must be an implementation detail behind the provider seam, not a broad desktop-control channel.

Required behavior:

- Preserve the existing `DesktopInteractionProvider` contract and MCP tool contracts.
- Keep the helper scoped to active-window observation and optional real mouse movement only when the existing movement gate is enabled.
- Keep real click, typing, shell, app launch, system changes, OCR, accessibility interpretation, hidden polling, background capture, and durable desktop mutation disabled.
- Start the helper only on demand for bounded provider calls.
- Stop or recycle the helper on provider shutdown, failure, timeout, scope mismatch, or explicit cleanup.
- Enforce per-request timeouts and bounded payload sizes.
- Return controlled provider errors when the helper is unavailable, unhealthy, or returns malformed output.
- Keep active-window scope validation before capture and before movement.
- Preserve cursor witness metadata, cursor-annotated frame semantics, movement delta witnesses, and audit behavior.

Delivered behavior:

- Adds a persistent PowerShell helper backend behind the existing Windows provider seam.
- Makes the persistent helper the default real Windows provider backend, with an explicit per-call PowerShell fallback for diagnostics.
- Keeps the helper on demand and bounded by MCP tool calls; it does not add background capture, hidden polling, or raw desktop-control authority.
- Keeps the existing real movement gate: the helper can move the mouse only when the provider is constructed with the opt-in real-movement flag.
- Preserves active-window scope validation before observation capture and before opt-in movement.
- Keeps click, typing, shell, app launch, system settings, OCR, accessibility interpretation, and durable desktop mutation disabled.
- Adds a JSON-line helper protocol with per-request timeout handling, controlled provider errors, malformed-output handling, and helper cleanup.
- Adds an optional provider `dispose()` hook and uses it from manual probe runners so helper processes are cleaned up after governed runs.
- Preserves provider timing diagnostics so warm-helper latency is visible in `desktop_observe`, movement results, and navigation probe output.

Expected files:

- `src/providers/desktopProvider.ts`
- `src/providers/windowsDesktopObservationProvider.ts`
- `src/manual/governedManualProbeRunner.ts`
- `src/manual/governedNavigationProbeRunner.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `tests/defaultDesktopProvider.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `tests/governedNavigationProbeRunner.test.ts`
- `docs/process/codex_desktop_interaction_reentry.md`
- `docs/testing/manual_real_observation_checklist.md`
- `docs/testing/test_strategy.md`

Acceptance criteria:

- The default provider remains mock-only.
- Real Windows observation remains opt-in through the existing environment gates.
- Real mouse movement remains separately opt-in through the existing movement gate.
- The helper reduces repeated-observation latency in manual navigation probe timing output.
- Helper failure does not leave background capture or a hidden control loop running.
- Tests cover helper success, helper startup failure, helper timeout, malformed helper output, shutdown, and fallback/error behavior.
- No new real click, typing, shell, app launch, system change, or durable desktop mutation capability is added.

Verification:

- `npm run test -- tests/windowsDesktopObservationProvider.test.ts tests/defaultDesktopProvider.test.ts tests/protocol/windowsDesktopObserveTool.test.ts`
- `npm run check`
- Manual live smoke: two `desktop_observe` calls through a real Windows provider-backed MCP session, with `includeImages: false` and no movement.

Residual scope:

- This slice optimizes observation plumbing only.
- Cold helper startup can still be noisy; the warmed-helper path is the optimization target for multi-step governed navigation.
- Region capture, downscaled witness images, OCR, accessibility witnesses, semantic localization, click-candidate witnesses, and real click gates remain separate future work.

### ADMCP-017 Click-Candidate Witness Gate

Goal: Add a session-aware, non-executing gate that evaluates whether the current observation and cursor evidence are strong enough to request a future app-scoped click.

Status:

- Implemented.

Design reason:

- Movement is a probe. After `observe -> move_mouse -> observe transitionActionId`, the runtime needs a structured way to say whether the current cursor/target/scope evidence is ready for a future click request.
- Click-candidate evidence is targeting-quality evidence, not the main governance boundary. The future main boundary remains the user-declared reversible app-under-test.
- The gate must never execute a click or make real clicking available.

Delivered behavior:

- Registers `desktop_evaluate_click_candidate`.
- Requires an active session and a recorded observation.
- Requires `click` to be allowed by the session before a candidate can be ready.
- Checks observation freshness, target-scope match, frame evidence, cursor witness, candidate point or bounding-box center, and low-risk packet.
- Optionally consumes an audited movement transition gate and requires it to match the supplied follow-up observation.
- Marks stale, out-of-scope, unbound active-window, high-risk, unaudited-movement, or weak cursor/target evidence as not ready.
- Appends a `click_candidate_evaluated` audit event.
- Returns `wouldExecuteClick: false`, `realClickExecutionAvailable: false`, and `requiresPostClickObservation: true`.

Implemented files:

- `src/session/clickCandidateWitnessTools.ts`
- `src/server.ts`
- `src/policy/sessionLicensePolicy.ts`
- `tests/protocol/desktopClickCandidateWitnessTool.test.ts`

Verification:

- `npm run typecheck`
- `npm run test -- tests/protocol/desktopClickCandidateWitnessTool.test.ts`

Residual scope:

- This slice does not implement real clicking.
- It does not perform OCR, semantic localization, hover interpretation, or app-scope binding.
- Later real click work must consume this as targeting-quality evidence inside the licensed app-under-test model.

### ADMCP-018 Licensed App Scope Model

Goal: Re-center future real interaction around a user-declared app-under-test that the user has made safe and reversible for UI development/testing.

Status:

- Implemented.

Reason:

- The main governance boundary for UI testing should be app scope, not per-action moral safety checks.
- The user can declare a local app, window, process, or local URL as safe to interact with because permanent damage has been prevented outside the MCP server.
- The server's job is to enforce that agent-triggered interactions stay inside that declared app license.

Required behavior:

- Add a licensed app scope model to the session license, with fields such as `licensedAppScope`, `userDeclaredReversible`, `allowedActions`, `forbiddenBoundaries`, and `scopeExitStopConditions`.
- Represent scope kinds for observed window identity, process name, window title, workspace path, and future local URL/domain binding.
- Treat the current click-candidate witness concept as targeting-quality evidence inside the licensed app, not as the primary safety gate.
- Keep real click and real typing disabled in this slice.

Delivered behavior:

- `desktopInteractionSessionLicense` now accepts optional `licensedAppScope`.
- `licensedAppScope` carries app description, scope, user reversibility declaration, app-scoped allowed actions, forbidden boundaries, and scope-exit stop conditions.
- Scope kinds now include `observed_window_identity`, `local_url`, and `local_origin` in addition to existing window/process/workspace scopes.
- Session start policy rejects `click` or `type_text` permissions unless a reversible app-under-test scope is declared.
- Session start policy rejects missing reversibility declarations, missing forbidden-boundary declarations, app scopes outside session scopes, app-scope action grants outside session permissions, and app-scope action grants forbidden by the session.
- Action policy scopes `click` and `type_text` to the declared app-under-test even if the broader session allowed scopes include other targets.
- The start-session MCP tool accepts and returns the app scope object.
- Governed manual probe blocked-click verification declares a reversible app scope before granting `click`.

Expected files:

- `src/policy/sessionLicensePolicy.ts`
- `src/session/sessionStore.ts`
- `tests/sessionLicensePolicy.test.ts`
- `tests/protocol/sessionTools.test.ts`
- `docs/architecture/licensed_desktop_interaction_sessions.md`
- `docs/architecture/safety_model.md`
- `docs/testing/test_strategy.md`

Acceptance criteria:

- A session can express "this app is safe and reversible for this task."
- Real action permissions can be scoped to the declared app-under-test.
- Session start validation rejects real click/type permissions unless a reversible app scope is declared.
- Tests cover missing app scope, missing user reversibility declaration, and forbidden boundary declarations.

Verification:

- `npm run typecheck`
- `npm run test`

Residual scope:

- This slice models and validates app-under-test license declarations only.
- It does not bind the declared app scope to a concrete observed provider identity.
- It does not enable real clicking or real typing.

### ADMCP-019 Scope Binding Runtime

Goal: Bind the declared app-under-test scope to concrete observed provider identity and enforce that binding before every real action.

Status:

- Implemented.

Depends on:

- ADMCP-018 Licensed App Scope Model.

Required behavior:

- Convert provisional `active_window` scope into a bound observed identity before real click or typing is possible.
- Store bound window/process/title/local URL evidence in session runtime.
- Validate that each observation and action target still matches the bound app scope.
- Stop or escalate when the active target leaves the licensed app, an unrelated window appears, or scope cannot be re-established.
- Keep real click and real typing disabled in this slice.

Delivered behavior:

- Adds `DesktopAppScopeBinding` runtime state to session snapshots.
- Adds `src/session/appScopeBinding.ts` to create and validate app-under-test bindings from recorded observations.
- `desktop_observe` binds `licensedAppScope` on the first matching observation and refreshes the binding on later matching observations.
- `active_window` app scopes bind to concrete observed window identity when provider metadata supplies one.
- Real-provider `window_title` and `process_name` app scopes require the observed active window metadata to match before binding.
- Observation drift from the bound app returns `status: "scope_exit"`, appends an `outside_allowed_scope` stop condition, appends an `escalation_required` audit event, and does not record or return the out-of-scope frame as a session observation.
- Session action policy blocks app-scoped `click` and `type_text` when the app scope is unbound, stale, or mismatched with the referenced pre-action observation.
- Session summaries expose `boundAppScope`.
- Real click and real typing remain disabled.

Implemented files:

- `src/session/appScopeBinding.ts`
- `src/session/sessionStore.ts`
- `src/session/sessionTools.ts`
- `src/session/observationTools.ts`
- `src/policy/sessionLicensePolicy.ts`
- `tests/sessionStore.test.ts`
- `tests/sessionLicensePolicy.test.ts`
- `tests/protocol/desktopObserveTool.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`

Acceptance criteria:

- Tests cover successful binding, stale binding, window-title/process mismatch, active-window focus drift, and scope-exit stop conditions.
- The provider cannot execute real actions against an unbound or mismatched app scope.

Verification:

- `npm run typecheck`
- `npm run test`
- `npm run build`

Residual scope:

- Local URL/origin binding is schema-ready but still needs a provider that can supply browser/app URL identity.
- Real typing is implemented by ADMCP-021 through a separate app-scoped provider gate.
- Scope binding is a runtime guard and audit source; it does not perform semantic localization, OCR, accessibility inspection, or repair-loop classification.

### ADMCP-020 App-Scoped Real Click Gate

Goal: Enable opt-in real clicking only inside the bound app-under-test scope.

Status:

- Implemented.

Depends on:

- ADMCP-018 Licensed App Scope Model.
- ADMCP-019 Scope Binding Runtime.

Required behavior:

- Add a separate environment/provider gate for real click support.
- Require active session, user-declared reversible app scope, bound app identity, fresh pre-action observation, in-scope target point, allowed `click`, and audit logging.
- Use click-candidate/targeting-quality witnesses to reduce wrong-target clicks, but do not require broad semantic certainty when the action is inside the licensed reversible app.
- Require post-click observation before any next non-observe action and before success can be claimed.
- Block or escalate clicks that leave scope, hit system dialogs, target credentials/payments/private prompts, or cross forbidden boundaries.

Delivered behavior:

- Adds `ADMCP_ENABLE_REAL_CLICK=true` as a separate Windows provider gate.
- Keeps the default provider mock-only and keeps Windows real clicking disabled unless real observation and the click gate are both enabled.
- Reports `supportsClick`, `realDesktopClick`, `realDesktopMutation`, and `executeDesktopActions` only when the click gate is active.
- Implements Windows real click through the existing `desktop_click` tool path; no raw click tool is added.
- Requires the existing session policy checks before provider execution: active session, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, matching app scope, in-frame target point, low-risk action packet, audit logging, and no pending transition gate.
- Converts active-window-frame click points to screen coordinates inside the provider.
- Checks active-window scope before clicking and records post-click active-window scope residue for follow-up observation.
- Records real click action packets and transition gates through the same runtime path as mock clicks.
- Requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Keeps real typing, shell, app launch, system changes, external publishing, hidden polling, background capture, OCR, accessibility interpretation, and broad desktop control unavailable.

Implemented files:

- `src/providers/desktopProvider.ts`
- `src/providers/defaultDesktopProvider.ts`
- `src/providers/windowsDesktopObservationProvider.ts`
- `src/server.ts`
- `src/session/actionTools.ts`
- `tests/defaultDesktopProvider.test.ts`
- `tests/windowsDesktopObservationProvider.test.ts`
- `tests/protocol/windowsDesktopObserveTool.test.ts`
- `README.md`
- `docs/architecture/safety_model.md`
- `docs/architecture/licensed_desktop_interaction_sessions.md`
- `docs/process/codex_desktop_interaction_reentry.md`
- `docs/product/requirements.md`
- `docs/testing/test_strategy.md`

Acceptance criteria:

- Tests cover in-scope allowed click, out-of-scope blocked click, unbound-app blocked click, stale-observation blocked click, click gate disabled, and post-click observation requirement.
- Manual acceptance checks use only a local reversible app-under-test.

Verification:

- `npm run typecheck`
- `npm run test`
- `npm run build`

Residual scope:

- Real typing is implemented by ADMCP-021 through a separate app-scoped provider gate.
- Click-candidate witness output is still targeting-quality evidence; `desktop_click` does not yet require a stored candidate witness id.
- Post-click repair classification remains deferred to ADMCP-022.
- Local URL/origin app binding remains provider-dependent future work.

### ADMCP-021 App-Scoped Type Text Gate

Goal: Enable opt-in real typing of generated test input inside the bound app-under-test scope.

Status:

- Implemented.

Depends on:

- ADMCP-018 Licensed App Scope Model.
- ADMCP-019 Scope Binding Runtime.

Required behavior:

- Adds `ADMCP_ENABLE_REAL_TYPING=true` as a separate Windows provider gate.
- Requires active session, user-declared reversible app scope, bound app identity, fresh pre-action observation, allowed `type_text`, generated/synthetic test input classification, and audit logging through the existing action-tool path.
- Continues blocking credentials, secrets, private user data, and external publishing before provider execution.
- Records text length and classification, not raw text content, in action packets and audit events.
- Requires post-type observation before any next non-observe action and before success can be claimed.
- Reuses the Windows provider scope checks before typing and reports post-typing active-window residue for the required follow-up observation.

Acceptance criteria:

- Tests cover allowed generated test input, credential-like input block, out-of-scope block, gate-disabled block, text-content non-persistence, and post-type observation requirement.

Implementation notes:

- `desktop_capabilities` reports `realDesktopTyping: true`, `supportsTyping: true`, `realDesktopMutation: true`, and `executeDesktopActions: true` only when the real Windows typing gate is active.
- `desktop_type_text` still blocks credential-like text through policy before provider execution.
- The Windows provider uses the persistent helper path for typed generated input and returns `typedTextLength` without returning raw text.
- Real typing remains app-scoped; no raw keyboard primitive, shell tool, app launcher, external publishing tool, or broad desktop-control primitive was added.

### ADMCP-022 Post-Action Observation And Repair Loop

Goal: Turn app-scoped click/type actions into a closed-loop test interaction instead of blind action chains.

Status:

- Implemented.

Depends on:

- ADMCP-020 App-Scoped Real Click Gate.
- ADMCP-021 App-Scoped Type Text Gate.

Required behavior:

- Classify post-action observations as expected delta, no-op, wrong target, scope exit, risk prompt, uninterpretable state, or repair needed.
- Preserve action id, source observation id, follow-up observation id, expected evidence, observed delta, and residue on the transition gate.
- Allow bounded repair attempts inside the licensed app scope.
- Stop or escalate when post-action state leaves scope, cannot be interpreted within limits, or exposes a forbidden boundary.

Acceptance criteria:

- Tests cover expected delta, no-op, wrong-target residue, risk-prompt escalation, uninterpretable-state escalation, scope-exit stop, repair-limit stop, and transition-gate audit completeness.

Delivered implementation:

- `desktop_observe` classifies post-action transition observations as `expected_delta`, `no_op`, `wrong_target`, `scope_exit`, `risk_prompt`, `uninterpretable_state`, or `repair_needed`.
- Transition gates preserve `postActionClassification` with confidence, disposition, evidence, repair count, repair-limit state, and residue.
- Expected deltas reset the consecutive repair-attempt count.
- No-op, wrong-target, and repair-needed classifications consume bounded repair budget while allowing the next licensed repair action until the limit is reached.
- Scope exit, forbidden-boundary/risk prompts, uninterpretable follow-up observations, and repair-limit exhaustion create stop/escalation evidence.
- ADMCP-022 does not add OCR, accessibility trees, hidden polling, app launching, shell execution, or new desktop mutation authority.

### ADMCP-023 Governed UI Test Cycle Runner For Local Apps

Goal: Provide a repeatable governed UI test cycle runner for local UI development projects such as Phaser/Vite apps using the app-under-test session model.

Design center:

- The runner is not a blind scripted click/type utility.
- The runner is a carrier/re-entry harness around Codex reasoning and the existing MCP tools.
- The runner preserves multi-cycle test state so Codex does not treat pressure reduction or any visible change as test completion.
- The runner must support real-world UI tests where the path is longer than one action and where canvas, animation, hover state, delayed transitions, or ambiguous visual deltas make a single-cycle assertion insufficient.
- For Phaser/Vite apps, the runner should assume DOM/accessibility witnesses may be weak or unavailable; bounded frame evidence and transition classifications are first-class witnesses.
- The runner must keep residue visible and carry it into the next cycle rather than smoothing it into a prose summary.

Status:

- Planned.

Depends on:

- ADMCP-019 Scope Binding Runtime.
- ADMCP-020 App-Scoped Real Click Gate.
- ADMCP-021 App-Scoped Type Text Gate.
- ADMCP-022 Post-Action Observation And Repair Loop.

Required behavior:

- Run a bounded app-under-test session from a first-class scenario contract with explicit user confirmation, visible-content acknowledgement, reversible app-under-test declaration, allowed actions, forbidden boundaries, protected test outcome, max cycles, max actions, max duration, and observation cadence.
- Execute multi-cycle governed test steps using only existing MCP tools: `desktop_start_interaction_session`, `desktop_observe`, `desktop_move_mouse`, `desktop_evaluate_click_candidate`, `desktop_click`, `desktop_type_text`, `desktop_session_audit_log`, and `desktop_end_interaction_session`.
- Preserve the cycle shape `goal -> active cut -> observe -> licensed action/probe -> observe transitionActionId -> classify delta -> carry residue -> continue/repair/ask/close`.
- Record a required cycle packet for every runner cycle with test goal, cycle kind, active cut, current pressure, licensed probe/action, observations, transition classification when applicable, residue, next re-entry pressure, and cycle decision.
- Separate observation-only cycles from action-bearing cycles: `observation_only` cycles may omit action and after-observation fields, while `state_changing_action` cycles require before observation, action id, after observation through `transitionActionId`, and transition classification.
- Maintain a run-level test-state carrier across cycles with protected outcome status, observations, actions, transition classifications, candidate targets, residue classes, and closure state.
- Save compact artifacts: scenario contract, session license, bound app scope, cycle packets, observations, actions, frame hashes or screenshots, transition classifications, audit events, residue, next re-entry pressure, test-state carrier, and final landfall/re-entry packet.
- Stop or ask when the next useful move crosses a domain-authority boundary, leaves the bound app scope, hits a forbidden boundary, produces uninterpretable state, reaches the repair limit, or needs product knowledge that the agent cannot witness.
- Close only when the protected test goal is satisfied within declared scope, target-relevant residue is visible, return/re-entry is recoverable from artifacts, and no same-license probe can reduce target-relevant residue.
- Keep app launch/dev-server setup outside this server unless a later workspace-runner model is documented.

Scenario contract shape:

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
    - observable_id: gameplay_state_visible
      description: "declared observable required for this scenario"
      acceptable_evidence:
        - human_supplied_expected_visual_cue
        - screenshot_reference
        - provider_delta_summary
      sufficient_when:
        - "scenario-declared cue is present"
      insufficient_when:
        - "only frame_hash_delta changed"
      residue_if_missing:
        - missing_declared_visual_witness
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

Frame-hash rule:

- `frame_hash_delta` may support "something changed".
- `frame_hash_delta` cannot by itself satisfy a protected visual outcome unless the scenario contract explicitly declares that specific hash or visual-region delta sufficient.
- For Phaser/Vite canvas tests, screenshot references and hash deltas are witnesses, not semantic proof, unless the protected outcome defines the acceptable visual cue.

Required cycle packet shape:

```yaml
ui_test_cycle:
  cycle_id: C1
  cycle_kind: observation_only | probe_action | state_changing_action
  test_goal: "verify the requested UI behavior in the local app"
  active_cut: "what this cycle is trying to prove or reduce"
  current_pressure:
    - "target-relevant uncertainty before the cycle"
  licensed_probe_or_action:
    type: observe | evaluate_click_candidate | move_mouse | click | type_text
    semantic_target: "rough UI target or witness goal"
    target_scope: "bound app-under-test scope"
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
    kind: expected_delta | no_op | wrong_target | scope_exit | risk_prompt | uninterpretable_state | repair_needed
    evidence:
    residue:
  carrier_update:
    satisfied_observables:
    newly_visible:
    forgotten_or_compressed:
    remaining_residue:
  next_reentry_pressure:
    - "residue that controls the next cycle"
  cycle_decision: continue | repair | ask | partial_landfall | close | stop
```

Tool-to-cycle-kind matrix:

```yaml
cycle_kind_matrix:
  desktop_observe:
    cycle_kind: observation_only
    requires_current_observation: false
    requires_before_observation: false
    requires_action_id: false
    requires_after_observation: false
    requires_transition_classification: false
    output_role: orientation_witness

  desktop_evaluate_click_candidate:
    cycle_kind: probe_action
    requires_current_observation: true
    requires_before_observation: false
    requires_action_id: false
    requires_after_observation: false
    requires_transition_classification: false
    output_role: targeting_quality_witness

  desktop_move_mouse:
    cycle_kind: state_changing_action
    requires_current_observation: true
    requires_before_observation: true
    requires_action_id: true
    requires_after_observation_with_transitionActionId: true
    requires_transition_or_delta_classification: true
    output_role: movement_probe_transition

  desktop_click:
    cycle_kind: state_changing_action
    requires_current_observation: true
    requires_before_observation: true
    requires_action_id: true
    requires_after_observation_with_transitionActionId: true
    requires_transition_classification: true
    output_role: click_transition

  desktop_type_text:
    cycle_kind: state_changing_action
    requires_current_observation: true
    requires_before_observation: true
    requires_action_id: true
    requires_after_observation_with_transitionActionId: true
    requires_transition_classification: true
    output_role: text_entry_transition
```

`desktop_move_mouse` is state-changing even when used as a probe. It must not be treated like `desktop_evaluate_click_candidate`: movement creates a transition gate and requires post-movement observation before the next non-observe action.

Test-state carrier shape:

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
    - final_artifact_replays_scenario_contract_cycles_actions_classifications_residue_and_decision
  partial_landfall_allowed_if:
    - session_scope_still_bound
    - no_pending_transition_gate
    - protected_test_outcome_residualized
    - residue_visible
    - no_same_license_probe_can_reduce_remaining_residue
    - repair_budget_not_silently_exhausted
    - final_artifact_replays_scenario_contract_cycles_actions_classifications_residue_and_decision
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

Anti-drift requirements:

- Do not implement ADMCP-023 as a generic ordered action script that runs `click A -> click B -> type C -> assert D` without cycle packets.
- Do not add new desktop authority, raw coordinate automation, app launching, dev-server management, shell execution, OCR dependency, hidden polling, or cross-app control.
- Do not let the runner decide that a test passed only because a click happened, text was typed, frame hashes changed, or pressure was reduced.
- Do not imply arbitrary visual assertion authority. The runner may classify declared visual/test evidence against the scenario's protected outcome; it may not semantically assert undeclared canvas state.
- Do not hide no-op, wrong-target, ambiguous, or domain-bridge residue in logs only; residue must become `next_reentry_pressure`.
- Do not collapse closure into a scalar confidence score. Closure requires a final landfall/re-entry packet.
- Codex remains responsible for reasoning about the feature/test intent; the runner is responsible for consistent execution, carrier state, artifacts, stop conditions, and re-entry evidence.

Final landfall/re-entry packet:

```yaml
ui_test_landfall:
  test_goal:
  declared_scope:
  protected_observables:
  satisfied_observables:
  unsatisfied_residue:
  cycle_history:
    - cycle_id:
      classification:
      decision:
  audit_event_count:
  stop_conditions:
  closure_status: passed | failed | partial_landfall | open | ask_required | stopped
  closure_allowed: true | false
  reentry_notes:
    - "what a later Codex agent can recover without hidden session memory"
```

Recommended implementation split:

- ADMCP-023A Scenario Contract And Artifact Schemas.
  - Add schema modules for scenario contract, cycle packet, carrier, closure gate, and landfall artifact.
  - Add schema tests for app-under-test contract, session-license fields, allowed actions versus allowed probes, forbidden boundaries, max cycles/actions/time, structured protected outcome declaration with acceptable evidence, evidence-strength defaults, tool-to-cycle-kind matrix, closure-gate pass versus partial-landfall distinctions, observation-only versus state-changing cycle packets, and artifact replay fields.
  - Execute no desktop action in this slice.
  - ADMCP-023A is the next implementation target; do not start runner orchestration in ADMCP-023A.
- ADMCP-023B Mock Cycle Runner.
  - Use existing MCP/server tool paths against mock/provider-backed deterministic fixtures.
  - Cover expected delta with protected outcome satisfied, expected delta with outcome unresolved, no-op, wrong-target, repair-needed, uninterpretable, repair-limit, and closure-gate behavior.
  - Produce replayable artifacts.
- ADMCP-023C Local App Manual Runner.
  - Use real observation/click/type only behind existing gates and user-granted app-under-test scope.
  - Require the user or outer Codex workflow to launch the app/dev server outside this MCP server.
  - Stop on scope exit and forbidden boundaries; save compact screenshots or frame references, hashes, classifications, audit log, and residue.
- ADMCP-023D Phaser/Vite Fixture Pressure Test.
  - Use a deliberately small fixture with a start/menu screen, a click-to-gameplay transition, optional HUD/state evidence, a no-op/wrong-target case, a delayed transition case, and a scope-exit case.
  - Verify that visible change alone does not close unless the protected outcome is satisfied or residualized.

Acceptance criteria:

- A local Phaser/Vite fixture can be tested through the governed desktop loop.
- Multi-cycle runs produce cycle packets that carry residue forward as next re-entry pressure.
- The runner stops on scope exit, forbidden boundaries, uninterpretable state, repair-limit exhaustion, or missing domain authority.
- A visible change alone is not accepted as success unless the final landfall packet ties it to the protected test goal.
- Tests cover expected delta, no-op, wrong-target, repair-needed, scope-exit, risk-prompt, uninterpretable-state, repair-limit, pending-transition, and closure-gate behavior.
- Artifacts are sufficient for a later reviewer or Codex agent to recover why the runner continued, repaired, asked, stopped, or closed.
- The runner does not add shell, deployment, external publishing, app launching, hidden polling, OCR, semantic localization, or cross-app authority.
