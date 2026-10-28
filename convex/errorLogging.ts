type ErrorSummary = {
  name: string;
  message: string;
  stackPreview: string | null;
};

function compactLogRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export function summarizeErrorForLog(error: unknown): ErrorSummary {
  const name =
    error instanceof Error &&
    typeof error.name === "string" &&
    error.name.trim()
      ? error.name.trim()
      : "Error";
  const message =
    error instanceof Error &&
    typeof error.message === "string" &&
    error.message.trim()
      ? error.message.trim()
      : String(error ?? "Unknown error");
  const stackPreview =
    error instanceof Error &&
    typeof error.stack === "string" &&
    error.stack.trim()
      ? error.stack.trim().split("\n").slice(0, 6).join("\n")
      : null;
  return { name, message, stackPreview };
}

export function logStructuredError(
  event: string,
  args: Record<string, unknown> & { error: unknown },
): void {
  const { error, ...context } = args;
  const summary = summarizeErrorForLog(error);
  console.error(
    event,
    compactLogRecord({
      ...context,
      errorName: summary.name,
      errorMessage: summary.message,
      stackPreview: summary.stackPreview,
    }),
  );
}
