export type LlmJsonRequest = {
  systemPrompt: string;
  userPrompt: string;
  task?: string;
};

export type LlmProvider = {
  readonly name?: string;
  generateJson(request: LlmJsonRequest): Promise<unknown>;
};

export type AiFailureKind =
  | "provider_runtime_failure"
  | "malformed_output"
  | "schema_validation_failure"
  | "quality_check_failure"
  | "unsupported_provider";

export class AiGenerationError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    message: string,
    readonly details: string[] = []
  ) {
    super(message);
    this.name = "AiGenerationError";
  }
}

const extractJson = (value: string): unknown => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new AiGenerationError("malformed_output", "LLM response was empty.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new AiGenerationError("malformed_output", "LLM response did not contain a JSON object.");
  }

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    throw new AiGenerationError(
      "malformed_output",
      "LLM response contained invalid JSON.",
      [error instanceof Error ? error.message : "Unknown JSON parse error."]
    );
  }
};

export class OllamaLlmProvider implements LlmProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor({
    baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model = process.env.OLLAMA_MODEL ?? "llama3.1"
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async generateJson(request: LlmJsonRequest): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          messages: [
            {
              role: "system",
              content: request.systemPrompt
            },
            {
              role: "user",
              content: request.userPrompt
            }
          ],
          options: {
            temperature: 0.1
          }
        })
      });
    } catch (error) {
      throw new AiGenerationError(
        "provider_runtime_failure",
        "Ollama request failed before a response was received.",
        [error instanceof Error ? error.message : "Unknown provider runtime error."]
      );
    }

    if (!response.ok) {
      throw new AiGenerationError(
        "provider_runtime_failure",
        `Ollama request failed with status ${response.status}.`
      );
    }

    const payload = (await response.json()) as { message?: { content?: string }; response?: string };
    const content = payload.message?.content ?? payload.response ?? "";

    return extractJson(content);
  }
}

export const createLlmProvider = (): LlmProvider => {
  const provider = process.env.LLM_PROVIDER ?? "ollama";

  if (provider !== "ollama") {
    throw new AiGenerationError(
      "unsupported_provider",
      `Unsupported LLM provider "${provider}". Only Ollama is implemented.`
    );
  }

  return new OllamaLlmProvider();
};
