function readErrorText(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  if (error instanceof Error) {
    const trimmed = String(error.message ?? "").trim();
    return trimmed || fallback;
  }
  return fallback;
}

function readErrorCode(value: string): string | null {
  const normalized = value.trim();
  return /^[a-z0-9_]+$/.test(normalized) ? normalized : null;
}

function normalizeErrorCode(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const snake = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
  return /^[a-z0-9_]+$/.test(snake) ? snake : null;
}

function readStructuredErrorParts(text: string): { code: string | null; message: string | null } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { code: null, message: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      code: normalizeErrorCode(typeof parsed.code === "string" ? parsed.code : null),
      message: typeof parsed.message === "string" ? parsed.message.trim() || null : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

function includesAuthFailureText(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("invalid jwt") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid bearer token") ||
    lower.includes("missing bearer token") ||
    lower.includes("session expired") ||
    lower.includes("verified identity required") ||
    lower.includes("auth subject mismatch")
  );
}

function isAuthBootstrapCode(code: string | null): boolean {
  return (
    code === "convex_auth_subject_required" ||
    code === "convex_auth_subject_mismatch" ||
    code === "convex_verified_identity_required" ||
    code === "convex_identity_token_required" ||
    code === "auth_required" ||
    code === "not_authenticated"
  );
}

function isTransientServerCode(code: string | null): boolean {
  return (
    code === "internal_server_error" ||
    code === "server_overloaded" ||
    code === "timeout" ||
    code === "request_timeout"
  );
}

export function formatWorkspaceRestoreErrorMessage(error: unknown, fallback: string): string {
  const rawText = readErrorText(error, fallback);
  const structured = readStructuredErrorParts(rawText);
  const text = structured.message ?? rawText;
  const code = structured.code ?? normalizeErrorCode(readErrorCode(text));

  if (
    isAuthBootstrapCode(code) ||
    includesAuthFailureText(text) ||
    code === "user_not_found" ||
    code === "user_id_mismatch" ||
    code === "owner_id_mismatch"
  ) {
    return "Session expired. Please sign in again.";
  }
  if (
    isTransientServerCode(code) ||
    text.toLowerCase().includes("your request couldn't be completed") ||
    text.toLowerCase().includes("internal server error")
  ) {
    return fallback;
  }
  if (code) return fallback;
  return text || fallback;
}
