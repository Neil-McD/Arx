import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityMessageReactionLike,
  type CommunityResourceLike,
  type CommunitySubscriptionLike,
} from "./communityCore";
import type { CommunityJoinRequestLike } from "./communityJoinRequestCore";
import { deleteMemberWorkflowPosition } from "./communityMemberWorkflowReadCore";

function normalizeMaintenanceSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function uniqueSortedStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function maintenanceUserExists(ctx: any, userId: any, cache: Map<string, boolean>): Promise<boolean> {
  const key = String(userId ?? "").trim();
  if (!key) return false;
  const cached = cache.get(key);
  if (typeof cached === "boolean") return cached;
  const row = await ctx.db.get(userId);
  const exists = Boolean(row);
  cache.set(key, exists);
  return exists;
}

export const purgeOrphanedCommunityUserArtifactsInternal = internalMutation({
  args: {
    communitySlug: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const slug = normalizeMaintenanceSlug(args.communitySlug);
    if (!slug) throw new Error("community_slug_required");
    const dryRun = args.dryRun !== false;

    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    const userExistenceCache = new Map<string, boolean>();
    if (!(await maintenanceUserExists(ctx, community.ownerId, userExistenceCache))) {
      throw new Error("community_owner_missing");
    }

    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityMembershipLike[];
    const orphanMemberships: CommunityMembershipLike[] = [];
    for (const row of memberships) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanMemberships.push(row);
      }
    }
    const orphanMembershipIds = new Set(orphanMemberships.map((row) => String(row._id)));

    const presenceRows = (await ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_lastSeenAt", (q: any) => q.eq("communityId", community._id))
      .collect()) as Array<{ _id: any; userId: any }>;
    const orphanPresenceRows = [];
    for (const row of presenceRows) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanPresenceRows.push(row);
      }
    }

    const joinRequests = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityJoinRequestLike[];
    const orphanJoinRequests: CommunityJoinRequestLike[] = [];
    for (const row of joinRequests) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanJoinRequests.push(row);
      }
    }

    const memberSettings = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityMemberSettingsLike[];
    const orphanMemberSettings: CommunityMemberSettingsLike[] = [];
    for (const row of memberSettings) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanMemberSettings.push(row);
      }
    }

    const readCursors = (await ctx.db
      .query("communityReadCursors" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as Array<{ _id: any; userId: any }>;
    const orphanReadCursors = [];
    for (const row of readCursors) {
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanReadCursors.push(row);
      }
    }

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityResourceLike[];
    const orphanResources: CommunityResourceLike[] = [];
    for (const row of resources) {
      if (!(await maintenanceUserExists(ctx, row.createdByUserId, userExistenceCache))) {
        orphanResources.push(row);
      }
    }

    const threads = (await ctx.db
      .query("communityChatThreads" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityChatThreadLike[];
    const communityMessages: CommunityChatMessageLike[] = [];
    const orphanMessages: CommunityChatMessageLike[] = [];
    for (const thread of threads) {
      const messages = (await ctx.db
        .query("communityChatMessages" as any)
        .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
        .collect()) as CommunityChatMessageLike[];
      for (const row of messages) {
        communityMessages.push(row);
        if (!row.senderUserId) continue;
        if (!(await maintenanceUserExists(ctx, row.senderUserId, userExistenceCache))) {
          orphanMessages.push(row);
        }
      }
    }
    const orphanMessageIds = new Set(orphanMessages.map((row) => String(row._id)));

    const orphanReactions: CommunityMessageReactionLike[] = [];
    for (const message of communityMessages) {
      const reactions = (await ctx.db
        .query("communityMessageReactions" as any)
        .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
        .collect()) as CommunityMessageReactionLike[];
      for (const reaction of reactions) {
        if (
          orphanMessageIds.has(String(reaction.messageId)) ||
          !(await maintenanceUserExists(ctx, reaction.userId, userExistenceCache))
        ) {
          orphanReactions.push(reaction);
        }
      }
    }
    const dedupedReactionIds = new Set<string>();
    const dedupedOrphanReactions = orphanReactions.filter((row) => {
      const key = String(row._id);
      if (dedupedReactionIds.has(key)) return false;
      dedupedReactionIds.add(key);
      return true;
    });

    const subscriptions = (await ctx.db
      .query("communitySubscriptions" as any)
      .collect()) as CommunitySubscriptionLike[];
    const orphanSubscriptions: CommunitySubscriptionLike[] = [];
    for (const row of subscriptions) {
      if (String(row.communityId ?? "") !== String(community._id)) continue;
      if (orphanMembershipIds.has(String(row.membershipId))) {
        orphanSubscriptions.push(row);
        continue;
      }
      if (!(await maintenanceUserExists(ctx, row.userId, userExistenceCache))) {
        orphanSubscriptions.push(row);
      }
    }

    const orphanUserIds = uniqueSortedStrings([
      ...orphanMemberships.map((row) => String(row.userId)),
      ...orphanPresenceRows.map((row) => String(row.userId)),
      ...orphanJoinRequests.map((row) => String(row.userId)),
      ...orphanMemberSettings.map((row) => String(row.userId)),
      ...orphanReadCursors.map((row) => String(row.userId)),
      ...orphanResources.map((row) => String(row.createdByUserId)),
      ...orphanMessages.map((row) => String(row.senderUserId ?? "")),
      ...dedupedOrphanReactions.map((row) => String(row.userId)),
      ...orphanSubscriptions.map((row) => String(row.userId)),
    ].filter(Boolean));

    const summary = {
      community_id: String(community._id),
      community_slug: community.slug,
      dry_run: dryRun,
      orphan_user_ids: orphanUserIds,
      deleted: {
        memberships: orphanMemberships.length,
        presence: orphanPresenceRows.length,
        join_requests: orphanJoinRequests.length,
        member_settings: orphanMemberSettings.length,
        read_cursors: orphanReadCursors.length,
        resources: orphanResources.length,
        messages: orphanMessages.length,
        message_reactions: dedupedOrphanReactions.length,
        subscriptions: orphanSubscriptions.length,
      },
    };

    if (dryRun) return { ok: true, ...summary };

    for (const row of dedupedOrphanReactions) await ctx.db.delete(row._id as any);
    for (const row of orphanMessages) await ctx.db.delete(row._id as any);
    for (const row of orphanResources) await ctx.db.delete(row._id as any);
    for (const row of orphanSubscriptions) await ctx.db.delete(row._id as any);
    for (const row of orphanReadCursors) await ctx.db.delete(row._id as any);
    for (const row of orphanMemberSettings) await ctx.db.delete(row._id as any);
    for (const row of orphanJoinRequests) await ctx.db.delete(row._id as any);
    for (const row of orphanPresenceRows) await ctx.db.delete(row._id as any);
    for (const row of orphanMemberships) {
      await ctx.db.delete(row._id as any);
      await deleteMemberWorkflowPosition({ ctx, communityId: row.communityId as any, membershipId: row._id as any });
    }

    return { ok: true, ...summary };
  },
});
