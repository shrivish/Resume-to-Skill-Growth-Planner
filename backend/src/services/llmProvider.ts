export type LlmJsonRequest = {
  systemPrompt: string;
  userPrompt: string;
};

export type LlmProvider = {
  generateJson(request: LlmJsonRequest): Promise<unknown>;
};

const extractJson = (value: string): unknown => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("LLM response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
};

export class OllamaLlmProvider implements LlmProvider {
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
    const response = await fetch(`${this.baseUrl}/api/chat`, {
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

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const content = payload.message?.content ?? payload.response ?? "";

    return extractJson(content);
  }
}

export const createLlmProvider = (): LlmProvider => {
  const provider = process.env.LLM_PROVIDER ?? "ollama";

  if (provider !== "ollama") {
    throw new Error(`Unsupported LLM provider "${provider}". Only Ollama is implemented.`);
  }

  return new OllamaLlmProvider();
};
