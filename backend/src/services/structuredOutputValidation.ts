import type {
  ContractWarning,
  InterviewSignals,
  JobDescriptionRoleFit,
  ParsedJobDescription,
  ParsedResume,
  ResumeEducationItem,
  ResumeExperienceItem,
  ResumeProject,
  ResumeSkills,
  SignalLabel,
  SkillCategory
} from "@rsgp/shared";

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
      warnings: ContractWarning[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: ContractWarning[];
    };

const skillCategories: SkillCategory[] = [
  "languages",
  "frameworks",
  "databases",
  "cloud",
  "tools",
  "other"
];
const signalLabels: SignalLabel[] = ["Strong signal", "Medium signal", "Weak signal"];
const roleFits: JobDescriptionRoleFit[] = ["matching", "adjacent", "unrelated"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    : [];

const asWarnings = (value: unknown): ContractWarning[] =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((warning): ContractWarning => {
          const severity: ContractWarning["severity"] =
            warning.severity === "error" ||
            warning.severity === "warning" ||
            warning.severity === "info"
              ? warning.severity
              : "warning";

          return {
            code: asString(warning.code, "llm.warning"),
            message: asString(warning.message),
            severity,
            fieldPath: asString(warning.fieldPath) || undefined
          };
        })
        .filter((warning) => warning.message.length > 0)
    : [];

const validateSignal = (value: unknown): SignalLabel | undefined =>
  signalLabels.includes(value as SignalLabel) ? (value as SignalLabel) : undefined;

const validateResumeSkills = (value: unknown, errors: string[]): ResumeSkills => {
  if (!isRecord(value)) {
    errors.push("skills must be an object with all resume skill categories.");
  }

  return skillCategories.reduce((skills, category) => {
    skills[category] = isRecord(value) ? asStringArray(value[category]) : [];
    return skills;
  }, {} as ResumeSkills);
};

const validateExperience = (value: unknown): ResumeExperienceItem[] =>
  Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        company: asString(item.company, "Not specified"),
        roleTitle: asString(item.roleTitle, "Not specified"),
        startDate: asString(item.startDate) || undefined,
        endDate: asString(item.endDate) || undefined,
        summary: asString(item.summary) || undefined,
        highlights: asStringArray(item.highlights),
        skillsUsed: asStringArray(item.skillsUsed)
      }))
    : [];

const validateProjects = (value: unknown): ResumeProject[] =>
  Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        title: asString(item.title, "Resume project"),
        description: asString(item.description) || undefined,
        highlights: asStringArray(item.highlights),
        skillsUsed: asStringArray(item.skillsUsed),
        links: asStringArray(item.links)
      }))
    : [];

const validateEducation = (value: unknown): ResumeEducationItem[] =>
  Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        institution: asString(item.institution, "Not specified"),
        degree: asString(item.degree) || undefined,
        field: asString(item.field) || undefined,
        startDate: asString(item.startDate) || undefined,
        endDate: asString(item.endDate) || undefined
      }))
    : [];

export const validateParsedResumeOutput = (value: unknown): ValidationResult<ParsedResume> => {
  const errors: string[] = [];
  const warnings: ContractWarning[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Parsed resume must be a JSON object."],
      warnings
    };
  }

  const candidateName = asString(value.candidateName, "Unknown Candidate");
  const currentRole = asString(value.currentRole, "Not specified");
  const experienceYears = Number(value.experienceYears);
  const skills = validateResumeSkills(value.skills, errors);

  if (!Number.isFinite(experienceYears) || experienceYears < 0 || experienceYears > 50) {
    errors.push("experienceYears must be a number between 0 and 50.");
  }

  if (candidateName.length === 0) {
    errors.push("candidateName is required.");
  }

  if (currentRole.length === 0) {
    errors.push("currentRole is required.");
  }

  const detectedSkillCount = Object.values(skills).flat().length;

  if (detectedSkillCount === 0) {
    warnings.push({
      code: "resume.no_skills_detected",
      message: "The parsed resume did not include any technical skills.",
      severity: "warning",
      fieldPath: "skills"
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings
    };
  }

  return {
    ok: true,
    value: {
      candidateName,
      experienceYears,
      currentRole,
      skills,
      experience: validateExperience(value.experience),
      projects: validateProjects(value.projects),
      education: validateEducation(value.education),
      inferredDomains: asStringArray(value.inferredDomains),
      signalStrength: validateSignal(value.signalStrength),
      warnings: asWarnings(value.warnings)
    },
    warnings
  };
};

const validateInterviewSignals = (value: unknown): InterviewSignals => {
  const record = isRecord(value) ? value : {};

  return {
    dsa: record.dsa === true,
    lld: record.lld === true,
    systemDesign: record.systemDesign === true,
    frontendDeepDive: record.frontendDeepDive === true,
    backendDeepDive: record.backendDeepDive === true,
    behavioral: record.behavioral === true
  };
};

export const validateParsedJobDescriptionOutput = (
  value: unknown,
  fallbackId: string,
  targetRole: string
): ValidationResult<ParsedJobDescription> => {
  const errors: string[] = [];
  const warnings: ContractWarning[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Parsed job description must be a JSON object."],
      warnings
    };
  }

  const requiredSkills = asStringArray(value.requiredSkills);
  const preferredSkills = asStringArray(value.preferredSkills);
  const techStack = asStringArray(value.techStack);
  const roleFit = roleFits.includes(value.roleFit as JobDescriptionRoleFit)
    ? (value.roleFit as JobDescriptionRoleFit)
    : undefined;

  if (!roleFit) {
    errors.push("roleFit must be matching, adjacent, or unrelated.");
  }

  if (requiredSkills.length + preferredSkills.length + techStack.length === 0) {
    warnings.push({
      code: "jd.no_tech_stack",
      message: "The parsed job description did not include a clear technical stack.",
      severity: "warning",
      fieldPath: "techStack"
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings
    };
  }

  return {
    ok: true,
    value: {
      id: asString(value.id, fallbackId) || fallbackId,
      roleTitle: asString(value.roleTitle, targetRole),
      requiredSkills,
      preferredSkills,
      softSkills: asStringArray(value.softSkills),
      experienceRange: asString(value.experienceRange, "Not specified"),
      techStack:
        techStack.length > 0
          ? techStack
          : Array.from(new Set([...requiredSkills, ...preferredSkills])),
      responsibilities: asStringArray(value.responsibilities),
      interviewSignals: validateInterviewSignals(value.interviewSignals),
      roleFit,
      signalStrength: validateSignal(value.signalStrength),
      warnings: asWarnings(value.warnings)
    },
    warnings
  };
};
