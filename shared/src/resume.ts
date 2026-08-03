import type { ContractWarning, EvidenceSource, SignalLabel } from "./common.js";

export type SkillCategory = "languages" | "frameworks" | "databases" | "cloud" | "tools" | "other";

export type ResumeSkills = Record<SkillCategory, string[]>;

export type ResumeExperienceItem = {
  company: string;
  roleTitle: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights: string[];
  skillsUsed: string[];
};

export type ResumeProject = {
  title: string;
  description?: string;
  highlights: string[];
  skillsUsed: string[];
  links: string[];
};

export type ResumeEducationItem = {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
};

export type ParsedResume = {
  candidateName: string;
  experienceYears: number;
  currentRole: string;
  skills: ResumeSkills;
  experience: ResumeExperienceItem[];
  projects: ResumeProject[];
  education: ResumeEducationItem[];
  inferredDomains: string[];
  signalStrength?: SignalLabel;
  evidenceSources?: EvidenceSource[];
  warnings?: ContractWarning[];
};

export type ResumeInputKind = "pdf" | "docx" | "text";

export type ResumeUploadMetadata = {
  inputKind: ResumeInputKind;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  characterCount: number;
};

export type ResumeParseResponse = {
  metadata: ResumeUploadMetadata;
  parsedResume: ParsedResume;
  extractedTextPreview: string;
  warnings: ContractWarning[];
};
