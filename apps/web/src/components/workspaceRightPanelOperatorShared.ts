import type {
  OperatorAccountSetupUserRecord,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorCommunityRecord,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";

export function formatMoney(metric: { currency: string; amountBaseUnits: number; currencyDecimals: number } | null): string {
  if (!metric) return "$0";
  const amount = Number(metric.amountBaseUnits ?? 0) / 10 ** Number(metric.currencyDecimals ?? 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: metric.currency || "usd",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUsdAmount(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "usd",
    maximumFractionDigits: amount < 100 ? 2 : 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

export function formatVisibility(value: OperatorCommunityRecord["community"]["visibility"]): string {
  switch (value) {
    case "published":
      return "Published";
    case "unlisted":
      return "Unlisted";
    default:
      return "Unknown";
  }
}

export function formatEntryPolicy(value: OperatorCommunityRecord["community"]["entryPolicy"]): string {
  switch (value) {
    case "paid_subscription":
      return "Paid";
    case "approval":
      return "Approval";
    case "open":
      return "Free";
    default:
      return "Unknown";
  }
}

export function formatAccountSetupStep(value: OperatorAccountSetupUserRecord["setup"]["current_step"]): string {
  switch (value) {
    case "identity":
      return "Profile";
    case "complete":
      return "Complete";
    default:
      return "Unknown";
  }
}

export function formatAccountSetupMissing(value: OperatorAccountSetupUserRecord["setup"]["missing"][number]): string {
  switch (value) {
    case "display_name":
      return "Name";
    case "handle":
      return "Handle";
    case "avatar":
      return "Avatar";
    case "platform_legal":
      return "Platform legal";
    default:
      return value;
  }
}

export function formatPayoutStatus(value: OperatorCommunityRecord["creator"]["payoutStatus"]): string {
  switch (value) {
    case "ready":
      return "Payout ready";
    case "onboarding_required":
      return "Payout setup";
    case "pending_requirements":
      return "Payout pending";
    case "restricted":
      return "Payout restricted";
    case "not_connected":
    default:
      return "No payout";
  }
}

export function formatRiskFlag(value: string): string {
  switch (value) {
    case "paid_enabled_no_sales":
      return "Paid community has no sales";
    case "payout_not_ready":
      return "Payout not ready";
    case "checkout_abandonment":
      return "Checkout abandonment";
    case "no_members":
      return "No members";
    case "paid_missing_price":
      return "Missing price";
    case "stale_member_activity":
      return "No recent member activity";
    default:
      return value
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function formatHealth(
  value:
    | OperatorAuthAccessDiagnosticsSnapshot["health"]
    | OperatorSecurityAuditDiagnosticsSnapshot["health"]
    | OperatorRuntimeToolDiagnosticsSnapshot["health"]
    | OperatorWebDeployDiagnosticsSnapshot["health"]
    | OperatorFrontendErrorDiagnosticsSnapshot["health"]
    | null
    | undefined,
): string {
  switch (value) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "incident":
      return "Incident";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function formatDiagnosticEventType(value: string): string {
  switch (value) {
    case "auth.session_established":
      return "Session established";
    case "auth.session_refreshed":
      return "Session refreshed";
    case "auth.bootstrap_failed":
      return "Auth bootstrap failed";
    case "auth.session_refresh_failed":
      return "Session refresh failed";
    case "access.operator_access_granted":
      return "Operator access granted";
    case "access.operator_access_denied":
      return "Operator access denied";
    case "access.community_denied":
      return "Community access denied";
    default:
      return value
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function formatAuditEventType(value: string): string {
  switch (value) {
    case "account_delete_blocked":
      return "Account deletion blocked";
    case "account_delete_completed":
      return "Account deleted";
    case "operator_dashboard_accessed":
      return "Operator dashboard access";
    case "operator_role_deactivated":
      return "Operator role deactivated";
    case "operator_role_upserted":
      return "Operator role changed";
    case "stripe_webhook_failed":
      return "Stripe webhook failed";
    case "stripe_webhook_processed":
      return "Stripe webhook processed";
    case "stripe_webhook_received":
      return "Stripe webhook received";
    case "stripe_connect_account_synced":
      return "Stripe Connect synced";
    case "community_subscription_synced":
      return "Community subscription synced";
    default:
      return value
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function formatEventTime(createdAt: number): string {
  if (!Number.isFinite(createdAt)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function formatIsoEventTime(value: string | null): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return formatEventTime(timestamp);
}

export function formatBoundedCount(value: number | null | undefined, isTruncated: boolean | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return isTruncated ? `${value}+` : String(value);
}

export function formatCredits(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatOptionalCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US");
}

export function formatPlatformScore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return String(value);
}
