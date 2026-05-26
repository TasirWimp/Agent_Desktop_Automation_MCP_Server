# Test Strategy

## Current Test State

The repository uses:

- TypeScript compiler checks through `npm run typecheck`,
- Vitest unit tests through `npm run test`,
- production compilation through `npm run build`,
- GitHub Actions CI for typecheck, test, and build.

## Testing Principles

- Test policy and validation logic outside the MCP transport layer where possible.
- Add protocol tests when tool registration, schemas, or transport behavior changes.
- Treat desktop execution tools as safety-sensitive and require explicit failure-mode tests.
- Keep tests deterministic. Avoid real desktop mutation in unit tests.

## Test Layers

### Unit Tests

Use for:

- automation policy decisions,
- target validation,
- audit-tag generation,
- tool-contract helper functions.

### Protocol Tests

Use for:

- MCP tool registration,
- tool input validation,
- tool output shape,
- transport smoke checks.

### Build And Type Checks

Run for every source change:

```bash
npm run typecheck
npm run test
npm run build
```

### Manual Acceptance Checks

Use only when a tool interacts with the local desktop. Each manual check must include:

- user action,
- target,
- expected visible result,
- rollback or cleanup step when relevant.

## Reporting Requirements

Every implementation summary must include:

- tests planned,
- commands run,
- pass/fail result,
- skipped checks and reason,
- remaining safety or automation gaps.

For documentation-only changes, state that no build was required.
