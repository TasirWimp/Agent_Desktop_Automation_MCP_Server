import { describe, expect, it } from "vitest";
import { evaluateAutomationPolicy } from "../src/policy/automationPolicy.js";
import {
  type ClickCandidatePolicyPacket,
  type CursorObservationPacket,
  type IntersectionSignalPacket,
  type SemanticLocalizationPacket
} from "../src/uiPlanning/closedLoopUiTypes.js";
import {
  buildClickCandidateFromIntersection,
  buildUiIntersectionPlan,
  buildUiLocationResiduePacket,
  evaluateIntersectionSignal,
  isClickCandidatePolicyReady
} from "../src/uiPlanning/intersectionPolicy.js";

const highConfidenceSemanticPacket: SemanticLocalizationPacket = {
  target: "Save button",
  coarseRegion: "top-right toolbar",
  candidateBbox: {
    x: 920,
    y: 24,
    width: 72,
    height: 32
  },
  confidence: "high",
  visualCues: ["toolbar", "save label", "blue button"],
  ambiguityNotes: []
};

const cursorObservationPacket: CursorObservationPacket = {
  frameId: "frame-001",
  cursorVisible: true,
  cursorPosition: {
    x: 948,
    y: 39
  },
  confidence: "high",
  trackingResidue: ["Cursor was visible in the frame stream."]
};

const stableIntersectionSignalPacket: IntersectionSignalPacket = {
  pointerTargetDistance: 3,
  overlapScore: 0.82,
  hoverDeltaScore: 0.77,
  cursorShapeChangeScore: 0.71,
  localStabilityScore: 0.91,
  stabilityFrameCount: 4,
  confidence: "high",
  licenseCandidateClick: true,
  reasons: ["Cursor envelope overlaps the semantic target envelope."],
  residue: ["Actual click has not been executed."]
};

describe("closed-loop UI intersection planning", () => {
  it("does not license click readiness from an LLM semantic packet alone", () => {
    const plan = buildUiIntersectionPlan(highConfidenceSemanticPacket, undefined, undefined);

    expect(
      isClickCandidatePolicyReady(
        highConfidenceSemanticPacket,
        undefined,
        undefined,
        plan.clickCandidatePolicyPacket
      )
    ).toBe(false);
    expect(plan.clickCandidatePolicyPacket.residue).toContain(
      "Stable intersection witness has not licensed a candidate click."
    );
  });

  it("does not license click readiness from high LLM confidence alone", () => {
    const signal = evaluateIntersectionSignal(undefined);
    const candidate = buildClickCandidateFromIntersection(
      highConfidenceSemanticPacket,
      undefined,
      signal
    );

    expect(highConfidenceSemanticPacket.confidence).toBe("high");
    expect(signal.licenseCandidateClick).toBe(false);
    expect(
      isClickCandidatePolicyReady(highConfidenceSemanticPacket, undefined, signal, candidate)
    ).toBe(false);
  });

  it("builds a policy-gated candidate from stable intersection without executing mouse input", () => {
    const plan = buildUiIntersectionPlan(
      highConfidenceSemanticPacket,
      cursorObservationPacket,
      stableIntersectionSignalPacket
    );

    expect(plan.clickCandidatePolicyPacket.proposedAction).toBe("mouse_input");
    expect(plan.clickCandidatePolicyPacket.requiresPolicyCheck).toBe(true);
    expect(plan.clickCandidatePolicyPacket.requiresUserConfirmation).toBe(true);
    expect(plan.clickCandidatePolicyPacket.postActionVerificationRequired).toBe(true);
    expect(plan.policyReminder.executionToolAvailable).toBe(false);
    expect(
      isClickCandidatePolicyReady(
        highConfidenceSemanticPacket,
        cursorObservationPacket,
        stableIntersectionSignalPacket,
        plan.clickCandidatePolicyPacket
      )
    ).toBe(true);
  });

  it("blocks candidate readiness when the semantic target is missing", () => {
    const semanticPacket = {
      ...highConfidenceSemanticPacket,
      target: "   "
    };
    const candidate = buildClickCandidateFromIntersection(
      semanticPacket,
      cursorObservationPacket,
      stableIntersectionSignalPacket
    );

    expect(
      isClickCandidatePolicyReady(
        semanticPacket,
        cursorObservationPacket,
        stableIntersectionSignalPacket,
        candidate
      )
    ).toBe(false);
    expect(candidate.residue).toContain("Semantic target is missing.");
  });

  it("blocks candidate readiness when post-action verification is not required", () => {
    const candidate = buildClickCandidateFromIntersection(
      highConfidenceSemanticPacket,
      cursorObservationPacket,
      stableIntersectionSignalPacket
    );
    const unsafeCandidate = {
      ...candidate,
      postActionVerificationRequired: false
    } as unknown as ClickCandidatePolicyPacket;

    expect(
      isClickCandidatePolicyReady(
        highConfidenceSemanticPacket,
        cursorObservationPacket,
        stableIntersectionSignalPacket,
        unsafeCandidate
      )
    ).toBe(false);
  });

  it("produces residue for uncertain intersection evidence", () => {
    const uncertainSignal: IntersectionSignalPacket = {
      overlapScore: 0.1,
      localStabilityScore: 0.2,
      stabilityFrameCount: 1,
      confidence: "low",
      licenseCandidateClick: false,
      reasons: ["Cursor is near a visually similar neighbor."],
      residue: ["Hover effect was not stable."]
    };

    const residue = buildUiLocationResiduePacket(
      highConfidenceSemanticPacket,
      cursorObservationPacket,
      uncertainSignal
    );

    expect(residue.pointerIntersectionUncertainty.length).toBeGreaterThan(0);
    expect(residue.hoverStateUncertainty).toContain(
      "Hover or intersection evidence does not yet license a candidate click."
    );
    expect(residue.repairPath).toContain(
      "Gather stable frame-stream evidence before producing a policy-ready click candidate."
    );
  });

  it("keeps proposed mouse_input governed by automation_policy_check and confirmation", () => {
    const candidate = buildClickCandidateFromIntersection(
      highConfidenceSemanticPacket,
      cursorObservationPacket,
      stableIntersectionSignalPacket
    );
    const policyResult = evaluateAutomationPolicy({
      actionType: candidate.proposedAction,
      intent: `Execute confirmed click candidate for ${candidate.semanticTarget}.`,
      target: candidate.proposedTargetDescription
    });

    expect(candidate.requiresPolicyCheck).toBe(true);
    expect(candidate.requiresUserConfirmation).toBe(true);
    expect(policyResult.decision).toBe("requires_confirmation");
    expect(policyResult.requiresUserConfirmation).toBe(true);
  });
});
