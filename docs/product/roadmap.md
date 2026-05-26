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

## Phase 2: Confirmed Desktop Actions

- Add one confirmed action at a time, starting with low-risk targets.
- Require explicit target, intent, and confirmation result.
- Keep shell commands and system changes blocked unless a narrower contract is approved.

## Phase 3: Workflow Automation

- Compose narrow tools into documented workflows.
- Add replayable fixtures and regression tests.
- Expand client setup documentation.
