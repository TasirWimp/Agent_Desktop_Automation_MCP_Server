# Safety Model

## Default Posture

The server is policy-first. A tool that can change desktop state must have a documented contract before implementation and must expose enough audit data for a user or reviewer to understand what happened.

## Initial Action Classes

- `observe` - read-only context gathering. Allowed when the intent is concrete.
- `open_application`, `open_url`, `file_operation`, `keyboard_input`, `mouse_input` - desktop state changes. Require user confirmation.
- `shell_command`, `credential_access`, `system_change` - blocked in the initial model.

## Tool Contract Requirements

Every execution tool must document:

- target shape,
- allowed and blocked inputs,
- user confirmation behavior,
- failure modes,
- audit output,
- tests required before release.

## Current Decision

The server exposes capability reporting, policy classification, and read-only UI intersection planning. It does not execute desktop actions.

`ui_intersection_plan` may prepare a policy-gated candidate packet from semantic localization and frame evidence. It must not move the cursor, click, capture screens, or claim success. Actual `mouse_input` remains a state-changing action that requires `automation_policy_check`, explicit user confirmation, and post-action verification.
