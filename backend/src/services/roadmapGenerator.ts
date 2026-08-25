import {
  type ContractWarning,
  SUPPORTED_TIMELINE_WEEKS,
  type GapAnalysisItem,
  type GapSeverity,
  type RoadmapMilestone,
  type RoadmapOutput,
  type RoadmapRequest,
  type SignalLabel,
  type SkillCategory,
  type SkillLevel
} from "@rsgp/shared";
import { generateValidatedJson } from "./aiGenerationService.js";
import type { LlmProvider } from "./llmProvider.js";
import {
  assertRoadmapQuality,
  buildGenerationWarnings
} from "./outputQualityValidation.js";
import type { ValidationResult } from "./structuredOutputValidation.js";

type ScoredGap = {
  item: GapAnalysisItem;
  canonicalName: string;
  priorityScore: number;
  severityWeight: number;
  dependencyWeight: number;
  repetitionWeight: number;
  evidenceGapWeight: number;
  proofValueWeight: number;
  originalIndex: number;
};

type WeeklyPlan = {
  week: number;
  gap?: ScoredGap;
  mode: "foundation" | "practice" | "proof" | "consolidation";
  linkedSkills: string[];
};

type LlmMilestoneRefinement = {
  week: number;
  focus?: string;
  tasks?: string[];
  notes?: string;
};

const severityWeights: Record<GapSeverity, number> = {
  Critical: 5,
  Important: 3,
  "Nice to have": 1
};

const severityTieBreak: Record<GapSeverity, number> = {
  Critical: 0,
  Important: 1,
  "Nice to have": 2
};

const dependencyPairs = [
  ["JavaScript", "TypeScript"],
  ["TypeScript", "Node.js"],
  ["Node.js", "Express"],
  ["Node.js", "API design"],
  ["Express", "API design"],
  ["REST", "API design"],
  ["SQL", "database design"],
  ["PostgreSQL", "database design"],
  ["testing basics", "integration testing"],
  ["Jest", "integration testing"],
  ["API design", "system design communication"],
  ["Docker basics", "deployment workflow"],
  ["Docker", "deployment workflow"],
  ["Git", "GitHub"],
  ["HTML", "React"],
  ["CSS", "React"],
  ["JavaScript", "React"],
  ["React", "Next.js"]
] as const;

const canonicalSkill = (skillName: string) =>
  skillName.trim().toLowerCase().replace(/\./g, "").replace(/-/g, " ").replace(/\s+/g, " ");

const dependencyMap = dependencyPairs.reduce((map, [from, to]) => {
  const prerequisite = canonicalSkill(from);
  const dependent = canonicalSkill(to);
  const existing = map.get(dependent) ?? [];

  existing.push(prerequisite);
  map.set(dependent, existing);
  return map;
}, new Map<string, string[]>());

const dependentMap = dependencyPairs.reduce((map, [from, to]) => {
  const prerequisite = canonicalSkill(from);
  const dependent = canonicalSkill(to);
  const existing = map.get(prerequisite) ?? [];

  existing.push(dependent);
  map.set(prerequisite, existing);
  return map;
}, new Map<string, string[]>());

const proofFriendlySkills = [
  "api",
  "backend",
  "database",
  "docker",
  "express",
  "frontend",
  "github",
  "integration testing",
  "jest",
  "nextjs",
  "nodejs",
  "postgresql",
  "react",
  "rest",
  "sql",
  "testing",
  "typescript"
];

const unique = <T>(values: T[]) => Array.from(new Set(values));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dependencyWeightFor = (canonicalName: string, availableSkillNames: Set<string>) => {
  const dependentCount = (dependentMap.get(canonicalName) ?? []).filter((dependent) =>
    availableSkillNames.has(dependent)
  ).length;

  if (dependentCount >= 2) {
    return 4;
  }

  return dependentCount === 1 ? 2 : 0;
};

const repetitionWeightFor = (item: GapAnalysisItem, targetStack: string[]) => {
  const canonicalName = canonicalSkill(item.skillName);
  const inTargetStack = targetStack.some((skill) => canonicalSkill(skill) === canonicalName);

  if (inTargetStack || item.signalStrength === "Strong signal") {
    return 3;
  }

  if (item.signalStrength === "Medium signal") {
    return 1;
  }

  return 0;
};

const evidenceGapWeightFor = (currentLevel: SkillLevel) => {
  if (currentLevel === "Not shown") {
    return 3;
  }

  if (currentLevel === "Partial exposure") {
    return 2;
  }

  if (currentLevel === "Working proficiency") {
    return 1;
  }

  return 0;
};

const proofValueWeightFor = (item: GapAnalysisItem) => {
  const canonicalName = canonicalSkill(item.skillName);

  if (proofFriendlySkills.some((skill) => canonicalName.includes(skill))) {
    return 3;
  }

  if (["frameworks", "databases", "cloud", "tools"].includes(item.category)) {
    return 2;
  }

  if (item.category === "languages") {
    return 2;
  }

  return item.gapSeverity === "Nice to have" ? 1 : 2;
};

const scoreGaps = (items: GapAnalysisItem[], targetStack: string[]): ScoredGap[] => {
  const availableSkillNames = new Set(items.map((item) => canonicalSkill(item.skillName)));

  return items.map((item, originalIndex) => {
    const canonicalName = canonicalSkill(item.skillName);
    const severityWeight = severityWeights[item.gapSeverity];
    const dependencyWeight = dependencyWeightFor(canonicalName, availableSkillNames);
    const repetitionWeight = repetitionWeightFor(item, targetStack);
    const evidenceGapWeight = evidenceGapWeightFor(item.currentLevel);
    const proofValueWeight = proofValueWeightFor(item);

    return {
      item,
      canonicalName,
      priorityScore:
        severityWeight + dependencyWeight + repetitionWeight + evidenceGapWeight + proofValueWeight,
      severityWeight,
      dependencyWeight,
      repetitionWeight,
      evidenceGapWeight,
      proofValueWeight,
      originalIndex
    };
  });
};

const compareScoredGaps = (left: ScoredGap, right: ScoredGap) => {
  const scoreDifference = right.priorityScore - left.priorityScore;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const severityDifference =
    severityTieBreak[left.item.gapSeverity] - severityTieBreak[right.item.gapSeverity];

  if (severityDifference !== 0) {
    return severityDifference;
  }

  const dependencyDifference = right.dependencyWeight - left.dependencyWeight;

  if (dependencyDifference !== 0) {
    return dependencyDifference;
  }

  const proofDifference = right.proofValueWeight - left.proofValueWeight;

  if (proofDifference !== 0) {
    return proofDifference;
  }

  return left.originalIndex - right.originalIndex;
};

const applyDependencyConstraints = (scoredGaps: ScoredGap[]) => {
  const byCanonicalName = new Map(scoredGaps.map((gap) => [gap.canonicalName, gap]));
  const remaining = [...scoredGaps].sort(compareScoredGaps);
  const ordered: ScoredGap[] = [];
  const placed = new Set<string>();

  while (remaining.length > 0) {
    const availableIndex = remaining.findIndex((gap) =>
      (dependencyMap.get(gap.canonicalName) ?? [])
        .filter((dependency) => byCanonicalName.has(dependency))
        .every((dependency) => placed.has(dependency))
    );
    const index = availableIndex === -1 ? 0 : availableIndex;
    const [nextGap] = remaining.splice(index, 1);

    ordered.push(nextGap);
    placed.add(nextGap.canonicalName);
  }

  return ordered;
};

const timelineSkillLimit = (timelineWeeks: number, orderedGaps: ScoredGap[]) => {
  if (timelineWeeks === 8) {
    const highImpactCount = orderedGaps.filter(
      (gap) =>
        gap.item.gapSeverity === "Critical" ||
        (gap.item.gapSeverity === "Important" && gap.priorityScore >= 9)
    ).length;

    return Math.min(timelineWeeks, Math.max(1, highImpactCount || Math.min(orderedGaps.length, 6)));
  }

  if (timelineWeeks === 12) {
    return Math.min(timelineWeeks, Math.max(1, orderedGaps.length));
  }

  return Math.max(1, orderedGaps.length);
};

const choosePracticeMode = (week: number, timelineWeeks: number): WeeklyPlan["mode"] => {
  const progress = week / timelineWeeks;

  if (progress <= 0.3) {
    return "foundation";
  }

  if (progress <= 0.7) {
    return "practice";
  }

  return "proof";
};

const buildWeeklyPlans = (orderedGaps: ScoredGap[], timelineWeeks: number): WeeklyPlan[] => {
  if (orderedGaps.length === 0) {
    return Array.from({ length: timelineWeeks }, (_value, index) => ({
      week: index + 1,
      mode: index + 1 <= Math.ceil(timelineWeeks * 0.3) ? "foundation" : "consolidation",
      linkedSkills: []
    }));
  }

  const skillLimit = timelineSkillLimit(timelineWeeks, orderedGaps);
  const selectedGaps = orderedGaps.slice(0, skillLimit);
  const plans: WeeklyPlan[] = selectedGaps.map((gap, index) => ({
    week: index + 1,
    gap,
    mode: choosePracticeMode(index + 1, timelineWeeks),
    linkedSkills: [gap.item.skillName]
  }));

  const reinforcementPool = selectedGaps.filter(
    (gap) => gap.item.gapSeverity !== "Nice to have" || gap.priorityScore >= 8
  );

  const firstReinforcementWeek = plans.length + 1;

  for (let week = firstReinforcementWeek; week <= timelineWeeks; week += 1) {
    const reinforcementIndex = week - firstReinforcementWeek;
    const gap =
      reinforcementPool[reinforcementIndex % Math.max(1, reinforcementPool.length)] ??
      selectedGaps[reinforcementIndex % selectedGaps.length];

    plans.push({
      week,
      gap,
      mode: week > Math.floor(timelineWeeks * 0.75) ? "proof" : "practice",
      linkedSkills: [gap.item.skillName]
    });
  }

  return plans;
};

const categoryAction = (category: SkillCategory, skillName: string) => {
  if (category === "languages") {
    return `Practice ${skillName} syntax, data handling, and common interview patterns`;
  }

  if (category === "frameworks") {
    return `Build one small ${skillName} feature that matches ${skillName} usage in the role`;
  }

  if (category === "databases") {
    return `Model a small dataset and write queries or schema changes with ${skillName}`;
  }

  if (category === "cloud") {
    return `Run a tiny deployment or environment setup exercise using ${skillName}`;
  }

  if (category === "tools") {
    return `Use ${skillName} in a realistic development workflow`;
  }

  return `Practice ${skillName} through a role-specific scenario`;
};

const proofTaskFor = (skillName: string, category: SkillCategory, targetRole: string) => {
  if (category === "tools" && canonicalSkill(skillName).includes("test")) {
    return `Add a testable proof artifact for ${skillName}, such as a small passing test suite`;
  }

  if (category === "cloud") {
    return `Capture deployment notes or screenshots that explain how ${skillName} supports ${targetRole} work`;
  }

  if (category === "databases") {
    return `Commit a query, schema, or migration example that proves ${skillName} readiness`;
  }

  return `Create a small proof artifact showing ${skillName} in a ${targetRole} context`;
};

const buildTasks = (plan: WeeklyPlan, targetRole: string) => {
  if (!plan.gap) {
    return [
      `Review the strongest existing ${targetRole} signals from the prior roadmap work`,
      "Tighten notes into concise interview explanations",
      "Polish one small proof artifact from an earlier week"
    ];
  }

  const { item } = plan.gap;
  const skillName = item.skillName;
  const tasks =
    plan.mode === "foundation"
      ? [
          `Map the core concepts of ${skillName} to daily ${targetRole} responsibilities`,
          categoryAction(item.category, skillName),
          proofTaskFor(skillName, item.category, targetRole)
        ]
      : plan.mode === "practice"
        ? [
            categoryAction(item.category, skillName),
            `Connect ${skillName} to one existing resume project or experience bullet`,
            proofTaskFor(skillName, item.category, targetRole)
          ]
        : [
            `Refine the strongest ${skillName} proof into a resume-ready bullet`,
            `Practice explaining ${skillName} tradeoffs for ${targetRole} interviews`,
            proofTaskFor(skillName, item.category, targetRole)
          ];

  if (item.currentLevel === "Not shown" && tasks.length < 4) {
    tasks.splice(
      1,
      0,
      `Implement a tiny from-scratch exercise before adding ${skillName} to larger work`
    );
  }

  return tasks.slice(0, 4);
};

const buildFocus = (plan: WeeklyPlan, targetRole: string) => {
  if (!plan.gap) {
    return plan.week === 1 ? `${targetRole} baseline consolidation` : `${targetRole} proof polish`;
  }

  const skillName = plan.gap.item.skillName;

  if (plan.mode === "foundation") {
    return `${skillName} foundations for ${targetRole}`;
  }

  if (plan.mode === "practice") {
    return `${skillName} applied practice`;
  }

  return `${skillName} proof and interview readiness`;
};

const buildNotes = (plan: WeeklyPlan, timelineWeeks: number) => {
  if (!plan.gap) {
    return "Use this week to reduce rough edges without adding new topics.";
  }

  if (timelineWeeks === 8) {
    return "Aggressive track: keep scope tight and produce visible proof quickly.";
  }

  if (timelineWeeks === 24) {
    return "Deeper track: leave room for repetition, documentation, and cleanup.";
  }

  return undefined;
};

const toMilestones = (plans: WeeklyPlan[], targetRole: string, timelineWeeks: number) =>
  plans.map((plan): RoadmapMilestone => ({
    week: plan.week,
    focus: buildFocus(plan, targetRole),
    tasks: buildTasks(plan, targetRole),
    linkedSkills: unique(plan.linkedSkills),
    notes: buildNotes(plan, timelineWeeks),
    resources: []
  }));

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

const roadmapPace = (timelineWeeks: number) => {
  if (timelineWeeks === 8) {
    return "aggressive";
  }

  if (timelineWeeks === 24) {
    return "deeper and more spacious";
  }

  return "balanced";
};

const roadmapPacePhrase = (timelineWeeks: number) => {
  if (timelineWeeks === 8) {
    return "an aggressive";
  }

  if (timelineWeeks === 24) {
    return "a deeper and more spacious";
  }

  return "a balanced";
};

const validateLlmRefinements = (
  value: unknown,
  draftMilestones: RoadmapMilestone[]
): ValidationResult<LlmMilestoneRefinement[]> => {
  if (!isRecord(value) || !Array.isArray(value.milestones)) {
    return {
      ok: false,
      errors: ["milestones must be an array."],
      warnings: []
    };
  }

  const draftByWeek = new Map(draftMilestones.map((milestone) => [milestone.week, milestone]));
  const errors: string[] = [];
  const warnings: ContractWarning[] = [];

  const refinements = value.milestones
    .filter(isRecord)
    .map((item): LlmMilestoneRefinement | undefined => {
      const week = typeof item.week === "number" ? item.week : 0;
      const draft = draftByWeek.get(week);

      if (!draft) {
        errors.push(`milestones contains unknown week ${week}.`);
        return undefined;
      }

      const tasks = Array.isArray(item.tasks)
        ? item.tasks
            .filter((task): task is string => typeof task === "string")
            .map((task) => task.trim())
            .filter(Boolean)
            .slice(0, 4)
        : undefined;

      if (tasks && (tasks.length < 2 || tasks.length > 4)) {
        errors.push(`milestones[week=${week}].tasks must contain 2 to 4 tasks.`);
        return undefined;
      }

      return {
        week,
        focus:
          typeof item.focus === "string" && item.focus.trim().length > 0
            ? item.focus.trim().slice(0, 90)
            : undefined,
        tasks,
        notes:
          typeof item.notes === "string" && item.notes.trim().length > 0
            ? item.notes.trim().slice(0, 160)
            : undefined
      };
    })
    .filter((item): item is LlmMilestoneRefinement => Boolean(item));

  if (refinements.length === 0) {
    errors.push("milestones did not contain usable refinements.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return { ok: true, value: refinements, warnings };
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number) =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error("LLM roadmap wording timed out.")), timeoutMs);
    })
  ]);

const smoothMilestonesWithLlm = async (
  milestones: RoadmapMilestone[],
  request: RoadmapRequest,
  llmProvider: LlmProvider
) => {
  const payload = {
    targetRole: request.targetRole,
    targetStack: request.targetStack ?? [],
    timelineWeeks: request.timelineWeeks,
    roadmapPace: roadmapPace(request.timelineWeeks),
    fixedMilestones: milestones.map((milestone) => ({
      week: milestone.week,
      linkedSkills: milestone.linkedSkills,
      focus: milestone.focus,
      tasks: milestone.tasks,
      notes: milestone.notes
    }))
  };
  const result = await withTimeout(
    generateValidatedJson({
      task: "roadmapRefinement",
      provider: llmProvider,
      systemPrompt:
        "You improve wording for a rule-generated learning roadmap. Do not add, remove, reorder, or reprioritize weeks. Do not change linkedSkills. Do not add resources. Return JSON with a milestones array. Each milestone must keep the same week number and may only rewrite focus, tasks, and notes for clarity. Keep each week focused on the provided linkedSkills and keep 2 to 4 tasks.",
      userPrompt: JSON.stringify(payload),
      repairPrompt: (errors) => `Repair the JSON roadmap refinements without changing week order or linkedSkills.
Validation errors:
${errors.map((error) => `- ${error}`).join("\n")}

Return only corrected JSON with a milestones array.`,
      validate: (value) => validateLlmRefinements(value, milestones)
    }),
    7000
  );
  const refinements = result.value;
  const refinementByWeek = new Map(refinements.map((refinement) => [refinement.week, refinement]));

  return milestones.map((milestone) => {
    const refinement = refinementByWeek.get(milestone.week);

    if (!refinement) {
      return milestone;
    }

    return {
      ...milestone,
      focus: refinement.focus ?? milestone.focus,
      tasks: refinement.tasks ?? milestone.tasks,
      notes: refinement.notes ?? milestone.notes
    };
  });
};

export const generateRoadmap = async (
  request: RoadmapRequest,
  options: { llmProvider?: LlmProvider } = {}
): Promise<RoadmapOutput> => {
  const scoredGaps = scoreGaps(request.gapAnalysisItems, request.targetStack ?? []);
  const orderedGaps = applyDependencyConstraints(scoredGaps);
  const weeklyPlans = buildWeeklyPlans(orderedGaps, request.timelineWeeks);
  let milestones = toMilestones(weeklyPlans, request.targetRole, request.timelineWeeks);
  let refinedByLlm = false;
  let fallbackUsed = false;

  if (options.llmProvider) {
    try {
      milestones = await smoothMilestonesWithLlm(milestones, request, options.llmProvider);
      refinedByLlm = true;
    } catch (error) {
      console.debug("[ai-generation]", {
        task: "roadmapRefinement",
        provider: options.llmProvider.name ?? "unknown",
        status: "fallback",
        reason: error instanceof Error ? error.message : "Unknown refinement error."
      });
      milestones = toMilestones(weeklyPlans, request.targetRole, request.timelineWeeks);
      fallbackUsed = true;
    }
  }

  const jobDescriptionCount = request.jobDescriptionCount ?? 0;
  const output: RoadmapOutput = {
    timelineWeeks: request.timelineWeeks,
    goal: `Prepare for ${request.targetRole} roles with ${roadmapPacePhrase(
      request.timelineWeeks
    )} ${request.timelineWeeks}-week roadmap`,
    milestones,
    signalStrength: signalStrengthFor(
      orderedGaps.map((gap) => gap.item),
      jobDescriptionCount
    ),
    generatedFromNote: `Generated from ordered gap analysis, target role${
      jobDescriptionCount > 0 ? `, and ${jobDescriptionCount} accepted JD(s)` : ""
    } using rule-based priority, dependency ordering, weekly load limits, and timeline distribution${
      refinedByLlm ? " with LLM wording refinement" : ""
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
    },
    warnings: buildGenerationWarnings({
      task: "roadmap",
      jobDescriptionCount,
      targetStack: request.targetStack,
      gapCount: request.gapAnalysisItems.length,
      refinedByLlm,
      fallbackUsed
    })
  };

  assertRoadmapQuality(output);

  return output;
};

export const isSupportedTimeline = (value: number) =>
  SUPPORTED_TIMELINE_WEEKS.some((weeks) => weeks === value);
