# Codex Desktop Interaction Re-Entry

## Current Tool State

Available MCP tools:

- `desktop_capabilities`
- `automation_policy_check`
- `ui_intersection_plan`
- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Unavailable MCP tools:

- real clicking
- real typing

Default server behavior is mock-only. By default, no tool captures the real desktop, moves the real mouse, clicks the real desktop, types into the real desktop, launches apps, or controls the OS. `desktop_observe`, `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` are backed by a deterministic mock provider unless the server is started with the Windows real provider gates enabled.

Real observation spike:

- Opt-in only with `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true`.
- Captures bounded visible active-window PNG frames through `desktop_observe`.
- Reports cursor position in active-window frame coordinates when available.
- Requires an active session, visible-content acknowledgement, allowed observation scope, and bounded frame/duration inputs.
- Does not enable real clicking, real typing, OCR, localization, hidden polling, background capture, app launching, shell tools, or durable OS mutation.

Real mouse movement probe:

- Additional opt-in only with `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` while the Windows real-observation provider is enabled.
- Uses `desktop_move_mouse`; no separate raw pointer tool exists.
- Requires an active session, `move_mouse` in the session license, fresh pre-action observation, matching active-window scope, and a point inside the active-window capture frame.
- Treats the point as active-window frame coordinates and converts it to screen coordinates inside the provider.
- Creates the same transition gate as mock movement and requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Does not enable real click, typing, shell, app launch, system changes, or durable desktop mutation.

## Current Session Workflow

Use the session tools to create a bounded task license, record mock observation packets, run mock movement/click/type probes, and inspect the audit trail.

1. Call `desktop_start_interaction_session`.
2. Include a concrete `userGoal`.
3. Set `userConfirmed: true` only when the user has actually granted the task-level license.
4. Set `visibleContentAcknowledged: true` only when the user has acknowledged that future observation tools may capture visible desktop content.
5. Provide allowed scopes, allowed actions, forbidden actions, risk limits, and observation cadence.
   - For real Windows observation or movement sessions, use `observationCadence.maxObservationGapMs: 60000` unless the task explicitly requires a tighter freshness bound.
   - A 5s freshness window is often too short for the current real provider because capture, helper startup, visual reasoning, and post-action lookback can consume several seconds before the next action call.
   - Keep the cadence bounded; widening this value is not permission for hidden polling, background capture, or stale action chains.
6. Call `desktop_observe` only after the session is active.
7. Keep `mode: "frame_session"` unless a single-frame witness is explicitly enough for the test.
8. Keep `maxFrames` and `durationMs` bounded. The current tool caps requests at 12 frames and 5000 ms.
9. Treat observation output as mock evidence unless `desktop_capabilities.provider.providerKind` is `real`.
10. Call `desktop_move_mouse` only after a fresh observation and pass that observation id as `preActionObservationId`.
11. Treat `desktop_move_mouse` as a probe. It returns an interaction transition gate in `pending_observation` state. If real mouse movement is enabled, the move can affect cursor position and hover state but still must not click or type.
12. Call `desktop_click` or `desktop_type_text` only after a fresh observation and only when no prior transition gate is pending.
13. For `desktop_type_text`, use generated test input only. The tool records text length but not text content.
14. After every movement, click, or typing probe, call `desktop_observe` with `transitionActionId` set to the action id.
15. Do not call another non-observe action until the transition gate returns `audited`.
16. Use `desktop_session_audit_log` to inspect the session trace.
17. Use `desktop_end_interaction_session` when the task license should stop.

The current implementation records session lifecycle, mock observation, mock movement, mock click, mock typing, real observation, opt-in real movement, cursor witness, hover-witness uncertainty, cursor-annotated frame metadata, and movement-delta audit events. It can exercise the `observe -> move_mouse -> observe transitionActionId` loop against the real active window when both real provider gates are enabled. It cannot click the real desktop or type into the real desktop.

## Stop Or Escalate

Stop or ask the user before continuing if:

- user confirmation is absent,
- visible-content acknowledgement is absent,
- the requested scope is unrelated to the user's task,
- an interaction transition gate is blocked or cannot be audited from the available observation,
- the request implies credentials, payments, messages, publishing, destructive operations, shell execution, or system settings,
- `desktop_type_text` input is credential-like, secret-like, private, or not generated test input,
- the user expects real clicking, typing, app launch, shell execution, system changes, or durable desktop mutation,
- real observation is enabled but the active window does not match the requested scope.

## Current Mock Loop

Executable mock sequence:

1. Start a licensed session.
2. Observe the scoped app/window with mock bounded frame evidence.
3. Move as a mock probe only after fresh observation.
4. Observe with `transitionActionId` to audit the movement transition.
5. Click or type as a mock probe only after the transition gate is audited.
6. Observe with `transitionActionId` to audit the click or typing transition.
7. Inspect audit logs and stop the session.

Future real providers must reuse the same transition gate discipline before any real desktop backend is enabled.

## Next Implementation Target

ADMCP-013A is implemented. It provides a governed manual probe runner for repeated real-provider path-finding:

- run repeated `observe -> move_mouse -> observe` attempts through the existing MCP/session path,
- record cursor positions, relative movement vectors, screenshot paths or frame hashes, transition-gate status, and residue,
- preserve stale-observation policy blocks and wrong-target hover evidence,
- verify `desktop_click` remains blocked without producing a real click.

Use:

```powershell
npm run manual:probe:example
npm run manual:probe -- .\tmp\manual-probes\file-menu.json
```

Real pointer movement through the runner still requires the Windows provider config plus `allowRealMouseMovement: true` in the probe config.

ADMCP-013B is implemented. It provides a faster governed navigation probe runner for pressure tests where the goal is to follow a compact hover/movement path:

- runs one active session for the full path,
- records one initial observation,
- runs each configured `desktop_move_mouse` step against the latest observation,
- records the required post-movement `desktop_observe` with `transitionActionId`,
- carries that post-movement observation forward as the next pre-action witness,
- records per-tool timing diagnostics so slow MCP calls and provider captures are visible,
- keeps real click, typing, shell, app launch, system changes, and durable desktop mutation disabled.

Use:

```powershell
npm run manual:navigation-probe:example
npm run manual:navigation-probe -- .\tmp\navigation-probes\example.json
```

Prefer this runner for protocol pressure tests such as `hover parent landmark -> observe revealed menu -> hover child target`. For an N-step path, it should require N+1 observations instead of separate pre/post observations for every step. Real pointer movement through this runner still requires the Windows provider config plus `allowRealMouseMovement: true` in the probe config.

ADMCP-014 is implemented. Its job is cursor and hover witness refinement, not real clicking:

- preserve `observe -> move_mouse -> observe transitionActionId`,
- add explicit cursor witness and movement delta evidence,
- render the visible cursor and a high-contrast cursor witness marker into captured frames when possible, then mark those frames as cursor-annotated,
- record scope-stability and hover/cursor-shape uncertainty,
- keep real click, typing, shell, app launch, system changes, and durable desktop mutation disabled.

When reading `desktop_observe` output, prefer `cursorWitness` over the legacy top-level `cursorPosition` because it carries coordinate space, confidence, rendered-into-frame status, rendering method, and residue. Treat `hoverWitness.evaluated: false` as an explicit gap, not as evidence that hovering succeeded.

ADMCP-015 is implemented. It adds provider timing diagnostics for performance work:

- `desktop_observe` may return `observation.providerTiming` when the active provider supplies it.
- The Windows provider reports active-window lookup, capture call duration, PowerShell capture substages, frame-byte decoding, frame artifact construction, fallback cursor lookup, and total provider duration.
- Windows real mouse movement returns provider timing inside `providerResult.providerTiming`, including pre-move window lookup, cursor-position setting, post-move window lookup, and total provider duration.
- The governed navigation probe runner includes observation provider timing in its compact summaries.
- Timing packets are diagnostic only and must not be treated as policy evidence or action license.
- Timing instrumentation does not enable click, typing, shell, app launch, system change, hidden polling, background capture, or durable desktop mutation.

ADMCP-016 is implemented. The Windows real-observation provider now uses a persistent PowerShell helper by default:

- The helper is an implementation detail behind the existing provider seam and MCP session tools.
- It keeps Win32 setup warm across bounded provider calls so repeated observations in a governed path can be fast.
- It starts on demand, uses per-request timeouts, and is disposed through the optional provider cleanup hook.
- Manual probe runners call provider cleanup in `finally` so helper processes do not outlive the governed run.
- A per-call PowerShell fallback remains available with `usePersistentPowerShellHelper: false` for diagnostics.
- Live smoke showed the warmed path reducing a second observation to about 85-90 ms; cold helper startup can still vary and should be treated as residue.
- It does not add click, typing, shell, app launch, OCR, accessibility interpretation, hidden polling, background capture, system change, or durable desktop mutation.

Next unimplemented target: ADMCP-017 Licensed App Scope Model.

- Re-center future real click/type work around a user-declared reversible app-under-test.
- The primary governance boundary becomes "all agent-triggered interaction stays inside the bound app/window/process/local URL."
- Click-candidate evidence remains useful as targeting-quality evidence, but it is not the main safety gate.
- Real click/type remain disabled until app scope, scope binding, provider gates, and post-action observation/repair behavior are implemented and tested.

## Real Observation Manual Check

Use `../testing/manual_real_observation_checklist.md` before relying on the Windows real-observation spike outside unit tests.
