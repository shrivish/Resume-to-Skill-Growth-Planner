import type { ContractWarning, EvidenceSource, SignalLabel } from "./common.js";

export type InterviewSignals = {
  dsa: boolean;
  lld: boolean;
  systemDesign: boolean;
  frontendDeepDive: boolean;
  backendDeepDive: boolean;
  behavioral: boolean;
};

export type JobDescriptionRoleFit = "matching" | "adjacent" | "unrelated";

export type ParsedJobDescription = {
  id: string;
  roleTitle: string;
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  experienceRange: string;
  techStack: string[];
  responsibilities: string[];
  interviewSignals: InterviewSignals;
  roleFit?: JobDescriptionRoleFit;
  signalStrength?: SignalLabel;
  evidenceSources?: EvidenceSource[];
  warnings?: ContractWarning[];
};

export type JobDescriptionInput = {
  id: string;
  sourceLabel?: string;
  rawText: string;
};

export type TargetRoleInput = {
  targetRole: string;
  targetStack?: string[];
  timelineWeeks?: 8 | 12 | 24;
};

export type JobDescriptionAnalysisRequest = TargetRoleInput & {
  jobDescriptions?: JobDescriptionInput[];
};

export type JobDescriptionAnalysisResponse = {
  targetRole: string;
  targetStack: string[];
  acceptedJobDescriptions: ParsedJobDescription[];
  rejectedJobDescriptions: ParsedJobDescription[];
  warnings: ContractWarning[];
  needsTargetStack: boolean;
};
