# Agent Desktop Automation MCP Server

Policy-first TypeScript MCP server foundation for desktop automation agents.

The current server exposes:

- `desktop_capabilities` - reports runtime capabilities and safety posture.
- `automation_policy_check` - classifies proposed desktop automation actions before execution.
- `ui_intersection_plan` - builds read-only UI localization, intersection, and residue packets for future policy-gated click planning.
- `desktop_start_interaction_session` - starts a bounded, user-confirmed interaction session license.
- `desktop_observe` - records a bounded mock observation frame session for an active interaction session.
- `desktop_move_mouse` - simulates a bounded mock movement probe inside an active interaction session and requires follow-up observation.
- `desktop_click` - simulates a bounded mock click inside an active interaction session and requires follow-up observation.
- `desktop_type_text` - simulates bounded mock test-text entry without storing text content and requires follow-up observation.
- `desktop_end_interaction_session` - ends an active interaction session.
- `desktop_session_audit_log` - reads the session lifecycle audit log.

Real desktop capture and mutation tools are intentionally not enabled in the initial scaffold. The current provider is deterministic and mock-only: it does not capture the real desktop, move the real mouse, click the real desktop, type into the real desktop, launch apps, or control the OS. Future real backends must start narrow, require a bounded interaction session when they change desktop state, and update the safety model before implementation.

The codebase also defines policy contracts for future licensed desktop interaction sessions. In that model, a user grants a bounded task license, low-risk actions stay inside the session scope, every action is audited, and state-changing actions such as mouse movement, clicking, and typing require follow-up observation.

## Requirements

- Node.js 22.12.x LTS or Node.js 24.0.0 or newer.
- npm.

## Development Commands

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run start
```

## Codex MCP Configuration

After `npm run build`, add the server to an MCP client with a command like:

```json
{
  "mcpServers": {
    "agent-desktop-automation": {
      "command": "node",
      "args": [
        "C:\\Users\\jensb\\Desktop\\Projects\\Agent_Desktop _Automation_MCP_Server\\dist\\index.js"
      ]
    }
  }
}
```

## Codex Subagents

Role-specific Codex agents live in `.codex/agents/`:

- `desktop_automation_planner`
- `desktop_automation_protocol_worker`
- `desktop_automation_session_worker`
- `desktop_automation_tool_worker`
- `desktop_automation_test_planner`
- `desktop_automation_safety_reviewer`
- `desktop_automation_docs_keeper`

They coordinate through repository docs, commits, and completion summaries.

## Project Structure

```text
.codex/agents/          Codex subagent role definitions
.github/workflows/      GitHub Actions CI
docs/                   Product, process, planning, testing, and architecture docs
src/policy/             Safety and policy logic
src/providers/          Desktop provider interfaces and mock provider
src/session/            Licensed session runtime and lifecycle tool helpers
src/server.ts           MCP server and tool registration
src/index.ts            stdio transport entrypoint
tests/                  Vitest tests
```
