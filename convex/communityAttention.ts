import { communityWideEvents } from "./communityEventAudience";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { resolveMentionRecipientSource } from "./communityNotificationAccess";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  type CommunityMemberSettingsLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  advanceCommunityChatReadCursor,
  normalizeCommunityReadPosition,
  readCommunityChannelReadState,
  readCommunityChatReadState,
} from "./communityReadCursorCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import { homeTagLines, type HomeTag } from "../shared/communityHomeTags";
import {
  type CommunityChannelLike,
  listChannelReadableRows,
  listAuthorizedCommunityChannels,
  listAuthorizedCommunityChannelPage,
  resolveAuthorizedCommunityChannel,
  resolveRequestedCommunityChannel,
} from "./communityChannelCore";
import { resolveCommunityChannelActor, type ChannelActor } from "./communityChannelAccess";
import { isInPod, podRecord } from "./communityPods";
import { canManageCommunityResources } from "./communityResourceShared";

type CommunityAttentionSurface = "chat" | "resources" | "events" | "mentions";

type CommunityAttentionRow = {
  community_id: string;
  chat: boolean;
  resources: boolean;
  events: boolean;
  // Someone tagged this user and they have not seen it yet. Rides the chat
  // surface visually (accent dot) but has its own marker so a mention ping is
  // distinguishable from ordinary chatter.
  mentions: boolean;
  chat_last_seen_at: number | null;
  channels: CommunityChannelAttentionRow[];
};

type CommunityChannelAttentionRow = {
  channel_id: string | null;
  channel_slug: string;
  chat: boolean;
  mentions: boolean;
  chat_last_seen_at: number | null;
  latest_activity_at: number | null;
};

type CommunityInteractionRootLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  actorType?: string;
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  lastReplyAt?: number;
  createdAt: number;
};

type CommunityInteractionReplyLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  actorType?: string;
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  createdAt: number;
};

type CommunityEventLike = {
  _id: any;
  communityId: any;
  status: "live" | "cancelled";
  updatedAt: number;
};

const MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES = 50;
const MAX_COMMUNITY_ATTENTION_RECENT_PUBLISHED_COURSES = 5;
const MAX_COMMUNITY_ATTENTION_LESSONS_PER_PUBLISHED_COURSE = 20;

function normalizePositiveMarker(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

async function getCommunityMemberSettingsRow(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<CommunityMemberSettingsLike | null> {
  return (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .first()) as CommunityMemberSettingsLike | null;
}

async function getLatestCommunityChannelChatActivityAt(
  ctx: any,
  communityId: any,
  channel: CommunityChannelLike,
  actor?: ChannelActor,
): Promise<number | null> {
  const [roots, replies] =
    await Promise.all([
      listChannelReadableRows<CommunityInteractionRootLike>({
        ctx,
        actor,
        tableName: "communityInteractionRoots",
        communityId,
        channel,
        limit: 1,
      }),
      listChannelReadableRows<CommunityInteractionReplyLike>({
        ctx,
        actor,
        tableName: "communityInteractionReplies",
        communityId,
        channel,
        limit: 1,
      }),
    ]);
  const latestRoot = roots[0] ?? null;
  const latestReply = replies[0] ?? null;
  const markers = [
    normalizePositiveMarker(latestRoot?.createdAt),
    normalizePositiveMarker(latestRoot?.lastReplyAt),
    normalizePositiveMarker(latestReply?.createdAt),
  ].filter((value): value is number => value !== null);
  return markers.length > 0 ? Math.max(...markers) : null;
}

// How far back a room's dot looks past the viewer's own messages for someone
// else's. Someone who has just posted this many times in a row was in the room.
const OTHERS_ACTIVITY_SCAN_LIMIT = 10;

// A room's newest activity, and its newest activity by someone other than the
// viewer: your own message never lights your own dot.
async function getCommunityChannelActivityMarkers(
  ctx: any,
  communityId: any,
  channel: CommunityChannelLike,
  actor: ChannelActor,
  viewerUserId: any,
): Promise<{ latestAt: number | null; latestFromOthersAt: number | null }> {
  const [roots, replies] = await Promise.all([
    listChannelReadableRows<CommunityInteractionRootLike>({
      ctx, actor, tableName: "communityInteractionRoots", communityId, channel, limit: OTHERS_ACTIVITY_SCAN_LIMIT,
    }),
    listChannelReadableRows<CommunityInteractionReplyLike>({
      ctx, actor, tableName: "communityInteractionReplies", communityId, channel, limit: OTHERS_ACTIVITY_SCAN_LIMIT,
    }),
  ]);
  const viewerKey = normalizeIdValue(viewerUserId);
  const own = (row: { actorType?: string; actorUserId?: any }) =>
    row.actorType === "human" && Boolean(viewerKey) && normalizeIdValue(row.actorUserId) === viewerKey;
  const newest = (values: Array<number | null>) => {
    const markers = values.filter((value): value is number => value !== null);
    return markers.length > 0 ? Math.max(...markers) : null;
  };
  return {
    latestAt: newest([
      normalizePositiveMarker(roots[0]?.createdAt),
      normalizePositiveMarker(roots[0]?.lastReplyAt),
      normalizePositiveMarker(replies[0]?.createdAt),
    ]),
    // Replies are read from the room itself, so a root's lastReplyAt (which
    // may be the viewer's own reply) is not needed here.
    latestFromOthersAt: newest([
      normalizePositiveMarker(roots.find((row) => !own(row))?.createdAt),
      normalizePositiveMarker(replies.find((row) => !own(row))?.createdAt),
    ]),
  };
}

// A pod's plain activity is for the people in it. Builders and admins can
// open every pod, but its quiet dot is only for the pods they are in (a tag
// still reaches them anywhere they can read).
async function viewerGetsRoomChatDot(
  ctx: any,
  communityId: any,
  channel: CommunityChannelLike,
  actor: ChannelActor,
  userId: any,
): Promise<boolean> {
  if (channel.accessMode !== "restricted" || !actor.isManager) return true;
  // The viewer's own grant, read directly: the pod's member list is capped,
  // so in a large pod theirs could fall outside it.
  const own = (await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id).eq("principalKey", actor.principalKey)).collect())
    .filter((row: any) => row.status === "active");
  return isInPod(own, await podRecord(ctx, communityId, channel._id), actor, userId);
}

async function getLatestCommunityChatActivityAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const generalChannel = await resolveRequestedCommunityChannel({
    ctx,
    communityId,
  });
  return await getLatestCommunityChannelChatActivityAt(
    ctx,
    communityId,
    generalChannel,
  );
}

// Knowledge's newest moment: when the newest lesson a member can see became
// visible to members. That is the later of the lesson's creation and its
// course's publishing, so a course written as a draft and published today is
// new today, and editing a lesson's words (or renaming or reordering a
// course) is not news. Reads stay bounded: the newest lessons by creation,
// and the few most recently published courses by their own index.
async function getLatestCommunityKnowledgeVisibleAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const recentRows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES)) as CommunityResourceLike[];
  const referencedModuleIds = Array.from(
    new Map(
      recentRows.flatMap((row) => {
        const moduleId = normalizeIdValue(row.moduleId);
        return moduleId ? [[moduleId, row.moduleId] as const] : [];
      }),
    ).values(),
  );
  const modules = (await Promise.all(
    referencedModuleIds.map(async (moduleId) =>
      await ctx.db.get(moduleId as any) as CommunityResourceModuleLike | null,
    ),
  )).filter(
    (module): module is CommunityResourceModuleLike =>
      module !== null && normalizeIdValue(module.communityId) === normalizeIdValue(communityId),
  );
  const liveModules = new Map(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => [String(module._id), module] as const),
  );
  const liveModuleIds = new Set(liveModules.keys());
  let latest = 0;
  for (const row of recentRows) {
    if (!communityResourceIsLiveModulePage(row, liveModuleIds)) continue;
    const publishedAt = normalizePositiveMarker(liveModules.get(String(row.moduleId))?.publishedAt) ?? 0;
    latest = Math.max(latest, normalizePositiveMarker(row.createdAt) ?? 0, publishedAt);
  }
  // A course published after its lessons were written: its lessons may be
  // older than the window above, so the newest published courses are read
  // directly. One counts only when it has a lesson a member can see.
  const recentlyPublished = (await ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community_publishedAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(MAX_COMMUNITY_ATTENTION_RECENT_PUBLISHED_COURSES)) as CommunityResourceModuleLike[];
  for (const module of recentlyPublished) {
    const publishedAt = normalizePositiveMarker(module.publishedAt);
    if (publishedAt === null || publishedAt <= latest || !communityResourceModuleIsLive(module)) continue;
    const lessons = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id))
      .take(MAX_COMMUNITY_ATTENTION_LESSONS_PER_PUBLISHED_COURSE)) as CommunityResourceLike[];
    const thisCourse = new Set([String(module._id)]);
    if (lessons.some((row) => communityResourceIsLiveModulePage(row, thisCourse))) latest = publishedAt;
  }
  return latest > 0 ? latest : null;
}

async function getLatestCommunityEventsUpdatedAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const latest = (await ctx.db
    .query("communityEvents" as any)
    .withIndex("by_community_status_updatedAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live"),
    )
    .order("desc")
    .take(20)) as CommunityEventLike[];
  // A pod's call changing isn't news for the whole community.
  const updatedAt = communityWideEvents(latest)[0]?.updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt > 0
    ? Math.floor(updatedAt)
    : null;
}

const MENTION_SOURCE_SCAN_LIMIT = 5;

async function latestReadableMentionAt(ctx: any, userId: any, mentions: Array<Record<string, any>>): Promise<number> {
  for (const mention of mentions) {
    if (await resolveMentionRecipientSource({ ctx, mention, userId })) return mention.createdAt;
  }
  return 0;
}

async function getLatestCommunityMentionOfUserCreatedAt(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<number | null> {
  let latestCreatedAt: number | null = null;
  for (const notifyState of ["pending", "sent", "read"] as const) {
    const latest = (await ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_mentionedUser_community_notifyState_createdAt", (q: any) =>
        q.eq("mentionedUserId", userId).eq("communityId", communityId).eq("notifyState", notifyState),
      )
      .order("desc")
      .take(MENTION_SOURCE_SCAN_LIMIT)) as Array<Record<string, any>>;
    const createdAt = await latestReadableMentionAt(ctx, userId, latest);
    if (typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0) {
      latestCreatedAt = Math.max(latestCreatedAt ?? 0, Math.floor(createdAt));
    }
  }
  return latestCreatedAt;
}

function communityAttentionChannelKey(channel: CommunityChannelLike): string {
  return normalizeIdValue(channel._id) || "general";
}

async function getLatestCommunityMentionsByChannel(args: {
  ctx: any;
  communityId: any;
  userId: any;
  channels: CommunityChannelLike[];
}): Promise<Map<string, number>> {
  const latestByChannel = new Map<string, number>();
  for (const channel of args.channels) {
    const channelIds = Array.from(
      new Set(
        channel.systemRole === "general"
          ? [channel._id, undefined]
          : [channel._id],
      ),
    );
    const batches = await Promise.all(
      channelIds.flatMap((channelId) =>
        (["pending", "sent", "read"] as const).map(
          async (notifyState) =>
            (await args.ctx.db
              .query("communityInteractionMentions" as any)
              .withIndex(
                "by_mentionedUser_community_channel_notifyState_createdAt",
                (q: any) =>
                  q
                    .eq("mentionedUserId", args.userId)
                    .eq("communityId", args.communityId)
                    .eq("channelId", channelId)
                    .eq("notifyState", notifyState),
              )
              .order("desc")
              .take(MENTION_SOURCE_SCAN_LIMIT)) as Array<Record<string, any>>,
        ),
      ),
    );
    const latestCreatedAt = Math.max(
      0,
      ...await Promise.all(batches.map(mentions => latestReadableMentionAt(args.ctx, args.userId, mentions))),
    );
    if (latestCreatedAt > 0) {
      latestByChannel.set(
        communityAttentionChannelKey(channel),
        latestCreatedAt,
      );
    }
  }
  return latestByChannel;
}

async function getCommunityAttentionRow(
  ctx: any,
  communityId: any,
  userId: any,
  selectedChannels?: CommunityChannelLike[],
): Promise<CommunityAttentionRow> {
  const settingsRow = await getCommunityMemberSettingsRow(ctx, communityId, userId);
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  const channels = selectedChannels ?? await listAuthorizedCommunityChannels({ ctx, communityId, actor });
  // Anyone who can edit courses never gets the Knowledge dot: what is new
  // there is their own (or their co-hosts') work, and they see drafts anyway.
  const editsCourses = await canManageCommunityResources({ ctx, communityId, userId });
  const [
    channelAttentionInputs,
    latestMentionsByChannel,
    latestKnowledgeVisibleAt,
    latestEventsUpdatedAt,
  ] = await Promise.all([
    Promise.all(
      channels.map(async (channel) => ({
        channel,
        readState: await readCommunityChatReadState(
          ctx,
          communityId,
          userId,
          channel._id,
        ),
        activity: await getCommunityChannelActivityMarkers(
          ctx,
          communityId,
          channel,
          actor,
          userId,
        ),
        chatDot: await viewerGetsRoomChatDot(ctx, communityId, channel, actor, userId),
      })),
    ),
    getLatestCommunityMentionsByChannel({
      ctx,
      communityId,
      userId,
      channels,
    }),
    editsCourses ? null : getLatestCommunityKnowledgeVisibleAt(ctx, communityId),
    getLatestCommunityEventsUpdatedAt(ctx, communityId),
  ]);
  const channelRows: CommunityChannelAttentionRow[] = channelAttentionInputs.map(
    ({ channel, readState, activity, chatDot }) => {
      const latestMentionAt = latestMentionsByChannel.get(
        communityAttentionChannelKey(channel),
      );
      const latestActivityAt = activity.latestAt;
      return {
        channel_id: normalizeIdValue(channel._id) || null,
        channel_slug: channel.slug,
        chat:
          chatDot &&
          typeof activity.latestFromOthersAt === "number" &&
          activity.latestFromOthersAt > readState.chatSeenThroughAt,
        mentions:
          typeof latestMentionAt === "number" &&
          latestMentionAt > readState.mentionSeenThroughAt,
        chat_last_seen_at:
          readState.chatSeenThroughAt > 0
            ? readState.chatSeenThroughAt
            : null,
        latest_activity_at: latestActivityAt,
      };
    },
  );
  const generalRow = channelRows.find(
    (row) => row.channel_slug === "general",
  );
  return {
    community_id: String(communityId),
    chat: channelRows.some((row) => row.chat),
    resources:
      typeof latestKnowledgeVisibleAt === "number" &&
      latestKnowledgeVisibleAt > Math.max(0, Math.floor(settingsRow?.resourcesLastSeenAt ?? 0)),
    events:
      typeof latestEventsUpdatedAt === "number" &&
      latestEventsUpdatedAt > Math.max(0, Math.floor(settingsRow?.eventsLastSeenAt ?? 0)),
    mentions: channelRows.some((row) => row.mentions),
    // Rolling clients still render one General divider. The channel array is
    // the canonical projection for the forthcoming channel navigation.
    chat_last_seen_at: generalRow?.chat_last_seen_at ?? null,
    channels: channelRows,
  };
}

async function upsertCommunitySurfaceSeen(args: {
  ctx: any;
  communityId: any;
  userId: any;
  surface: CommunityAttentionSurface;
  nowMs: number;
  seenAtMs?: number | null;
}): Promise<void> {
  const { ctx, communityId, userId, surface, nowMs } = args;

  if (surface === "chat") {
    const latestChatActivityAt = await getLatestCommunityChatActivityAt(ctx, communityId);
    if (latestChatActivityAt === null) return;
    await advanceCommunityChatReadCursor({
      ctx,
      communityId,
      userId,
      requestedThroughAt: args.seenAtMs ?? latestChatActivityAt,
      latestReadableAt: latestChatActivityAt,
      // Chat acknowledgement metadata is server-authored even when this
      // rolling-compatibility adapter receives a client-authored nowMs.
      nowMs: Date.now(),
    });
    return;
  }

  const existing = await getCommunityMemberSettingsRow(ctx, communityId, userId);

  if (surface === "mentions") {
    const latestMentionCreatedAt = await getLatestCommunityMentionOfUserCreatedAt(ctx, communityId, userId);
    if (latestMentionCreatedAt === null) return;
    if ((existing?.mentionsLastSeenAt ?? 0) >= latestMentionCreatedAt) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        mentionsLastSeenAt: latestMentionCreatedAt,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      mentionsLastSeenAt: latestMentionCreatedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }

  if (surface === "resources") {
    const latestKnowledgeVisibleAt = await getLatestCommunityKnowledgeVisibleAt(ctx, communityId);
    if (latestKnowledgeVisibleAt === null) return;
    if ((existing?.resourcesLastSeenAt ?? 0) >= latestKnowledgeVisibleAt) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        resourcesLastSeenAt: latestKnowledgeVisibleAt,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      resourcesLastSeenAt: latestKnowledgeVisibleAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }

  const latestEventsUpdatedAt = await getLatestCommunityEventsUpdatedAt(ctx, communityId);
  if (latestEventsUpdatedAt === null) return;
  const requestedEventsSeenAt = normalizePositiveMarker(args.seenAtMs);
  if (requestedEventsSeenAt === null) return;
  const nextEventsLastSeenAt = Math.min(latestEventsUpdatedAt, requestedEventsSeenAt);
  if ((existing?.eventsLastSeenAt ?? 0) >= nextEventsLastSeenAt) return;
  if (existing) {
    await ctx.db.patch(existing._id as any, {
      eventsLastSeenAt: nextEventsLastSeenAt,
      updatedAt: nowMs,
    });
    return;
  }
  await ctx.db.insert("communityMemberSettings" as any, {
    communityId,
    userId,
    muted: false,
    eventsLastSeenAt: nextEventsLastSeenAt,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function acknowledgeCommunityChatReadForUser(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  userId: any;
  requestedThroughAt?: number | null;
}): Promise<{ ok: true; advanced: boolean; seenThroughAt: number }> {
  const actor = await resolveCommunityChannelActor(args);
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx,
    actor, capability: "canRead",
    communityId: args.communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
  });
  const latestReadableAt = await getLatestCommunityChannelChatActivityAt(
    args.ctx,
    args.communityId,
    channel,
    actor,
  );
  const result = await advanceCommunityChatReadCursor({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: channel._id,
    userId: args.userId,
    requestedThroughAt: args.requestedThroughAt ?? latestReadableAt,
    latestReadableAt,
  });
  return {
    ok: true,
    advanced: result.advanced,
    seenThroughAt: result.seenThroughAt,
  };
}

export const listMyCommunityAttentionPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"),
    section: v.union(v.literal("shared"), v.literal("private")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    // Attention has several indexed reads per room, so use smaller pages than
    // a plain directory listing. No read cursor is mutated by this query.
    const result = await listAuthorizedCommunityChannelPage({ ctx, communityId: args.communityId, actor,
      section: args.section, paginationOpts: { ...args.paginationOpts, numItems: Math.min(10, args.paginationOpts.numItems) } });
    const attention = await getCommunityAttentionRow(ctx, args.communityId, userId, result.page);
    return { ...result, page: attention.channels, attention };
  },
});

// How many of the newest tags of you Home looks through. Tags are indexed by
// who was tagged, so this never reads the community's posts.
const HOME_TAGS_SCAN_LIMIT = 40;

// Home's tag lines (shared/communityHomeTags.ts): every tag of this person in
// this community they haven't seen, by the dots' own rule. A tag counts only
// while its post is up and its room is one they can still read
// (resolveMentionRecipientSource), and stays until their read position in
// that room passes it. Read live, so a line comes and goes with the dot.
export const listMyHomeTags = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    // Suppressed tags are left out by the index itself, as the dots' are.
    const rows = (await Promise.all((["pending", "sent", "read"] as const).map(async (notifyState) =>
      (await ctx.db
        .query("communityInteractionMentions" as any)
        .withIndex("by_mentionedUser_community_notifyState_createdAt", (q: any) =>
          q.eq("mentionedUserId", userId).eq("communityId", args.communityId).eq("notifyState", notifyState))
        .order("desc")
        .take(HOME_TAGS_SCAN_LIMIT)) as Array<Record<string, any>>)))
      .flat()
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, HOME_TAGS_SCAN_LIMIT);
    // A room's read position, by the room the tag names: most tags are already
    // seen, and this skips them before their post is looked up.
    const positions = new Map<string, number>();
    const positionOf = async (channel: CommunityChannelLike) => {
      const key = normalizeIdValue(channel._id) || "general";
      if (!positions.has(key)) {
        positions.set(key, (await readCommunityChannelReadState(ctx, args.communityId, userId, channel)).mentionSeenThroughAt);
      }
      return positions.get(key)!;
    };
    const names = new Map<string, string>();
    const nameOf = async (authorId: any) => {
      const key = normalizeIdValue(authorId);
      if (!key) return "Someone";
      if (!names.has(key)) {
        const identity = await readCanonicalUserIdentityProjection(ctx, authorId).catch(() => null);
        names.set(key, identity?.displayName || (identity?.handle ? `@${identity.handle}` : "Someone"));
      }
      return names.get(key)!;
    };
    const viewerKey = normalizeIdValue(userId);
    const tags: HomeTag[] = [];
    for (const mention of rows) {
      if (mention.mentionKind !== "user" || mention.notifyState === "suppressed") continue;
      const createdAt = normalizeCommunityReadPosition(mention.createdAt);
      if (mention.channelId) {
        const known = positions.get(normalizeIdValue(mention.channelId));
        if (known !== undefined && createdAt <= known) continue;
      }
      const resolved = await resolveMentionRecipientSource({ ctx, mention, userId });
      if (!resolved) continue;
      const { channel, source } = resolved as { channel: CommunityChannelLike & { name?: string }; source: any };
      if (createdAt <= await positionOf(channel)) continue;
      // Your own message never tags you.
      if (normalizeIdValue(source.row.actorUserId) === viewerKey) continue;
      tags.push({
        id: normalizeIdValue(mention._id),
        author: source.row.actorUserId ? await nameOf(source.row.actorUserId) : "The guide",
        everybody: Boolean(mention.sourceBroadcastId),
        room: String(channel.name ?? channel.slug ?? "General"),
        isPod: channel.accessMode === "restricted",
        channelSlug: String(channel.slug ?? "general"),
        rootId: normalizeIdValue(source.root._id),
        text: String(source.row.contentSummary || source.row.title || ""),
        createdAt,
      });
    }
    return homeTagLines(tags);
  },
});

export const markCommunitySurfaceSeen = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    surface: v.union(v.literal("chat"), v.literal("resources"), v.literal("events"), v.literal("mentions")),
    seenAtMs: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    await upsertCommunitySurfaceSeen({
      ctx,
      communityId: args.communityId,
      userId,
      surface: args.surface,
      seenAtMs: args.seenAtMs ?? null,
      nowMs: args.nowMs ?? Date.now(),
    });
    return { ok: true };
  },
});

// Canonical chat acknowledgement: the client supplies the newest server-issued
// position it actually rendered while caught up. Access is re-authorized and
// the position is clamped to the current readable head before it can advance.
export const acknowledgeCommunityChatRead = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    throughAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return await acknowledgeCommunityChatReadForUser({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId,
      requestedThroughAt: args.throughAtMs,
    });
  },
});

// Community sites: the trusted member's attention for the channels on one
// listing page (by slug), read only. Rows match a listing by channel id, or by
// slug for a General that has no stored row yet.
export const listCommunityChannelAttentionForUserInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelSlugs: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const channels: CommunityChannelLike[] = [];
    for (const channelSlug of new Set(args.channelSlugs.slice(0, 100))) {
      try {
        channels.push(await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelSlug, actor, capability: "canRead" }));
      } catch {
        // A channel the member can no longer read simply has no attention.
      }
    }
    return (await getCommunityAttentionRow(ctx, args.communityId, args.userId, channels)).channels;
  },
});

// Community sites: mark one channel (by slug) read for the trusted member,
// through the same clamped acknowledgement Studio uses.
export const markCommunityChannelReadForUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelSlug: v.string(), throughAtMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId,
      channelSlug: args.channelSlug, actor, capability: "canRead" });
    return await acknowledgeCommunityChatReadForUser({ ctx, communityId: args.communityId,
      channelId: channel._id ?? null, userId: args.userId, requestedThroughAt: args.throughAtMs ?? null });
  },
});
