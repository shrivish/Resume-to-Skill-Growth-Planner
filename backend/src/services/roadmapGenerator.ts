import {
  SUPPORTED_TIMELINE_WEEKS,
  type GapAnalysisItem,
  type GapSeverity,
  type LearningResource,
  type RoadmapMilestone,
  type RoadmapOutput,
  type RoadmapRequest,
  type SignalLabel
} from "@rsgp/shared";

const severityOrder: Record<GapSeverity, number> = {
  Critical: 0,
  Important: 1,
  "Nice to have": 2
};

const resourceBySkill = (skillName: string): LearningResource[] => [
  {
    type: "docs",
    label: `${skillName} official documentation or guide`,
    relatedSkills: [skillName]
  },
  {
    type: "practice",
    label: `${skillName} focused exercises`,
    relatedSkills: [skillName]
  }
];

const priorityGaps = (items: GapAnalysisItem[]) =>
  [...items].sort((left, right) => {
    const severityDifference = severityOrder[left.gapSeverity] - severityOrder[right.gapSeverity];

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return left.skillName.localeCompare(right.skillName);
  });

const chunkGaps = (items: GapAnalysisItem[], timelineWeeks: number) => {
  if (items.length === 0) {
    return Array.from({ length: timelineWeeks }, () => [] as GapAnalysisItem[]);
  }

  return Array.from({ length: timelineWeeks }, (_value, weekIndex) =>
    items.filter((_item, itemIndex) => itemIndex % timelineWeeks === weekIndex)
  );
};

const buildTasks = (weekGaps: GapAnalysisItem[], week: number, targetRole: string) => {
  if (weekGaps.length === 0) {
    return [
      `Review ${targetRole} fundamentals from previous weeks`,
      "Refine notes into interview-ready explanations",
      "Practice one small implementation task"
    ];
  }

  return weekGaps.flatMap((gap) => [
    `Learn the core concepts of ${gap.skillName}`,
    `Build a small exercise that uses ${gap.skillName}`,
    `Write interview notes explaining where ${gap.skillName} fits in ${targetRole} work`
  ]);
};

const buildFocus = (weekGaps: GapAnalysisItem[], week: number, targetRole: string) => {
  if (weekGaps.length === 0) {
    return week === 1 ? `${targetRole} baseline review` : `${targetRole} consolidation`;
  }

  const linkedSkills = weekGaps.map((gap) => gap.skillName).join(", ");

  return `${linkedSkills} for ${targetRole}`;
};

const signalStrengthFor = (items: GapAnalysisItem[], jobDescriptionCount: number): SignalLabel => {
  const hasStrongGap = items.some((item) => item.signalStrength === "Strong signal");

  if (hasStrongGap || jobDescriptionCount >= 3) {
    return "Strong signal";
  }

  if (items.length > 0 || jobDescriptionCount > 0) {
    return "Medium signal";
  }

  return "Weak signal";
};

export const generateRoadmap = (request: RoadmapRequest): RoadmapOutput => {
  const sortedGaps = priorityGaps(request.gapAnalysisItems);
  const weeklyGaps = chunkGaps(sortedGaps, request.timelineWeeks);
  const milestones: RoadmapMilestone[] = weeklyGaps.map((weekGaps, index) => ({
    week: index + 1,
    focus: buildFocus(weekGaps, index + 1, request.targetRole),
    tasks: buildTasks(weekGaps, index + 1, request.targetRole),
    linkedSkills: weekGaps.map((gap) => gap.skillName),
    resources: weekGaps.flatMap((gap) => resourceBySkill(gap.skillName))
  }));
  const jobDescriptionCount = request.jobDescriptionCount ?? 0;

  return {
    timelineWeeks: request.timelineWeeks,
    goal: `Prepare for ${request.targetRole} roles`,
    milestones,
    signalStrength: signalStrengthFor(sortedGaps, jobDescriptionCount),
    generatedFromNote: `Generated from gap analysis, target role${
      jobDescriptionCount > 0 ? `, and ${jobDescriptionCount} accepted JD(s)` : ""
    }.`,
    context: {
      targetRole: request.targetRole,
      timelineWeeks: request.timelineWeeks,
      targetStack: request.targetStack,
      jobDescriptionCount,
      generatedFrom: [
        "targetRole",
        ...(request.targetStack && request.targetStack.length > 0 ? ["targetStack" as const] : []),
        ...(jobDescriptionCount > 0 ? ["jobDescriptions" as const] : []),
        "resume"
      ]
    }
  };
};

export const isSupportedTimeline = (value: number) =>
  SUPPORTED_TIMELINE_WEEKS.some((weeks) => weeks === value);
