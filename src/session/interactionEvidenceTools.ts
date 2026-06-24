import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desktopActionRiskSchema,
  desktopCompactSemanticLandingAssessmentSchema,
  desktopInteractionScopeSchema,
  desktopPointSchema,
  desktopRectangleSchema,
  desktopSubmitWorkflowStateClaimInputSchema,
  normalizeNoContradiction,
  type DesktopPerceptionDigest
} from "../policy/sessionLicensePolicy.js";
import type { DesktopInteractionProvider } from "../providers/desktopProvider.js";
import {
  evaluateAndRecordClickCandidate
} from "./clickCandidateWitnessTools.js";
import {
  recordPerceptionDigest
} from "./perceptionDigestTools.js";
import {
  recordTransitionAssessment
} from "./sessionTools.js";
import {
  InMemoryDesktopSessionStore,
  SessionStoreError
} from "./sessionStore.js";
import {
  recordWorkflowStateClaim
} from "./workflowStateTools.js";

export interface InteractionEvidenceToolRuntime {
  sessionStore: InMemoryDesktopSessionStore;
  desktopProvider: DesktopInteractionProvider;
  now: () => string;
  generateId: (prefix: string) => string;
}

const interactionEvidenceModes = [
  "new_target",
  "same_target",
  "repair_target"
] as const;

const perceptionEvidenceInputSchema = z.object({
  currentScene: z.string().min(1).max(2000),
  currentAnchor: z.string().min(1).max(1000),
  targetVisibility: z.enum(["visible", "not_visible", "uncertain"]),
  anchorVisibility: z.enum(["visible", "not_visible", "uncertain"]),
  contradictionToPriorClaim: z.string().min(1).max(2000).nullable().optional(),
  staleCarryoverReviewed: z.literal(true),
  currentEvidence: z.string().min(1).max(2000)
});

const workflowEvidenceInputSchema = desktopSubmitWorkflowStateClaimInputSchema
  .omit({
    sessionId: true,
    observationId: true,
    perceptionDigestId: true,
    targetScope: true,
    intendedElementTarget: true
  })
  .extend({
    intendedElementTarget: z.string().min(1).max(1000).optional()
  });

const transitionEvidenceInputSchema = z.object({
  actionId: z.string().min(1),
  assessment: desktopCompactSemanticLandingAssessmentSchema
});

const clickCandidateEvidenceInputSchema = z.object({
  workflowStateClaimId: z.string().min(1).optional(),
  movementActionId: z.string().min(1).optional(),
  candidatePoint: desktopPointSchema.optional(),
  candidateBbox: desktopRectangleSchema.optional(),
  risk: desktopActionRiskSchema.optional()
});

const submitInteractionEvidenceInputSchema = z.object({
  sessionId: z.string().min(1),
  observationId: z.string().min(1),
  targetScope: desktopInteractionScopeSchema,
  intendedTarget: z.string().min(1).max(1000),
  evidenceMode: z.enum(interactionEvidenceModes),
  perception: perceptionEvidenceInputSchema,
  workflow: workflowEvidenceInputSchema.optional(),
  transitionAssessment: transitionEvidenceInputSchema.optional(),
  clickCandidate: clickCandidateEvidenceInputSchema.optional()
});

type SubmitInteractionEvidenceInput = z.infer<
  typeof submitInteractionEvidenceInputSchema
>;

function structuredResult(value: Record<string, unknown>, isError = false) {
  return {
    structuredContent: value,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    isError
  };
}

function interactionEvidenceToolError(error: unknown) {
  if (error instanceof SessionStoreError) {
    return structuredResult(
      {
        error: {
          code: error.code,
          message: error.message
        },
        residue: ["Interaction evidence submission did not complete."]
      },
      true
    );
  }

  return structuredResult(
    {
      error: {
        code: "interaction_evidence_tool_error",
        message:
          error instanceof Error ? error.message : "Unknown interaction evidence tool error."
      },
      residue: ["Interaction evidence submission did not complete."]
    },
    true
  );
}

function continuityForMode(
  input: SubmitInteractionEvidenceInput
): DesktopPerceptionDigest["continuityWithPriorClaim"] {
  if (input.evidenceMode === "same_target") {
    return "consistent";
  }

  if (input.evidenceMode === "repair_target") {
    return input.perception.targetVisibility === "uncertain"
      ? "uncertain"
      : "not_applicable";
  }

  return "not_applicable";
}

function noContradictionForMode(input: SubmitInteractionEvidenceInput):
  | { ok: true; contradiction: string | null; residue: string[] }
  | { ok: false; error: { code: string; message: string }; residue: string[] } {
  const rawContradiction = input.perception.contradictionToPriorClaim ?? null;
  const normalized = normalizeNoContradiction(rawContradiction);

  if (
    (input.evidenceMode === "new_target" || input.evidenceMode === "same_target") &&
    normalized !== null
  ) {
    return {
      ok: false,
      error: {
        code: "interaction_evidence_contradiction_present",
        message:
          `${input.evidenceMode} evidence must be non-contradicted current evidence. Use repair_target for repair/probe evidence.`
      },
      residue: [
        `contradictionToPriorClaim: ${JSON.stringify(rawContradiction)}.`,
        "No perception digest, workflow claim, transition assessment, or click candidate was recorded."
      ]
    };
  }

  const normalizedResidue =
    rawContradiction !== null && normalized === null
      ? [
          `contradictionToPriorClaim sentinel ${JSON.stringify(rawContradiction)} was normalized to JSON null before recording interaction evidence.`
        ]
      : [];

  return {
    ok: true,
    contradiction: normalized,
    residue: normalizedResidue
  };
}

function nextRequiredStepFor(input: {
  status: "accepted" | "partial";
  sessionId: string;
  observationId: string;
  targetScope: SubmitInteractionEvidenceInput["targetScope"];
  intendedTarget: string;
  perceptionDigestId?: string;
  workflowStateClaimId?: string;
  hoverTargetWitnessId?: string;
  failedStep?: string;
  failedCode?: string;
  clickCandidateStatus?: string;
}) {
  if (input.failedStep !== undefined) {
    if (
      input.failedStep === "click_candidate" &&
      input.failedCode === "click_candidate_movement_action_required"
    ) {
      return {
        tool: "desktop_submit_interaction_evidence",
        instruction:
          "Click candidate needs movement evidence; resubmit with clickCandidate.movementActionId or include transitionAssessment.actionId for the same movement action. Do not call desktop_click until hoverTargetWitnessId is returned.",
        arguments: {
          sessionId: input.sessionId,
          observationId: input.observationId,
          targetScope: input.targetScope,
          intendedTarget: input.intendedTarget
        }
      };
    }

    return {
      tool: "desktop_submit_interaction_evidence",
      instruction:
        `Repair ${input.failedStep} for the latest screenshot-bearing observation before requesting mutation. Do not call desktop_click until hoverTargetWitnessId is returned.`,
      arguments: {
        sessionId: input.sessionId,
        observationId: input.observationId,
        targetScope: input.targetScope,
        intendedTarget: input.intendedTarget
      }
    };
  }

  if (input.hoverTargetWitnessId !== undefined) {
    return {
      tool: "desktop_click",
      instruction:
        "Click may now be requested with the returned perceptionDigestId, workflowStateClaimId, hoverTargetWitnessId, and matching click point; then observe the click transition.",
      arguments: {
        sessionId: input.sessionId,
        preActionObservationId: input.observationId,
        targetScope: input.targetScope,
        perceptionDigestId: input.perceptionDigestId,
        workflowStateClaimId: input.workflowStateClaimId,
        hoverTargetWitnessId: input.hoverTargetWitnessId
      }
    };
  }

  if (input.clickCandidateStatus !== undefined) {
    if (
      input.clickCandidateStatus.startsWith("workflow_") ||
      input.clickCandidateStatus.startsWith("perception_")
    ) {
      return {
        tool: "desktop_submit_interaction_evidence",
        instruction:
          `Click candidate is ${input.clickCandidateStatus}; submit corrected current evidence for the same latest observation before clicking.`,
        arguments: {
          sessionId: input.sessionId,
          observationId: input.observationId,
          targetScope: input.targetScope,
          intendedTarget: input.intendedTarget
        }
      };
    }

    if (input.clickCandidateStatus === "transition_not_audited") {
      return {
        tool: "desktop_submit_interaction_evidence",
        instruction:
          "Click candidate still needs supported semantic landing evidence; submit transitionAssessment for the follow-up observation or move again as a relational probe.",
        arguments: {
          sessionId: input.sessionId,
          observationId: input.observationId,
          targetScope: input.targetScope,
          intendedTarget: input.intendedTarget,
          perceptionDigestId: input.perceptionDigestId
        }
      };
    }

    return {
      tool: "desktop_move_mouse",
      instruction:
        "Click candidate is not ready; use a relational movement probe or submit corrected current evidence before clicking.",
      arguments: {
        sessionId: input.sessionId,
        preActionObservationId: input.observationId,
        targetScope: input.targetScope,
        perceptionDigestId: input.perceptionDigestId,
        intendedSemanticTarget: input.intendedTarget
      }
    };
  }

  return {
    tool: "desktop_move_mouse",
    instruction:
      "Use the returned perceptionDigestId for relational movement, or submit workflow/candidate evidence when preparing a click/type action.",
    arguments: {
      sessionId: input.sessionId,
      preActionObservationId: input.observationId,
      targetScope: input.targetScope,
      perceptionDigestId: input.perceptionDigestId,
      intendedSemanticTarget: input.intendedTarget
    }
  };
}

export function registerInteractionEvidenceTools(
  server: McpServer,
  runtime: InteractionEvidenceToolRuntime
): void {
  server.registerTool(
    "desktop_submit_interaction_evidence",
    {
      title: "Submit Desktop Interaction Evidence",
      description:
        "Record compact client-authored perception, optional workflow, optional transition assessment, and optional click-candidate evidence for the latest screenshot-bearing observation. This never observes, moves, clicks, types, launches apps, or inspects pixels.",
      inputSchema: submitInteractionEvidenceInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input) => {
      try {
        const parsedInput = submitInteractionEvidenceInputSchema.parse(input);
        const contradictionCheck = noContradictionForMode(parsedInput);

        if (!contradictionCheck.ok) {
          return structuredResult(
            {
              error: contradictionCheck.error,
              residue: contradictionCheck.residue
            },
            true
          );
        }

        const created: Record<string, unknown> = {};
        const failures: Array<{
          step: string;
          error: {
            code: string;
            message: string;
          };
          residue: string[];
        }> = [];
        const residue = [
          "Interaction evidence helper did not observe, inspect pixels, move, click, type, launch apps, or bypass policy.",
          `evidenceMode: ${parsedInput.evidenceMode}.`,
          ...contradictionCheck.residue
        ];

        const digestResult = recordPerceptionDigest(runtime, {
          sessionId: parsedInput.sessionId,
          observationId: parsedInput.observationId,
          targetScope: parsedInput.targetScope,
          intendedTarget: parsedInput.intendedTarget,
          currentScene: parsedInput.perception.currentScene,
          currentAnchor: parsedInput.perception.currentAnchor,
          targetVisibility: parsedInput.perception.targetVisibility,
          anchorVisibility: parsedInput.perception.anchorVisibility,
          continuityWithPriorClaim: continuityForMode(parsedInput),
          contradictionToPriorClaim: contradictionCheck.contradiction,
          staleCarryoverReviewed: true,
          currentEvidence: parsedInput.perception.currentEvidence
        });

        if (!digestResult.ok) {
          return structuredResult(
            {
              sessionId: parsedInput.sessionId,
              status: "blocked",
              error: digestResult.error,
              failures: [
                {
                  step: "perception_digest",
                  error: digestResult.error,
                  residue: digestResult.residue
                }
              ],
              nextRequiredStep: nextRequiredStepFor({
                status: "partial",
                sessionId: parsedInput.sessionId,
                observationId: parsedInput.observationId,
                targetScope: parsedInput.targetScope,
                intendedTarget: parsedInput.intendedTarget,
                failedStep: "perception_digest"
              }),
              residue: digestResult.residue
            },
            true
          );
        }

        created.perceptionDigest = digestResult.perceptionDigest;
        const perceptionDigestId = digestResult.perceptionDigestId;
        let workflowStateClaimId = parsedInput.clickCandidate?.workflowStateClaimId;
        let hoverTargetWitnessId: string | undefined;
        let clickCandidateStatus: string | undefined;

        if (failures.length === 0 && parsedInput.transitionAssessment !== undefined) {
          const existingTransitionGate = runtime.sessionStore.getTransitionGate(
            parsedInput.sessionId,
            parsedInput.transitionAssessment.actionId
          );

          if (existingTransitionGate?.semanticLandingAssessment !== undefined) {
            created.transitionGate = existingTransitionGate;
            residue.push(
              "Existing semantic landing assessment was reused for the requested transition action."
            );
          } else {
            const transitionResult = recordTransitionAssessment(runtime, {
              sessionId: parsedInput.sessionId,
              actionId: parsedInput.transitionAssessment.actionId,
              perceptionDigestId,
              assessment: parsedInput.transitionAssessment.assessment
            });

            if (transitionResult.ok) {
              created.transitionGate = transitionResult.transitionGate;
            } else {
              failures.push({
                step: "transition_assessment",
                error: transitionResult.error,
                residue: transitionResult.residue
              });
            }
          }
        }

        if (failures.length === 0 && parsedInput.workflow !== undefined) {
          const workflowResult = recordWorkflowStateClaim(runtime, {
            ...parsedInput.workflow,
            sessionId: parsedInput.sessionId,
            observationId: parsedInput.observationId,
            perceptionDigestId,
            targetScope: parsedInput.targetScope,
            intendedElementTarget:
              parsedInput.workflow.intendedElementTarget ?? parsedInput.intendedTarget
          });

          if (workflowResult.ok) {
            created.workflowStateClaim = workflowResult.workflowStateClaim;
            if (workflowResult.transitionGate !== undefined) {
              created.workflowTransitionGate = workflowResult.transitionGate;
            }
            workflowStateClaimId = workflowResult.workflowStateClaimId;
          } else {
            failures.push({
              step: "workflow_state_claim",
              error: workflowResult.error,
              residue: workflowResult.residue
            });
          }
        }

        if (failures.length === 0 && parsedInput.clickCandidate !== undefined) {
          const movementActionId =
            parsedInput.clickCandidate.movementActionId ??
            parsedInput.transitionAssessment?.actionId;

          if (movementActionId === undefined) {
            failures.push({
              step: "click_candidate",
              error: {
                code: "click_candidate_movement_action_required",
                message:
                  "clickCandidate requires movementActionId or transitionAssessment.actionId to bind hover readiness to a movement gate."
              },
              residue: [
                "No click candidate was evaluated.",
                "Submit clickCandidate.movementActionId, or include transitionAssessment for the movement action in the same helper call.",
                "Do not call desktop_click until hoverTargetWitnessId is returned."
              ]
            });
          }
        }

        if (failures.length === 0 && parsedInput.clickCandidate !== undefined) {
          const movementActionId =
            parsedInput.clickCandidate.movementActionId ??
            parsedInput.transitionAssessment?.actionId;
          const candidateResult = evaluateAndRecordClickCandidate(runtime, {
            sessionId: parsedInput.sessionId,
            observationId: parsedInput.observationId,
            perceptionDigestId,
            workflowStateClaimId,
            movementActionId,
            targetScope: parsedInput.targetScope,
            intendedSemanticTarget: parsedInput.intendedTarget,
            candidatePoint: parsedInput.clickCandidate.candidatePoint,
            candidateBbox: parsedInput.clickCandidate.candidateBbox,
            risk: parsedInput.clickCandidate.risk
          });

          if (candidateResult.ok) {
            clickCandidateStatus = candidateResult.status;
            created.clickCandidateWitness = candidateResult.clickCandidateWitness;

            if (candidateResult.hoverTargetWitness !== undefined) {
              created.hoverTargetWitness = candidateResult.hoverTargetWitness;
              hoverTargetWitnessId = candidateResult.hoverTargetWitness.witnessId;
            }
          } else {
            failures.push({
              step: "click_candidate",
              error: candidateResult.error,
              residue: candidateResult.residue
            });
          }
        }

        const status = failures.length === 0 ? "accepted" : "partial";

        return structuredResult({
          sessionId: parsedInput.sessionId,
          status,
          evidenceMode: parsedInput.evidenceMode,
          perceptionDigestId,
          workflowStateClaimId,
          hoverTargetWitnessId,
          clickCandidateStatus,
          created,
          failures,
          nextRequiredStep: nextRequiredStepFor({
            status,
            sessionId: parsedInput.sessionId,
            observationId: parsedInput.observationId,
            targetScope: parsedInput.targetScope,
            intendedTarget: parsedInput.intendedTarget,
            perceptionDigestId,
            workflowStateClaimId,
            hoverTargetWitnessId,
            failedStep: failures[0]?.step,
            failedCode: failures[0]?.error.code,
            clickCandidateStatus
          }),
          residue: [
            ...residue,
            failures.length === 0
              ? "Requested interaction evidence was recorded through existing policy validation paths."
              : "Perception evidence was recorded, but a later requested evidence step failed; use the returned IDs and nextRequiredStep for repair."
          ]
        });
      } catch (error: unknown) {
        return interactionEvidenceToolError(error);
      }
    }
  );
}
