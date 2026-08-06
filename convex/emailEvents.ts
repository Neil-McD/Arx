import { internal } from "./_generated/api";
import { buildCommunityTabPath } from "../shared/webAppRouteState";

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
      buildCommunityTabPath(communitySlug || null, "chat") || "/discover";
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
      "/discover";
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

export async function enqueueFounderCheckoutRecoveryEmailInternal(params: {
  ctx: any;
  recipientEmail: string;
  sessionId: string;
  nowMs: number;
}) {
  // Use a stable authenticated route. The app root can resolve against a
  // stale or archived last-active community before recovery gets a chance to
  // claim the receipt.
  const actionUrl = new URL("/settings/billing", buildAppUrl("/"));
  actionUrl.searchParams.set("founder_checkout", "recover");
  actionUrl.searchParams.set("session_id", params.sessionId);
  // This email is the durable recovery path for an anonymous paid checkout.
  // Propagate enqueue failures so Stripe retries the verified webhook. The
  // outbox dedupe key keeps that retry idempotent.
  return await params.ctx.runMutation(
    (internal as any).email.enqueueEmailJobInternal,
    {
      kind: "founder_checkout_recovery",
      recipientEmail: params.recipientEmail,
      templateKey: "founder_checkout_recovery",
      payload: {
        actionUrl: actionUrl.toString(),
        footerNote:
          "For your security, this link only works after you sign in with the email used at checkout.",
      },
      dedupeKey: `founder_checkout_recovery:${params.sessionId}`,
      nowMs: params.nowMs,
    },
  );
}
