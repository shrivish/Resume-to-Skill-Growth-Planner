import type { EvidenceSource, GapSeverity, SignalLabel } from "./common.js";
import type { PlanInputContext } from "./input-context.js";
import type { ParsedJobDescription } from "./job-description.js";
import type { SkillCategory } from "./resume.js";
import type { ParsedResume } from "./resume.js";

export type SkillLevel =
  | "Not shown"
  | "Partial exposure"
  | "Working proficiency"
  | "Interview-ready"
  | "Production-ready";

export type GapAnalysisItem = {
  skillName: string;
  category: SkillCategory;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel;
  gapSeverity: GapSeverity;
  reason: string;
  signalStrength: SignalLabel;
  evidenceSources: EvidenceSource[];
};

export type GapAnalysisOutput = {
  summary: string;
  items: GapAnalysisItem[];
  generatedFromNote: string;
};

export type GapAnalysisRequest = {
  planInputContext?: PlanInputContext;
  parsedResume?: ParsedResume;
  targetRole?: string;
  targetStack?: string[];
  acceptedJobDescriptions?: ParsedJobDescription[];
};
