// Pods (docs/specs/pods-v0.md, slices 1 and 2a). A pod is an invite-only room
// (communityChannels, restricted) plus communityPods: what it is for, listed
// or hidden, seats, and its hosts. Who may see inside a pod is the room's own
// access check. A listed pod shows members who aren't in it only its outside:
// what it is for, its hosts and seats left, never who is in it or what is said.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannelPage } from "./communityChannelCore";
import { seatReasons, setChannelParticipantCore } from "./communityChannelParticipants";
import { assertUnclaimedPublicImageStorageId, normalizeIdValue, requireCommunityChatAccess, requireCommunityManager, resolvePublicUserId } from "./communityCore";
import { readCachedUserDisplayName as displayName } from "./profileCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { notesByUpdated, podScopeKey } from "./communityNotesStore";
import { podPaymentStateOf, podPriceOf } from "./communityPodPayments";
import { nextPodCall } from "./communityEvents";
import { buildPlanNamesByPodMap, canChangePlanHere, plansIncludingPod } from "./communityPlanChange";

const PODS_CAP = 50;
// Covers SEATS_MAX (500) + community_agent + buffer, querying active seats directly.
const MEMBERS_CAP = 505;
const REQUESTS_CAP = 100;
const PURPOSE_MAX = 280;
const SEATS_MAX = 500;
const WHAT_YOU_GET_LINES = 4;
const WHAT_YOU_GET_MAX = 80;
export const POD_ABOUT_MAX = 1500;

// A pod's About: paragraphs kept, runs of spaces and blank lines folded.
export function cleanPodAbout(raw: string): string {
  return String(raw ?? "").replace(/\r/g, "").split(/\n{2,}/).map((part) => part.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean).join("\n\n").slice(0, POD_ABOUT_MAX).trim();
}

function focusOf(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

function zoomOf(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(2.5, Math.max(1, n)) : 1;
}

// A pod's cover, as the outside page and the cards draw it.
async function podCover(ctx: Ctx, record: any): Promise<{ url: string; focus_x: number; focus_y: number; zoom: number } | null> {
  if (!record?.bannerStorageId) return null;
  const url = await ctx.storage.getUrl(record.bannerStorageId);
  return url
    ? {
        url,
        focus_x: focusOf(record.bannerFocusX),
        focus_y: focusOf(record.bannerFocusY),
        zoom: zoomOf(record.bannerZoom),
      }
    : null;
}

function cleanWhatYouGet(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\s+/g, " ").trim().slice(0, WHAT_YOU_GET_MAX)).filter(Boolean).slice(0, WHAT_YOU_GET_LINES);
}

async function paymentRows(ctx: Ctx, channelId: any, userId: any) {
  return await ctx.db.query("communityPodPayments")
    .withIndex("by_channel_user", (q: any) => q.eq("channelId", channelId).eq("userId", userId)).collect();
}

type Ctx = any;

async function viewerOf(ctx: Ctx, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  return { userId, actor };
}

// The most a pod's page counts of what the pod knows.
const POD_KNOWS_CAP = 99;

export async function podRecord(ctx: Ctx, communityId: any, channelId: any) {
  return await ctx.db.query("communityPods")
    .withIndex("by_community_channel", (q: any) => q.eq("communityId", communityId).eq("channelId", channelId)).first();
}

export async function memberGrants(ctx: Ctx, channelId: any) {
  return (await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_status", (q: any) => q.eq("channelId", channelId).eq("status", "active"))
    .take(MEMBERS_CAP))
    .filter((row: any) => String(row.principalKey).startsWith("user:"));
}

async function viewerHasPodSeat(ctx: Ctx, channelId: any, principalKey: string): Promise<boolean> {
  const row = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channelId).eq("principalKey", principalKey))
    .first();
  return row?.status === "active";
}

const userIdOf = (principalKey: string) => principalKey.slice("user:".length);

async function activePodRoom(ctx: Ctx, communityId: any, channelId: any) {
  const channel = await ctx.db.get(channelId);
  if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId)
    || channel.accessMode !== "restricted" || channel.status !== "active") throw new Error("community_pod_not_found");
  return channel;
}

export function isHost(record: any, userId: any): boolean {
  return Boolean(record?.hostUserIds?.some((id: any) => String(id) === String(userId)));
}

// "In the pod": added to it (an active grant) or one of its hosts. Builders
// and admins can open every pod, but they are only in the ones this says.
// The Pods page's own pods and the pod dots both read it.
export function isInPod(grants: any[], record: any, actor: { principalKey: string }, userId: any): boolean {
  return grants.some((row: any) => row.principalKey === actor.principalKey) || isHost(record, userId);
}

// Strip a user from hostUserIds on one pod (when their pod seat is revoked) or
// every pod in a community (when they leave or are removed/banned).
export async function removeUserFromPodHosts(
  ctx: Ctx,
  args: { communityId: any; userId: any; channelId?: any },
): Promise<void> {
  const target = String(args.userId);
  const nowMs = Date.now();
  const records = args.channelId
    ? [await podRecord(ctx, args.communityId, args.channelId)].filter(Boolean)
    : await ctx.db
        .query("communityPods")
        .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId))
        .take(PODS_CAP);
  for (const record of records) {
    const existing: any[] = record?.hostUserIds ?? [];
    if (!existing.some((id: any) => String(id) === target)) continue;
    const hostUserIds = existing.filter((id: any) => String(id) !== target);
    await ctx.db.patch(record._id, { hostUserIds, updatedAt: nowMs });
  }
}

// Builders and admins manage every pod; a pod's hosts manage theirs only while
// they still have active access to that pod room.
async function requirePodManager(ctx: Ctx, authSubject: string | undefined, communityId: any, channelId: any) {
  const { userId, actor } = await viewerOf(ctx, authSubject, communityId);
  const channel = await activePodRoom(ctx, communityId, channelId);
  const record = await podRecord(ctx, communityId, channelId);
  if (actor.isManager) return { userId, actor, channel, record };
  if (!isHost(record, userId)) throw new Error("community_pod_manager_required");
  if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) {
    throw new Error("community_pod_manager_required");
  }
  return { userId, actor, channel, record };
}

export function podVisibilityOf(record: { visibility?: string | null } | null | undefined): "listed" | "hidden" {
  return record?.visibility === "hidden" ? "hidden" : "listed";
}

type PodPersonSummary = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
};

async function personSummary(
  ctx: Ctx,
  userId: any,
  names: Map<string, string>,
  people: Map<string, PodPersonSummary>,
): Promise<PodPersonSummary> {
  const key = normalizeIdValue(userId);
  if (!people.has(key)) {
    const [name, profile] = await Promise.all([
      displayName(ctx, userId, names),
      resolveUserProfileDisplayProjection(ctx, userId).catch(() => null),
    ]);
    people.set(key, {
      user_id: key,
      name: profile?.display_name ?? name,
      avatar_url: profile?.avatar_url ?? null,
      avatar_focus_x: profile?.avatar_focus_x ?? 0.5,
      avatar_focus_y: profile?.avatar_focus_y ?? 0.5,
      avatar_zoom: profile?.avatar_zoom ?? 1,
    });
  }
  return people.get(key)!;
}

export async function hostNames(ctx: Ctx, record: any, names: Map<string, string>) {
  const list: string[] = [];
  for (const id of (record?.hostUserIds ?? []).slice(0, 5)) list.push(await displayName(ctx, id, names));
  return list;
}

async function hostPeople(
  ctx: Ctx,
  record: any,
  names: Map<string, string>,
  people: Map<string, PodPersonSummary>,
): Promise<PodPersonSummary[]> {
  const list: PodPersonSummary[] = [];
  for (const id of (record?.hostUserIds ?? []).slice(0, 5)) list.push(await personSummary(ctx, id, names, people));
  return list;
}

export const listCommunityPods = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // "View as a member": a builder sees only the pods they are in, and the
    // listed ones from outside.
    asMember: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, actor } = await viewerOf(ctx, args.authSubject, args.communityId);
    const canManage = actor.isManager && !args.asMember;
    const names = new Map<string, string>();
    const { page } = await listAuthorizedCommunityChannelPage({
      ctx, communityId: args.communityId, actor, section: "private", paginationOpts: { cursor: null, numItems: PODS_CAP },
    });
    const pods = [];
    const inside = new Set<string>();
    for (const channel of page as any[]) {
      const [grants, isMember, record] = await Promise.all([
        memberGrants(ctx, channel._id),
        viewerHasPodSeat(ctx, channel._id, actor.principalKey),
        podRecord(ctx, args.communityId, channel._id),
      ]);
      const hosting = isHost(record, userId) && (isMember || actor.isManager);
      if (!canManage && !isMember && !hosting) continue;
      inside.add(normalizeIdValue(channel._id));
      const [latest, pendingReqs, waitlistReqs] = await Promise.all([
        ctx.db.query("communityInteractionRoots")
          .withIndex("by_channel_updatedAt", (q: any) => q.eq("channelId", channel._id)).order("desc").first(),
        canManage || hosting
          ? ctx.db.query("communityPodRequests").withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "pending")).take(REQUESTS_CAP)
          : Promise.resolve([]),
        canManage || hosting
          ? ctx.db.query("communityPodRequests").withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "waitlist")).take(REQUESTS_CAP)
          : Promise.resolve([]),
      ]);
      const waiting = pendingReqs.length + waitlistReqs.length;
      pods.push({
        channel_id: normalizeIdValue(channel._id),
        slug: String(channel.slug ?? ""),
        name: String(channel.name ?? ""),
        purpose: record?.purpose ?? "",
        visibility: podVisibilityOf(record),
        seats: typeof record?.seats === "number" ? record.seats : null,
        price: podPriceOf(record),
        members: grants.length,
        last_active_at: latest ? new Date(Number(latest.updatedAt ?? latest.createdAt)).toISOString() : null,
        is_member: isMember,
        is_host: hosting,
        can_manage: canManage || hosting,
        waiting,
      });
    }

    // Listed pods this person isn't in, from the outside only. Pods default
    // to listed (outside visible, inside locked) unless explicitly hidden.
    const outside = [];
    if (!canManage) {
      const [restrictedChannels, plansByPod] = await Promise.all([
        ctx.db.query("communityChannels")
          .withIndex("by_community_access_status_position", (q: any) =>
            q.eq("communityId", args.communityId).eq("accessMode", "restricted").eq("status", "active"))
          .take(PODS_CAP),
        buildPlanNamesByPodMap(ctx, args.communityId),
      ]);
      for (const channel of restrictedChannels as any[]) {
        if (inside.has(normalizeIdValue(channel._id))) continue;
        const record = await podRecord(ctx, args.communityId, channel._id);
        if (podVisibilityOf(record) !== "listed") continue;
        const [taken, request, hosts] = await Promise.all([
          typeof record?.seats === "number" ? memberGrants(ctx, channel._id).then((g) => g.length) : Promise.resolve(0),
          ctx.db.query("communityPodRequests")
            .withIndex("by_channel_user", (q: any) => q.eq("channelId", channel._id).eq("userId", userId)).first(),
          hostNames(ctx, record, names),
        ]);
        outside.push({
          channel_id: normalizeIdValue(channel._id),
          slug: String(channel.slug ?? ""),
          name: String(channel.name ?? ""),
          purpose: record?.purpose ?? "",
          cover: await podCover(ctx, record),
          hosts,
          seats_left: typeof record?.seats === "number" ? Math.max(0, record.seats - taken) : null,
          price: podPriceOf(record),
          my_request: request && request.status !== "approved" ? request.status : null,
          // The plans that include it: the way in for a pod that comes with a plan.
          included_with: plansByPod.get(String(channel._id)) ?? [],
        });
      }
    }
    return { can_manage: canManage, pods, outside };
  },
});

// A pod from inside: what it is for, its hosts, its members and, for those
// who manage it, the people asking to join. The room's own read check.
export const getPod = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const { userId, actor } = await viewerOf(ctx, args.authSubject, args.communityId);
    const channel = await activePodRoom(ctx, args.communityId, args.channelId);
    if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) throw new Error("community_pod_not_found");
    const [record, grants, viewerIn] = await Promise.all([
      podRecord(ctx, args.communityId, args.channelId),
      memberGrants(ctx, args.channelId),
      viewerHasPodSeat(ctx, args.channelId, actor.principalKey),
    ]);
    const canManage = actor.isManager || isHost(record, userId);
    const names = new Map<string, string>();
    const people = new Map<string, PodPersonSummary>();
    const members: any[] = [];
    // Hydrate members in parallel batches instead of one sequential round-trip per member.
    for (let i = 0; i < grants.length; i += 40) {
      const slice = grants.slice(i, i + 40);
      const batch = await Promise.all(
        slice.map(async (grant: any) => {
          const memberId = userIdOf(String(grant.principalKey));
          const [payment, person] = await Promise.all([
            canManage ? paymentRows(ctx, args.channelId, memberId).then(podPaymentStateOf) : Promise.resolve(null),
            personSummary(ctx, memberId, names, people),
          ]);
          return {
            user_id: memberId,
            name: person.name,
            avatar_url: person.avatar_url,
            avatar_focus_x: person.avatar_focus_x,
            avatar_focus_y: person.avatar_focus_y,
            avatar_zoom: person.avatar_zoom,
            is_host: isHost(record, memberId),
            // A seat their plan gives follows the plan: it can't be taken away here.
            // public_id: how the member directory names them, so "Add someone"
            // can leave out who is already in.
            ...(canManage ? { from_plan: seatReasons(grant).includes("plan"), public_id: (await resolvePublicUserId(ctx, memberId)) ?? memberId } : {}),
            ...(canManage ? { payment: payment ? { state: payment.state, until: payment.until } : { state: "added" as const, until: null } } : {}),
          };
        }),
      );
      members.push(...batch);
    }
    const requests = [];
    if (canManage) {
      for (const status of ["pending", "waitlist"] as const) {
        const rows = await ctx.db.query("communityPodRequests")
          .withIndex("by_channel_status", (q: any) => q.eq("channelId", args.channelId).eq("status", status)).take(REQUESTS_CAP);
        for (const row of rows) requests.push({ user_id: normalizeIdValue(row.userId), name: await displayName(ctx, row.userId, names), status, created_at: new Date(row.createdAt).toISOString() });
      }
    }
    const hostsDetail = await hostPeople(ctx, record, names, people);
    return {
      channel_id: normalizeIdValue(channel._id),
      name: String(channel.name ?? ""),
      purpose: record?.purpose ?? "",
      visibility: podVisibilityOf(record),
      seats: typeof record?.seats === "number" ? record.seats : null,
      price: podPriceOf(record),
      what_you_get: record?.whatYouGet ?? [],
      about_md: record?.aboutMd ?? "",
      cover: await podCover(ctx, record),
      // The pod's next call, with its link (this viewer can read the pod).
      next_call: await (async () => {
        const call = await nextPodCall(ctx, args.channelId, Date.now());
        return call ? {
          event_id: call.parent_event_id, title: call.title, starts_at: call.starts_at, url: call.url,
          recurrence_frequency: call.recurrence_frequency,
        } : null;
      })(),
      slug: String(channel.slug ?? ""),
      hosts: hostsDetail.map((host) => host.name),
      host_people: hostsDetail,
      members,
      // The viewer's own place in it: paying, leaving, a payment problem, or added.
      my_membership: viewerIn ? (podPaymentStateOf(await paymentRows(ctx, args.channelId, userId)) ?? { state: "added" as const, until: null, amount_base_units: 0, currency: "usd" }) : null,
      can_manage: canManage,
      can_edit: actor.isManager,
      requests,
      // The plans that include this pod, for its settings (the builder's view).
      included_with: actor.isManager ? await plansIncludingPod(ctx, args.communityId, args.channelId) : [],
    };
  },
});

// What the pod is for, whether it is listed, and its seats. Builders and admins.
export const savePodDetails = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    purpose: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("listed"), v.literal("hidden"))),
    // 0 or less clears the limit.
    seats: v.optional(v.number()),
    whatYouGet: v.optional(v.array(v.string())),
    about: v.optional(v.string()),
    // A new cover (an uploaded image), or null to take it away.
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // The pitch (purpose, what you get, About, cover) is the pod's hosts' as
    // well as the builder's. Who can get in (listed or hidden, seats) is the
    // builder's: it touches the community's money and who sees what.
    const { actor } = await requirePodManager(ctx, args.authSubject, args.communityId, args.channelId);
    if ((args.visibility !== undefined || args.seats !== undefined) && !actor.isManager) throw new Error("community_manager_required");
    const patch: Record<string, unknown> = {};
    if (args.about !== undefined) patch.aboutMd = cleanPodAbout(args.about) || undefined;
    if (args.bannerFocusX !== undefined) patch.bannerFocusX = focusOf(args.bannerFocusX);
    if (args.bannerFocusY !== undefined) patch.bannerFocusY = focusOf(args.bannerFocusY);
    if (args.bannerZoom !== undefined) patch.bannerZoom = zoomOf(args.bannerZoom);
    if (args.purpose !== undefined) patch.purpose = args.purpose.replace(/\s+/g, " ").trim().slice(0, PURPOSE_MAX);
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.seats !== undefined) patch.seats = args.seats > 0 ? Math.min(SEATS_MAX, Math.floor(args.seats)) : undefined;
    if (args.whatYouGet !== undefined) patch.whatYouGet = cleanWhatYouGet(args.whatYouGet);
    const nowMs = Date.now();
    const existing = await podRecord(ctx, args.communityId, args.channelId);
    if (args.bannerStorageId === null) patch.bannerStorageId = undefined;
    else if (args.bannerStorageId !== undefined && String(args.bannerStorageId) !== String(existing?.bannerStorageId ?? "")) {
      // An image someone uploaded just now, not one already used elsewhere.
      patch.bannerStorageId = await assertUnclaimedPublicImageStorageId(ctx, args.bannerStorageId, "community_pod_cover_invalid");
    }
    if (existing) await ctx.db.patch(existing._id, { ...patch, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", visibility: "listed", ...patch, createdAt: nowMs, updatedAt: nowMs } as any);
    return null;
  },
});

// Make a member a host of this pod (added to the pod if they aren't in it), or
// stop. Builders and admins.
export const setPodHost = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.id("users"), host: v.boolean() },
  handler: async (ctx, args) => {
    const managerId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: managerId });
    await activePodRoom(ctx, args.communityId, args.channelId);
    if (args.host) await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: managerId, active: true, target: { kind: "member", userId: args.userId } });
    const nowMs = Date.now();
    const existing = await podRecord(ctx, args.communityId, args.channelId);
    const current = (existing?.hostUserIds ?? []).filter((id: any) => String(id) !== String(args.userId));
    const hostUserIds = args.host ? [...current, args.userId] : current;
    if (existing) await ctx.db.patch(existing._id, { hostUserIds, updatedAt: nowMs });
    else await ctx.db.insert("communityPods", { communityId: args.communityId, channelId: args.channelId, purpose: "", visibility: "listed", hostUserIds, createdAt: nowMs, updatedAt: nowMs });
    return null;
  },
});

// A host or the builder adds a member of the community to the pod directly
// (no request, no payment: "added by a host"). Taking someone off a pod stays
// the builder's (communityChannelParticipants.setParticipant).
export const addPodMember = mutation({
  // userId: the person as the member directory names them (their public id),
  // or their user id.
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.string() },
  handler: async (ctx, args) => {
    const { userId: adderId } = await requirePodManager(ctx, args.authSubject, args.communityId, args.channelId);
    const asId = ctx.db.normalizeId("users", args.userId);
    const person: any = asId ? await ctx.db.get(asId)
      : await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", args.userId.trim())).first();
    if (!person) throw new Error("community_member_not_found");
    const userId = person._id;
    // Only someone in the community can be added.
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: adderId, active: true, target: { kind: "member", userId } });
    // A request they had is answered by this.
    const request = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", userId)).first();
    if (request && (request.status === "pending" || request.status === "waitlist")) {
      await ctx.db.patch(request._id, { status: "approved", decidedByUserId: adderId, updatedAt: Date.now() });
    }
    return null;
  },
});

// Ask to join a listed pod; a full pod puts you on its waitlist.
export const requestToJoinPod = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    await activePodRoom(ctx, args.communityId, args.channelId);
    const record = await podRecord(ctx, args.communityId, args.channelId);
    if (podVisibilityOf(record) !== "listed") throw new Error("community_pod_not_found");
    // A paid pod's gate is payment (communityPodPayments.startPodCheckout).
    if (podPriceOf(record)) throw new Error("community_pod_paid");
    const grants = await memberGrants(ctx, args.channelId);
    if (grants.some((row: any) => row.principalKey === `user:${normalizeIdValue(userId)}`)) return { status: "member" as const };
    const status = typeof record?.seats === "number" && grants.length >= record.seats ? "waitlist" as const : "pending" as const;
    const nowMs = Date.now();
    const existing = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", userId)).first();
    if (existing && (existing.status === "pending" || existing.status === "waitlist")) return { status: existing.status };
    if (existing) await ctx.db.patch(existing._id, { status, decidedByUserId: undefined, updatedAt: nowMs });
    else await ctx.db.insert("communityPodRequests", { communityId: args.communityId, channelId: args.channelId, userId, status, createdAt: nowMs, updatedAt: nowMs });
    return { status };
  },
});

// A host says yes (the person joins the pod) or no.
export const decidePodRequest = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), channelId: v.id("communityChannels"), userId: v.id("users"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const { userId: deciderId } = await requirePodManager(ctx, args.authSubject, args.communityId, args.channelId);
    const request = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", args.channelId).eq("userId", args.userId)).first();
    if (!request || (request.status !== "pending" && request.status !== "waitlist")) throw new Error("community_pod_request_not_found");
    if (args.approve) {
      await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: args.channelId, createdByUserId: deciderId, active: true, target: { kind: "member", userId: args.userId } });
    }
    await ctx.db.patch(request._id, { status: args.approve ? "approved" : "declined", decidedByUserId: deciderId, updatedAt: Date.now() });
    return null;
  },
});


// One address per pod (/c/:slug/pods/:podSlug). Anyone who can enter (in it,
// its hosts, the builder) goes into its room; a member who can't sees its
// outside (a listed pod only). The builder and hosts can ask to preview that
// outside page. Anyone else: not found, so a hidden pod's existence never shows.
export const getPodPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), podSlug: v.string(), asMember: v.optional(v.boolean()), preview: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { userId, actor } = await viewerOf(ctx, args.authSubject, args.communityId);
    const slug = args.podSlug.trim().toLowerCase();
    const channel = await ctx.db.query("communityChannels")
      .withIndex("by_community_slug", (q: any) => q.eq("communityId", args.communityId).eq("slug", slug)).first() as any;
    const notFound = { kind: "not_found" as const };
    if (!channel || channel.accessMode !== "restricted" || channel.status !== "active") return notFound;
    const record = await podRecord(ctx, args.communityId, channel._id);
    const grants = await memberGrants(ctx, channel._id);
    const canReadRoom = (await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead;
    const isIn = !actor.isManager ? canReadRoom : grants.some((row: any) => row.principalKey === actor.principalKey);
    const hosting = canReadRoom && isHost(record, userId);
    const manages = actor.isManager && !args.asMember;
    const canEnter = isIn || manages || hosting;
    const visibility = podVisibilityOf(record);
    if (canEnter && !(args.preview && (manages || hosting))) return { kind: "inside" as const, slug: String(channel.slug) };
    if (!canEnter && visibility !== "listed") return notFound;
    const names = new Map<string, string>();
    const people = new Map<string, PodPersonSummary>();
    const hostsDetail = await hostPeople(ctx, record, names, people);
    const price = podPriceOf(record);
    const request = await ctx.db.query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", channel._id).eq("userId", userId)).first();
    const nowMs = Date.now();
    const checkoutOpen = (await paymentRows(ctx, channel._id, userId))
      .some((row: any) => row.status === "pending" && row.checkoutUrl && row.checkoutExpiresAt > nowMs);
    return {
      kind: "outside" as const,
      channel_id: normalizeIdValue(channel._id),
      slug: String(channel.slug ?? ""),
      name: String(channel.name ?? ""),
      purpose: record?.purpose ?? "",
      what_you_get: record?.whatYouGet ?? [],
      about_md: record?.aboutMd ?? "",
      cover: await podCover(ctx, record),
      hosts: hostsDetail.map((host) => host.name),
      host_people: hostsDetail,
      visibility,
      price,
      seats_left: typeof record?.seats === "number" ? Math.max(0, record.seats - grants.length) : null,
      my_request: request && request.status !== "approved" ? request.status : null,
      checkout_open: checkoutOpen,
      // How much the pod knows, as a number only: never a note's name or text.
      knows: (await notesByUpdated(ctx, podScopeKey(channel._id)).take(POD_KNOWS_CAP)).length,
      // The pod's rhythm only: when it meets, never the link or who is going.
      rhythm: await (async () => {
        const call = await nextPodCall(ctx, channel._id, nowMs);
        return call ? { recurrence_frequency: call.recurrence_frequency, next_starts_at: call.starts_at } : null;
      })(),
      // The plans that include it (each with its monthly price), and whether
      // this member can move to one here (they pay Polynet monthly).
      included_with: await plansIncludingPod(ctx, args.communityId, channel._id),
      can_switch_plan: !manages && await canChangePlanHere(ctx, args.communityId, userId),
      // The builder and hosts: what members see, plus Edit and a way in.
      can_edit: manages,
      can_enter: canEnter,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal helpers for Official Polynet MCP & Studio Guide Chat (builder/pods.json
// and community.pod.* operations). Owners & admins only for builder actions;
// members may only request to join listed non-paid pods.
// ---------------------------------------------------------------------------

async function resolveActivePodBySlug(ctx: Ctx, communityId: any, slugRaw: unknown) {
  const slug = String(slugRaw ?? "").trim().toLowerCase();
  if (!slug) throw new Error("community_pod_not_found");
  const channel = await ctx.db
    .query("communityChannels")
    .withIndex("by_community_slug", (q: any) => q.eq("communityId", communityId).eq("slug", slug))
    .first();
  if (!channel || channel.accessMode !== "restricted" || channel.status !== "active") {
    throw new Error("community_pod_not_found");
  }
  return channel;
}

function parsePodUserRef(ctx: Ctx, raw: unknown) {
  const match = typeof raw === "string" ? /^user:([A-Za-z0-9]+)$/.exec(raw.trim()) : null;
  const userId = match ? ctx.db.normalizeId("users", match[1]) : null;
  if (!userId) throw new Error("community_member_not_found");
  return userId;
}

async function memberHasPaidPodCommitment(ctx: Ctx, channelId: any, userId: any, seatRow: any): Promise<boolean> {
  if (seatReasons(seatRow).includes("paid")) return true;
  const payments = await paymentRows(ctx, channelId, userId);
  if (podPaymentStateOf(payments)) return true;
  return payments.some((row: any) =>
    row.status === "active" ||
    row.status === "past_due" ||
    row.status === "cancel_at_period_end" ||
    row.status === "pending",
  );
}

async function podMemberProjection(
  ctx: Ctx,
  userId: any,
  names: Map<string, string>,
  usersCache?: Map<string, { handle?: string; normalizedHandle?: string } | null>,
) {
  const key = normalizeIdValue(userId);
  let user = usersCache?.get(key);
  if (user === undefined) {
    user = (await ctx.db.get(userId)) as { handle?: string; normalizedHandle?: string } | null;
    usersCache?.set(key, user);
  }
  const name = await displayName(ctx, userId, names);
  return {
    member_ref: `user:${key}`,
    handle: user?.normalizedHandle ?? user?.handle ?? null,
    name,
  };
}

export const readBuilderPodsForTrustedManagerInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const channels = await ctx.db
      .query("communityChannels")
      .withIndex("by_community_access_status_position", (q: any) =>
        q.eq("communityId", args.communityId).eq("accessMode", "restricted").eq("status", "active"),
      )
      .take(PODS_CAP);
    const totalPodCount = channels.length;
    const names = new Map<string, string>();
    const usersCache = new Map<string, { handle?: string; normalizedHandle?: string } | null>();
    const pods: any[] = [];
    const MEMBER_HYDRATION_CAP = 30;
    const REQUEST_HYDRATION_CAP = 25;
    for (const channel of channels as any[]) {
      const [record, grants, agentSeat, pendingRows, waitlistRows] = await Promise.all([
        podRecord(ctx, args.communityId, channel._id),
        memberGrants(ctx, channel._id),
        ctx.db
          .query("communityChannelParticipants")
          .withIndex("by_channel_principal", (q: any) =>
            q.eq("channelId", channel._id).eq("principalKey", "community_agent"),
          )
          .first(),
        ctx.db
          .query("communityPodRequests")
          .withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "pending"))
          .take(REQUEST_HYDRATION_CAP + 1),
        ctx.db
          .query("communityPodRequests")
          .withIndex("by_channel_status", (q: any) => q.eq("channelId", channel._id).eq("status", "waitlist"))
          .take(REQUEST_HYDRATION_CAP + 1),
      ]);
      const hosts = [];
      for (const hostId of (record?.hostUserIds ?? []).slice(0, 10)) {
        hosts.push(await podMemberProjection(ctx, hostId, names, usersCache));
      }
      const members = [];
      for (const grant of grants.slice(0, MEMBER_HYDRATION_CAP)) {
        const memberId = ctx.db.normalizeId("users", userIdOf(String(grant.principalKey)));
        if (!memberId) continue;
        const [proj, paidSeat] = await Promise.all([
          podMemberProjection(ctx, memberId, names, usersCache),
          memberHasPaidPodCommitment(ctx, channel._id, memberId, grant),
        ]);
        members.push({
          ...proj,
          is_host: isHost(record, memberId),
          from_plan: seatReasons(grant).includes("plan"),
          paid_seat: paidSeat,
        });
      }
      const pendingSlice = pendingRows.slice(0, REQUEST_HYDRATION_CAP);
      const waitlistSlice = waitlistRows.slice(0, REQUEST_HYDRATION_CAP);
      const requestsTruncated =
        pendingRows.length > REQUEST_HYDRATION_CAP || waitlistRows.length > REQUEST_HYDRATION_CAP;
      const requests = [];
      for (const row of [...pendingSlice, ...waitlistSlice]) {
        const proj = await podMemberProjection(ctx, row.userId, names, usersCache);
        requests.push({
          ...proj,
          status: row.status,
          created_at: new Date(row.createdAt).toISOString(),
        });
      }
      pods.push({
        slug: String(channel.slug ?? ""),
        name: String(channel.name ?? ""),
        purpose: record?.purpose ?? "",
        about_md: record?.aboutMd ?? "",
        what_you_get: record?.whatYouGet ?? [],
        visibility: podVisibilityOf(record),
        seats: typeof record?.seats === "number" ? record.seats : null,
        member_count: grants.length,
        guide_seated: agentSeat?.status === "active",
        paid_pod: Boolean(podPriceOf(record)),
        hosts,
        members,
        ...(grants.length > members.length ? { members_truncated: true } : {}),
        requests,
        ...(requestsTruncated ? { requests_truncated: true } : {}),
      });
    }
    const buildPayload = (truncated: boolean) => ({
      read_at: new Date().toISOString(),
      pod_count: totalPodCount,
      shown_pod_count: pods.length,
      pods,
      ...(truncated ? { truncated: true } : {}),
    });
    // Measure pretty-printed JSON (matching canonicalJsonDocument's 2-space indent)
    // so the returned document never overflows the 24 KB canonical read cap.
    let truncated = false;
    while (JSON.stringify(buildPayload(truncated), null, 2).length > 22_000) {
      truncated = true;
      const biggestMembersPod = pods.reduce<any>(
        (best, pod) => (!best || pod.members.length > best.members.length ? pod : best),
        null,
      );
      const biggestRequestsPod = pods.reduce<any>(
        (best, pod) => (!best || pod.requests.length > best.requests.length ? pod : best),
        null,
      );
      if (biggestMembersPod && biggestMembersPod.members.length > 0) {
        const drop = Math.max(1, Math.ceil(biggestMembersPod.members.length / 4));
        biggestMembersPod.members.splice(-drop);
        biggestMembersPod.members_truncated = true;
      } else if (biggestRequestsPod && biggestRequestsPod.requests.length > 0) {
        const drop = Math.max(1, Math.ceil(biggestRequestsPod.requests.length / 4));
        biggestRequestsPod.requests.splice(-drop);
        biggestRequestsPod.requests_truncated = true;
      } else {
        const longAboutPod = pods.find((pod) => typeof pod.about_md === "string" && pod.about_md.length > 160);
        if (longAboutPod) {
          longAboutPod.about_md = `${longAboutPod.about_md.slice(0, 159)}…`;
        } else if (pods.length > 1) {
          pods.pop();
        } else {
          break;
        }
      }
    }
    return buildPayload(truncated);
  },
});

export const describePodActionForTrustedManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    action: v.union(v.literal("remove_members"), v.literal("set_guide_seat")),
    podSlug: v.string(),
    members: v.optional(v.array(v.string())),
    seated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    } catch {
      return { ok: false as const, code: "community_forbidden" };
    }
    let channel: any;
    try {
      channel = await resolveActivePodBySlug(ctx, args.communityId, args.podSlug);
    } catch {
      return { ok: false as const, code: "community_pod_not_found" };
    }
    if (args.action === "set_guide_seat") {
      return {
        ok: true as const,
        podName: String(channel.name ?? channel.slug),
        seated: Boolean(args.seated),
      };
    }
    const refs = args.members ?? [];
    if (!refs.length) return { ok: false as const, code: "invalid_tool_args" };
    const namesMap = new Map<string, string>();
    const names: string[] = [];
    for (const ref of refs) {
      let targetUserId: any;
      try {
        targetUserId = parsePodUserRef(ctx, ref);
      } catch {
        return { ok: false as const, code: "community_member_not_found" };
      }
      const seat = await ctx.db
        .query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) =>
          q.eq("channelId", channel._id).eq("principalKey", `user:${normalizeIdValue(targetUserId)}`),
        )
        .first();
      if (!seat || seat.status !== "active") {
        return { ok: false as const, code: "community_pod_member_not_found" };
      }
      if (seatReasons(seat).includes("plan")) {
        return { ok: false as const, code: "community_pod_seat_from_plan" };
      }
      if (await memberHasPaidPodCommitment(ctx, channel._id, targetUserId, seat)) {
        return { ok: false as const, code: "paid_pod_member_use_studio" };
      }
      names.push(await displayName(ctx, targetUserId, namesMap));
    }
    return {
      ok: true as const,
      podName: String(channel.name ?? channel.slug),
      names,
    };
  },
});

export const applyPodOperationForTrustedManagerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    operation: v.string(),
    input: v.any(),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const ownerIdStr = String(community.ownerId);
    const input = (args.input ?? {}) as Record<string, unknown>;
    const channel = await resolveActivePodBySlug(ctx, args.communityId, input.pod);
    const nowMs = Date.now();

    if (args.operation === "community.pod.update_details") {
      const patch: Record<string, unknown> = {};
      if (typeof input.purpose === "string") {
        patch.purpose = input.purpose.replace(/\s+/g, " ").trim().slice(0, PURPOSE_MAX);
      }
      if (typeof input.about === "string") {
        patch.aboutMd = cleanPodAbout(input.about) || undefined;
      }
      if (Array.isArray(input.what_you_get)) {
        patch.whatYouGet = cleanWhatYouGet(input.what_you_get.map((item) => String(item ?? "")));
      }
      if (input.pod_visibility === "listed" || input.pod_visibility === "hidden") {
        patch.visibility = input.pod_visibility;
      }
      if (typeof input.seats === "number" && Number.isFinite(input.seats)) {
        patch.seats = input.seats > 0 ? Math.min(SEATS_MAX, Math.floor(input.seats)) : undefined;
      }
      if (Object.keys(patch).length === 0) throw new Error("invalid_tool_args");
      const existing = await podRecord(ctx, args.communityId, channel._id);
      if (existing) {
        await ctx.db.patch(existing._id, { ...patch, updatedAt: nowMs });
      } else {
        await ctx.db.insert("communityPods", {
          communityId: args.communityId,
          channelId: channel._id,
          purpose: "",
          visibility: "listed",
          ...patch,
          createdAt: nowMs,
          updatedAt: nowMs,
        } as any);
      }
      return { pod: channel.slug, updated: Object.keys(patch) };
    }

    if (args.operation === "community.pod.set_host") {
      const targetUserId = parsePodUserRef(ctx, input.member);
      const makeHost = Boolean(input.host);
      if (makeHost) {
        await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: targetUserId });
        if (String(targetUserId) !== ownerIdStr) {
          await setChannelParticipantCore(ctx, {
            communityId: args.communityId,
            channelId: channel._id,
            createdByUserId: args.userId,
            active: true,
            target: { kind: "member", userId: targetUserId },
          });
        }
      }
      const existing = await podRecord(ctx, args.communityId, channel._id);
      const current = (existing?.hostUserIds ?? []).filter((id: any) => String(id) !== String(targetUserId));
      const hostUserIds = makeHost ? [...current, targetUserId] : current;
      if (existing) {
        await ctx.db.patch(existing._id, { hostUserIds, updatedAt: nowMs });
      } else {
        await ctx.db.insert("communityPods", {
          communityId: args.communityId,
          channelId: channel._id,
          purpose: "",
          visibility: "listed",
          hostUserIds,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      return { pod: channel.slug, member: `user:${normalizeIdValue(targetUserId)}`, host: makeHost };
    }

    if (args.operation === "community.pod.add_members") {
      const refs = Array.isArray(input.members) ? input.members : [];
      if (!refs.length) throw new Error("invalid_tool_args");
      const targetIds = refs.map((ref) => parsePodUserRef(ctx, ref));
      for (const targetUserId of targetIds) {
        await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: targetUserId });
      }
      for (const targetUserId of targetIds) {
        if (String(targetUserId) !== ownerIdStr) {
          await setChannelParticipantCore(ctx, {
            communityId: args.communityId,
            channelId: channel._id,
            createdByUserId: args.userId,
            active: true,
            target: { kind: "member", userId: targetUserId },
          });
        }
        const request = await ctx.db
          .query("communityPodRequests")
          .withIndex("by_channel_user", (q: any) => q.eq("channelId", channel._id).eq("userId", targetUserId))
          .first();
        if (request && (request.status === "pending" || request.status === "waitlist")) {
          await ctx.db.patch(request._id, { status: "approved", decidedByUserId: args.userId, updatedAt: nowMs });
        }
      }
      return {
        pod: channel.slug,
        added: targetIds.map((id) => `user:${normalizeIdValue(id)}`),
      };
    }

    if (args.operation === "community.pod.remove_members") {
      const refs = Array.isArray(input.members) ? input.members : [];
      if (!refs.length) throw new Error("invalid_tool_args");
      const targetIds = refs.map((ref) => parsePodUserRef(ctx, ref));
      // Fail closed on every member BEFORE revoking anyone: never touch plan-bound
      // seats or paid pod subscriptions from an AI tool.
      for (const targetUserId of targetIds) {
        const seat = await ctx.db
          .query("communityChannelParticipants")
          .withIndex("by_channel_principal", (q: any) =>
            q.eq("channelId", channel._id).eq("principalKey", `user:${normalizeIdValue(targetUserId)}`),
          )
          .first();
        if (!seat || seat.status !== "active") throw new Error("community_pod_member_not_found");
        if (seatReasons(seat).includes("plan")) throw new Error("community_pod_seat_from_plan");
        if (await memberHasPaidPodCommitment(ctx, channel._id, targetUserId, seat)) {
          throw new Error("paid_pod_member_use_studio");
        }
      }
      for (const targetUserId of targetIds) {
        await setChannelParticipantCore(ctx, {
          communityId: args.communityId,
          channelId: channel._id,
          createdByUserId: args.userId,
          active: false,
          target: { kind: "member", userId: targetUserId },
        });
      }
      return {
        pod: channel.slug,
        removed: targetIds.map((id) => `user:${normalizeIdValue(id)}`),
      };
    }

    if (args.operation === "community.pod.decide_request") {
      const targetUserId = parsePodUserRef(ctx, input.member);
      const approve = Boolean(input.approve);
      const request = await ctx.db
        .query("communityPodRequests")
        .withIndex("by_channel_user", (q: any) => q.eq("channelId", channel._id).eq("userId", targetUserId))
        .first();
      if (!request || (request.status !== "pending" && request.status !== "waitlist")) {
        throw new Error("community_pod_request_not_found");
      }
      if (approve) {
        await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: targetUserId });
        await setChannelParticipantCore(ctx, {
          communityId: args.communityId,
          channelId: channel._id,
          createdByUserId: args.userId,
          active: true,
          target: { kind: "member", userId: targetUserId },
        });
      }
      await ctx.db.patch(request._id, {
        status: approve ? "approved" : "declined",
        decidedByUserId: args.userId,
        updatedAt: nowMs,
      });
      return {
        pod: channel.slug,
        member: `user:${normalizeIdValue(targetUserId)}`,
        status: approve ? ("approved" as const) : ("declined" as const),
      };
    }

    if (args.operation === "community.pod.set_guide_seat") {
      const seated = Boolean(input.seated);
      const result = await setChannelParticipantCore(ctx, {
        communityId: args.communityId,
        channelId: channel._id,
        createdByUserId: args.userId,
        active: seated,
        target: { kind: "community_agent" },
      });
      return { pod: channel.slug, guide_seated: seated, changed: result.changed };
    }

    throw new Error("operation_not_found");
  },
});

export const requestJoinPodForTrustedMemberInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    podSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const channel = await resolveActivePodBySlug(ctx, args.communityId, args.podSlug);
    const record = await podRecord(ctx, args.communityId, channel._id);
    if (podVisibilityOf(record) !== "listed") throw new Error("community_pod_not_found");
    if (podPriceOf(record)) throw new Error("community_pod_paid");
    if (String(args.userId) === String(community.ownerId)) {
      return { pod: channel.slug, status: "member" as const };
    }
    const grants = await memberGrants(ctx, channel._id);
    if (grants.some((row: any) => row.principalKey === `user:${normalizeIdValue(args.userId)}`)) {
      return { pod: channel.slug, status: "member" as const };
    }
    const status = typeof record?.seats === "number" && grants.length >= record.seats ? ("waitlist" as const) : ("pending" as const);
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityPodRequests")
      .withIndex("by_channel_user", (q: any) => q.eq("channelId", channel._id).eq("userId", args.userId))
      .first();
    if (existing && (existing.status === "pending" || existing.status === "waitlist")) {
      return { pod: channel.slug, status: existing.status };
    }
    if (existing) {
      await ctx.db.patch(existing._id, { status, decidedByUserId: undefined, updatedAt: nowMs });
    } else {
      await ctx.db.insert("communityPodRequests", {
        communityId: args.communityId,
        channelId: channel._id,
        userId: args.userId,
        status,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { pod: channel.slug, status };
  },
});
