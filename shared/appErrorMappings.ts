type ProjectOperation = "create" | "update" | "delete";

type ProjectErrorMessageOptions = {
  operation: ProjectOperation;
  maxProjects: number;
  maxImportFiles: number;
  maxExtractedBytes: number;
};

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

function getProjectFallback(operation: ProjectOperation): string {
  if (operation === "create") return "Failed to create project.";
  if (operation === "update") return "Failed to save project.";
  return "Failed to delete project.";
}

export function formatProjectOperationErrorMessage(
  error: unknown,
  options: ProjectErrorMessageOptions,
): string {
  const fallback = getProjectFallback(options.operation);
  const text = readErrorText(error, fallback);
  const code = readErrorCode(text);

  if (isAuthBootstrapCode(code)) return "Session expired. Please sign in again.";
  if (code === "project_limit_reached") return `Projects are capped at ${options.maxProjects}.`;
  if (code === "workspace_volume_funding_required") {
    return "Add prepaid credits or a card before using workspace storage.";
  }
  if (code === "workspace_card_required_for_additional_volume") {
    return "Extra projects require a card on file.";
  }
  if (code === "workspace_volume_limit_reached") {
    return `Project volumes are capped at ${options.maxProjects}.`;
  }
  if (code === "workspace_provider_volume_quota_headroom_exhausted") {
    return "Workspace storage quota is full. Delete an unused project or try again later.";
  }
  if (code === "project_name_required") return "Project name is required.";
  if (code === "project_import_in_progress") {
    return "This project is already importing in another tab or session.";
  }
  if (code === "project_run_in_progress") {
    return "Stop the active run in this project before deleting it.";
  }
  if (code === "project_import_too_large") return "Project imports are limited to 150 MB zipped.";
  if (code === "project_import_upload_failed") return "Failed to upload the project archive.";
  if (code === "project_import_download_failed") {
    return "Failed to download the project archive for import.";
  }
  if (code === "project_import_too_many_files") {
    return `Project imports are limited to ${options.maxImportFiles.toLocaleString()} extracted files.`;
  }
  if (code === "project_import_extracted_bytes_exceeded") {
    return `Project imports are limited to ${Math.round(options.maxExtractedBytes / (1024 * 1024))} MB after extraction.`;
  }
  if (code === "project_import_storage_full") {
    return "The workspace ran out of space while importing this project.";
  }
  if (code === "project_import_unsafe_entry") {
    return "This archive contains unsupported entries such as symlinks or duplicate paths.";
  }
  if (code === "project_import_zip_required") return "Upload a single .zip file.";
  if (code === "project_create_failed") return "Failed to create project.";
  if (code === "project_update_failed") return "Failed to save project.";
  if (code === "default_project_missing_id") return "Failed to resolve the default project.";

  if (code) return fallback;
  return text || fallback;
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

type WorkspaceBillingCheckoutKind = "card_setup" | "manual_balance";

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

function getWorkspaceBillingCheckoutFallback(kind: WorkspaceBillingCheckoutKind): string {
  return kind === "card_setup"
    ? "Card setup is temporarily unavailable. Please retry shortly."
    : "Manual balance checkout is temporarily unavailable. Please retry shortly.";
}

function readWorkspaceBillingCheckoutCode(text: string): string | null {
  const directCode = normalizeErrorCode(readErrorCode(text));
  if (directCode) return directCode;
  const lower = text.toLowerCase();
  const knownCodes = [
    "stripe_secret_key_missing",
    "stripe_webhook_secret_missing",
    "stripe_checkout_url_missing",
    "workspace_card_setup_unavailable",
    "workspace_credit_topup_unavailable",
    "workspace_card_setup_success_url_invalid",
    "workspace_card_setup_cancel_url_invalid",
    "workspace_credit_topup_success_url_invalid",
    "workspace_credit_topup_cancel_url_invalid",
    "workspace_tool_balance_pack_invalid",
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
    code === "stripe_checkout_url_missing" ||
    code === "workspace_card_setup_unavailable" ||
    code === "workspace_credit_topup_unavailable"
  ) {
    return fallback;
  }
  if (
    code === "workspace_card_setup_success_url_invalid" ||
    code === "workspace_card_setup_cancel_url_invalid" ||
    code === "workspace_credit_topup_success_url_invalid" ||
    code === "workspace_credit_topup_cancel_url_invalid"
  ) {
    return fallback;
  }
  if (code === "workspace_tool_balance_pack_invalid") {
    return "That manual balance option is unavailable. Choose another amount.";
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
