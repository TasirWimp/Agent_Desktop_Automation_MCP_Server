import {
  semanticTargetCanonicalForm,
  semanticTargetsEquivalent
} from "../policy/sessionLicensePolicy.js";
import {
  evaluateUiTestClosure,
  type UiTestAskState,
  type UiTestBehaviorLabel,
  type UiTestCanonicalTarget,
  type UiTestCheckpointState,
  type UiTestCheckpointStatus,
  type UiTestClosureGateResult,
  type UiTestClosureStatus,
  type UiTestEvidenceReference,
  type UiTestProtectedOutcomeStatus,
  type UiTestRouteCarrierState,
  type UiTestRunCarrier,
  type UiTestScenarioContract,
  type UiTestSemanticFreshnessStatus,
  type UiTestTransitionClassification,
  type UiTestWatchedSourceStaleBlockKind,
  uiTestRunCarrierSchema,
  uiTestScenarioContractSchema
} from "./uiTestCarrierSchemas.js";

export const uiTestEvidenceModes = [
  "new_target",
  "same_target",
  "repair_target",
  "recovered_target"
] as const;

export type UiTestEvidenceMode = (typeof uiTestEvidenceModes)[number];

export interface UiTestTargetCheckResult {
  status: "matched" | "new_target_required" | "unknown_target" | "forbidden_alias" | "mismatch";
  targetKey?: string;
  canonicalIntendedTarget?: string;
  requestedCanonical: string;
  expectedCanonical?: string;
  allowed: boolean;
  residue: string[];
  behaviorLabels: UiTestBehaviorLabel[];
}

export interface UiTestRepairExitResult {
  allowed: boolean;
  clearsRepairExit: boolean;
  reasons: string[];
  residue: string[];
  behaviorLabels: UiTestBehaviorLabel[];
}

export interface UiTestWatchedSourceFreshnessResult {
  staleSourceKeys: string[];
  blocked: boolean;
  residue: string[];
}

export interface UiTestCarrierMutationResult {
  carrier: UiTestRunCarrier;
  residue: string[];
  behaviorLabels: UiTestBehaviorLabel[];
}

export interface UiTestClosureDecisionResult {
  carrier: UiTestRunCarrier;
  gate: UiTestClosureGateResult;
}

export function evaluateUiTestTargetTrack(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  intendedTarget: string;
  targetKey?: string;
  mode: UiTestEvidenceMode;
}): UiTestTargetCheckResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const requestedCanonical = semanticTargetCanonicalForm(input.intendedTarget);
  const explicitTarget =
    input.targetKey === undefined
      ? targetByIntendedText(scenario, input.intendedTarget)
      : scenario.canonicalTargets.find((target) => target.targetKey === input.targetKey);
  const activeTarget =
    carrier.current.targetKey === undefined
      ? undefined
      : scenario.canonicalTargets.find(
          (target) => target.targetKey === carrier.current.targetKey
        );
  const forbiddenAliasTarget = scenario.canonicalTargets.find((target) =>
    target.forbiddenAliases.some((alias) =>
      semanticTargetsEquivalent(alias, input.intendedTarget)
    )
  );

  if (forbiddenAliasTarget !== undefined) {
    return {
      status: "forbidden_alias",
      targetKey: forbiddenAliasTarget.targetKey,
      canonicalIntendedTarget: forbiddenAliasTarget.canonicalIntendedTarget,
      requestedCanonical,
      expectedCanonical: semanticTargetCanonicalForm(
        forbiddenAliasTarget.canonicalIntendedTarget
      ),
      allowed: false,
      residue: [
        `Requested target canonical: ${requestedCanonical}.`,
        `Forbidden alias matched target key ${forbiddenAliasTarget.targetKey}.`
      ],
      behaviorLabels: ["target_string_drift"]
    };
  }

  if (explicitTarget === undefined) {
    return {
      status: "unknown_target",
      requestedCanonical,
      allowed: false,
      residue: [
        `Requested target canonical: ${requestedCanonical}.`,
        "No canonical target registry entry matched the request."
      ],
      behaviorLabels: ["target_string_drift"]
    };
  }

  const expectedCanonical = semanticTargetCanonicalForm(
    explicitTarget.canonicalIntendedTarget
  );
  const intendedMatchesCanonical = semanticTargetsEquivalent(
    input.intendedTarget,
    explicitTarget.canonicalIntendedTarget
  );

  if (!intendedMatchesCanonical) {
    return {
      status: "mismatch",
      targetKey: explicitTarget.targetKey,
      canonicalIntendedTarget: explicitTarget.canonicalIntendedTarget,
      requestedCanonical,
      expectedCanonical,
      allowed: false,
      residue: [
        `Requested target canonical: ${requestedCanonical}.`,
        `Registry target canonical: ${expectedCanonical}.`
      ],
      behaviorLabels: ["target_string_drift"]
    };
  }

  if (
    input.mode === "same_target" &&
    activeTarget !== undefined &&
    activeTarget.targetKey !== explicitTarget.targetKey
  ) {
    return {
      status: "new_target_required",
      targetKey: explicitTarget.targetKey,
      canonicalIntendedTarget: explicitTarget.canonicalIntendedTarget,
      requestedCanonical,
      expectedCanonical: semanticTargetCanonicalForm(activeTarget.canonicalIntendedTarget),
      allowed: false,
      residue: [
        `Active target key is ${activeTarget.targetKey}.`,
        `Requested target key is ${explicitTarget.targetKey}.`,
        "Use new_target evidence mode to open a new target track."
      ],
      behaviorLabels: ["target_string_drift"]
    };
  }

  return {
    status: "matched",
    targetKey: explicitTarget.targetKey,
    canonicalIntendedTarget: explicitTarget.canonicalIntendedTarget,
    requestedCanonical,
    expectedCanonical,
    allowed: true,
    residue: [
      `Target ${explicitTarget.targetKey} matched canonical form ${expectedCanonical}.`
    ],
    behaviorLabels: []
  };
}

export function applyUiTestTargetTrack(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  intendedTarget: string;
  targetKey?: string;
  mode: UiTestEvidenceMode;
}): UiTestCarrierMutationResult & { targetCheck: UiTestTargetCheckResult } {
  const targetCheck = evaluateUiTestTargetTrack(input);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);

  if (!targetCheck.allowed) {
    return {
      carrier: appendCarrierResidueAndLabels(
        carrier,
        targetCheck.residue,
        targetCheck.behaviorLabels
      ),
      residue: targetCheck.residue,
      behaviorLabels: targetCheck.behaviorLabels,
      targetCheck
    };
  }

  const nextCarrier = uiTestRunCarrierSchema.parse({
    ...carrier,
    current: {
      ...carrier.current,
      targetKey: targetCheck.targetKey,
      canonicalIntendedTarget: targetCheck.canonicalIntendedTarget,
      targetScope:
        targetCheck.targetKey === undefined
          ? carrier.current.targetScope
          : targetByKey(
              uiTestScenarioContractSchema.parse(input.scenario),
              targetCheck.targetKey
            )?.targetScope ?? carrier.current.targetScope
    },
    residue: uniqueStrings([
      ...carrier.residue,
      `Target track set to ${targetCheck.targetKey}.`
    ]),
    behaviorLabels: uniqueStrings(carrier.behaviorLabels)
  });

  return {
    carrier: nextCarrier,
    residue: [`Target track set to ${targetCheck.targetKey}.`],
    behaviorLabels: [],
    targetCheck
  };
}

export function evaluateUiTestRepairExit(input: {
  carrier: UiTestRunCarrier;
  mode: UiTestEvidenceMode;
  targetVisibility: "visible" | "not_visible" | "uncertain";
  continuityWithPriorClaim: "consistent" | "changed" | "uncertain" | "not_applicable";
  contradictionToPriorClaim: string | null;
}): UiTestRepairExitResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const reasons: string[] = [];

  if (!carrier.current.repairExitRequired) {
    return {
      allowed: true,
      clearsRepairExit: false,
      reasons: ["repair exit is not required"],
      residue: [],
      behaviorLabels: []
    };
  }

  const cleanDigest =
    (input.mode === "new_target" ||
      input.mode === "same_target" ||
      input.mode === "recovered_target") &&
    input.targetVisibility === "visible" &&
    (input.continuityWithPriorClaim === "consistent" ||
      input.continuityWithPriorClaim === "not_applicable") &&
    input.contradictionToPriorClaim === null;

  if (cleanDigest) {
    return {
      allowed: true,
      clearsRepairExit: true,
      reasons: ["fresh clean target evidence clears repair exit"],
      residue: [
        "Repair-exit requirement cleared by visible, non-contradicted current evidence."
      ],
      behaviorLabels: []
    };
  }

  if (input.mode === "repair_target") {
    reasons.push("repair_target evidence records repair state but cannot clear repair exit");
  }
  if (input.targetVisibility !== "visible") {
    reasons.push(`target visibility is ${input.targetVisibility}`);
  }
  if (
    input.continuityWithPriorClaim !== "consistent" &&
    input.continuityWithPriorClaim !== "not_applicable"
  ) {
    reasons.push(`continuity is ${input.continuityWithPriorClaim}`);
  }
  if (input.contradictionToPriorClaim !== null) {
    reasons.push("contradictionToPriorClaim is non-null");
  }

  return {
    allowed: false,
    clearsRepairExit: false,
    reasons,
    residue: [
      "A contradicted repair/probe digest cannot be reused as clean evidence.",
      "Submit fresh non-contradicted evidence for the corrected target before normal action."
    ],
    behaviorLabels: ["repair_digest_reused_as_clean"]
  };
}

export function applyUiTestEvidencePhase(input: {
  carrier: UiTestRunCarrier;
  mode: UiTestEvidenceMode;
  observationId: string;
  perceptionDigestId: string;
  targetVisibility: "visible" | "not_visible" | "uncertain";
  continuityWithPriorClaim: "consistent" | "changed" | "uncertain" | "not_applicable";
  contradictionToPriorClaim: string | null;
}): UiTestCarrierMutationResult & { repairExit: UiTestRepairExitResult } {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const repairExit = evaluateUiTestRepairExit(input);
  const repairTargetWithContradiction =
    input.mode === "repair_target" &&
    (input.contradictionToPriorClaim !== null ||
      input.continuityWithPriorClaim === "changed" ||
      input.continuityWithPriorClaim === "uncertain");
  const nextRepairExitRequired =
    repairTargetWithContradiction ||
    (carrier.current.repairExitRequired && !repairExit.clearsRepairExit);
  const phaseResidue = [
    `Evidence mode ${input.mode} recorded for observation ${input.observationId}.`,
    ...(repairTargetWithContradiction
      ? [
          "Repair evidence carried contradiction or uncertainty; repair exit is now required."
        ]
      : []),
    ...repairExit.residue
  ];
  const nextCarrier = uiTestRunCarrierSchema.parse({
    ...carrier,
    current: {
      ...carrier.current,
      observationId: input.observationId,
      perceptionDigestId: input.perceptionDigestId,
      repairExitRequired: nextRepairExitRequired
    },
    residue: uniqueStrings([...carrier.residue, ...phaseResidue]),
    behaviorLabels: uniqueStrings([
      ...carrier.behaviorLabels,
      ...repairExit.behaviorLabels
    ])
  });

  return {
    carrier: nextCarrier,
    residue: phaseResidue,
    behaviorLabels: repairExit.behaviorLabels,
    repairExit
  };
}

export function applyUiTestInteractionEvidenceIds(input: {
  carrier: UiTestRunCarrier;
  observationId?: string;
  perceptionDigestId?: string;
  workflowStateClaimId?: string;
  transitionActionId?: string;
  hoverTargetWitnessId?: string;
}): UiTestCarrierMutationResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const residue: string[] = [];

  if (input.observationId !== undefined) {
    residue.push(`current.observationId=${input.observationId}`);
  }
  if (input.perceptionDigestId !== undefined) {
    residue.push(`current.perceptionDigestId=${input.perceptionDigestId}`);
  }
  if (input.workflowStateClaimId !== undefined) {
    residue.push(`current.workflowStateClaimId=${input.workflowStateClaimId}`);
  }
  if (input.transitionActionId !== undefined) {
    residue.push(`current.transitionActionId=${input.transitionActionId}`);
  }
  if (input.hoverTargetWitnessId !== undefined) {
    residue.push(`current.hoverTargetWitnessId=${input.hoverTargetWitnessId}`);
  }

  return {
    carrier: uiTestRunCarrierSchema.parse({
      ...carrier,
      current: {
        ...carrier.current,
        observationId: input.observationId ?? carrier.current.observationId,
        perceptionDigestId:
          input.perceptionDigestId ?? carrier.current.perceptionDigestId,
        workflowStateClaimId:
          input.workflowStateClaimId ?? carrier.current.workflowStateClaimId,
        transitionActionId:
          input.transitionActionId ?? carrier.current.transitionActionId,
        hoverTargetWitnessId:
          input.hoverTargetWitnessId ?? carrier.current.hoverTargetWitnessId
      },
      transitionActionIds:
        input.transitionActionId === undefined
          ? carrier.transitionActionIds
          : uniqueStrings([...carrier.transitionActionIds, input.transitionActionId]),
      residue: uniqueStrings([...carrier.residue, ...residue])
    }),
    residue,
    behaviorLabels: []
  };
}

export function refreshUiTestWatchedSource(input: {
  carrier: UiTestRunCarrier;
  sourceKey: string;
  semanticFreshness: UiTestSemanticFreshnessStatus;
  checkedAt?: string;
  observationId?: string;
  summary?: string;
  residue?: string[];
}): UiTestCarrierMutationResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const nextSourceState = {
    sourceKey: input.sourceKey,
    semanticFreshness: input.semanticFreshness,
    lastCheckedAt: input.checkedAt,
    lastObservationId: input.observationId,
    summary: input.summary,
    residue: input.residue ?? []
  };
  const nextStates = upsertByKey(
    carrier.watchedSourceStatus,
    nextSourceState,
    "sourceKey"
  );
  const labels: UiTestBehaviorLabel[] =
    input.semanticFreshness === "stale" || input.semanticFreshness === "unknown"
      ? ["watched_source_stale"]
      : [];

  return {
    carrier: appendCarrierResidueAndLabels(
      uiTestRunCarrierSchema.parse({
        ...carrier,
        watchedSourceStatus: nextStates
      }),
      [`Watched source ${input.sourceKey} marked ${input.semanticFreshness}.`],
      labels
    ),
    residue: [`Watched source ${input.sourceKey} marked ${input.semanticFreshness}.`],
    behaviorLabels: labels
  };
}

export function evaluateUiTestWatchedSourceFreshness(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  blockKind: UiTestWatchedSourceStaleBlockKind;
  now?: string;
}): UiTestWatchedSourceFreshnessResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const staleSourceKeys: string[] = [];

  for (const source of scenario.watchedSources) {
    if (!source.staleBlocks.includes(input.blockKind)) {
      continue;
    }

    const state = carrier.watchedSourceStatus.find(
      (entry) => entry.sourceKey === source.sourceKey
    );
    const explicitlyStale =
      state === undefined ||
      state.semanticFreshness === "stale" ||
      state.semanticFreshness === "unknown";
    const staleByAge =
      state?.semanticFreshness === "current" &&
      input.now !== undefined &&
      source.semanticFreshnessWindowMs !== undefined &&
      state.lastCheckedAt !== undefined &&
      timestampDeltaMs(state.lastCheckedAt, input.now) >
        source.semanticFreshnessWindowMs;

    if (explicitlyStale || staleByAge) {
      staleSourceKeys.push(source.sourceKey);
    }
  }

  return {
    staleSourceKeys,
    blocked: staleSourceKeys.length > 0,
    residue:
      staleSourceKeys.length === 0
        ? []
        : [
            `Watched sources block ${input.blockKind}: ${staleSourceKeys.join(", ")}.`
          ]
  };
}

export function requireUiTestAsk(input: {
  carrier: UiTestRunCarrier;
  question: string;
  whyNecessary: string;
  invalidatedCarrierFields: string[];
  residue?: string[];
}): UiTestCarrierMutationResult {
  const askState: UiTestAskState = {
    status: "ask_required",
    question: input.question,
    whyNecessary: input.whyNecessary,
    invalidatedCarrierFields: input.invalidatedCarrierFields,
    revalidatedCarrierFields: [],
    residue: input.residue ?? []
  };
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);

  return {
    carrier: appendCarrierResidueAndLabels(
      uiTestRunCarrierSchema.parse({
        ...carrier,
        askState
      }),
      ["Ask-required state opened."],
      ["ask_needed"]
    ),
    residue: ["Ask-required state opened."],
    behaviorLabels: ["ask_needed"]
  };
}

export function answerUiTestAsk(input: {
  carrier: UiTestRunCarrier;
  answerSource: string;
  answerSummary: string;
  revalidatedCarrierFields: string[];
  residue?: string[];
}): UiTestCarrierMutationResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const askState: UiTestAskState = {
    ...carrier.askState,
    status: "answered",
    answerSource: input.answerSource,
    answerSummary: input.answerSummary,
    revalidatedCarrierFields: input.revalidatedCarrierFields,
    residue: uniqueStrings([...(carrier.askState.residue ?? []), ...(input.residue ?? [])])
  };

  return {
    carrier: uiTestRunCarrierSchema.parse({
      ...carrier,
      askState,
      residue: uniqueStrings([...carrier.residue, "Ask-required state answered."])
    }),
    residue: ["Ask-required state answered."],
    behaviorLabels: []
  };
}

export function applyUiTestCheckpointStatus(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  checkpointId: string;
  status: UiTestCheckpointStatus;
  evidence?: UiTestEvidenceReference[];
  residue?: string[];
}): UiTestCarrierMutationResult {
  const scenario = uiTestScenarioContractSchema.parse(input.scenario);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const checkpoint = scenario.protectedOutcome.checkpoints.find(
    (entry) => entry.checkpointId === input.checkpointId
  );

  if (checkpoint === undefined) {
    const residue = [`Unknown checkpoint id ${input.checkpointId}.`];

    return {
      carrier: appendCarrierResidueAndLabels(carrier, residue, []),
      residue,
      behaviorLabels: []
    };
  }

  const checkpointState: UiTestCheckpointState = {
    checkpointId: input.checkpointId,
    status: input.status,
    evidence: input.evidence ?? [],
    residue: input.residue ?? []
  };
  const checkpointStatus = upsertByKey(
    carrier.checkpointStatus,
    checkpointState,
    "checkpointId"
  );
  const protectedOutcomeStatus = deriveUiTestProtectedOutcomeStatus(
    scenario,
    checkpointStatus
  );
  const residue = [`Checkpoint ${input.checkpointId} marked ${input.status}.`];

  return {
    carrier: uiTestRunCarrierSchema.parse({
      ...carrier,
      checkpointStatus,
      protectedOutcomeStatus,
      residue: uniqueStrings([...carrier.residue, ...residue])
    }),
    residue,
    behaviorLabels: []
  };
}

export function deriveUiTestProtectedOutcomeStatus(
  scenarioInput: UiTestScenarioContract,
  checkpointStatus: UiTestCheckpointState[]
): UiTestRunCarrier["protectedOutcomeStatus"] {
  const scenario = uiTestScenarioContractSchema.parse(scenarioInput);
  const requiredCheckpoints = scenario.protectedOutcome.checkpoints.filter(
    (checkpoint) => checkpoint.requiredForPass
  );
  const stateFor = (checkpointId: string): UiTestCheckpointStatus =>
    checkpointStatus.find((state) => state.checkpointId === checkpointId)
      ?.status ?? "not_reached";
  const requiredStatuses = requiredCheckpoints.map((checkpoint) =>
    stateFor(checkpoint.checkpointId)
  );
  let status: UiTestProtectedOutcomeStatus;

  if (requiredStatuses.some((checkpointStatusValue) => checkpointStatusValue === "contradicted")) {
    status = "contradicted";
  } else if (
    requiredStatuses.length > 0 &&
    requiredStatuses.every((checkpointStatusValue) => checkpointStatusValue === "satisfied")
  ) {
    status = "satisfied";
  } else if (requiredStatuses.some((checkpointStatusValue) => checkpointStatusValue === "satisfied")) {
    status = "partial";
  } else if (
    requiredStatuses.some(
      (checkpointStatusValue) =>
        checkpointStatusValue === "unsatisfied" ||
        checkpointStatusValue === "unresolved"
    )
  ) {
    status = "unresolved";
  } else {
    status = "in_progress";
  }

  return {
    outcomeId: scenario.protectedOutcome.outcomeId,
    status,
    summary: `Protected outcome ${scenario.protectedOutcome.outcomeId} is ${status}.`,
    residue: requiredCheckpoints
      .filter((checkpoint) => stateFor(checkpoint.checkpointId) !== "satisfied")
      .map(
        (checkpoint) =>
          `Required checkpoint ${checkpoint.checkpointId} is ${stateFor(checkpoint.checkpointId)}.`
      )
  };
}

export function applyUiTestRouteCarrierTransition(input: {
  carrier: UiTestRunCarrier;
  classification: UiTestTransitionClassification;
  hasLookback: boolean;
  protectedObservables?: string[];
  satisfiedObservables?: string[];
  unsatisfiedResidue?: string[];
  reentryGeometry?: UiTestRouteCarrierState["reentryGeometry"];
}): UiTestCarrierMutationResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const routeCarrier = deriveRouteCarrierState(input);
  const labels = behaviorLabelsForTransition(input.classification);

  return {
    carrier: appendCarrierResidueAndLabels(
      uiTestRunCarrierSchema.parse({
        ...carrier,
        routeCarrier
      }),
      [`Route carrier moved to ${routeCarrier.ladderLevel}/${routeCarrier.status}.`],
      labels
    ),
    residue: [`Route carrier moved to ${routeCarrier.ladderLevel}/${routeCarrier.status}.`],
    behaviorLabels: labels
  };
}

export function appendUiTestBehaviorLabels(input: {
  carrier: UiTestRunCarrier;
  behaviorLabels: UiTestBehaviorLabel[];
  residue?: string[];
}): UiTestCarrierMutationResult {
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);

  return {
    carrier: appendCarrierResidueAndLabels(
      carrier,
      input.residue ?? [],
      input.behaviorLabels
    ),
    residue: input.residue ?? [],
    behaviorLabels: input.behaviorLabels
  };
}

export function applyUiTestClosureDecision(input: {
  scenario: UiTestScenarioContract;
  carrier: UiTestRunCarrier;
  requestedClosureStatus: UiTestClosureStatus;
}): UiTestClosureDecisionResult {
  const gate = evaluateUiTestClosure(input);
  const carrier = uiTestRunCarrierSchema.parse(input.carrier);
  const closureStatus: UiTestClosureStatus = gate.allowed
    ? input.requestedClosureStatus
    : input.requestedClosureStatus === "passed"
      ? "open"
      : carrier.closure.status;
  const labels: UiTestBehaviorLabel[] =
    gate.allowed || input.requestedClosureStatus !== "passed"
      ? []
      : ["premature_closure_attempt"];

  return {
    gate,
    carrier: appendCarrierResidueAndLabels(
      uiTestRunCarrierSchema.parse({
        ...carrier,
        closure: {
          status: closureStatus,
          summary: gate.reasons.join("; "),
          residue: gate.residue
        }
      }),
      gate.allowed ? [`Closure ${closureStatus} accepted.`] : gate.reasons,
      labels
    )
  };
}

function deriveRouteCarrierState(input: {
  carrier: UiTestRunCarrier;
  classification: UiTestTransitionClassification;
  hasLookback: boolean;
  protectedObservables?: string[];
  satisfiedObservables?: string[];
  unsatisfiedResidue?: string[];
  reentryGeometry?: UiTestRouteCarrierState["reentryGeometry"];
}): UiTestRouteCarrierState {
  const base = input.carrier.routeCarrier;
  const protectedObservables =
    input.protectedObservables ?? base.protectedObservables;
  const satisfiedObservables =
    input.satisfiedObservables ?? base.satisfiedObservables;
  const unsatisfiedResidue =
    input.unsatisfiedResidue ?? base.unsatisfiedResidue;

  if (!input.hasLookback) {
    return {
      ladderLevel: "v1_local_event",
      status: "local_event",
      protectedObservables,
      satisfiedObservables,
      unsatisfiedResidue: uniqueStrings([
        ...unsatisfiedResidue,
        "Transition has no lookback observation."
      ]),
      residue: uniqueStrings([
        ...base.residue,
        "Local event cannot be promoted to route carrier without lookback."
      ])
    };
  }

  if (
    input.classification.kind === "expected_delta" &&
    input.reentryGeometry !== undefined &&
    unsatisfiedResidue.length === 0
  ) {
    return {
      ladderLevel: "v3_reentry_geometry",
      status: "carries_with_residual",
      protectedObservables,
      satisfiedObservables,
      unsatisfiedResidue,
      reentryGeometry: input.reentryGeometry,
      residue: uniqueStrings([...base.residue, "Re-entry geometry established."])
    };
  }

  if (input.classification.kind === "expected_delta") {
    return {
      ladderLevel: "v2_route_dynamics",
      status:
        unsatisfiedResidue.length > 0
          ? "carries_with_residual"
          : "candidate_route",
      protectedObservables,
      satisfiedObservables,
      unsatisfiedResidue,
      residue: uniqueStrings([
        ...base.residue,
        "Expected delta has lookback but no final re-entry geometry."
      ])
    };
  }

  return {
    ladderLevel: "v2_route_dynamics",
    status: "carries_with_residual",
    protectedObservables,
    satisfiedObservables,
    unsatisfiedResidue: uniqueStrings([
      ...unsatisfiedResidue,
      `Transition classified as ${input.classification.kind}.`
    ]),
    residue: uniqueStrings([...base.residue, ...input.classification.residue])
  };
}

function behaviorLabelsForTransition(
  classification: UiTestTransitionClassification
): UiTestBehaviorLabel[] {
  switch (classification.kind) {
    case "wrong_target":
      return ["gui_visual_grounding_issue"];
    case "scope_exit":
      return ["scope_drift"];
    case "risk_prompt":
      return ["workflow_precondition_missing"];
    case "uninterpretable_state":
      return ["stale_memory_carryover"];
    case "no_op":
    case "repair_needed":
      return ["gui_visual_grounding_issue"];
    case "expected_delta":
      return [];
  }
}

function targetByKey(
  scenario: UiTestScenarioContract,
  targetKey: string
): UiTestCanonicalTarget | undefined {
  return scenario.canonicalTargets.find((target) => target.targetKey === targetKey);
}

function targetByIntendedText(
  scenario: UiTestScenarioContract,
  intendedTarget: string
): UiTestCanonicalTarget | undefined {
  return scenario.canonicalTargets.find((target) =>
    semanticTargetsEquivalent(target.canonicalIntendedTarget, intendedTarget)
  );
}

function appendCarrierResidueAndLabels(
  carrier: UiTestRunCarrier,
  residue: string[],
  behaviorLabels: UiTestBehaviorLabel[]
): UiTestRunCarrier {
  return uiTestRunCarrierSchema.parse({
    ...carrier,
    residue: uniqueStrings([...carrier.residue, ...residue]),
    behaviorLabels: uniqueStrings([...carrier.behaviorLabels, ...behaviorLabels])
  });
}

function upsertByKey<T extends Record<K, string>, K extends keyof T>(
  entries: T[],
  nextEntry: T,
  key: K
): T[] {
  const index = entries.findIndex((entry) => entry[key] === nextEntry[key]);

  if (index === -1) {
    return [...entries, nextEntry];
  }

  return entries.map((entry, entryIndex) =>
    entryIndex === index ? nextEntry : entry
  );
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function timestampDeltaMs(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0;
  }

  return endMs - startMs;
}
