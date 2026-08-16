import type { NativeToolInputContentPart } from "./nativeToolProtocol.ts";
import type { RuntimeKernelToolExecutionResult } from "./runtimeKernelTypes.ts";

function summarizeRuntimeSignatureText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const half = Math.max(32, Math.floor((limit - 5) / 2));
  return `${value.slice(0, half)}...${value.slice(-half)}`;
}

function buildObservationSignature(
  observationContent: NativeToolInputContentPart[] | null | undefined,
): string | null {
  if (!Array.isArray(observationContent) || observationContent.length === 0) {
    return null;
  }
  return observationContent
    .map((part) => {
      if (part.type === "text") {
        return `text:${summarizeRuntimeSignatureText(part.text, 320)}`;
      }
      const imageUrl = String(part.imageUrl ?? "");
      return `image:${summarizeRuntimeSignatureText(imageUrl, 96)}:${imageUrl.length}`;
    })
    .join("|");
}

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

export function buildRuntimeToolResultSignature(params: {
  toolResult: RuntimeKernelToolExecutionResult;
}): string {
  const detailsSignature =
    params.toolResult.details && typeof params.toolResult.details === "object"
      ? summarizeRuntimeSignatureText(
          stableSerializeRuntimeValue(params.toolResult.details),
          1024,
        )
      : null;
  return stableSerializeRuntimeValue({
    status: params.toolResult.status,
    exitCode: params.toolResult.exitCode,
    errorCode: params.toolResult.errorCode,
    errorMessage: params.toolResult.errorMessage,
    outputPreview: summarizeRuntimeSignatureText(
      params.toolResult.outputText,
      1024,
    ),
    outputLength: params.toolResult.outputText.length,
    detailsSignature,
    observationSignature: buildObservationSignature(
      params.toolResult.observationContent,
    ),
  });
}
