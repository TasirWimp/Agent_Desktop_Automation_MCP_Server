# Codex Desktop Interaction Re-Entry

## Current Tool State

Available MCP tools:

- `desktop_capabilities`
- `automation_policy_check`
- `ui_intersection_plan`
- `desktop_start_interaction_session`
- `desktop_observe`
- `desktop_move_mouse`
- `desktop_evaluate_click_candidate`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

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

Real click gate:

- Additional opt-in only with `ADMCP_ENABLE_REAL_CLICK=true` while the Windows real-observation provider is enabled.
- Uses `desktop_click`; no separate raw click tool exists.
- Requires an active session, `click` in the session license, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, matching app scope, and a point inside the active-window capture frame.
- Treats the point as active-window frame coordinates and converts it to screen coordinates inside the provider.
- Creates the same transition gate as mock clicking and requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Does not enable real typing, shell, app launch, system changes, external publishing, or broad desktop control.

Real typing gate:

- Additional opt-in only with `ADMCP_ENABLE_REAL_TYPING=true` while the Windows real-observation provider is enabled.
- Uses `desktop_type_text`; no separate raw keyboard tool exists.
- Requires an active session, `type_text` in the session license, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, matching app scope, generated test input, and non-sensitive/test-input classification.
- Records text length and sensitivity classification, not raw text content, in action and audit packets.
- Blocks credential-like, secret-like, private, or non-test input before provider execution.
- Creates the same transition gate as mock typing and requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Does not enable shell, app launch, system changes, external publishing, or broad desktop control.

## Current Session Workflow

Use the session tools to create a bounded task license, record mock observation packets, run mock movement/click/type probes, and inspect the audit trail.

1. Call `desktop_start_interaction_session`.
2. Include a concrete `userGoal`.
3. Set `userConfirmed: true` only when the user has actually granted the task-level license.
4. Set `visibleContentAcknowledged: true` only when the user has acknowledged that future observation tools may capture visible desktop content.
5. Provide allowed scopes, allowed actions, forbidden actions, risk limits, and observation cadence.
   - If `allowedActions` includes `click` or `type_text`, also provide `licensedAppScope`.
   - `licensedAppScope` must declare the reversible app-under-test scope, app-scoped allowed actions, forbidden boundaries, and scope-exit stop conditions.
   - For real Windows observation or movement sessions, use `observationCadence.maxObservationGapMs: 60000` unless the task explicitly requires a tighter freshness bound.
   - A 5s freshness window is often too short for the current real provider because capture, helper startup, visual reasoning, and post-action lookback can consume several seconds before the next action call.
   - Keep the cadence bounded; widening this value is not permission for hidden polling, background capture, or stale action chains.
6. Call `desktop_observe` only after the session is active.
   - If the session has `licensedAppScope`, the first matching observation creates `boundAppScope`.
   - Later matching observations refresh `boundAppScope`.
   - If the active target drifts outside `boundAppScope`, `desktop_observe` returns `status: "scope_exit"`, records an `outside_allowed_scope` stop condition and `escalation_required` audit event, and does not record or return the out-of-scope frame.
7. Keep `mode: "frame_session"` unless a single-frame witness is explicitly enough for the test.
8. Keep `maxFrames` and `durationMs` bounded. The current tool caps requests at 12 frames and 5000 ms.
9. Treat observation output as mock evidence unless `desktop_capabilities.provider.providerKind` is `real`.
10. Call `desktop_move_mouse` only after a fresh observation and pass that observation id as `preActionObservationId`.
11. Treat `desktop_move_mouse` as a probe. It returns an interaction transition gate in `pending_observation` state. If real mouse movement is enabled, the move can affect cursor position and hover state but still must not click or type.
12. After an audited movement observation, call `desktop_evaluate_click_candidate` when a future click is being considered.
13. Treat `desktop_evaluate_click_candidate` as a targeting-quality gate. It checks active session, allowed click action, fresh observation, frame evidence, scope match, cursor/candidate proximity, movement-transition evidence when supplied, and low-risk packet. It records a `click_candidate_evaluated` audit event and never clicks.
14. Call `desktop_click` only after a fresh observation, current `boundAppScope`, app-scoped `click` permission, and no prior transition gate is pending. If the real click gate is enabled, this can perform a real click inside the bound app-under-test.
15. Call `desktop_type_text` only after a fresh observation, current `boundAppScope`, app-scoped `type_text` permission, and no prior transition gate is pending. If the real typing gate is enabled, this can type generated test input inside the bound app-under-test.
16. For `desktop_type_text`, use generated test input only. The tool records text length and classification but not text content.
17. After every movement, click, or typing probe, call `desktop_observe` with `transitionActionId` set to the action id.
18. Do not call another non-observe action until the transition gate returns `audited`.
19. Use `desktop_session_audit_log` to inspect the session trace.
20. Use `desktop_end_interaction_session` when the task license should stop.

The current implementation records session lifecycle, mock observation, mock movement, mock click, mock typing, real observation, opt-in real movement, opt-in app-scoped real click, opt-in app-scoped real generated-input typing, licensed app-scope binding, scope-exit stop conditions, cursor witness, hover-witness uncertainty, cursor-annotated frame metadata, movement-delta audit events, and click-candidate witness evaluations. It can exercise `observe -> move_mouse -> observe transitionActionId -> evaluate_click_candidate -> click/type -> observe transitionActionId` against the real active window when the relevant real provider gates are enabled.

## Stop Or Escalate

Stop or ask the user before continuing if:

- user confirmation is absent,
- visible-content acknowledgement is absent,
- the requested scope is unrelated to the user's task,
- an interaction transition gate is blocked or cannot be audited from the available observation,
- `desktop_observe` returns `status: "scope_exit"` because the active target drifted outside `boundAppScope`,
- the request implies credentials, payments, messages, publishing, destructive operations, shell execution, or system settings,
- `desktop_type_text` input is credential-like, secret-like, private, or not generated test input,
- the user expects real clicking without an enabled real-click provider gate and a bound reversible app-under-test,
- the user expects real typing without an enabled real-typing provider gate and a bound reversible app-under-test,
- the user expects app launch, shell execution, system changes, or broad desktop mutation,
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

Real providers reuse the same transition gate discipline; every movement, click, or typing action must be followed by observation before another non-observe action.

## Next Implementation Target

ADMCP-013A is implemented. It provides a governed manual probe runner for repeated real-provider path-finding:

- run repeated `observe -> move_mouse -> observe` attempts through the existing MCP/session path,
- record cursor positions, relative movement vectors, screenshot paths or frame hashes, transition-gate status, and residue,
- preserve stale-observation policy blocks and wrong-target hover evidence,
- verify `desktop_click` remains blocked without producing a real click when the active provider does not report click support.

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
- keeps real click, typing, shell, app launch, system changes, and durable desktop mutation disabled unless the separate click provider gate is explicitly enabled outside the runner.

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

ADMCP-017 click-candidate witness gate is implemented as targeting-quality evidence, not as a click executor.

- Use `desktop_evaluate_click_candidate` after a fresh observation, preferably the follow-up observation that audited a movement probe.
- A ready result means the current candidate has enough session, scope, frame, cursor, movement, and risk evidence for a future app-scoped click request.
- A ready result does not execute a click by itself. A future `desktop_click` call must still pass session, binding, provider-gate, audit, and post-click observation requirements.
- Failed results are repair input: observe again, move again as a reversible probe, refresh stale evidence, or correct scope.

ADMCP-018 licensed app scope model is implemented at the session-policy layer.

- Sessions that grant `click` or `type_text` must include `licensedAppScope`.
- `licensedAppScope` must declare the app scope, user reversibility, app-scoped allowed actions, forbidden boundaries, and scope-exit stop conditions.
- App scope can use window title, process name, workspace path, observed window identity, local URL, local origin, or provisional active-window scope.
- `click` and `type_text` actions are scoped to the declared app-under-test before provider execution.
- Click-candidate evidence remains useful as targeting-quality evidence, but it is not the main safety gate.
- Real click and real typing require explicit provider gates and bound app scope.

ADMCP-019 scope binding runtime is implemented.

- `desktop_observe` binds declared `licensedAppScope` to concrete observed provider identity and stores it as `boundAppScope`.
- Session summaries include `boundAppScope`.
- Later observations refresh the binding when they still match.
- If focus drifts or the observed active-window identity no longer matches, `desktop_observe` returns `scope_exit`, appends an `outside_allowed_scope` stop condition, appends an `escalation_required` audit event, and does not record the out-of-scope frame.
- App-scoped click/type policy blocks unbound, stale, or mismatched app scope before provider execution.
- Real click and real typing are available only behind separate provider gates.

ADMCP-020 app-scoped real click gate is implemented.

- Enable only with `ADMCP_ENABLE_REAL_CLICK=true` while the Windows real-observation provider is enabled.
- `desktop_capabilities` reports `realDesktopClick: true`, `executeDesktopActions: true`, and `closedLoopClickExecution: false` only when the click provider gate is active.
- `desktop_click` requires active session, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, in-frame target point, app-scoped `click`, audit logging, and post-click observation.
- The provider checks active-window scope before clicking and reports post-click active-window residue for the follow-up observation.
- Real typing requires the separate provider gate; shell, app launch, system changes, external publishing, and broad desktop clicking remain unavailable.

ADMCP-021 app-scoped type text gate is implemented.

- Enable only with `ADMCP_ENABLE_REAL_TYPING=true` while the Windows real-observation provider is enabled.
- `desktop_capabilities` reports `realDesktopTyping: true` and `executeDesktopActions: true` only when the typing provider gate is active.
- `desktop_type_text` requires active session, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, generated/synthetic input classification, audit logging, and post-type observation.
- The provider checks active-window scope before typing and reports post-typing active-window residue for the follow-up observation.
- Credentials, secrets, private data, external publishing, shell, app launch, system changes, and broad desktop control remain blocked or unavailable.

ADMCP-022 post-action observation and repair-loop classification is implemented.

- `desktop_observe` with `transitionActionId` now classifies the action follow-up as `expected_delta`, `no_op`, `wrong_target`, `scope_exit`, `risk_prompt`, `uninterpretable_state`, or `repair_needed`.
- The transition gate includes `postActionClassification` with confidence, disposition, evidence, repair count, repair-limit state, and residue.
- `expected_delta` resets consecutive repair attempts.
- `no_op`, `wrong_target`, and `repair_needed` consume bounded repair budget while allowing the next licensed in-scope repair action until the session limit is reached.
- `scope_exit`, `risk_prompt`, `uninterpretable_state`, or repair-limit exhaustion stops or escalates through audit and stop-condition evidence.
- `desktop_capabilities` reports `postActionRepairClassification: true`.
- ADMCP-022 does not add a UI test runner, OCR, semantic localization, app launching, shell execution, or new desktop mutation authority.

Next unimplemented target: ADMCP-023 Governed UI Test Cycle Runner For Local Apps.

ADMCP-023 should not drift into a default ordered click/type runner. The target is a multi-cycle carrier for real UI testing, especially for Phaser/Vite apps where canvas visuals, animation timing, hover state, and subtle frame deltas can make a one-cycle assertion misleading.

The runner should use the existing MCP tools only and preserve this cycle shape:

```text
test goal -> active cut -> observe -> licensed probe/action -> observe transitionActionId -> classify delta -> carry residue -> continue/repair/ask/close
```

Every action-bearing cycle should produce a `ui_test_cycle` packet with current pressure, active cut, before observation, action id, after observation, post-action classification, residue, next re-entry pressure, and cycle decision. The runner should end with a landfall/re-entry packet that states protected observables, satisfied observables, unsatisfied residue, audit count, stop conditions, closure status, and re-entry notes.

Do not claim scenario success only because a click happened, text was typed, or frame hashes changed. `expected_delta` is evidence to compare against the protected test goal. `no_op`, `wrong_target`, and `repair_needed` must carry residue into the next cycle. `scope_exit`, `risk_prompt`, `uninterpretable_state`, or repair-limit exhaustion must stop or escalate.

ADMCP-023 implementation must start with local runner artifacts:

- `ui_test_scenario_contract`: scenario id, test goal, reversible app-under-test scope, allowed actions, max cycles/actions/time, observation cadence, forbidden boundaries, protected outcome, allowed evidence, and closure policy.
- `ui_test_cycle`: one packet per action-bearing cycle with pressure, active cut, observations, action, transition classification, carrier update, residue, next re-entry pressure, and decision.
- `ui_test_carrier`: run-level state with bound app scope, known controls/candidate targets, protected outcome status, cycle ids, action ids, residue classes, and closure status.
- `closure_gate`: closes only when scope is still bound, no transition gate is pending, protected outcome is satisfied or residualized, residue is visible, and artifacts are replayable.
- `ui_test_landfall`: final artifact explaining whether the run passed, failed, stopped, asked, or landed partially.

Recommended split:

- ADMCP-023A: scenario contract, cycle, carrier, closure, and landfall schemas; no desktop actions.
- ADMCP-023B: mock cycle runner and artifact writer.
- ADMCP-023C: local app manual runner using existing real-provider gates only.
- ADMCP-023D: Phaser/Vite fixture pressure test with pass, no-op, wrong-target, delayed-transition, and scope-exit cases.

Do not add app launch, dev-server management, shell execution, deployment, external publishing, hidden polling, OCR dependency, semantic localization prerequisite, or new desktop mutation authority in ADMCP-023.

## Real Observation Manual Check

Use `../testing/manual_real_observation_checklist.md` before relying on the Windows real-observation spike outside unit tests.
