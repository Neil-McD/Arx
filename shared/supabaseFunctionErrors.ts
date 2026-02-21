export type SupabaseFunctionErrorCategory =
  | "auth"
  | "rate_limited"
  | "quota"
  | "plan"
  | "misconfigured"
  | "disabled"
  | "model_not_allowed"
  | "unknown";

export type SupabaseFunctionError = {
  status: number;
  code: string | null;
  message: string;
  requestId: string | null;
  category: SupabaseFunctionErrorCategory;
};

const AUTH_CODES = new Set([
  "auth_missing_bearer_token",
  "auth_invalid_bearer_token",
  "auth_invalid_user",
  "invalid_jwt",
  "jwt_expired",
]);

function includesAuthFailureText(value: string): boolean {
  const lower = (value ?? "").trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("invalid jwt") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid bearer token") ||
    lower.includes("missing bearer token") ||
    lower.includes("session expired")
  );
}

function normalizeCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function classifyErrorCategory(input: { status: number; code: string | null; message: string }): SupabaseFunctionErrorCategory {
  const code = (input.code ?? "").toLowerCase();
  const message = (input.message ?? "").toLowerCase();

  if (AUTH_CODES.has(code) || includesAuthFailureText(message)) return "auth";
  if (code === "rate_limited") return "rate_limited";
  if (code === "platform_inference_quota_exceeded") return "quota";
  if (code === "platform_inference_not_allowed") return "plan";
  if (code === "platform_inference_misconfigured" || code === "auth_verifier_misconfigured") return "misconfigured";
  if (code === "community_contract_mismatch") return "misconfigured";
  if (code === "platform_inference_disabled") return "disabled";
  if (code === "model_not_allowed") return "model_not_allowed";

  if (input.status === 401 || input.status === 403) {
    if (includesAuthFailureText(message)) return "auth";
  }
  return "unknown";
}

async function readFunctionErrorBody(response: Response): Promise<{ code: string | null; message: string }> {
  try {
    const json = (await response.clone().json()) as {
      code?: unknown;
      message?: unknown;
      error?: unknown;
    };
    const code = normalizeCode(json?.code);
    const message =
      (typeof json?.message === "string" && json.message.trim()) ||
      (typeof json?.error === "string" && json.error.trim()) ||
      "";
    if (code || message) return { code, message };
  } catch {
    // ignore
  }

  try {
    const text = (await response.clone().text()).trim();
    if (text) return { code: null, message: text };
  } catch {
    // ignore
  }

  return { code: null, message: "" };
}

export async function readSupabaseFunctionError(response: Response): Promise<SupabaseFunctionError> {
  const requestId = (response.headers.get("x-arx-request-id") ?? "").trim() || null;
  const parsed = await readFunctionErrorBody(response);
  const fallbackMessage = `Request failed (${response.status})`;
  const message = parsed.message || fallbackMessage;
  const category = classifyErrorCategory({
    status: response.status,
    code: parsed.code,
    message,
  });
  return {
    status: response.status,
    code: parsed.code,
    message,
    requestId,
    category,
  };
}

export function formatSupabaseFunctionErrorMessage(error: SupabaseFunctionError): string {
  const base = (() => {
    if (error.category === "auth") return "Session expired. Please sign in again.";
    if (error.code === "community_contract_mismatch") {
      return "Community tools are temporarily unavailable while the backend contract is syncing. Please retry shortly.";
    }
    return error.message.trim() || `Request failed (${error.status})`;
  })();
  if (!error.requestId) return base;
  if (base.toLowerCase().includes("request_id=")) return base;
  return `${base} (request_id=${error.requestId})`;
}

export function shouldFallbackFromPlatformErrorToPublic(error: SupabaseFunctionError): boolean {
  if (error.category === "quota") return true;
  if (error.category === "plan") return true;
  if (error.category === "misconfigured") return true;
  if (error.category === "disabled") return true;
  if (error.category === "rate_limited") return true;
  if (error.category === "auth") return true;
  if (error.code === "model_not_allowed") return true;
  if (error.status >= 500) return true;
  return false;
}

export function shouldFallbackFromChatgptErrorToPlatform(errorMessage: string): boolean {
  const lower = String(errorMessage ?? "").trim().toLowerCase();
  if (!lower) return true;
  if (lower.includes("chatgpt_http_")) return true;
  if (lower.includes("chatgpt session not available")) return true;
  if (lower.includes("model is not eligible for chatgpt inference")) return true;
  if (lower.includes("chatgpt request failed")) return true;
  if (lower.includes("chatgpt stream failed")) return true;
  return true;
}
