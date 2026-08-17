import {
  MAX_JOB_DESCRIPTIONS,
  SUPPORTED_TIMELINE_WEEKS,
  type ContractWarning,
  type DocumentFileMetadata,
  type DocumentParseWarnings,
  type InputQualitySummary,
  type JobDescriptionInputEnvelope,
  type PlanInputContext,
  type ResumeInputEnvelope,
  type TimelineWeeks
} from "@rsgp/shared";
import { extractDocumentText } from "./resumeExtraction.js";
import { validateResumeText } from "./resumeValidation.js";
import { validateTargetRole } from "./jobDescriptionValidation.js";
import { StructuredLlmDocumentParser } from "./llmDocumentParser.js";

export class PlanInputError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly warnings: ContractWarning[] = []
  ) {
    super(message);
  }
}

export type BuildPlanInputContextInput = {
  targetRole: unknown;
  timelineWeeks: unknown;
  targetStack: unknown;
  resumeText?: unknown;
  resumeFile?: Express.Multer.File;
  jobDescriptionTexts?: unknown;
  jobDescriptionFiles?: Express.Multer.File[];
};

const toTargetStack = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  return Array.from(
    new Set(
      values
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
};

const toTimelineWeeks = (value: unknown): TimelineWeeks => {
  const timelineWeeks = Number(value);

  if (!SUPPORTED_TIMELINE_WEEKS.includes(timelineWeeks as TimelineWeeks)) {
    throw new PlanInputError("timelineWeeks must be 8, 12, or 24.", 400);
  }

  return timelineWeeks as TimelineWeeks;
};

const toJobDescriptionTexts = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item !== null && "rawText" in item
              ? String((item as { rawText?: unknown }).rawText ?? "")
              : String(item)
        );
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  throw new PlanInputError("jobDescriptionTexts must be a string or array.", 400);
};

const fileMetadata = (extracted: Awaited<ReturnType<typeof extractDocumentText>>) =>
  extracted.fileName
    ? ({
        fileName: extracted.fileName,
        mimeType: extracted.mimeType,
        sizeBytes: extracted.sizeBytes,
        inputKind: extracted.inputKind
      } satisfies DocumentFileMetadata)
    : undefined;

const emptyWarningBucket = (): DocumentParseWarnings => ({
  extractionWarnings: [],
  parsingWarnings: [],
  validationWarnings: []
});

const flattenEnvelopeWarnings = (
  envelopes: Array<ResumeInputEnvelope | JobDescriptionInputEnvelope>
) =>
  envelopes.flatMap((envelope) => [
    ...envelope.warnings.extractionWarnings,
    ...envelope.warnings.parsingWarnings,
    ...envelope.warnings.validationWarnings
  ]);

export const buildInputQualitySummary = ({
  resume,
  acceptedJobDescriptions,
  rejectedJobDescriptions,
  targetStack
}: {
  resume: ResumeInputEnvelope;
  acceptedJobDescriptions: JobDescriptionInputEnvelope[];
  rejectedJobDescriptions: JobDescriptionInputEnvelope[];
  targetStack: string[];
}): InputQualitySummary => {
  const jobDescriptions = [...acceptedJobDescriptions, ...rejectedJobDescriptions];
  const needsTargetStack = acceptedJobDescriptions.length === 0 && targetStack.length === 0;
  const overallWarnings = flattenEnvelopeWarnings([resume, ...jobDescriptions]);

  if (needsTargetStack) {
    overallWarnings.push({
      code: "target_stack.required_after_jd_rejection",
      message:
        "No usable job descriptions remain after role-fit checks. Add a target stack or language focus before generating a roadmap.",
      severity: "warning",
      fieldPath: "targetStack"
    });
  }

  return {
    hasResume: resume.extractedText.length > 0,
    hasJobDescriptions: jobDescriptions.length > 0,
    hasAcceptedJobDescriptions: acceptedJobDescriptions.length > 0,
    hasTargetStack: targetStack.length > 0,
    overallWarnings,
    needsTargetStack
  };
};

export class PlanInputContextBuilder {
  constructor(private readonly parser: StructuredLlmDocumentParser) {}

  async build(input: BuildPlanInputContextInput): Promise<PlanInputContext> {
    const targetRole = validateTargetRole(input.targetRole);
    const timelineWeeks = toTimelineWeeks(input.timelineWeeks);
    const targetStack = toTargetStack(input.targetStack);
    const resumeText = typeof input.resumeText === "string" ? input.resumeText.trim() : "";
    const jdTexts = toJobDescriptionTexts(input.jobDescriptionTexts).filter(
      (text) => text.trim().length > 0
    );
    const jdFiles = input.jobDescriptionFiles ?? [];

    if (!input.resumeFile && resumeText.length === 0) {
      throw new PlanInputError("Provide a resume file or pasted resume text.", 400);
    }

    if (jdTexts.length + jdFiles.length > MAX_JOB_DESCRIPTIONS) {
      throw new PlanInputError(
        `A maximum of ${MAX_JOB_DESCRIPTIONS} job descriptions can be provided.`,
        400
      );
    }

    if (jdTexts.length + jdFiles.length === 0 && targetStack.length === 0) {
      const warning: ContractWarning = {
        code: "target_stack.required_without_jd",
        message:
          "No job descriptions were provided. Add a target stack or language focus before generating a roadmap.",
        severity: "warning",
        fieldPath: "targetStack"
      };

      throw new PlanInputError(
        "Add a preferred stack or focus when no job description is provided.",
        422,
        [warning]
      );
    }

    const resume = await this.buildResumeEnvelope(input.resumeFile, resumeText);
    const jobDescriptions = await Promise.all([
      ...jdTexts.map((text, index) =>
        this.buildJobDescriptionEnvelope({
          id: `jd-${index + 1}`,
          sourceType: "text",
          text,
          targetRole
        })
      ),
      ...jdFiles.map((file, index) =>
        this.buildJobDescriptionEnvelope({
          id: `jd-${jdTexts.length + index + 1}`,
          sourceType: "file",
          file,
          targetRole
        })
      )
    ]);

    const acceptedJobDescriptions = jobDescriptions.filter(
      (envelope) => envelope.parsedJobDescription.roleFit !== "unrelated"
    );
    const rejectedJobDescriptions = jobDescriptions.filter(
      (envelope) => envelope.parsedJobDescription.roleFit === "unrelated"
    );
    const inferredTargetStack = Array.from(
      new Set([
        ...targetStack,
        ...acceptedJobDescriptions.flatMap((envelope) => envelope.parsedJobDescription.techStack)
      ])
    );

    return {
      targetRole,
      targetStack: inferredTargetStack,
      timelineWeeks,
      resume,
      acceptedJobDescriptions,
      rejectedJobDescriptions,
      inputQuality: buildInputQualitySummary({
        resume,
        acceptedJobDescriptions,
        rejectedJobDescriptions,
        targetStack: inferredTargetStack
      })
    };
  }

  private async buildResumeEnvelope(
    file: Express.Multer.File | undefined,
    text: string
  ): Promise<ResumeInputEnvelope> {
    const warnings = emptyWarningBucket();
    const extracted = await extractDocumentText(
      file
        ? {
            sourceType: "file",
            file
          }
        : {
            sourceType: "text",
            text
          }
    );
    const validation = validateResumeText(extracted.text);
    warnings.validationWarnings.push(...validation.warnings);

    if (validation.warnings.some((warning) => warning.severity === "error")) {
      throw new PlanInputError("Resume text could not be parsed.", 422, validation.warnings);
    }

    const parsed = await this.parser.parseResume(validation.normalizedText);
    warnings.parsingWarnings.push(...parsed.warnings, ...(parsed.parsedResume.warnings ?? []));

    return {
      sourceType: file ? "file" : "text",
      fileMetadata: fileMetadata(extracted),
      rawText: extracted.text,
      extractedText: validation.normalizedText,
      parsedResume: {
        ...parsed.parsedResume,
        warnings: [...warnings.parsingWarnings, ...warnings.validationWarnings]
      },
      warnings
    };
  }

  private async buildJobDescriptionEnvelope(input: {
    id: string;
    sourceType: "text" | "file";
    targetRole: string;
    text?: string;
    file?: Express.Multer.File;
  }): Promise<JobDescriptionInputEnvelope> {
    const warnings = emptyWarningBucket();
    const extracted = await extractDocumentText(
      input.sourceType === "file" && input.file
        ? {
            sourceType: "file",
            file: input.file
          }
        : {
            sourceType: "text",
            text: input.text ?? ""
          }
    );
    const normalizedText = extracted.text
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (normalizedText.length === 0) {
      warnings.validationWarnings.push({
        code: "jd.empty_text",
        message: "A job description was ignored because it has no text.",
        severity: "warning"
      });

      return {
        id: input.id,
        sourceType: input.sourceType,
        fileMetadata: fileMetadata(extracted),
        rawText: extracted.text,
        extractedText: normalizedText,
        parsedJobDescription: {
          id: input.id,
          roleTitle: input.targetRole,
          requiredSkills: [],
          preferredSkills: [],
          softSkills: [],
          experienceRange: "Not specified",
          techStack: [],
          responsibilities: [],
          interviewSignals: {
            dsa: false,
            lld: false,
            systemDesign: false,
            frontendDeepDive: false,
            backendDeepDive: false,
            behavioral: false
          },
          roleFit: "unrelated",
          signalStrength: "Weak signal",
          warnings: warnings.validationWarnings
        },
        warnings
      };
    }

    if (normalizedText.length > 0 && normalizedText.length < 80) {
      warnings.validationWarnings.push({
        code: "jd.low_text",
        message: "A job description is very short, so parsing may be incomplete.",
        severity: "warning"
      });
    }

    const parsed = await this.parser.parseJobDescription({
      id: input.id,
      text: normalizedText,
      targetRole: input.targetRole
    });
    warnings.parsingWarnings.push(
      ...parsed.warnings,
      ...(parsed.parsedJobDescription.warnings ?? [])
    );

    return {
      id: input.id,
      sourceType: input.sourceType,
      fileMetadata: fileMetadata(extracted),
      rawText: extracted.text,
      extractedText: normalizedText,
      parsedJobDescription: {
        ...parsed.parsedJobDescription,
        warnings: [...warnings.parsingWarnings, ...warnings.validationWarnings]
      },
      warnings
    };
  }
}
