# Agent Desktop Automation MCP Server

Policy-first TypeScript MCP server foundation for desktop automation agents.

The current server exposes:

- `desktop_capabilities` - reports runtime capabilities and safety posture.
- `desktop_first_use_guide` - returns the compact first-use workflow, evidence rules, scope rules, and source docs for new clients.
- `automation_policy_check` - classifies proposed desktop automation actions before execution.
- `ui_intersection_plan` - builds read-only UI localization, intersection, and residue packets for future policy-gated click planning.
- `desktop_start_interaction_session` - starts a bounded, user-confirmed interaction session license.
- `desktop_open_application` - opens only a catalog allowlisted application ID or alias; no arbitrary executable paths or arguments.
- `desktop_observe` - records a bounded observation frame session for an active interaction session.
- `desktop_submit_perception_digest` - records an agent-authored digest for the latest screenshot-bearing observation; the server validates freshness/provenance, not pixels.
- `desktop_move_mouse` - runs a bounded relational movement probe inside an active interaction session and requires follow-up observation plus semantic landing assessment.
- `desktop_submit_transition_assessment` - records whether a follow-up screenshot supports, contradicts, or cannot conclude the stored relational movement claim.
- `desktop_evaluate_click_candidate` - evaluates current observation, cursor, semantic landing, scope, and risk evidence for a future app-scoped click request without clicking.
- `desktop_click` - runs a bounded app-scoped click only after hover-witness evidence and requires follow-up observation; real clicking is opt-in only.
- `desktop_type_text` - runs bounded app-scoped generated test-text entry with relational evidence, without storing text content, and requires follow-up observation; real typing is opt-in only.
- `desktop_end_interaction_session` - ends an active interaction session.
- `desktop_session_audit_log` - reads the session lifecycle audit log.

Real desktop capture and pointer movement are disabled by default. The default provider is deterministic and mock-only: it does not capture the real desktop, move the real mouse, click the real desktop, type into the real desktop, launch real apps, or control the OS. Future real backends must start narrow, require a bounded interaction session when they change desktop state, and update the safety model before implementation.

The codebase also defines policy contracts for licensed desktop interaction sessions. In that model, a user grants a bounded task license, low-risk actions stay inside the session scope, every action is audited, and state-changing actions such as mouse movement, clicking, and typing require a fresh perception digest, relational evidence, and follow-up observation. Coordinates are endpoints only; they are not proof that the semantic target was correct.

Sessions that grant `click` or `type_text` must include `licensedAppScope`, declaring the reversible app-under-test, app-scoped allowed actions, forbidden boundaries, and scope-exit stop conditions. When present, `desktop_observe` binds that declared app-under-test to observed provider identity and returns it as `boundAppScope`. Later observations that drift outside the bound app return `status: "scope_exit"` and are not recorded as session observations. Real clicking and real typing additionally require their explicit Windows provider gates.

## Real Observation And Pointer Probe

The default provider is mock. A Windows active-window observation spike is available only when explicitly enabled:

```powershell
$env:ADMCP_DESKTOP_PROVIDER = "windows-active-window"
$env:ADMCP_ENABLE_REAL_OBSERVATION = "true"
npm run dev
```

The spike captures bounded visible active-window PNG frames through `desktop_observe` and reports cursor position in active-window frame coordinates. It does not enable real clicking, typing, app launching, shell tools, OCR, localization, hidden polling, or background capture.

Real mouse movement is a separate opt-in probe gate:

```powershell
$env:ADMCP_DESKTOP_PROVIDER = "windows-active-window"
$env:ADMCP_ENABLE_REAL_OBSERVATION = "true"
$env:ADMCP_ENABLE_REAL_MOUSE_MOVEMENT = "true"
npm run dev
```

With that gate enabled, `desktop_move_mouse` may move the real cursor inside the scoped active-window capture frame only. It still requires an active session, a screenshot-bearing fresh pre-action observation, `desktop_submit_perception_digest` for that observation, compact or full relational navigation evidence, scope validation, audit logging, a post-movement observation, a fresh digest for the follow-up observation, and `desktop_submit_transition_assessment` before click readiness. Cursor landing is telemetry only. After a supported semantic landing assessment, `desktop_evaluate_click_candidate` can record whether the current cursor/frame/scope evidence is target-ready for an app-scoped click request. It does not click.

Real clicking is a separate app-scoped gate:

```powershell
$env:ADMCP_DESKTOP_PROVIDER = "windows-active-window"
$env:ADMCP_ENABLE_REAL_OBSERVATION = "true"
$env:ADMCP_ENABLE_REAL_CLICK = "true"
npm run dev
```

With that gate enabled, `desktop_click` may click inside the bound app-under-test only after an active session, reversible `licensedAppScope`, recorded `boundAppScope`, fresh pre-action observation, fresh perception digest, `compactRelationalClaim.pointProvenance: "hover_witness"`, matching `hoverTargetWitnessId`, in-frame point, app-scoped `click` permission, and audit logging. It returns a pending transition gate and requires `desktop_observe` with `transitionActionId` before any next non-observe action.

Real typing is a separate app-scoped generated-input gate:

```powershell
$env:ADMCP_DESKTOP_PROVIDER = "windows-active-window"
$env:ADMCP_ENABLE_REAL_OBSERVATION = "true"
$env:ADMCP_ENABLE_REAL_TYPING = "true"
npm run dev
```

With that gate enabled, `desktop_type_text` may type generated test input inside the bound app-under-test only after an active session, reversible `licensedAppScope`, recorded `boundAppScope`, fresh pre-action observation, fresh perception digest, relational evidence, app-scoped `type_text` permission, non-sensitive/test-input classification, and audit logging. It records text length and classification, not raw text content. It returns a pending transition gate and requires `desktop_observe` with `transitionActionId` before any next non-observe action.

For first-time use, call `desktop_first_use_guide` before starting a session or read `usageGuidance.firstUseGuide` from `desktop_capabilities`. `desktop_start_interaction_session` also returns `nextRequiredStep` pointing to the first `desktop_observe({ includeImages: true })` call. Agents must inspect `visualArtifacts[].path` or the returned MCP image content block before authoring a perception digest. Normal observe JSON omits raw `frames[].dataBase64`; pass `includeInlineBase64: true` only for compatibility/debug use.

The required click path is:

```text
observe -> inspect returned image -> perception digest -> workflow claim -> compact relational move -> observe transition -> perception digest -> semantic landing assessment -> evaluate click candidate -> click with latest digest/workflow -> observe
```

Compact API clients should still prefer JSON `null` for `contradictionToPriorClaim` when no contradiction is visible. For smaller agents, exact safe sentinel strings such as `"none"`, `"null"`, `"n/a"`, `"not applicable"`, and `"no contradiction observed"` are normalized to `null` at digest recording. Semantic target checks compare conservative canonical forms, so generic UI wording may vary, such as `Run button on the right` versus `Run control on right`; distinct targets such as `Run button` versus `Delete button` remain mismatches.

Catalog app bootstrap uses `config/desktop_applications.json`. Add apps by ID and aliases there; `desktop_open_application` rejects unknown apps, path-like launch strings, and command-line argument fields.

For real Windows observation or movement sessions, prefer `riskLimits.maxDurationMs: 3600000`, `observationCadence.maxObservationGapMs: 180000`, and explicit `observationCadence.evidenceFreshness` tiers of 180000 ms for pre-action and click-candidate observations, and 300000 ms for perception digests, workflow-state claims, app-scope bindings, and hover witnesses. A single 5s or 60s freshness window is often too short for the current real provider because capture, helper startup, visual reasoning, workflow-state review, and post-action lookback can consume several seconds. These values keep sessions bounded; they do not permit hidden polling, background capture, stale digests, stale workflow claims, or blind action chains.

## Requirements

- Node.js 22.12.x LTS or Node.js 24.0.0 or newer.
- npm.

## Development Commands

```bash
npm install
npm run dev
npm run manual:probe:example
npm run manual:navigation-probe:example
npm run typecheck
npm run test
npm run build
npm run start
```

## Governed Manual Probe Runner

`npm run manual:probe` runs bounded manual path-finding probes through the existing MCP session tools. It does not bypass policy, scope checks, transition gates, or provider capability checks.

```powershell
npm run manual:probe:example
npm run manual:probe -- .\tmp\manual-probes\file-menu.json
```

The runner can use the opt-in Windows observation and mouse-movement provider, but the config must explicitly set `userConfirmed: true`, `visibleContentAcknowledged: true`, and `allowRealMouseMovement: true`. It does not enable real clicking or typing.

## Governed Navigation Probe Runner

`npm run manual:navigation-probe` is the faster runner for UI-navigation pressure tests. It runs one bounded session for a sequence of hover or movement probes, carries each post-movement observation forward as the next pre-action witness, and records per-tool timing diagnostics.

```powershell
npm run manual:navigation-probe:example
npm run manual:navigation-probe -- .\tmp\navigation-probes\example.json
```

Use this runner when testing a path such as `hover parent landmark -> observe revealed menu -> hover target`. It still uses only `desktop_observe` and `desktop_move_mouse`; real clicking and typing remain unavailable.

## Codex MCP Configuration

Use the stale-build-safe launcher for local Codex MCP wiring. It rebuilds `dist`
when `src`, `config`, or package metadata are newer than `dist/index.js`, then
hands stdio to the compiled MCP server:

```json
{
  "mcpServers": {
    "agent-desktop-automation": {
      "command": "node",
      "args": [
        "C:\\Users\\jensb\\Desktop\\Projects\\Agent_Desktop _Automation_MCP_Server\\scripts\\start-mcp.mjs"
      ]
    }
  }
}
```

For production or packaged use, `npm run build` followed by `npm run start`
still runs the compiled `dist/index.js` directly.

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
