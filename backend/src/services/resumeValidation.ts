import type { ContractWarning } from "@rsgp/shared";

export type ResumeTextValidationResult = {
  normalizedText: string;
  warnings: ContractWarning[];
};

const sectionPatterns = {
  experience: /\b(experience|employment|work history)\b/i,
  projects: /\b(projects?|portfolio)\b/i,
  education: /\b(education|degree|university|college)\b/i,
  skills: /\b(skills?|technologies|technical skills|tech stack)\b/i
};

export const validateResumeText = (rawText: string): ResumeTextValidationResult => {
  const normalizedText = rawText
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const warnings: ContractWarning[] = [];

  if (normalizedText.length === 0) {
    warnings.push({
      code: "resume.empty_text",
      message: "No text could be extracted from the resume.",
      severity: "error"
    });
  }

  if (normalizedText.length > 0 && normalizedText.length < 120) {
    warnings.push({
      code: "resume.low_text",
      message: "The extracted resume text is very short, so parsing may be incomplete.",
      severity: "warning"
    });
  }

  for (const [sectionName, pattern] of Object.entries(sectionPatterns)) {
    if (!pattern.test(normalizedText)) {
      warnings.push({
        code: `resume.missing_${sectionName}`,
        message: `Could not find a clear ${sectionName} section in the extracted resume text.`,
        severity: "info"
      });
    }
  }

  return {
    normalizedText,
    warnings
  };
};
