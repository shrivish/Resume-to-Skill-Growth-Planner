import { Router } from "express";
import type { RoadmapRequest, TimelineWeeks } from "@rsgp/shared";
import { generateRoadmap, isSupportedTimeline } from "../services/roadmapGenerator.js";
import { logEstimatedTokenUsage } from "../services/tokenUsage.js";

const router = Router();

const validateRoadmapRequest = (body: unknown): RoadmapRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<RoadmapRequest>;

  if (typeof candidate.targetRole !== "string" || candidate.targetRole.trim().length < 2) {
    throw new Error("targetRole is required.");
  }

  if (
    typeof candidate.timelineWeeks !== "number" ||
    !isSupportedTimeline(candidate.timelineWeeks)
  ) {
    throw new Error("timelineWeeks must be 8, 12, or 24.");
  }

  if (!Array.isArray(candidate.gapAnalysisItems)) {
    throw new Error("gapAnalysisItems is required.");
  }

  return {
    targetRole: candidate.targetRole.trim(),
    timelineWeeks: candidate.timelineWeeks as TimelineWeeks,
    gapAnalysisItems: candidate.gapAnalysisItems,
    targetStack: Array.isArray(candidate.targetStack) ? candidate.targetStack : [],
    jobDescriptionCount:
      typeof candidate.jobDescriptionCount === "number" ? candidate.jobDescriptionCount : 0
  };
};

router.post("/generate", (request, response, next) => {
  try {
    const roadmapRequest = validateRoadmapRequest(request.body);
    const roadmap = generateRoadmap(roadmapRequest);

    logEstimatedTokenUsage({
      route: "POST /roadmaps/generate",
      input: roadmapRequest,
      output: roadmap
    });
    response.json(roadmap);
  } catch (error) {
    next(error);
  }
});

export const roadmapRouter = router;
