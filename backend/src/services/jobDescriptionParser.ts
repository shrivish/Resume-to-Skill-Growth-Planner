import type {
  ContractWarning,
  EvidenceSource,
  InterviewSignals,
  JobDescriptionRoleFit,
  ParsedJobDescription
} from "@rsgp/shared";

type SkillBucket = {
  required: string[];
  preferred: string[];
};

export type JobDescriptionParser = {
  parse(input: {
    id: string;
    rawText: string;
    targetRole: string;
    sourceLabel?: string;
  }): Promise<ParsedJobDescription>;
};

const technicalSkills = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "Go",
  "SQL",
  "HTML",
  "CSS",
  "React",
  "Angular",
  "Vue",
  "Next.js",
  "Node.js",
  "Express",
  ".NET",
  "Spring Boot",
  "FastAPI",
  "Django",
  "PostgreSQL",
  "MySQL",
  "SQL Server",
  "MongoDB",
  "Redis",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "Git",
  "REST",
  "GraphQL",
  "Testing Library",
  "Jest",
  "Cypress"
];

const softSkills = [
  "communication",
  "collaboration",
  "ownership",
  "problem solving",
  "mentoring",
  "stakeholder management",
  "teamwork"
];

const roleFamilies: Record<string, string[]> = {
  frontend: ["frontend", "front-end", "react", "angular", "vue", "ui", "web"],
  backend: ["backend", "back-end", "api", "server", "node", "express", "spring", ".net"],
  fullstack: ["full stack", "full-stack", "fullstack"],
  data: ["data", "analytics", "sql", "python", "machine learning", "ml"],
  cloud: ["cloud", "devops", "aws", "azure", "gcp", "kubernetes", "docker"]
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const includesTerm = (text: string, term: string) => {
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(term)}([^a-z0-9+#.]|$)`, "i");
  return pattern.test(text);
};

const inferRoleTitle = (text: string, targetRole: string) => {
  const titleMatch = text.match(/\b(?:job title|role|position)\s*:\s*(?<title>[^\n.]{3,80})/i);

  return titleMatch?.groups?.title.trim() ?? targetRole;
};

const inferExperienceRange = (text: string) => {
  const rangeMatch = text.match(/(\d+\s*[-–]\s*\d+\+?\s*(?:years?|yrs?))/i);
  const minimumMatch = text.match(/(\d+\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience)/i);

  return rangeMatch?.[1] ?? minimumMatch?.[1] ?? "Not specified";
};

const splitSentences = (text: string) =>
  text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

const inferSkills = (text: string): SkillBucket => {
  const requiredSentences = splitSentences(text).filter((sentence) =>
    /\b(required|must have|need|responsibilities|qualifications)\b/i.test(sentence)
  );
  const preferredSentences = splitSentences(text).filter((sentence) =>
    /\b(preferred|nice to have|plus|bonus)\b/i.test(sentence)
  );

  const requiredText = requiredSentences.join(" ");
  const preferredText = preferredSentences.join(" ");
  const allDetected = technicalSkills.filter((skill) => includesTerm(text, skill));
  const preferred = technicalSkills.filter((skill) => includesTerm(preferredText, skill));
  const requiredFromRequiredLines = technicalSkills.filter((skill) =>
    includesTerm(requiredText, skill)
  );
  const required =
    requiredFromRequiredLines.length > 0
      ? requiredFromRequiredLines
      : allDetected.filter((skill) => !preferred.includes(skill));

  return {
    required: unique(required),
    preferred: unique(preferred)
  };
};

const inferSoftSkills = (text: string) => softSkills.filter((skill) => includesTerm(text, skill));

const inferResponsibilities = (text: string) =>
  splitSentences(text)
    .filter((sentence) =>
      /\b(build|develop|design|own|collaborate|maintain|implement|integrate)\b/i.test(sentence)
    )
    .slice(0, 8);

const inferInterviewSignals = (text: string, skills: string[]): InterviewSignals => {
  const lowerText = text.toLowerCase();

  return {
    dsa: /\b(dsa|data structures|algorithms|leetcode)\b/i.test(text),
    lld: /\b(low level design|lld|object-oriented design|oop)\b/i.test(text),
    systemDesign: /\b(system design|distributed systems|scalability)\b/i.test(text),
    frontendDeepDive: skills.some((skill) =>
      ["React", "Angular", "Vue", "CSS", "HTML"].includes(skill)
    ),
    backendDeepDive: skills.some((skill) =>
      ["Node.js", "Express", ".NET", "Spring Boot", "FastAPI"].includes(skill)
    ),
    behavioral: lowerText.includes("communication") || lowerText.includes("collaboration")
  };
};

const inferRoleFamily = (value: string) => {
  return Object.entries(roleFamilies)
    .filter(([_family, keywords]) => keywords.some((keyword) => includesTerm(value, keyword)))
    .map(([family]) => family);
};

const inferRoleFit = (
  targetRole: string,
  jdText: string,
  jdRoleTitle: string
): JobDescriptionRoleFit => {
  const targetFamilies = inferRoleFamily(targetRole);
  const jdFamilies = inferRoleFamily(`${jdRoleTitle} ${jdText}`);

  if (targetFamilies.length === 0 || jdFamilies.length === 0) {
    return includesTerm(jdText, targetRole) ? "matching" : "adjacent";
  }

  const overlap = targetFamilies.some((family) => jdFamilies.includes(family));

  if (overlap) {
    return "matching";
  }

  const targetIsFullstack = targetFamilies.includes("fullstack");
  const jdIsFullstack = jdFamilies.includes("fullstack");

  return targetIsFullstack || jdIsFullstack ? "adjacent" : "unrelated";
};

export class HeuristicJobDescriptionParser implements JobDescriptionParser {
  async parse(input: {
    id: string;
    rawText: string;
    targetRole: string;
    sourceLabel?: string;
  }): Promise<ParsedJobDescription> {
    const normalizedText = input.rawText
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
    const roleTitle = inferRoleTitle(normalizedText, input.targetRole);
    const skillBucket = inferSkills(normalizedText);
    const techStack = unique([...skillBucket.required, ...skillBucket.preferred]);
    const roleFit = inferRoleFit(input.targetRole, normalizedText, roleTitle);
    const warnings: ContractWarning[] = [];

    if (roleFit === "adjacent") {
      warnings.push({
        code: "jd.adjacent_role",
        message:
          "This job description appears adjacent to the target role. It can be included, but results may broaden.",
        severity: "warning"
      });
    }

    if (roleFit === "unrelated") {
      warnings.push({
        code: "jd.unrelated_role",
        message: "This job description appears unrelated to the target role and was rejected.",
        severity: "error"
      });
    }

    if (techStack.length === 0) {
      warnings.push({
        code: "jd.no_tech_stack",
        message: "No clear technical stack was detected in this job description.",
        severity: "warning"
      });
    }

    const evidenceSources: EvidenceSource[] = techStack.slice(0, 20).map((skill, index) => ({
      id: `${input.id}-skill-${index + 1}`,
      sourceType: "jobDescription",
      label: skill
    }));

    return {
      id: input.id,
      roleTitle,
      requiredSkills: skillBucket.required,
      preferredSkills: skillBucket.preferred,
      softSkills: inferSoftSkills(normalizedText),
      experienceRange: inferExperienceRange(normalizedText),
      techStack,
      responsibilities: inferResponsibilities(normalizedText),
      interviewSignals: inferInterviewSignals(normalizedText, techStack),
      roleFit,
      signalStrength:
        techStack.length >= 6
          ? "Strong signal"
          : techStack.length >= 3
            ? "Medium signal"
            : "Weak signal",
      evidenceSources,
      warnings
    };
  }
}
