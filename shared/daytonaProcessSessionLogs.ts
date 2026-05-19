function toStringValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function toScalarStringValue(value: unknown): string | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "bigint"
  ) {
    return null;
  }
  return toStringValue(value);
}

function readLogText(value: unknown, depth = 0): string {
  if (depth > 3) return "";
  const scalar = toScalarStringValue(value);
  if (scalar) return scalar;
  if (Array.isArray(value)) {
    return value
      .map((entry) => readLogText(entry, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of [
    "output",
    "stdout",
    "stderr",
    "logs",
    "data",
    "result",
    "text",
    "message",
    "content",
  ]) {
    const text = readLogText(record[key], depth + 1);
    if (text) return text;
  }
  return "";
}

function readLogRecordField(
  payload: unknown,
  keys: readonly string[],
): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const text = readLogText(record[key]);
    if (text) return text;
  }
  return "";
}

export function normalizeDaytonaProcessSessionCommandLogsPayload(
  payload: unknown,
  fallbackText = "",
): { stdout: string; stderr: string; output: string } {
  const stdout = readLogRecordField(payload, ["stdout"]);
  const stderr = readLogRecordField(payload, ["stderr"]);
  const output =
    readLogRecordField(payload, ["output", "logs", "data", "result", "text"]) ||
    [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "") ||
    readLogText(payload) ||
    readLogText(fallbackText);
  return { stdout, stderr, output };
}
