import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { hashCommunityAppSessionToken, isCommunityAppWatchToken } from "../shared/communityAppSession";
import { parsePolynetSemanticRepositoryPath } from "../shared/polynetSemanticRepositoryContract";
import { parseCommunityChannelSemanticPath } from "../shared/communitySemanticRepository";

// Live updates for community front ends. A front end subscribes to `watch` for
// a channel path with its watch-only token and gets back a version that changes
// whenever anything in that channel changes (a post, reply, edit, deletion or
// reaction, or the channel itself). It then re-reads the channel through the
// door. The version carries no content, and access is re-checked on every run,
// so losing membership or channel access turns the subscription off live.

const unavailable = { ok: false as const, code: "watch_unavailable" as const };

export const watch = query({
  args: { token: v.string(), path: v.string() },
  handler: async (ctx, args) => {
    if (!isCommunityAppWatchToken(args.token)) return { ok: false as const, code: "session_invalid" as const };
    const watchTokenHash = await hashCommunityAppSessionToken(args.token);
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_watchTokenHash", (q) => q.eq("watchTokenHash", watchTokenHash))
      .first();
    if (!session || session.expiresAt <= Date.now()) return { ok: false as const, code: "session_invalid" as const };
    const domain = await ctx.db.get(session.domainId);
    if (!domain || domain.communityId !== session.communityId) return { ok: false as const, code: "session_invalid" as const };

    const parsed = parsePolynetSemanticRepositoryPath(args.path);
    if (!parsed.ok || parsed.kind !== "community") return unavailable;
    const channelPath = parseCommunityChannelSemanticPath(parsed.localPath);
    if (channelPath?.kind !== "directory") return unavailable;
    const community = await ctx.db.get(session.communityId);
    if (!community || community.slug !== parsed.communitySlug) return unavailable;
    const channel = await ctx.db
      .query("communityChannels")
      .withIndex("by_community_slug", (q) => q.eq("communityId", community._id).eq("slug", channelPath.slug))
      .first();
    if (!channel) return unavailable;

    // The same actor and channel check the door uses for this member.
    try {
      const actor = await resolveCommunityChannelActor({ ctx, communityId: community._id, userId: session.userId, kind: "human" });
      const capabilities = await getCommunityChannelCapabilities({ ctx, channel: channel as any, actor });
      if (!capabilities.canRead) return unavailable;
    } catch {
      return unavailable;
    }

    const latestRoot = await ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_channel_updatedAt", (q) => q.eq("channelId", channel._id))
      .order("desc")
      .first();
    const latestReply = await ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_channel_updatedAt", (q) => q.eq("channelId", channel._id))
      .order("desc")
      .first();
    return {
      ok: true as const,
      version: Math.max(channel.updatedAt, latestRoot?.updatedAt ?? 0, latestReply?.updatedAt ?? 0),
    };
  },
});
