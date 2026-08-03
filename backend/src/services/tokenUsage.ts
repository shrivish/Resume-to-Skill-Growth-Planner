type TokenUsageEvent = {
  route: string;
  input: unknown;
  output: unknown;
};

const estimateTokens = (value: unknown) => Math.ceil(JSON.stringify(value).length / 4);

export const logEstimatedTokenUsage = ({ route, input, output }: TokenUsageEvent) => {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);

  console.log(
    JSON.stringify({
      event: "estimated_token_usage",
      route,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      measuredAt: new Date().toISOString()
    })
  );
};
