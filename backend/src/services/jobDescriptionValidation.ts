import { MAX_JOB_DESCRIPTIONS, type ContractWarning, type JobDescriptionInput } from "@rsgp/shared";

export type JobDescriptionValidationResult = {
  normalizedJobDescriptions: JobDescriptionInput[];
  warnings: ContractWarning[];
};

export const validateTargetRole = (targetRole: unknown): string => {
  if (typeof targetRole !== "string" || targetRole.trim().length < 2) {
    throw new Error("Target role is required.");
  }

  return targetRole.trim();
};

export const normalizeTargetStack = (targetStack: unknown): string[] => {
  if (!Array.isArray(targetStack)) {
    return [];
  }

  return Array.from(
    new Set(
      targetStack
        .filter((skill): skill is string => typeof skill === "string")
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
    )
  );
};

export const validateJobDescriptions = (
  jobDescriptions: unknown
): JobDescriptionValidationResult => {
  const warnings: ContractWarning[] = [];

  if (jobDescriptions === undefined) {
    return {
      normalizedJobDescriptions: [],
      warnings
    };
  }

  if (!Array.isArray(jobDescriptions)) {
    throw new Error("jobDescriptions must be an array when provided.");
  }

  if (jobDescriptions.length > MAX_JOB_DESCRIPTIONS) {
    throw new Error(`A maximum of ${MAX_JOB_DESCRIPTIONS} job descriptions can be provided.`);
  }

  const normalizedJobDescriptions = jobDescriptions
    .map((item, index): JobDescriptionInput | undefined => {
      if (typeof item !== "object" || item === null) {
        warnings.push({
          code: "jd.invalid_item",
          message: `Job description ${index + 1} was ignored because it is not an object.`,
          severity: "warning"
        });
        return undefined;
      }

      const candidate = item as Partial<JobDescriptionInput>;
      const rawText = typeof candidate.rawText === "string" ? candidate.rawText.trim() : "";

      if (rawText.length === 0) {
        warnings.push({
          code: "jd.empty_text",
          message: `Job description ${index + 1} was ignored because it has no text.`,
          severity: "warning"
        });
        return undefined;
      }

      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id.trim()
            : `jd-${index + 1}`,
        sourceLabel:
          typeof candidate.sourceLabel === "string" && candidate.sourceLabel.trim()
            ? candidate.sourceLabel.trim()
            : undefined,
        rawText
      };
    })
    .filter((item): item is JobDescriptionInput => Boolean(item));

  return {
    normalizedJobDescriptions,
    warnings
  };
};
