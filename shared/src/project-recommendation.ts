import type { LearningResource } from "./roadmap.js";
import type { GapAnalysisItem } from "./gap-analysis.js";
import type { RoadmapMilestone } from "./roadmap.js";
import type { ContractWarning, TimelineWeeks } from "./common.js";

export type ProjectRecommendationType = "portfolio" | "proof-of-work";

export type ProjectDifficulty = "Easy" | "Medium" | "Stretch";

export type ProjectRecommendation = {
  title: string;
  type: ProjectRecommendationType;
  description: string;
  whyRecommended: string;
  coveredSkills: string[];
  difficulty: ProjectDifficulty;
  estimatedDurationWeeks: number;
  whatItProves: string;
  buildSteps: string[];
  scopeHints?: string[];
  starterIdeas?: string[];
  resources: LearningResource[];
};

export type ProjectRecommendationOutput = {
  recommendations: ProjectRecommendation[];
  generatedFromNote: string;
  warnings?: ContractWarning[];
};

export type ProjectRecommendationRequest = {
  targetRole: string;
  gapAnalysisItems: GapAnalysisItem[];
  targetStack?: string[];
  timelineWeeks?: TimelineWeeks;
  roadmapMilestones?: RoadmapMilestone[];
  jobDescriptionCount?: number;
};
