import type { GapAnalysisItem, SkillLevel } from "./gap-analysis.js";
import type { ProjectRecommendation } from "./project-recommendation.js";
import type { RoadmapMilestone } from "./roadmap.js";
import type { ContractWarning, GapSeverity, TimelineWeeks } from "./common.js";

export type LearningResourceType = "official-docs" | "course" | "article" | "video" | "github";

export type LearningResourceDepth = "foundation" | "applied" | "advanced";

export type LearningResourceSourceFamily =
  "official-docs" | "curated-course" | "curated-github-reference";

export type LearningResourceRecommendation = {
  id: string;
  title: string;
  url: string;
  type: LearningResourceType;
  provider: string;
  sourceFamily: LearningResourceSourceFamily;
  depth: LearningResourceDepth;
  skillSupported: string;
  whyRecommended: string;
  roadmapFit: string;
  projectFit?: string;
};

export type LearningResourceSkillRecommendation = {
  skillName: string;
  gapSeverity: GapSeverity;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel;
  roadmapWeek?: number;
  roadmapFocus?: string;
  projectConnections: string[];
  resources: LearningResourceRecommendation[];
};

export type LearningResourceOutput = {
  recommendations: LearningResourceSkillRecommendation[];
  sourcePolicy: string;
  selectionSummary: string;
  generatedFromNote: string;
  warnings?: ContractWarning[];
};

export type LearningResourceRequest = {
  targetRole: string;
  gapAnalysisItems: GapAnalysisItem[];
  targetStack?: string[];
  timelineWeeks?: TimelineWeeks;
  roadmapMilestones?: RoadmapMilestone[];
  projectRecommendations?: ProjectRecommendation[];
  jobDescriptionCount?: number;
};
