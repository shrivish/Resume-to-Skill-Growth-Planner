import type { ContractWarning, TimelineWeeks } from "./common.js";
import type { ParsedJobDescription } from "./job-description.js";
import type { ParsedResume, ResumeInputKind } from "./resume.js";

export type DocumentSourceType = "text" | "file";

export type DocumentFileMetadata = {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  inputKind: ResumeInputKind;
};

export type DocumentParseWarnings = {
  extractionWarnings: ContractWarning[];
  parsingWarnings: ContractWarning[];
  validationWarnings: ContractWarning[];
};

export type ResumeInputEnvelope = {
  sourceType: DocumentSourceType;
  fileMetadata?: DocumentFileMetadata;
  rawText: string;
  extractedText: string;
  parsedResume: ParsedResume;
  warnings: DocumentParseWarnings;
};

export type JobDescriptionInputEnvelope = {
  id: string;
  sourceType: DocumentSourceType;
  fileMetadata?: DocumentFileMetadata;
  rawText: string;
  extractedText: string;
  parsedJobDescription: ParsedJobDescription;
  warnings: DocumentParseWarnings;
};

export type InputQualitySummary = {
  hasResume: boolean;
  hasJobDescriptions: boolean;
  hasAcceptedJobDescriptions: boolean;
  hasTargetStack: boolean;
  overallWarnings: ContractWarning[];
  needsTargetStack: boolean;
};

export type PlanInputContext = {
  targetRole: string;
  targetStack?: string[];
  timelineWeeks: TimelineWeeks;
  resume: ResumeInputEnvelope;
  acceptedJobDescriptions: JobDescriptionInputEnvelope[];
  rejectedJobDescriptions: JobDescriptionInputEnvelope[];
  inputQuality: InputQualitySummary;
};

export type PlanInputContextResponse = {
  id: string;
  planInputContext: PlanInputContext;
  createdAt: string;
};
