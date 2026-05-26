# Agent Desktop Automation MCP Server

Policy-first TypeScript MCP server foundation for desktop automation agents.

The current server exposes:

- `desktop_capabilities` - reports runtime capabilities and safety posture.
- `automation_policy_check` - classifies proposed desktop automation actions before execution.

Real desktop mutation tools are intentionally not enabled in the initial scaffold. Future tools should start narrow, require explicit user confirmation when they change desktop state, and update the safety model before implementation.

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
src/server.ts           MCP server and tool registration
src/index.ts            stdio transport entrypoint
tests/                  Vitest tests
```
