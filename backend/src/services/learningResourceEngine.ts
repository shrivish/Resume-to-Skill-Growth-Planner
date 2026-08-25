import type {
  ContractWarning,
  GapAnalysisItem,
  LearningResourceDepth,
  LearningResourceOutput,
  LearningResourceRecommendation,
  LearningResourceRequest,
  LearningResourceSkillRecommendation,
  LearningResourceSourceFamily,
  LearningResourceType,
  ProjectRecommendation,
  RoadmapMilestone,
  SkillLevel
} from "@rsgp/shared";
import { generateValidatedJson } from "./aiGenerationService.js";
import type { LlmProvider } from "./llmProvider.js";
import {
  assertLearningResourceQuality,
  buildGenerationWarnings
} from "./outputQualityValidation.js";
import type { ValidationResult } from "./structuredOutputValidation.js";

type RoleFamily = "backend" | "frontend" | "fullstack" | "data" | "general";

type ResourceCandidate = {
  id: string;
  title: string;
  url: string;
  type: LearningResourceType;
  provider: string;
  sourceFamily: LearningResourceSourceFamily;
  depth: LearningResourceDepth;
  skillKeywords: string[];
  roleFamilies: RoleFamily[];
  practicalTags: Array<"foundation" | "implementation" | "project" | "testing" | "deployment">;
  fitFrame: string;
  projectUse: string;
};

export type ScoredLearningResourceCandidate = {
  candidate: ResourceCandidate;
  matchedSkill: string;
  score: number;
  scoreBreakdown: {
    skillMatch: number;
    depthMatch: number;
    roleRelevance: number;
    practicality: number;
    roadmapFit: number;
    trust: number;
  };
};

type LlmResourceRefinement = {
  skillIndex: number;
  resourceIndex: number;
  whyRecommended?: string;
  roadmapFit?: string;
  projectFit?: string;
};

const officialDocs = "official-docs" as const;
const curatedCourse = "curated-course" as const;
const curatedGithub = "curated-github-reference" as const;

const resourceLibrary: ResourceCandidate[] = [
  {
    id: "docs-mdn-javascript-guide",
    title: "MDN JavaScript Guide",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    type: "official-docs",
    provider: "MDN",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["javascript", "js", "frontend", "web"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame: "Use it to close JavaScript fundamentals before adding framework-specific work.",
    projectUse:
      "Reference syntax, async behavior, modules, and data handling while building UI features."
  },
  {
    id: "docs-typescript-handbook",
    title: "TypeScript Handbook",
    url: "https://www.typescriptlang.org/docs/handbook/intro.html",
    type: "official-docs",
    provider: "TypeScript",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["typescript", "ts", "types"],
    roleFamilies: ["frontend", "backend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame: "Use it to turn loose JavaScript knowledge into typed implementation habits.",
    projectUse: "Apply interfaces, narrowing, and typed API boundaries in the portfolio project."
  },
  {
    id: "docs-react-learn",
    title: "React Learn",
    url: "https://react.dev/learn",
    type: "official-docs",
    provider: "React",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["react", "components", "state", "hooks", "frontend"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation", "project"],
    fitFrame:
      "Use it as the canonical source for components, state, effects, and interaction patterns.",
    projectUse: "Map each section to one visible feature in a dashboard or workflow app."
  },
  {
    id: "docs-nextjs",
    title: "Next.js Docs",
    url: "https://nextjs.org/docs",
    type: "official-docs",
    provider: "Vercel",
    sourceFamily: officialDocs,
    depth: "applied",
    skillKeywords: ["next", "next.js", "nextjs", "react", "routing", "fullstack"],
    roleFamilies: ["frontend", "fullstack"],
    practicalTags: ["implementation", "project", "deployment"],
    fitFrame:
      "Use it when the role expects React plus routing, rendering, and deployment awareness.",
    projectUse:
      "Use the routing, data fetching, and deployment sections while shaping a full-stack UI."
  },
  {
    id: "docs-nodejs-learn",
    title: "Node.js Learn",
    url: "https://nodejs.org/en/learn",
    type: "official-docs",
    provider: "Node.js",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["node", "node.js", "nodejs", "backend", "javascript"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame: "Use it to connect JavaScript fundamentals to server-side runtime behavior.",
    projectUse:
      "Reference modules, async flow, files, and HTTP concepts while building backend endpoints."
  },
  {
    id: "docs-express-guide",
    title: "Express Guide",
    url: "https://expressjs.com/en/guide/routing.html",
    type: "official-docs",
    provider: "Express",
    sourceFamily: officialDocs,
    depth: "applied",
    skillKeywords: ["express", "api", "rest", "routing", "middleware", "backend"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["implementation", "project"],
    fitFrame:
      "Use it for the API surface, routing, middleware, and request handling expected in backend roles.",
    projectUse: "Turn the guide into a small REST API slice with validation and error handling."
  },
  {
    id: "docs-postgresql-tutorial",
    title: "PostgreSQL Tutorial",
    url: "https://www.postgresql.org/docs/current/tutorial.html",
    type: "official-docs",
    provider: "PostgreSQL",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["postgres", "postgresql", "sql", "database", "schema"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["foundation", "implementation", "project"],
    fitFrame: "Use it to build database fundamentals from the source before modeling project data.",
    projectUse: "Apply schema design, joins, and query examples to the project data model."
  },
  {
    id: "docs-docker-get-started",
    title: "Docker Get Started",
    url: "https://docs.docker.com/get-started/",
    type: "official-docs",
    provider: "Docker",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["docker", "containers", "containerization", "deployment"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["foundation", "implementation", "deployment"],
    fitFrame: "Use it to learn containers through a small repeatable development environment.",
    projectUse: "Add a Dockerfile or Compose setup that makes the project easy to run."
  },
  {
    id: "docs-jest-getting-started",
    title: "Jest Getting Started",
    url: "https://jestjs.io/docs/getting-started",
    type: "official-docs",
    provider: "Jest",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["jest", "testing", "unit testing", "javascript testing"],
    roleFamilies: ["frontend", "backend", "fullstack", "general"],
    practicalTags: ["foundation", "testing", "project"],
    fitFrame: "Use it to add basic automated test proof around the riskiest logic.",
    projectUse: "Create a small suite that proves validation, data transformation, or API behavior."
  },
  {
    id: "docs-testing-library",
    title: "Testing Library Docs",
    url: "https://testing-library.com/docs/",
    type: "official-docs",
    provider: "Testing Library",
    sourceFamily: officialDocs,
    depth: "applied",
    skillKeywords: ["testing library", "react testing", "ui testing", "frontend testing"],
    roleFamilies: ["frontend", "fullstack"],
    practicalTags: ["implementation", "testing", "project"],
    fitFrame:
      "Use it to test UI behavior through user-facing interactions instead of implementation details.",
    projectUse:
      "Add tests for form submission, empty states, loading states, and accessible interactions."
  },
  {
    id: "docs-aws-getting-started",
    title: "AWS Getting Started Resource Center",
    url: "https://aws.amazon.com/getting-started/",
    type: "official-docs",
    provider: "AWS",
    sourceFamily: officialDocs,
    depth: "foundation",
    skillKeywords: ["aws", "cloud", "deployment", "s3", "lambda"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["foundation", "deployment"],
    fitFrame: "Use it for cloud vocabulary and a first deployment-oriented mental model.",
    projectUse: "Connect the project README to one deployable AWS path without widening scope."
  },
  {
    id: "course-frontendmasters-complete-react-v9",
    title: "Complete Intro to React, v9",
    url: "https://frontendmasters.com/courses/complete-react-v9/",
    type: "course",
    provider: "Frontend Masters",
    sourceFamily: curatedCourse,
    depth: "foundation",
    skillKeywords: ["react", "components", "hooks", "frontend"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation", "project"],
    fitFrame: "Use it as guided practice alongside the official React docs.",
    projectUse: "Convert each major lesson into one dashboard component or interaction."
  },
  {
    id: "course-scrimba-learn-react",
    title: "Learn React",
    url: "https://scrimba.com/learn-react-c0e",
    type: "course",
    provider: "Scrimba",
    sourceFamily: curatedCourse,
    depth: "foundation",
    skillKeywords: ["react", "frontend", "components"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame:
      "Use it when the gap starts at not-shown or partial exposure and needs hands-on repetition.",
    projectUse: "Use the interactive exercises as warmups before implementing project components."
  },
  {
    id: "course-frontendmasters-typescript-v4",
    title: "TypeScript Fundamentals, v4",
    url: "https://frontendmasters.com/courses/typescript-v4/",
    type: "course",
    provider: "Frontend Masters",
    sourceFamily: curatedCourse,
    depth: "foundation",
    skillKeywords: ["typescript", "ts", "types"],
    roleFamilies: ["frontend", "backend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame: "Use it to move from knowing syntax to reading and writing practical typed code.",
    projectUse:
      "Apply the lessons to request/response types, component props, and service boundaries."
  },
  {
    id: "course-frontendmasters-api-design-nodejs-v4",
    title: "API Design in Node.js, v4",
    url: "https://frontendmasters.com/courses/api-design-nodejs-v4/",
    type: "course",
    provider: "Frontend Masters",
    sourceFamily: curatedCourse,
    depth: "applied",
    skillKeywords: ["node", "node.js", "api", "rest", "express", "backend"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["implementation", "project", "testing"],
    fitFrame:
      "Use it when the gap is implementation-heavy and the roadmap is entering API proof work.",
    projectUse: "Shape routes, controllers, validation, and tests in the backend portfolio project."
  },
  {
    id: "course-udemy-node-express-bootcamp",
    title: "Node.js, Express, MongoDB & More: The Complete Bootcamp",
    url: "https://www.udemy.com/course/nodejs-express-mongodb-bootcamp/",
    type: "course",
    provider: "Udemy",
    sourceFamily: curatedCourse,
    depth: "applied",
    skillKeywords: ["node", "node.js", "express", "api", "backend"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["implementation", "project"],
    fitFrame:
      "Use it as a build-focused supplement when guided backend implementation practice is useful.",
    projectUse:
      "Borrow the API organization and implementation rhythm, while adapting persistence to the target stack."
  },
  {
    id: "course-udemy-complete-sql-bootcamp",
    title: "The Complete SQL Bootcamp: Go from Zero to Hero",
    url: "https://www.udemy.com/course/the-complete-sql-bootcamp/",
    type: "course",
    provider: "Udemy",
    sourceFamily: curatedCourse,
    depth: "foundation",
    skillKeywords: ["sql", "postgres", "postgresql", "database"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["foundation", "implementation", "project"],
    fitFrame:
      "Use it for structured query practice after the official PostgreSQL tutorial introduces the basics.",
    projectUse: "Turn query exercises into project seed data, reports, or dashboard metrics."
  },
  {
    id: "course-udemy-docker-kubernetes-practical-guide",
    title: "Docker & Kubernetes: The Practical Guide",
    url: "https://www.udemy.com/course/docker-kubernetes-the-practical-guide/",
    type: "course",
    provider: "Udemy",
    sourceFamily: curatedCourse,
    depth: "applied",
    skillKeywords: ["docker", "containers", "deployment", "kubernetes"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["implementation", "deployment", "project"],
    fitFrame:
      "Use selected Docker sections for practical container workflow, without letting Kubernetes expand MVP scope.",
    projectUse: "Add local container setup and document how the app runs in a clean environment."
  },
  {
    id: "course-coursera-meta-front-end",
    title: "Meta Front-End Developer Professional Certificate",
    url: "https://www.coursera.org/professional-certificates/meta-front-end-developer",
    type: "course",
    provider: "Coursera",
    sourceFamily: curatedCourse,
    depth: "foundation",
    skillKeywords: ["frontend", "react", "javascript", "html", "css"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["foundation", "project"],
    fitFrame:
      "Use it when the role direction needs broader frontend foundations, not only React syntax.",
    projectUse:
      "Use the capstone rhythm to structure a portfolio UI with accessible, inspectable screens."
  },
  {
    id: "github-react-dev",
    title: "reactjs/react.dev",
    url: "https://github.com/reactjs/react.dev",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "applied",
    skillKeywords: ["react", "documentation", "frontend", "components"],
    roleFamilies: ["frontend", "fullstack", "general"],
    practicalTags: ["implementation", "project"],
    fitFrame: "Use it as an official reference for how React examples and docs explain concepts.",
    projectUse:
      "Study clear examples and docs structure, then mirror that clarity in your project README."
  },
  {
    id: "github-vercel-nextjs-examples",
    title: "vercel/next.js examples",
    url: "https://github.com/vercel/next.js/tree/canary/examples",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "applied",
    skillKeywords: ["next", "next.js", "nextjs", "react", "fullstack"],
    roleFamilies: ["frontend", "fullstack"],
    practicalTags: ["implementation", "project", "deployment"],
    fitFrame:
      "Use it for official implementation patterns around routing, data loading, and integrations.",
    projectUse:
      "Reference one example that matches the portfolio app, then keep only the relevant pattern."
  },
  {
    id: "github-expressjs-express",
    title: "expressjs/express",
    url: "https://github.com/expressjs/express",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "advanced",
    skillKeywords: ["express", "middleware", "routing", "api", "backend"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["implementation"],
    fitFrame: "Use it to inspect the framework surface and examples after learning the guide.",
    projectUse:
      "Study middleware and routing conventions, then keep your own API structure simpler and documented."
  },
  {
    id: "github-nodejs-examples",
    title: "nodejs/examples",
    url: "https://github.com/nodejs/examples",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "foundation",
    skillKeywords: ["node", "node.js", "nodejs", "backend", "javascript"],
    roleFamilies: ["backend", "fullstack", "general"],
    practicalTags: ["foundation", "implementation"],
    fitFrame: "Use it for small official examples that connect Node concepts to runnable code.",
    projectUse: "Borrow the smallest relevant pattern for scripts, HTTP, or module organization."
  },
  {
    id: "github-docker-awesome-compose",
    title: "docker/awesome-compose",
    url: "https://github.com/docker/awesome-compose",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "applied",
    skillKeywords: ["docker", "compose", "containers", "deployment"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["implementation", "deployment", "project"],
    fitFrame: "Use it for small Compose setups that make multi-service project work concrete.",
    projectUse: "Adapt a minimal app-plus-database setup for local portfolio project execution."
  },
  {
    id: "github-testing-library-react-testing-library",
    title: "testing-library/react-testing-library",
    url: "https://github.com/testing-library/react-testing-library",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "applied",
    skillKeywords: ["testing library", "react testing", "frontend testing", "testing"],
    roleFamilies: ["frontend", "fullstack"],
    practicalTags: ["testing", "implementation", "project"],
    fitFrame: "Use it to inspect examples and conventions for user-centered UI tests.",
    projectUse: "Mirror the testing style for critical user flows in the frontend project."
  },
  {
    id: "github-prisma-examples",
    title: "prisma/prisma-examples",
    url: "https://github.com/prisma/prisma-examples",
    type: "github",
    provider: "GitHub",
    sourceFamily: curatedGithub,
    depth: "applied",
    skillKeywords: ["database", "postgres", "postgresql", "sql", "node"],
    roleFamilies: ["backend", "fullstack", "data", "general"],
    practicalTags: ["implementation", "project"],
    fitFrame: "Use it as a reference for application data modeling and persistence examples.",
    projectUse:
      "Study schema organization and API integration patterns, then adapt the idea to your chosen stack."
  }
];

const severityWeights: Record<GapAnalysisItem["gapSeverity"], number> = {
  Critical: 5,
  Important: 3,
  "Nice to have": 1
};

const sourceTrustWeights: Record<LearningResourceSourceFamily, number> = {
  "official-docs": 1,
  "curated-course": 0.82,
  "curated-github-reference": 0.75
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
  "rest api": "api",
  "rest apis": "api",
  rest: "api",
  "unit testing": "testing",
  "integration testing": "testing",
  "testing library": "testing library"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unique = <T>(values: T[]) => Array.from(new Set(values));

const normalizeText = (value: string) =>
  value.trim().toLowerCase().replace(/\./g, "").replace(/-/g, " ").replace(/\s+/g, " ");

const canonicalSkill = (value: string) => {
  const normalized = normalizeText(value);

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

const preferredDepthFor = (level: SkillLevel): LearningResourceDepth => {
  if (level === "Not shown") {
    return "foundation";
  }

  if (level === "Partial exposure") {
    return "applied";
  }

  return "advanced";
};

const depthMatchScore = (candidate: ResourceCandidate, currentLevel: SkillLevel) => {
  const preferredDepth = preferredDepthFor(currentLevel);

  if (candidate.depth === preferredDepth) {
    return 1;
  }

  if (currentLevel === "Not shown" && candidate.depth === "applied") {
    return 0.75;
  }

  if (currentLevel === "Partial exposure" && candidate.depth !== "advanced") {
    return 0.85;
  }

  if (currentLevel === "Working proficiency" && candidate.depth === "applied") {
    return 0.9;
  }

  return 0.45;
};

const roadmapWeekFor = (skillName: string, roadmapMilestones: RoadmapMilestone[] = []) =>
  roadmapMilestones.find((milestone) =>
    milestone.linkedSkills.some((skill) => canonicalSkill(skill) === canonicalSkill(skillName))
  );

const projectConnectionsFor = (
  skillName: string,
  projectRecommendations: ProjectRecommendation[] = []
) =>
  projectRecommendations
    .filter((project) =>
      project.coveredSkills.some((skill) => canonicalSkill(skill) === canonicalSkill(skillName))
    )
    .map((project) => project.title)
    .slice(0, 2);

const importantGaps = (request: LearningResourceRequest) => {
  const timelineWeeks = request.timelineWeeks ?? 12;
  const limit = timelineWeeks <= 8 ? 5 : timelineWeeks <= 12 ? 7 : 10;
  const targetStack = new Set((request.targetStack ?? []).map(canonicalSkill));

  return request.gapAnalysisItems
    .map((item, index) => ({
      item,
      index,
      score:
        severityWeights[item.gapSeverity] * 4 +
        (item.signalStrength === "Strong signal"
          ? 3
          : item.signalStrength === "Medium signal"
            ? 1
            : 0) +
        (targetStack.has(canonicalSkill(item.skillName)) ? 2 : 0) +
        (item.currentLevel === "Not shown" ? 2 : item.currentLevel === "Partial exposure" ? 1 : 0)
    }))
    .filter(
      ({ item }) => item.gapSeverity !== "Nice to have" || item.signalStrength === "Strong signal"
    )
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.index - right.index;
    })
    .slice(0, limit)
    .map(({ item }) => item);
};

export const scoreLearningResourceCandidates = (
  request: LearningResourceRequest,
  gap: GapAnalysisItem
): ScoredLearningResourceCandidate[] => {
  const roleFamily = inferRoleFamily(request.targetRole);
  const roadmapMilestone = roadmapWeekFor(gap.skillName, request.roadmapMilestones);
  const roadmapSkillNames = (request.roadmapMilestones ?? []).flatMap((milestone) =>
    milestone.linkedSkills.map(canonicalSkill)
  );

  return resourceLibrary
    .map((candidate) => {
      const directSkillMatch = candidate.skillKeywords.some((keyword) =>
        keywordMatchesSkill(keyword, gap.skillName)
      );
      const stackSkillMatch = (request.targetStack ?? []).some((skill) =>
        candidate.skillKeywords.some((keyword) => keywordMatchesSkill(keyword, skill))
      );
      const skillMatch = directSkillMatch ? 1 : stackSkillMatch ? 0.45 : 0;
      const depthMatch = depthMatchScore(candidate, gap.currentLevel);
      const roleRelevance = candidate.roleFamilies.includes(roleFamily)
        ? 1
        : roleFamily === "general" && candidate.roleFamilies.includes("general")
          ? 0.8
          : candidate.roleFamilies.includes("general")
            ? 0.6
            : 0.25;
      const practicality = Math.min(
        1,
        candidate.practicalTags.filter((tag) =>
          ["implementation", "project", "testing", "deployment"].includes(tag)
        ).length / 3
      );
      const roadmapFit = roadmapMilestone
        ? 1
        : roadmapSkillNames.includes(canonicalSkill(gap.skillName))
          ? 0.75
          : 0.5;
      const trust = sourceTrustWeights[candidate.sourceFamily];

      return {
        candidate,
        matchedSkill: gap.skillName,
        score:
          skillMatch * 6 +
          depthMatch * 3 +
          roleRelevance * 2 +
          practicality * 2 +
          roadmapFit +
          trust * 2,
        scoreBreakdown: {
          skillMatch,
          depthMatch,
          roleRelevance,
          practicality,
          roadmapFit,
          trust
        }
      };
    })
    .filter((item) => item.scoreBreakdown.skillMatch > 0)
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      if (left.candidate.sourceFamily !== right.candidate.sourceFamily) {
        return (
          sourceTrustWeights[right.candidate.sourceFamily] -
          sourceTrustWeights[left.candidate.sourceFamily]
        );
      }

      return left.candidate.id.localeCompare(right.candidate.id);
    });
};

const selectResourcesForGap = (request: LearningResourceRequest, gap: GapAnalysisItem) => {
  const scored = scoreLearningResourceCandidates(request, gap);
  const sourceOrder: LearningResourceSourceFamily[] = [
    "official-docs",
    "curated-course",
    "curated-github-reference"
  ];
  const selected: ScoredLearningResourceCandidate[] = [];

  for (const sourceFamily of sourceOrder) {
    const candidate = scored.find(
      (item) =>
        item.candidate.sourceFamily === sourceFamily &&
        !selected.some((selectedItem) => selectedItem.candidate.id === item.candidate.id)
    );

    if (candidate) {
      selected.push(candidate);
    }
  }

  if (selected.length === 0 && scored[0]) {
    selected.push(scored[0]);
  }

  return selected.slice(0, 3);
};

const timingLabel = (milestone: RoadmapMilestone | undefined) =>
  milestone ? `week ${milestone.week}` : "the next matching roadmap stage";

const buildRecommendation = (
  scored: ScoredLearningResourceCandidate,
  gap: GapAnalysisItem,
  request: LearningResourceRequest,
  milestone: RoadmapMilestone | undefined,
  projectConnections: string[]
): LearningResourceRecommendation => {
  const { candidate } = scored;
  const projectFit =
    projectConnections.length > 0
      ? `${candidate.projectUse} This connects directly to ${projectConnections.join(" and ")}.`
      : candidate.projectUse;

  return {
    id: candidate.id,
    title: candidate.title,
    url: candidate.url,
    type: candidate.type,
    provider: candidate.provider,
    sourceFamily: candidate.sourceFamily,
    depth: candidate.depth,
    skillSupported: gap.skillName,
    whyRecommended: `${candidate.fitFrame} It matches a ${gap.currentLevel.toLowerCase()} current signal moving toward ${gap.targetLevel.toLowerCase()} for ${request.targetRole}.`,
    roadmapFit: `Use this around ${timingLabel(milestone)}${
      milestone ? ` while working on "${milestone.focus}"` : ""
    }; keep notes tied to ${gap.skillName} proof rather than studying it as a standalone topic.`,
    projectFit
  };
};

const buildSkillRecommendation = (
  gap: GapAnalysisItem,
  request: LearningResourceRequest
): LearningResourceSkillRecommendation | undefined => {
  const milestone = roadmapWeekFor(gap.skillName, request.roadmapMilestones);
  const projectConnections = projectConnectionsFor(gap.skillName, request.projectRecommendations);
  const resources = selectResourcesForGap(request, gap).map((scored) =>
    buildRecommendation(scored, gap, request, milestone, projectConnections)
  );

  if (resources.length === 0) {
    return undefined;
  }

  return {
    skillName: gap.skillName,
    gapSeverity: gap.gapSeverity,
    currentLevel: gap.currentLevel,
    targetLevel: gap.targetLevel,
    roadmapWeek: milestone?.week,
    roadmapFocus: milestone?.focus,
    projectConnections,
    resources
  };
};

const validateLlmRefinements = (
  value: unknown,
  recommendations: LearningResourceSkillRecommendation[]
): ValidationResult<LlmResourceRefinement[]> => {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) {
    return {
      ok: false,
      errors: ["recommendations must be an array."],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: ContractWarning[] = [];
  const refinements = value.recommendations.filter(isRecord).flatMap((skillItem): LlmResourceRefinement[] => {
    const skillIndex = typeof skillItem.skillIndex === "number" ? skillItem.skillIndex : -1;

    if (!recommendations[skillIndex] || !Array.isArray(skillItem.resources)) {
      warnings.push({
        code: "llm_refinement.ignored_resource_skill_index",
        message: `Ignored learning-resource refinement for unknown skill index ${skillIndex}.`,
        severity: "info"
      });
      return [];
    }

    return skillItem.resources
      .filter(isRecord)
      .map((resourceItem): LlmResourceRefinement | undefined => {
        const resourceIndex =
          typeof resourceItem.resourceIndex === "number" ? resourceItem.resourceIndex : -1;

        if (!recommendations[skillIndex]?.resources[resourceIndex]) {
          warnings.push({
            code: "llm_refinement.ignored_resource_index",
            message: `Ignored learning-resource refinement for unknown resource index ${resourceIndex}.`,
            severity: "info"
          });
          return undefined;
        }

        return {
          skillIndex,
          resourceIndex,
          whyRecommended:
            typeof resourceItem.whyRecommended === "string" &&
            resourceItem.whyRecommended.trim().length > 0
              ? resourceItem.whyRecommended.trim().slice(0, 360)
              : undefined,
          roadmapFit:
            typeof resourceItem.roadmapFit === "string" && resourceItem.roadmapFit.trim().length > 0
              ? resourceItem.roadmapFit.trim().slice(0, 320)
              : undefined,
          projectFit:
            typeof resourceItem.projectFit === "string" && resourceItem.projectFit.trim().length > 0
              ? resourceItem.projectFit.trim().slice(0, 320)
              : undefined
        };
      })
      .filter((item): item is LlmResourceRefinement => Boolean(item));
  });

  if (refinements.length === 0) {
    errors.push("recommendations did not contain usable resource refinements.");
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
      setTimeout(() => reject(new Error("LLM learning-resource wording timed out.")), timeoutMs);
    })
  ]);

const refineResourcesWithLlm = async (
  recommendations: LearningResourceSkillRecommendation[],
  request: LearningResourceRequest,
  llmProvider: LlmProvider
) => {
  const payload = {
    targetRole: request.targetRole,
    targetStack: request.targetStack ?? [],
    fixedRecommendations: recommendations.map((skillRecommendation, skillIndex) => ({
      skillIndex,
      skillName: skillRecommendation.skillName,
      roadmapWeek: skillRecommendation.roadmapWeek,
      roadmapFocus: skillRecommendation.roadmapFocus,
      projectConnections: skillRecommendation.projectConnections,
      resources: skillRecommendation.resources.map((resource, resourceIndex) => ({
        resourceIndex,
        id: resource.id,
        title: resource.title,
        url: resource.url,
        type: resource.type,
        provider: resource.provider,
        sourceFamily: resource.sourceFamily,
        depth: resource.depth,
        whyRecommended: resource.whyRecommended,
        roadmapFit: resource.roadmapFit,
        projectFit: resource.projectFit
      }))
    }))
  };
  const result = await withTimeout(
    generateValidatedJson({
      task: "learningResourceRefinement",
      provider: llmProvider,
      systemPrompt:
        "You refine wording for rule-selected learning resources. Do not add, remove, reorder, rename, relink, or replace skills or resources. Do not change ids, titles, URLs, types, providers, source families, depth, or skillSupported. Return JSON with recommendations array. Each skill item must keep skillIndex. Each resource may only rewrite whyRecommended, roadmapFit, and projectFit for clarity. Keep wording specific, practical, role-relevant, and honest about using official docs, curated courses, and curated GitHub references.",
      userPrompt: JSON.stringify(payload),
      repairPrompt: (errors) => `Repair the JSON learning-resource refinements without changing skillIndex, resourceIndex, resource identity, URLs, providers, source families, or depth.
Validation errors:
${errors.map((error) => `- ${error}`).join("\n")}

Return only corrected JSON with a recommendations array.`,
      validate: (value) => validateLlmRefinements(value, recommendations)
    }),
    7000
  );
  const refinements = result.value;

  return recommendations.map((skillRecommendation, skillIndex) => ({
    ...skillRecommendation,
    resources: skillRecommendation.resources.map((resource, resourceIndex) => {
      const refinement = refinements.find(
        (item) => item.skillIndex === skillIndex && item.resourceIndex === resourceIndex
      );

      if (!refinement) {
        return resource;
      }

      return {
        ...resource,
        whyRecommended: refinement.whyRecommended ?? resource.whyRecommended,
        roadmapFit: refinement.roadmapFit ?? resource.roadmapFit,
        projectFit: refinement.projectFit ?? resource.projectFit
      };
    })
  }));
};

export const recommendLearningResources = async (
  request: LearningResourceRequest,
  options: { llmProvider?: LlmProvider } = {}
): Promise<LearningResourceOutput> => {
  const selectedGaps = importantGaps(request);
  let recommendations = selectedGaps
    .map((gap) => buildSkillRecommendation(gap, request))
    .filter((item): item is LearningResourceSkillRecommendation => Boolean(item));
  let refinedByLlm = false;
  let fallbackUsed = false;

  if (options.llmProvider) {
    try {
      recommendations = await refineResourcesWithLlm(recommendations, request, options.llmProvider);
      refinedByLlm = true;
    } catch (error) {
      console.debug("[ai-generation]", {
        task: "learningResourceRefinement",
        provider: options.llmProvider.name ?? "unknown",
        status: "fallback",
        reason: error instanceof Error ? error.message : "Unknown refinement error."
      });
      recommendations = selectedGaps
        .map((gap) => buildSkillRecommendation(gap, request))
        .filter((item): item is LearningResourceSkillRecommendation => Boolean(item));
      fallbackUsed = true;
    }
  }

  const resourceCount = recommendations.reduce(
    (sum, recommendation) => sum + recommendation.resources.length,
    0
  );
  const sourceFamilies = unique(
    recommendations.flatMap((recommendation) =>
      recommendation.resources.map((resource) => resource.sourceFamily)
    )
  );

  const output: LearningResourceOutput = {
    recommendations,
    sourcePolicy:
      "Locked source policy: official docs, curated course list, and curated GitHub references only. No live web search, scraping, arbitrary crawling, or LLM-selected sources are used.",
    selectionSummary: `Selected ${resourceCount} resource(s) for ${recommendations.length} important skill gap(s), preferring one official docs resource, one curated course, and one curated GitHub/reference resource when the curated library has a natural match.`,
    generatedFromNote: `Generated from target role, ordered gap analysis${
      request.roadmapMilestones && request.roadmapMilestones.length > 0 ? ", roadmap timing" : ""
    }${
      request.projectRecommendations && request.projectRecommendations.length > 0
        ? ", and project recommendation context"
        : ""
    }. Source selection was deterministic from the internal allowlist (${sourceFamilies.join(", ")})${
      refinedByLlm ? " with LLM wording refinement only" : ""
    }.`,
    warnings: [
      ...buildGenerationWarnings({
        task: "learningResources",
        jobDescriptionCount: request.jobDescriptionCount,
        targetStack: request.targetStack,
        gapCount: request.gapAnalysisItems.length,
        refinedByLlm,
        fallbackUsed
      }),
      {
        code: "resources.locked_source_policy",
        message: "Resource suggestions were limited to trusted sources.",
        severity: "info"
      }
    ]
  };

  assertLearningResourceQuality(output);

  return output;
};
