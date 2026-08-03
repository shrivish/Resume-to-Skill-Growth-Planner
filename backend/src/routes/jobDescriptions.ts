import { Router } from "express";
import type { JobDescriptionAnalysisResponse } from "@rsgp/shared";
import { HeuristicJobDescriptionParser } from "../services/jobDescriptionParser.js";
import {
  normalizeTargetStack,
  validateJobDescriptions,
  validateTargetRole
} from "../services/jobDescriptionValidation.js";

const router = Router();
const parser = new HeuristicJobDescriptionParser();

router.post("/analyze", async (request, response, next) => {
  try {
    const targetRole = validateTargetRole(request.body.targetRole);
    const targetStack = normalizeTargetStack(request.body.targetStack);
    const { normalizedJobDescriptions, warnings } = validateJobDescriptions(
      request.body.jobDescriptions
    );

    if (normalizedJobDescriptions.length === 0 && targetStack.length === 0) {
      const payload: JobDescriptionAnalysisResponse = {
        targetRole,
        targetStack,
        acceptedJobDescriptions: [],
        rejectedJobDescriptions: [],
        warnings: [
          ...warnings,
          {
            code: "target_stack.required_without_jd",
            message:
              "No job descriptions were provided. Add a target stack or language focus before generating a roadmap.",
            severity: "warning",
            fieldPath: "targetStack"
          }
        ],
        needsTargetStack: true
      };

      response.status(422).json(payload);
      return;
    }

    const parsedJobDescriptions = await Promise.all(
      normalizedJobDescriptions.map((jobDescription) =>
        parser.parse({
          id: jobDescription.id,
          rawText: jobDescription.rawText,
          sourceLabel: jobDescription.sourceLabel,
          targetRole
        })
      )
    );

    const acceptedJobDescriptions = parsedJobDescriptions.filter(
      (jobDescription) => jobDescription.roleFit !== "unrelated"
    );
    const rejectedJobDescriptions = parsedJobDescriptions.filter(
      (jobDescription) => jobDescription.roleFit === "unrelated"
    );
    const parsedWarnings = parsedJobDescriptions.flatMap(
      (jobDescription) => jobDescription.warnings ?? []
    );
    const inferredStack = Array.from(
      new Set([
        ...targetStack,
        ...acceptedJobDescriptions.flatMap((jobDescription) => jobDescription.techStack)
      ])
    );
    const needsTargetStack = acceptedJobDescriptions.length === 0 && inferredStack.length === 0;

    const payload: JobDescriptionAnalysisResponse = {
      targetRole,
      targetStack: inferredStack,
      acceptedJobDescriptions,
      rejectedJobDescriptions,
      warnings: [
        ...warnings,
        ...parsedWarnings,
        ...(needsTargetStack
          ? [
              {
                code: "target_stack.required_after_jd_rejection",
                message:
                  "No usable job descriptions remain after role-fit checks. Add a target stack or language focus before generating a roadmap.",
                severity: "warning" as const,
                fieldPath: "targetStack"
              }
            ]
          : [])
      ],
      needsTargetStack
    };

    if (normalizedJobDescriptions.length > 0 && acceptedJobDescriptions.length === 0) {
      response.status(422).json(payload);
      return;
    }

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

export const jobDescriptionRouter = router;
