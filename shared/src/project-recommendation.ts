import type { LearningResource } from "./roadmap.js";
import type { GapAnalysisItem } from "./gap-analysis.js";

export type ProjectRecommendationType = "portfolio" | "open-source";

export type ProjectDifficulty = "Easy" | "Medium" | "Hard";

export type ProjectRecommendation = {
  title: string;
  type: ProjectRecommendationType;
  whyRecommended: string;
  coveredSkills: string[];
  difficulty: ProjectDifficulty;
  estimatedDurationWeeks: number;
  resources: LearningResource[];
};

export type ProjectRecommendationOutput = {
  recommendations: ProjectRecommendation[];
  generatedFromNote: string;
};

export type ProjectRecommendationRequest = {
  targetRole: string;
  gapAnalysisItems: GapAnalysisItem[];
  targetStack?: string[];
};
