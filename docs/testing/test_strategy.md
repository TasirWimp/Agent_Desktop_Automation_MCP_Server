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
- every state-changing action has compact relational or full relational navigation evidence linked to a screenshot-bearing live observation,
- every state-changing action has a fresh perception digest linked to the latest screenshot-bearing live observation,
- tiered evidence freshness honors separate windows for pre-action observations, click-candidate observations, perception digests, workflow-state claims, app-scope bindings, and hover witnesses while preserving the hard session duration cap,
- stale, non-latest, wrong-target, wrong-scope, uncertain, not-visible, and contradicted perception digests block normal state-changing actions before provider execution,
- raw coordinate-only movement, click, and typing requests are blocked before provider execution,
- external or unknown point provenance is blocked for real state-changing actions,
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
- perception digest submission, latest-observation binding, screenshot-payload requirement, and action/candidate/assessment digest enforcement,
- compact semantic landing assessment through `desktop_submit_transition_assessment`, including supported, contradicted, and inconclusive outcomes,
- mock click and typing tool calls, credential-like text blocking, low-recoverability escalation, absence of typed text persistence, transition gate creation, and post-action observation audit,
- click-candidate readiness requiring supported semantic landing assessment and hover target witness evidence, not cursor proximity alone,
- catalog-only app bootstrap through `desktop_open_application`, including unknown app queries, path-like queries, user confirmation, and launch-argument rejection,
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

For ADMCP-017, tests must cover the click-candidate witness gate. Protocol tests should verify that `desktop_evaluate_click_candidate` requires an active session and recorded observation, checks click permission, observation freshness, scope match, frame evidence, cursor/candidate proximity, supported semantic landing assessment, no contradiction, workflow-state readiness, and low-risk packets, appends a `click_candidate_evaluated` audit event, and never executes a click. Tests should also cover older supported movement reuse only when the latest observation, digest, workflow evidence, cursor/candidate point, target, and scope revalidate the witness.

For the operational fast path, tests must cover `desktop_submit_interaction_evidence` as a non-mutating session-state helper. Protocol tests should verify tool listing/capabilities, digest recording, workflow claim recording, transition assessment recording, click-candidate evaluation and hover witness return in one call, no desktop mutation by the helper, generated opaque digest IDs for corrected same-observation evidence, and bounded workflow-claim revalidation across observation-only and audited move-only hover changes. Regression tests must show semantic landing is recorded before workflow postcondition assessment when both reference the same movement, `clickCandidate.movementActionId` can be inferred from same-call `transitionAssessment.actionId`, missing movement binding returns an actionable partial failure, strict `desktop_evaluate_click_candidate` rejects inline transition assessments, revalidation blocks after click/type/app launch/scope exit/risk/wrong-target/repair-needed transitions, and strict/debug tools remain compatible.

For ADMCP-018, tests must cover the licensed app-under-test scope model. Session-policy tests should reject `click`/`type_text` permissions when the user has not declared a reversible app scope, accept declared reversible app scopes, preserve forbidden boundary declarations, and keep click-candidate evidence as targeting quality rather than the main safety gate.

For ADMCP-019, tests cover scope binding runtime behavior. Unit and protocol tests verify binding to observed window/process/title identity, unbound app-scope action blocks, stale binding handling, pre-action observation mismatch, active-window focus drift, and scope-exit stop conditions. Local URL/origin binding remains provider-dependent future coverage.

For ADMCP-020, tests cover app-scoped real click gating without allowing broad desktop clicks. Provider and protocol tests verify the provider gate disabled, explicit click gate enabled, in-scope allowed click, out-of-scope blocked click, missing app declaration blocked through session policy, stale pre-action observation blocked, audit event creation, and mandatory post-click observation. Manual checks should use only a local reversible app-under-test.

For ADMCP-021, tests must cover app-scoped real typing of generated test input. Tests should verify provider gate disabled, in-scope generated input allowed, credential-like or secret-like input blocked, out-of-scope typing blocked, text content not stored in audit/action packets, and mandatory post-type observation.

For ADMCP-022, tests must cover post-action observation and repair-loop classification: expected delta, no-op, wrong target, scope exit, risk prompt, uninterpretable state, repair attempt counting, and transition-gate audit completeness.

For compact relational navigation enforcement, tests must cover coordinate-only action blocks, compact claim expansion from live screenshot-bearing observations, stale or mismatched observation blocks, blocked `external_coordinate` and `unknown` provenance, movement cursor landing as telemetry only, supported landing assessment unlocking candidate readiness, contradicted landing mapping to wrong target, inconclusive landing consuming repair budget, click proximity being insufficient without semantic confirmation, hover-witness click requirements, and full `relationalNavigation` compatibility for strict/debug clients.

For fresh perception digest enforcement, tests must cover successful digest recording for the latest screenshot-bearing observation, rejection without image payload, rejection for non-latest observations, state-changing action blocks without digest, stale digest blocks, target/scope/frame-hash mismatch blocks, uncertain/not-visible digest blocks for normal movement/click/type, `relative_probe` repair movement from uncertain/changed digest, supported transition assessment rejection when the follow-up digest is changed or not visible, click-candidate readiness requiring a visible current digest, and newer observations invalidating older digests.

For workflow-state claim enforcement, tests must cover successful claim recording for the latest screenshot-bearing observation and current perception digest, stale/non-latest/wrong-target rejection, safe none-sentinel normalization, click-candidate blocking without workflow state, committed-action blocking when preconditions are unmet or transient state is present, precondition-commit readiness with explicit missing confirmation, click/type action blocks without workflow claims, hover-witness workflow-context revalidation, and postcondition claims mapping satisfied/contradicted/inconclusive workflow outcomes onto transition gates without double-counting repair attempts.

For tiered freshness and hover revalidation, tests must cover `maxObservationGapMs` schema compatibility up to 300000 ms, per-tier evidence freshness caps up to 600000 ms, fallback to `maxObservationGapMs` when tiers are omitted, action/session expiry at `maxDurationMs` or `expiresAt`, newer-observation invalidation of old digests/workflow claims, older supported movement revalidation by latest digest/workflow/cursor evidence, stale hover-witness blocking, and click point mismatch blocking.

For compact API tolerance, tests must cover exact no-contradiction sentinels normalizing to JSON `null`, non-sentinel contradiction text remaining blocking, conservative semantic target equivalence for generic UI wording differences, distinct target mismatches remaining blocked, and canonical mismatch diagnostics in policy/protocol outputs.

For catalog application bootstrap, tests must cover JSON-only app additions, duplicate ID validation, ambiguous alias validation, unknown app/query blocks, path-like query blocks, launch-argument/schema rejection, user confirmation, and provider capability blocks.

For ADMCP-023, tests must cover the governed UI test cycle runner, not a generic ordered click/type script.

Unit tests:

- scenario contract validation,
- required session-license fields in scenario contracts,
- allowed probes versus allowed actions,
- tool-to-cycle-kind matrix validation,
- evidence-strength defaults, including `frame_hash_delta` as weak by default,
- structured protected outcomes with acceptable evidence and insufficiency clauses,
- observation-only, probe-action, and state-changing cycle packet variants,
- cycle packet creation and update,
- carrier update from transition classification,
- residue carry-forward into `next_reentry_pressure`,
- protected outcome status updates,
- closure-gate allow/block decisions, including pass versus partial-landfall distinction,
- max cycle/action/time enforcement,
- final landfall/re-entry packet shape,
- agent guidance for target-canonical drift, repair digest clean-exit requirements, missing workflow postcondition status, click-candidate movement binding, stale/unclean perception evidence, workflow revalidation, scope rebinds, and closed-loop landing assessment.

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

OSWorld-inspired pressure fixtures should stay synthetic and local. They should use challenge-family structure and benchmark hygiene as inspiration while avoiding copied gated tasks, hidden answers, external evaluators, provider images, websites, credentials, shell setup, or live desktop authority. Required cases include:

- visual-spatial near-miss between same-label controls,
- streaming/no-op or delayed transition that remains open until lookback evidence supports progress,
- dynamic or cross-source watched-source staleness before commit/closure,
- implicit committed state where a transient highlight is insufficient,
- multi-item tracking that permits partial landfall but blocks pass,
- tutorial-following workflow evidence that requires explicit postcondition status,
- proactive ask instead of guessing missing domain input,
- scope exit and safety sidecar closure blocking,
- external benchmark-style provenance without gated evaluator leakage.

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
