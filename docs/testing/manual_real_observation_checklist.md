# Manual Real Observation And Pointer Movement Checklist

## Scope

Use this checklist only for the opt-in Windows active-window observation and pointer-movement gates.

The base observation check must not use real mouse movement. The optional pointer-movement check may move the real cursor only after the movement gate is explicitly enabled. Neither check may use real clicking, real typing, OCR, localization, shell tools, app launching, or durable OS mutation through this MCP server.

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

## Required Checks

1. Call `desktop_capabilities`.
2. Confirm `provider.providerKind` is `real`.
3. Confirm `realDesktopObservation` is `true`.
4. Confirm `realDesktopMouseMovement`, `realDesktopMutation`, `desktopMouseKeyboardTools`, and `executeDesktopActions` are `false` for the observation-only gate.
5. Start a session with `visibleContentAcknowledged: true`.
6. Use an allowed `window_title`, `process_name`, or `active_window` scope that matches the active test window.
7. Call `desktop_observe` with bounded values, such as `mode: "single_frame"`, `maxFrames: 1`, and `durationMs: 0`.
8. Confirm the returned observation includes active-window metadata, active-window-relative cursor position when available, and one PNG frame artifact.
9. Repeat with a mismatched `window_title` and confirm the tool returns a controlled `scope_mismatch` error and records no observation.
10. Confirm no mouse, click, or typing action is executed by the observation-only gate.

## Optional Pointer-Movement Checks

Run these only after the user has granted a bounded session license for pointer movement inside the test window and `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true` is set.

1. Call `desktop_capabilities`.
2. Confirm `provider.supportsMouse` and `capabilities.realDesktopMouseMovement` are `true`.
3. Confirm `provider.supportsClick`, `provider.supportsTyping`, `provider.realDesktopMutation`, and `capabilities.executeDesktopActions` are `false`.
4. Start a session whose allowed actions include `observe` and `move_mouse`, but not `click` or `type_text`.
5. Call `desktop_observe` and note the returned observation id, active-window bounds, and cursor position.
6. Call `desktop_move_mouse` with a point inside the active-window capture frame and the observation id as `preActionObservationId`.
7. Confirm the result has `executed: true`, `simulated: false`, `requiresPostActionObservation: true`, and a pending transition gate.
8. Call `desktop_observe` with `transitionActionId` set to the movement action id.
9. Confirm the follow-up observation audits the transition gate and that the cursor position has changed as expected.
10. Attempt `desktop_click` and confirm it is blocked before any real click occurs.
11. Attempt an out-of-bounds `desktop_move_mouse` point and confirm it returns a controlled error and does not move the cursor.

## ADMCP-014 Witness Checks

When ADMCP-014 is implemented, extend the pointer-movement check with these witness assertions:

1. Confirm the initial observation includes structured cursor witness metadata or explicit residue explaining why cursor evidence is unavailable.
2. After `desktop_move_mouse`, call `desktop_observe` with `transitionActionId`.
3. Confirm the transition audit records the intended movement point, provider movement result, follow-up observed cursor point, and distance/residue.
4. Confirm the audit records whether active-window identity and scope remained stable after movement.
5. Confirm hover, tooltip, cursor-shape, enabled-state, or visual-change evidence is represented only when available; otherwise uncertainty residue must be explicit.
6. Confirm no witness packet claims that a real click is licensed.

## Manual Probe Runner Checks

When ADMCP-013A is implemented, use the runner for repeated path-finding checks instead of ad hoc scripts:

1. Confirm the runner starts a bounded session with explicit visible-content acknowledgement.
2. Confirm it records every observation id, movement action id, transition-gate status, cursor point, and movement vector.
3. Confirm it preserves policy blocks, especially stale pre-action observation blocks, instead of hiding them.
4. Confirm it records wrong-target hover evidence as residue.
5. Confirm it can verify `desktop_click` blocking without producing a real click.
6. Confirm it writes only bounded local artifacts needed for review, such as screenshot paths, frame hashes, compact JSON summaries, and audit ids.

## Pass Criteria

- Visible-content acknowledgement is present before real observation.
- Observation is bounded by frame count and duration.
- Active-window identity is available through `windowId` or process/title metadata.
- Cursor position is available in active-window frame coordinates when the provider can read it.
- Mismatched active-window scope fails before recording an observation.
- Optional real movement remains inside the active-window capture frame and requires post-movement observation.
- No hidden polling or background capture continues after the tool returns.
- Real clicking, typing, shell, app launch, system changes, and durable desktop mutation remain unavailable.

## Stop Conditions

Stop immediately if:

- sensitive visible content appears,
- the active window is unrelated to the requested task,
- the provider captures a window outside the requested scope,
- capture continues after the tool returns,
- pointer movement leaves the intended active-window scope,
- any real click, typing, app launch, shell, system change, or durable OS mutation behavior appears.
