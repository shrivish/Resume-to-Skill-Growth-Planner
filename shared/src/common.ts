import type { GAP_SEVERITIES, SIGNAL_LABELS, SUPPORTED_TIMELINE_WEEKS } from "./constants.js";

export type AppHealth = {
  status: "ok";
  service: "resume-to-skill-growth-planner";
  timestamp: string;
};

export type TimelineWeeks = (typeof SUPPORTED_TIMELINE_WEEKS)[number];

export type SignalLabel = (typeof SIGNAL_LABELS)[number];

export type GapSeverity = (typeof GAP_SEVERITIES)[number];

export type EvidenceSource = {
  id: string;
  sourceType: "resume" | "jobDescription" | "targetRole" | "userInput" | "generated";
  label: string;
  excerpt?: string;
};

export type ContractWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  fieldPath?: string;
};

export type GenerationContext = {
  targetRole: string;
  timelineWeeks: TimelineWeeks;
  targetStack?: string[];
  jobDescriptionCount: number;
  generatedFrom: Array<"resume" | "targetRole" | "jobDescriptions" | "targetStack">;
};
