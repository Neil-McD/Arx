import type { RuntimeTurnContextPacket } from "./runtimeTurnContextPacket";

export type RuntimeFailureFinalizerInput = {
  partialContent?: string | null;
  runtimeTurnContext?: RuntimeTurnContextPacket | null;
  status: "error" | "cancelled";
  reason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type RuntimeFailureFinalizerOutput = {
  content: string;
  usedFallback: boolean;
};

function normalizeLine(value: unknown, maxLen = 260): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1).trimEnd()}...` : normalized;
}

function buildTinyEmergencyFallback(
  input: RuntimeFailureFinalizerInput,
): string {
  const reason =
    normalizeLine(input.errorMessage, 180) ??
    normalizeLine(input.errorCode, 120) ??
    normalizeLine(input.reason, 120);
  const reasonCopy = reason ? ` Runtime note: ${reason}` : "";
  return [
    input.status === "cancelled"
      ? "I stopped before I could finish."
      : "I hit a runtime stop before I could finish.",
    reasonCopy.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildRuntimeFailureFinalAnswer(
  input: RuntimeFailureFinalizerInput,
): RuntimeFailureFinalizerOutput {
  const partialContent = String(input.partialContent ?? "").trim();
  if (partialContent) {
    return { content: partialContent, usedFallback: false };
  }

  return {
    usedFallback: true,
    content: buildTinyEmergencyFallback(input),
  };
}
