import type {
  EvidenceSource,
  GapAnalysisItem,
  GapAnalysisOutput,
  GapAnalysisRequest,
  GapSeverity,
  ParsedJobDescription,
  ParsedResume,
  SignalLabel,
  SkillCategory,
  SkillLevel
} from "@rsgp/shared";

type TargetSkillSignal = {
  skillName: string;
  category: SkillCategory;
  requiredCount: number;
  preferredCount: number;
  targetStackSignal: boolean;
  evidenceSources: EvidenceSource[];
};

const categoryHints: Record<SkillCategory, string[]> = {
  languages: [
    "javascript",
    "typescript",
    "python",
    "java",
    "c#",
    "c++",
    "go",
    "sql",
    "html",
    "css"
  ],
  frameworks: [
    "react",
    "angular",
    "vue",
    "next.js",
    "node.js",
    "express",
    ".net",
    "spring boot",
    "fastapi",
    "django"
  ],
  databases: ["postgresql", "mysql", "sql server", "mongodb", "redis", "sqlite"],
  cloud: ["aws", "azure", "gcp", "docker", "kubernetes"],
  tools: [
    "git",
    "github",
    "azure devops",
    "jira",
    "postman",
    "figma",
    "testing library",
    "jest",
    "cypress"
  ],
  other: ["rest", "graphql", "microservices", "llm", "machine learning", "agile", "api integration"]
};

const normalizeSkill = (skill: string) => skill.trim().toLowerCase();

const displaySkill = (skill: string) =>
  skill
    .trim()
    .split(" ")
    .map((part) =>
      part.length <= 3 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`
    )
    .join(" ");

const inferCategory = (skillName: string): SkillCategory => {
  const normalized = normalizeSkill(skillName);
  const match = Object.entries(categoryHints).find(([_category, hints]) =>
    hints.some((hint) => normalizeSkill(hint) === normalized)
  );

  return (match?.[0] as SkillCategory | undefined) ?? "other";
};

const resumeSkillSet = (resume: ParsedResume) =>
  new Set(Object.values(resume.skills).flat().map(normalizeSkill));

const addSignal = (
  signals: Map<string, TargetSkillSignal>,
  skillName: string,
  updates: Partial<
    Pick<TargetSkillSignal, "requiredCount" | "preferredCount" | "targetStackSignal">
  >,
  evidenceSource: EvidenceSource
) => {
  const key = normalizeSkill(skillName);
  const existing = signals.get(key);

  if (existing) {
    existing.requiredCount += updates.requiredCount ?? 0;
    existing.preferredCount += updates.preferredCount ?? 0;
    existing.targetStackSignal = existing.targetStackSignal || Boolean(updates.targetStackSignal);
    existing.evidenceSources.push(evidenceSource);
    return;
  }

  signals.set(key, {
    skillName,
    category: inferCategory(skillName),
    requiredCount: updates.requiredCount ?? 0,
    preferredCount: updates.preferredCount ?? 0,
    targetStackSignal: Boolean(updates.targetStackSignal),
    evidenceSources: [evidenceSource]
  });
};

const collectTargetSignals = (
  targetStack: string[],
  jobDescriptions: ParsedJobDescription[]
): TargetSkillSignal[] => {
  const signals = new Map<string, TargetSkillSignal>();

  for (const skill of targetStack) {
    addSignal(
      signals,
      skill,
      {
        targetStackSignal: true
      },
      {
        id: `target-stack-${normalizeSkill(skill)}`,
        sourceType: "targetRole",
        label: `Target stack: ${skill}`
      }
    );
  }

  for (const jobDescription of jobDescriptions) {
    for (const skill of jobDescription.requiredSkills) {
      addSignal(
        signals,
        skill,
        {
          requiredCount: 1
        },
        {
          id: `${jobDescription.id}-required-${normalizeSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: required ${skill}`
        }
      );
    }

    for (const skill of jobDescription.preferredSkills) {
      addSignal(
        signals,
        skill,
        {
          preferredCount: 1
        },
        {
          id: `${jobDescription.id}-preferred-${normalizeSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: preferred ${skill}`
        }
      );
    }
  }

  return Array.from(signals.values());
};

const inferCurrentLevel = (skillKnown: boolean): SkillLevel =>
  skillKnown ? "Working knowledge" : "Not shown";

const inferTargetLevel = (signal: TargetSkillSignal): SkillLevel =>
  signal.requiredCount > 0 || signal.targetStackSignal ? "Interview-ready" : "Project-ready";

const inferSeverity = (signal: TargetSkillSignal, jobDescriptionCount: number): GapSeverity => {
  if (
    signal.requiredCount >= Math.max(1, Math.ceil(jobDescriptionCount / 2)) ||
    signal.targetStackSignal
  ) {
    return "Critical";
  }

  if (signal.requiredCount > 0 || signal.preferredCount > 1) {
    return "Important";
  }

  return "Nice to have";
};

const inferSignalStrength = (signal: TargetSkillSignal): SignalLabel => {
  const signalCount =
    signal.requiredCount + signal.preferredCount + (signal.targetStackSignal ? 1 : 0);

  if (signal.requiredCount > 1 || signalCount >= 3) {
    return "Strong signal";
  }

  if (signal.requiredCount === 1 || signal.targetStackSignal || signalCount === 2) {
    return "Medium signal";
  }

  return "Weak signal";
};

const buildReason = (signal: TargetSkillSignal, jobDescriptionCount: number) => {
  const parts: string[] = [];

  if (signal.targetStackSignal) {
    parts.push("included in the target stack");
  }

  if (signal.requiredCount > 0) {
    parts.push(
      `required in ${signal.requiredCount} of ${jobDescriptionCount} accepted job descriptions`
    );
  }

  if (signal.preferredCount > 0) {
    parts.push(`preferred in ${signal.preferredCount} accepted job descriptions`);
  }

  return `${displaySkill(signal.skillName)} is ${parts.join(" and ")} but is not clearly shown in the parsed resume.`;
};

export const generateGapAnalysis = (request: GapAnalysisRequest): GapAnalysisOutput => {
  const acceptedJobDescriptions = request.acceptedJobDescriptions ?? [];
  const targetStack = request.targetStack ?? [];
  const knownResumeSkills = resumeSkillSet(request.parsedResume);
  const targetSignals = collectTargetSignals(targetStack, acceptedJobDescriptions);
  const missingSignals = targetSignals.filter(
    (signal) => !knownResumeSkills.has(normalizeSkill(signal.skillName))
  );

  const items: GapAnalysisItem[] = missingSignals
    .map((signal) => ({
      skillName: displaySkill(signal.skillName),
      category: signal.category,
      currentLevel: inferCurrentLevel(false),
      targetLevel: inferTargetLevel(signal),
      gapSeverity: inferSeverity(signal, acceptedJobDescriptions.length),
      reason: buildReason(signal, acceptedJobDescriptions.length),
      signalStrength: inferSignalStrength(signal),
      evidenceSources: signal.evidenceSources.slice(0, 5)
    }))
    .sort((left, right) => {
      const severityOrder: Record<GapSeverity, number> = {
        Critical: 0,
        Important: 1,
        "Nice to have": 2
      };

      return severityOrder[left.gapSeverity] - severityOrder[right.gapSeverity];
    });

  const generatedFrom = [
    "resume",
    "target role",
    ...(acceptedJobDescriptions.length > 0
      ? [`${acceptedJobDescriptions.length} accepted JD(s)`]
      : []),
    ...(targetStack.length > 0 ? ["target stack"] : [])
  ];

  return {
    summary:
      items.length === 0
        ? "No missing target skills were detected from the available signals."
        : `${items.length} skill gap${items.length === 1 ? "" : "s"} detected for ${request.targetRole}.`,
    items,
    generatedFromNote: `Generated from ${generatedFrom.join(", ")}.`
  };
};
