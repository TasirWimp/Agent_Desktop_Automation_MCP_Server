# MVP Implementation Plan

## Current Status

Phase 0 foundation is established: repository scaffold, Codex subagents, GitHub Actions CI, MCP stdio entrypoint, initial policy tests, read-only UI intersection planning, session-license policy contracts, in-memory session runtime/audit store, MCP session lifecycle tools, mock provider-backed observation, mock action probes with transition gates, a click-candidate witness gate, an opt-in Windows real-observation spike, an opt-in Windows real mouse-movement probe, governed manual/navigation probe runners, Windows provider performance instrumentation, and a persistent Windows observation helper.

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
- ADMCP-018 Licensed App Scope Model - planned.
- ADMCP-019 Scope Binding Runtime - planned.
- ADMCP-020 App-Scoped Real Click Gate - planned.
- ADMCP-021 App-Scoped Type Text Gate - planned.
- ADMCP-022 Post-Action Observation And Repair Loop - planned.
- ADMCP-023 UI Test Runner For Local Apps - planned.

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

- Planned.

Reason:

- The main governance boundary for UI testing should be app scope, not per-action moral safety checks.
- The user can declare a local app, window, process, or local URL as safe to interact with because permanent damage has been prevented outside the MCP server.
- The server's job is to enforce that agent-triggered interactions stay inside that declared app license.

Required behavior:

- Add a licensed app scope model to the session license, with fields such as `licensedAppScope`, `userDeclaredReversible`, `allowedActions`, `forbiddenBoundaries`, and `scopeExitStopConditions`.
- Represent scope kinds for observed window identity, process name, window title, workspace path, and future local URL/domain binding.
- Treat the current click-candidate witness concept as targeting-quality evidence inside the licensed app, not as the primary safety gate.
- Keep real click and real typing disabled in this slice.

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

### ADMCP-019 Scope Binding Runtime

Goal: Bind the declared app-under-test scope to concrete observed provider identity and enforce that binding before every real action.

Status:

- Planned.

Depends on:

- ADMCP-018 Licensed App Scope Model.

Required behavior:

- Convert provisional `active_window` scope into a bound observed identity before real click or typing is possible.
- Store bound window/process/title/local URL evidence in session runtime.
- Validate that each observation and action target still matches the bound app scope.
- Stop or escalate when the active target leaves the licensed app, an unrelated window appears, or scope cannot be re-established.
- Keep real click and real typing disabled in this slice.

Acceptance criteria:

- Tests cover successful binding, stale binding, window-title/process mismatch, active-window focus drift, and scope-exit stop conditions.
- The provider cannot execute real actions against an unbound or mismatched app scope.

### ADMCP-020 App-Scoped Real Click Gate

Goal: Enable opt-in real clicking only inside the bound app-under-test scope.

Status:

- Planned.

Depends on:

- ADMCP-018 Licensed App Scope Model.
- ADMCP-019 Scope Binding Runtime.

Required behavior:

- Add a separate environment/provider gate for real click support.
- Require active session, user-declared reversible app scope, bound app identity, fresh pre-action observation, in-scope target point, allowed `click`, and audit logging.
- Use click-candidate/targeting-quality witnesses to reduce wrong-target clicks, but do not require broad semantic certainty when the action is inside the licensed reversible app.
- Require post-click observation before any next non-observe action and before success can be claimed.
- Block or escalate clicks that leave scope, hit system dialogs, target credentials/payments/private prompts, or cross forbidden boundaries.

Acceptance criteria:

- Tests cover in-scope allowed click, out-of-scope blocked click, unbound-app blocked click, stale-observation blocked click, click gate disabled, and post-click observation requirement.
- Manual acceptance checks use only a local reversible app-under-test.

### ADMCP-021 App-Scoped Type Text Gate

Goal: Enable opt-in real typing of generated test input inside the bound app-under-test scope.

Status:

- Planned.

Depends on:

- ADMCP-018 Licensed App Scope Model.
- ADMCP-019 Scope Binding Runtime.

Required behavior:

- Add a separate environment/provider gate for real typing.
- Require active session, user-declared reversible app scope, bound app identity, fresh pre-action observation, allowed `type_text`, generated/synthetic test input classification, and audit logging.
- Continue blocking credentials, secrets, private user data, and external publishing unless a later explicitly narrowed test fixture model exists.
- Record text length and classification, not raw sensitive text.
- Require post-type observation before any next non-observe action and before success can be claimed.

Acceptance criteria:

- Tests cover allowed generated test input, credential-like input block, out-of-scope block, gate-disabled block, and post-type observation requirement.

### ADMCP-022 Post-Action Observation And Repair Loop

Goal: Turn app-scoped click/type actions into a closed-loop test interaction instead of blind action chains.

Status:

- Planned.

Depends on:

- ADMCP-020 App-Scoped Real Click Gate.
- ADMCP-021 App-Scoped Type Text Gate.

Required behavior:

- Classify post-action observations as expected delta, no-op, wrong target, scope exit, risk prompt, uninterpretable state, or repair needed.
- Preserve action id, source observation id, follow-up observation id, expected evidence, observed delta, and residue on the transition gate.
- Allow bounded repair attempts inside the licensed app scope.
- Stop or escalate when post-action state leaves scope, cannot be interpreted within limits, or exposes a forbidden boundary.

Acceptance criteria:

- Tests cover expected delta, no-op, wrong-target residue, scope-exit stop, repair-limit stop, and transition-gate audit completeness.

### ADMCP-023 UI Test Runner For Local Apps

Goal: Provide a repeatable runner for local UI development projects such as Phaser/Vite apps using the app-under-test session model.

Status:

- Planned.

Depends on:

- ADMCP-019 Scope Binding Runtime.
- ADMCP-020 App-Scoped Real Click Gate.
- ADMCP-021 App-Scoped Type Text Gate.
- ADMCP-022 Post-Action Observation And Repair Loop.

Required behavior:

- Run a bounded app-under-test session with explicit user confirmation and visible-content acknowledgement.
- Support `observe -> move -> click/type -> observe -> assert visual/test outcome -> repair`.
- Save compact artifacts: session license, bound app scope, observations, actions, frame hashes or screenshots, transition classifications, audit events, and residue.
- Keep app launch/dev-server setup outside this server unless a later workspace-runner model is documented.

Acceptance criteria:

- A local Phaser/Vite fixture can be tested through the governed desktop loop.
- The runner stops on scope exit or forbidden boundaries.
- The runner does not add shell, deployment, external publishing, or cross-app authority.
