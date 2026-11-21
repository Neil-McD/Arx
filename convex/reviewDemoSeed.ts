// The demo community for app-directory reviewers (OpenAI, Anthropic): an
// Unlisted "Harbor Run Club" owned by the reviewer's own account, with
// made-up members, posts, a weekly run, a course, a handbook, people asking
// to join and direct messages. The plugin's test cases
// (plugins/openai/polynet/plugin.json) are written against exactly this.
//
// Safe on production by construction:
// - It refuses unless the deployment sets POLYNET_ALLOW_REVIEW_DEMO=1 (or the
//   staging seed switch POLYNET_ALLOW_SEED=1).
// - It only ever touches the community with slug harbor-run-club, and only
//   when its owner is the reviewer account (named by WorkOS user id or email). A community with
//   that slug owned by anyone else is refused, never changed.
// - Made-up members have auth subject `seed:review:<key>` and no email
//   address at all, so Polynet's normal email rules suppress anything
//   addressed to them (email.ts: no verified email, nothing is sent).
//
// Running the seed again re-dates everything to now. The reset also puts the
// test cases' changes back: Jordan Lee is a member again, the reviewer's
// waiting Yes cards are declined, and posts the reviewer made are removed.
//
//   npx convex run reviewDemoSeed:seedReviewDemoInternal '{"reviewer":"<WorkOS user id or email>"}'
//   npx convex run reviewDemoSeed:resetReviewDemoInternal '{"reviewer":"<WorkOS user id or email>"}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";
import { createActiveCommunityChannel, ensureGeneralChannel } from "./communityChannelCore";
import { ensureCommunityPresenceBaseline } from "./communityPresenceCore";
import { normalizeIdValue, syncCommunityActiveMemberCount } from "./communityCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { syncCommunitySearchDoc } from "./communitySearchDocs";
import { writeCommunityResourceBodyContent } from "./communityResourceContent";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { nextLocalWeekdayAt } from "./stagingSeedSunrise";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const REVIEW_DEMO_PREFIX = "seed:review:";
export const REVIEW_DEMO_SLUG = "harbor-run-club";
const REVIEW_DEMO_NAME = "Harbor Run Club";
const TIME_ZONE = "America/New_York";

type MemberSpec = { key: string; name: string; handle: string; joinedDaysAgo: number; bio: string; role?: "moderator" };
const MEMBERS: MemberSpec[] = [
  { key: "jordan", name: "Jordan Lee", handle: "jordan-lee-hrc", joinedDaysAgo: 90, bio: "Marathon number three this spring." },
  { key: "sam", name: "Sam Rivera", handle: "sam-rivera-hrc", joinedDaysAgo: 120, bio: "Paces the Saturday long run.", role: "moderator" },
  { key: "aisha", name: "Aisha Bello", handle: "aisha-bello-hrc", joinedDaysAgo: 60, bio: "Training for my first 10K." },
  { key: "tom", name: "Tom Becker", handle: "tom-becker-hrc", joinedDaysAgo: 45, bio: "" },
  { key: "mei", name: "Mei Tanaka", handle: "mei-tanaka-hrc", joinedDaysAgo: 30, bio: "Track Tuesdays, always." },
  { key: "luis", name: "Luis Ortega", handle: "luis-ortega-hrc", joinedDaysAgo: 8, bio: "New in town, looking for a running crew." },
];
// People asking to join, so the host tools have someone to answer.
const APPLICANTS = [
  { key: "alex", name: "Alex Kim", handle: "alex-kim-hrc", bio: "I run about 25 km a week and want a Saturday group." },
  { key: "morgan", name: "Morgan Diaz", handle: "morgan-diaz-hrc", bio: "Coming back from an injury, easing in." },
];
type Author = string; // a member key, or "owner"

const CHANNELS = [
  { key: "general", name: "general", description: "Say hello and ask anything" },
  { key: "training", name: "training", description: "Plans, paces and recovery" },
  { key: "gear", name: "gear", description: "Shoes, watches and what to wear" },
] as const;
type ChannelKey = (typeof CHANNELS)[number]["key"];

const POSTS: Array<{ key: string; channel: ChannelKey; by: Author; hoursAgo: number; text: string;
  replies: Array<{ by: Author; hoursAgo: number; text: string }>; reactions: Array<{ emoji: string; by: string[] }> }> = [
  { key: "welcome-luis", channel: "general", by: "luis", hoursAgo: 30,
    text: "Hi all, I'm Luis. Just moved here and looking for people to run with on weekends. Is the Saturday run OK for a 6:30 per km pace?",
    replies: [
      { by: "sam", hoursAgo: 28, text: "Welcome Luis! Yes, we split into an easy group and a steady group. 6:30 fits the easy group well." },
      { by: "aisha", hoursAgo: 27, text: "I'm in the easy group too, see you Saturday." },
    ], reactions: [{ emoji: "👋", by: ["sam", "aisha", "mei"] }] },
  { key: "knee-pain", channel: "training", by: "aisha", hoursAgo: 50,
    text: "My left knee aches after anything over 12 km. Has anyone dealt with knee pain when building up mileage?",
    replies: [
      { by: "jordan", hoursAgo: 48, text: "I had the same last year. Cutting my weekly increase to 10% and adding two strength sessions fixed it." },
      { by: "mei", hoursAgo: 47, text: "Worth checking your shoes too. Mine were 900 km old when my knee started hurting." },
    ], reactions: [{ emoji: "💪", by: ["jordan", "tom"] }] },
  { key: "long-run-route", channel: "general", by: "sam", hoursAgo: 20,
    text: "Saturday's long run starts at 7am from the Riverside boathouse. Easy group does 12 km, steady group 18 km.",
    replies: [{ by: "tom", hoursAgo: 18, text: "Count me in for the 18." }], reactions: [{ emoji: "🏃", by: ["tom", "jordan", "luis"] }] },
  { key: "track-tuesday", channel: "training", by: "mei", hoursAgo: 70,
    text: "Track Tuesday this week: 6 x 800 m with 400 m jog recoveries. Bring water, the fountain is broken.",
    replies: [], reactions: [{ emoji: "👍", by: ["aisha"] }] },
  { key: "shoes", channel: "gear", by: "tom", hoursAgo: 40,
    text: "What shoes are people using for long runs? Mine are done after 800 km.",
    replies: [
      { by: "jordan", hoursAgo: 39, text: "Something with more cushion than your race shoe. I rotate two pairs." },
    ], reactions: [] },
];

const LESSONS = [
  { title: "Week 1: Run-walk to 20 minutes", body: "Three runs this week. Each one: 1 minute running, 1 minute walking, ten times. Keep it easy enough to talk." },
  { title: "Week 2: Build to 25 minutes", body: "Same three runs, now 2 minutes running and 1 minute walking. If your knees ache, repeat week 1." },
  { title: "Week 3: Your first continuous 3 km", body: "Run 3 km without stopping at an easy pace. Walk breaks are fine if you need them; finishing matters more than pace." },
] as const;

const HANDBOOK = [
  "# Harbor Run Club",
  "",
  "We run together on Saturdays and Tuesdays. Every pace is welcome.",
  "",
  "- Saturday long run: 7am from the Riverside boathouse. Easy group 12 km, steady group 18 km.",
  "- Track Tuesday: 6pm at the city track.",
  "- Be kind, wait at the turnaround, and say if you're hurt.",
].join("\n");

const DIRECT_MESSAGES = [
  { from: "jordan", key: "jordan-1", text: "Hey, could I help pace the easy group on Saturday?" },
  { from: "aisha", key: "aisha-1", text: "Thanks for the knee tips thread. Is the 10K plan good for a beginner like me?" },
] as const;

function assertReviewDemoAllowed() {
  if (process.env.POLYNET_ALLOW_REVIEW_DEMO !== "1" && process.env.POLYNET_ALLOW_SEED !== "1") {
    throw new Error("review_demo_not_allowed_on_this_deployment");
  }
}

// The reviewer: their WorkOS user id (user_...) or their email. An account
// that has only ever signed in through an AI app may have no email on file,
// so the id is the dependable handle.
async function findReviewer(ctx: any, reviewer: string) {
  const value = String(reviewer ?? "").trim();
  if (!value) throw new Error("review_demo_reviewer_required");
  const rows = value.includes("@")
    ? await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", value.toLowerCase())).collect()
    : await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", value)).collect();
  if (rows.length !== 1) throw new Error(rows.length ? "review_demo_reviewer_ambiguous" : "review_demo_reviewer_not_found");
  const found = rows[0];
  if (String(found.authSubject ?? "").startsWith("seed:")) throw new Error("review_demo_reviewer_must_be_a_real_account");
  return found;
}

// The reviewer signs in only through an AI app (email and password on the
// AuthKit page), never through the website's profile setup, so its name,
// handle and terms acceptance are filled in here. Only what's missing.
const REVIEWER_HANDLE = "polynet-reviewer";
const REVIEWER_NAME = "Polynet Reviewer";
async function completeReviewerProfile(ctx: any, reviewer: any, nowMs: number) {
  let handle = String(reviewer.handle ?? "").trim();
  if (!handle) {
    const holder = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", REVIEWER_HANDLE)).first();
    if (holder && normalizeIdValue(holder._id) !== normalizeIdValue(reviewer._id)) throw new Error("review_demo_reviewer_handle_taken");
    handle = REVIEWER_HANDLE;
    await ctx.db.patch(reviewer._id, { handle, normalizedHandle: handle, updatedAt: nowMs });
  }
  const detail = await getUniqueUserProfileDetailByUserId<any>(ctx, reviewer._id);
  const displayName = String(detail?.displayName ?? reviewer.displayName ?? "").trim() || REVIEWER_NAME;
  if (!detail) await ctx.db.insert("userProfileDetails", { userId: reviewer._id, displayName, bio: "", onboardingCompletedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
  else if (!String(detail.displayName ?? "").trim() || !detail.onboardingCompletedAt) {
    await ctx.db.patch(detail._id, { displayName, onboardingCompletedAt: detail.onboardingCompletedAt ?? nowMs, updatedAt: nowMs });
  }
  if (!String(reviewer.displayName ?? "").trim()) await ctx.db.patch(reviewer._id, { displayName, updatedAt: nowMs });
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId: reviewer._id, termsVersion: TERMS_OF_SERVICE_DOCUMENT.version, privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "review_demo_seed", acceptedAt: nowMs,
  });
  return handle;
}

// The demo community, only if the reviewer owns it. Anyone else's community
// with this slug is never touched.
async function demoCommunityFor(ctx: any, reviewerId: any) {
  const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", REVIEW_DEMO_SLUG)).unique();
  if (community && normalizeIdValue(community.ownerId) !== normalizeIdValue(reviewerId)) {
    throw new Error("review_demo_slug_owned_by_someone_else");
  }
  return community;
}

async function upsertPerson(ctx: any, person: { key: string; name: string; handle: string; bio?: string }, nowMs: number) {
  const authSubject = `${REVIEW_DEMO_PREFIX}${person.key}`;
  const holder = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", person.handle)).first();
  if (holder && holder.authSubject !== authSubject) throw new Error(`review_demo_handle_taken:${person.handle}`);
  // No email: nothing Polynet sends can reach a made-up person.
  const fields = { displayName: person.name, handle: person.handle, normalizedHandle: person.handle, updatedAt: nowMs };
  const existing = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject)).unique();
  const userId = existing?._id ?? await ctx.db.insert("users", { authSubject, ...fields, createdAt: nowMs });
  if (existing) await ctx.db.patch(userId, fields);
  const detail = await getUniqueUserProfileDetailByUserId<any>(ctx, userId);
  const profile = { displayName: person.name, bio: person.bio ?? "", onboardingCompletedAt: nowMs, updatedAt: nowMs };
  if (detail) await ctx.db.patch(detail._id, profile);
  else await ctx.db.insert("userProfileDetails", { userId, ...profile, createdAt: nowMs });
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId, termsVersion: TERMS_OF_SERVICE_DOCUMENT.version, privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "review_demo_seed", acceptedAt: nowMs,
  });
  return userId;
}

async function upsertMembership(ctx: any, communityId: any, userId: any, role: "member" | "moderator", joinedAt: number, nowMs: number) {
  const membership = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).unique();
  const activation = { activationSequence: membership?.activationSequence ?? 1, activatedAt: membership?.activatedAt ?? joinedAt };
  if (membership) await ctx.db.patch(membership._id, { role, state: "active", createdAt: joinedAt, updatedAt: nowMs, ...activation });
  else await ctx.db.insert("communityMemberships", {
    communityId, userId, role, accessSource: "free_grant", state: "active", createdAt: joinedAt, updatedAt: nowMs, ...activation,
  } as any);
}

async function ensureChannel(ctx: any, communityId: any, ownerId: any, name: string, nowMs: number) {
  if (name === "general") return await ensureGeneralChannel({ ctx, communityId, nowMs });
  const existing = await ctx.db.query("communityChannels")
    .withIndex("by_community_status_normalizedName", (q: any) =>
      q.eq("communityId", communityId).eq("status", "active").eq("normalizedName", name.toLowerCase())).first();
  return existing ?? await createActiveCommunityChannel({ ctx, communityId, createdByUserId: ownerId, name, nowMs });
}

async function deleteThread(ctx: any, communityId: any, root: any) {
  for (const reply of await ctx.db.query("communityInteractionReplies").withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id)).collect()) {
    for (const row of await ctx.db.query("communityInteractionContentBlocks").withIndex("by_reply_order", (q: any) => q.eq("replyId", reply._id)).collect()) await ctx.db.delete(row._id);
    await ctx.db.delete(reply._id);
  }
  for (const row of await ctx.db.query("communityInteractionContentBlocks").withIndex("by_root_order", (q: any) => q.eq("rootId", root._id)).collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("communityInteractionReactions").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).collect()) await ctx.db.delete(row._id);
  await ctx.db.delete(root._id);
  await syncCommunitySearchDoc(ctx, { communityId, objectType: "root", objectId: root._id });
  await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "root", objectId: root._id });
}

// Every post in the demo community, or only the seeded ones.
async function clearPosts(ctx: any, communityId: any, which: "seeded" | "all") {
  let removed = 0;
  const roots = await ctx.db.query("communityInteractionRoots")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId)).collect();
  for (const root of roots) {
    if (which === "seeded" && !String(root.idempotencyKey ?? "").startsWith(REVIEW_DEMO_PREFIX)) continue;
    await deleteThread(ctx, communityId, root);
    removed += 1;
  }
  return removed;
}

async function createDemoCommunity(ctx: any, ownerId: any, nowMs: number) {
  const communityId = await ctx.db.insert("communities", {
    ownerId, slug: REVIEW_DEMO_SLUG, name: REVIEW_DEMO_NAME, lifecycleStatus: "active", lifecycleGeneration: 0,
    builderKnowledgeSetupPending: false, oneLiner: "Saturday long runs and Tuesday track, every pace welcome.",
    avatarFocusX: 0.5, avatarFocusY: 0.5, avatarZoom: 1, bannerFocusX: 0.5, bannerFocusY: 0.5, bannerZoom: 1,
    brandingRevision: nowMs, settingsRevision: 0, visibility: "unlisted",
    inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED, entryPolicy: "approval", activeMemberCount: 1,
    createdAt: nowMs - 200 * DAY_MS, updatedAt: nowMs,
  } as any);
  await ensureCommunityPresenceBaseline({ ctx, communityId, userId: ownerId, baselineAt: nowMs });
  return communityId;
}

export const seedReviewDemoInternal = internalMutation({
  args: { reviewer: v.string() },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertReviewDemoAllowed();
    const nowMs = Date.now();
    const ago = (hours: number) => Math.round(nowMs - hours * HOUR_MS);
    const reviewer = await findReviewer(ctx, args.reviewer);
    const ownerId = reviewer._id;
    const reviewerHandle = await completeReviewerProfile(ctx, reviewer, nowMs);
    const existing = await demoCommunityFor(ctx, ownerId);
    const communityId = existing?._id ?? await createDemoCommunity(ctx, ownerId, nowMs);
    if (existing) await ctx.db.patch(communityId, { visibility: "unlisted", entryPolicy: "approval", updatedAt: nowMs });

    const ids: Record<string, any> = { owner: ownerId };
    for (const member of MEMBERS) {
      ids[member.key] = await upsertPerson(ctx, member, nowMs);
      await upsertMembership(ctx, communityId, ids[member.key], member.role ?? "member", nowMs - member.joinedDaysAgo * DAY_MS, nowMs);
    }

    // People waiting to join, answered fresh each run.
    for (const applicant of APPLICANTS) {
      const userId = await upsertPerson(ctx, applicant, nowMs);
      const membership = await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).unique();
      if (membership) await ctx.db.delete(membership._id);
      for (const row of await ctx.db.query("communityJoinRequests").withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).collect()) {
        await ctx.db.delete(row._id);
      }
      await ctx.db.insert("communityJoinRequests", { communityId, userId, status: "pending", createdAt: ago(6), updatedAt: ago(6) });
    }
    // Counted after the applicants are back to waiting, in case a run let one in.
    await syncCommunityActiveMemberCount({ ctx, communityId });

    const channels: Record<string, any> = {};
    for (const channel of CHANNELS) {
      channels[channel.key] = await ensureChannel(ctx, communityId, ownerId, channel.name, nowMs);
      await ctx.db.patch(channels[channel.key]._id, { description: channel.description });
    }

    const removedPosts = await clearPosts(ctx, communityId, "seeded");
    const block = (target: Record<string, unknown>, text: string, at: number) => ctx.db.insert("communityInteractionContentBlocks", {
      communityId, ...target, blockOrder: 0, blockType: "markdown_text", text, createdAt: at, updatedAt: at,
    });
    for (const post of POSTS) {
      const channel = channels[post.channel];
      const at = ago(post.hoursAgo);
      const lastReply = post.replies[post.replies.length - 1];
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId, channelId: channel._id, actorType: "human", actorUserId: ids[post.by], kind: "discussion", status: "live",
        visibilityScope: "community", contentSummary: post.text, replyCount: post.replies.length,
        reactionSummary: post.reactions.map((reaction) => ({ emoji: reaction.emoji, count: new Set(reaction.by).size })),
        idempotencyKey: `${REVIEW_DEMO_PREFIX}${post.key}`, ...(lastReply ? { lastReplyAt: ago(lastReply.hoursAgo) } : {}),
        createdAt: at, updatedAt: lastReply ? ago(lastReply.hoursAgo) : at,
      });
      await block({ rootId }, post.text, at);
      for (const reaction of post.reactions) {
        for (const key of new Set(reaction.by)) {
          await ctx.db.insert("communityInteractionReactions", {
            communityId, targetType: "root", rootId, actorType: "human", actorKey: normalizeIdValue(ids[key]), actorUserId: ids[key],
            emoji: reaction.emoji, createdAt: at,
          });
        }
      }
      await syncCommunitySearchDoc(ctx, { communityId, objectType: "root", objectId: rootId });
      await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "root", objectId: rootId });
      for (const [index, reply] of post.replies.entries()) {
        const replyAt = ago(reply.hoursAgo);
        const replyId = await ctx.db.insert("communityInteractionReplies", {
          communityId, channelId: channel._id, rootId, seq: index + 1, actorType: "human", actorUserId: ids[reply.by], status: "live",
          visibilityScope: "community", contentSummary: reply.text, reactionSummary: [],
          idempotencyKey: `${REVIEW_DEMO_PREFIX}${post.key}:${index}`, createdAt: replyAt, updatedAt: replyAt,
        });
        await block({ replyId }, reply.text, replyAt);
        await syncCommunitySearchDoc(ctx, { communityId, objectType: "reply", objectId: replyId });
        await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "reply", objectId: replyId });
      }
    }

    // Events, re-dated to come: the weekly long run (shown once, with its
    // next dates) and this week's track session.
    for (const event of await ctx.db.query("communityEvents").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect()) {
      await ctx.db.delete(event._id);
    }
    const saturday = nextLocalWeekdayAt(nowMs, 6, 7, 0, TIME_ZONE);
    const tuesday = nextLocalWeekdayAt(nowMs, 2, 18, 0, TIME_ZONE);
    const event = (fields: Record<string, unknown>) => ctx.db.insert("communityEvents", {
      communityId, createdByUserId: ownerId, timezone: TIME_ZONE, visibility: "public", status: "live", createdAt: nowMs, updatedAt: nowMs, ...fields,
    });
    await event({ title: "Saturday long run", descriptionMd: "Easy group 12 km, steady group 18 km. Coffee after.",
      startsAt: saturday, endsAt: saturday + 2 * HOUR_MS, locationType: "physical", locationLabel: "Riverside boathouse", recurrenceFrequency: "weekly" });
    await event({ title: "Track Tuesday", descriptionMd: "6 x 800 m with 400 m jog recoveries.",
      startsAt: tuesday, endsAt: tuesday + HOUR_MS, locationType: "physical", locationLabel: "City track", recurrenceFrequency: "none" });

    // The course: one live course with three published lessons.
    const modules = await ctx.db.query("communityResourceModules").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect();
    let module = modules.find((row: any) => row.name === "First 10K plan");
    const moduleFields = { status: "live", descriptionMd: "Three weeks from run-walk to your first continuous 3 km.", updatedAt: nowMs };
    if (module) await ctx.db.patch(module._id, moduleFields);
    else {
      await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, name: "First 10K plan", ...moduleFields, sortOrder: 1000, createdAt: nowMs });
      module = (await ctx.db.query("communityResourceModules").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect())
        .find((row: any) => row.name === "First 10K plan");
    }
    const lessons = await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id)).collect();
    for (const lesson of lessons) {
      if (!LESSONS.some((entry) => entry.title === lesson.title)) await ctx.db.delete(lesson._id);
    }
    for (const [index, lesson] of LESSONS.entries()) {
      const fields = { type: "post", role: "page", status: "published", title: lesson.title, pinned: false,
        sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", sortOrder: (index + 1) * 1000, updatedAt: nowMs };
      const found = lessons.find((row: any) => row.title === lesson.title);
      const resourceId = found?._id ?? await ctx.db.insert("communityResources", {
        communityId, moduleId: module._id, createdByUserId: ownerId, ...fields, createdAt: nowMs,
      });
      if (found) await ctx.db.patch(resourceId, fields);
      await writeCommunityResourceBodyContent(ctx, { communityId, resourceId, bodyMd: lesson.body, nowMs });
    }

    // The handbook members and the guide read.
    const handbook = await ctx.db.query("communityHandbooks").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
    const handbookFields = { approvedMd: HANDBOOK, approvedAt: nowMs, approvedByUserId: ownerId, draftMd: undefined, draftStatus: "idle", updatedAt: nowMs };
    if (handbook) await ctx.db.patch(handbook._id, handbookFields);
    else await ctx.db.insert("communityHandbooks", { communityId, ...handbookFields, createdAt: nowMs });

    return {
      communityId: normalizeIdValue(communityId), slug: REVIEW_DEMO_SLUG, created: !existing, owner: normalizeIdValue(ownerId), reviewerHandle,
      members: MEMBERS.map((member) => member.name), applicants: APPLICANTS.map((applicant) => applicant.name),
      posts: POSTS.length, removedPosts, saturday: new Date(saturday).toISOString(), tuesday: new Date(tuesday).toISOString(),
      lessons: LESSONS.length,
    };
  },
});

// Direct messages to the reviewer from two members, through the real send
// path. Stable client message ids make a second run a no-op.
export const seedReviewDemoMessagesInternal = internalMutation({
  args: { reviewer: v.string() },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertReviewDemoAllowed();
    const reviewer = await findReviewer(ctx, args.reviewer);
    const community = await demoCommunityFor(ctx, reviewer._id);
    if (!community) throw new Error("review_demo_not_seeded");
    const handle = String(reviewer.normalizedHandle ?? reviewer.handle ?? "").replace(/^@+/, "");
    if (!handle) throw new Error("review_demo_reviewer_has_no_handle");
    const sent = [];
    for (const message of DIRECT_MESSAGES) {
      const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${REVIEW_DEMO_PREFIX}${message.from}`)).unique();
      if (!user) throw new Error("review_demo_not_seeded");
      const result: any = await ctx.runMutation((internal as any).directMessages.sendSiteDirectMessageForTrustedUserInternal, {
        userId: user._id, communityId: community._id, handle, text: message.text, clientMessageId: `${REVIEW_DEMO_PREFIX}dm:${message.key}`,
      });
      sent.push({ from: message.from, conversationId: result.conversation_id });
    }
    return { to: handle, sent };
  },
});

// Puts back what the test cases change (including the duplicate-post memory
// of the reviewer's test words), then runs the seed again:
// Jordan Lee is a member again, the reviewer's waiting Yes cards in this
// community are declined, and every post that isn't seeded (the reviewer's
// test posts) is removed.
export const resetReviewDemoInternal = internalMutation({
  args: { reviewer: v.string() },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertReviewDemoAllowed();
    const nowMs = Date.now();
    const reviewer = await findReviewer(ctx, args.reviewer);
    const community = await demoCommunityFor(ctx, reviewer._id);
    if (!community) throw new Error("review_demo_not_seeded");
    const communityId = community._id;
    let declined = 0;
    for (const status of ["waiting", "running"] as const) {
      const rows = await ctx.db.query("communityGuideQuestions")
        .withIndex("by_community_user_status_createdAt", (q: any) => q.eq("communityId", communityId).eq("userId", reviewer._id).eq("status", status)).collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { status: "declined", answeredAt: nowMs });
        declined += 1;
      }
    }
    const removedPosts = await clearPosts(ctx, communityId, "all");
    // The duplicate-post check remembers the reviewer's words for a day; a
    // fresh run posts the same test words again.
    let clearedFingerprints = 0;
    for (const row of await ctx.db.query("aiPostFingerprints")
      .withIndex("by_user_community_fingerprint", (q: any) => q.eq("userId", reviewer._id).eq("communityId", communityId)).collect()) {
      await ctx.db.delete(row._id);
      clearedFingerprints += 1;
    }
    for (const member of MEMBERS) {
      const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${REVIEW_DEMO_PREFIX}${member.key}`)).unique();
      if (user) await upsertMembership(ctx, communityId, user._id, member.role ?? "member", nowMs - member.joinedDaysAgo * DAY_MS, nowMs);
    }
    // A member removed or banned during a run comes back.
    for (const block of await ctx.db.query("communityBlocks").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect()) {
      if (!block.liftedAt) await ctx.db.patch(block._id, { liftedAt: nowMs, updatedAt: nowMs });
    }
    await syncCommunityActiveMemberCount({ ctx, communityId });
    // Then the seed puts the posts, events, course and join requests back.
    await ctx.scheduler.runAfter(0, (internal as any).reviewDemoSeed.seedReviewDemoInternal, { reviewer: args.reviewer });
    return { communityId: normalizeIdValue(communityId), declinedQuestions: declined, removedPosts, clearedFingerprints, reseeding: true };
  },
});
