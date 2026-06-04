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
- session license decisions,
- session runtime state transitions,
- audit event append and retrieval behavior,
- inactive-session rejection,
- target validation,
- audit-tag generation,
- tool-contract helper functions,
- UI planning packet readiness and residue behavior.

Session policy tests must cover:

- session start requires user confirmation,
- bounded mouse, click, observe, and typing actions are allowed inside a confirmed session scope,
- actions outside the allowed scope are blocked or escalated,
- credential, system, external-publishing, and destructive actions remain blocked,
- every in-session action has an audit event,
- every state-changing action has a fresh pre-action observation,
- every state-changing action has post-action observation before completion,
- observation references match session id, target scope, freshness limits, and frame-evidence expectations,
- low-risk in-session actions do not require repeated user confirmation.
- future real click/type permissions require a user-declared reversible app-under-test scope.
- future real actions stop or escalate when active provider state leaves the bound app scope.

### Protocol Tests

Use for:

- MCP tool registration,
- tool input validation,
- tool output shape,
- session lifecycle tool calls and audit-log behavior,
- mock observation tool calls, bounded frame metadata, optional image content blocks, and audit events,
- mock movement tool calls, pre-action observation validation, transition gate creation, blocked blind action chains, and post-movement observation audit,
- mock click and typing tool calls, credential-like text blocking, low-recoverability escalation, absence of typed text persistence, transition gate creation, and post-action observation audit,
- transport smoke checks.

After ADMCP-011, mock action tools are available, but protocol tests must continue to assert that real desktop capture and real desktop mutation capabilities remain disabled by default.

### Provider Tests

Use for:

- deterministic mock observation frame metadata,
- simulated mock cursor position updates,
- provider capability reports,
- observation frame-count and duration bounds,
- absence of real desktop capture,
- absence of real desktop mutation in mock action methods,
- simulated click and typing results without real desktop mutation.
- Windows real-observation provider tests with fake backends for active-window metadata, bounded frames, scope mismatch, permission failures, and provider selection.

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

For ADMCP-012 and ADMCP-013, use `manual_real_observation_checklist.md`. Real observation manual checks must verify bounded active-window capture, visible-content acknowledgement, controlled scope mismatch, no hidden polling, and no real desktop mutation. Optional real pointer-movement checks must verify explicit opt-in configuration, active-window-local coordinates, session/license enforcement, transition-gate follow-up observation, out-of-bounds rejection, and continued blocking of real click/type behavior.

For ADMCP-013A, the manual probe runner is tested as a support tool, not as new desktop authority. Tests verify that the runner uses existing MCP/session tool paths, preserves audit output, records stale-observation policy blocks, records manual wrong-target hover residue, and verifies real click blocking without producing a real click.

For ADMCP-013B, the governed navigation probe runner is tested as faster pressure-test support tooling, not as new desktop authority. Tests verify that it carries each post-movement observation forward as the next pre-action witness, reduces an N-step path to N+1 observations, records per-tool timing diagnostics, requires the explicit real-movement runner gate, and keeps real click/type behavior unavailable.

For ADMCP-014, tests must cover cursor witness metadata, cursor-rendered frame metadata, raw-versus-annotated frame semantics, missing cursor or hover witness residue, post-movement transition delta packets, scope-stability evidence, and continued blocking of real click/type behavior. ADMCP-014 tests must not require OCR, accessibility trees, semantic localization, or real click execution.

For ADMCP-015, tests must cover optional provider timing diagnostics without making timing policy-critical. Windows provider tests should verify observation timing packets, PowerShell substage timing propagation from fake backends, movement provider timing, protocol propagation through `desktop_observe`, and governed navigation probe summaries. Mock and future providers may omit timing diagnostics.

For ADMCP-016, tests must cover the persistent Windows helper as an implementation detail behind the provider seam. Windows provider tests should verify default persistent-helper selection, explicit per-call fallback, helper command delegation, helper failure mapping, provider cleanup delegation, and continued absence of click/type authority. Manual runner tests should preserve provider cleanup paths so helper processes do not outlive governed probe runs. Live checks should verify repeated observations through one session, while treating cold-start latency as residue.

For ADMCP-017, tests must cover the click-candidate witness gate. Protocol tests should verify that `desktop_evaluate_click_candidate` requires an active session and recorded observation, checks click permission, observation freshness, scope match, frame evidence, cursor/candidate proximity, optional audited movement-transition evidence, and low-risk packets, appends a `click_candidate_evaluated` audit event, and never executes a click.

For ADMCP-018, tests must cover the licensed app-under-test scope model. Session-policy tests should reject `click`/`type_text` permissions when the user has not declared a reversible app scope, accept declared reversible app scopes, preserve forbidden boundary declarations, and keep click-candidate evidence as targeting quality rather than the main safety gate.

For ADMCP-019, tests cover scope binding runtime behavior. Unit and protocol tests verify binding to observed window/process/title identity, unbound app-scope action blocks, stale binding handling, pre-action observation mismatch, active-window focus drift, and scope-exit stop conditions. Local URL/origin binding remains provider-dependent future coverage.

For ADMCP-020, tests cover app-scoped real click gating without allowing broad desktop clicks. Provider and protocol tests verify the provider gate disabled, explicit click gate enabled, in-scope allowed click, out-of-scope blocked click, missing app declaration blocked through session policy, stale pre-action observation blocked, audit event creation, and mandatory post-click observation. Manual checks should use only a local reversible app-under-test.

For ADMCP-021, tests must cover app-scoped real typing of generated test input. Tests should verify provider gate disabled, in-scope generated input allowed, credential-like or secret-like input blocked, out-of-scope typing blocked, text content not stored in audit/action packets, and mandatory post-type observation.

For ADMCP-022, tests must cover post-action observation and repair-loop classification: expected delta, no-op, wrong target, scope exit, risk prompt, uninterpretable state, repair attempt counting, and transition-gate audit completeness.

For ADMCP-023, tests must cover the governed UI test cycle runner, not a generic ordered click/type script.

Unit tests:

- scenario contract validation,
- required session-license fields in scenario contracts,
- allowed probes versus allowed actions,
- evidence-strength defaults, including `frame_hash_delta` as weak by default,
- observation-only, probe-action, and state-changing cycle packet variants,
- cycle packet creation and update,
- carrier update from transition classification,
- residue carry-forward into `next_reentry_pressure`,
- protected outcome status updates,
- closure-gate allow/block decisions, including pass versus partial-landfall distinction,
- max cycle/action/time enforcement,
- final landfall/re-entry packet shape.

Runner/protocol tests:

- `expected_delta` with protected outcome satisfied -> close,
- `expected_delta` with protected outcome unresolved -> continue or partial landfall, not silent pass,
- frame-hash delta without scenario-declared sufficient visual cue -> not passed by itself,
- `no_op` -> residue and repair or ask,
- `wrong_target` -> bounded repair,
- `repair_needed` -> bounded repair,
- `scope_exit` -> stop/escalate,
- `risk_prompt` -> stop/escalate,
- `uninterpretable_state` -> stop/escalate,
- repair-limit exhaustion -> visible residue and no silent pass,
- pending transition gate blocks the next non-observe action,
- observation-only cycles can record orientation evidence without requiring action id or transition classification,
- state-changing cycles require before observation, action id, after observation through `transitionActionId`, and transition classification,
- artifact includes scenario contract, cycle packets, carrier, observations, actions, classifications, audit events, residue, closure gate result, and final status.

Manual checks:

- local reversible Phaser/Vite fixture,
- app launch/dev-server performed outside the MCP server,
- pass case witnesses declared protected outcome,
- no-op and wrong-target cases do not close,
- delayed transition uses bounded re-observe/repair instead of immediate blind retry,
- scope exit stops,
- visible outcome and rollback/cleanup are documented,
- no shell, app launch, deployment, external publishing, OCR dependency, hidden polling, semantic-localization prerequisite, or cross-app authority is added.

## Reporting Requirements

Every implementation summary must include:

- tests planned,
- commands run,
- pass/fail result,
- skipped checks and reason,
- remaining safety or automation gaps.

For documentation-only changes, state that no build was required.
