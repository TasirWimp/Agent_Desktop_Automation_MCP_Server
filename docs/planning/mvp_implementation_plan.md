# MVP Implementation Plan

## Current Status

Phase 0 foundation is being established: repository scaffold, Codex subagents, GitHub Actions CI, MCP stdio entrypoint, and initial policy tests.

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

Goal: Add one narrow observation tool with no desktop mutation.

Candidate: active-window metadata or environment context, depending on available stable Windows APIs.

Requirements before implementation:

- tool contract documented,
- no credential or hidden input capture,
- audit output defined,
- tests planned.

### ADMCP-005 Confirmed Low-Risk Desktop Action

Goal: Add one explicit user-confirmed action after the confirmation flow is documented.

Requirements before implementation:

- confirmation contract,
- target validation,
- failure behavior,
- audit output,
- unit and protocol tests.
