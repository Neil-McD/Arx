import {
  classifyPaidUsageFailure,
  normalizePaidUsageBillingMode,
  type PaidUsageBillingMode,
} from "./paidUsageBilling";
import { normalizePaidToolKind, type PaidToolKind } from "./workspaceCredits";

export type CloudFunctionErrorCategory =
  | "auth"
  | "rate_limited"
  | "quota"
  | "workspace_credits"
  | "plan"
  | "provider_connection_required"
  | "misconfigured"
  | "disabled"
  | "unavailable"
  | "model_not_allowed"
  | "conflict"
  | "unknown";

export type CloudFunctionError = {
  status: number;
  code: string | null;
  message: string;
  requestId: string | null;
  stage: string | null;
  toolKind: PaidToolKind | null;
  requiredCredits: number | null;
  paidUsageBillingMode: PaidUsageBillingMode | null;
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

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function isLikelyHtmlDocument(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower.startsWith("<!doctype html") || lower.startsWith("<html") || lower.includes("<body");
}

function normalizePlainTextError(value: string, status: number): string {
  const trimmed = value.trim();
  if (!trimmed) return `Request failed (${status})`;
  if (!isLikelyHtmlDocument(trimmed)) return trimmed;

  const text = stripHtmlTags(trimmed).replace(/\s+/g, " ").trim();
  if (status === 502) return "Bad gateway. The backend returned an invalid upstream response.";
  if (status === 503) return "Service unavailable. The backend is temporarily unavailable.";
  return text || `Request failed (${status})`;
}

export function classifyCloudFunctionErrorCategoryCore(input: {
  status: number;
  code: string | null;
  message: string;
  paidUsageBillingMode?: PaidUsageBillingMode | null;
}): CloudFunctionErrorCategory {
  const code = (input.code ?? "").toLowerCase();
  const message = (input.message ?? "").toLowerCase();

  if (AUTH_CODES.has(code) || code === "auth_required" || includesAuthFailureText(message)) return "auth";
  if (code === "rate_limited") return "rate_limited";
  if (code === "platform_inference_quota_exceeded" || code === "provider_inference_quota_exceeded") return "quota";
  if (
    classifyPaidUsageFailure({
      code,
      paidUsageBillingMode: input.paidUsageBillingMode,
    }).isPaidUsageFailure
  ) {
    return "workspace_credits";
  }
  if (
    code === "platform_inference_not_allowed" ||
    code === "tier_required" ||
    code === "plan_required"
  )
    return "plan";
  if (code === "provider_connection_required") return "provider_connection_required";
  if (
    code === "platform_inference_misconfigured" ||
    code === "provider_inference_misconfigured" ||
    code === "auth_verifier_misconfigured" ||
    code === "auth_upstream_unavailable"
  )
    return "misconfigured";
  if (code === "community_contract_mismatch") return "misconfigured";
  if (code === "platform_inference_disabled" || code === "provider_inference_disabled") return "disabled";
  if (
    code === "platform_inference_unavailable" ||
    code === "provider_inference_unavailable" ||
    code === "provider_error"
  )
    return "unavailable";
  if (code === "model_not_allowed") return "model_not_allowed";
  if (code === "thread_run_in_progress") return "conflict";

  if (input.status === 401 || input.status === 403) {
    if (includesAuthFailureText(message)) return "auth";
  }
  return "unknown";
}

function normalizePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function readFunctionErrorBody(response: Response): Promise<{
  code: string | null;
  message: string;
  stage: string | null;
  toolKind: PaidToolKind | null;
  requiredCredits: number | null;
  paidUsageBillingMode: PaidUsageBillingMode | null;
}> {
  try {
    const json = (await response.clone().json()) as {
      code?: unknown;
      message?: unknown;
      error?: unknown;
      stage?: unknown;
      tool_kind?: unknown;
      toolKind?: unknown;
      paid_tool_kind?: unknown;
      required_credits?: unknown;
      requiredCredits?: unknown;
      paid_usage_billing_mode?: unknown;
      paidUsageBillingMode?: unknown;
      billing_mode?: unknown;
    };
    const code = normalizeCode(json?.code);
    const message =
      (typeof json?.message === "string" && json.message.trim()) ||
      (typeof json?.error === "string" && json.error.trim()) ||
      "";
    const stage = normalizeCode(json?.stage);
    const toolKind = normalizePaidToolKind(json?.tool_kind ?? json?.toolKind ?? json?.paid_tool_kind);
    const requiredCredits = normalizePositiveNumber(json?.required_credits ?? json?.requiredCredits);
    const paidUsageBillingMode = normalizePaidUsageBillingMode(
      json?.paid_usage_billing_mode ?? json?.paidUsageBillingMode ?? json?.billing_mode,
    );
    if (code || message || stage || toolKind || requiredCredits || paidUsageBillingMode) {
      return { code, message, stage, toolKind, requiredCredits, paidUsageBillingMode };
    }
  } catch {
    // ignore
  }

  try {
    const text = (await response.clone().text()).trim();
    if (text) {
      return {
        code: null,
        message: normalizePlainTextError(text, response.status),
        stage: null,
        toolKind: null,
        requiredCredits: null,
        paidUsageBillingMode: null,
      };
    }
  } catch {
    // ignore
  }

  return {
    code: null,
    message: "",
    stage: null,
    toolKind: null,
    requiredCredits: null,
    paidUsageBillingMode: null,
  };
}

export async function readCloudFunctionErrorCore(response: Response): Promise<CloudFunctionError> {
  const requestId = (response.headers.get("x-arx-request-id") ?? "").trim() || null;
  const stageHeader = (response.headers.get("x-arx-runtime-stage") ?? "").trim() || null;
  const parsed = await readFunctionErrorBody(response);
  const fallbackMessage = `Request failed (${response.status})`;
  const message = parsed.message || fallbackMessage;
  const category = classifyCloudFunctionErrorCategoryCore({
    status: response.status,
    code: parsed.code,
    message,
    paidUsageBillingMode: parsed.paidUsageBillingMode,
  });
  return {
    status: response.status,
    code: parsed.code,
    message,
    requestId,
    stage: parsed.stage ?? stageHeader,
    toolKind: parsed.toolKind,
    requiredCredits: parsed.requiredCredits,
    paidUsageBillingMode: parsed.paidUsageBillingMode,
    category,
  };
}

export function formatCloudFunctionErrorMessageCore(error: CloudFunctionError): string {
  const base = (() => {
    if (error.category === "auth") return "Session expired. Please sign in again.";
    if (error.code === "thread_run_in_progress") {
      return "This thread already has a turn in progress. Wait for it to finish before sending another.";
    }
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
  if (error.category === "workspace_credits") return false;
  if (error.category === "plan") return true;
  if (error.category === "provider_connection_required") return true;
  if (error.category === "misconfigured") return true;
  if (error.category === "disabled") return true;
  if (error.category === "unavailable") return true;
  if (error.category === "rate_limited") return true;
  if (error.category === "auth") return true;
  if (error.code === "model_not_allowed") return true;
  if (error.status >= 500) return true;
  return false;
}
