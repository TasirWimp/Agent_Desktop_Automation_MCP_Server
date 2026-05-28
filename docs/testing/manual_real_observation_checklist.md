# Manual Real Observation Checklist

## Scope

Use this checklist only for the opt-in Windows active-window observation spike.

The manual check must not use real mouse movement, real clicking, real typing, OCR, localization, shell tools, app launching, or OS mutation through this MCP server.

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

## Required Checks

1. Call `desktop_capabilities`.
2. Confirm `provider.providerKind` is `real`.
3. Confirm `realDesktopObservation` is `true`.
4. Confirm `realDesktopMutation`, `desktopMouseKeyboardTools`, and `executeDesktopActions` are `false`.
5. Start a session with `visibleContentAcknowledged: true`.
6. Use an allowed `window_title`, `process_name`, or `active_window` scope that matches the active test window.
7. Call `desktop_observe` with bounded values, such as `mode: "single_frame"`, `maxFrames: 1`, and `durationMs: 0`.
8. Confirm the returned observation includes active-window metadata and one PNG frame artifact.
9. Repeat with a mismatched `window_title` and confirm the tool returns a controlled `scope_mismatch` error and records no observation.
10. Confirm no mouse, click, or typing action is executed by the real observation provider.

## Pass Criteria

- Visible-content acknowledgement is present before real observation.
- Observation is bounded by frame count and duration.
- Active-window identity is available through `windowId` or process/title metadata.
- Mismatched active-window scope fails before recording an observation.
- No hidden polling or background capture continues after the tool returns.
- Real desktop mutation remains unavailable.

## Stop Conditions

Stop immediately if:

- sensitive visible content appears,
- the active window is unrelated to the requested task,
- the provider captures a window outside the requested scope,
- capture continues after the tool returns,
- any real mouse, click, typing, app launch, shell, or OS mutation behavior appears.
