# Codex Desktop Interaction Re-Entry

## Current Tool State

Available MCP tools:

- `desktop_capabilities`
- `desktop_first_use_guide`
- `automation_policy_check`
- `ui_intersection_plan`
- `desktop_start_interaction_session`
- `desktop_open_application`
- `desktop_observe`
- `desktop_submit_interaction_evidence`
- `desktop_submit_perception_digest`
- `desktop_move_mouse`
- `desktop_submit_transition_assessment`
- `desktop_evaluate_click_candidate`
- `desktop_click`
- `desktop_type_text`
- `desktop_end_interaction_session`
- `desktop_session_audit_log`

Default server behavior is mock-only. By default, no tool captures the real desktop, moves the real mouse, clicks the real desktop, types into the real desktop, launches real apps, or controls the OS. `desktop_observe`, `desktop_move_mouse`, `desktop_click`, `desktop_type_text`, and `desktop_open_application` are backed by deterministic mock/simulated provider behavior unless the server is started with the relevant Windows real provider gates enabled.

First-time clients should call `desktop_first_use_guide` before starting a session, or read the same guide from `desktop_capabilities.usageGuidance.firstUseGuide`. The guide is also summarized by `desktop_start_interaction_session.nextRequiredStep`, which points to `desktop_observe({ includeImages: true })`. The client must inspect `visualArtifacts[].path` or the returned MCP image content block before calling `desktop_submit_interaction_evidence` or the strict digest/workflow tools; the server does not analyze screenshots.

The operating split is CRPM-compatible but uses local protocol names: Codex is the current witness interpreter and workflow claimant; the server is the path, scope, freshness, transition, residue, and re-entry carrier. Do not ask the server to infer visual truth, and do not let hidden model memory replace the latest screenshot-bearing witness.

Catalog app bootstrap:

- `desktop_open_application` accepts only application IDs or exact aliases from `config/desktop_applications.json`.
- It requires `userConfirmed: true`.
- It does not accept executable paths, command-line arguments, shell commands, dev-server commands, or arbitrary launch strings.
- Mock provider launch is simulated. Real provider launch requires explicit provider support and `ADMCP_ENABLE_REAL_APP_LAUNCH=true`.

Real observation spike:

- Opt-in only with `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true`.
- Captures bounded visible active-window PNG frames through `desktop_observe`.
- Reports cursor position in active-window frame coordinates when available.
- Requires an active session, visible-content acknowledgement, allowed observation scope, and bounded frame/duration inputs.
- Does not enable real clicking, real typing, OCR, localization, hidden polling, background capture, app launching, shell tools, or durable OS mutation.

Real mouse movement probe:

- Additional opt-in only with `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` while the Windows real-observation provider is enabled.
- Uses `desktop_move_mouse`; no separate raw pointer tool exists.
- Requires an active session, `move_mouse` in the session license, fresh pre-action observation, fresh perception digest, matching active-window scope, and a point inside the active-window capture frame.
- Requires compact or full relational navigation evidence. `relational_estimate` and `relative_probe` are allowed as movement endpoints; `external_coordinate` and `unknown` are blocked.
- Treats the point as active-window frame coordinates and converts it to screen coordinates inside the provider.
- Creates the same transition gate as mock movement and requires `desktop_observe` with `transitionActionId`, followed by `desktop_submit_transition_assessment`, before any next non-observe action.
- Treats cursor landing as backend telemetry only; cursor movement alone does not prove the semantic target was correct.
- Does not enable real click, typing, shell, app launch, system changes, or durable desktop mutation.

Real click gate:

- Additional opt-in only with `ADMCP_ENABLE_REAL_CLICK=true` while the Windows real-observation provider is enabled.
- Uses `desktop_click`; no separate raw click tool exists.
- Requires an active session, `click` in the session license, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, fresh perception digest, matching app scope, `hover_witness` point provenance, a stored hover target witness, and a point inside the active-window capture frame.
- Treats the point as active-window frame coordinates and converts it to screen coordinates inside the provider.
- Creates the same transition gate as mock clicking and requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Does not enable real typing, shell, app launch, system changes, external publishing, or broad desktop control.

Real typing gate:

- Additional opt-in only with `ADMCP_ENABLE_REAL_TYPING=true` while the Windows real-observation provider is enabled.
- Uses `desktop_type_text`; no separate raw keyboard tool exists.
- Requires an active session, `type_text` in the session license, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, fresh perception digest, matching app scope, generated test input, and non-sensitive/test-input classification.
- Records text length and sensitivity classification, not raw text content, in action and audit packets.
- Blocks credential-like, secret-like, private, or non-test input before provider execution.
- Creates the same transition gate as mock typing and requires `desktop_observe` with `transitionActionId` before any next non-observe action.
- Does not enable shell, app launch, system changes, external publishing, or broad desktop control.

## Current Session Workflow

Use the session tools to create a bounded task license, record mock observation packets, run mock movement/click/type probes, and inspect the audit trail.

1. Call `desktop_first_use_guide` or read `desktop_capabilities.usageGuidance.firstUseGuide`.
2. Call `desktop_start_interaction_session`.
3. Include a concrete `userGoal`.
4. Set `userConfirmed: true` only when the user has actually granted the task-level license.
5. Set `visibleContentAcknowledged: true` only when the user has acknowledged that future observation tools may capture visible desktop content.
6. Provide allowed scopes, allowed actions, forbidden actions, risk limits, and observation cadence.
   - If `allowedActions` includes `click` or `type_text`, also provide `licensedAppScope`.
   - `licensedAppScope` must declare the reversible app-under-test scope, app-scoped allowed actions, forbidden boundaries, and scope-exit stop conditions.
   - For real Windows observation or movement sessions, prefer `riskLimits.maxDurationMs: 3600000`, `observationCadence.maxObservationGapMs: 180000`, and explicit `observationCadence.evidenceFreshness` tiers: `preActionObservationMaxAgeMs: 180000`, `clickCandidateObservationMaxAgeMs: 180000`, `perceptionDigestMaxAgeMs: 300000`, `workflowStateClaimMaxAgeMs: 300000`, `appScopeBindingMaxAgeMs: 300000`, and `hoverWitnessMaxAgeMs: 300000`.
   - A single 5s or 60s freshness window is often too short for the current real provider because capture, helper startup, visual reasoning, workflow-state review, and post-action lookback can consume several seconds before the next action call.
   - Keep the cadence bounded; widening these values is not permission for hidden polling, background capture, stale digests, stale workflow claims, or blind action chains.
7. Call `desktop_observe` only after the session is active, using the returned `nextRequiredStep` as the default first observation call.
   - If the session has `licensedAppScope`, the first matching observation creates `boundAppScope`.
   - Later matching observations refresh `boundAppScope`.
   - If the active target drifts outside `boundAppScope`, `desktop_observe` returns `status: "scope_exit"`, records an `outside_allowed_scope` stop condition and `escalation_required` audit event, and does not record or return the out-of-scope frame.
8. Keep `mode: "frame_session"` unless a single-frame witness is explicitly enough for the test.
9. Keep `maxFrames` and `durationMs` bounded. The current tool caps requests at 12 frames and 5000 ms.
10. Treat observation output as mock evidence unless `desktop_capabilities.provider.providerKind` is `real`.
11. After any screenshot-bearing observation that will support an action or assessment, inspect `visualArtifacts[].path` or the returned MCP image content block and call `desktop_submit_interaction_evidence`.
    - The helper records the same agent-authored perception digest as the strict tool path; the server does not analyze the screenshot.
    - Use `evidenceMode: "new_target"` when switching to a freshly inspected target, `same_target` when refreshing the same target after hover/move, and `repair_target` for repair/probe navigation.
    - The digest must be for the latest observation. A newer `desktop_observe` invalidates previous digests for future actions.
    - Include `workflow` when preparing click/type readiness; include `transitionAssessment` after movement; include `clickCandidate` when a click witness should be evaluated.
12. Call `desktop_move_mouse` only after a screenshot-bearing fresh observation and fresh `perceptionDigestId`, and pass the observation id as `preActionObservationId`.
13. Include `compactRelationalClaim` unless using the full `relationalNavigation` debug packet. The compact claim must name the source observation, intended target, scene, anchor, relation, candidate, rejected alternative, expected evidence, contradiction, and point provenance.
14. Treat `desktop_move_mouse` as a probe. It returns an interaction transition gate in `pending_observation` state. If real mouse movement is enabled, the move can affect cursor position and hover state but still must not click or type.
15. After movement, call `desktop_observe` with `transitionActionId`. This records cursor/backend telemetry and leaves semantic movement status awaiting assessment.
16. Submit follow-up evidence with `desktop_submit_interaction_evidence`, including `transitionAssessment`. Use `supported` only when the follow-up digest and screenshot support the stored relation, candidate, rejected alternative, and expected-evidence claim with no contradiction.
17. Include `clickCandidate` in the same helper call when a future click is being considered. The helper returns `hoverTargetWitnessId` only when the current evidence is click-ready.
18. Strict/debug clients may instead call `desktop_submit_perception_digest`, `desktop_submit_workflow_state_claim`, `desktop_submit_transition_assessment`, and `desktop_evaluate_click_candidate` separately.
19. Click-candidate readiness checks active session, allowed click action, fresh observation, fresh perception digest, workflow-state readiness, frame evidence, scope match, cursor/candidate proximity, supported semantic landing assessment, no contradiction, and low-risk packet. It can reuse an older workflow-state claim only when the latest digest/scope/target revalidate it and only observations or audited non-contradicted mouse movements occurred since the claim. It records a `click_candidate_evaluated` audit event, returns a hover target witness when ready, and never clicks.
20. Call `desktop_click` only after a fresh observation, current perception digest, current `boundAppScope`, app-scoped `click` permission, `compactRelationalClaim.pointProvenance: "hover_witness"`, matching `hoverTargetWitnessId`, and no prior transition gate is pending. If the real click gate is enabled, this can perform a real click inside the bound app-under-test.
21. Call `desktop_type_text` only after a fresh observation, current perception digest, current `boundAppScope`, app-scoped `type_text` permission, relational evidence, and no prior transition gate is pending. If the real typing gate is enabled, this can type generated test input inside the bound app-under-test.
22. For `desktop_type_text`, use generated test input only. The tool records text length and classification but not text content.
23. After every click or typing probe, call `desktop_observe` with `transitionActionId` set to the action id.
24. Do not call another non-observe action until the transition gate is complete or a supported semantic landing assessment has made the next probe/click path ready.
25. Use `desktop_session_audit_log` to inspect the session trace.
26. Use `desktop_end_interaction_session` when the task license should stop.

The current implementation records session lifecycle, mock observation, compact interaction evidence, perception digests, workflow-state claims, mock movement, mock click, mock typing, catalog app bootstrap, real observation, opt-in real movement, opt-in app-scoped real click, opt-in app-scoped real generated-input typing, licensed app-scope binding, scope-exit stop conditions, cursor witness, hover-witness uncertainty, cursor-annotated frame metadata, movement telemetry, semantic landing assessments, click-candidate witness evaluations, tiered evidence freshness, hover-witness revalidation, and bounded workflow-claim revalidation. It can exercise `observe -> inspect visual artifact -> submit_interaction_evidence -> compact relational move -> observe transitionActionId -> submit_interaction_evidence with transition/candidate evidence -> click/type with returned digest/workflow/witness -> observe transitionActionId` against the real active window when the relevant real provider gates are enabled.

## Stop Or Escalate

Stop or ask the user before continuing if:

- user confirmation is absent,
- visible-content acknowledgement is absent,
- the requested scope is unrelated to the user's task,
- an interaction transition gate is blocked or cannot be audited from the available observation,
- a movement transition has only cursor telemetry and lacks semantic landing assessment,
- `desktop_observe` returns `status: "scope_exit"` because the active target drifted outside `boundAppScope`,
- the request implies credentials, payments, messages, publishing, destructive operations, shell execution, or system settings,
- `desktop_type_text` input is credential-like, secret-like, private, or not generated test input,
- the user expects real clicking without an enabled real-click provider gate and a bound reversible app-under-test,
- the user expects real typing without an enabled real-typing provider gate and a bound reversible app-under-test,
- the user expects arbitrary app launch, shell execution, command-line arguments, system changes, or broad desktop mutation,
- real observation is enabled but the active window does not match the requested scope.

## Current Mock Loop

Executable mock sequence:

1. Start a licensed session.
2. Observe the scoped app/window with mock bounded frame evidence.
3. Move as a mock probe only after fresh observation.
4. Observe with `transitionActionId` to record movement telemetry.
5. Submit interaction evidence for the follow-up observation, including semantic landing assessment and optional click-candidate evaluation.
6. Retain the returned hover target witness when ready.
7. Click or type as a mock probe only after the required relational/semantic gate is satisfied.
8. Observe with `transitionActionId` to audit the click or typing transition.
9. Inspect audit logs and stop the session.

Real providers reuse the same transition gate discipline; every movement, click, or typing action must be followed by observation, and movement must also receive semantic landing assessment before click-candidate readiness.

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

- Prefer `desktop_submit_interaction_evidence` with `clickCandidate` after a fresh observation and supported semantic landing assessment for the movement probe. Strict/debug clients may call `desktop_evaluate_click_candidate` directly.
- A ready result means the current candidate has enough session, scope, frame, cursor, semantic landing, hover witness, workflow, and risk evidence for a future app-scoped click request. An older movement witness or workflow claim may be reused only when the latest digest/workflow/cursor evidence revalidates the same target point and only observation/move-only evidence intervened.
- A ready result does not execute a click by itself. A future `desktop_click` call must still pass session, binding, provider-gate, hover target witness, audit, and post-click observation requirements.
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
- `desktop_click` requires active session, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, relational `hover_witness` provenance, stored hover target witness, in-frame target point, app-scoped `click`, audit logging, and post-click observation.
- The provider checks active-window scope before clicking and reports post-click active-window residue for the follow-up observation.
- Real typing requires the separate provider gate; shell, app launch, system changes, external publishing, and broad desktop clicking remain unavailable.

ADMCP-021 app-scoped type text gate is implemented.

- Enable only with `ADMCP_ENABLE_REAL_TYPING=true` while the Windows real-observation provider is enabled.
- `desktop_capabilities` reports `realDesktopTyping: true` and `executeDesktopActions: true` only when the typing provider gate is active.
- `desktop_type_text` requires active session, reversible `licensedAppScope`, current `boundAppScope`, fresh pre-action observation, relational evidence, generated/synthetic input classification, audit logging, and post-type observation.
- The provider checks active-window scope before typing and reports post-typing active-window residue for the follow-up observation.
- Credentials, secrets, private data, external publishing, shell, app launch, system changes, and broad desktop control remain blocked or unavailable.

ADMCP-022 post-action observation and repair-loop classification is implemented.

- `desktop_observe` with `transitionActionId` now classifies the action follow-up as `expected_delta`, `no_op`, `wrong_target`, `scope_exit`, `risk_prompt`, `uninterpretable_state`, or `repair_needed`.
- The transition gate includes `postActionClassification` with confidence, disposition, evidence, repair count, repair-limit state, and residue.
- `expected_delta` resets consecutive repair attempts.
- `no_op`, `wrong_target`, and `repair_needed` consume bounded repair budget while allowing the next licensed in-scope repair action until the session limit is reached.
- `scope_exit`, `risk_prompt`, `uninterpretable_state`, or repair-limit exhaustion stops or escalates through audit and stop-condition evidence.
- `desktop_capabilities` reports `postActionRepairClassification: true`.
- ADMCP-022 does not add a UI test runner, OCR, semantic localization, shell execution, or new desktop mutation authority.

ADMCP-024 compact relational navigation enforcement and app catalog bootstrap is implemented.

- `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` require compact or full relational navigation evidence before provider execution.
- `desktop_submit_interaction_evidence` is the preferred compact evidence path before state-changing actions, transition assessment, and click-candidate readiness; strict/debug clients may call `desktop_submit_perception_digest` and related tools separately.
- Perception digests are client-authored current-claim packets; the server validates observation freshness, latest-observation binding, target/scope match, frame hashes, and contradiction state, not screenshot pixels.
- Compact claims are server-expanded and bound to screenshot-bearing live observations and frame hashes.
- Raw coordinates are endpoints only; cursor landing is backend telemetry and cannot prove semantic target correctness.
- `desktop_submit_interaction_evidence` can record supported, contradicted, or inconclusive semantic landing outcomes and can run click-candidate evaluation without desktop mutation.
- `desktop_evaluate_click_candidate` remains available as the strict/debug witness gate and requires supported semantic landing with no contradiction before recording a hover target witness.
- `desktop_open_application` is catalog-only through `config/desktop_applications.json`; unknown apps, path-like queries, and command-line argument fields are rejected or blocked.

Next unimplemented target: ADMCP-023 Governed UI Test Cycle Runner For Local Apps.

ADMCP-023 should not drift into a default ordered click/type runner. The target is a multi-cycle carrier for real UI testing, especially for Phaser/Vite apps where canvas visuals, animation timing, hover state, and subtle frame deltas can make a one-cycle assertion misleading.

The runner should use the existing MCP tools only and preserve this cycle shape:

```text
test goal -> active cut -> observe -> licensed probe/action -> observe transitionActionId -> semantic assessment/classify delta -> carry residue -> continue/repair/ask/close
```

Every runner cycle should produce a `ui_test_cycle` packet. Observation-only cycles may omit action and transition-classification fields. Probe-action cycles such as `desktop_evaluate_click_candidate` require current observation evidence but no transition gate. State-changing cycles must include before observation, action id, after observation through `transitionActionId`, and transition classification. The runner should end with a landfall/re-entry packet that states protected observables, satisfied observables, unsatisfied residue, audit count, stop conditions, closure status, and re-entry notes.

Do not claim scenario success only because a click happened, text was typed, or frame hashes changed. `expected_delta` is evidence to compare against the protected test goal. `frame_hash_delta` is weak by default: it can support "something changed" but cannot satisfy a protected visual outcome unless the scenario contract explicitly declares that hash, visual region, or cue sufficient. `no_op`, `wrong_target`, and `repair_needed` must carry residue into the next cycle. `scope_exit`, `risk_prompt`, `uninterpretable_state`, or repair-limit exhaustion must stop or escalate.

ADMCP-023 implementation must start with local runner artifacts:

- `ui_test_scenario_contract`: scenario id, test goal, session-license fields (`user_confirmed`, `visible_content_acknowledged`, `reversible_app_under_test_declared`), reversible app-under-test scope, allowed probes (`observe`, `evaluate_click_candidate`), allowed actions (`move_mouse`, `click`, `type_text`), max cycles/actions/time, observation cadence, forbidden boundaries, structured protected outcomes with acceptable evidence, evidence strength, and closure policy.
- `ui_test_cycle`: one packet per runner cycle with `cycle_kind: observation_only | probe_action | state_changing_action`, pressure, active cut, observations, probe/action data, transition classification when applicable, carrier update, residue, next re-entry pressure, and decision.
- `ui_test_carrier`: run-level state with bound app scope, known controls/candidate targets, protected outcome status, cycle ids, action ids, residue classes, and closure status.
- `closure_gate`: separates `passed_allowed_if` from `partial_landfall_allowed_if`. Passing requires protected outcome satisfied and no target-relevant residue. Partial landfall may residualize the protected outcome only when residue is visible and no same-license probe can reduce it.
- `ui_test_landfall`: final artifact explaining whether the run passed, failed, stopped, asked, or landed partially.
- `cycle_kind_matrix`: maps `desktop_observe` to `observation_only`, `desktop_evaluate_click_candidate` to `probe_action`, and `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` to transition-bearing `state_changing_action`.

Recommended split:

- ADMCP-023A: scenario contract, cycle, carrier, closure, and landfall schemas; no desktop actions and no runner orchestration.
- ADMCP-023B: mock cycle runner and artifact writer.
- ADMCP-023C: local app manual runner using existing real-provider gates only.
- ADMCP-023D: Phaser/Vite fixture pressure test with pass, no-op, wrong-target, delayed-transition, and scope-exit cases.

Do not add dev-server management, shell execution, deployment, external publishing, hidden polling, OCR dependency, semantic localization prerequisite, arbitrary app launch, or new desktop mutation authority in ADMCP-023.

Next safe code step: implement ADMCP-023A only.

## Real Observation Manual Check

Use `../testing/manual_real_observation_checklist.md` before relying on the Windows real-observation spike outside unit tests.
