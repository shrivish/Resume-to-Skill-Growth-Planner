import type {
  ContractWarning,
  GapAnalysisItem,
  ProjectDifficulty,
  ProjectRecommendation,
  ProjectRecommendationOutput,
  ProjectRecommendationRequest,
  ProjectRecommendationType,
  LearningResource,
  SkillCategory
} from "@rsgp/shared";
import { generateValidatedJson } from "./aiGenerationService.js";
import type { LlmProvider } from "./llmProvider.js";
import {
  assertProjectRecommendationQuality,
  buildGenerationWarnings
} from "./outputQualityValidation.js";
import type { ValidationResult } from "./structuredOutputValidation.js";

type RoleFamily = "backend" | "frontend" | "fullstack" | "data" | "general";

type ProjectCandidate = {
  id: string;
  baseTitle: string;
  type: ProjectRecommendationType;
  roleFamilies: RoleFamily[];
  skillKeywords: string[];
  categoryTargets: SkillCategory[];
  proofTags: Array<"code" | "architecture" | "testing" | "deployment" | "data" | "integration">;
  difficulty: ProjectDifficulty;
  baseDurationWeeks: number;
  summaryFrame: string;
  scopeHints: string[];
  starterIdeas: string[];
};

export type ScoredProjectCandidate = {
  candidate: ProjectCandidate;
  coveredSkills: string[];
  score: number;
  scoreBreakdown: {
    gapCoverage: number;
    proofStrength: number;
    roleAlignment: number;
    feasibility: number;
    stackAlignment: number;
    roadmapAlignment: number;
  };
};

type LlmProjectRefinement = {
  index: number;
  title?: string;
  description?: string;
  whyRecommended?: string;
  whatItProves?: string;
  summary?: string;
};

const githubReferences: Record<string, LearningResource[]> = {
  "backend-api-platform": [
    {
      type: "github",
      label: "expressjs/express",
      url: "https://github.com/expressjs/express",
      relatedSkills: ["Express", "API design", "middleware"]
    },
    {
      type: "github",
      label: "prisma/prisma-examples",
      url: "https://github.com/prisma/prisma-examples",
      relatedSkills: ["PostgreSQL", "database design", "Node.js"]
    }
  ],
  "fullstack-workflow-system": [
    {
      type: "github",
      label: "vercel/next.js examples",
      url: "https://github.com/vercel/next.js/tree/canary/examples",
      relatedSkills: ["Next.js", "React", "full-stack patterns"]
    },
    {
      type: "github",
      label: "prisma/prisma-examples",
      url: "https://github.com/prisma/prisma-examples",
      relatedSkills: ["database design", "API integration", "PostgreSQL"]
    }
  ],
  "frontend-admin-dashboard": [
    {
      type: "github",
      label: "reactjs/react.dev",
      url: "https://github.com/reactjs/react.dev",
      relatedSkills: ["React", "components", "frontend structure"]
    },
    {
      type: "github",
      label: "testing-library/react-testing-library",
      url: "https://github.com/testing-library/react-testing-library",
      relatedSkills: ["Testing Library", "React testing", "user-flow tests"]
    }
  ],
  "document-processing-service": [
    {
      type: "github",
      label: "nodejs/examples",
      url: "https://github.com/nodejs/examples",
      relatedSkills: ["Node.js", "files", "HTTP services"]
    },
    {
      type: "github",
      label: "docker/awesome-compose",
      url: "https://github.com/docker/awesome-compose",
      relatedSkills: ["Docker", "Compose", "local service setup"]
    }
  ],
  "analytics-dashboard": [
    {
      type: "github",
      label: "prisma/prisma-examples",
      url: "https://github.com/prisma/prisma-examples",
      relatedSkills: ["database modeling", "PostgreSQL", "application data"]
    },
    {
      type: "github",
      label: "vercel/next.js examples",
      url: "https://github.com/vercel/next.js/tree/canary/examples",
      relatedSkills: ["dashboard UI", "data loading", "React"]
    }
  ],
  "testing-retrofit": [
    {
      type: "github",
      label: "testing-library/react-testing-library",
      url: "https://github.com/testing-library/react-testing-library",
      relatedSkills: ["Testing Library", "frontend testing", "interaction tests"]
    },
    {
      type: "github",
      label: "nodejs/examples",
      url: "https://github.com/nodejs/examples",
      relatedSkills: ["Node.js", "testable examples", "small modules"]
    }
  ],
  "architecture-improvement-brief": [
    {
      type: "github",
      label: "vercel/next.js examples",
      url: "https://github.com/vercel/next.js/tree/canary/examples",
      relatedSkills: ["architecture", "integration patterns", "project structure"]
    },
    {
      type: "github",
      label: "docker/awesome-compose",
      url: "https://github.com/docker/awesome-compose",
      relatedSkills: ["deployment architecture", "service boundaries", "local environments"]
    }
  ],
  "accessibility-performance-polish": [
    {
      type: "github",
      label: "reactjs/react.dev",
      url: "https://github.com/reactjs/react.dev",
      relatedSkills: ["React", "accessible examples", "frontend documentation"]
    },
    {
      type: "github",
      label: "testing-library/react-testing-library",
      url: "https://github.com/testing-library/react-testing-library",
      relatedSkills: ["accessibility testing", "interaction tests", "frontend quality"]
    }
  ]
};

const candidateLibrary: ProjectCandidate[] = [
  {
    id: "backend-api-platform",
    baseTitle: "Production-Style API Platform",
    type: "portfolio",
    roleFamilies: ["backend", "fullstack", "general"],
    skillKeywords: [
      "api",
      "rest",
      "node",
      "express",
      "fastapi",
      "django",
      "spring",
      "authentication",
      "authorization",
      "sql",
      "postgres",
      "database",
      "docker",
      "testing",
      "jest"
    ],
    categoryTargets: ["frameworks", "databases", "cloud", "tools"],
    proofTags: ["code", "architecture", "testing", "deployment"],
    difficulty: "Medium",
    baseDurationWeeks: 4,
    summaryFrame:
      "a scoped backend service with auth, validation, persistence, tests, and a deployable API surface",
    scopeHints: [
      "Keep the domain small enough for 6 to 8 core endpoints.",
      "Include request validation, error handling, seed data, and a README with API examples.",
      "Add unit or integration tests for the highest-risk paths."
    ],
    starterIdeas: [
      "Job application tracker API",
      "Interview practice scheduling API",
      "Expense approval API"
    ]
  },
  {
    id: "fullstack-workflow-system",
    baseTitle: "Workflow Approval System",
    type: "portfolio",
    roleFamilies: ["fullstack", "backend", "frontend", "general"],
    skillKeywords: [
      "react",
      "next",
      "frontend",
      "typescript",
      "node",
      "api",
      "rest",
      "database",
      "postgres",
      "auth",
      "state",
      "testing",
      "deployment"
    ],
    categoryTargets: ["languages", "frameworks", "databases", "tools", "cloud"],
    proofTags: ["code", "architecture", "testing", "deployment", "integration"],
    difficulty: "Stretch",
    baseDurationWeeks: 6,
    summaryFrame:
      "an end-to-end app where users submit requests, reviewers approve them, and state changes are tracked clearly",
    scopeHints: [
      "Limit the workflow to two user roles and three request states.",
      "Document the data model and state transitions.",
      "Deploy one usable vertical slice before adding polish."
    ],
    starterIdeas: [
      "Leave request workflow",
      "Project proposal review tool",
      "Content publishing approval queue"
    ]
  },
  {
    id: "frontend-admin-dashboard",
    baseTitle: "Operational Admin Dashboard",
    type: "portfolio",
    roleFamilies: ["frontend", "fullstack", "general"],
    skillKeywords: [
      "react",
      "typescript",
      "javascript",
      "css",
      "tailwind",
      "accessibility",
      "state",
      "forms",
      "testing library",
      "jest",
      "performance",
      "api"
    ],
    categoryTargets: ["languages", "frameworks", "tools"],
    proofTags: ["code", "architecture", "testing", "integration"],
    difficulty: "Medium",
    baseDurationWeeks: 4,
    summaryFrame:
      "a realistic dashboard with filters, forms, accessible components, API states, and UI tests",
    scopeHints: [
      "Use real interaction states: loading, empty, error, and success.",
      "Include at least one complex form and one filterable table.",
      "Add component or interaction tests for critical flows."
    ],
    starterIdeas: [
      "Recruiting pipeline dashboard",
      "Customer support triage console",
      "Learning progress admin panel"
    ]
  },
  {
    id: "document-processing-service",
    baseTitle: "Document Processing Workflow",
    type: "portfolio",
    roleFamilies: ["backend", "fullstack", "data", "general"],
    skillKeywords: [
      "file",
      "document",
      "pdf",
      "queue",
      "background",
      "database",
      "postgres",
      "api",
      "validation",
      "docker",
      "testing",
      "llm",
      "ai"
    ],
    categoryTargets: ["frameworks", "databases", "cloud", "tools", "other"],
    proofTags: ["code", "architecture", "testing", "deployment", "data"],
    difficulty: "Stretch",
    baseDurationWeeks: 6,
    summaryFrame:
      "a document intake service that validates uploads, extracts structured metadata, and tracks processing status",
    scopeHints: [
      "Use local parsing or mocked extraction instead of external scraping.",
      "Show status transitions and failure handling.",
      "Keep any AI step optional and replaceable."
    ],
    starterIdeas: [
      "Resume parser work queue",
      "Invoice metadata extraction service",
      "Policy document intake tracker"
    ]
  },
  {
    id: "analytics-dashboard",
    baseTitle: "Metrics and Analytics Dashboard",
    type: "portfolio",
    roleFamilies: ["frontend", "fullstack", "data", "general"],
    skillKeywords: [
      "sql",
      "postgres",
      "database",
      "analytics",
      "dashboard",
      "react",
      "charts",
      "data",
      "api",
      "performance",
      "testing"
    ],
    categoryTargets: ["databases", "frameworks", "languages", "tools"],
    proofTags: ["code", "architecture", "data", "testing", "integration"],
    difficulty: "Medium",
    baseDurationWeeks: 4,
    summaryFrame:
      "a dashboard that turns stored operational data into filterable metrics and explainable charts",
    scopeHints: [
      "Use a small seeded dataset with realistic relationships.",
      "Add filters that change both table and chart views.",
      "Explain key queries and tradeoffs in the README."
    ],
    starterIdeas: [
      "Job search funnel analytics",
      "Product usage dashboard",
      "Support ticket SLA dashboard"
    ]
  },
  {
    id: "testing-retrofit",
    baseTitle: "Testing Retrofit Case Study",
    type: "proof-of-work",
    roleFamilies: ["backend", "frontend", "fullstack", "general"],
    skillKeywords: [
      "testing",
      "jest",
      "vitest",
      "testing library",
      "cypress",
      "unit",
      "integration",
      "api",
      "react",
      "quality"
    ],
    categoryTargets: ["tools", "frameworks"],
    proofTags: ["code", "testing", "architecture"],
    difficulty: "Easy",
    baseDurationWeeks: 2,
    summaryFrame:
      "a focused proof artifact that adds meaningful tests and explains what risks those tests cover",
    scopeHints: [
      "Pick one small existing sample app or your own prior project.",
      "Add tests around two critical flows.",
      "Write a short before/after note describing the risk reduction."
    ],
    starterIdeas: [
      "Add API integration tests to a CRUD service",
      "Add React interaction tests to a form flow",
      "Add regression tests around validation and error handling"
    ]
  },
  {
    id: "architecture-improvement-brief",
    baseTitle: "Architecture Improvement Brief",
    type: "proof-of-work",
    roleFamilies: ["backend", "fullstack", "data", "general"],
    skillKeywords: [
      "system design",
      "architecture",
      "database",
      "api",
      "docker",
      "deployment",
      "performance",
      "scalability",
      "observability"
    ],
    categoryTargets: ["databases", "cloud", "tools", "other"],
    proofTags: ["architecture", "deployment", "data"],
    difficulty: "Easy",
    baseDurationWeeks: 2,
    summaryFrame:
      "a small implementation plus a written tradeoff brief that shows practical system-design judgment",
    scopeHints: [
      "Start from one repo or sample service and improve one architectural concern.",
      "Include a diagram or concise tradeoff table in the README.",
      "Keep the implementation smaller than the explanation."
    ],
    starterIdeas: [
      "Add Docker and environment config to a backend service",
      "Refactor a data model and document migration tradeoffs",
      "Add caching or pagination with a short performance note"
    ]
  },
  {
    id: "accessibility-performance-polish",
    baseTitle: "Frontend Quality Polish Sprint",
    type: "proof-of-work",
    roleFamilies: ["frontend", "fullstack", "general"],
    skillKeywords: [
      "accessibility",
      "performance",
      "react",
      "css",
      "forms",
      "testing library",
      "frontend",
      "ui",
      "components"
    ],
    categoryTargets: ["frameworks", "tools", "languages"],
    proofTags: ["code", "testing", "architecture"],
    difficulty: "Easy",
    baseDurationWeeks: 2,
    summaryFrame:
      "a targeted UI improvement sprint that proves attention to accessibility, performance, and maintainable components",
    scopeHints: [
      "Choose one existing UI flow with real form or table behavior.",
      "Fix keyboard, loading, empty, and error states.",
      "Capture before/after notes and test evidence."
    ],
    starterIdeas: [
      "Improve a form-heavy dashboard flow",
      "Add accessible empty and error states to a data table",
      "Profile and simplify a slow React interaction"
    ]
  }
];

const severityWeights: Record<GapAnalysisItem["gapSeverity"], number> = {
  Critical: 5,
  Important: 3,
  "Nice to have": 1
};

const roleKeywords: Record<RoleFamily, string[]> = {
  backend: ["backend", "api", "server", "platform", "node", "java", "python"],
  frontend: ["frontend", "front end", "react", "ui", "web", "client"],
  fullstack: ["fullstack", "full stack", "full-stack"],
  data: ["data", "analytics", "machine learning", "ml", "ai"],
  general: []
};

const skillSynonyms: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  "node.js": "node",
  nodejs: "node",
  "node js": "node",
  "next.js": "next",
  nextjs: "next",
  "next js": "next",
  postgresql: "postgres",
  postgres: "postgres",
  "rest api": "api",
  "rest apis": "api",
  rest: "api",
  "testing library": "testing",
  jest: "testing",
  vitest: "testing",
  cypress: "testing",
  docker: "deployment",
  aws: "deployment",
  gcp: "deployment",
  azure: "deployment"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unique = <T>(values: T[]) => Array.from(new Set(values));

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

const canonicalSkill = (skill: string) => {
  const normalized = normalizeText(skill);

  return skillSynonyms[normalized] ?? normalized;
};

const keywordMatchesSkill = (keyword: string, skill: string) => {
  const canonicalKeyword = canonicalSkill(keyword);
  const canonical = canonicalSkill(skill);

  return canonical === canonicalKeyword || canonical.includes(canonicalKeyword);
};

const inferRoleFamily = (targetRole: string): RoleFamily => {
  const normalized = normalizeText(targetRole);
  const matchedFamily = (Object.entries(roleKeywords) as Array<[RoleFamily, string[]]>).find(
    ([family, keywords]) =>
      family !== "general" && keywords.some((keyword) => normalized.includes(keyword))
  );

  return matchedFamily?.[0] ?? "general";
};

const timelineDurationCap = (timelineWeeks: number) => {
  if (timelineWeeks <= 8) {
    return 4;
  }

  if (timelineWeeks <= 12) {
    return 6;
  }

  return 8;
};

const estimateDuration = (
  candidate: ProjectCandidate,
  timelineWeeks: number,
  coveredSkills: string[]
) => {
  const cap = timelineDurationCap(timelineWeeks);
  const coverageBump = coveredSkills.length >= 5 && candidate.type === "portfolio" ? 1 : 0;

  return Math.max(
    candidate.type === "proof-of-work" ? 1 : 2,
    Math.min(cap, candidate.baseDurationWeeks + coverageBump)
  );
};

const feasibilityScore = (
  candidate: ProjectCandidate,
  timelineWeeks: number,
  coveredSkills: string[]
) => {
  const duration = estimateDuration(candidate, timelineWeeks, coveredSkills);
  const cap = timelineDurationCap(timelineWeeks);

  if (candidate.type === "proof-of-work") {
    return duration <= 2 ? 1 : 0.8;
  }

  if (duration <= cap && candidate.difficulty === "Medium") {
    return 1;
  }

  if (duration <= cap && candidate.difficulty === "Stretch") {
    return timelineWeeks === 8 ? 0.55 : 0.8;
  }

  return 0.35;
};

const roadmapSkillNames = (request: ProjectRecommendationRequest) =>
  unique(
    (request.roadmapMilestones ?? [])
      .flatMap((milestone) => milestone.linkedSkills)
      .map(canonicalSkill)
      .filter(Boolean)
  );

export const scoreProjectCandidates = (
  request: ProjectRecommendationRequest
): ScoredProjectCandidate[] => {
  const roleFamily = inferRoleFamily(request.targetRole);
  const timelineWeeks = request.timelineWeeks ?? 12;
  const targetStack = request.targetStack ?? [];
  const roadmapSkills = roadmapSkillNames(request);

  return candidateLibrary
    .map((candidate) => {
      const matchingGaps = request.gapAnalysisItems.filter(
        (item) =>
          candidate.categoryTargets.includes(item.category) ||
          candidate.skillKeywords.some((keyword) => keywordMatchesSkill(keyword, item.skillName))
      );
      const coveredSkills = unique(matchingGaps.map((item) => item.skillName)).slice(0, 6);
      const weightedCoverage = matchingGaps.reduce(
        (sum, item) => sum + severityWeights[item.gapSeverity],
        0
      );
      const gapCoverage = Math.min(1, weightedCoverage / 14);
      const proofStrength = Math.min(
        1,
        ["code", "architecture", "testing", "deployment"].filter((tag) =>
          candidate.proofTags.includes(tag as ProjectCandidate["proofTags"][number])
        ).length / 4
      );
      const roleAlignment = candidate.roleFamilies.includes(roleFamily)
        ? 1
        : roleFamily === "general" && candidate.roleFamilies.includes("general")
          ? 0.8
          : candidate.roleFamilies.includes("general")
            ? 0.65
            : 0.35;
      const stackAlignment =
        targetStack.length === 0
          ? 0.5
          : targetStack.some((skill) =>
              candidate.skillKeywords.some((keyword) => keywordMatchesSkill(keyword, skill))
            )
            ? 1
            : 0.25;
      const roadmapAlignment =
        roadmapSkills.length === 0
          ? 0.5
          : coveredSkills.some((skill) => roadmapSkills.includes(canonicalSkill(skill)))
            ? 1
            : 0.25;
      const feasibility = feasibilityScore(candidate, timelineWeeks, coveredSkills);

      return {
        candidate,
        coveredSkills,
        score:
          gapCoverage * 5 +
          proofStrength * 4 +
          roleAlignment * 4 +
          feasibility * 3 +
          stackAlignment * 3 +
          roadmapAlignment,
        scoreBreakdown: {
          gapCoverage,
          proofStrength,
          roleAlignment,
          feasibility,
          stackAlignment,
          roadmapAlignment
        }
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      if (left.candidate.type !== right.candidate.type) {
        return left.candidate.type === "portfolio" ? -1 : 1;
      }

      return left.candidate.id.localeCompare(right.candidate.id);
    });
};

const fallbackCoveredSkills = (request: ProjectRecommendationRequest, candidate: ProjectCandidate) => {
  const stackMatches = (request.targetStack ?? []).filter((skill) =>
    candidate.skillKeywords.some((keyword) => keywordMatchesSkill(keyword, skill))
  );

  if (stackMatches.length > 0) {
    return unique(stackMatches).slice(0, 5);
  }

  const topGapSkills = request.gapAnalysisItems
    .slice(0, candidate.type === "proof-of-work" ? 3 : 5)
    .map((item) => item.skillName);

  return topGapSkills.length > 0 ? unique(topGapSkills) : ["role fundamentals"];
};

const buildStepsFor = (
  candidate: ProjectCandidate,
  request: ProjectRecommendationRequest,
  coveredSkills: string[]
) => {
  const primarySkills = coveredSkills.slice(0, 4).join(", ");

  if (candidate.type === "proof-of-work") {
    return [
      "Choose one small existing project, sample service, or prior portfolio repo to improve.",
      `Define the proof target around ${primarySkills || request.targetRole}.`,
      "Implement the improvement in a small pull-request-sized change.",
      "Add tests, screenshots, logs, or notes that prove the change works.",
      "Write a short README section explaining the before/after and interview talking points."
    ];
  }

  return [
    "Pick one starter idea and write a one-page scope with users, main data objects, and the core success path.",
    `Build the smallest vertical slice first using ${primarySkills || "the target stack"}.`,
    "Add realistic data handling, validation, loading states, and error states before expanding features.",
    "Add tests for the highest-risk flow and document the architecture or data model.",
    "Deploy or record a runnable demo, then write resume bullets that explain the problem, tradeoffs, and result."
  ];
};

const selectRecommendations = (request: ProjectRecommendationRequest) => {
  const scoredCandidates = scoreProjectCandidates(request);
  const portfolio = scoredCandidates
    .filter((item) => item.candidate.type === "portfolio")
    .filter((item) => item.coveredSkills.length > 0 || (request.targetStack ?? []).length > 0)
    .slice(0, 2);
  const proofOfWork = scoredCandidates
    .filter((item) => item.candidate.type === "proof-of-work")
    .filter((item) => item.coveredSkills.length > 0 || (request.targetStack ?? []).length > 0)
    .slice(0, 1);
  const selected = [...portfolio, ...proofOfWork];

  if (selected.length === 3) {
    return selected;
  }

  for (const candidate of scoredCandidates) {
    if (!selected.some((item) => item.candidate.id === candidate.candidate.id)) {
      selected.push(candidate);
    }

    if (selected.length === 3) {
      break;
    }
  }

  return selected;
};

const buildRuleBasedRecommendation = (
  scoredCandidate: ScoredProjectCandidate,
  request: ProjectRecommendationRequest
): ProjectRecommendation => {
  const { candidate } = scoredCandidate;
  const timelineWeeks = request.timelineWeeks ?? 12;
  const coveredSkills =
    scoredCandidate.coveredSkills.length > 0
      ? scoredCandidate.coveredSkills
      : fallbackCoveredSkills(request, candidate);
  const duration = estimateDuration(candidate, timelineWeeks, coveredSkills);
  const proofPhrase = candidate.proofTags
    .map((tag) => (tag === "data" ? "data handling" : `${tag} proof`))
    .join(", ");

  return {
    title: `${request.targetRole} ${candidate.baseTitle}`,
    type: candidate.type,
    description: `Build ${candidate.summaryFrame}. Use one of the starter ideas as the domain, keep the first version narrow, and make the final artifact easy to demo in an interview.`,
    whyRecommended: `Recommended because it covers ${coveredSkills
      .slice(0, 4)
      .join(", ")} while creating ${proofPhrase}. The scope fits a ${timelineWeeks}-week plan as a ${duration}-week ${candidate.type === "portfolio" ? "portfolio build" : "focused proof sprint"}.`,
    coveredSkills,
    difficulty: candidate.difficulty,
    estimatedDurationWeeks: duration,
    whatItProves: `It gives interviewers concrete evidence that you can turn ${coveredSkills
      .slice(0, 4)
      .join(", ")} into ${candidate.summaryFrame}.`,
    buildSteps: buildStepsFor(candidate, request, coveredSkills),
    scopeHints: candidate.scopeHints,
    starterIdeas: candidate.starterIdeas,
    resources: githubReferences[candidate.id] ?? []
  };
};

const validateLlmRefinements = (
  value: unknown,
  recommendations: ProjectRecommendation[]
): ValidationResult<LlmProjectRefinement[]> => {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) {
    return {
      ok: false,
      errors: ["recommendations must be an array."],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: ContractWarning[] = [];
  const refinements = value.recommendations
    .filter(isRecord)
    .map((item): LlmProjectRefinement | undefined => {
      const index = typeof item.index === "number" ? item.index : -1;

      if (!recommendations[index]) {
        warnings.push({
          code: "llm_refinement.ignored_project_index",
          message: `Ignored project refinement for unknown index ${index}.`,
          severity: "info"
        });
        return undefined;
      }

      return {
        index,
        title:
          typeof item.title === "string" && item.title.trim().length > 0
            ? item.title.trim().slice(0, 90)
            : undefined,
        description:
          typeof item.description === "string" && item.description.trim().length > 0
            ? item.description.trim().slice(0, 360)
            : undefined,
        whyRecommended:
          typeof item.whyRecommended === "string" && item.whyRecommended.trim().length > 0
            ? item.whyRecommended.trim().slice(0, 360)
            : undefined,
        whatItProves:
          typeof item.whatItProves === "string" && item.whatItProves.trim().length > 0
            ? item.whatItProves.trim().slice(0, 320)
            : undefined,
        summary:
          typeof item.summary === "string" && item.summary.trim().length > 0
            ? item.summary.trim().slice(0, 220)
            : undefined
      };
    })
    .filter((item): item is LlmProjectRefinement => Boolean(item));

  if (refinements.length === 0) {
    errors.push("recommendations did not contain usable refinements.");
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
      setTimeout(() => reject(new Error("LLM project wording timed out.")), timeoutMs);
    })
  ]);

const refineRecommendationsWithLlm = async (
  recommendations: ProjectRecommendation[],
  request: ProjectRecommendationRequest,
  llmProvider: LlmProvider
) => {
  const payload = {
    targetRole: request.targetRole,
    timelineWeeks: request.timelineWeeks ?? 12,
    targetStack: request.targetStack ?? [],
    fixedRecommendations: recommendations.map((recommendation, index) => ({
      index,
      type: recommendation.type,
      coveredSkills: recommendation.coveredSkills,
      difficulty: recommendation.difficulty,
      estimatedDurationWeeks: recommendation.estimatedDurationWeeks,
      title: recommendation.title,
      description: recommendation.description,
      whyRecommended: recommendation.whyRecommended,
      whatItProves: recommendation.whatItProves,
      buildSteps: recommendation.buildSteps,
      scopeHints: recommendation.scopeHints,
      starterIdeas: recommendation.starterIdeas
    }))
  };
  const result = await withTimeout(
    generateValidatedJson({
      task: "projectRefinement",
      provider: llmProvider,
      systemPrompt:
        "You refine wording for rule-selected project recommendations. Do not add, remove, reorder, or replace recommendations. Do not change type, coveredSkills, difficulty, duration, buildSteps, scopeHints, starterIdeas, or resources. Return JSON with recommendations array. Each item must keep the same index and may only rewrite title, description, whyRecommended, and whatItProves for clarity. Keep wording specific, realistic for early-career candidates, and interview-proof oriented.",
      userPrompt: JSON.stringify(payload),
      repairPrompt: (errors) => `Repair the JSON project refinements without changing indexes or recommendation identity.
Validation errors:
${errors.map((error) => `- ${error}`).join("\n")}

Return only corrected JSON with a recommendations array.`,
      validate: (value) => validateLlmRefinements(value, recommendations)
    }),
    7000
  );
  const refinements = result.value;
  const refinementByIndex = new Map(refinements.map((refinement) => [refinement.index, refinement]));

  return recommendations.map((recommendation, index) => {
    const refinement = refinementByIndex.get(index);

    if (!refinement) {
      return recommendation;
    }

    return {
      ...recommendation,
      title: refinement.title ?? recommendation.title,
      description: refinement.description ?? recommendation.description,
      whyRecommended: refinement.whyRecommended ?? recommendation.whyRecommended,
      whatItProves: refinement.whatItProves ?? recommendation.whatItProves
    };
  });
};

export const recommendProjects = async (
  request: ProjectRecommendationRequest,
  options: { llmProvider?: LlmProvider } = {}
): Promise<ProjectRecommendationOutput> => {
  const selectedCandidates = selectRecommendations(request);
  let recommendations = selectedCandidates.map((candidate) =>
    buildRuleBasedRecommendation(candidate, request)
  );
  let refinedByLlm = false;
  let fallbackUsed = false;

  if (options.llmProvider) {
    try {
      recommendations = await refineRecommendationsWithLlm(
        recommendations,
        request,
        options.llmProvider
      );
      refinedByLlm = true;
    } catch (error) {
      console.debug("[ai-generation]", {
        task: "projectRefinement",
        provider: options.llmProvider.name ?? "unknown",
        status: "fallback",
        reason: error instanceof Error ? error.message : "Unknown refinement error."
      });
      recommendations = selectedCandidates.map((candidate) =>
        buildRuleBasedRecommendation(candidate, request)
      );
      fallbackUsed = true;
    }
  }

  const output: ProjectRecommendationOutput = {
    recommendations,
    generatedFromNote: `Generated from target role, ${
      request.gapAnalysisItems.length
    } gap item(s), target stack${
      request.roadmapMilestones && request.roadmapMilestones.length > 0
        ? ", and roadmap skill focus"
        : ""
    } using deterministic archetype scoring${
      refinedByLlm ? " with LLM wording refinement" : ""
    }.`,
    warnings: buildGenerationWarnings({
      task: "projects",
      jobDescriptionCount: request.jobDescriptionCount,
      targetStack: request.targetStack,
      gapCount: request.gapAnalysisItems.length,
      refinedByLlm,
      fallbackUsed
    })
  };

  assertProjectRecommendationQuality(
    output,
    request.gapAnalysisItems.slice(0, 5).map((item) => item.skillName)
  );

  return output;
};
