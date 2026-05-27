# MVP Implementation Plan

## Current Status

Phase 0 foundation is established: repository scaffold, Codex subagents, GitHub Actions CI, MCP stdio entrypoint, initial policy tests, read-only UI intersection planning, and session-license policy contracts.

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
- No real OS backend, clicking, typing, OCR, accessibility-tree interpretation, or autonomous background loop is implemented.

### ADMCP-006 Provider-Backed Desktop Interaction Tools

Goal: Add provider-backed MCP tools for the protected loop after the session policy is documented and tested.

Planned tools:

- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Requirements before implementation:

- mock provider tests,
- protocol smoke tests,
- explicit active-session state handling,
- bounded observation behavior,
- observed active-window identity binding before mutation,
- observation existence, freshness, session id, scope, and frame-link validation against provider state,
- repair-attempt accounting,
- audit persistence contract,
- stop and recovery behavior,
- manual acceptance checks for any real desktop backend.
