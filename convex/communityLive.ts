import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { hashCommunityAppSessionToken, isCommunityAppWatchToken } from "../shared/communityAppSession";
import { parsePolynetSemanticRepositoryPath } from "../shared/polynetSemanticRepositoryContract";
import { POLYNET_PRESENCE_DOCUMENT_PATH, parseCommunityChannelSemanticPath } from "../shared/communitySemanticRepository";
import { requireCommunityChatAccess } from "./communityCore";
import { resolveAuthorizedCommunityPresenceWindow } from "./communityPresenceCore";
import { resolveCommunityTypingPresence } from "./communityTypingPresenceCore";
import { communityAppMemberRole } from "./communityApps";
import { readDirectMessageLiveSignalForUser } from "./directMessages";

// Live updates for community front ends. A front end subscribes to `watch` for
// a channel path with its watch-only token and gets back a version that changes
// whenever anything in that channel changes (a post, reply, edit, deletion or
// reaction, or the channel itself). It then re-reads the channel through the
// door. The version carries no content, and access is re-checked on every run,
// so losing membership or channel access turns the subscription off live.
// A channel watch also says who else is typing there (expires_in_ms counts down
// from this run, so the front end can drop a lease nobody renewed). Watching
// presence.json gets a version that changes when the set of members online
// changes; the front end then re-reads presence.json.

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
    const community = await ctx.db.get(session.communityId);
    if (!community || community.slug !== parsed.communitySlug) return unavailable;
    if (parsed.localPath === POLYNET_PRESENCE_DOCUMENT_PATH) {
      try {
        await requireCommunityChatAccess({ ctx, communityId: community._id, userId: session.userId });
      } catch {
        return unavailable;
      }
      const online = await resolveAuthorizedCommunityPresenceWindow(ctx, community);
      return { ok: true as const, version: online.entries.map((entry) => String(entry.userId)).sort().join(",") };
    }
    const channelPath = parseCommunityChannelSemanticPath(parsed.localPath);
    if (channelPath?.kind !== "directory") return unavailable;
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
    let typing: Array<{ ref: string; name: string | null; avatar_url: string | null; thread_ref: string | null; lease_until: number; expires_in_ms: number }> = [];
    try {
      const nowMs = Date.now();
      const presence = await resolveCommunityTypingPresence({ ctx, community, channelId: channel._id, viewerUserId: session.userId });
      typing = presence.users.map((user) => ({
        ref: `user:${user.canonical_user_id}`, name: user.display_name, avatar_url: user.avatar_url,
        thread_ref: user.root_id ? `interaction:root:${user.root_id}` : null,
        // The absolute deadline changes on every renewal, so a steady typist's
        // renewals are new results and reach the front end.
        lease_until: user.display_until_ms,
        expires_in_ms: Math.max(0, user.display_until_ms - nowMs),
      }));
    } catch {
      // Typing is a nicety; the channel's version still drives re-reads.
    }
    return {
      ok: true as const,
      version: Math.max(channel.updatedAt, latestRoot?.updatedAt ?? 0, latestReply?.updatedAt ?? 0),
      typing,
    };
  },
});

// Live updates for the member's Messages page on a site's private twin. Only a
// watch token derived from a private session (minted on a private twin origin
// that is still one) gets an answer, and only while the member is still in the
// community the session belongs to: a site's own session, whose token the
// site's code holds, is refused. No conversation: a version for the member's
// inbox. A conversation: its version, while the member takes part in it, and
// whether the other person is typing. Never content, names or ids: the page
// re-reads through its private routes when the version moves.
const messagesUnavailable = { ok: false as const, code: "watch_unavailable" as const };

export const watchMessages = query({
  args: { token: v.string(), conversation: v.optional(v.string()) },
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
    if (session.kind !== "private" || domain.kind !== "private") return { ok: false as const, code: "private_session_required" as const };
    const community = await ctx.db.get(session.communityId);
    if (!(await communityAppMemberRole(ctx, community, session.userId))) return messagesUnavailable;
    try {
      const signal = await readDirectMessageLiveSignalForUser(ctx, session.userId, args.conversation ?? null);
      return { ok: true as const, version: signal.version, typing: signal.typing };
    } catch {
      // Not the member's conversation (or no such one): nothing to say about it.
      return messagesUnavailable;
    }
  },
});
