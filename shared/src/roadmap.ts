import type { GenerationContext, SignalLabel, TimelineWeeks } from "./common.js";
import type { GapAnalysisItem } from "./gap-analysis.js";

export type LearningResource = {
  type: "article" | "course" | "docs" | "video" | "practice" | "book" | "github";
  label: string;
  url?: string;
  relatedSkills: string[];
};

export type RoadmapMilestone = {
  week: number;
  focus: string;
  tasks: string[];
  linkedSkills: string[];
  notes?: string;
  resources: LearningResource[];
};

export type RoadmapOutput = {
  timelineWeeks: TimelineWeeks;
  goal: string;
  milestones: RoadmapMilestone[];
  signalStrength: SignalLabel;
  generatedFromNote: string;
  context: GenerationContext;
};

export type RoadmapRequest = {
  targetRole: string;
  timelineWeeks: TimelineWeeks;
  gapAnalysisItems: GapAnalysisItem[];
  targetStack?: string[];
  jobDescriptionCount?: number;
};
