import {
  type ClickCandidatePolicyPacket,
  type CursorObservationPacket,
  type IntersectionSignalPacket,
  type SemanticLocalizationPacket,
  type UiIntersectionPlanResult,
  type UiLocationResiduePacket
} from "./closedLoopUiTypes.js";

const minimumStableFrames = 3;
const maximumPointerTargetDistance = 8;
const minimumOverlapScore = 0.65;
const minimumHoverDeltaScore = 0.6;
const minimumCursorShapeChangeScore = 0.6;
const minimumLocalStabilityScore = 0.7;

function isNonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function hasUsableBbox(packet: SemanticLocalizationPacket): boolean {
  return packet.candidateBbox !== undefined && packet.candidateBbox.width > 0 && packet.candidateBbox.height > 0;
}

function hasCursorTargetObservation(packet: CursorObservationPacket | undefined): boolean {
  return (
    packet !== undefined &&
    packet.cursorVisible &&
    (packet.cursorPosition !== undefined || packet.cursorBbox !== undefined)
  );
}

function hasIntersectionEvidence(packet: IntersectionSignalPacket): boolean {
  return (
    (packet.pointerTargetDistance !== undefined &&
      packet.pointerTargetDistance <= maximumPointerTargetDistance) ||
    (packet.overlapScore !== undefined && packet.overlapScore >= minimumOverlapScore) ||
    (packet.hoverDeltaScore !== undefined && packet.hoverDeltaScore >= minimumHoverDeltaScore) ||
    (packet.cursorShapeChangeScore !== undefined &&
      packet.cursorShapeChangeScore >= minimumCursorShapeChangeScore)
  );
}

function hasStabilityEvidence(packet: IntersectionSignalPacket): boolean {
  return (
    packet.stabilityFrameCount !== undefined &&
    packet.stabilityFrameCount >= minimumStableFrames &&
    packet.localStabilityScore !== undefined &&
    packet.localStabilityScore >= minimumLocalStabilityScore
  );
}

function isConfidenceUsable(packet: IntersectionSignalPacket): boolean {
  return packet.confidence === "medium" || packet.confidence === "high";
}

export function evaluateIntersectionSignal(
  signalPacket: IntersectionSignalPacket | undefined
): IntersectionSignalPacket {
  if (signalPacket === undefined) {
    return {
      confidence: "low",
      licenseCandidateClick: false,
      reasons: ["No intersection signal packet was supplied."],
      residue: ["Frame-stream evidence is required before a candidate click can be licensed."]
    };
  }

  const reasons = [...signalPacket.reasons];
  const residue = [...signalPacket.residue];
  const hasIntersection = hasIntersectionEvidence(signalPacket);
  const hasStability = hasStabilityEvidence(signalPacket);
  const hasUsableConfidence = isConfidenceUsable(signalPacket);

  if (!hasIntersection) {
    residue.push("No sufficient pointer-target distance, overlap, hover, or cursor-shape signal was present.");
  }

  if (!hasStability) {
    residue.push("Intersection or hover evidence was not stable for enough frames.");
  }

  if (!hasUsableConfidence) {
    residue.push("Intersection confidence is too low to license a candidate click.");
  }

  const licenseCandidateClick =
    signalPacket.licenseCandidateClick && hasIntersection && hasStability && hasUsableConfidence;

  if (licenseCandidateClick) {
    reasons.push("Intersection and hover evidence are stable enough to prepare a policy-gated candidate click.");
  } else {
    reasons.push("Candidate click is not licensed by stable intersection evidence.");
  }

  return {
    ...signalPacket,
    licenseCandidateClick,
    reasons,
    residue
  };
}

export function buildClickCandidateFromIntersection(
  semanticPacket: SemanticLocalizationPacket,
  cursorPacket: CursorObservationPacket | undefined,
  signalPacket: IntersectionSignalPacket | undefined
): ClickCandidatePolicyPacket {
  const evaluatedSignal = evaluateIntersectionSignal(signalPacket);
  const semanticTarget = semanticPacket.target.trim();
  const proposedTargetDescription = semanticTarget
    ? `Candidate mouse_input for semantic target "${semanticTarget}" after intersection planning.`
    : "Candidate mouse_input cannot be targeted because no semantic target was declared.";

  const residue = [
    ...semanticPacket.ambiguityNotes,
    ...(cursorPacket?.trackingResidue ?? []),
    ...evaluatedSignal.residue,
    "No desktop action has been executed.",
    "Actual mouse_input remains gated by automation_policy_check and explicit user confirmation.",
    "Post-action verification is required before success can be claimed."
  ];

  if (!semanticTarget) {
    residue.push("Semantic target is missing.");
  }

  if (!hasUsableBbox(semanticPacket) && !hasCursorTargetObservation(cursorPacket)) {
    residue.push("No usable semantic envelope or cursor-target observation was supplied.");
  }

  if (!evaluatedSignal.licenseCandidateClick) {
    residue.push("Stable intersection witness has not licensed a candidate click.");
  }

  return {
    semanticTarget,
    proposedAction: "mouse_input",
    proposedTargetDescription,
    requiresPolicyCheck: true,
    requiresUserConfirmation: true,
    clickLicenseSource: "intersection_signal",
    postActionVerificationRequired: true,
    residue
  };
}

export function buildUiLocationResiduePacket(
  semanticPacket: SemanticLocalizationPacket,
  cursorPacket: CursorObservationPacket | undefined,
  signalPacket: IntersectionSignalPacket | undefined
): UiLocationResiduePacket {
  const evaluatedSignal = evaluateIntersectionSignal(signalPacket);
  const semanticTarget = semanticPacket.target.trim();
  const clickableRegionUncertainty: string[] = [];
  const coordinateTransformUncertainty: string[] = [];
  const pointerIntersectionUncertainty: string[] = [];
  const hoverStateUncertainty: string[] = [];
  const scaleOrDpiUncertainty: string[] = [];
  const occlusionOrOverlayRisk: string[] = [];
  const textOrIconAmbiguity = [...semanticPacket.ambiguityNotes];
  const accessibilityMetadataGap: string[] = [];
  const postClickVerificationGap: string[] = [];
  const repairPath: string[] = [];

  if (!semanticTarget) {
    clickableRegionUncertainty.push("Semantic target is missing.");
    repairPath.push("Declare a concrete semantic target before planning movement or click candidates.");
  }

  if (!hasUsableBbox(semanticPacket)) {
    clickableRegionUncertainty.push("No usable candidate bounding box was supplied.");
    repairPath.push("Collect a semantic localization packet with a positive-width, positive-height envelope.");
  }

  if (semanticPacket.confidence !== "high") {
    clickableRegionUncertainty.push(`Semantic localization confidence is ${semanticPacket.confidence}.`);
  }

  coordinateTransformUncertainty.push("No screen-to-frame coordinate transform has been witnessed in this planning layer.");
  scaleOrDpiUncertainty.push("No display scale or DPI metadata is available in the current packet set.");
  accessibilityMetadataGap.push("No accessibility metadata has been attached to confirm the element role or action.");
  postClickVerificationGap.push("No post-action verifier has been supplied for the expected state transition.");

  if (!hasCursorTargetObservation(cursorPacket)) {
    pointerIntersectionUncertainty.push("Cursor is not visibly localized against the target envelope.");
    repairPath.push("Add cursor observation before treating movement as a reversible probe.");
  }

  if (!evaluatedSignal.licenseCandidateClick) {
    pointerIntersectionUncertainty.push(...evaluatedSignal.residue);
    hoverStateUncertainty.push("Hover or intersection evidence does not yet license a candidate click.");
    repairPath.push("Gather stable frame-stream evidence before producing a policy-ready click candidate.");
  }

  if (semanticPacket.visualCues.length === 0) {
    textOrIconAmbiguity.push("No visual cues were supplied for the target.");
  }

  if (semanticPacket.ambiguityNotes.length > 0) {
    occlusionOrOverlayRisk.push("Semantic packet contains ambiguity notes that may include overlay or nearby-target risk.");
  }

  return {
    visualEnvelope:
      semanticPacket.coarseRegion !== undefined || semanticPacket.candidateBbox !== undefined
        ? {
            coarseRegion: semanticPacket.coarseRegion,
            candidateBbox: semanticPacket.candidateBbox,
            visualCues: semanticPacket.visualCues
          }
        : undefined,
    semanticTarget,
    candidateBbox: semanticPacket.candidateBbox,
    clickableRegionUncertainty,
    coordinateTransformUncertainty,
    pointerIntersectionUncertainty,
    hoverStateUncertainty,
    scaleOrDpiUncertainty,
    occlusionOrOverlayRisk,
    textOrIconAmbiguity,
    accessibilityMetadataGap,
    postClickVerificationGap,
    repairPath
  };
}

export function isClickCandidatePolicyReady(
  semanticPacket: SemanticLocalizationPacket,
  cursorPacket: CursorObservationPacket | undefined,
  signalPacket: IntersectionSignalPacket | undefined,
  clickCandidatePacket: ClickCandidatePolicyPacket
): boolean {
  const evaluatedSignal = evaluateIntersectionSignal(signalPacket);

  return (
    isNonEmpty(clickCandidatePacket.semanticTarget) &&
    clickCandidatePacket.semanticTarget === semanticPacket.target.trim() &&
    clickCandidatePacket.proposedAction === "mouse_input" &&
    clickCandidatePacket.requiresPolicyCheck === true &&
    clickCandidatePacket.requiresUserConfirmation === true &&
    clickCandidatePacket.clickLicenseSource === "intersection_signal" &&
    clickCandidatePacket.postActionVerificationRequired === true &&
    clickCandidatePacket.residue.length > 0 &&
    (hasUsableBbox(semanticPacket) || hasCursorTargetObservation(cursorPacket)) &&
    evaluatedSignal.licenseCandidateClick
  );
}

export function buildUiIntersectionPlan(
  semanticPacket: SemanticLocalizationPacket,
  cursorPacket: CursorObservationPacket | undefined,
  signalPacket: IntersectionSignalPacket | undefined
): UiIntersectionPlanResult {
  return {
    clickCandidatePolicyPacket: buildClickCandidateFromIntersection(
      semanticPacket,
      cursorPacket,
      signalPacket
    ),
    uiLocationResiduePacket: buildUiLocationResiduePacket(semanticPacket, cursorPacket, signalPacket),
    policyReminder: {
      planningOnly: true,
      planningActionClass: "observe",
      actualMouseInputAction: "mouse_input",
      actualMouseInputRequiresPolicyCheck: true,
      actualMouseInputRequiresUserConfirmation: true,
      executionToolAvailable: false,
      postActionVerificationRequired: true,
      statement:
        "This plan does not move the mouse or click. Actual mouse_input still requires automation_policy_check, explicit user confirmation, and post-action verification."
    }
  };
}
