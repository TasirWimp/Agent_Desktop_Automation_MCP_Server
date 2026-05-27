# Safety Model

## Default Posture

The server is policy-first. A tool that can change desktop state must have a documented contract before implementation and must expose enough audit data for a user or reviewer to understand what happened.

The long-term interaction model is task-scoped licensed autonomy, not confirmation before every micro-action. The user grants a bounded desktop interaction session, the agent acts inside that license, every action leaves an audit trace, and every state-changing action is followed by observation.

## Initial Action Classes

- `observe` - read-only context gathering. Allowed when the intent is concrete.
- `open_application`, `open_url`, `file_operation`, `keyboard_input`, `mouse_input` - desktop state changes. Require user confirmation when proposed outside a confirmed interaction session.
- `shell_command`, `credential_access`, `system_change` - blocked in the initial model.

Inside a future confirmed `desktop_interaction_session`, bounded low-risk actions such as observation, mouse movement, clicking visible controls in the allowed window, and typing generated test input may be licensed by the session instead of requiring repeated per-action confirmation.

## Tool Contract Requirements

Every execution tool must document:

- target shape,
- allowed and blocked inputs,
- user confirmation behavior,
- failure modes,
- audit output,
- tests required before release.

## Current Decision

The server exposes capability reporting, policy classification, and read-only UI intersection planning. It also defines policy contracts for future licensed interaction sessions. It does not execute desktop actions.

`ui_intersection_plan` may prepare a policy-gated candidate packet from semantic localization and frame evidence. It must not move the cursor, click, capture screens, or claim success. Actual `mouse_input` remains a state-changing action that requires either single-action policy confirmation or an active session license, audit logging, scope checks, and post-action observation.

## Session License Direction

The planned session model is documented in `licensed_desktop_interaction_sessions.md`.

Core boundary:

- User confirmation is required before starting a bounded task session.
- Low-risk actions inside the allowed app, window, process, or workspace scope can proceed without repeated user confirmation.
- Boundary crossings require stop or escalation.
- Credential entry, payment, external publishing, destructive operations outside scope, unrelated private windows, and system changes remain blocked or escalated.
- No background capture, hidden polling loop, OCR dependency, or real OS backend is part of the current implementation.
