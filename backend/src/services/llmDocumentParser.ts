import type { ContractWarning, ParsedJobDescription, ParsedResume } from "@rsgp/shared";
import type { LlmProvider } from "./llmProvider.js";
import {
  validateParsedJobDescriptionOutput,
  validateParsedResumeOutput,
  type ValidationResult
} from "./structuredOutputValidation.js";

type CorrectableParse<T> = {
  systemPrompt: string;
  prompt: string;
  correctivePrompt: (errors: string[]) => string;
  validate: (value: unknown) => ValidationResult<T>;
};

const resumeSystemPrompt = `You parse resumes for a skill growth planning app.
Return only valid JSON matching the requested TypeScript contract.
Do not invent credentials, employers, dates, or skills not supported by the text.
Use empty arrays and "Not specified" when the source text is unclear.`;

const jdSystemPrompt = `You parse job descriptions for a skill growth planning app.
Return only valid JSON matching the requested TypeScript contract.
Classify roleFit as "matching", "adjacent", or "unrelated" relative to the target role.
Do not invent skills or requirements not supported by the job description.`;

const parsedResumeContract = `type ParsedResume = {
  candidateName: string;
  experienceYears: number;
  currentRole: string;
  skills: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    cloud: string[];
    tools: string[];
    other: string[];
  };
  experience: Array<{
    company: string;
    roleTitle: string;
    startDate?: string;
    endDate?: string;
    summary?: string;
    highlights: string[];
    skillsUsed: string[];
  }>;
  projects: Array<{
    title: string;
    description?: string;
    highlights: string[];
    skillsUsed: string[];
    links: string[];
  }>;
  education: Array<{
    institution: string;
    degree?: string;
    field?: string;
    startDate?: string;
    endDate?: string;
  }>;
  inferredDomains: string[];
  signalStrength?: "Strong signal" | "Medium signal" | "Weak signal";
  warnings?: Array<{ code: string; message: string; severity: "info" | "warning" | "error"; fieldPath?: string }>;
}`;

const parsedJobDescriptionContract = `type ParsedJobDescription = {
  id: string;
  roleTitle: string;
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  experienceRange: string;
  techStack: string[];
  responsibilities: string[];
  interviewSignals: {
    dsa: boolean;
    lld: boolean;
    systemDesign: boolean;
    frontendDeepDive: boolean;
    backendDeepDive: boolean;
    behavioral: boolean;
  };
  roleFit: "matching" | "adjacent" | "unrelated";
  signalStrength?: "Strong signal" | "Medium signal" | "Weak signal";
  warnings?: Array<{ code: string; message: string; severity: "info" | "warning" | "error"; fieldPath?: string }>;
}`;

const buildCorrection = (
  contract: string,
  previousErrors: string[]
) => `The previous JSON failed validation.
Regenerate the JSON so it exactly matches this contract:

${contract}

Validation errors:
${previousErrors.map((error) => `- ${error}`).join("\n")}

Return only the corrected JSON object.`;

export class StructuredLlmDocumentParser {
  constructor(private readonly provider: LlmProvider) {}

  async parseResume(
    text: string
  ): Promise<{ parsedResume: ParsedResume; warnings: ContractWarning[] }> {
    return this.parseWithCorrection({
      systemPrompt: resumeSystemPrompt,
      prompt: `Parse this resume into ParsedResume JSON.

${parsedResumeContract}

Resume text:
${text}`,
      correctivePrompt: (errors) => buildCorrection(parsedResumeContract, errors),
      validate: validateParsedResumeOutput
    }).then(({ value, warnings }) => ({
      parsedResume: value,
      warnings
    }));
  }

  async parseJobDescription(input: {
    id: string;
    text: string;
    targetRole: string;
  }): Promise<{ parsedJobDescription: ParsedJobDescription; warnings: ContractWarning[] }> {
    return this.parseWithCorrection({
      systemPrompt: jdSystemPrompt,
      prompt: `Parse this job description into ParsedJobDescription JSON.
Use id "${input.id}".
Target role: ${input.targetRole}

${parsedJobDescriptionContract}

Job description text:
${input.text}`,
      correctivePrompt: (errors) => buildCorrection(parsedJobDescriptionContract, errors),
      validate: (value) => validateParsedJobDescriptionOutput(value, input.id, input.targetRole)
    }).then(({ value, warnings }) => ({
      parsedJobDescription: value,
      warnings
    }));
  }

  private async parseWithCorrection<T>({
    prompt,
    systemPrompt,
    correctivePrompt,
    validate
  }: CorrectableParse<T>): Promise<{ value: T; warnings: ContractWarning[] }> {
    const firstOutput = await this.provider.generateJson({
      systemPrompt,
      userPrompt: prompt
    });
    const firstValidation = validate(firstOutput);

    if (firstValidation.ok) {
      return {
        value: firstValidation.value,
        warnings: firstValidation.warnings
      };
    }

    const retryOutput = await this.provider.generateJson({
      systemPrompt,
      userPrompt: `${prompt}

${correctivePrompt(firstValidation.errors)}`
    });
    const retryValidation = validate(retryOutput);

    if (retryValidation.ok) {
      return {
        value: retryValidation.value,
        warnings: [
          ...firstValidation.warnings,
          ...retryValidation.warnings,
          {
            code: "llm.corrective_retry_used",
            message:
              "The model output required one corrective retry before it matched the contract.",
            severity: "info"
          }
        ]
      };
    }

    throw new Error(
      `LLM output failed schema validation after retry: ${retryValidation.errors.join("; ")}`
    );
  }
}
