import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { requireCommunityChatAccess, normalizeIdValue } from "./communityCore";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import { channelActorKindValidator } from "./communityChannelValidators";
import {
  type CommunityChannelLike,
  interactionBelongsToChannel,
  listSharedCommunityChannels,
  requireChannelFromAuthorizedSet,
} from "./communityChannelCore";
import { listReadablePrivateRoomsForSearch } from "./communityInteractionEvidence";
import {
  buildCommunityInteractionEvidenceRef,
  communityInteractionVisibilityIsEvidenceReadable,
} from "../shared/communityEvidenceContract";
import { MEMBER_TIMELINE_PAGE } from "../shared/communityOntology";

// One member's posts and replies, newest first, limited to what the reader
// may read: live, community-visible, in a room the reader can read (the
// community agent answering in public reads shared rooms only), and a reply
// only while its thread is live. Paged by offset over bounded index reads.
const TIMELINE_MAX_OFFSET = 500;
const SNIPPET_CHARS = 200;

export const loadMemberTimelineInternal = internalQuery({
  args: {
    userId: v.id("users"),
    actorKind: v.optional(channelActorKindValidator),
    communityId: v.id("communities"),
    handle: v.string(),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const handle = args.handle.trim().replace(/^@/, "").toLowerCase();
    const member = handle === "me"
      ? await ctx.db.get(args.userId)
      : await ctx.db.query("users").withIndex("by_normalizedHandle", (q) => q.eq("normalizedHandle", handle)).first();
    if (!member) return null;
    // Only people of this community have a timeline here.
    const isOwner = normalizeIdValue(community.ownerId) === normalizeIdValue(member._id);
    const membership = isOwner ? null : await ctx.db.query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", member._id)).first();
    if (!isOwner && !membership) return null;

    const actorKind = args.actorKind ?? "human";
    let channels: CommunityChannelLike[] = await listSharedCommunityChannels({ ctx, communityId: args.communityId });
    let privateRoomsCapped = false;
    if (actorKind !== "community_agent") {
      const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId, kind: actorKind });
      const { rooms, scanCapped } = await listReadablePrivateRoomsForSearch(ctx, args.communityId, actor);
      channels = [...channels, ...rooms];
      privateRoomsCapped = scanCapped;
    }

    const offset = Math.max(0, Math.min(TIMELINE_MAX_OFFSET, Math.floor(Number(args.offset) || 0)));
    // Unreadable rows (private rooms, deleted posts) also use the window, so
    // read past the page; hasMore stays true when a window was full.
    const window = offset + MEMBER_TIMELINE_PAGE * 3 + 50;
    const byAuthor = (table: "communityInteractionRoots" | "communityInteractionReplies"): Promise<any[]> => ctx.db.query(table as any)
      .withIndex("by_community_actorUser_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("actorUserId", member._id))
      .order("desc").take(window);
    const [roots, replies] = await Promise.all([byAuthor("communityInteractionRoots"), byAuthor("communityInteractionReplies")]);
    const readable = (row: any) => row?.status === "live" && communityInteractionVisibilityIsEvidenceReadable(row.visibilityScope);
    const channelFor = (root: any): CommunityChannelLike | null => {
      try {
        return requireChannelFromAuthorizedSet({ row: root, communityId: args.communityId, channels });
      } catch {
        return null;
      }
    };
    const items: Array<{ kind: "post" | "reply"; createdAt: number; ref: string; channelSlug: string; channelName: string; snippet: string; thread: string | null }> = [];
    for (const root of roots) {
      const channel = readable(root) ? channelFor(root) : null;
      if (!channel) continue;
      items.push({ kind: "post", createdAt: root.createdAt, ref: buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: normalizeIdValue(root._id) }),
        channelSlug: channel.slug, channelName: channel.name, snippet: String(root.title ?? root.contentSummary ?? "").slice(0, SNIPPET_CHARS), thread: null });
    }
    for (const reply of replies) {
      if (!readable(reply)) continue;
      const root = await ctx.db.get(reply.rootId);
      const channel = readable(root) ? channelFor(root) : null;
      if (!channel || !interactionBelongsToChannel(reply, channel)) continue;
      items.push({ kind: "reply", createdAt: reply.createdAt, ref: buildCommunityInteractionEvidenceRef({ objectType: "reply", objectId: normalizeIdValue(reply._id) }),
        channelSlug: channel.slug, channelName: channel.name, snippet: String(reply.contentSummary ?? "").slice(0, SNIPPET_CHARS),
        thread: String((root as any).title ?? (root as any).contentSummary ?? "").slice(0, 80) || null });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    const page = items.slice(offset, offset + MEMBER_TIMELINE_PAGE);
    const hasMore = items.length > offset + MEMBER_TIMELINE_PAGE || roots.length >= window || replies.length >= window || privateRoomsCapped;
    const detail = await ctx.db.query("userProfileDetails").withIndex("by_user", (q) => q.eq("userId", member._id)).first();
    return {
      name: String((detail as any)?.displayName ?? member.displayName ?? member.handle ?? "Member").trim() || "Member",
      handle: typeof member.handle === "string" ? member.handle : null,
      offset,
      hasMore: hasMore && offset + MEMBER_TIMELINE_PAGE <= TIMELINE_MAX_OFFSET,
      items: page,
    };
  },
});
