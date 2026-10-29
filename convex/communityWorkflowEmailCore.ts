import { internal } from "./_generated/api";
import { findTestMemberByUserId } from "./communityTestMemberCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import { normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { fillWorkflowEmailFields, type CommunityMemberWorkflowSendEmailAction } from "../shared/communityMemberWorkflow";

// Workflows → Send an email. The email goes through the outbox like every
// Polynet email (retries, delivery webhooks, verified addresses only). A
// member who unsubscribed gets no more of this community's automation emails,
// and a test member's email goes to the admin running the test instead.

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function appUrl(path: string): string {
  const base = (readEnv("ARX_PUBLIC_APP_URL") || readEnv("PUBLIC_APP_URL") || "https://www.polynet.ai").replace(/\/+$/, "");
  return new URL(path, `${base}/`).toString();
}

export const WORKFLOW_EMAIL_UNSUBSCRIBE_PATH = "/runtime/email/unsubscribe";

function unsubscribeUrl(token: string): string {
  const site = (readEnv("CONVEX_SITE_URL") || readEnv("PUBLIC_CONVEX_SITE_URL")).replace(/\/+$/, "");
  // No email goes out without a working way to stop them.
  if (!/^https?:\/\//.test(site)) throw new Error("workflow_email_unsubscribe_unavailable");
  return `${site}${WORKFLOW_EMAIL_UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}`;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The member's settings row for this community, with an unsubscribe token. */
async function memberEmailSettings(ctx: any, communityId: any, userId: any, nowMs: number) {
  const row = await ctx.db.query("communityMemberSettings")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).first();
  if (row?.workflowEmailToken) return row;
  const token = newToken();
  if (row) {
    await ctx.db.patch(row._id, { workflowEmailToken: token, updatedAt: nowMs });
    return { ...row, workflowEmailToken: token };
  }
  const id = await ctx.db.insert("communityMemberSettings", { communityId, userId, muted: false, workflowEmailToken: token, createdAt: nowMs, updatedAt: nowMs });
  return await ctx.db.get(id);
}

export type WorkflowEmailResult = { resultCode: "email_queued" | "email_previewed" | "email_opted_out" | "email_not_sent"; reason?: string };

export async function sendWorkflowEmail(ctx: any, args: {
  communityId: any;
  membership: { _id: any; userId: any };
  action: CommunityMemberWorkflowSendEmailAction;
  workflowRunId: any;
  autoplay: boolean;
  nowMs: number;
}): Promise<WorkflowEmailResult> {
  const community = await ctx.db.get(args.communityId);
  if (!community) throw new Error("community_not_found");
  const settings = await memberEmailSettings(ctx, args.communityId, args.membership.userId, args.nowMs);
  if (settings.workflowEmailsOptedOutAt) return { resultCode: "email_opted_out" };
  const testRow = await findTestMemberByUserId(ctx, args.membership.userId);
  const isTest = !!testRow && String(testRow.communityId) === String(args.communityId);
  // Autoplay previews the sequence; nothing is sent.
  if (isTest && args.autoplay) return { resultCode: "email_previewed" };
  const name = isTest ? testRow.label : (await resolveUserProfileDisplayProjection(ctx, args.membership.userId))?.display_name ?? "";
  const communityName = String(community.name ?? community.slug ?? "").trim() || "your community";
  const fields = { name, community: communityName };
  const slug = String(community.slug ?? "").trim();
  const result = await ctx.runMutation((internal as any).email.enqueueEmailJobInternal, {
    kind: "community_workflow_email",
    communityId: args.communityId,
    communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    recipientUserId: isTest ? testRow.ownerUserId : args.membership.userId,
    templateKey: "community_workflow_email",
    payload: {
      communityName,
      subject: `${isTest ? "[Test] " : ""}${fillWorkflowEmailFields(args.action.subject, fields)}`,
      body: fillWorkflowEmailFields(args.action.body, fields),
      actionUrl: appUrl(buildCommunityTabPath(slug || null, "chat") || "/discover"),
      unsubscribeUrl: unsubscribeUrl(settings.workflowEmailToken),
      ...(isTest ? { testNote: `A test copy of what ${testRow.label} would get. Real members get it at their own address.` } : {}),
    },
    dedupeKey: `community_workflow_email:${String(args.workflowRunId)}`,
    nowMs: args.nowMs,
  });
  if (result?.status === "suppressed") return { resultCode: "email_not_sent", reason: String(result.reason ?? "suppressed") };
  return { resultCode: "email_queued" };
}

/** The unsubscribe link: stops this community's automation emails for that member. */
export async function optOutOfWorkflowEmailsByToken(ctx: any, token: string, nowMs: number) {
  const value = token.trim();
  if (!/^[0-9a-f]{48}$/.test(value)) return { status: "invalid" as const };
  const row = await ctx.db.query("communityMemberSettings").withIndex("by_workflowEmailToken", (q: any) => q.eq("workflowEmailToken", value)).first();
  if (!row) return { status: "invalid" as const };
  const community = await ctx.db.get(row.communityId);
  if (!row.workflowEmailsOptedOutAt) await ctx.db.patch(row._id, { workflowEmailsOptedOutAt: nowMs, updatedAt: nowMs });
  return { status: "unsubscribed" as const, community_name: String(community?.name ?? "this community") };
}
