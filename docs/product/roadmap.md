# Roadmap

## Phase 0: Repository And Safety Foundation

- Create TypeScript MCP server scaffold.
- Add Codex subagent roles.
- Add GitHub Actions CI.
- Add policy model and tests.

## Phase 1: Read-Only Context Tools

- Add narrow observation tools with no desktop mutation.
- Define audit output for every tool call.
- Add protocol-level smoke tests.

## Phase 2: Licensed Desktop Interaction Sessions

- Add task-scoped interaction sessions with explicit user goal, allowed scope, risk limits, duration limits, action-count limits, observation cadence, and audit log.
- Require user confirmation to start a session, not before every low-risk micro-action inside the license.
- Add bounded observation, mouse movement, click, and typing tools behind a session license and provider seam.
- Keep credentials, payments, external publishing, destructive operations outside scope, shell commands, and system changes blocked or escalated unless a narrower contract is approved.

## Phase 3: Workflow Automation

- Compose session-licensed tools into observe-act-observe repair workflows.
- Add replayable fixtures and regression tests.
- Expand client setup documentation.
