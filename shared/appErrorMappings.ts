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

export function formatProviderConnectionErrorMessage(error: unknown, fallback: string): string {
  const text = readErrorText(error, fallback);
  const code = readErrorCode(text);

  if (isAuthBootstrapCode(code) || includesAuthFailureText(text)) {
    return "Session expired. Please sign in again.";
  }
  if (code === "provider_connection_required") {
    return "Connect a provider in Account Settings to continue.";
  }
  if (code === "platform_inference_misconfigured" || code === "provider_inference_misconfigured") {
    return "Provider connection is temporarily unavailable. Please retry shortly.";
  }

  return text || fallback;
}

type WorkspaceBillingCheckoutKind = "premium_subscription";

function isRawServerErrorText(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("server error: uncaught error") ||
    lower.includes("uncaught error:") ||
    lower.includes("[request id:") ||
    lower.includes("/convex/") ||
    lower.includes("../convex/") ||
    lower.includes(" at ") ||
    lower.includes("stripe_secret_key_missing") ||
    lower.includes("stripe_webhook_secret_missing")
  );
}

function getWorkspaceBillingCheckoutFallback(
  _kind: WorkspaceBillingCheckoutKind,
): string {
  return "Premium checkout is temporarily unavailable. Please retry shortly.";
}

function readWorkspaceBillingCheckoutCode(text: string): string | null {
  const directCode = normalizeErrorCode(readErrorCode(text));
  if (directCode) return directCode;
  const lower = text.toLowerCase();
  const knownCodes = [
    "stripe_secret_key_missing",
    "stripe_webhook_secret_missing",
    "stripe_checkout_url_missing",
    "premium_stripe_price_id_missing",
    "premium_subscription_success_url_invalid",
    "premium_subscription_cancel_url_invalid",
    "user_not_found",
  ];
  return knownCodes.find((code) => lower.includes(code)) ?? null;
}

export function formatWorkspaceBillingCheckoutError(
  error: unknown,
  options: { kind: WorkspaceBillingCheckoutKind },
): string {
  const fallback = getWorkspaceBillingCheckoutFallback(options.kind);
  const rawText = readErrorText(error, fallback);
  const structured = readStructuredErrorParts(rawText);
  const text = structured.message ?? rawText;
  const code = structured.code ?? readWorkspaceBillingCheckoutCode(text);

  if (isAuthBootstrapCode(code) || includesAuthFailureText(text)) {
    return "Session expired. Please sign in again.";
  }
  if (
    code === "stripe_secret_key_missing" ||
    code === "stripe_webhook_secret_missing" ||
    code === "stripe_checkout_url_missing"
  ) {
    return fallback;
  }
  if (
    code === "premium_subscription_success_url_invalid" ||
    code === "premium_subscription_cancel_url_invalid"
  ) {
    return fallback;
  }
  if (code === "user_not_found") return "Session expired. Please sign in again.";
  if (isTransientServerCode(code) || isRawServerErrorText(text)) return fallback;
  if (code) return fallback;
  return text || fallback;
}

export function formatAuthSessionErrorMessage(error: unknown, fallback: string): string {
  const text = readErrorText(error, fallback);
  const code = readErrorCode(text);

  if (isAuthBootstrapCode(code) || includesAuthFailureText(text)) {
    return "Session expired. Please sign in again.";
  }
  return text || fallback;
}

export function formatSendFlowErrorMessage(error: unknown, fallback: string): string {
  const text = readErrorText(error, fallback);
  const code = readErrorCode(text);

  if (isAuthBootstrapCode(code)) return "Session expired. Please sign in again.";
  if (code === "thread_run_in_progress") {
    return "This thread already has a turn in progress. Wait for it to finish before sending another.";
  }
  if (code === "provider_connection_required") {
    return "Connect a provider in Account Settings to use this model.";
  }
  if (
    code === "workspace_credits_exhausted" ||
    code === "workspace_credits_unavailable" ||
    code === "workspace_uncollected_usage_blocked" ||
    code === "credits_exhausted" ||
    code === "credits_unavailable"
  ) {
    return "Tool balance is unavailable for this action. Add balance or choose a different tool.";
  }
  if (
    code === "platform_inference_quota_exceeded" ||
    code === "provider_inference_quota_exceeded"
  ) {
    return "This model is temporarily unavailable because its inference quota was exceeded.";
  }
  if (
    code === "platform_inference_not_allowed" ||
    code === "tier_required" ||
    code === "plan_required" ||
    code === "model_not_allowed"
  ) {
    return "This model requires a different plan or provider connection.";
  }
  if (code === "community_contract_mismatch") {
    return "Community tools are temporarily unavailable while the backend contract is syncing. Please retry shortly.";
  }
  if (
    code === "platform_inference_disabled" ||
    code === "provider_inference_disabled" ||
    code === "platform_inference_unavailable" ||
    code === "provider_inference_unavailable" ||
    code === "provider_error"
  ) {
    return "This model is temporarily unavailable. Try again or change models.";
  }

  if (code) return fallback;
  return text || fallback;
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
