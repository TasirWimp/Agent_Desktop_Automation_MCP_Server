# MVP Implementation Plan

## Current Status

Phase 0 foundation is established: repository scaffold, Codex subagents, GitHub Actions CI, MCP stdio entrypoint, initial policy tests, read-only UI intersection planning, session-license policy contracts, in-memory session runtime/audit store, MCP session lifecycle tools, mock provider-backed observation, mock action probes with transition gates, and an opt-in Windows real-observation spike.

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
- ADMCP-013 Real Control Provider Gate.

Acceptance gate before real OS mutation:

- active session state is enforced,
- audit log is complete and queryable,
- observation references are validated against provider state,
- `active_window` is bound to concrete observed identity,
- post-action observation is enforced for movement, click, and typing,
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
- Real desktop mutation remains deferred to ADMCP-013 or later.

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
- Keeps real mouse movement, real clicking, real typing, OCR, localization, hidden polling, background capture, app launching, shell tools, and OS mutation disabled.
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
- Real mouse movement, clicking, typing, shell, app launching, and OS mutation remain disabled.
- ADMCP-013 is the next implementation slice.
