export type CloudFunctionErrorCategory =
  | "auth"
  | "rate_limited"
  | "quota"
  | "plan"
  | "misconfigured"
  | "disabled"
  | "model_not_allowed"
  | "unknown";

export type CloudFunctionError = {
  status: number;
  code: string | null;
  message: string;
  requestId: string | null;
  stage: string | null;
  category: CloudFunctionErrorCategory;
};

const AUTH_CODES = new Set([
  "auth_missing_bearer_token",
  "auth_invalid_bearer_token",
  "auth_invalid_user",
  "invalid_jwt",
  "jwt_expired",
  "verified_identity_required",
  "auth_subject_required",
  "auth_subject_mismatch",
]);

function includesAuthFailureText(value: string): boolean {
  const lower = (value ?? "").trim().toLowerCase();
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

function normalizeCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function classifyErrorCategory(input: { status: number; code: string | null; message: string }): CloudFunctionErrorCategory {
  const code = (input.code ?? "").toLowerCase();
  const message = (input.message ?? "").toLowerCase();

  if (AUTH_CODES.has(code) || code === "auth_required" || includesAuthFailureText(message)) return "auth";
  if (code === "rate_limited") return "rate_limited";
  if (code === "platform_inference_quota_exceeded") return "quota";
  if (code === "platform_inference_not_allowed" || code === "tier_required" || code === "plan_required") return "plan";
  if (
    code === "platform_inference_misconfigured" ||
    code === "auth_verifier_misconfigured" ||
    code === "auth_upstream_unavailable"
  )
    return "misconfigured";
  if (code === "community_contract_mismatch") return "misconfigured";
  if (code === "platform_inference_disabled") return "disabled";
  if (code === "model_not_allowed") return "model_not_allowed";

  if (input.status === 401 || input.status === 403) {
    if (includesAuthFailureText(message)) return "auth";
  }
  return "unknown";
}

async function readFunctionErrorBody(response: Response): Promise<{ code: string | null; message: string; stage: string | null }> {
  try {
    const json = (await response.clone().json()) as {
      code?: unknown;
      message?: unknown;
      error?: unknown;
      stage?: unknown;
    };
    const code = normalizeCode(json?.code);
    const message =
      (typeof json?.message === "string" && json.message.trim()) ||
      (typeof json?.error === "string" && json.error.trim()) ||
      "";
    const stage = normalizeCode(json?.stage);
    if (code || message || stage) return { code, message, stage };
  } catch {
    // ignore
  }

  try {
    const text = (await response.clone().text()).trim();
    if (text) return { code: null, message: text, stage: null };
  } catch {
    // ignore
  }

  return { code: null, message: "", stage: null };
}

export async function readCloudFunctionErrorCore(response: Response): Promise<CloudFunctionError> {
  const requestId = (response.headers.get("x-arx-request-id") ?? "").trim() || null;
  const stageHeader = (response.headers.get("x-arx-runtime-stage") ?? "").trim() || null;
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
    stage: parsed.stage ?? stageHeader,
    category,
  };
}

export function formatCloudFunctionErrorMessageCore(error: CloudFunctionError): string {
  const base = (() => {
    if (error.category === "auth") return "Session expired. Please sign in again.";
    if (error.code === "community_contract_mismatch") {
      return "Community tools are temporarily unavailable while the backend contract is syncing. Please retry shortly.";
    }
    return error.message.trim() || `Request failed (${error.status})`;
  })();
  const suffixParts: string[] = [];
  if (error.stage) suffixParts.push(`stage=${error.stage}`);
  if (error.requestId) suffixParts.push(`request_id=${error.requestId}`);
  if (suffixParts.length === 0) return base;
  const lower = base.toLowerCase();
  if (lower.includes("request_id=") || lower.includes("stage=")) return base;
  return `${base} (${suffixParts.join(", ")})`;
}

export function shouldFallbackFromPlatformErrorToPublicCore(error: CloudFunctionError): boolean {
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

export function shouldFallbackFromChatgptErrorToPlatformCore(message: string): boolean {
  const lower = String(message ?? "").trim().toLowerCase();
  if (!lower) return true;

  if (
    lower.includes("chatgpt session not available") ||
    lower.includes("sign in again")
  ) {
    return true;
  }

  if (
    lower.includes("chatgpt request failed") ||
    lower.includes("chatgpt response read failed") ||
    lower.includes("chatgpt returned invalid json") ||
    lower.includes("chatgpt returned an empty response")
  ) {
    return true;
  }

  if (lower.includes("chatgpt inference failed")) return true;
  if (lower.includes("http 4") || lower.includes("http 5")) return true;

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("network error") ||
    lower.includes("connection reset") ||
    lower.includes("connection refused") ||
    lower.includes("temporarily unavailable")
  ) {
    return true;
  }

  return true;
}
