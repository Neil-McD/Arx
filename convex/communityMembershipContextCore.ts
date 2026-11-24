import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeIdValue,
  requireCommunityChatAccess,
  toIsoString,
} from "./communityCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import {
  expandCommunityEventRows,
  listCommunityEventExpansionCandidates,
  nextPodCall,
} from "./communityEvents";
import { readMemberCourseProgress } from "./communityLessonProgress";
import { isHost, podRecord } from "./communityPods";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { readBoundedMemberOrientationFacts } from "./memberOntologyCore";
import type {
  CommunityMemberPodSummary,
  CommunityMemberSelfContext,
  CommunityMemberUpcomingEvent,
} from "../shared/communityMemberSelfContext";

const SELF_PODS_CAP = 16;
const SELF_UPCOMING_EVENTS_CAP = 5;
const SELF_UPCOMING_EVENTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function readMemberOwnPods(
  ctx: QueryCtx,
  communityId: Id<"communities">,
  userId: Id<"users">,
  nowMs: number,
): Promise<CommunityMemberPodSummary[]> {
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  const restricted = await ctx.db
    .query("communityChannels")
    .withIndex("by_community_access_status_position", (q) =>
      q.eq("communityId", communityId).eq("accessMode", "restricted").eq("status", "active"),
    )
    .take(100);
  const pods: CommunityMemberPodSummary[] = [];
  for (const channel of restricted) {
    if (pods.length >= SELF_PODS_CAP) break;
    const caps = await getCommunityChannelCapabilities({ ctx, channel, actor });
    if (!caps.canRead) continue;
    const record = await podRecord(ctx, communityId, channel._id);
    const isDesignatedHost = isHost(record, userId);
    if (actor.isManager && !isDesignatedHost) {
      // Managers can read every pod room, but their personal pod list should
      // only include pods they host or explicitly hold an active seat in.
      const participant = await ctx.db
        .query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) =>
          q.eq("channelId", channel._id).eq("principalKey", actor.principalKey),
        )
        .first();
      const hasValidSeat =
        participant?.status === "active" &&
        normalizeIdValue(participant.communityId) === normalizeIdValue(communityId) &&
        (!actor.membershipId ||
          (normalizeIdValue(participant.membershipId) === actor.membershipId &&
            participant.membershipActivationSequence === actor.membershipActivationSequence));
      if (!hasValidSeat) continue;
    }
    const call = await nextPodCall(ctx, channel._id, nowMs);
    pods.push({
      slug: String(channel.slug ?? ""),
      name: String(channel.name ?? "").trim() || String(channel.slug ?? "Pod"),
      is_host: isDesignatedHost || actor.isManager,
      next_call: call ? { title: call.title, starts_at: call.starts_at } : null,
    });
  }
  return pods;
}

async function readMemberUpcomingCommunityEvents(
  ctx: QueryCtx,
  communityId: Id<"communities">,
  nowMs: number,
): Promise<CommunityMemberUpcomingEvent[]> {
  const endMs = nowMs + SELF_UPCOMING_EVENTS_WINDOW_MS;
  const candidates = await listCommunityEventExpansionCandidates({
    ctx,
    communityId,
    startMs: nowMs,
    endMs,
    includeCancelled: false,
  });
  const communityWide = candidates.filter((row) => !row.podChannelId);
  const expanded = expandCommunityEventRows({
    rows: communityWide,
    startMs: nowMs,
    endMs,
    includeCancelled: false,
    limit: SELF_UPCOMING_EVENTS_CAP,
  });
  return expanded.map((row) => ({
    title: String(row.title ?? "").trim() || "Event",
    starts_at: row.starts_at,
    timezone: String(row.timezone ?? "UTC"),
  }));
}

// A member's own context in a community, for them (and the agent working for
// them): identity, role, stated facts, their own course progress, their pods,
// and upcoming community events. Canonical records stay authoritative; nothing
// here is persisted.
export async function resolveSelfCommunityMembershipContext(args: {
  ctx: QueryCtx;
  actorUserId: Id<"users">;
  communityId: Id<"communities">;
}): Promise<CommunityMemberSelfContext> {
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const isOwner = String(community.ownerId) === String(args.actorUserId);
  const active = communityMembershipRowIsActive(membership) ? membership : null;
  if (!isOwner && !active) throw new Error("community_member_not_found");
  const nowMs = Date.now();
  const [profile, factPage, courseProgress, pods, upcomingEvents] = await Promise.all([
    resolveUserProfileDisplayProjection(args.ctx, args.actorUserId),
    readBoundedMemberOrientationFacts(args.ctx, { subjectUserId: args.actorUserId, communityId: args.communityId }),
    readMemberCourseProgress(args.ctx, args.communityId, args.actorUserId),
    readMemberOwnPods(args.ctx, args.communityId, args.actorUserId, nowMs),
    readMemberUpcomingCommunityEvents(args.ctx, args.communityId, nowMs),
  ]);
  return {
    read_at: toIsoString(nowMs),
    user_id: String(args.actorUserId),
    community_id: String(args.communityId),
    membership_id: active ? String(active._id) : null,
    display_name: profile.display_name ?? "Member",
    role: isOwner ? "owner" : String(membership!.role),
    // The owner has no membership: they have been here since they made it.
    joined_at: active ? toIsoString(active.activatedAt ?? active.createdAt) : isOwner ? toIsoString(community.createdAt) : null,
    approved_community_context: factPage.facts
      .map((fact) => ({
        id: String(fact._id),
        kind: fact.kind,
        body: fact.body,
        provenance: fact.provenance,
        created_at: toIsoString(fact.createdAt),
        updated_at: toIsoString(fact.updatedAt),
      }))
      .sort((left, right) => (left.kind === right.kind ? left.body.localeCompare(right.body) : left.kind.localeCompare(right.kind))),
    facts_truncated: factPage.truncated,
    course_progress: courseProgress,
    pods,
    upcoming_events: upcomingEvents,
  };
}
