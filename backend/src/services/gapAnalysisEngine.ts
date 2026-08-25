import type {
  ContractWarning,
  EvidenceSource,
  GapAnalysisItem,
  GapAnalysisOutput,
  GapAnalysisRequest,
  GapSeverity,
  ParsedJobDescription,
  ParsedResume,
  PlanInputContext,
  SignalLabel,
  SkillCategory,
  SkillLevel
} from "@rsgp/shared";
import { generateValidatedJson } from "./aiGenerationService.js";
import type { LlmProvider } from "./llmProvider.js";
import {
  assertGapAnalysisQuality,
  buildGenerationWarnings
} from "./outputQualityValidation.js";
import type { ValidationResult } from "./structuredOutputValidation.js";

type TargetSkillSignal = {
  canonicalName: string;
  category: SkillCategory;
  requiredCount: number;
  preferredCount: number;
  techStackCount: number;
  targetStackSignal: boolean;
  softSkillSignal: boolean;
  evidenceSources: EvidenceSource[];
};

type CurrentSkillEvidence = {
  canonicalName: string;
  category: SkillCategory;
  resumeSkillCount: number;
  experienceCount: number;
  projectCount: number;
  domainCount: number;
  evidenceSources: EvidenceSource[];
};

type NormalizedGapInput = {
  parsedResume: ParsedResume;
  targetRole: string;
  targetStack: string[];
  acceptedJobDescriptions: ParsedJobDescription[];
  resumeText?: string;
};

type LlmGapRefinement = {
  skillName: string;
  currentLevel?: SkillLevel;
  reason?: string;
};

const skillLevels: SkillLevel[] = [
  "Not shown",
  "Partial exposure",
  "Working proficiency",
  "Interview-ready",
  "Production-ready"
];

const severityOrder: Record<GapSeverity, number> = {
  Critical: 0,
  Important: 1,
  "Nice to have": 2
};

const levelOrder: Record<SkillLevel, number> = {
  "Not shown": 0,
  "Partial exposure": 1,
  "Working proficiency": 2,
  "Interview-ready": 3,
  "Production-ready": 4
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
    "linux",
    "testing library",
    "jest",
    "cypress"
  ],
  other: [
    "rest",
    "graphql",
    "microservices",
    "llm",
    "machine learning",
    "agile",
    "api integration",
    "communication",
    "collaboration",
    "ownership",
    "problem solving",
    "mentoring",
    "stakeholder management",
    "teamwork"
  ]
};

const skillSynonyms: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  "react.js": "react",
  reactjs: "react",
  react: "react",
  "nextjs": "next.js",
  "next js": "next.js",
  "node": "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  postgres: "postgresql",
  postgresql: "postgresql",
  "postgre sql": "postgresql",
  k8s: "kubernetes",
  kubernetes: "kubernetes",
  "amazon web services": "aws",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "rest api": "rest",
  "restful api": "rest",
  "rest apis": "rest",
  "tailwindcss": "tailwind css",
  teamwork: "collaboration",
  communicating: "communication",
  "problem-solving": "problem solving"
};

const displayNames: Record<string, string> = {
  aws: "AWS",
  gcp: "GCP",
  javascript: "JavaScript",
  typescript: "TypeScript",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  rest: "REST",
  llm: "LLM",
  "c#": "C#",
  "c++": "C++",
  ".net": ".NET",
  "node.js": "Node.js",
  "next.js": "Next.js",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  java: "Java",
  python: "Python",
  go: "Go",
  redis: "Redis",
  sqlite: "SQLite",
  react: "React",
  angular: "Angular",
  vue: "Vue",
  express: "Express",
  springboot: "Spring Boot",
  fastapi: "FastAPI",
  django: "Django",
  kubernetes: "Kubernetes",
  docker: "Docker",
  git: "Git",
  github: "GitHub",
  "azure devops": "Azure DevOps",
  jira: "Jira",
  postman: "Postman",
  figma: "Figma",
  linux: "Linux",
  jest: "Jest",
  cypress: "Cypress",
  "testing library": "Testing Library"
};

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const canonicalSkill = (skill: string) => {
  const normalized = normalizeText(skill);

  return skillSynonyms[normalized] ?? normalized;
};

const displaySkill = (skill: string) => {
  const canonical = canonicalSkill(skill);

  if (displayNames[canonical]) {
    return displayNames[canonical];
  }

  return canonical
    .split(" ")
    .map((part) =>
      part.length <= 3 && /^[a-z]+$/.test(part)
        ? part.toUpperCase()
        : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`
    )
    .join(" ");
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

const inferCategory = (skillName: string, fallback?: SkillCategory): SkillCategory => {
  const canonical = canonicalSkill(skillName);
  const match = Object.entries(categoryHints).find(([_category, hints]) =>
    hints.some((hint) => canonicalSkill(hint) === canonical)
  );

  return (match?.[0] as SkillCategory | undefined) ?? fallback ?? "other";
};

const appendEvidence = (target: EvidenceSource[], source: EvidenceSource) => {
  if (!target.some((existing) => existing.id === source.id)) {
    target.push(source);
  }
};

const normalizeRequest = (request: GapAnalysisRequest): NormalizedGapInput => {
  const context = request.planInputContext;
  const parsedResume = request.parsedResume ?? context?.resume.parsedResume;
  const targetRole = request.targetRole ?? context?.targetRole;

  if (!parsedResume) {
    throw new Error("parsedResume or planInputContext.resume.parsedResume is required.");
  }

  if (!targetRole || targetRole.trim().length < 2) {
    throw new Error("targetRole or planInputContext.targetRole is required.");
  }

  return {
    parsedResume,
    targetRole: targetRole.trim(),
    targetStack: request.targetStack ?? context?.targetStack ?? [],
    acceptedJobDescriptions:
      request.acceptedJobDescriptions ??
      context?.acceptedJobDescriptions.map((envelope) => envelope.parsedJobDescription) ??
      [],
    resumeText: context?.resume.extractedText
  };
};

const addTargetSignal = (
  signals: Map<string, TargetSkillSignal>,
  skillName: string,
  updates: Partial<
    Pick<
      TargetSkillSignal,
      "requiredCount" | "preferredCount" | "techStackCount" | "targetStackSignal" | "softSkillSignal"
    >
  >,
  evidenceSource: EvidenceSource,
  category?: SkillCategory
) => {
  const key = canonicalSkill(skillName);
  const existing = signals.get(key);

  if (existing) {
    existing.requiredCount += updates.requiredCount ?? 0;
    existing.preferredCount += updates.preferredCount ?? 0;
    existing.techStackCount += updates.techStackCount ?? 0;
    existing.targetStackSignal = existing.targetStackSignal || Boolean(updates.targetStackSignal);
    existing.softSkillSignal = existing.softSkillSignal || Boolean(updates.softSkillSignal);
    appendEvidence(existing.evidenceSources, evidenceSource);
    return;
  }

  signals.set(key, {
    canonicalName: key,
    category: inferCategory(skillName, category),
    requiredCount: updates.requiredCount ?? 0,
    preferredCount: updates.preferredCount ?? 0,
    techStackCount: updates.techStackCount ?? 0,
    targetStackSignal: Boolean(updates.targetStackSignal),
    softSkillSignal: Boolean(updates.softSkillSignal),
    evidenceSources: [evidenceSource]
  });
};

const collectTargetSignals = (
  targetStack: string[],
  jobDescriptions: ParsedJobDescription[]
): TargetSkillSignal[] => {
  const signals = new Map<string, TargetSkillSignal>();

  for (const skill of targetStack) {
    addTargetSignal(
      signals,
      skill,
      { targetStackSignal: true },
      {
        id: `target-stack-${canonicalSkill(skill)}`,
        sourceType: "targetRole",
        label: `Target stack: ${displaySkill(skill)}`
      }
    );
  }

  for (const jobDescription of jobDescriptions) {
    for (const skill of jobDescription.requiredSkills) {
      addTargetSignal(
        signals,
        skill,
        { requiredCount: 1 },
        {
          id: `${jobDescription.id}-required-${canonicalSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: required ${displaySkill(skill)}`
        }
      );
    }

    for (const skill of jobDescription.preferredSkills) {
      addTargetSignal(
        signals,
        skill,
        { preferredCount: 1 },
        {
          id: `${jobDescription.id}-preferred-${canonicalSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: preferred ${displaySkill(skill)}`
        }
      );
    }

    for (const skill of jobDescription.techStack) {
      addTargetSignal(
        signals,
        skill,
        { techStackCount: 1 },
        {
          id: `${jobDescription.id}-stack-${canonicalSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: stack mentions ${displaySkill(skill)}`
        }
      );
    }

    for (const skill of jobDescription.softSkills) {
      addTargetSignal(
        signals,
        skill,
        { softSkillSignal: true, preferredCount: 1 },
        {
          id: `${jobDescription.id}-soft-${canonicalSkill(skill)}`,
          sourceType: "jobDescription",
          label: `${jobDescription.roleTitle}: soft skill ${displaySkill(skill)}`
        },
        "other"
      );
    }
  }

  return Array.from(signals.values());
};

const addCurrentEvidence = (
  evidence: Map<string, CurrentSkillEvidence>,
  skillName: string,
  updates: Partial<
    Pick<CurrentSkillEvidence, "resumeSkillCount" | "experienceCount" | "projectCount" | "domainCount">
  >,
  source: EvidenceSource,
  category?: SkillCategory
) => {
  const key = canonicalSkill(skillName);
  const existing = evidence.get(key);

  if (existing) {
    existing.resumeSkillCount += updates.resumeSkillCount ?? 0;
    existing.experienceCount += updates.experienceCount ?? 0;
    existing.projectCount += updates.projectCount ?? 0;
    existing.domainCount += updates.domainCount ?? 0;
    appendEvidence(existing.evidenceSources, source);
    return;
  }

  evidence.set(key, {
    canonicalName: key,
    category: inferCategory(skillName, category),
    resumeSkillCount: updates.resumeSkillCount ?? 0,
    experienceCount: updates.experienceCount ?? 0,
    projectCount: updates.projectCount ?? 0,
    domainCount: updates.domainCount ?? 0,
    evidenceSources: [source]
  });
};

const collectCurrentEvidence = (
  resume: ParsedResume,
  targetSignals: TargetSkillSignal[],
  resumeText?: string
) => {
  const evidence = new Map<string, CurrentSkillEvidence>();

  for (const [category, skills] of Object.entries(resume.skills) as Array<
    [SkillCategory, string[]]
  >) {
    for (const skill of skills) {
      addCurrentEvidence(
        evidence,
        skill,
        { resumeSkillCount: 1 },
        {
          id: `resume-skill-${canonicalSkill(skill)}`,
          sourceType: "resume",
          label: `Resume skills: ${displaySkill(skill)}`
        },
        category
      );
    }
  }

  resume.experience.forEach((experience, index) => {
    for (const skill of experience.skillsUsed) {
      addCurrentEvidence(
        evidence,
        skill,
        { experienceCount: 1 },
        {
          id: `resume-experience-${index + 1}-${canonicalSkill(skill)}`,
          sourceType: "resume",
          label: `${experience.roleTitle}: used ${displaySkill(skill)}`,
          excerpt: experience.summary ?? experience.highlights[0]
        }
      );
    }
  });

  resume.projects.forEach((project, index) => {
    for (const skill of project.skillsUsed) {
      addCurrentEvidence(
        evidence,
        skill,
        { projectCount: 1 },
        {
          id: `resume-project-${index + 1}-${canonicalSkill(skill)}`,
          sourceType: "resume",
          label: `${project.title}: used ${displaySkill(skill)}`,
          excerpt: project.description ?? project.highlights[0]
        }
      );
    }
  });

  resume.inferredDomains.forEach((domain, index) => {
    addCurrentEvidence(
      evidence,
      domain,
      { domainCount: 1 },
      {
        id: `resume-domain-${index + 1}`,
        sourceType: "resume",
        label: `Resume domain: ${domain}`
      },
      "other"
    );
  });

  if (resumeText) {
    const normalizedResumeText = normalizeText(resumeText);

    for (const signal of targetSignals) {
      if (
        normalizedResumeText.includes(signal.canonicalName) &&
        !evidence.has(signal.canonicalName)
      ) {
        addCurrentEvidence(
          evidence,
          signal.canonicalName,
          { resumeSkillCount: 1 },
          {
            id: `resume-text-${signal.canonicalName}`,
            sourceType: "resume",
            label: `Resume text mentions ${displaySkill(signal.canonicalName)}`
          },
          signal.category
        );
      }
    }
  }

  return evidence;
};

const inferCurrentLevel = (evidence: CurrentSkillEvidence | undefined): SkillLevel => {
  if (!evidence) {
    return "Not shown";
  }

  if (evidence.experienceCount >= 2 || (evidence.experienceCount > 0 && evidence.projectCount > 0)) {
    return "Production-ready";
  }

  if (evidence.experienceCount > 0 || evidence.projectCount >= 2) {
    return "Interview-ready";
  }

  if (evidence.projectCount > 0 || evidence.resumeSkillCount > 0) {
    return "Working proficiency";
  }

  return "Partial exposure";
};

const inferTargetLevel = (signal: TargetSkillSignal): SkillLevel => {
  if (
    !signal.softSkillSignal &&
    signal.targetStackSignal &&
    (signal.requiredCount > 0 || signal.techStackCount > 1)
  ) {
    return "Production-ready";
  }

  if (signal.requiredCount > 0 || signal.targetStackSignal) {
    return "Interview-ready";
  }

  return signal.softSkillSignal ? "Working proficiency" : "Interview-ready";
};

const inferSeverity = (
  signal: TargetSkillSignal,
  currentLevel: SkillLevel,
  targetLevel: SkillLevel,
  jobDescriptionCount: number
): GapSeverity => {
  const isWeakOrAbsent = levelOrder[currentLevel] < levelOrder[targetLevel];
  const repeatedRequired =
    signal.requiredCount >= Math.max(1, Math.ceil(Math.max(jobDescriptionCount, 1) / 2));
  const repeatedTargetSignal =
    signal.targetStackSignal && (signal.requiredCount > 0 || signal.techStackCount > 0);

  if (!isWeakOrAbsent || signal.softSkillSignal) {
    return signal.softSkillSignal ? "Nice to have" : "Important";
  }

  if (repeatedRequired || repeatedTargetSignal) {
    return "Critical";
  }

  if (signal.requiredCount > 0 || signal.preferredCount > 1 || signal.targetStackSignal) {
    return "Important";
  }

  return "Nice to have";
};

const inferSignalStrength = (signal: TargetSkillSignal): SignalLabel => {
  const weightedCount =
    signal.requiredCount * 2 +
    signal.preferredCount +
    signal.techStackCount +
    (signal.targetStackSignal ? 2 : 0) +
    (signal.softSkillSignal ? -1 : 0);

  if (!signal.softSkillSignal && (signal.requiredCount > 1 || weightedCount >= 4)) {
    return "Strong signal";
  }

  if (signal.requiredCount === 1 || signal.targetStackSignal || weightedCount >= 2) {
    return "Medium signal";
  }

  return "Weak signal";
};

 const buildReason = (
  signal: TargetSkillSignal,
  currentEvidence: CurrentSkillEvidence | undefined,
  currentLevel: SkillLevel,
  targetLevel: SkillLevel,
  jobDescriptionCount: number
) => {
  const targetParts: string[] = [];

  if (signal.targetStackSignal) {
    targetParts.push("the target stack");
  }

  if (signal.requiredCount > 0) {
    targetParts.push(
      `required skills in ${signal.requiredCount} of ${jobDescriptionCount} accepted JD(s)`
    );
  }

  if (signal.preferredCount > 0) {
    targetParts.push(`preferred or soft-skill signals in ${signal.preferredCount} JD signal(s)`);
  }

  if (signal.techStackCount > 0) {
    targetParts.push(`JD tech stack mentions in ${signal.techStackCount} accepted JD(s)`);
  }

  const currentText =
    currentLevel === "Not shown"
      ? "The parsed resume does not show matching evidence."
      : `The resume shows ${currentLevel.toLowerCase()} through ${currentEvidence?.evidenceSources
          .slice(0, 2)
          .map((source) => source.label)
          .join(" and ")}.`;

  return `${displaySkill(signal.canonicalName)} appears in ${targetParts.join(
    ", "
  )}; target level is ${targetLevel}. ${currentText}`;
};

const buildRuleBasedItems = (input: NormalizedGapInput): GapAnalysisItem[] => {
  const targetSignals = collectTargetSignals(input.targetStack, input.acceptedJobDescriptions);
  const currentEvidence = collectCurrentEvidence(input.parsedResume, targetSignals, input.resumeText);

  return targetSignals
    .map((signal) => {
      const evidence = currentEvidence.get(signal.canonicalName);
      const currentLevel = inferCurrentLevel(evidence);
      const targetLevel = inferTargetLevel(signal);

      if (levelOrder[currentLevel] >= levelOrder[targetLevel]) {
        return undefined;
      }

      return {
        skillName: displaySkill(signal.canonicalName),
        category: signal.category,
        currentLevel,
        targetLevel,
        gapSeverity: inferSeverity(
          signal,
          currentLevel,
          targetLevel,
          input.acceptedJobDescriptions.length
        ),
        reason: buildReason(
          signal,
          evidence,
          currentLevel,
          targetLevel,
          input.acceptedJobDescriptions.length
        ),
        signalStrength: inferSignalStrength(signal),
        evidenceSources: unique([
          ...signal.evidenceSources,
          ...(evidence?.evidenceSources ?? [])
        ]).slice(0, 6)
      } satisfies GapAnalysisItem;
    })
    .filter((item): item is GapAnalysisItem => Boolean(item))
    .sort(compareGapItems);
};

const compareGapItems = (left: GapAnalysisItem, right: GapAnalysisItem) => {
  const severityDifference = severityOrder[left.gapSeverity] - severityOrder[right.gapSeverity];

  if (severityDifference !== 0) {
    return severityDifference;
  }

  const softSkillDifference = Number(left.category === "other") - Number(right.category === "other");

  if (softSkillDifference !== 0) {
    return softSkillDifference;
  }

  const levelDifference = levelOrder[left.currentLevel] - levelOrder[right.currentLevel];

  return levelDifference !== 0 ? levelDifference : left.skillName.localeCompare(right.skillName);
};

const isSkillLevel = (value: unknown): value is SkillLevel =>
  skillLevels.includes(value as SkillLevel);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateLlmRefinements = (
  value: unknown,
  allowedSkillNames: Set<string>
): ValidationResult<LlmGapRefinement[]> => {
  if (!isRecord(value) || !Array.isArray(value.refinements)) {
    return {
      ok: false,
      errors: ["refinements must be an array."],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: ContractWarning[] = [];
  const refinements = value.refinements
    .filter(isRecord)
    .map((item): LlmGapRefinement | undefined => {
      const skillName = typeof item.skillName === "string" ? item.skillName.trim() : "";

      if (!allowedSkillNames.has(skillName)) {
        warnings.push({
          code: "llm_refinement.ignored_gap_skill",
          message: `Ignored gap refinement for unknown skill "${skillName}".`,
          severity: "info"
        });
        return undefined;
      }

      return {
        skillName,
        currentLevel: isSkillLevel(item.currentLevel) ? item.currentLevel : undefined,
        reason:
          typeof item.reason === "string" && item.reason.trim().length > 0
            ? item.reason.trim().slice(0, 320)
            : undefined
      };
    })
    .filter((item): item is LlmGapRefinement => Boolean(item));

  if (refinements.length === 0) {
    errors.push("refinements did not contain usable gap refinements.");
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
      setTimeout(() => reject(new Error("LLM gap refinement timed out.")), timeoutMs);
    })
  ]);

const refineItemsWithLlm = async (
  items: GapAnalysisItem[],
  input: NormalizedGapInput,
  llmProvider: LlmProvider
) => {
  if (items.length === 0) {
    return items;
  }

  const payload = {
    targetRole: input.targetRole,
    resumeSummary: {
      currentRole: input.parsedResume.currentRole,
      experienceYears: input.parsedResume.experienceYears,
      inferredDomains: input.parsedResume.inferredDomains,
      experience: input.parsedResume.experience.slice(0, 4),
      projects: input.parsedResume.projects.slice(0, 4)
    },
    draftGapItems: items.map((item) => ({
      skillName: item.skillName,
      category: item.category,
      currentLevel: item.currentLevel,
      targetLevel: item.targetLevel,
      gapSeverity: item.gapSeverity,
      evidenceSources: item.evidenceSources
    }))
  };
  const result = await withTimeout(
    generateValidatedJson({
      task: "gapAnalysisRefinement",
      provider: llmProvider,
      systemPrompt:
        "You refine a rule-generated skill gap analysis. You must not add, remove, rename, reorder, or invent gap items. Return JSON with a refinements array. Each refinement must use an existing skillName exactly and may only adjust currentLevel or reason using the provided evidence. Allowed levels: Not shown, Partial exposure, Working proficiency, Interview-ready, Production-ready.",
      userPrompt: JSON.stringify(payload),
      repairPrompt: (errors) => `Repair the JSON skill-gap refinements without adding, removing, renaming, or reordering gap items.
Validation errors:
${errors.map((error) => `- ${error}`).join("\n")}

Return only corrected JSON with a refinements array.`,
      validate: (value) => validateLlmRefinements(value, new Set(items.map((item) => item.skillName)))
    }),
    7000
  );
  const refinements = result.value;
  const bySkillName = new Map(refinements.map((item) => [item.skillName, item]));

  return items.map((item) => {
    const refinement = bySkillName.get(item.skillName);

    if (!refinement) {
      return item;
    }

    const currentLevel =
      refinement.currentLevel && levelOrder[refinement.currentLevel] < levelOrder[item.targetLevel]
        ? refinement.currentLevel
        : item.currentLevel;

    return {
      ...item,
      currentLevel,
      reason: refinement.reason ?? item.reason
    };
  });
};

const generatedFromNote = (input: NormalizedGapInput, refinedByLlm: boolean) => {
  const generatedFrom = [
    "resume",
    "target role",
    ...(input.acceptedJobDescriptions.length > 0
      ? [`${input.acceptedJobDescriptions.length} accepted JD(s)`]
      : []),
    ...(input.targetStack.length > 0 ? ["target stack"] : [])
  ];

  return `Generated from ${generatedFrom.join(", ")} using rule-based gap assembly${
    refinedByLlm ? " with LLM evidence refinement" : ""
  }.`;
};

export const generateGapAnalysis = async (
  request: GapAnalysisRequest,
  options: { llmProvider?: LlmProvider } = {}
): Promise<GapAnalysisOutput> => {
  const input = normalizeRequest(request);
  const ruleBasedItems = buildRuleBasedItems(input);
  let items = ruleBasedItems;
  let refinedByLlm = false;
  let fallbackUsed = false;

  if (options.llmProvider) {
    try {
      items = await refineItemsWithLlm(ruleBasedItems, input, options.llmProvider);
      refinedByLlm = true;
    } catch (error) {
      console.debug("[ai-generation]", {
        task: "gapAnalysisRefinement",
        provider: options.llmProvider.name ?? "unknown",
        status: "fallback",
        reason: error instanceof Error ? error.message : "Unknown refinement error."
      });
      items = ruleBasedItems;
      fallbackUsed = true;
    }
  }

  items = [...items].sort(compareGapItems);

  const output: GapAnalysisOutput = {
    summary:
      items.length === 0
        ? "No skill gaps were detected from the available target and resume signals."
        : `${items.length} skill gap${items.length === 1 ? "" : "s"} detected for ${
            input.targetRole
          }.`,
    items,
    generatedFromNote: generatedFromNote(input, refinedByLlm),
    warnings: buildGenerationWarnings({
      task: "gapAnalysis",
      jobDescriptionCount: input.acceptedJobDescriptions.length,
      targetStack: input.targetStack,
      gapCount: items.length,
      refinedByLlm,
      fallbackUsed
    })
  };

  assertGapAnalysisQuality(output);

  return output;
};

export const generateGapAnalysisFromContext = (
  planInputContext: PlanInputContext,
  options: { llmProvider?: LlmProvider } = {}
) => generateGapAnalysis({ planInputContext }, options);
