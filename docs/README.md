# Documentation Guide

Use the most specific existing document before creating a new one.

- `product/` - product scope, requirements, roadmap, and user-visible behavior.
- `process/` - development workflow and agent coordination rules.
- `planning/` - implementation plans, feature slices, and delivery status.
- `testing/` - test strategy, verification requirements, and missing automation.
- `architecture/` - MCP structure, safety model, tool contracts, and technical decisions.

Do not create near-duplicate notes for small refinements. Extend the existing source of truth and keep links discoverable.

Key architecture documents:

- `architecture/safety_model.md` - current action classes, blocked risks, and confirmation posture.
- `architecture/licensed_desktop_interaction_sessions.md` - planned task-scoped desktop agency model for bounded observe-act-observe loops.
