# ADMCP-023 Carrier-State Design Refinement

Status: design refinement for the planned ADMCP-023 slice.

This document refines `ADMCP-023 Governed UI Test Cycle Runner For Local Apps` from the MVP plan. It does not add desktop authority. It defines the carrier-state discipline that the future runner should preserve while using the existing session tools.

## Source Inputs

This refinement uses four input families:

1. OSWorld 2.0 paper, `arXiv:2606.29537`.
   - Source-supported signal: long-horizon computer-use tasks expose failures in constraint tracking, hidden-state recovery, dynamic interaction, visual-spatial precision, asking/verification, and safety-sensitive side effects.
2. `xlang-ai/OSWorld-V2` GitHub repository.
   - Source-supported signal: comparable runs need pinned release/provenance manifests, gated task/evaluator separation, per-run result directories, observation/action trajectory artifacts, provider/image metadata, and explicit environment cleanup.
3. `TasirWimp/CRPM` UI-navigation carrier documents.
   - Source-supported signal: witnesses are not source state; local events are not route carriers; route carriers require lookback and residue; landfall requires recoverable re-entry geometry.
4. Agent-run feedback from use of ADMCP tools.
   - Operational signal: the runner must reduce ID drift and evidence mismatch by preserving one canonical target string, using `desktop_submit_interaction_evidence` as the consistency hub, minting a fresh clean digest after repair evidence, and requiring explicit workflow postcondition status when workflow evidence references a transition.

## Design Cut

ADMCP-023 should be a governed UI test cycle runner, not a generic OSWorld runner and not an ordered click/type script.

The unit of execution is a **carrier cycle**:

```text
goal -> active cut -> observe -> submit current evidence -> licensed probe/action -> observe lookback -> classify transition -> update carrier -> carry residue -> continue/repair/ask/close
```

The runner's responsibility is not to infer visual truth. It should preserve the evidence path so a later reader can recover:

- what the user wanted,
- which app-under-test scope licensed the action,
- which witness surface was inspected,
- which canonical target was active,
- what evidence was fresh and non-contradicted,
- what changed after a probe/action,
- what remained unresolved,
- why the run continued, repaired, asked, partially landed, or closed.

## Non-Goals

ADMCP-023 must not add:

- shell execution,
- dev-server startup,
- arbitrary app launch,
- broad OS control,
- hidden polling,
- OCR dependency,
- accessibility-tree dependency,
- benchmark evaluator leakage,
- coordinate-only success,
- frame-hash-only success,
- silent closure after partial progress,
- a new real click/type authority outside the existing provider gates.

App setup, fixture launch, dev-server start, credential provisioning, cloud spend, and task/evaluator acquisition remain outside the desktop automation server unless a later workspace-runner contract is separately documented.

## Refined Carrier Objects

### Scenario Contract

The scenario contract declares the bounded run before a session starts.

```yaml
ui_test_scenario_contract:
  schema_version: 1
  scenario_id:
  scenario_revision:
  human_goal:
  app_under_test:
    description:
    scope:
      kind: active_window | observed_window_identity | process_name | window_title | workspace_path | local_url | local_origin
      value:
    reversible: true
    forbidden_boundaries:
      - credential_or_secret_prompt
      - payment_or_purchase
      - external_message_or_email
      - external_publish_or_deploy
      - destructive_operation
      - system_settings
      - unrelated_private_window
      - scope_exit
      - low_recoverability
      - uninterpretable_state
  allowed_probes:
    - observe
    - evaluate_click_candidate
  allowed_actions:
    - move_mouse
    - click
    - type_text
  canonical_targets:
    - target_key:
      canonical_intended_target:
      surface_label_hints: []
      forbidden_aliases: []
      target_scope:
  protected_outcomes:
    - outcome_id:
      description:
      acceptable_evidence:
        - screenshot_reference
        - scenario_declared_visual_cue
        - provider_delta_summary
        - transition_classification
      insufficient_when:
        - frame_hash_delta_only
        - cursor_position_only
        - local_event_without_lookback
  max_cycles:
  max_actions:
  max_duration_ms:
  observation_cadence:
    max_observation_gap_ms:
    evidence_freshness:
      pre_action_observation_max_age_ms:
      click_candidate_observation_max_age_ms:
      perception_digest_max_age_ms:
      workflow_state_claim_max_age_ms:
      app_scope_binding_max_age_ms:
      hover_witness_max_age_ms:
  closure_policy:
    passed_allowed_if:
      - protected_outcomes_satisfied
      - target_canonical_consistency_preserved
      - no_pending_transition_gate
      - scope_remained_bound
      - residue_visible
      - artifact_replayable
    partial_landfall_allowed_if:
      - protected_outcome_residualized
      - no_same_license_probe_can_reduce_remaining_residue
      - no_pending_transition_gate
      - artifact_replayable
    close_blocked_if:
      - frame_hash_delta_only
      - target_canonical_drift
      - stale_or_contradicted_digest
      - missing_workflow_postcondition_status
      - pending_or_unassessed_transition
      - hidden_state_unrecovered
      - scope_exit_or_forbidden_boundary
```

### Run Carrier

The run carrier is the mutable state the runner updates after each cycle.

```yaml
ui_test_run_carrier:
  carrier_id:
  scenario_id:
  scenario_revision:
  admcp_server:
    repository:
    branch_or_commit:
    server_version:
    provider_kind:
    provider_gates:
    application_catalog_sha:
  external_provenance:
    osworld_release_manifest: optional
    osworld_code_tag: optional
    website_code_tag: optional
    provider_image_or_environment: optional
    note: "Record comparable-run provenance when borrowing OSWorld-style evaluation discipline; do not copy gated evaluators into artifacts."
  session:
    session_id:
    user_goal:
    licensed_app_scope:
    bound_app_scope:
    action_budget:
    time_budget:
  target_registry:
    active_target_key:
    canonical_intended_target:
    last_perception_digest_id:
    last_workflow_state_claim_id:
    last_hover_target_witness_id:
    target_drift_status: stable | drifted | repaired | unresolved
  cycle_ids: []
  transition_action_ids: []
  protected_outcome_status:
    - outcome_id:
      status: satisfied | unsatisfied | unresolved | contradicted
      evidence: []
      residue: []
  route_carrier:
    ladder_level: v0_source_pressure | v1_local_event | v2_route_dynamics | v3_reentry_geometry
    status: local_event | candidate_route | carries_with_residual | placeholder_only | carrier_overpromotion_risk
    carried_story_spine:
    witnesses: []
    residualized: []
  residue:
    unresolved_visual_state: []
    ambiguous_targeting: []
    timing_or_animation_uncertainty: []
    missing_expected_evidence: []
    policy_or_scope_residue: []
    target_canonical_residue: []
  closure:
    status: open | repair | ask | partial_landfall | passed | stopped
    reason:
    reentry_condition:
      later_reader_can_recover_without_hidden_model_memory: true | false
      artifact_paths: []
```

## Canonical Target Discipline

The runner should treat `intendedTarget` as a single canonical value across perception, workflow, transition assessment, click-candidate evaluation, click, and type requests.

Rules:

1. The scenario contract declares `canonical_targets[].canonical_intended_target`.
2. Every helper call for the active target uses the exact same `intendedTarget` string.
3. Workflow evidence should omit `workflow.intendedElementTarget` unless it intentionally narrows the target; omission lets `desktop_submit_interaction_evidence` inherit the helper's `intendedTarget`.
4. Surface wording variants belong in `surface_label_hints`, `currentEvidence`, `scene`, `anchor`, or residue, not in the canonical target field.
5. If the runner detects a target mismatch block, it should not invent a new target string. It should emit `target_canonical_drift`, ask for a corrected canonical target if needed, or restart the target track with an explicit new `target_key`.

This preserves the explicit-claim safety model while reducing accidental mismatch between perception digest, workflow claim, hover witness, and click request.

## Evidence Mode Discipline

The runner should model evidence as phases, not as one free-form digest stream.

```yaml
evidence_phase_model:
  normal_targeting:
    allowed_modes:
      - new_target
      - same_target
    required_digest_state:
      targetVisibility: visible
      anchorVisibility: visible | uncertain
      continuityWithPriorClaim: not_applicable | consistent
      contradictionToPriorClaim: null
    allowed_next_steps:
      - move_mouse
      - evaluate_click_candidate
      - click_if_hover_witness_ready
      - type_if_workflow_ready

  repair_probe:
    allowed_modes:
      - repair_target
    purpose:
      - record contradiction
      - record uncertain or changed target state
      - license only bounded relative-probe repair movement when policy permits
    blocked_next_steps:
      - normal_click
      - normal_type_text
      - execute_committed_action
    required_exit:
      - observe corrected target
      - submit fresh non-contradicted new_target or same_target evidence before the next normal move/click/type

  recovered_targeting:
    allowed_modes:
      - new_target
      - same_target
    required_digest_state:
      targetVisibility: visible
      continuityWithPriorClaim: not_applicable | consistent
      contradictionToPriorClaim: null
    carrier_update:
      target_drift_status: repaired
      previous_contradiction_carried_as_residue: true
```

Operational rule:

```text
A contradicted repair digest may explain the miss. It must not be carried into the next normal action as if it were clean action evidence.
```

After a miss, the runner should record the contradiction with `repair_target`, observe again, then mint a fresh clean digest for the corrected target before requesting the next normal movement or click.

## Workflow Postcondition Discipline

Any workflow evidence that references `transitionActionId` must include an explicit postcondition status:

```yaml
workflow:
  transitionActionId:
  postconditionStatus: satisfied | contradicted | inconclusive
```

The runner should never let a transition-linked workflow claim default to `not_applicable`. Missing postcondition status is not a harmless omission; it changes repair accounting and can force an avoidable extra repair cycle.

## Preferred Fast Path

The future runner should prefer the compact helper path to reduce ID drift:

```text
1. desktop_observe(includeImages: true)
2. inspect visual artifact
3. desktop_submit_interaction_evidence(new_target, perception + workflow)
4. desktop_move_mouse(compactRelationalClaim)
5. desktop_observe(transitionActionId)
6. inspect follow-up visual artifact
7. desktop_submit_interaction_evidence(same_target, perception + workflow + transitionAssessment + clickCandidate)
8. desktop_click(returned digest/workflow/hover witness ids)
9. desktop_observe(transitionActionId)
10. submit follow-up evidence and update carrier
```

Strict/debug tools remain valid, but ADMCP-023 should treat the helper as the normal consistency hub because it keeps perception, workflow, transition, and click-candidate evidence in one request/response carrier.

## CRPM Ladder Mapping

ADMCP-023 should keep these promotion boundaries visible:

| ADMCP packet state | CRPM navigation reading | Allowed claim | Blocked collapse |
| --- | --- | --- | --- |
| Initial observation only | `v0_source_pressure` or weak `v1_local_event` | orientation, active cut, candidate path set | claiming route or completion |
| One cue, hover, cursor point, or frame delta | `v1_local_event` | local event or reversible probe claim | route-carrier or landfall |
| Before/after transition with lookback and residue | `v2_route_dynamics` | candidate route or carries-with-residual | closure without re-entry geometry |
| Protected outcome plus sufficient witnesses plus scope plus replayable artifact | `v3_reentry_geometry` | genuine or partial landfall decision | residue-erasing pass |

Closure is allowed only at the `v3_reentry_geometry` level. `complete_for_P_only` can support `partial_landfall`, not `passed`, unless the user explicitly scoped the scenario to that protected subcore.

## OSWorld-Inspired Provenance Discipline

ADMCP-023 should borrow OSWorld-V2's provenance discipline without becoming OSWorld-V2.

The artifact should record:

- scenario schema version and revision,
- ADMCP server repository, branch/commit, and version,
- provider kind and enabled gates,
- operating system and active-window metadata when available,
- application catalog SHA,
- scenario contract hash,
- app-under-test scope and binding,
- observation artifact paths and frame hashes,
- action ids and transition ids,
- audit events and stop conditions,
- closure gate result,
- optional external benchmark release/provenance labels when a scenario is derived from or compared with an external release.

The artifact should not record gated evaluator code, hidden answer files, credentials, secrets, private tokens, or raw typed text. If a scenario borrows benchmark-style task structure, the runner should keep setup/evaluator authority outside the live agent path and record only enough provenance for replay and audit.

## Safety Sidecar

Each run should emit a compact safety sidecar in addition to the task artifact.

```yaml
ui_test_safety_report:
  session_id:
  scenario_id:
  forbidden_boundaries_seen: []
  blocked_actions: []
  scope_exit_events: []
  credential_or_secret_exposure: none | blocked | suspected | observed
  external_effect_risk: none | blocked | suspected | observed
  destructive_risk: none | blocked | suspected | observed
  system_change_risk: none | blocked | suspected | observed
  raw_text_persisted: false
  shell_or_arbitrary_launch_used: false
  unresolved_safety_residue: []
```

This mirrors the OSWorld 2.0 lesson that task completion and safety must be inspectable separately.

## Closure Gate

A run may close as `passed` only when all are true:

- every protected outcome required for pass is satisfied by declared acceptable evidence,
- target canonical consistency is preserved or an explicit new target track was opened,
- the latest action-bearing observation has a fresh clean digest,
- any workflow claim attached to a transition has explicit postcondition status,
- no transition gate is pending, unobserved, or semantically unassessed,
- the bound app scope remained stable,
- no forbidden boundary or stop condition is active,
- frame-hash delta is not the sole success evidence unless the scenario explicitly declared it sufficient,
- residue is visible and classified,
- the artifact contains enough witness, scope, carrier, and re-entry data for later recovery without hidden model memory.

A run should close as `partial_landfall` when a protected subcore is satisfied but target-core residue remains open and no same-license probe can reduce it. Partial landfall is not pass.

A run must remain `open`, `repair`, `ask`, or `stopped` when:

- the apparent success is only a local event,
- the target string drifted across evidence steps,
- repair evidence still carries a contradiction into a normal action,
- transition-linked workflow evidence lacks postcondition status,
- the app state is hidden or transient and not witnessed,
- the next useful step crosses the license boundary,
- scope exited or an out-of-scope frame was observed,
- the next action would require credentials, payment, external publishing, destructive changes, system settings, or arbitrary shell/app control.

## Runner UX Requirements

ADMCP-023 should reduce avoidable protocol mistakes with explicit guidance:

- On `workflow_state_claim_target_mismatch`, tell the client to reuse the exact helper `intendedTarget` string, omit `workflow.intendedElementTarget` to inherit it, or open a new target track deliberately.
- On `perception_digest_contradicted` after a repair observation, tell the client to submit a fresh non-contradicted `new_target` or `same_target` digest for the corrected target before the next normal move/click/type.
- On `workflow_postcondition_status_required`, tell the client to resubmit workflow evidence with `postconditionStatus: satisfied`, `contradicted`, or `inconclusive`.
- On click-candidate partial failure, keep returning the next helper call shape with the current `sessionId`, `observationId`, `targetScope`, `intendedTarget`, and movement binding requirement.

This guidance can start as runner-side normalization/checklist logic before becoming server-side `agentGuidance` output.

## Implementation Slices

Suggested ADMCP-023 sub-slices:

1. **ADMCP-023A Scenario Contract And Carrier Schemas**
   - Add scenario contract, target registry, carrier, cycle packet, safety report, and closure gate schemas.
   - Unit-test schema validation and blocked closure states.
2. **ADMCP-023B Carrier Update Library**
   - Add pure functions for target canonical checks, evidence phase transitions, route-carrier promotion, residue carry-forward, and closure decisions.
   - Unit-test CRPM ladder demotions and OSWorld-style provenance fields.
3. **ADMCP-023C Governed Runner Harness**
   - Compose existing MCP tools only.
   - Prefer `desktop_submit_interaction_evidence` before movement and after movement.
   - No new desktop mutation tools.
4. **ADMCP-023D Artifact And Safety Sidecar Writer**
   - Persist scenario, carrier, cycle packets, observations/actions, frame hashes, audit events, closure result, and safety report.
   - Do not persist secrets, raw typed text, gated evaluators, or hidden answers.
5. **ADMCP-023E Guidance Refinement**
   - Add client-side or server-side guidance for target mismatch, contradicted repair carryover, missing workflow postcondition status, and click-candidate movement binding.

## Test Requirements

Unit tests should cover:

- scenario contract validation,
- canonical target registry validation,
- helper target inheritance when workflow target is omitted,
- explicit workflow target mismatch producing target-canonical residue,
- repair digest followed by required clean digest before normal action,
- missing transition workflow postcondition status blocking closure,
- CRPM ladder promotion/demotion: local event is not route carrier, route carrier is not landfall,
- `complete_for_P_only` producing partial landfall, not passed,
- frame-hash-only evidence blocked unless scenario declares it sufficient,
- OSWorld-style provenance manifest fields recorded without gated evaluator leakage,
- safety sidecar classification.

Runner/protocol tests should cover:

- happy path through `observe -> helper -> move -> observe -> helper with transition/candidate -> click -> observe`,
- target string drift between digest/workflow/click blocked before click,
- contradiction repair path requires clean digest before next normal move,
- workflow postcondition status required when `transitionActionId` is set,
- pending transition gate blocks the next non-observe action,
- closure blocked by unresolved protected outcome residue,
- scope exit stops and writes safety sidecar residue,
- no shell, arbitrary app launch, hidden polling, raw text persistence, or broad desktop control.

Manual checks should use only a local reversible app-under-test and must document rollback/cleanup, visible expected outcome, and artifact replay path.

## Design Slogan

```text
OSWorld shows why long tasks fail.
CRPM names why local events are not landfall.
ADMCP-023 should make the carrier explicit enough that failure, repair, partial landfall, and closure are all replayable.
```