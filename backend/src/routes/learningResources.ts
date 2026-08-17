import { Router } from "express";
import type { LearningResourceRequest, TimelineWeeks } from "@rsgp/shared";
import { recommendLearningResources } from "../services/learningResourceEngine.js";
import { createLlmProvider } from "../services/llmProvider.js";
import { isSupportedTimeline } from "../services/roadmapGenerator.js";
import { logEstimatedTokenUsage } from "../services/tokenUsage.js";

const router = Router();

const validateLearningResourceRequest = (body: unknown): LearningResourceRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<LearningResourceRequest>;

  if (typeof candidate.targetRole !== "string" || candidate.targetRole.trim().length < 2) {
    throw new Error("targetRole is required.");
  }

  if (!Array.isArray(candidate.gapAnalysisItems)) {
    throw new Error("gapAnalysisItems is required.");
  }

  if (
    candidate.timelineWeeks !== undefined &&
    (typeof candidate.timelineWeeks !== "number" || !isSupportedTimeline(candidate.timelineWeeks))
  ) {
    throw new Error("timelineWeeks must be 8, 12, or 24.");
  }

  return {
    targetRole: candidate.targetRole.trim(),
    gapAnalysisItems: candidate.gapAnalysisItems,
    targetStack: Array.isArray(candidate.targetStack) ? candidate.targetStack : [],
    timelineWeeks: (candidate.timelineWeeks ?? 12) as TimelineWeeks,
    roadmapMilestones: Array.isArray(candidate.roadmapMilestones)
      ? candidate.roadmapMilestones
      : [],
    projectRecommendations: Array.isArray(candidate.projectRecommendations)
      ? candidate.projectRecommendations
      : [],
    jobDescriptionCount:
      typeof candidate.jobDescriptionCount === "number" ? candidate.jobDescriptionCount : 0
  };
};

router.post("/recommend", async (request, response, next) => {
  try {
    const learningResourceRequest = validateLearningResourceRequest(request.body);
    const learningResources = await recommendLearningResources(learningResourceRequest, {
      llmProvider: createLlmProvider()
    });

    logEstimatedTokenUsage({
      route: "POST /learning-resources/recommend",
      input: learningResourceRequest,
      output: learningResources
    });
    response.json(learningResources);
  } catch (error) {
    next(error);
  }
});

export const learningResourceRouter = router;
