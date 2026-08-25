import type { ContractWarning } from "@rsgp/shared";
import type { ValidationResult } from "./structuredOutputValidation.js";
import { AiGenerationError, type AiFailureKind, type LlmProvider } from "./llmProvider.js";

type GenerateValidatedJsonRequest<T> = {
  task: string;
  provider: LlmProvider;
  systemPrompt: string;
  userPrompt: string;
  repairPrompt: (errors: string[]) => string;
  validate: (value: unknown) => ValidationResult<T>;
  qualityCheck?: (value: T) => string[];
};

export type GenerateValidatedJsonResult<T> = {
  value: T;
  warnings: ContractWarning[];
  repaired: boolean;
};

const logAttempt = (input: {
  task: string;
  provider: LlmProvider;
  attempt: number;
  status: "start" | "success" | "repair" | "failure";
  kind?: AiFailureKind;
  reasons?: string[];
}) => {
  console.debug("[ai-generation]", {
    task: input.task,
    provider: input.provider.name ?? "unknown",
    attempt: input.attempt,
    status: input.status,
    kind: input.kind,
    reasons: input.reasons
  });
};

const validationError = (task: string, errors: string[]) =>
  new AiGenerationError(
    "schema_validation_failure",
    `${task} output failed schema validation.`,
    errors
  );

const qualityError = (task: string, errors: string[]) =>
  new AiGenerationError("quality_check_failure", `${task} output failed quality checks.`, errors);

const validateCandidate = <T>(
  task: string,
  value: unknown,
  validate: (value: unknown) => ValidationResult<T>,
  qualityCheck?: (value: T) => string[]
) => {
  const validation = validate(value);

  if (!validation.ok) {
    throw validationError(task, validation.errors);
  }

  const qualityErrors = qualityCheck?.(validation.value) ?? [];

  if (qualityErrors.length > 0) {
    throw qualityError(task, qualityErrors);
  }

  return validation;
};

export const generateValidatedJson = async <T>({
  task,
  provider,
  systemPrompt,
  userPrompt,
  repairPrompt,
  validate,
  qualityCheck
}: GenerateValidatedJsonRequest<T>): Promise<GenerateValidatedJsonResult<T>> => {
  logAttempt({ task, provider, attempt: 1, status: "start" });

  try {
    const firstOutput = await provider.generateJson({ task, systemPrompt, userPrompt });
    const firstValidation = validateCandidate(task, firstOutput, validate, qualityCheck);

    logAttempt({ task, provider, attempt: 1, status: "success" });

    return {
      value: firstValidation.value,
      warnings: firstValidation.warnings,
      repaired: false
    };
  } catch (error) {
    const firstError =
      error instanceof AiGenerationError
        ? error
        : new AiGenerationError("provider_runtime_failure", `${task} generation failed.`, [
            error instanceof Error ? error.message : "Unknown generation error."
          ]);

    if (
      firstError.kind === "provider_runtime_failure" ||
      firstError.kind === "quality_check_failure" ||
      firstError.kind === "unsupported_provider"
    ) {
      logAttempt({
        task,
        provider,
        attempt: 1,
        status: "failure",
        kind: firstError.kind,
        reasons: firstError.details
      });
      throw firstError;
    }

    logAttempt({
      task,
      provider,
      attempt: 1,
      status: "repair",
      kind: firstError.kind,
      reasons: firstError.details
    });

    const retryOutput = await provider.generateJson({
      task,
      systemPrompt,
      userPrompt: `${userPrompt}

${repairPrompt(firstError.details.length > 0 ? firstError.details : [firstError.message])}`
    });
    const retryValidation = validateCandidate(task, retryOutput, validate, qualityCheck);

    logAttempt({ task, provider, attempt: 2, status: "success" });

    return {
      value: retryValidation.value,
      warnings: [
        ...retryValidation.warnings,
        {
          code: "llm.corrective_retry_used",
          message: "The model output required one corrective retry before it matched the contract.",
          severity: "info"
        }
      ],
      repaired: true
    };
  }
};
