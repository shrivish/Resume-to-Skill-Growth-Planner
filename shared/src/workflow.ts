import type { GenerationContext } from "./common.js";
import type { GapAnalysisOutput } from "./gap-analysis.js";
import type { JobDescriptionAnalysisResponse, ParsedJobDescription } from "./job-description.js";
import type { LearningResourceOutput } from "./learning-resource.js";
import type { ProjectRecommendationOutput } from "./project-recommendation.js";
import type { ParsedResume, ResumeParseResponse } from "./resume.js";
import type { RoadmapOutput } from "./roadmap.js";
import type { TimelineWeeks } from "./common.js";

export type PlannerRun = {
  id: string;
  context: GenerationContext;
  parsedResume?: ParsedResume;
  parsedJobDescriptions: ParsedJobDescription[];
  gapAnalysis?: GapAnalysisOutput;
  roadmap?: RoadmapOutput;
  learningResources?: LearningResourceOutput;
  projectRecommendations?: ProjectRecommendationOutput;
  createdAt: string;
  updatedAt: string;
};

export type PlannerRunStatus = "Ready" | "In Progress";

export type SavedPlannerRun = {
  id: string;
  title: string;
  targetRole: string;
  timelineWeeks: TimelineWeeks;
  targetStack: string[];
  createdAt: string;
  lastUpdatedAt: string;
  status: PlannerRunStatus;
  completedTasks: Record<string, boolean>;
  resumeResult: ResumeParseResponse;
  jdResult: JobDescriptionAnalysisResponse;
  gapResult: GapAnalysisOutput;
  roadmapResult: RoadmapOutput;
  learningResourceResult?: LearningResourceOutput;
  projectResult: ProjectRecommendationOutput;
};

export type SavedPlannerRunSummary = Pick<
  SavedPlannerRun,
  | "id"
  | "title"
  | "targetRole"
  | "timelineWeeks"
  | "createdAt"
  | "lastUpdatedAt"
  | "status"
  | "completedTasks"
> & {
  gapCount: number;
  acceptedJobDescriptionCount: number;
};

export type CreatePlannerRunRequest = Omit<SavedPlannerRun, "id" | "createdAt" | "lastUpdatedAt">;

export type UpdatePlannerRunCompletionRequest = {
  completedTasks: Record<string, boolean>;
  status?: PlannerRunStatus;
};

export type PlannerDraftStep = "inputs" | "gap" | "roadmap";

export type SavePlannerDraftRequest = {
  id?: string;
  targetRole: string;
  timelineWeeks: TimelineWeeks;
  targetStackText: string;
  resumeText: string;
  resumeFileName: string;
  jobDescriptionTexts: string[];
  lastActiveStep: PlannerDraftStep;
};

export type SavedPlannerDraft = SavePlannerDraftRequest & {
  id: string;
  status: "draft";
  createdAt: string;
  lastUpdatedAt: string;
};
