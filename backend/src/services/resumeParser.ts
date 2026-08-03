import type {
  ContractWarning,
  EvidenceSource,
  ParsedResume,
  ResumeEducationItem,
  ResumeExperienceItem,
  ResumeProject,
  ResumeSkills,
  SkillCategory
} from "@rsgp/shared";

export type ResumeParser = {
  parse(text: string, warnings: ContractWarning[]): Promise<ParsedResume>;
};

const skillDictionary: Record<SkillCategory, string[]> = {
  languages: [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C#",
    "C++",
    "Go",
    "SQL",
    "HTML",
    "CSS"
  ],
  frameworks: [
    "React",
    "Angular",
    "Vue",
    "Next.js",
    "Node.js",
    "Express",
    ".NET",
    "Spring Boot",
    "FastAPI",
    "Django"
  ],
  databases: ["PostgreSQL", "MySQL", "SQL Server", "MongoDB", "Redis", "SQLite"],
  cloud: ["AWS", "Azure", "GCP", "Docker", "Kubernetes"],
  tools: [
    "Git",
    "GitHub",
    "Azure DevOps",
    "Jira",
    "Postman",
    "Figma",
    "Linux",
    "Testing Library",
    "Jest",
    "Cypress"
  ],
  other: ["REST", "GraphQL", "Microservices", "LLM", "Machine Learning", "Agile"]
};

const roleKeywords = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Developer",
  "Web Developer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "Intern"
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const findSkills = (text: string): ResumeSkills => {
  const skills = {} as ResumeSkills;

  for (const [category, terms] of Object.entries(skillDictionary) as Array<
    [SkillCategory, string[]]
  >) {
    skills[category] = terms.filter((term) => {
      const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(term)}([^a-z0-9+#.]|$)`, "i");
      return pattern.test(text);
    });
  }

  return skills;
};

const inferCandidateName = (text: string) => {
  const firstUsefulLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 1 && line.length < 80 && !line.includes("@"));

  return firstUsefulLine ?? "Unknown Candidate";
};

const inferCurrentRole = (text: string) =>
  roleKeywords.find((role) => new RegExp(escapeRegex(role), "i").test(text)) ?? "Not specified";

const inferExperienceYears = (text: string) => {
  const explicitMatches = [
    ...text.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi),
    ...text.matchAll(/experience\s*(?:of|:|-)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi),
    ...text.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/gi)
  ];
  const explicitYears = explicitMatches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value <= 50);
  const dateRangeYears = [
    ...text.matchAll(
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\.?\s*(20\d{2})\s*(?:-|–|to)\s*(?:(?:present|current|now)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\.?\s*(20\d{2}))/gi
    )
  ]
    .map((match) => {
      const startYear = Number(match[1]);
      const endYear = match[2] ? Number(match[2]) : new Date().getFullYear();

      return endYear >= startYear ? endYear - startYear : 0;
    })
    .filter((value) => value > 0 && value <= 50);
  const years = [...explicitYears, ...dateRangeYears];

  return years.length > 0 ? Math.max(...years) : 0;
};

const inferDomains = (skills: ResumeSkills) => {
  const domains: string[] = [];

  if (skills.frameworks.some((skill) => ["React", "Angular", "Vue", "Next.js"].includes(skill))) {
    domains.push("frontend web applications");
  }

  if (
    skills.frameworks.some((skill) => ["Node.js", "Express", ".NET", "Spring Boot"].includes(skill))
  ) {
    domains.push("backend services");
  }

  if (skills.cloud.length > 0) {
    domains.push("cloud and deployment");
  }

  if (skills.other.some((skill) => ["LLM", "Machine Learning"].includes(skill))) {
    domains.push("AI workflows");
  }

  return unique(domains);
};

const extractSectionLines = (text: string, heading: string) => {
  const headingPattern = new RegExp(`^(?:${heading})\\s*:?\\s*(?<inline>.*)$`, "i");
  const anyHeadingPattern =
    /^(?:experience|work experience|employment|projects?|portfolio|education|skills?|technical skills)\s*:?/i;
  const lines = text.split("\n").map((line) => line.trim());
  const sectionLines: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const headingMatch = line.match(headingPattern);

    if (headingMatch) {
      collecting = true;
      const inlineValue = headingMatch.groups?.inline.trim();

      if (inlineValue) {
        sectionLines.push(inlineValue);
      }

      continue;
    }

    if (collecting && anyHeadingPattern.test(line)) {
      break;
    }

    if (collecting && line.length > 0) {
      sectionLines.push(line.replace(/^[-*]\s*/, "").trim());
    }
  }

  return sectionLines.filter((line) => line.length > 0).slice(0, 6);
};

const inferExperience = (text: string, skills: ResumeSkills): ResumeExperienceItem[] => {
  const highlights = extractSectionLines(text, "experience|work experience|employment");

  if (highlights.length === 0) {
    return [];
  }

  return [
    {
      company: "Not specified",
      roleTitle: inferCurrentRole(text),
      highlights,
      skillsUsed: unique(Object.values(skills).flat()).slice(0, 8)
    }
  ];
};

const inferProjects = (text: string, skills: ResumeSkills): ResumeProject[] => {
  const highlights = extractSectionLines(text, "projects?|portfolio");

  if (highlights.length === 0) {
    return [];
  }

  return [
    {
      title: "Resume project signal",
      highlights,
      skillsUsed: unique(Object.values(skills).flat()).slice(0, 8),
      links: [...text.matchAll(/https?:\/\/\S+/g)].map((match) => match[0])
    }
  ];
};

const inferEducation = (text: string): ResumeEducationItem[] => {
  const highlights = extractSectionLines(text, "education");
  const firstEducationLine = highlights[0];

  if (!firstEducationLine) {
    return [];
  }

  return [
    {
      institution: firstEducationLine
    }
  ];
};

export class HeuristicResumeParser implements ResumeParser {
  async parse(text: string, warnings: ContractWarning[]): Promise<ParsedResume> {
    const skills = findSkills(text);
    const detectedSkills = unique(Object.values(skills).flat());
    const experienceYears = inferExperienceYears(text);
    const evidenceSources: EvidenceSource[] = detectedSkills.slice(0, 20).map((skill, index) => ({
      id: `resume-skill-${index + 1}`,
      sourceType: "resume",
      label: skill
    }));

    const parserWarnings = [...warnings];

    if (experienceYears > 5) {
      parserWarnings.push({
        code: "resume.experience_outside_mvp",
        message:
          "The resume appears to show more than 5 years of experience, outside the MVP target range.",
        severity: "warning",
        fieldPath: "experienceYears"
      });
    }

    if (detectedSkills.length === 0) {
      parserWarnings.push({
        code: "resume.no_skills_detected",
        message: "No known technical skills were detected by the deterministic parser.",
        severity: "warning",
        fieldPath: "skills"
      });
    }

    return {
      candidateName: inferCandidateName(text),
      experienceYears,
      currentRole: inferCurrentRole(text),
      skills,
      experience: inferExperience(text, skills),
      projects: inferProjects(text, skills),
      education: inferEducation(text),
      inferredDomains: inferDomains(skills),
      signalStrength:
        detectedSkills.length >= 8
          ? "Strong signal"
          : detectedSkills.length >= 3
            ? "Medium signal"
            : "Weak signal",
      evidenceSources,
      warnings: parserWarnings
    };
  }
}
