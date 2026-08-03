import { Router } from "express";
import type { GapAnalysisRequest } from "@rsgp/shared";
import { generateGapAnalysis } from "../services/gapAnalysisEngine.js";
import { logEstimatedTokenUsage } from "../services/tokenUsage.js";

const router = Router();

const validateGapAnalysisRequest = (body: unknown): GapAnalysisRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<GapAnalysisRequest>;

  if (!candidate.parsedResume) {
    throw new Error("parsedResume is required.");
  }

  if (typeof candidate.targetRole !== "string" || candidate.targetRole.trim().length < 2) {
    throw new Error("targetRole is required.");
  }

  return {
    parsedResume: candidate.parsedResume,
    targetRole: candidate.targetRole.trim(),
    targetStack: Array.isArray(candidate.targetStack) ? candidate.targetStack : [],
    acceptedJobDescriptions: Array.isArray(candidate.acceptedJobDescriptions)
      ? candidate.acceptedJobDescriptions
      : []
  };
};

router.post("/generate", (request, response, next) => {
  try {
    const gapAnalysisRequest = validateGapAnalysisRequest(request.body);
    const gapAnalysis = generateGapAnalysis(gapAnalysisRequest);

    logEstimatedTokenUsage({
      route: "POST /gap-analysis/generate",
      input: gapAnalysisRequest,
      output: gapAnalysis
    });
    response.json(gapAnalysis);
  } catch (error) {
    next(error);
  }
});

export const gapAnalysisRouter = router;
