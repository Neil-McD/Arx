import { query } from "./_generated/server";
import { v } from "convex/values";
import { communityMembershipRowIsActive, listActiveTestMemberUserIds, getUniqueCommunityMembershipByPair, normalizeIdValue, requireCommunityManager,
  resolvePublicUserId, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

// Pods: Classroom shows each invite-only room as a pod,
// with the faces of everyone who can see it. A read model over the existing
// channel policy and grants, never another access list:
// the owner, admins (they can open every room) and members with an exact,
// still-valid grant, plus the community agent when it has its own grant.

const MAX_PODS_PER_CALL = 12;
const MAX_GRANTS_READ = 200;
const MAX_MEMBERSHIPS_READ = 1000;
const MAX_FACES = 12;
const MAX_BUILDER_PODS = 100;

type PodPerson = {
  user_id: string;
  role: "owner" | "admin" | "member";
  profile: Awaited<ReturnType<typeof resolveUserProfileDisplayProjection>>;
  last_seen_at: number | null;
  active_until: number | null;
};

export const listPodPeople = query({
  args: {
    communityId: v.id("communities"),
    channelIds: v.array(v.id("communityChannels")),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const community = (await ctx.db.get(args.communityId))!;
    const channelIds = [...new Set(args.channelIds.map(String))].slice(0, MAX_PODS_PER_CALL);

    const loadAdmins = adminsReader(ctx, args.communityId, community.ownerId);
    const pods = [];
    for (const channelId of channelIds) {
      let channel;
      try {
        channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId, actor, capability: "canRead" });
      } catch {
        // A room the caller can't open is left out without saying why.
        continue;
      }
      if (channel.accessMode !== "restricted") continue;
      const { everyone, agent } = await podAudience(ctx, { community, channel, userId, loadAdmins });
      const people = [];
      // is_you lets the card say who else is here, not the viewer themselves.
      for (const entry of everyone.slice(0, MAX_FACES)) people.push({ ...(await podPerson(ctx, args.communityId, entry.id, entry.role)), is_you: String(entry.id) === String(userId) });
      pods.push({ channel_id: String(channel._id), people, people_count: everyone.length, agent });
    }
    return { pods };
  },
});

// Admins can see every pod, so they are read once per call.
function adminsReader(ctx: any, communityId: any, ownerId: any) {
  let admins: Array<{ userId: any }> | null = null;
  return async () => {
    if (admins) return admins;
    const rows = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(MAX_MEMBERSHIPS_READ);
    admins = rows.filter((row: any) => row.role === "admin" && communityMembershipRowIsActive(row) && row.userId !== ownerId);
    return admins!;
  };
}

// Everyone who can see a pod, invited members first, then admins, then the
// owner: the faces a member recognises as "their" pod lead the stack.
async function podAudience(ctx: any, args: { community: any; channel: any; userId: any; loadAdmins: () => Promise<Array<{ userId: any }>> }) {
  const { community, channel } = args;
  const roles = new Map<string, { id: any; role: PodPerson["role"] }>();
  roles.set(normalizeIdValue(community.ownerId), { id: community.ownerId, role: "owner" });
  for (const admin of await args.loadAdmins()) roles.set(normalizeIdValue(admin.userId), { id: admin.userId, role: "admin" });
  const grants = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id)).take(MAX_GRANTS_READ);
  let agent = false;
  for (const grant of grants) {
    if (grant.status !== "active" || grant.communityId !== community._id) continue;
    if (grant.principalKey === "community_agent") { agent = true; continue; }
    if (!grant.principalKey.startsWith("user:")) continue;
    const grantedUserId = grant.principalKey.slice("user:".length);
    if (roles.has(grantedUserId)) continue;
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: community._id, userId: grantedUserId });
    if (!membership || !communityMembershipRowIsActive(membership)
      || normalizeIdValue(grant.membershipId) !== normalizeIdValue(membership._id)
      || grant.membershipActivationSequence !== Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)))) continue;
    roles.set(grantedUserId, { id: membership.userId, role: membership.role === "admin" ? "admin" : "member" });
  }
  if (agent) {
    const agentActor = await resolveCommunityChannelActor({ ctx, communityId: community._id, userId: args.userId, kind: "community_agent" });
    agent = (await getCommunityChannelCapabilities({ ctx, channel, actor: agentActor })).canRead;
  }
  const order = { member: 0, admin: 1, owner: 2 } as const;
  return { everyone: [...roles.values()].sort((a, b) => order[a.role] - order[b.role]), agent };
}

async function podPerson(ctx: any, communityId: any, personId: any, role: PodPerson["role"]): Promise<PodPerson> {
  const presence = await ctx.db.query("communityPresence")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", personId)).first();
  return {
    user_id: (await resolvePublicUserId(ctx, personId)) ?? String(personId),
    role,
    profile: await resolveUserProfileDisplayProjection(ctx, personId),
    last_seen_at: presence?.lastSeenAt ?? null,
    active_until: presence?.activeUntil ?? null,
  };
}

// /builder/pods.json: every pod with who's in it, for the owner's agent. The
// user ids are the ones community.channel.participant.set takes.
export const listBuilderPods = query({
  args: { communityId: v.id("communities"), userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const channels = await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q) => q.eq("communityId", args.communityId).eq("accessMode", "restricted").eq("status", "active"))
      .take(MAX_BUILDER_PODS);
    const loadAdmins = adminsReader(ctx, args.communityId, community.ownerId);
    const pods = [];
    for (const channel of channels) {
      const { everyone, agent } = await podAudience(ctx, { community, channel, userId, loadAdmins });
      const people = [];
      for (const entry of everyone) {
        const profile = await resolveUserProfileDisplayProjection(ctx, entry.id);
        // role "member" was invited; the owner and admins see every pod anyway.
        people.push({ user_id: String(entry.id), name: profile.display_name, role: entry.role });
      }
      pods.push({ channel_id: String(channel._id), slug: channel.slug, name: channel.name, people, agent_in_pod: agent,
        pinned_root_id: channel.pinnedRootId ? String(channel.pinnedRootId) : null });
    }
    return {
      contract: "polynet.builder_pods.v1",
      guidance: "Pods are the invite-only channels, shown in Classroom with the faces of everyone who can see them. "
        + "Start one with community.channel.create (access_mode \"restricted\"); add or remove a member with "
        + "community.channel.participant.set (target { kind: \"member\", userId }) and the agent with target { kind: \"community_agent\" }. "
        + "Under its chat a pod shows its shelf: the pinned post (community.channel.pin) and every file and video posted in it, read from the pod's messages. "
        + "The owner and admins can see every pod. Where Classroom shows pods is the theme token pods_place "
        + "(\"aside\": top of the right column, \"header\": a faces button in the header, \"tab\": a Pods tab after Community): change it in /builder/theme.json with community.theme.save_draft, then community.theme.publish.",
      pods,
      truncated: channels.length === MAX_BUILDER_PODS,
    };
  },
});

// The pod's shelf, under its chat: every file and video shared in the pod,
// newest first. Read from the pod's own posts, so it holds nothing a reader
// couldn't already open in the chat; each item opens the post it came from.
const MAX_SHELF_ROOTS = 200;
const MAX_SHELF_ITEMS = 60;

type ShelfItem = {
  root_id: string;
  id: string;
  kind: "file" | "image" | "video";
  name: string;
  mime: string | null;
  size: number | null;
  image_url: string | null;
  provider: string | null;
  author_name: string | null;
  created_at: string;
};

export const listPodShelf = query({
  args: {
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canRead" });
    if (channel.accessMode !== "restricted") throw new Error("community_pod_not_found");
    return await readPodShelf(ctx, args.communityId, channel);
  },
});

async function readPodShelf(ctx: any, communityId: any, channel: any) {
  const roots = await ctx.db.query("communityInteractionRoots")
    .withIndex("by_channel_updatedAt", (q: any) => q.eq("channelId", channel._id)).order("desc").take(MAX_SHELF_ROOTS);
  const files: ShelfItem[] = [];
  const videos: ShelfItem[] = [];
  const names = new Map<string, string | null>();
  const authorName = async (root: any) => {
    if (root.actorType === "community_agent") return null;
    if (!root.actorUserId) return null;
    const key = String(root.actorUserId);
    if (!names.has(key)) names.set(key, (await resolveUserProfileDisplayProjection(ctx, root.actorUserId)).display_name ?? null);
    return names.get(key) ?? null;
  };
  for (const root of roots) {
    if (root.status !== "live" || root.communityId !== communityId) continue;
    const base = { root_id: String(root._id), created_at: new Date(root.createdAt).toISOString() };
    const attachments = await ctx.db.query("communityInteractionAttachments")
      .withIndex("by_root", (q: any) => q.eq("rootId", root._id)).take(20);
    for (const row of attachments) {
      if (row.status !== "uploaded" || row.replyId) continue;
      const video = row.attachmentKind === "video" || /^video\//.test(row.mimeType ?? "");
      (video ? videos : files).push({ ...base, id: String(row._id), kind: video ? "video" : row.attachmentKind,
        name: row.name, mime: row.mimeType ?? null, size: Math.max(0, Math.floor(Number(row.sizeBytes) || 0)),
        image_url: null, provider: null, author_name: await authorName(root) });
    }
    const embeds = await ctx.db.query("communityInteractionEmbeds")
      .withIndex("by_root", (q: any) => q.eq("rootId", root._id)).take(10);
    for (const embed of embeds) {
      if (embed.replyId || embed.status !== "ready" || embed.previewKind !== "video") continue;
      videos.push({ ...base, id: String(embed._id), kind: "video", name: embed.title ?? embed.sourceUrl ?? "Video",
        mime: null, size: null, image_url: embed.imageUrl ?? null, provider: embed.provider ?? null, author_name: await authorName(root) });
    }
  }
  return {
    pinned_root_id: channel.pinnedRootId ? String(channel.pinnedRootId) : null,
    files: files.slice(0, MAX_SHELF_ITEMS),
    videos: videos.slice(0, MAX_SHELF_ITEMS),
    truncated: roots.length === MAX_SHELF_ROOTS,
  };
}

// A member's guide channel (their membership's serviceChannelId) is invite-only
// too, so it would otherwise show as a pod. The member sees their own first;
// the owner and admins, who can open every member's, don't get one pod per
// member in Your pods.
export const listPodSpaces = query({
  args: { communityId: v.id("communities"), userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    // Pods are private: only members of the community
    // get an answer, and only the owner and admins learn other members'
    // personal pods.
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const rows = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(MAX_MEMBERSHIPS_READ);
    let mine: string | null = null;
    const others: string[] = [];
    // Test members' own pods stay out of the owner's lists (they open from the test run).
    const testUserIds = await listActiveTestMemberUserIds(ctx, args.communityId, { includeEnded: true });
    const tests: string[] = [];
    for (const row of rows) {
      if (!row.serviceChannelId) continue;
      if (row.userId === userId) { if (communityMembershipRowIsActive(row)) mine = String(row.serviceChannelId); }
      else if (actor.isManager) {
        others.push(String(row.serviceChannelId));
        if (testUserIds.has(String(row.userId))) tests.push(String(row.serviceChannelId));
      }
    }
    return { mine, member_spaces: others, test_spaces: tests };
  },
});
