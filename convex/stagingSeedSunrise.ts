// Staging only: fills the Sunrise Climbing Club with real content so community
// site pages (/chat, /people, /events, /learn, /knowledge) can be checked in a
// browser, and simulates a second person live (presence, typing, posting).
// Refuses unless the deployment sets POLYNET_ALLOW_SEED=1.
//
// Everything the seed writes is marked: simulated users have auth subject
// `seed:sunrise:<key>`, their posts carry a `seed:sunrise:` idempotency key,
// and events, the course and memories are authored by the simulated moderator.
// Running the seed again deletes the previous posts and events (re-dated to
// now) and updates the course and memories in place; users, memberships and
// the Beta channel are reused.
//
// Hand-run (staging):
//   npx convex run stagingSeedSunrise:seedSunriseInternal '{"communityId":"..."}'
//   npx convex run stagingSeedSunrise:simulateSunriseLiveInternal \
//     '{"communityId":"...","action":"post","memberKey":"theo","channelSlug":"beta","text":"Anyone on the board?"}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import { createActiveCommunityChannel, ensureGeneralChannel } from "./communityChannelCore";
import { normalizeIdValue, syncCommunityActiveMemberCount } from "./communityCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { renewCommunityPresenceLease } from "./communityPresenceCore";
import { writeCommunityResourceBodyContent } from "./communityResourceContent";
import { syncCommunityResourceMemoryProjection } from "./communityResourceMemoryProjection";
import { renewCommunityTypingLease } from "./communityTypingPresenceCore";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PREFIX = "seed:sunrise:";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

const MEMBERS = [
  { key: "maya", name: "Maya Chen", handle: "maya-crimps", role: "moderator", joinedDaysAgo: 120,
    bio: "Route setter on weekends. Ask me about the 40° board." },
  { key: "theo", name: "Theo Brennan", handle: "theo-heelhook", role: "member", joinedDaysAgo: 80,
    bio: "Drives the Saturday carpool. Will trade beta for coffee." },
  { key: "priya", name: "Priya Raman", handle: "priya-slab", role: "member", joinedDaysAgo: 30,
    bio: "Slab enjoyer, overhang survivor." },
  { key: "jules", name: "Jules Okafor", handle: "jules-dyno", role: "member", joinedDaysAgo: 6,
    bio: "New to the board, not new to 5am." },
] as const;
type MemberKey = (typeof MEMBERS)[number]["key"];
const MODERATOR: MemberKey = "maya";

type SeedReply = { by: MemberKey; hoursAgo: number; text: string };
const POSTS: Array<{
  key: string; channel: "general" | "beta"; by: MemberKey; hoursAgo: number; text: string;
  replies: SeedReply[]; reactions: Array<{ by: MemberKey; emoji: string }>;
}> = [
  { key: "welcome", channel: "general", by: "maya", hoursAgo: 70,
    text: "Welcome to Sunrise Climbing Club! We climb before work: Tuesday and Thursday board sessions at 5:45, Saturday sunrise sessions at 5:30. Post projects and beta in Beta.",
    replies: [{ by: "theo", hoursAgo: 68, text: "Two alarms set. See you Tuesday." }, { by: "jules", hoursAgo: 60, text: "First session this week, can't wait." }],
    reactions: [{ by: "theo", emoji: "🙌" }, { by: "priya", emoji: "🙌" }, { by: "jules", emoji: "☀️" }] },
  { key: "carpool", channel: "general", by: "theo", hoursAgo: 30,
    text: "Carpool for Saturday: 3 seats, leaving the Eastside park-and-ride at 4:50. Who's in?",
    replies: [{ by: "priya", hoursAgo: 29, text: "Me please!" }, { by: "jules", hoursAgo: 27, text: "In if there's still a seat." }],
    reactions: [{ by: "priya", emoji: "🚗" }] },
  { key: "chalk", channel: "general", by: "jules", hoursAgo: 9,
    text: "New here: liquid chalk or block for the board? My hands sweat like crazy at 6am.",
    replies: [{ by: "maya", hoursAgo: 8, text: "Liquid as a base layer, then a little block on top. Game changer." }],
    reactions: [{ by: "theo", emoji: "👍" }] },
  { key: "coffee", channel: "general", by: "priya", hoursAgo: 4,
    text: "Post-session coffee crew on Thursday? The cart by the gym opens at 7.",
    replies: [], reactions: [{ by: "theo", emoji: "☕" }, { by: "maya", emoji: "☕" }] },
  { key: "purple-v4", channel: "beta", by: "priya", hoursAgo: 50,
    text: "Beta for the purple V4 on the 40° board: drop-knee on the third move and the gaston comes to you without cutting feet.",
    replies: [{ by: "theo", hoursAgo: 47, text: "That drop-knee is the whole problem. Sent it second go, thanks!" }, { by: "jules", hoursAgo: 40, text: "Saving this for Tuesday." }],
    reactions: [{ by: "theo", emoji: "🔥" }, { by: "maya", emoji: "🔥" }, { by: "jules", emoji: "🔥" }] },
  { key: "yellow-v5", channel: "beta", by: "theo", hoursAgo: 26,
    text: "Has anyone figured out the start of the yellow V5? I keep peeling off the heel hook.",
    replies: [{ by: "maya", hoursAgo: 25, text: "Toe-hook the volume instead and keep your hips in." }, { by: "priya", hoursAgo: 22, text: "+1, the heel is a trap." }],
    reactions: [{ by: "jules", emoji: "👀" }] },
  { key: "tape", channel: "beta", by: "maya", hoursAgo: 12,
    text: "Reminder: finger tape is in the blue bin by the board. Please put the scissors back 🙏",
    replies: [], reactions: [{ by: "priya", emoji: "👍" }, { by: "jules", emoji: "👍" }] },
];

const LESSONS = [
  { title: "Reading the board", body: "# Reading the board\n\nEvery problem is a set of lit holds: **green** starts, **blue** hands and feet, **purple** feet only, **red** finish.\n\n- Read the whole problem from the ground before you pull on.\n- Find the crux and plan your feet for it.\n- Match the finish hold with both hands to call it a send." },
  { title: "Warming up at 5:45am", body: "# Warming up at 5:45am\n\nCold fingers tear. Give yourself fifteen minutes:\n\n1. Five minutes of easy movement on the jugs wall.\n2. Ten open-hand hangs on the big edge, ten seconds each.\n3. Two problems three grades below your max.\n\nOnly then touch the crimps." },
  { title: "Your first board benchmark", body: "# Your first board benchmark\n\nPick three benchmarks one grade below your gym grade. Log tries and sends in Beta.\n\nRepeat them every four weeks: the board doesn't change, so you will see your progress." },
];

const MEMORIES = [
  { type: "playbook", title: "How a Sunrise session runs",
    body: "Doors 5:30. Warm-up circuit until 5:45, then a 45-minute board block in pairs, cool-down and out by 7:00 so everyone makes work." },
  { type: "insight", title: "Early sessions need warmer fingers",
    body: "Members who skip the open-hand warm-up at 5:45 report more tweaked fingers. Liquid chalk under block chalk helps sweaty hands in the cold gym." },
  { type: "decision_judgment", title: "Board etiquette",
    body: "One climber on the board at a time, call your attempt, brush the holds after your go, and give the next person the wall within two tries." },
] as const;

function assertSeedAllowed() {
  if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("seed_not_allowed_on_this_deployment");
}

// ---------- time: wall-clock times in the community's time zone ----------

function localParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function localWallTimeToMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let at = wanted;
  for (let pass = 0; pass < 3; pass += 1) {
    const p = localParts(at, timeZone);
    at -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wanted;
  }
  return at;
}

/** The first `weekday` (0 = Sunday) at hour:minute local time strictly after afterMs. */
export function nextLocalWeekdayAt(afterMs: number, weekday: number, hour: number, minute: number, timeZone: string) {
  const today = localParts(afterMs, timeZone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (date.getUTCDay() !== weekday) continue;
    const at = localWallTimeToMs(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, timeZone);
    if (at > afterMs) return at;
  }
  throw new Error("seed_next_weekday_unresolved");
}

async function communityTimeZone(ctx: any, communityId: any): Promise<string> {
  const settings = await ctx.db.query("communityFounderBriefSettings")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  const timeZone = String(settings?.timeZone ?? "").trim();
  try {
    if (timeZone) {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
      return timeZone;
    }
  } catch { /* fall through */ }
  return DEFAULT_TIME_ZONE;
}

// ---------- simulated people ----------

async function findSeedUser(ctx: any, key: string) {
  return await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${PREFIX}${key}`)).unique();
}

function avatarUrl(name: string) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}&backgroundColor=ffd5a8,c0aede,b6e3f4`;
}

// A complete profile (handle, avatar, accepted legal) so the member composer accepts them.
async function upsertSeedMember(ctx: any, communityId: any, member: (typeof MEMBERS)[number], nowMs: number) {
  const authSubject = `${PREFIX}${member.key}`;
  const holder = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", member.handle)).first();
  if (holder && holder.authSubject !== authSubject) throw new Error(`seed_handle_taken:${member.handle}`);
  const avatar = avatarUrl(member.name);
  const fields = { displayName: member.name, handle: member.handle, normalizedHandle: member.handle, avatarUrl: avatar, updatedAt: nowMs };
  const existing = await findSeedUser(ctx, member.key);
  const userId = existing?._id ?? await ctx.db.insert("users", { authSubject, ...fields, createdAt: nowMs });
  if (existing) await ctx.db.patch(userId, fields);

  const detail = await getUniqueUserProfileDetailByUserId<any>(ctx, userId);
  const profile = { displayName: member.name, avatarUrl: avatar, bio: member.bio, onboardingCompletedAt: nowMs, updatedAt: nowMs };
  if (detail) await ctx.db.patch(detail._id, profile);
  else await ctx.db.insert("userProfileDetails", { userId, ...profile, createdAt: nowMs });
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId, termsVersion: TERMS_OF_SERVICE_DOCUMENT.version, privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "staging_seed", acceptedAt: nowMs,
  });

  const membership = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).unique();
  const joinedAt = nowMs - member.joinedDaysAgo * DAY_MS;
  if (membership) await ctx.db.patch(membership._id, { role: member.role, active: true, createdAt: joinedAt, updatedAt: nowMs });
  else await ctx.db.insert("communityMemberships", {
    communityId, userId, role: member.role, accessSource: "free_grant", active: true, createdAt: joinedAt, updatedAt: nowMs,
  } as any);
  return userId;
}

async function seedUserIds(ctx: any): Promise<Record<MemberKey, any>> {
  const ids = {} as Record<MemberKey, any>;
  for (const member of MEMBERS) {
    const user = await findSeedUser(ctx, member.key);
    if (!user) throw new Error("seed_sunrise_not_seeded");
    ids[member.key] = user._id;
  }
  return ids;
}

async function findChannelBySlug(ctx: any, communityId: any, slug: string) {
  const channel = await ctx.db.query("communityChannels")
    .withIndex("by_community_slug", (q: any) => q.eq("communityId", communityId).eq("slug", slug)).first();
  if (!channel || channel.status !== "active") throw new Error(`seed_channel_not_found:${slug}`);
  return channel;
}

async function ensureBetaChannel(ctx: any, communityId: any, createdByUserId: any, nowMs: number) {
  const existing = await ctx.db.query("communityChannels")
    .withIndex("by_community_status_normalizedName", (q: any) =>
      q.eq("communityId", communityId).eq("status", "active").eq("normalizedName", "beta")).first();
  return existing ?? await createActiveCommunityChannel({ ctx, communityId, createdByUserId, name: "Beta", nowMs });
}

// ---------- clearing the previous seed's activity ----------

async function deleteInteractionTarget(ctx: any, communityId: any, kind: "root" | "reply", id: any) {
  const field = kind === "root" ? "rootId" : "replyId";
  for (const [table, index] of [
    ["communityInteractionContentBlocks", kind === "root" ? "by_root_order" : "by_reply_order"],
    ["communityInteractionReactions", kind === "root" ? "by_root" : "by_reply"],
    ["communityInteractionMentions", kind === "root" ? "by_root" : "by_reply"],
  ] as const) {
    for (const row of await ctx.db.query(table).withIndex(index, (q: any) => q.eq(field, id)).collect()) {
      await ctx.db.delete(row._id);
    }
  }
  await ctx.db.delete(id);
  // Drops the evidence trace the real write path may have recorded.
  await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: kind, objectId: id });
}

async function clearSeededInteractions(ctx: any, communityId: any, userIds: any[]) {
  let removed = 0;
  for (const userId of userIds) {
    const roots = await ctx.db.query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) => q.eq("communityId", communityId).eq("actorUserId", userId)).collect();
    for (const root of roots.filter((row: any) => String(row.idempotencyKey ?? "").includes(PREFIX))) {
      // Replies anyone left on a seeded post go with it.
      for (const reply of await ctx.db.query("communityInteractionReplies").withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id)).collect()) {
        await deleteInteractionTarget(ctx, communityId, "reply", reply._id);
      }
      await deleteInteractionTarget(ctx, communityId, "root", root._id);
      removed += 1;
    }
    const replies = await ctx.db.query("communityInteractionReplies")
      .withIndex("by_community_actorUser_createdAt", (q: any) => q.eq("communityId", communityId).eq("actorUserId", userId)).collect();
    for (const reply of replies.filter((row: any) => String(row.idempotencyKey ?? "").includes(PREFIX))) {
      if (await ctx.db.get(reply._id)) await deleteInteractionTarget(ctx, communityId, "reply", reply._id);
    }
  }
  return removed;
}

// ---------- the seed ----------

export const seedSunriseInternal = internalMutation({
  args: { communityId: v.id("communities"), ownerUserId: v.optional(v.id("users")) },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    const nowMs = Date.now();
    const ago = (hours: number) => nowMs - hours * HOUR_MS;
    const timeZone = await communityTimeZone(ctx, args.communityId);

    const ids = {} as Record<MemberKey, any>;
    for (const member of MEMBERS) ids[member.key] = await upsertSeedMember(ctx, args.communityId, member, nowMs);
    await syncCommunityActiveMemberCount({ ctx, communityId: args.communityId });
    const moderatorId = ids[MODERATOR];
    const seedIds = Object.values(ids);

    const channels = {
      general: await ensureGeneralChannel({ ctx, communityId: args.communityId, nowMs }),
      beta: await ensureBetaChannel(ctx, args.communityId, community.ownerId, nowMs),
    };

    // Posts, replies and reactions, re-dated to now.
    const removedPosts = await clearSeededInteractions(ctx, args.communityId, seedIds);
    const block = (target: Record<string, unknown>, text: string, at: number) => ctx.db.insert("communityInteractionContentBlocks", {
      communityId: args.communityId, ...target, blockOrder: 0, blockType: "markdown_text", text, createdAt: at, updatedAt: at,
    });
    let replyCount = 0;
    for (const post of POSTS) {
      const channel = channels[post.channel];
      const at = ago(post.hoursAgo);
      const lastReply = post.replies[post.replies.length - 1];
      const reactionSummary = Array.from(post.reactions.reduce((counts, reaction) =>
        counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1), new Map<string, number>()))
        .map(([emoji, count]) => ({ emoji, count }));
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId: args.communityId, channelId: channel._id, actorType: "human", actorUserId: ids[post.by],
        kind: post.text.includes("?") ? "question" : "discussion", status: "live", visibilityScope: "community",
        contentSummary: post.text, replyCount: post.replies.length, reactionSummary,
        idempotencyKey: `${PREFIX}${post.key}`, ...(lastReply ? { lastReplyAt: ago(lastReply.hoursAgo) } : {}),
        createdAt: at, updatedAt: lastReply ? ago(lastReply.hoursAgo) : at,
      });
      await block({ rootId }, post.text, at);
      await scheduleCommunityInteractionEvidenceSync({ ctx, communityId: args.communityId, objectType: "root", objectId: rootId });
      for (const reaction of post.reactions) {
        await ctx.db.insert("communityInteractionReactions", {
          communityId: args.communityId, targetType: "root", rootId, actorType: "human",
          actorKey: normalizeIdValue(ids[reaction.by]), actorUserId: ids[reaction.by], emoji: reaction.emoji, createdAt: at,
        });
      }
      for (const [index, reply] of post.replies.entries()) {
        const replyAt = ago(reply.hoursAgo);
        const replyId = await ctx.db.insert("communityInteractionReplies", {
          communityId: args.communityId, channelId: channel._id, rootId, seq: index + 1, actorType: "human",
          actorUserId: ids[reply.by], status: "live", visibilityScope: "community", contentSummary: reply.text,
          reactionSummary: [], idempotencyKey: `${PREFIX}${post.key}:${index}`, createdAt: replyAt, updatedAt: replyAt,
        });
        await block({ replyId }, reply.text, replyAt);
        await scheduleCommunityInteractionEvidenceSync({ ctx, communityId: args.communityId, objectType: "reply", objectId: replyId });
        replyCount += 1;
      }
    }

    // A simulated member @-mentions the owner through the member composer, so
    // the owner gets a real, unread mention.
    const mentionedUserId = args.ownerUserId ?? community.ownerId;
    const mentioned = await ctx.db.get(mentionedUserId);
    const ownerHandle = String(mentioned?.handle ?? "").trim();
    let ownerMention: { rootId: string; handle: string } | { skipped: string };
    if (!ownerHandle) {
      ownerMention = { skipped: "owner_has_no_handle" };
    } else {
      const result: any = await ctx.runMutation(
        (internal as any).communityInteractions.createCommunityInteractionComposerMessageForTrustedUserInternal,
        {
          trustedUserId: ids.jules, communityId: args.communityId, channelId: channels.general._id,
          idempotencyKey: `${PREFIX}owner-mention`,
          text: `@${ownerHandle} could we set a beginner circuit on the board? Happy to help pick the holds.`,
          mentions: [{ userId: normalizeIdValue(mentionedUserId) }],
        },
      );
      ownerMention = { rootId: result.interaction.root_id, handle: ownerHandle };
    }

    // Events, authored by the simulated moderator.
    for (const event of await ctx.db.query("communityEvents").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect()) {
      if (seedIds.some((id) => normalizeIdValue(id) === normalizeIdValue(event.createdByUserId))) await ctx.db.delete(event._id);
    }
    const at = (weekday: number, hour: number, minute: number) => nextLocalWeekdayAt(nowMs, weekday, hour, minute, timeZone);
    const lastSaturday = nextLocalWeekdayAt(nowMs - 7 * DAY_MS, 6, 5, 30, timeZone);
    const EVENTS = [
      { title: "Tuesday Board Session", startsAt: at(2, 5, 45), minutes: 75, locationType: "physical", locationLabel: "Sunrise Bouldering, back board",
        descriptionMd: "Warm-up circuit at 5:45, board in pairs from 6:00. Bring tape." },
      { title: "Thursday Hangboard Warm-up (online)", startsAt: at(4, 5, 45), minutes: 45, locationType: "online", locationLabel: "Video call",
        url: "https://meet.jit.si/sunrise-climbing-club-warmup",
        descriptionMd: "Can't make the gym? Join the warm-up from home.\n\n- 10 min mobility\n- 6 x 10s open-hand hangs\n- Q&A on this week's board problems" },
      { title: "Saturday Sunrise Session", startsAt: at(6, 5, 30), minutes: 120, locationType: "physical", locationLabel: "Castle Rock trailhead" },
      { title: "Friday Fingerboard Clinic", startsAt: at(5, 5, 45), minutes: 60, locationType: "physical", locationLabel: "Sunrise Bouldering",
        descriptionMd: "Cancelled this week: the coach is out. Back next Friday.", status: "cancelled" },
      { title: "Last Saturday's Sunrise Session", startsAt: lastSaturday, minutes: 120, locationType: "physical", locationLabel: "Castle Rock trailhead" },
    ] as const;
    for (const event of EVENTS) {
      await ctx.db.insert("communityEvents", {
        communityId: args.communityId, createdByUserId: moderatorId, title: event.title,
        ...("descriptionMd" in event ? { descriptionMd: event.descriptionMd } : {}),
        startsAt: event.startsAt, endsAt: event.startsAt + event.minutes * 60 * 1000, timezone: timeZone,
        locationType: event.locationType, locationLabel: event.locationLabel, ...("url" in event ? { url: event.url } : {}),
        visibility: "public", status: "status" in event ? event.status : "live", recurrenceFrequency: "none",
        createdAt: nowMs, updatedAt: nowMs,
      });
    }

    // The course: one live module with three lessons, updated in place.
    const modules = await ctx.db.query("communityResourceModules").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect();
    let module = modules.find((row: any) => row.name === "Board basics" && normalizeIdValue(row.createdByUserId) === normalizeIdValue(moderatorId));
    const moduleFields = { status: "live", descriptionMd: "Three short lessons for your first month on the board.", updatedAt: nowMs };
    if (module) await ctx.db.patch(module._id, moduleFields);
    else await ctx.db.insert("communityResourceModules", {
      communityId: args.communityId, createdByUserId: moderatorId, name: "Board basics", ...moduleFields,
      sortOrder: modules.reduce((max: number, row: any) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000, createdAt: nowMs,
    });
    module = (await ctx.db.query("communityResourceModules").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect())
      .find((row: any) => row.name === "Board basics" && normalizeIdValue(row.createdByUserId) === normalizeIdValue(moderatorId));
    const lessons = await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", args.communityId).eq("moduleId", module._id)).collect();
    for (const [index, lesson] of LESSONS.entries()) {
      const fields = { type: "post", role: "page", status: "published", title: lesson.title, pinned: false,
        sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", sortOrder: (index + 1) * 1000, updatedAt: nowMs };
      const existing = lessons.find((row: any) => row.title === lesson.title);
      const resourceId = existing?._id ?? await ctx.db.insert("communityResources", {
        communityId: args.communityId, moduleId: module._id, createdByUserId: moderatorId, ...fields, createdAt: nowMs,
      });
      if (existing) await ctx.db.patch(resourceId, fields);
      await writeCommunityResourceBodyContent(ctx, { communityId: args.communityId, resourceId, bodyMd: lesson.body, nowMs });
      await syncCommunityResourceMemoryProjection(ctx, await ctx.db.get(resourceId), nowMs);
    }

    // Community memory (/memory/ on the semantic repository), updated in place.
    const nodes = await ctx.db.query("communityIntelligenceNodes").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).collect();
    for (const memory of MEMORIES) {
      const existing = nodes.find((row: any) => row.title === memory.title && normalizeIdValue(row.createdByUserId) === normalizeIdValue(moderatorId));
      const fields = { type: memory.type, bodyMd: memory.body, status: "validated", visibilityScope: "community", sourceVisibility: "community",
        confidence: 0.8, evidenceStrength: "observed", tags: ["sessions"], lastUpdatedByActorType: "admin", lastUpdatedByUserId: moderatorId,
        lastValidatedAt: nowMs, updatedAt: nowMs };
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("communityIntelligenceNodes", {
        communityId: args.communityId, title: memory.title, ...fields, workflowIds: [], sourceTraceIds: [], outcomeObservationIds: [],
        stalenessScore: 0, retrievalUsefulnessScore: 0, outcomeImpactScore: 0, createdByActorType: "admin", createdByUserId: moderatorId,
        version: 1, createdAt: nowMs,
      });
    }

    return {
      timeZone,
      members: MEMBERS.map((member) => ({ key: member.key, name: member.name, handle: member.handle, role: member.role })),
      channels: [channels.general, channels.beta].map((channel: any) => ({ id: normalizeIdValue(channel._id), slug: channel.slug, name: channel.name })),
      posts: POSTS.length + ("rootId" in ownerMention ? 1 : 0),
      replies: replyCount,
      removedPosts,
      ownerMention,
      events: EVENTS.map((event) => ({ title: event.title, startsAt: new Date(event.startsAt).toISOString(), status: "status" in event ? event.status : "live" })),
      course: { moduleId: normalizeIdValue(module._id), name: "Board basics", lessons: LESSONS.map((lesson) => lesson.title) },
      memories: MEMORIES.map((memory) => memory.title),
    };
  },
});

// ---------- live simulation: a second person in the room ----------

export const simulateSunriseLiveInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    action: v.union(v.literal("presence"), v.literal("typing"), v.literal("post")),
    memberKey: v.optional(v.string()),
    channelSlug: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const ids = await seedUserIds(ctx);
    const memberKey = (args.memberKey ?? "theo") as MemberKey;
    if (!(memberKey in ids)) throw new Error(`seed_member_unknown:${args.memberKey}`);
    const userId = ids[memberKey];

    if (args.action === "presence") {
      const keys = args.memberKey ? [memberKey] : MEMBERS.map((member) => member.key);
      const leases = [];
      for (const key of keys) {
        const lease = await renewCommunityPresenceLease({ ctx, communityId: args.communityId, userId: ids[key] });
        leases.push({ member: key, activeUntil: new Date(lease.activeUntil).toISOString() });
      }
      return { action: "presence", leases };
    }

    const channel = await findChannelBySlug(ctx, args.communityId, args.channelSlug ?? "general");
    if (args.action === "typing") {
      const lease = await renewCommunityTypingLease({ ctx, communityId: args.communityId, channelId: channel._id, userId });
      return { action: "typing", member: memberKey, channel: channel.slug, displayUntil: new Date(lease.displayUntil).toISOString() };
    }

    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("seed_post_text_required");
    // @handles in the text become real mentions of the people they name.
    const mentions = [];
    for (const match of text.matchAll(/(?:^|[^A-Za-z0-9_-])@([A-Za-z0-9_-]{3,32})/g)) {
      const user = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", match[1].toLowerCase())).first();
      if (user) mentions.push({ userId: normalizeIdValue(user._id) });
    }
    const result: any = await ctx.runMutation(
      (internal as any).communityInteractions.createCommunityInteractionComposerMessageForTrustedUserInternal,
      {
        trustedUserId: userId, communityId: args.communityId, channelId: channel._id,
        idempotencyKey: `${PREFIX}live:${memberKey}:${Date.now()}`, text, mentions,
      },
    );
    return { action: "post", member: memberKey, channel: channel.slug, rootId: result.interaction.root_id, mentions: mentions.length };
  },
});
