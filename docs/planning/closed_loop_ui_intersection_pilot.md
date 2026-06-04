# Closed-Loop UI Intersection Pilot

## Boundary

Central rule:

semantic envelope before movement;
intersection witness before click;
session license before mouse input;
post-action verification before success claim.

Core design statement:

The LLM finds the basin.
The frame stream earns the click.
The policy model gates the action.
The post-action verifier earns the success claim.

## Problem

Single-shot LLM coordinate clicking is unsafe and unstable. A model can identify a likely button, field, or icon from pixels, but it does not automatically know the exact clickable coordinate, current display scale, window offset, overlay state, cursor shape, hover behavior, or whether a post-click state transition actually happened.

Treating an LLM coordinate as an execution target collapses too many claims into one step:

- semantic identification,
- coordinate transform,
- target hit-testing,
- action authorization,
- state-change success.

Those claims need separate witnesses.

## Safe Use Of Semantic Localization

Semantic localization is still useful as a coarse search basin. It can name the target, describe visual cues, and propose a candidate envelope. That licenses approach planning only. It does not license a click.

A semantic packet should preserve ambiguity rather than hide it. Useful residue includes similar labels nearby, uncertain icon meaning, possible overlay interference, and missing accessibility metadata.

## Pointer Movement As A Probe

Mouse movement should be treated as a reversible probe, not as action success. The current Windows provider can move the real cursor only when explicitly enabled, and that movement may approach a semantic envelope so frame feedback can test whether the pointer appears to intersect the intended target.

The movement tool remains governed by session licensing, target validation, scope checks, failure modes, audit output, and tests. It does not license click or typing.

A movement probe must be followed by observation before the next non-observe action. The post-movement frame delta is the evidence used to decide whether to move again, click, or repair.

The first real path-finding try supports this model. Relative movement from the observed cursor toward the `File` menu produced useful intermediate evidence: a wrong-target `Search` hover showed the cursor had intersected the wrong UI element, and a later `File` hover showed target intersection. The latter is useful witness evidence, but it is still not a real-click license.

## Intersection And Hover Witness

Frame-stream evidence can create an intersection or hover witness when several signals agree:

- cursor position or cursor bounding box is visible,
- pointer-target distance is small,
- cursor or target envelope overlap is high,
- hover delta is stable across frames,
- cursor shape change supports interactivity,
- local stability persists for enough frames.

The witness licenses only a candidate click packet. It does not execute the click and it does not bypass policy.

## Policy Gate

Actual `mouse_input` remains a desktop state change. Outside a licensed session it must still pass `automation_policy_check` and require explicit user confirmation. Inside a future licensed session it may proceed only when the action stays inside session scope, has current visual evidence, is low risk and recoverable, leaves an audit trace, and requires post-action observation. A planning packet can say "candidate click is policy-ready"; it cannot perform the click.

The current server exposes opt-in real observation, opt-in real mouse movement as a non-durable pointer probe, an opt-in app-scoped real-click gate, and an opt-in app-scoped generated-text typing gate. This pilot still does not execute clicks by itself; any real click must go through `desktop_click` inside a bound licensed app-under-test session and must be followed by observation. Any real typing must go through `desktop_type_text` with generated test input inside a bound licensed app-under-test session and must be followed by observation.

## Post-Action Verification

A click result is not successful just because a click was sent. Future execution must require a post-action verifier that checks the expected state transition, such as a new dialog, selected item, changed URL, or visible confirmation.

Without verification, the outcome is unknown and must be reported as residue.

## Failure And Residue

Failure should produce diagnostic packets instead of blind retries. Residue should capture:

- uncertain visual envelope,
- clickable-region uncertainty,
- coordinate transform uncertainty,
- pointer intersection uncertainty,
- hover-state uncertainty,
- scale or DPI uncertainty,
- occlusion or overlay risk,
- text or icon ambiguity,
- accessibility metadata gaps,
- post-click verification gaps,
- repair path.

Retries are future workflow behavior, not part of this first planning layer.

## First Implementation Slice

This pilot adds pure data contracts and evaluator functions for UI intersection planning. It may expose a read-only MCP planning tool that returns candidate and residue packets.

It intentionally does not add:

- screen capture,
- OCR,
- Windows UI Automation,
- shell commands,
- cursor movement,
- mouse clicking,
- autonomous loops.

The later interaction-session architecture is documented in `../architecture/licensed_desktop_interaction_sessions.md`.
