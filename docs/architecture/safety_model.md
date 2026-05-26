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

The initial server exposes only capability reporting and policy classification. It does not execute desktop actions.
