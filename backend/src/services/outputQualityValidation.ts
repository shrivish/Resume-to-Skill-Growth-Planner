import type {
  ContractWarning,
  GapAnalysisOutput,
  LearningResourceOutput,
  ProjectRecommendationOutput,
  RoadmapOutput
} from "@rsgp/shared";
import { AiGenerationError } from "./llmProvider.js";

const allowedResourceFamilies = new Set([
  "official-docs",
  "curated-course",
  "curated-github-reference"
]);

const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export const buildGenerationWarnings = (input: {
  task: "roadmap" | "projects" | "learningResources" | "gapAnalysis";
  jobDescriptionCount?: number;
  targetStack?: string[];
  gapCount?: number;
  refinedByLlm?: boolean;
  fallbackUsed?: boolean;
}): ContractWarning[] => {
  const warnings: ContractWarning[] = [];
  const jobDescriptionCount = input.jobDescriptionCount ?? 0;

  if (jobDescriptionCount === 0) {
    warnings.push({
      code: "generation.no_jd_evidence",
      message: "Generated from resume and target stack because no job description was provided.",
      severity: "warning"
    });
  } else if (jobDescriptionCount < 2) {
    warnings.push({
      code: "generation.limited_jd_evidence",
      message: "Generated from limited job-description evidence.",
      severity: "info"
    });
  }

  if ((input.targetStack ?? []).length === 0) {
    warnings.push({
      code: "generation.weak_stack_signal",
      message: "Target stack signal was weak, so recommendations may be broader.",
      severity: "warning"
    });
  }

  if ((input.gapCount ?? 0) === 0) {
    warnings.push({
      code: "generation.no_gap_signal",
      message: "No concrete skill gaps were available, so generated guidance is limited.",
      severity: "warning"
    });
  }

  if (input.fallbackUsed) {
    warnings.push({
      code: "generation.llm_refinement_fallback",
      message: "LLM wording refinement was skipped because the generated refinement was invalid.",
      severity: "info"
    });
  }

  return warnings;
};

export const assertGapAnalysisQuality = (output: GapAnalysisOutput) => {
  const errors = output.items.flatMap((item, index) => {
    const itemErrors: string[] = [];

    if (!nonEmpty(item.reason)) {
      itemErrors.push(`items[${index}].reason is required.`);
    }

    if (!Array.isArray(item.evidenceSources) || item.evidenceSources.length === 0) {
      itemErrors.push(`items[${index}].evidenceSources must not be empty.`);
    }

    return itemErrors;
  });

  if (errors.length > 0) {
    throw new AiGenerationError("quality_check_failure", "Gap analysis failed quality checks.", errors);
  }
};

export const assertRoadmapQuality = (output: RoadmapOutput) => {
  const errors: string[] = [];

  if (output.milestones.length !== output.timelineWeeks) {
    errors.push("Roadmap milestone count must match timelineWeeks.");
  }

  output.milestones.forEach((milestone, index) => {
    if (milestone.week !== index + 1) {
      errors.push(`milestones[${index}].week must be ${index + 1}.`);
    }

    if (!nonEmpty(milestone.focus)) {
      errors.push(`milestones[${index}].focus is required.`);
    }

    if (!Array.isArray(milestone.tasks) || milestone.tasks.length < 2 || milestone.tasks.length > 4) {
      errors.push(`milestones[${index}].tasks must contain 2 to 4 tasks.`);
    }
  });

  if (errors.length > 0) {
    throw new AiGenerationError("quality_check_failure", "Roadmap failed quality checks.", errors);
  }
};

export const assertProjectRecommendationQuality = (
  output: ProjectRecommendationOutput,
  topGapSkills: string[]
) => {
  const errors: string[] = [];
  const recommendations = output.recommendations;
  const coveredSkills = new Set(recommendations.flatMap((item) => item.coveredSkills));

  if (recommendations.length < 3) {
    errors.push("Project recommendations must include two portfolio projects and one proof-of-work item.");
  }

  if (recommendations.filter((item) => item.type === "portfolio").length < 2) {
    errors.push("Project recommendations must include at least two portfolio projects.");
  }

  if (!recommendations.some((item) => item.type === "proof-of-work")) {
    errors.push("Project recommendations must include one proof-of-work item.");
  }

  if (topGapSkills.length > 0 && !topGapSkills.some((skill) => coveredSkills.has(skill))) {
    errors.push("Project recommendations must cover at least one top gap skill.");
  }

  recommendations.forEach((recommendation, index) => {
    if (!nonEmpty(recommendation.title) || !nonEmpty(recommendation.description)) {
      errors.push(`recommendations[${index}] must include title and description.`);
    }

    if (!Array.isArray(recommendation.buildSteps) || recommendation.buildSteps.length === 0) {
      errors.push(`recommendations[${index}].buildSteps must not be empty.`);
    }
  });

  if (errors.length > 0) {
    throw new AiGenerationError(
      "quality_check_failure",
      "Project recommendations failed quality checks.",
      errors
    );
  }
};

export const assertLearningResourceQuality = (output: LearningResourceOutput) => {
  const errors: string[] = [];

  output.recommendations.forEach((skillRecommendation, skillIndex) => {
    if (!Array.isArray(skillRecommendation.resources) || skillRecommendation.resources.length === 0) {
      errors.push(`recommendations[${skillIndex}].resources must not be empty.`);
    }

    skillRecommendation.resources.forEach((resource, resourceIndex) => {
      if (!allowedResourceFamilies.has(resource.sourceFamily)) {
        errors.push(
          `recommendations[${skillIndex}].resources[${resourceIndex}].sourceFamily is not allowed.`
        );
      }

      if (!nonEmpty(resource.url) || !resource.url.startsWith("https://")) {
        errors.push(`recommendations[${skillIndex}].resources[${resourceIndex}].url must be HTTPS.`);
      }
    });
  });

  if (errors.length > 0) {
    throw new AiGenerationError(
      "quality_check_failure",
      "Learning resources failed quality checks.",
      errors
    );
  }
};
