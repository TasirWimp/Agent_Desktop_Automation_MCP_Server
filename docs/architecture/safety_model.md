# Scope-Enforced Interaction Model

## Default Posture

The server is policy-first, but the policy center for UI development/testing is scope enforcement. A tool that can change desktop state must have a documented contract before implementation and must expose enough audit data for a user or reviewer to understand what happened.

The long-term interaction model is task-scoped licensed autonomy, not confirmation before every micro-action. The user grants a bounded desktop interaction session, the agent acts inside that license, every action leaves an audit trace, and every state-changing action is followed by observation.

For real UI testing, the intended license is a user-declared app-under-test. The user identifies an app, window, process, workspace, or local URL and declares it safe and reversible for the requested test task. The server does not try to judge every in-app click as globally safe; it enforces that agent-triggered interactions stay inside the bound app scope and stops or escalates at boundary crossings.

## Initial Action Classes

- `observe` - read-only context gathering. Allowed when the intent is concrete.
- `open_application`, `open_url`, `file_operation`, `keyboard_input`, `mouse_input` - desktop state changes. Require user confirmation when proposed outside a confirmed interaction session.
- `shell_command`, `credential_access`, `system_change` - blocked in the initial model.

Inside a confirmed `desktop_interaction_session`, bounded low-risk actions such as observation, mouse movement, clicking visible controls in the allowed window, and typing generated test input may be licensed by the session instead of requiring repeated per-action confirmation as their tool contracts become available.

Inside a declared reversible app-under-test session, real click and future typing tools may be licensed as ordinary test interactions when they stay inside the bound app, use generated test data where relevant, leave an audit trace, and are followed by observation. The main block condition becomes scope exit or an explicitly forbidden boundary, not generic click risk.

## Tool Contract Requirements

Every execution tool must document:

- target shape,
- allowed and blocked inputs,
- user confirmation behavior,
- failure modes,
- audit output,
- tests required before release.

## Relational Navigation Enforcement

State-changing desktop actions must be justified by relational target evidence, not by raw coordinates. Coordinates remain allowed as probe/action endpoints, but the proof obligation is a claim about the observed scene: source observation, intended target, anchor, relation, candidate, rejected alternative, expected evidence, contradiction, and point provenance.

For the operational mini-agent path, `desktop_move_mouse`, `desktop_click`, and `desktop_type_text` accept `compactRelationalClaim`. The server expands that compact claim into the fuller internal relational/audit packet, binds it to the live screenshot-bearing pre-action observation and frame hashes, and applies default pre-action self-check evidence. Full `relationalNavigation` remains supported for strict/debug clients.

`pointProvenance: "external_coordinate"` and `"unknown"` are blocked for real state-changing actions. `desktop_move_mouse` may use `relational_estimate` or `relative_probe` as a bounded endpoint, but the follow-up cursor landing is telemetry only. `desktop_observe({ transitionActionId })` can record that the backend moved the cursor; it does not prove semantic target correctness.

## Fresh Perception Digest

State-changing actions also require `desktop_submit_perception_digest` for the latest screenshot-bearing observation before provider execution. The digest is authored by the client/agent; the server does not inspect pixels, run OCR, or decide what is visible. The server enforces temporal and provenance constraints: the digest must reference the latest recorded observation, match the action scope and intended target, bind to the observation frame hashes, and declare that stale carryover was reviewed.

Normal movement, clicking, typing, transition-supported assessments, and click-candidate readiness require a visible target, visible relational anchor, no changed/uncertain carryover, and no contradiction in the digest. A `relative_probe` movement may proceed from an uncertain or changed digest only as an explicit repair probe. Click and typing never proceed from uncertain or not-visible digest state.

For operational mini-agent clients, the digest intake normalizes only exact no-contradiction sentinel strings such as `"none"`, `"n/a"`, `"not applicable"`, and `"no contradiction observed"` to JSON `null`; arbitrary contradiction text remains non-null and blocking. Semantic target comparisons use a conservative canonical form that removes punctuation, casing, whitespace differences, articles, and generic UI words such as `button` or `control`, while preserving distinct semantic objects and spatial qualifiers.

Any newer `desktop_observe` makes older digests unusable for future action requests. This prevents a smaller agent from continuing to act on a prior mental screenshot after the live screenshot has changed. Digest enforcement is a claim-freshness gate, not a visual-truth oracle.

Freshness is tiered by evidence purpose instead of governed only by a single short observation clock. The session still has a hard duration cap, and newer observations still invalidate old perception digests and workflow claims. Within that boundary, pre-action observations, click-candidate observations, perception digests, workflow-state claims, app-scope bindings, and hover witnesses can each have their own bounded age window. Real-provider sessions should prefer a one-hour hard cap with bounded tiered freshness rather than repeatedly rebuilding valid relational witnesses because a 60-second clock expired.

After movement, `desktop_submit_transition_assessment` must evaluate the follow-up screenshot against the stored relation, candidate, rejected alternative, expected evidence, and contradiction claim. A supported assessment can unlock click-candidate readiness. A contradicted assessment maps to wrong-target repair. An inconclusive assessment maps to repair needed. `desktop_evaluate_click_candidate` treats cursor/candidate proximity as necessary telemetry and requires supported semantic landing evidence with no contradiction before recording a hover target witness.

## Workflow-State Claims

Click-candidate evaluation, `desktop_click`, and `desktop_type_text` require `desktop_submit_workflow_state_claim` in addition to fresh perception and relational target evidence. The workflow claim is authored by the client/agent; the server does not inspect pixels, run OCR, or hardcode application workflows. The server enforces that the claim references the latest screenshot-bearing observation, the current perception digest, matching scope, matching frame hashes, and an equivalent intended element target.

Workflow claims protect committed UI state above element targeting. `execute_committed_action` and `text_entry` require a satisfied precondition, no current contradiction, and no present/uncertain transient-state risk. `commit_precondition` and `repair` may proceed from an unmet or uncertain precondition only when the claim names the missing confirmation. This keeps cases such as an open dropdown highlight distinct from a committed selection: a highlighted BodySlide row may justify clicking that row to commit the precondition, but it does not justify clicking Run until a fresh claim says the collapsed executable selection is BodySlide.

When a workflow claim references `transitionActionId`, it records the post-action workflow assessment on the transition gate. `satisfied` maps to expected workflow progress, `contradicted` maps to wrong workflow state, and `inconclusive` maps to repair needed. Repair accounting is reused for the same transition rather than double-counted when the observation classifier already consumed a repair attempt.

## Current Decision

The server exposes capability reporting, policy classification, read-only UI intersection planning, session lifecycle tools, mock observation, mock movement/click/type probes, compact relational navigation claims, fresh perception digests, workflow-state claims, semantic landing assessments, cursor and movement-delta witness packets, licensed app-scope declarations, runtime app-scope binding, a catalog-only application bootstrap tool, opt-in Windows active-window observation, an opt-in Windows real mouse-movement probe, an opt-in app-scoped Windows real-click gate, and an opt-in app-scoped Windows generated-text typing gate. The default provider remains mock-only. Shell commands, arbitrary executable launch, command-line launch arguments, system changes, and broad desktop mutation remain disabled.

`ui_intersection_plan` may prepare a policy-gated candidate packet from semantic localization and frame evidence. It must not move the cursor, click, capture screens, or claim success. Actual `mouse_input` remains a state-changing action that requires either single-action policy confirmation or an active session license, audit logging, scope checks, and post-action observation.

`desktop_evaluate_click_candidate` is a session-aware targeting-quality gate. It checks that a future click candidate references an active session, allowed click action, fresh recorded observation, fresh perception digest, fresh workflow-state claim, matching scope, frame evidence, cursor/candidate proximity, supported semantic landing assessment, no contradiction, committed workflow readiness or an explicit precondition-commit repair role, and a low-risk packet. It may reuse an older supported movement/hover witness only when the latest observation, perception digest, workflow claim, cursor point, candidate point, target, and scope revalidate the same target. It records a `click_candidate_evaluated` audit event and a hover target witness when ready. It does not click, move, type, capture new frames, or make real clicking available. For app-scoped real click work, this evidence reduces wrong-target clicks and wrong-workflow clicks and guides repair; it is not the main governance boundary.

`desktop_move_mouse` is mock-only by default. When the Windows provider is selected with both `ADMCP_ENABLE_REAL_OBSERVATION=true` and `ADMCP_ENABLE_REAL_MOUSE_MOVEMENT=true`, it may move the real cursor as a bounded active-window-scoped probe. The requested point is interpreted in active-window frame coordinates, must stay inside the observed active-window bounds, must pass session scope, observation freshness, perception-digest freshness, and relational-navigation checks, is audited, and creates a transition gate requiring post-movement observation and semantic landing assessment before click-candidate readiness. This is allowed as a non-durable pointer probe; it does not license clicking, typing, arbitrary app launching, shell execution, or persistent desktop changes.

`desktop_click` is mock-only by default. When the Windows provider is selected with `ADMCP_ENABLE_REAL_OBSERVATION=true` and `ADMCP_ENABLE_REAL_CLICK=true`, it may click only inside the bound app-under-test scope. It requires an active session, reversible `licensedAppScope`, fresh `boundAppScope`, fresh pre-action observation, fresh perception digest, fresh workflow-state claim, relational evidence with `hover_witness` point provenance, a stored hover target witness matching the click point and workflow context, in-frame point, app-scoped `click` permission, audit logging, and a post-click observation before another non-observe action.

`desktop_type_text` is mock-only by default. When the Windows provider is selected with `ADMCP_ENABLE_REAL_OBSERVATION=true` and `ADMCP_ENABLE_REAL_TYPING=true`, it may type only generated test input inside the bound app-under-test scope. It requires an active session, reversible `licensedAppScope`, fresh `boundAppScope`, fresh pre-action observation, fresh perception digest, fresh workflow-state claim with `text_entry` or `not_applicable` role, app-scoped `type_text` permission, non-sensitive/test-input classification, audit logging, and a post-type observation before another non-observe action. It blocks credential-like or secret-like text before provider calls and must not store text content in action packets or audit events.

Post-action observations now classify the transition gate as `expected_delta`, `no_op`, `wrong_target`, `scope_exit`, `risk_prompt`, `uninterpretable_state`, or `repair_needed`. Expected deltas reset repair accounting. No-op, wrong-target, and repair-needed classifications allow bounded in-scope repair until the configured repair limit is reached. Scope exit, forbidden-boundary/risk prompts, uninterpretable state, and repair-limit exhaustion stop or escalate. This classification layer does not add OCR, semantic localization, a runner, shell execution, arbitrary app launching, or new desktop mutation authority.

`desktop_open_application` is a catalog bootstrap tool, not a shell or arbitrary app-launch surface. It accepts only catalog IDs or exact aliases resolved from `config/desktop_applications.json`, requires user confirmation, and passes only the catalog application definition to providers. Paths, command-line arguments, and unknown app names are blocked or rejected before provider launch.

`desktop_observe` can use an opt-in Windows active-window observation provider when `ADMCP_DESKTOP_PROVIDER=windows-active-window` and `ADMCP_ENABLE_REAL_OBSERVATION=true` are set. The default remains mock-only. The real-observation spike captures bounded visible active-window frames only, reports active-window-relative cursor witness metadata when available, can render the visible cursor and a high-contrast cursor witness marker into active-window frames when provider cursor evidence is sufficient, validates active-window scope before capture, and does not enable real clicking, typing, or durable desktop mutation by itself.

When a session declares `licensedAppScope`, `desktop_observe` binds the declared app-under-test to observed provider identity and stores it as `boundAppScope`. Later observations must match that binding. If focus or active-window identity drifts outside the bound app, the tool returns `status: "scope_exit"`, appends an `outside_allowed_scope` stop condition and `escalation_required` audit event, and does not record or return the out-of-scope frame as session evidence.

## Session License Direction

The planned session model is documented in `licensed_desktop_interaction_sessions.md`.

Core boundary:

- User confirmation is required before starting a bounded task session.
- For real click and future real type, the user must declare the app-under-test safe and reversible. This declaration is represented by `licensedAppScope`.
- Low-risk actions inside the bound app, window, process, workspace, or local URL scope can proceed without repeated user confirmation.
- Boundary crossings require stop or escalation.
- Credential entry, payment, external publishing, destructive operations outside scope, unrelated private windows, and system changes remain blocked or escalated.
- `active_window` scope is provisional until `desktop_observe` binds it to concrete observed window identity before mutation.
- `observed_window_identity`, `local_url`, and `local_origin` scope kinds are modeled; URL/origin binding still needs a provider that can supply URL identity.
- Provider-backed tools must validate observation existence, freshness, session id, scope, and frame linkage before state-changing actions.
- Provider-backed state-changing tools must validate relational navigation evidence before execution; raw coordinate landing cannot prove semantic correctness.
- No background capture, hidden polling loop, OCR dependency, shell backend, arbitrary launcher, broad desktop-control backend, or unscoped durable OS mutation backend is part of the current implementation.
