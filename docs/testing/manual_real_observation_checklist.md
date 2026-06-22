# Manual Real Observation, Pointer Movement, App-Scoped Click, And App-Scoped Typing Checklist

## Scope

Use this checklist only for the opt-in Windows active-window observation, pointer-movement, app-scoped click, and app-scoped generated-text typing gates.

The base observation check must not use real mouse movement, real clicking, or real typing. The optional pointer-movement check may move the real cursor only after the movement gate is explicitly enabled and relational evidence is supplied. The optional click check may click only inside a user-declared reversible app-under-test after the real click gate is explicitly enabled and hover-witness evidence is supplied. The optional typing check may type only generated test input inside a user-declared reversible app-under-test after the real typing gate is explicitly enabled. No check may use OCR, localization, shell tools, arbitrary app launching, external publishing, or broad desktop control through this MCP server.

## Setup

1. Open a non-sensitive test window, such as a local demo app or blank test document.
2. Make that window active.
3. Confirm no credentials, private messages, payment screens, unrelated private windows, or sensitive documents are visible.
4. Start the server with:

```powershell
$env:ADMCP_DESKTOP_PROVIDER = "windows-active-window"
$env:ADMCP_ENABLE_REAL_OBSERVATION = "true"
npm run dev
```

For the optional pointer-movement check, also set:

```powershell
$env:ADMCP_ENABLE_REAL_MOUSE_MOVEMENT = "true"
```

For the optional app-scoped click check, also set:

```powershell
$env:ADMCP_ENABLE_REAL_CLICK = "true"
```

For the optional app-scoped typing check, also set:

```powershell
$env:ADMCP_ENABLE_REAL_TYPING = "true"
```

## Required Checks

1. Call `desktop_capabilities`.
2. Confirm `capabilities.firstUseGuide` is `true`, then call `desktop_first_use_guide` or inspect `usageGuidance.firstUseGuide`.
3. Confirm `provider.providerKind` is `real`.
4. Confirm `realDesktopObservation` is `true`.
5. Confirm `realDesktopMouseMovement`, `realDesktopMutation`, `desktopMouseKeyboardTools`, and `executeDesktopActions` are `false` for the observation-only gate.
6. Start a session with `visibleContentAcknowledged: true` and confirm the response includes `nextRequiredStep.tool: "desktop_observe"` with `includeImages: true`.
7. Use an allowed `window_title`, `process_name`, or `active_window` scope that matches the active test window.
8. Call `desktop_observe` with bounded values, such as `mode: "single_frame"`, `maxFrames: 1`, and `durationMs: 0`.
9. Confirm the returned observation includes active-window metadata, active-window-relative cursor position when available, one `visualArtifacts[].path` PNG artifact, and one PNG image content block.
10. Repeat with a mismatched `window_title` and confirm the tool returns a controlled `scope_mismatch` error and records no observation.
11. Confirm no mouse, click, or typing action is executed by the observation-only gate.

## Optional Pointer-Movement Checks

Run these only after the user has granted a bounded session license for pointer movement inside the test window and `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` is set.

1. Call `desktop_capabilities`.
2. Confirm `provider.supportsMouse` and `capabilities.realDesktopMouseMovement` are `true`.
3. Confirm `provider.supportsClick`, `provider.supportsTyping`, `provider.realDesktopMutation`, and `capabilities.executeDesktopActions` are `false`.
4. Start a session whose allowed actions include `observe` and `move_mouse`, but not `click` or `type_text`.
5. Call `desktop_observe` and note the returned observation id, active-window bounds, and cursor position.
6. Call `desktop_submit_perception_digest` for the screenshot-bearing observation, then call `desktop_move_mouse` with a point inside the active-window capture frame, the observation id as `preActionObservationId`, and the returned `perceptionDigestId`.
7. Confirm the result has `executed: true`, `simulated: false`, `requiresPostActionObservation: true`, and a pending transition gate.
8. Call `desktop_observe` with `transitionActionId` set to the movement action id.
9. Confirm the follow-up observation audits the transition gate and that the cursor position has changed as expected.
10. Attempt `desktop_click` and confirm it is blocked before any real click occurs.
11. Attempt an out-of-bounds `desktop_move_mouse` point and confirm it returns a controlled error and does not move the cursor.

## Optional App-Scoped Click Checks

Run these only after the user has granted a bounded session license for clicking inside a local reversible app-under-test and `ADMCP_ENABLE_REAL_CLICK=true` is set.

1. Call `desktop_capabilities`.
2. Confirm `provider.supportsClick`, `capabilities.realDesktopClick`, `provider.realDesktopMutation`, and `capabilities.executeDesktopActions` are `true`.
3. Confirm `capabilities.closedLoopClickExecution` is `false`; ADMCP-022 repair classification is implemented, but ADMCP-023 runner orchestration is not.
4. Start a session whose allowed actions include `observe` and `click`, with `licensedAppScope` set to the reversible app-under-test.
5. Call `desktop_observe` and confirm it records `boundAppScope`.
6. Call `desktop_submit_perception_digest` for the screenshot-bearing observation, then call `desktop_click` with a point inside the active-window capture frame, the observation id as `preActionObservationId`, and the returned `perceptionDigestId`.
7. Confirm the result has `executed: true`, `simulated: false`, `requiresPostActionObservation: true`, and a pending transition gate.
8. Call `desktop_observe` with `transitionActionId` set to the click action id.
9. Confirm the follow-up observation audits the transition gate, includes `postActionClassification`, and that the active window remains inside `boundAppScope`.
10. Attempt a second `desktop_click` before the post-click observation in a separate test session and confirm it is blocked by the pending transition gate.
11. Attempt a click with a stale pre-action observation and confirm it is blocked before provider execution.
12. Attempt a click outside the licensed app scope and confirm it is blocked before provider execution.
13. Confirm shell, arbitrary app launch, command-line launch arguments, system change, external publishing, and broad desktop control remain unavailable.

## Optional App-Scoped Typing Checks

Run these only after the user has granted a bounded session license for typing generated test input inside a local reversible app-under-test and `ADMCP_ENABLE_REAL_TYPING=true` is set.

1. Call `desktop_capabilities`.
2. Confirm `provider.supportsTyping`, `capabilities.realDesktopTyping`, `provider.realDesktopMutation`, and `capabilities.executeDesktopActions` are `true`.
3. Start a session whose allowed actions include `observe` and `type_text`, with `licensedAppScope` set to the reversible app-under-test.
4. Call `desktop_observe` and confirm it records `boundAppScope`.
5. Ensure focus is in a reversible test input field inside the bound app.
6. Call `desktop_submit_perception_digest` for the screenshot-bearing observation, then call `desktop_type_text` with generated test input, `sensitivityClassification: "test_input"`, the observation id as `preActionObservationId`, and the returned `perceptionDigestId`.
7. Confirm the result has `executed: true`, `simulated: false`, `typedTextLength` equal to the generated input length, `requiresPostActionObservation: true`, and a pending transition gate.
8. Confirm the returned action and audit events record text length/classification but not raw text content.
9. Call `desktop_observe` with `transitionActionId` set to the typing action id.
10. Confirm the follow-up observation audits the transition gate, includes `postActionClassification`, and that the active window remains inside `boundAppScope`.
11. Attempt credential-like text such as `password=example` and confirm it is blocked before provider execution and raw text is not stored.
12. Attempt typing outside the licensed app scope and confirm it is blocked before provider execution.
13. Confirm shell, arbitrary app launch, command-line launch arguments, system change, external publishing, and broad desktop control remain unavailable.

## ADMCP-014 Witness Checks

Extend the pointer-movement check with these witness assertions:

1. Confirm the initial observation includes structured cursor witness metadata or explicit residue explaining why cursor evidence is unavailable.
2. Confirm cursor witness metadata states whether the native cursor and high-contrast cursor witness marker were rendered into the returned frame and whether the frame is raw or cursor-annotated.
3. If the cursor is visible and inside the active-window frame, confirm the returned screenshot visibly includes the cursor.
4. If the cursor is not rendered, confirm the result explains why, such as cursor outside frame, cursor hidden, provider API unavailable, or rendering failure.
5. After `desktop_move_mouse`, call `desktop_observe` with `transitionActionId`, submit a perception digest for the follow-up observation, and then submit the transition assessment with that digest id.
6. Confirm the transition audit records the intended movement point, provider movement result, follow-up observed cursor point, and distance/residue.
7. Confirm the audit records whether active-window identity and scope remained stable after movement.
8. Confirm hover, tooltip, cursor-shape, enabled-state, or visual-change evidence is represented only when available; otherwise uncertainty residue must be explicit.
9. Confirm no witness packet claims that a real click is licensed.

## ADMCP-015 Performance Instrumentation Checks

Extend the observation and pointer-movement checks with these diagnostic assertions:

1. Confirm `desktop_observe` returns `observation.providerTiming` when the Windows real provider is active.
2. Confirm `observation.providerTiming.entries` includes active-window metadata lookup, active-window capture, frame-byte decoding, frame artifact construction, and total provider timing residue.
3. When the PowerShell capture script reports substages, confirm entries include screen capture, cursor metadata lookup, cursor rendering, high-contrast witness marker rendering, PNG encoding, and base64 payload construction.
4. Confirm `desktop_move_mouse` returns `providerResult.providerTiming` when the Windows real movement gate is active.
5. Confirm movement timing includes pre-move active-window lookup, cursor-position setting, and post-move active-window lookup.
6. Confirm governed navigation probe output carries observation provider timing summaries so slow provider calls are visible without ad hoc debug scripts.
7. Confirm timing diagnostics do not change policy decisions, transition-gate behavior, or click/type availability.
8. Confirm no real click or real typing occurs unless the separate app-scoped provider gate is explicitly enabled for that action; shell, arbitrary app launch, command-line launch arguments, system change, hidden polling, background capture, and broad desktop control must remain unavailable.

## ADMCP-016 Persistent Helper Checks

Extend the real Windows observation checks with these helper-specific assertions:

1. Confirm Windows real-provider capabilities report the persistent helper path by default.
2. Confirm the per-call PowerShell fallback remains selectable for diagnostics.
3. Run two bounded `desktop_observe` calls inside one session and compare `observation.providerTiming.totalDurationMs`.
4. Confirm the second observation is materially faster than the cold helper path when the active window remains stable.
5. Treat cold-start latency as residue; the helper optimization target is repeated observation during governed navigation, not guaranteed instant first capture.
6. Confirm provider cleanup runs after manual probe runners exit.
7. Confirm helper failures return controlled provider errors and do not leave hidden capture, polling, or control loops running.
8. Confirm no real click or real typing occurs unless the separate app-scoped provider gate is explicitly enabled for that action; shell, arbitrary app launch, command-line launch arguments, system change, OCR, accessibility interpretation, background capture, and broad desktop control must remain unavailable.

## Manual Probe Runner Checks

ADMCP-013A is implemented. Use the runner for repeated path-finding checks instead of ad hoc scripts:

```powershell
npm run manual:probe:example
npm run manual:probe -- .\tmp\manual-probes\file-menu.json
```

1. Confirm the runner starts a bounded session with explicit visible-content acknowledgement.
2. Confirm the runner uses a `maxDurationMs` session budget of `3600000` by default unless the config intentionally overrides it, with `maxObservationGapMs: 180000` and tiered evidence freshness defaults.
3. Confirm it records every observation id, movement action id, transition-gate status, cursor point, and movement vector.
4. Confirm it preserves policy blocks, especially stale pre-action observation blocks, instead of hiding them.
5. Confirm it records wrong-target hover evidence as residue.
6. Confirm it can verify `desktop_click` blocking without producing a real click.
7. Confirm it writes only bounded local artifacts needed for review, such as screenshot paths, frame hashes, compact JSON summaries, and audit ids.

## Navigation Probe Runner Checks

ADMCP-013B is implemented. Use the faster navigation runner for pressure tests that already have a compact sequence of reversible hover or movement probes:

```powershell
npm run manual:navigation-probe:example
npm run manual:navigation-probe -- .\tmp\navigation-probes\example.json
```

1. Confirm the runner starts one bounded session for the full navigation path.
2. Confirm the runner uses a `maxDurationMs` session budget of `3600000` by default unless the config intentionally overrides it, with `maxObservationGapMs: 180000` and tiered evidence freshness defaults.
3. Confirm the initial observation is reused as the first pre-action witness.
4. Confirm each post-movement observation is recorded with `transitionActionId`.
5. Confirm each post-movement observation is carried forward as the next pre-action witness instead of recording a redundant pre-observation.
6. Confirm the result records timing diagnostics for capabilities, session start, each observation, each movement, audit-log read, and session end.
7. Confirm the output includes enough frame hashes or screenshot paths to compare before/after states.
8. Confirm the runner still requires `userConfirmed: true`, `visibleContentAcknowledged: true`, and `allowRealMouseMovement: true` before using a real mouse-movement provider.
9. Confirm no real click or real typing occurs unless the separate app-scoped provider gate is explicitly enabled for that action; shell, arbitrary app launch, command-line launch arguments, system change, and broad desktop control must remain unavailable.

## Pass Criteria

- Visible-content acknowledgement is present before real observation.
- Observation is bounded by frame count and duration.
- Active-window identity is available through `windowId` or process/title metadata.
- Cursor position is available in active-window frame coordinates when the provider can read it.
- Mismatched active-window scope fails before recording an observation.
- Optional real movement remains inside the active-window capture frame and requires post-movement observation plus semantic landing assessment.
- No hidden polling or background capture continues after the tool returns.
- Real clicking remains unavailable unless the app-scoped click gate is explicitly enabled and bound to a reversible app-under-test.
- Real typing remains unavailable unless the app-scoped typing gate is explicitly enabled and bound to a reversible app-under-test.
- Shell, arbitrary app launch, command-line launch arguments, system changes, external publishing, and broad desktop control remain unavailable.

## Stop Conditions

Stop immediately if:

- sensitive visible content appears,
- the active window is unrelated to the requested task,
- the provider captures a window outside the requested scope,
- capture continues after the tool returns,
- pointer movement leaves the intended active-window scope,
- any real click occurs outside the explicitly enabled app-scoped click gate,
- any real typing occurs outside the explicitly enabled app-scoped typing gate,
- any arbitrary app launch, command-line launch argument handling, shell, system change, external publishing, or broad desktop-control behavior appears.
