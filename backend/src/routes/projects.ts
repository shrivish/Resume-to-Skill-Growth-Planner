import { Router } from "express";
import type { ProjectRecommendationRequest } from "@rsgp/shared";
import { recommendProjects } from "../services/projectRecommendationEngine.js";
import { logEstimatedTokenUsage } from "../services/tokenUsage.js";

const router = Router();

const validateProjectRequest = (body: unknown): ProjectRecommendationRequest => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body is required.");
  }

  const candidate = body as Partial<ProjectRecommendationRequest>;

  if (typeof candidate.targetRole !== "string" || candidate.targetRole.trim().length < 2) {
    throw new Error("targetRole is required.");
  }

  if (!Array.isArray(candidate.gapAnalysisItems)) {
    throw new Error("gapAnalysisItems is required.");
  }

  return {
    targetRole: candidate.targetRole.trim(),
    gapAnalysisItems: candidate.gapAnalysisItems,
    targetStack: Array.isArray(candidate.targetStack) ? candidate.targetStack : []
  };
};

router.post("/recommend", (request, response, next) => {
  try {
    const projectRequest = validateProjectRequest(request.body);
    const projectRecommendations = recommendProjects(projectRequest);

    logEstimatedTokenUsage({
      route: "POST /projects/recommend",
      input: projectRequest,
      output: projectRecommendations
    });
    response.json(projectRecommendations);
  } catch (error) {
    next(error);
  }
});

export const projectRouter = router;
