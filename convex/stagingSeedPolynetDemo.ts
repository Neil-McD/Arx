// Staging only: a demo community with the hi-fi mock's own content
// (docs/design/hifi-mock), so staging and the mock can be compared like for
// like (Neil, Nov 11). Creates "Polynet" (slug polynet-demo), owned by the
// owner of a source community, with the Earth banner, the mock's channels,
// members, the #wins conversation, an event and two notes.
// Refuses unless the deployment sets POLYNET_ALLOW_SEED=1.
//
// Everything is marked: simulated users have auth subject `seed:demo:<key>`,
// posts carry a `seed:demo:` idempotency key. Running it again re-dates the
// posts and the event to now; the community, users and channels are reused.
//
// Hand-run (staging):
//   npx convex run stagingSeedPolynetDemo:seedPolynetDemoInternal '{"sourceCommunitySlug":"founder-walk-nov7"}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import { createActiveCommunityChannel, ensureGeneralChannel } from "./communityChannelCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { normalizeIdValue, syncCommunityActiveMemberCount } from "./communityCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { buildCommunityNoteSearchText, communityNoteSlug } from "../shared/communityNotes";
import { writeCommunityResourceBodyContent } from "./communityResourceContent";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { nextLocalWeekdayAt } from "./stagingSeedSunrise";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PREFIX = "seed:demo:";
const DEMO_SLUG = "polynet-demo";
const DEMO_NAME = "Polynet";
const TIME_ZONE = "America/Los_Angeles";
const BANNER_URL = "https://polynet-staging.vercel.app/design-lab/polynet-earth.webp";

const MEMBERS = [
  { key: "jon", name: "Jon Park", handle: "jon-park", joinedDaysAgo: 140, bio: "Runs a 100-member founder circle. Invitations are my thing." },
  { key: "priya", name: "Priya Nair", handle: "priya-nair", joinedDaysAgo: 120, bio: "Priced three founding tiers. Ask me." },
  { key: "maya", name: "Maya Chen", handle: "maya-chen-demo", joinedDaysAgo: 60, bio: "Sending my first ten this week." },
  { key: "rashid", name: "Rashid Omar", handle: "rashid-omar", joinedDaysAgo: 90, bio: "First paid member just landed." },
  { key: "sara", name: "Sara Lind", handle: "sara-lind", joinedDaysAgo: 75, bio: "Live calls, every Thursday." },
  { key: "mira", name: "Mira Santos", handle: "mira-santos", joinedDaysAgo: 2, bio: "New here. Building a community for illustrators." },
  { key: "ana", name: "Ana Ruiz", handle: "ana-ruiz-demo", joinedDaysAgo: 50, bio: "" },
  { key: "tom", name: "Tom Becker", handle: "tom-becker", joinedDaysAgo: 44, bio: "" },
  { key: "ines", name: "Ines Duarte", handle: "ines-duarte", joinedDaysAgo: 38, bio: "" },
  { key: "dev", name: "Dev Patel", handle: "dev-patel-demo", joinedDaysAgo: 31, bio: "" },
  { key: "lena", name: "Lena Wolf", handle: "lena-wolf", joinedDaysAgo: 20, bio: "" },
  { key: "omar", name: "Omar Haddad", handle: "omar-haddad", joinedDaysAgo: 12, bio: "" },
] as const;
type MemberKey = (typeof MEMBERS)[number]["key"];
type Author = MemberKey | "owner" | "guide";

// The mock's #wins, then a little life in the other channels.
const POSTS: Array<{
  key: string; channel: "general" | "wins" | "tech" | "biz" | "founders"; by: Author; hoursAgo: number; text: string;
  replies: Array<{ by: Author; hoursAgo: number; text: string }>; reactions: Array<{ emoji: string; by: MemberKey[] }>;
}> = [
  { key: "rashid-first", channel: "wins", by: "rashid", hoursAgo: 17,
    text: "First paid member came in from the new door. Seventy-nine dollars never felt so good.",
    replies: [], reactions: [{ emoji: "🎉", by: ["jon", "priya", "maya", "sara", "ana", "tom", "ines", "dev", "lena"] }] },
  { key: "sara-call", channel: "wins", by: "sara", hoursAgo: 15,
    text: "Ran my first live call with eleven people. Nobody left early, which I'm counting as a win.",
    replies: [], reactions: [] },
  { key: "jon-100", channel: "wins", by: "jon", hoursAgo: 0.6,
    text: "We passed 100 members last night. The invitation that worked was three lines: the result, who it's for, one link.",
    replies: [
      { by: "priya", hoursAgo: 0.5, text: "Can you share the exact three lines?" },
      { by: "jon", hoursAgo: 0.45, text: "Sure: \"I got my first ten paying members in a month. This is for solo founders. Here's the door.\"" },
      { by: "maya", hoursAgo: 0.3, text: "Using this today." },
      { by: "owner", hoursAgo: 0.17, text: "Bring this to Friday, please." },
    ],
    reactions: [{ emoji: "🎉", by: ["priya", "maya", "rashid", "sara", "ana", "tom", "ines", "dev", "lena", "omar", "mira", "rashid"] }, { emoji: "🔥", by: ["priya", "maya", "rashid", "sara", "ana"] }] },
  { key: "priya-steal", channel: "wins", by: "priya", hoursAgo: 0.4, text: "Huge. Stealing that second line.", replies: [], reactions: [] },
  { key: "guide-saved", channel: "wins", by: "guide", hoursAgo: 0.38,
    text: "I've saved Jon's invitation to Knowledge, with his numbers. Two members asked for exactly this last week.",
    replies: [], reactions: [] },
  { key: "owner-play", channel: "wins", by: "owner", hoursAgo: 0.2,
    text: "This is the play. Jon, bring it to Friday's call so everyone can see it.", replies: [], reactions: [] },
  { key: "maya-ten", channel: "wins", by: "maya", hoursAgo: 0.05,
    text: "Sending my first ten today. Wish me luck.", replies: [], reactions: [{ emoji: "🚀", by: ["jon", "priya", "sara"] }] },
  { key: "mira-hello", channel: "general", by: "mira", hoursAgo: 30,
    text: "Hi everyone, I'm Mira. I'm building a community for illustrators and I'm here to learn how you all got your first members.",
    replies: [
      { by: "jon", hoursAgo: 29, text: "Welcome Mira! Start with ten people you already know." },
      { by: "priya", hoursAgo: 28, text: "Welcome! Happy to look at your pricing when you're ready." },
      { by: "sara", hoursAgo: 27, text: "Come to Friday's call, it's the best hour of the week." },
      { by: "guide", hoursAgo: 26.5, text: "Welcome, Mira. Jon's invitation note in Knowledge is a good first read." },
    ],
    reactions: [{ emoji: "👋", by: ["jon", "priya", "sara", "rashid", "maya"] }] },
  { key: "tech-stack", channel: "tech", by: "dev", hoursAgo: 40,
    text: "What are people using for the welcome email? Mine lands in promotions every time.",
    replies: [{ by: "tom", hoursAgo: 38, text: "Plain text, no images, and send it from a person. Fixed it for me." }], reactions: [] },
  { key: "biz-price", channel: "biz", by: "rashid", hoursAgo: 52,
    text: "How did you price your founding tier? Thinking $79 and doubling it after the first fifty.",
    replies: [{ by: "priya", hoursAgo: 50, text: "That's close to what worked for me. Say the date it goes up, and keep it." }], reactions: [] },
  { key: "founders-note", channel: "founders", by: "owner", hoursAgo: 20,
    text: "Founders only: Friday we'll look at three real invitations. Bring yours.", replies: [], reactions: [] },
];

const NOTES = [
  { title: "Invitations that work",
    body: "Lead with the result, say who it's for, and end with one link. Three lines beat longer invitations: Jon's reached 100 members this way." },
  { title: "Your first ten members",
    body: "Start with people who already trust you. Ask each of them personally, one at a time, and give them a reason to join this week." },
] as const;

function assertSeedAllowed() {
  if (process.env.POLYNET_ALLOW_SEED !== "1") throw new Error("seed_not_allowed_on_this_deployment");
}

async function upsertMember(ctx: any, communityId: any, member: (typeof MEMBERS)[number], nowMs: number) {
  const authSubject = `${PREFIX}${member.key}`;
  const holder = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", member.handle)).first();
  if (holder && holder.authSubject !== authSubject) throw new Error(`seed_handle_taken:${member.handle}`);
  // No photo: the app draws the initials, as the mock does.
  const fields = { displayName: member.name, handle: member.handle, normalizedHandle: member.handle, updatedAt: nowMs };
  const existing = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject)).unique();
  const userId = existing?._id ?? await ctx.db.insert("users", { authSubject, ...fields, createdAt: nowMs });
  if (existing) await ctx.db.patch(userId, fields);
  const detail = await getUniqueUserProfileDetailByUserId<any>(ctx, userId);
  const profile = { displayName: member.name, bio: member.bio, onboardingCompletedAt: nowMs, updatedAt: nowMs };
  if (detail) await ctx.db.patch(detail._id, profile);
  else await ctx.db.insert("userProfileDetails", { userId, ...profile, createdAt: nowMs });
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId, termsVersion: TERMS_OF_SERVICE_DOCUMENT.version, privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "staging_seed", acceptedAt: nowMs,
  });
  const joinedAt = nowMs - member.joinedDaysAgo * DAY_MS;
  const membership = await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).unique();
  const activation = { activationSequence: membership?.activationSequence ?? 1, activatedAt: membership?.activatedAt ?? joinedAt };
  if (membership) await ctx.db.patch(membership._id, { role: "member", state: "active", createdAt: joinedAt, updatedAt: nowMs, ...activation });
  else await ctx.db.insert("communityMemberships", {
    communityId, userId, role: "member", accessSource: "free_grant", state: "active", createdAt: joinedAt, updatedAt: nowMs, ...activation,
  } as any);
  return userId;
}

async function ensureChannel(ctx: any, communityId: any, ownerId: any, name: string, nowMs: number, accessMode?: "restricted") {
  const existing = await ctx.db.query("communityChannels")
    .withIndex("by_community_status_normalizedName", (q: any) =>
      q.eq("communityId", communityId).eq("status", "active").eq("normalizedName", name.toLowerCase())).first();
  return existing ?? await createActiveCommunityChannel({ ctx, communityId, createdByUserId: ownerId, name, nowMs, ...(accessMode ? { accessMode } : {}) });
}

async function clearSeededPosts(ctx: any, communityId: any) {
  let removed = 0;
  {
    const roots = await ctx.db.query("communityInteractionRoots")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId)).collect();
    for (const root of roots.filter((row: any) => String(row.idempotencyKey ?? "").startsWith(PREFIX))) {
      for (const reply of await ctx.db.query("communityInteractionReplies").withIndex("by_root_seq", (q: any) => q.eq("rootId", root._id)).collect()) {
        for (const row of await ctx.db.query("communityInteractionContentBlocks").withIndex("by_reply_order", (q: any) => q.eq("replyId", reply._id)).collect()) await ctx.db.delete(row._id);
        await ctx.db.delete(reply._id);
      }
      for (const table of ["communityInteractionContentBlocks", "communityInteractionReactions"] as const) {
        const index = table === "communityInteractionContentBlocks" ? "by_root_order" : "by_root";
        for (const row of await ctx.db.query(table).withIndex(index, (q: any) => q.eq("rootId", root._id)).collect()) await ctx.db.delete(row._id);
      }
      await ctx.db.delete(root._id);
      await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "root", objectId: root._id });
      removed += 1;
    }
  }
  return removed;
}

export const seedPolynetDemoInternal = internalMutation({
  args: { sourceCommunitySlug: v.string() },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const nowMs = Date.now();
    const ago = (hours: number) => Math.round(nowMs - hours * HOUR_MS);
    const source = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", args.sourceCommunitySlug)).unique();
    if (!source) throw new Error("seed_source_community_not_found");
    const ownerId = source.ownerId;

    // The community: the source's settings, its own name, slug and banner.
    let community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    const identity = {
      name: DEMO_NAME, bannerUrl: BANNER_URL, bannerFocusX: 0.72, bannerFocusY: 0.38, bannerZoom: 1, visibility: "unlisted", updatedAt: nowMs,
    };
    if (!community) {
      const { _id, _creationTime, bannerStorageId, avatarStorageId, avatarUrl, ...fields } = source;
      void _id; void _creationTime; void bannerStorageId; void avatarStorageId; void avatarUrl;
      const communityId = await ctx.db.insert("communities", { ...fields, ...identity, slug: DEMO_SLUG, createdAt: nowMs });
      const ownerMembership = await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", source._id).eq("userId", ownerId)).unique();
      if (ownerMembership) {
        const { _id: mid, _creationTime: mct, communityId: mcid, ...membership } = ownerMembership;
        void mid; void mct; void mcid;
        await ctx.db.insert("communityMemberships", { ...membership, communityId, createdAt: nowMs - 200 * DAY_MS, updatedAt: nowMs });
      }
      community = await ctx.db.get(communityId);
    } else {
      await ctx.db.patch(community._id, identity);
    }
    const communityId = community._id;

    const ids = {} as Record<Author, any>;
    for (const member of MEMBERS) ids[member.key] = await upsertMember(ctx, communityId, member, nowMs);
    ids.owner = ownerId;
    await syncCommunityActiveMemberCount({ ctx, communityId });

    const channels = {
      general: await ensureGeneralChannel({ ctx, communityId, nowMs }),
      wins: await ensureChannel(ctx, communityId, ownerId, "wins", nowMs),
      tech: await ensureChannel(ctx, communityId, ownerId, "tech", nowMs),
      biz: await ensureChannel(ctx, communityId, ownerId, "biz", nowMs),
      founders: await ensureChannel(ctx, communityId, ownerId, "founders", nowMs, "restricted"),
    };
    // The mock's lines next to each channel's name.
    const DESCRIPTIONS: Record<keyof typeof channels, string> = {
      general: "Say hello and ask anything", wins: "Share what worked", tech: "Tools, stacks and setups",
      biz: "Pricing, offers and money", founders: "Hosts only",
    };
    for (const [key, description] of Object.entries(DESCRIPTIONS)) {
      await ctx.db.patch(channels[key as keyof typeof channels]._id, { description });
    }
    for (const key of ["jon", "priya"] as const) {
      await setChannelParticipantCore(ctx, { communityId, channelId: channels.founders._id, createdByUserId: ownerId,
        active: true, target: { kind: "member", userId: ids[key] } });
    }

    const removedPosts = await clearSeededPosts(ctx, communityId);
    const actor = (by: Author) => by === "guide"
      ? { actorType: "community_agent", actorAgentKey: "community_agent" }
      : { actorType: "human", actorUserId: ids[by] };
    const block = (target: Record<string, unknown>, text: string, at: number) => ctx.db.insert("communityInteractionContentBlocks", {
      communityId, ...target, blockOrder: 0, blockType: "markdown_text", text, createdAt: at, updatedAt: at,
    });
    for (const post of POSTS) {
      const channel = channels[post.channel];
      const at = ago(post.hoursAgo);
      const lastReply = post.replies[post.replies.length - 1];
      const reactionSummary = post.reactions.map((reaction) => ({ emoji: reaction.emoji, count: new Set(reaction.by).size }));
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId, channelId: channel._id, ...actor(post.by), kind: "discussion", status: "live", visibilityScope: "community",
        contentSummary: post.text, replyCount: post.replies.length, reactionSummary, idempotencyKey: `${PREFIX}${post.key}`,
        ...(lastReply ? { lastReplyAt: ago(lastReply.hoursAgo) } : {}),
        createdAt: at, updatedAt: lastReply ? ago(lastReply.hoursAgo) : at,
      });
      await block({ rootId }, post.text, at);
      await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "root", objectId: rootId });
      for (const reaction of post.reactions) {
        for (const key of new Set(reaction.by)) {
          await ctx.db.insert("communityInteractionReactions", {
            communityId, targetType: "root", rootId, actorType: "human", actorKey: normalizeIdValue(ids[key]), actorUserId: ids[key],
            emoji: reaction.emoji, createdAt: at,
          });
        }
      }
      for (const [index, reply] of post.replies.entries()) {
        const replyAt = ago(reply.hoursAgo);
        const replyId = await ctx.db.insert("communityInteractionReplies", {
          communityId, channelId: channel._id, rootId, seq: index + 1, ...actor(reply.by), status: "live", visibilityScope: "community",
          contentSummary: reply.text, reactionSummary: [], idempotencyKey: `${PREFIX}${post.key}:${index}`, createdAt: replyAt, updatedAt: replyAt,
        });
        await block({ replyId }, reply.text, replyAt);
        await scheduleCommunityInteractionEvidenceSync({ ctx, communityId, objectType: "reply", objectId: replyId });
      }
    }

    // The Friday build call, hosted by the owner, re-dated to the next Friday.
    for (const event of await ctx.db.query("communityEvents").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect()) {
      if (event.title === "Friday build call") await ctx.db.delete(event._id);
    }
    const startsAt = nextLocalWeekdayAt(nowMs, 5, 10, 0, TIME_ZONE);
    await ctx.db.insert("communityEvents", {
      communityId, createdByUserId: ownerId, title: "Friday build call",
      descriptionMd: "We look at three real invitations together. Bring yours.",
      startsAt, endsAt: startsAt + 60 * 60 * 1000, timezone: TIME_ZONE, locationType: "online", locationLabel: "Video call",
      url: "https://meet.jit.si/polynet-demo-build-call", visibility: "public", status: "live", recurrenceFrequency: "none",
      createdAt: nowMs, updatedAt: nowMs,
    });

    for (const note of NOTES) {
      const slug = communityNoteSlug(note.title);
      const existing = await ctx.db.query("communityNotes").withIndex("by_community_slug", (q: any) => q.eq("communityId", communityId).eq("slug", slug)).first();
      const fields = { title: note.title, bodyMd: note.body, searchText: buildCommunityNoteSearchText({ title: note.title, bodyMd: note.body }), updatedByUserId: ownerId, updatedAt: nowMs };
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("communityNotes", { communityId, slug, source: "founder", createdByUserId: ownerId, createdAt: nowMs, ...fields });
    }

    return {
      communityId: normalizeIdValue(communityId), slug: DEMO_SLUG, owner: normalizeIdValue(ownerId),
      members: MEMBERS.length, channels: Object.keys(channels), posts: POSTS.length, removedPosts,
      event: new Date(startsAt).toISOString(), notes: NOTES.map((note) => note.title),
    };
  },
});

// Direct messages to the owner from demo members, through the real send path,
// so the Inbox has the mock's conversations. Stable client message ids make a
// second run a no-op.
//   npx convex run stagingSeedPolynetDemo:seedPolynetDemoMessagesInternal '{}'
const DIRECT_MESSAGES: Array<{ from: MemberKey; key: string; text: string }> = [
  { from: "jon", key: "jon-1", text: "Saw you're sending your first ten today." },
  { from: "jon", key: "jon-2", text: "Happy to share the full sequence if you want it." },
  { from: "sara", key: "sara-1", text: "How did you price your founding tier? Thinking about doing the same." },
  { from: "priya", key: "priya-1", text: "The onboarding thread is worth a read before Friday." },
  { from: "lena", key: "lena-1", text: "Loved your carousel breakdown. Could you share the template?" },
];

export const seedPolynetDemoMessagesInternal = internalMutation({
  // With `from` and `text`: one new message now, e.g. to check unread states.
  args: { from: v.optional(v.string()), text: v.optional(v.string()) },
  handler: async (ctx: any, args): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    if (!community) throw new Error("seed_demo_community_missing");
    const owner = await ctx.db.get(community.ownerId);
    const ownerHandle = String(owner?.normalizedHandle ?? owner?.handle ?? "").replace(/^@+/, "");
    if (!ownerHandle) throw new Error("seed_owner_has_no_handle");
    const sent = [];
    const batch = args.from && args.text
      ? [{ from: args.from as MemberKey, key: `live:${args.from}:${Date.now()}`, text: args.text }]
      : DIRECT_MESSAGES;
    for (const message of batch) {
      const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${PREFIX}${message.from}`)).unique();
      if (!user) throw new Error("seed_demo_not_seeded");
      const result: any = await ctx.runMutation(
        (internal as any).directMessages.sendSiteDirectMessageForTrustedUserInternal,
        { userId: user._id, communityId: community._id, handle: ownerHandle, text: message.text, clientMessageId: `${PREFIX}dm:${message.key}` },
      );
      sent.push({ from: message.from, conversationId: result.conversation_id });
    }
    return { to: ownerHandle, sent };
  },
});

// Members as a host sees them (docs/design/members-invariants.md): two prices
// side by side (a founding rate no longer offered), a card on hold, someone
// leaving, someone comped, what people have said about themselves, and people
// who are out. Run after seedPolynetDemoInternal. Demo users only.
const DEMO_PLANS: Partial<Record<MemberKey, { plan: "founding" | "member" | "comped"; status?: "past_due" | "cancel_at_period_end" }>> = {
  jon: { plan: "founding" }, priya: { plan: "founding" }, ana: { plan: "founding" },
  maya: { plan: "member" }, sara: { plan: "member" }, ines: { plan: "member" }, lena: { plan: "member" },
  rashid: { plan: "member", status: "cancel_at_period_end" }, mira: { plan: "member", status: "past_due" },
  tom: { plan: "comped" },
};
const DEMO_FACTS: Partial<Record<MemberKey, Array<{ kind: "goal" | "skill" | "situation"; body: string; provenance: "stated_interview" | "stated_bridge" | "form_answer" }>>> = {
  jon: [{ kind: "goal", body: "Just passed 100 members with a three-line invitation", provenance: "stated_interview" }, { kind: "skill", body: "Writing invitations that get answered", provenance: "stated_bridge" }],
  priya: [{ kind: "goal", body: "Pricing her founding tier", provenance: "stated_interview" }, { kind: "skill", body: "Pricing and founding tiers", provenance: "form_answer" }],
  maya: [{ kind: "goal", body: "Sending her first ten invitations this week", provenance: "stated_interview" }],
  rashid: [{ kind: "goal", body: "Turning his first paid member into ten", provenance: "stated_bridge" }],
  sara: [{ kind: "goal", body: "Running a live call every Thursday", provenance: "stated_interview" }, { kind: "situation", body: "Coaches studio owners in Austin", provenance: "form_answer" }],
  mira: [{ kind: "goal", body: "Building a community for illustrators", provenance: "form_answer" }],
  ana: [{ kind: "goal", body: "Moving her group over from Skool", provenance: "stated_bridge" }],
};
const DEMO_PAST = [
  { key: "kira", name: "Kira Vance", handle: "kira-vance-demo", plan: "member" as const, state: "left" as const, daysAgo: 9 },
  { key: "ben", name: "Ben Hollis", handle: "ben-hollis-demo", plan: "founding" as const, state: "lapsed" as const, daysAgo: 16 },
];

export const seedPolynetDemoMembersInternal = internalMutation({
  args: {},
  handler: async (ctx: any): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const nowMs = Date.now();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    if (!community) throw new Error("seed_demo_community_missing");
    const communityId = community._id;
    const price = async (name: string, amountBaseUnits: number, isCurrent: boolean) => {
      const existing = (await ctx.db.query("communityPricePoints").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect())
        .find((row: any) => row.name === name);
      if (existing) return existing._id;
      return await ctx.db.insert("communityPricePoints", { communityId, billingPeriod: "monthly", name, amountBaseUnits, currency: "usd",
        currencyDecimals: 2, isCurrent, ...(isCurrent ? {} : { archivedAt: nowMs - 60 * DAY_MS }), createdAt: nowMs - 150 * DAY_MS, updatedAt: nowMs });
    };
    const prices = { founding: await price("Founding", 700, false), member: await price("Member", 2700, true) };
    const userFor = async (key: string) => await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${PREFIX}${key}`)).unique();
    const membershipFor = async (userId: any) => await ctx.db.query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).unique();
    const subscribe = async (membership: any, pricePointId: any, status: "active" | "past_due" | "cancel_at_period_end" | "ended", endedAt?: number) => {
      for (const row of await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).collect()) {
        await ctx.db.delete(row._id);
      }
      await ctx.db.insert("communitySubscriptions", { communityId, userId: membership.userId, membershipId: membership._id, pricePointId,
        source: "external_sync", status, cancelAtPeriodEnd: status === "cancel_at_period_end", currentPeriodStartAt: nowMs - 10 * DAY_MS,
        currentPeriodEndAt: nowMs + 20 * DAY_MS, ...(status === "cancel_at_period_end" ? { cancelRequestedAt: nowMs - 2 * DAY_MS } : {}),
        ...(endedAt ? { endedAt } : {}), createdAt: nowMs - 30 * DAY_MS, updatedAt: status === "past_due" ? nowMs - 10 * DAY_MS : nowMs });
    };
    const done: string[] = [];
    for (const [key, setup] of Object.entries(DEMO_PLANS)) {
      const user = await userFor(key);
      const membership = user ? await membershipFor(user._id) : null;
      if (!membership || !setup) continue;
      if (setup.plan === "comped") {
        await ctx.db.patch(membership._id, { accessSource: "manual_grant", pricePointId: undefined, updatedAt: nowMs });
      } else {
        await ctx.db.patch(membership._id, { accessSource: "paid_subscription", pricePointId: prices[setup.plan],
          state: setup.status === "past_due" ? "payment_hold" : "active", updatedAt: nowMs });
        await subscribe({ ...membership }, prices[setup.plan], setup.status ?? "active");
      }
      done.push(key);
    }
    for (const [key, facts] of Object.entries(DEMO_FACTS)) {
      const user = await userFor(key);
      if (!user || !facts) continue;
      for (const row of await ctx.db.query("memberFacts").withIndex("by_user_community", (q: any) => q.eq("userId", user._id).eq("communityId", communityId)).collect()) {
        await ctx.db.delete(row._id);
      }
      for (const fact of facts) {
        await ctx.db.insert("memberFacts", { userId: user._id, communityId, kind: fact.kind, body: fact.body, provenance: fact.provenance,
          confidence: 1, evidenceRefs: [], stalenessScore: 0, consentState: "approved", createdByActorType: "member", createdByUserId: user._id,
          version: 1, createdAt: nowMs - 5 * DAY_MS, updatedAt: nowMs - 5 * DAY_MS });
      }
    }
    for (const past of DEMO_PAST) {
      const authSubject = `${PREFIX}${past.key}`;
      const existing = await userFor(past.key);
      const userId = existing?._id ?? await ctx.db.insert("users", { authSubject, displayName: past.name, handle: past.handle, normalizedHandle: past.handle, createdAt: nowMs - 120 * DAY_MS, updatedAt: nowMs });
      const at = nowMs - past.daysAgo * DAY_MS;
      const fields = { role: "member", accessSource: "paid_subscription", pricePointId: prices[past.plan], state: past.state, revokedAt: at,
        revokedReason: past.state, activationSequence: 1, activatedAt: nowMs - 100 * DAY_MS, updatedAt: at };
      const membership = await membershipFor(userId);
      const membershipId = membership?._id ?? await ctx.db.insert("communityMemberships", { communityId, userId, ...fields, createdAt: nowMs - 100 * DAY_MS });
      if (membership) await ctx.db.patch(membership._id, fields);
      await subscribe({ _id: membershipId, userId }, prices[past.plan], "ended", at);
      done.push(past.key);
    }
    const danaSubject = `${PREFIX}dana`;
    const dana = await userFor("dana") ?? null;
    const danaId = dana?._id ?? await ctx.db.insert("users", { authSubject: danaSubject, displayName: "Dana Whit", handle: "dana-whit-demo", normalizedHandle: "dana-whit-demo", createdAt: nowMs - 30 * DAY_MS, updatedAt: nowMs });
    const request = await ctx.db.query("communityJoinRequests").withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", danaId)).first();
    if (!request) await ctx.db.insert("communityJoinRequests", { communityId, userId: danaId, status: "denied", message: "Want to sell my course here.", deniedAt: nowMs - 21 * DAY_MS, createdAt: nowMs - 22 * DAY_MS, updatedAt: nowMs - 21 * DAY_MS });
    await syncCommunityActiveMemberCount({ ctx, communityId });
    return { prices, seeded: done };
  },
});

// Events as the mock has them: the Friday build call (weekly, people going),
// two more coming up hosted by others, and two past calls. Run after
// seedPolynetDemoInternal. Demo users only.
export const seedPolynetDemoEventsInternal = internalMutation({
  args: {},
  handler: async (ctx: any): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const nowMs = Date.now();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    if (!community) throw new Error("seed_demo_community_missing");
    const communityId = community._id;
    const userFor = async (key: string) => {
      const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${PREFIX}${key}`)).unique();
      if (!user) throw new Error("seed_demo_not_seeded");
      return user._id;
    };
    for (const event of await ctx.db.query("communityEvents").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect()) {
      for (const row of await ctx.db.query("communityEventGoing").withIndex("by_event_occurrence", (q: any) => q.eq("eventId", event._id)).collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(event._id);
    }
    const friday = nextLocalWeekdayAt(nowMs, 5, 10, 0, TIME_ZONE);
    const make = async (hostId: any, title: string, descriptionMd: string, startsAt: number, minutes: number, weekly = false) => await ctx.db.insert("communityEvents", {
      communityId, createdByUserId: hostId, title, descriptionMd, startsAt, endsAt: startsAt + minutes * 60 * 1000, timezone: TIME_ZONE,
      locationType: "online", locationLabel: "Video call", url: "https://meet.jit.si/polynet-demo-build-call", visibility: "members", status: "live",
      recurrenceFrequency: weekly ? "weekly" : "none", ...(weekly ? { recurrenceInterval: 1 } : {}), createdAt: nowMs, updatedAt: nowMs,
    });
    const going = async (eventId: any, occurrenceStartsAt: number, keys: string[]) => {
      for (const key of keys) await ctx.db.insert("communityEventGoing", { communityId, eventId, occurrenceStartsAt, userId: await userFor(key), createdAt: nowMs });
    };
    const build = await make(community.ownerId, "Friday build call", "Jon is bringing the invitation that took him past 100 members. Bring yours and we'll look at three together.", friday, 60, true);
    await going(build, friday, ["jon", "priya", "rashid", "sara", "maya", "ana", "tom", "lena"]);
    const teardownAt = nextLocalWeekdayAt(nowMs + 3 * DAY_MS, 2, 18, 0, TIME_ZONE);
    const teardown = await make(await userFor("priya"), "Door teardown: three members' join pages", "Priya walks through three join pages and what she'd change.", teardownAt, 60);
    await going(teardown, teardownAt, ["jon", "maya", "mira", "ines", "omar"]);
    const workshopAt = nextLocalWeekdayAt(nowMs + 8 * DAY_MS, 4, 13, 0, TIME_ZONE);
    const workshop = await make(community.ownerId, "Workshop: pricing your founding tier", "How to pick a founding price you can raise later.", workshopAt, 90);
    await going(workshop, workshopAt, ["priya", "rashid", "sara", "ana", "tom", "lena", "dev"]);
    await make(await userFor("jon"), "Invitation clinic", "Jon reviewed ten invitations live.", nowMs - 5 * DAY_MS, 50);
    await make(await userFor("sara"), "Live call practice", "Sara's first open practice call.", nowMs - 12 * DAY_MS, 45);
    return { build, teardown, workshop };
  },
});

// Knowledge as the mock has it: notes hosts wrote and notes saved earlier,
// a few related by their words, some from this week. Run after
// seedPolynetDemoInternal. Demo community only.
const KNOWLEDGE_NOTES: Array<{ title: string; body: string; source: "founder" | "ask" | "tag" | "migrated"; daysAgo: number }> = [
  { title: "The three-line door", body: "A join page that says what you get, who it's for, and the price converts better than a long one. See Invitations that work.", source: "founder", daysAgo: 2 },
  { title: "Founding tier pricing", body: "Start the founding tier low and say plainly that it goes up. Founding members keep their price when it rises.", source: "founder", daysAgo: 3 },
  { title: "Raising your price", body: "Tell founding members first, a month before. Their price stays; new members pay the new tier price.", source: "founder", daysAgo: 4 },
  { title: "Friday call rhythm", body: "Same time every week. Open with one win, look at three real invitations, end with one thing to try before next Friday.", source: "founder", daysAgo: 9 },
  { title: "Welcome sequence", body: "Welcome new members in #general the day they join, ask what they're building, and introduce one person working on the same thing.", source: "founder", daysAgo: 12 },
  { title: "What to post first", body: "Your first post should be a win, not an introduction. Members reply to results.", source: "ask", daysAgo: 15 },
  { title: "Pods of five", body: "Small pods of five members who check in weekly keep people coming back. Pick pods by what members are building.", source: "tag", daysAgo: 18 },
  { title: "Paid or free to join", body: "Paid communities keep more members past the first month. A small price filters for people who will show up to the Friday call.", source: "migrated", daysAgo: 30 },
  { title: "Following up after a call", body: "Post the recap within a day and tag the people whose invitations you looked at.", source: "founder", daysAgo: 6 },
  { title: "Writing your offer", body: "Say the result first, then who it's for. The same three lines work for the join page and for invitations.", source: "ask", daysAgo: 21 },
  { title: "Live call practice", body: "Run a practice call with three members before your first public one.", source: "tag", daysAgo: 25 },
  { title: "When someone goes quiet", body: "Send one personal message after two quiet weeks, asking what they're working on. Never a template.", source: "founder", daysAgo: 1 },
  { title: "Moving a group from Skool", body: "Move the most active ten first, then invite the rest with a date for the first call in the new home.", source: "migrated", daysAgo: 40 },
  { title: "Pricing a workshop", body: "Workshops can be free for members and paid for guests. Founding members always get them free.", source: "founder", daysAgo: 8 },
];

export const seedPolynetDemoKnowledgeInternal = internalMutation({
  args: {},
  handler: async (ctx: any): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const nowMs = Date.now();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    if (!community) throw new Error("seed_demo_community_missing");
    const communityId = community._id;
    let written = 0;
    for (const note of KNOWLEDGE_NOTES) {
      const slug = communityNoteSlug(note.title);
      const at = nowMs - note.daysAgo * DAY_MS;
      const fields = { title: note.title, bodyMd: note.body, source: note.source, searchText: buildCommunityNoteSearchText({ title: note.title, bodyMd: note.body }),
        updatedByUserId: community.ownerId, createdAt: at, updatedAt: at, createdByUserId: community.ownerId };
      const existing = await ctx.db.query("communityNotes").withIndex("by_community_slug", (q: any) => q.eq("communityId", communityId).eq("slug", slug)).first();
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("communityNotes", { communityId, slug, ...fields });
      written += 1;
    }
    return { written };
  },
});

// The classroom as the mock has it: three courses with short lessons, and some
// demo members part-way through. Run after seedPolynetDemoInternal.
const DEMO_COURSES: Array<{ name: string; about: string; lessons: Array<[string, string]> }> = [
  { name: "Launch your community", about: "From your first ten members to a weekly rhythm.", lessons: [
    ["What a community is for", "A community is a place where people get a result together. Before anything else, decide what that result is."],
    ["Name the result", "Write the result in one sentence a stranger would understand. If it needs a second sentence, it isn't clear yet."],
    ["Choose your first ten", "List ten people who already trust you and want this result. You will ask each of them personally."],
    ["Write your three-line invitation", "An invitation that gets answered has three lines. The first says the result someone will get. The second says who it's for. The third is one link.\n\nLonger invitations read like a pitch. Three lines read like a message from a person."],
    ["Send your first ten", "Send them one at a time, by hand. Reply to every answer the same day."],
    ["Welcome each person", "Welcome each new member in #general by name, and ask what they're building."],
    ["Plan your first call", "Pick one time every week. Open with a win, look at three real examples, end with one thing to try."],
    ["Run it", "Start on time, keep it to an hour, and record what people decided to try."],
    ["Follow up", "Post the recap within a day and tag the people whose work you looked at."],
  ] },
  { name: "Pricing your founding tier", about: "Pick a price you can raise later, and say so plainly.", lessons: [
    ["Why a founding price", "A founding price rewards the people who join first, and gives you a reason to raise it later."],
    ["Pick the number", "Start lower than feels comfortable. You are buying your first conversations."],
    ["Say it goes up", "Tell people plainly that the price rises, and that theirs never will."],
    ["Raise it", "Tell founding members first, a month ahead. New members pay the new price."],
    ["Workshops and extras", "Workshops can be free for members and paid for guests."],
  ] },
  { name: "Running a live call", about: "Plan it, run it, and follow up the same day.", lessons: [
    ["Before the call", "Send the link the day before and again an hour before."],
    ["The first five minutes", "Open with one win from a member. It sets the tone."],
    ["Looking at real work", "Three real examples beat any slide."],
    ["Ending well", "End with one thing each person will try before next week."],
    ["The recap", "Post what was decided within a day."],
    ["When few people come", "Run it anyway. A call with three people is a better call."],
  ] },
];

export const seedPolynetDemoCoursesInternal = internalMutation({
  args: {},
  handler: async (ctx: any): Promise<Record<string, any>> => {
    assertSeedAllowed();
    const nowMs = Date.now();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", DEMO_SLUG)).unique();
    if (!community) throw new Error("seed_demo_community_missing");
    const communityId = community._id;
    const ownerId = community.ownerId;
    const lessonIds: Record<string, any[]> = {};
    for (const [courseIndex, course] of DEMO_COURSES.entries()) {
      const modules = await ctx.db.query("communityResourceModules").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect();
      const existing = modules.find((row: any) => row.name === course.name);
      const fields = { status: "live", descriptionMd: course.about, sortOrder: (courseIndex + 1) * 1000, updatedAt: nowMs,
        ...(courseIndex === 0 ? { bannerUrl: BANNER_URL } : {}) };
      const moduleId = existing?._id ?? await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, name: course.name, ...fields, createdAt: nowMs });
      if (existing) await ctx.db.patch(moduleId, fields);
      const lessons = await ctx.db.query("communityResources").withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", moduleId)).collect();
      lessonIds[course.name] = [];
      for (const [index, [title, body]] of course.lessons.entries()) {
        const lessonFields = { type: "post", role: "page", status: "published", title, pinned: false,
          sourceIngestionStatus: "not_required", sourceIngestionKind: "manual", sortOrder: (index + 1) * 1000, updatedAt: nowMs };
        const found = lessons.find((row: any) => row.title === title);
        const resourceId = found?._id ?? await ctx.db.insert("communityResources", { communityId, moduleId, createdByUserId: ownerId, ...lessonFields, createdAt: nowMs });
        if (found) await ctx.db.patch(resourceId, lessonFields);
        await writeCommunityResourceBodyContent(ctx, { communityId, resourceId, bodyMd: body, nowMs });
        lessonIds[course.name].push(resourceId);
      }
    }
    // Demo members part-way through, so hosts see started and finished counts.
    const progress: Array<[MemberKey, string, number]> = [
      ["jon", "Launch your community", 9], ["priya", "Launch your community", 9], ["maya", "Launch your community", 3], ["sara", "Launch your community", 5],
      ["rashid", "Launch your community", 2], ["priya", "Pricing your founding tier", 5], ["ana", "Pricing your founding tier", 2], ["sara", "Running a live call", 6], ["jon", "Running a live call", 4],
    ];
    for (const [key, course, count] of progress) {
      const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", `${PREFIX}${key}`)).unique();
      if (!user) continue;
      for (const resourceId of lessonIds[course].slice(0, count)) {
        const existing = await ctx.db.query("communityLessonProgress").withIndex("by_user_resource", (q: any) => q.eq("userId", user._id).eq("resourceId", resourceId)).first();
        if (!existing) await ctx.db.insert("communityLessonProgress", { communityId, userId: user._id, resourceId, completedAt: nowMs - DAY_MS });
      }
    }
    return { courses: Object.fromEntries(Object.entries(lessonIds).map(([name, ids]) => [name, ids.length])) };
  },
});
