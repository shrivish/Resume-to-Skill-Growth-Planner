import type {
  GapAnalysisItem,
  ProjectRecommendation,
  ProjectRecommendationOutput,
  ProjectRecommendationRequest
} from "@rsgp/shared";

const topGapSkills = (items: GapAnalysisItem[]) =>
  items
    .slice(0, 5)
    .map((item) => item.skillName)
    .filter(Boolean);

const fallbackSkills = (targetStack: string[] | undefined) =>
  targetStack && targetStack.length > 0 ? targetStack.slice(0, 5) : ["role fundamentals"];

const resourceFor = (skill: string) => ({
  type: "github" as const,
  label: `${skill} reference implementations`,
  relatedSkills: [skill]
});

const portfolioProject = (
  title: string,
  targetRole: string,
  skills: string[],
  durationWeeks: number
): ProjectRecommendation => ({
  title,
  type: "portfolio",
  whyRecommended: `Builds visible ${targetRole} proof around ${skills.join(", ")}.`,
  coveredSkills: skills,
  difficulty: skills.length > 3 ? "Hard" : "Medium",
  estimatedDurationWeeks: durationWeeks,
  resources: skills.map(resourceFor)
});

const openSourceProject = (targetRole: string, skills: string[]): ProjectRecommendation => ({
  title: `${targetRole} open-source contribution sprint`,
  type: "open-source",
  whyRecommended: `Practices reading existing code and applying ${skills.join(", ")} in a real project.`,
  coveredSkills: skills,
  difficulty: "Medium",
  estimatedDurationWeeks: 2,
  resources: [
    {
      type: "github",
      label: "Good first issues in matching repositories",
      relatedSkills: skills
    }
  ]
});

export const recommendProjects = (
  request: ProjectRecommendationRequest
): ProjectRecommendationOutput => {
  const skills = topGapSkills(request.gapAnalysisItems);
  const coveredSkills = skills.length > 0 ? skills : fallbackSkills(request.targetStack);
  const primarySkills = coveredSkills.slice(0, 3);
  const stretchSkills = coveredSkills.slice(0, 5);

  return {
    recommendations: [
      portfolioProject(
        `${request.targetRole} readiness dashboard`,
        request.targetRole,
        primarySkills,
        4
      ),
      portfolioProject(
        `${request.targetRole} production-style feature build`,
        request.targetRole,
        stretchSkills,
        6
      ),
      openSourceProject(request.targetRole, primarySkills)
    ],
    generatedFromNote:
      skills.length > 0
        ? "Generated from the highest-priority skill gaps."
        : "Generated from target stack because no missing gaps were detected."
  };
};
