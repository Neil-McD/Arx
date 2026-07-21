import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityBlockLike,
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  communityMembershipRowIsActive,
  communitySubscriptionStatusGrantsAccess,
  normalizeCommunitySubscriptionStatus,
  normalizeMembershipAccessSource,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import {
  type CommunityJoinRequestLike,
  normalizeCommunityJoinRequestStatus,
} from "./communityJoinRequestCore";

type CommunityAccessAuditSeverity = "info" | "warning" | "error";

type CommunityAccessAuditFinding = {
  code: string;
  severity: CommunityAccessAuditSeverity;
  community_id: string;
  community_slug: string | null;
  user_id?: string;
  membership_id?: string;
  join_request_id?: string;
  block_id?: string;
  subscription_id?: string;
  details: Record<string, unknown>;
};

const COMMUNITY_SUBSCRIPTION_STALE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function activeBlockRows(rows: CommunityBlockLike[]): CommunityBlockLike[] {
  return rows.filter((row) => !(typeof row.liftedAt === "number" && row.liftedAt > 0));
}

function statusGrantsAccess(row: CommunitySubscriptionLike | null | undefined): boolean {
  return communitySubscriptionStatusGrantsAccess(normalizeCommunitySubscriptionStatus(row?.status));
}

function pickMostRelevantSubscription(rows: CommunitySubscriptionLike[]): CommunitySubscriptionLike | null {
  return (
    rows
      .slice()
      .sort((a, b) => {
        const aGrants = statusGrantsAccess(a);
        const bGrants = statusGrantsAccess(b);
        if (aGrants !== bGrants) return aGrants ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      })[0] ?? null
  );
}

function subscriptionLooksStale(
  row: CommunitySubscriptionLike | null | undefined,
  nowMs: number,
): boolean {
  if (!row || !statusGrantsAccess(row)) return false;
  if (typeof row.currentPeriodEndAt !== "number" || !Number.isFinite(row.currentPeriodEndAt)) {
    return false;
  }
  return row.currentPeriodEndAt + COMMUNITY_SUBSCRIPTION_STALE_GRACE_MS < nowMs;
}

function pushFinding(
  findings: CommunityAccessAuditFinding[],
  community: CommunityLike,
  finding: Omit<CommunityAccessAuditFinding, "community_id" | "community_slug">,
) {
  findings.push({
    community_id: String(community._id),
    community_slug: String(community.slug ?? "").trim() || null,
    ...finding,
  });
}

export const listCommunityAccessStateAuditFindingsInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const communityLimit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 500)));
    const findings: CommunityAccessAuditFinding[] = [];
    const communityRows = (await ctx.db.query("communities").take(communityLimit + 1)) as CommunityLike[];
    const communities = communityRows.slice(0, communityLimit);

    for (const community of communities) {
      const entryPolicy = resolveCommunityEntryPolicy(community);
      const memberships = (await ctx.db
        .query("communityMemberships")
        .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
        .collect()) as CommunityMembershipLike[];
      const blocks = activeBlockRows(
        (await ctx.db
          .query("communityBlocks" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
          .collect()) as CommunityBlockLike[],
      );
      const joinRequests = (await ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
        .collect()) as CommunityJoinRequestLike[];
      const pricePoints = (await ctx.db
        .query("communityPricePoints" as any)
        .withIndex("by_community_current", (q: any) => q.eq("communityId", community._id).eq("isCurrent", true))
        .collect()) as CommunityPricePointLike[];
      const subscriptions = (await ctx.db
        .query("communitySubscriptions" as any)
        .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id))
        .collect()) as CommunitySubscriptionLike[];

      if (entryPolicy === "paid_subscription" && pricePoints.length === 0) {
        pushFinding(findings, community, {
          code: "paid_community_without_current_price_point",
          severity: "error",
          details: {
            entry_policy: entryPolicy,
          },
        });
      }

      const activeBlockByUser = new Map(blocks.map((row) => [String(row.userId), row]));
      const membershipsByUser = new Map<string, CommunityMembershipLike[]>();
      for (const membership of memberships) {
        const userId = String(membership.userId);
        membershipsByUser.set(userId, [...(membershipsByUser.get(userId) ?? []), membership]);
      }

      const uniqueMembershipByUser = new Map<string, CommunityMembershipLike | null>();
      for (const [userId, userMemberships] of membershipsByUser) {
        if (userMemberships.length !== 1) {
          uniqueMembershipByUser.set(userId, null);
          pushFinding(findings, community, {
            code: "duplicate_community_membership_pair",
            severity: "error",
            user_id: userId,
            details: {
              membership_count: userMemberships.length,
              membership_ids: userMemberships.map((row) => String(row._id)),
            },
          });
          continue;
        }
        const membership = userMemberships[0] ?? null;
        uniqueMembershipByUser.set(userId, membership);
        if (!communityMembershipRowIsActive(membership)) continue;

        const block = activeBlockByUser.get(userId) ?? null;
        if (block && String(community.ownerId) !== userId) {
          pushFinding(findings, community, {
            code: "active_membership_with_active_block",
            severity: "error",
            user_id: userId,
            membership_id: String(membership._id),
            block_id: String(block._id),
            details: {
              role: membership.role,
              access_source: membership.accessSource ?? null,
            },
          });
        }

        const accessSource = normalizeMembershipAccessSource(membership.accessSource);
        if (entryPolicy === "paid_subscription" && String(community.ownerId) !== userId) {
          if (accessSource === "paid_subscription") {
            const relevantSubscription = pickMostRelevantSubscription(
              subscriptions.filter((row) => String(row.membershipId) === String(membership._id)),
            );
            if (!statusGrantsAccess(relevantSubscription)) {
              pushFinding(findings, community, {
                code: "active_paid_membership_without_granting_subscription",
                severity: "error",
                user_id: userId,
                membership_id: String(membership._id),
                subscription_id: relevantSubscription ? String(relevantSubscription._id) : undefined,
                details: {
                  subscription_status: relevantSubscription?.status ?? null,
                },
              });
            } else if (subscriptionLooksStale(relevantSubscription, nowMs)) {
              pushFinding(findings, community, {
                code: "active_paid_membership_with_stale_subscription_period",
                severity: "warning",
                user_id: userId,
                membership_id: String(membership._id),
                subscription_id: relevantSubscription ? String(relevantSubscription._id) : undefined,
                details: {
                  subscription_status: relevantSubscription?.status ?? null,
                  current_period_end_at: relevantSubscription?.currentPeriodEndAt ?? null,
                  stale_grace_ms: COMMUNITY_SUBSCRIPTION_STALE_GRACE_MS,
                  reason: "Stripe-backed access should be reconciled when a granting subscription is past its local period end grace window.",
                },
              });
            }
          } else {
            pushFinding(findings, community, {
              code: "paid_community_durable_grant_review",
              severity: "warning",
              user_id: userId,
              membership_id: String(membership._id),
              details: {
                access_source: accessSource || null,
                reason: "Manual/free access in a paid community should be an explicit comp grant.",
              },
            });
          }
        }
      }

      const joinRequestsByUser = new Map<string, CommunityJoinRequestLike[]>();
      for (const request of joinRequests) {
        const requestUserId = String(request.userId);
        joinRequestsByUser.set(requestUserId, [
          ...(joinRequestsByUser.get(requestUserId) ?? []),
          request,
        ]);
      }
      for (const [requestUserId, userRequests] of joinRequestsByUser) {
        if (userRequests.length > 1) {
          pushFinding(findings, community, {
            code: "duplicate_community_join_request_pair",
            severity: "error",
            user_id: requestUserId,
            details: {
              request_count: userRequests.length,
              request_ids: userRequests.map((row) => String(row._id)),
            },
          });
        }
        for (const request of userRequests) {
          const status = normalizeCommunityJoinRequestStatus(request.status);
          const membership = uniqueMembershipByUser.get(requestUserId) ?? null;
          if (String(community.ownerId) === requestUserId) {
            pushFinding(findings, community, {
              code: "community_owner_join_request_forbidden",
              severity: "error",
              user_id: requestUserId,
              join_request_id: String(request._id),
              details: { request_status: request.status },
            });
          }
          if (!status) {
            pushFinding(findings, community, {
              code: "community_join_request_status_invalid",
              severity: "error",
              user_id: requestUserId,
              join_request_id: String(request._id),
              details: { request_status: request.status },
            });
          } else if (
            status === "pending" &&
            (request.deniedAt !== undefined || request.reapplyAt !== undefined)
          ) {
            pushFinding(findings, community, {
              code: "community_join_request_pending_fields_invalid",
              severity: "error",
              user_id: requestUserId,
              join_request_id: String(request._id),
              details: {},
            });
          } else if (
            status === "denied" &&
            (typeof request.deniedAt !== "number" ||
              !Number.isFinite(request.deniedAt) ||
              typeof request.reapplyAt !== "number" ||
              !Number.isFinite(request.reapplyAt) ||
              request.reapplyAt <= request.deniedAt)
          ) {
            pushFinding(findings, community, {
              code: "community_join_request_denial_fields_invalid",
              severity: "error",
              user_id: requestUserId,
              join_request_id: String(request._id),
              details: {},
            });
          }
          if (communityMembershipRowIsActive(membership)) {
            pushFinding(findings, community, {
              code: "active_membership_with_join_request",
              severity: "error",
              user_id: requestUserId,
              join_request_id: String(request._id),
              membership_id: String(membership!._id),
              details: { request_status: request.status },
            });
          }
        }
      }
    }

    return {
      ok: true,
      generated_at_ms: nowMs,
      scanned_communities: communities.length,
      truncated: communityRows.length > communityLimit,
      findings,
    };
  },
});
