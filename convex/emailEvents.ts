import { internal } from "./_generated/api";
import { formatBuilderTierLabel, normalizeBuilderTierForUi } from "../shared/builderBilling";
import { buildCommunityTabPath, buildSettingsPath } from "../shared/webAppRouteState";

type BuilderPlanTier = "free" | "builder";
type BuilderSubscriptionEmailKind =
  | "builder_plan_upgraded"
  | "builder_plan_downgraded"
  | "billing_issue"
  | null;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readFirstEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

function readPublicAppBaseUrl(): string {
  const value = readFirstEnv([
    "ARX_PUBLIC_APP_URL",
    "PUBLIC_APP_URL",
    "VITE_PUBLIC_APP_URL",
    "VITE_APP_URL",
  ]).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("public_app_url_missing");
  }
  return value;
}

function buildAppUrl(path: string): string {
  return new URL(path, `${readPublicAppBaseUrl()}/`).toString();
}

function normalizeBuilderPlanTier(value: unknown): BuilderPlanTier {
  return normalizeBuilderTierForUi(typeof value === "string" ? value : null);
}

function readBuilderPlanRank(value: BuilderPlanTier): number {
  if (value === "builder") return 1;
  return 0;
}

function normalizeSubscriptionStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isBuilderBillingIssueStatus(value: unknown): boolean {
  const status = normalizeSubscriptionStatus(value);
  return (
    status === "past_due" ||
    status === "unpaid" ||
    status === "incomplete" ||
    status === "incomplete_expired"
  );
}

function classifyBuilderSubscriptionEmailEvent(params: {
  previousTier: BuilderPlanTier;
  nextTier: BuilderPlanTier;
  subscriptionStatus: unknown;
}): BuilderSubscriptionEmailKind {
  if (isBuilderBillingIssueStatus(params.subscriptionStatus)) {
    return "billing_issue";
  }
  const previousRank = readBuilderPlanRank(params.previousTier);
  const nextRank = readBuilderPlanRank(params.nextTier);
  if (previousRank === nextRank) return null;
  return nextRank > previousRank ? "builder_plan_upgraded" : "builder_plan_downgraded";
}

export async function enqueueCommunityAccessGrantedEmailInternal(params: {
  ctx: any;
  userId: any;
  communityId: any;
  grantMarker: string;
  nowMs: number;
}) {
  try {
    const community = await params.ctx.db.get(params.communityId);
    if (!community) {
      return { ok: false, skipped: true, reason: "community_not_found" };
    }
    const communityName =
      String(community.name ?? community.slug ?? "").trim() || "your community";
    const communitySlug = String(community.slug ?? "").trim();
    const actionPath =
      buildCommunityTabPath(communitySlug || null, "chat") || "/workspace";
    return await params.ctx.runMutation(
      (internal as any).email.enqueueEmailJobInternal,
      {
        kind: "community_access_granted",
        recipientUserId: params.userId,
        templateKey: "community_access_granted",
        payload: {
          communityName,
          actionUrl: buildAppUrl(actionPath),
        },
        dedupeKey: `community_access_granted:${String(params.communityId)}:${String(params.userId)}:${params.grantMarker}`,
        nowMs: params.nowMs,
      },
    );
  } catch (error) {
    console.error("community_access_granted_email_enqueue_failed", error);
    return { ok: false, skipped: true, reason: "email_enqueue_failed" };
  }
}

export async function enqueueCommunityBillingIssueEmailInternal(params: {
  ctx: any;
  userId: any;
  communityId: any;
  issueMarker: string;
  nowMs: number;
}) {
  try {
    const community = await params.ctx.db.get(params.communityId);
    if (!community) {
      return { ok: false, skipped: true, reason: "community_not_found" };
    }
    const communityName =
      String(community.name ?? community.slug ?? "").trim() || "your community";
    const communitySlug = String(community.slug ?? "").trim();
    const actionPath =
      buildCommunityTabPath(communitySlug || null, "settings") ||
      buildCommunityTabPath(communitySlug || null, "chat") ||
      "/workspace";
    return await params.ctx.runMutation(
      (internal as any).email.enqueueEmailJobInternal,
      {
        kind: "billing_issue",
        recipientUserId: params.userId,
        templateKey: "billing_issue",
        payload: {
          communityName,
          actionUrl: buildAppUrl(actionPath),
        },
        dedupeKey: `community_billing_issue:${String(params.communityId)}:${String(params.userId)}:${params.issueMarker}`,
        nowMs: params.nowMs,
      },
    );
  } catch (error) {
    console.error("community_billing_issue_email_enqueue_failed", error);
    return { ok: false, skipped: true, reason: "email_enqueue_failed" };
  }
}

export async function enqueueBuilderSubscriptionStateEmailInternal(params: {
  ctx: any;
  userId: any;
  previousTier: unknown;
  nextTier: unknown;
  subscriptionStatus: unknown;
  providerSubscriptionId?: unknown;
  periodMarker: string;
  nowMs: number;
}) {
  try {
    const previousTier = normalizeBuilderPlanTier(params.previousTier);
    const nextTier = normalizeBuilderPlanTier(params.nextTier);
    const templateKey = classifyBuilderSubscriptionEmailEvent({
      previousTier,
      nextTier,
      subscriptionStatus: params.subscriptionStatus,
    });
    if (!templateKey) {
      return { ok: true, skipped: true, reason: "no_builder_subscription_email" };
    }
    const subscriptionStatus = normalizeSubscriptionStatus(params.subscriptionStatus);
    const providerSubscriptionId = String(params.providerSubscriptionId ?? "").trim();
    const dedupeKey =
      templateKey === "billing_issue"
        ? `builder_billing_issue:${String(params.userId)}:${providerSubscriptionId || "unknown"}:${subscriptionStatus || "unknown"}:${params.periodMarker}`
        : `builder_plan_change:${String(params.userId)}:${previousTier}:${nextTier}:${params.periodMarker}`;
    return await params.ctx.runMutation(
      (internal as any).email.enqueueEmailJobInternal,
      {
        kind: templateKey,
        recipientUserId: params.userId,
        templateKey,
        payload: {
          planName: formatBuilderTierLabel(nextTier),
          actionUrl: buildAppUrl(buildSettingsPath("account")),
        },
        dedupeKey,
        nowMs: params.nowMs,
      },
    );
  } catch (error) {
    console.error("builder_subscription_state_email_enqueue_failed", error);
    return { ok: false, skipped: true, reason: "email_enqueue_failed" };
  }
}
