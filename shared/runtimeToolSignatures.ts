export function stableSerializeRuntimeValue(value: unknown): string {
  const seen = new WeakSet<object>();

  const encode = (input: unknown): string => {
    if (input === null || typeof input !== "object") {
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) {
      return `[${input.map((entry) => encode(entry)).join(",")}]`;
    }
    if (seen.has(input)) {
      return JSON.stringify("[Circular]");
    }
    seen.add(input);
    const objectValue = input as Record<string, unknown>;
    const entries = Object.entries(objectValue).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry)}`)
      .join(",")}}`;
  };

  return encode(value);
}

export function buildRuntimeToolCallSignature<TToolName extends string>(params: {
  toolName: TToolName;
  normalizedArgs: Record<string, unknown>;
}): string {
  return `${params.toolName}:${stableSerializeRuntimeValue(params.normalizedArgs)}`;
}
