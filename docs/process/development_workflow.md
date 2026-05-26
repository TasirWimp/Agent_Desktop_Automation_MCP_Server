# Development Workflow

Build in small, testable slices. Desktop automation tools can have high blast radius, so feature planning and test planning are required before execution behavior is added.

## Source Of Truth

Read these documents before feature work:

1. `docs/product/requirements.md`
2. `docs/product/roadmap.md`
3. `docs/architecture/safety_model.md`
4. This file
5. `docs/testing/test_strategy.md`
6. `docs/planning/mvp_implementation_plan.md`

## Required Development Loop

1. Feature planning: define behavior, requirement source, non-goals, expected files, and risks.
2. Test planning: define unit, protocol, integration, and manual checks.
3. Implementation: make the smallest useful change.
4. Test run: execute planned checks and record pass/fail/skipped items.
5. Documentation update: update status, safety, or test docs when the change affects them.
6. Summary: report changed files, behavior delivered, tests run, and residual risk.

## Plan Change Protocol

If implementation reveals a wrong or risky plan:

1. Stop expanding the change.
2. State the discovered issue.
3. Classify it as product requirement, implementation sequence, test strategy, architecture, or safety risk.
4. Update the relevant source document before or in the same commit as code changes.
5. Ask the user before continuing if user-visible behavior or safety posture materially changes.

## Definition Of Done

- Behavior matches a documented requirement or plan.
- Policy-sensitive logic is covered by unit tests.
- `npm run typecheck`, `npm run test`, and `npm run build` pass for source changes.
- Documentation reflects changed behavior, safety posture, or workflow.
- Completion summary reports tests and residual risk.
