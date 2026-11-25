/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";

import { api } from "./_generated/api";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { actionTool, translateActionTool } from "../shared/actionTools";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const ORIGINAL_PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  process.env.PUBLIC_APP_URL = "https://www.polynet.ai";
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_APP_URL === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = ORIGINAL_PUBLIC_APP_URL;
});

async function seedFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner_subj",
      displayName: "Neil",
      handle: "neil",
      normalizedHandle: "neil",
      email: "owner@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: ownerId,
      displayName: "Neil",
      avatarUrl: "https://cdn.example.com/neil.png",
      createdAt: now,
      updatedAt: now,
    });
    await recordCurrentPlatformLegalAcceptance(ctx, {
      userId: ownerId,
      termsVersion: TERMS_OF_SERVICE_DOCUMENT.version,
      privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
      source: "test",
      acceptedAt: now,
    });
    const modId = await ctx.db.insert("users", {
      authSubject: "mod_subj",
      displayName: "Maya",
      handle: "maya",
      normalizedHandle: "maya",
      email: "maya@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "member_subj",
      displayName: "Sam",
      handle: "sam",
      normalizedHandle: "sam",
      email: "sam@example.com",
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders",
      name: "Builders",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: modId,
      role: "moderator",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    const generalId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: now,
      updatedAt: now,
    });
    const podId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "vip-pod",
      name: "VIP Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: now,
      updatedAt: now,
    });
    const week1 = now + 2 * DAY_MS;
    const week2 = week1 + WEEK_MS;
    const eventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Office Hours",
      startsAt: week1,
      endsAt: week1 + 60 * 60 * 1000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      createdAt: now,
      updatedAt: now,
    });
    const podEventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      podChannelId: podId,
      title: "Pod Standup",
      startsAt: week1,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now,
      updatedAt: now,
    });
    return { now, ownerId, modId, memberId, communityId, generalId, podId, eventId, podEventId, week1, week2 };
  });
}

async function runMcpTool(
  t: ReturnType<typeof convexTest>,
  actor: { authSubject: string; userId: string },
  toolName: string,
  args: Record<string, unknown>,
) {
  const translated = translateActionTool(actionTool(toolName)!, args, Date.now());
  return await t.run(async (ctx) =>
    executePolynetCanonicalTool({
      ctx: {
        runQuery: (ref: any, a: any) => (t as any).query(ref, a),
        runMutation: (ref: any, a: any) => (t as any).mutation(ref, a),
        runAction: (ref: any, a: any) => (t as any).action(ref, a),
      },
      authSubject: actor.authSubject,
      userId: actor.userId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      ownAiApp: "Claude",
      toolName: translated.toolName,
      input: translated.input,
    }),
  );
}

test("polynet_cancel_event asks the builder first, cancels only the requested weekly date with note on Yes, and rejects pod calls", async () => {
  const t = convexTest(schema, modules);
  const f = await seedFixture(t);
  const owner = { authSubject: "owner_subj", userId: String(f.ownerId) };

  // Pod call fails closed before asking.
  const podAttempt = await runMcpTool(t, owner, "polynet_cancel_event", {
    community: "builders",
    event: String(f.podEventId),
  });
  expect(podAttempt.ok).toBe(false);
  if (!podAttempt.ok) expect(podAttempt.code).toBe("event_is_pod_call");

  // Cancelling a single date waits for the builder's Yes in Polynet.
  const pending = await runMcpTool(t, owner, "polynet_cancel_event", {
    community: "builders",
    event: String(f.eventId),
    scope: "occurrence",
    occurrence_starts_at: new Date(f.week1).toISOString(),
    note: "Travelling this week.",
    idempotency_key: "cancel-week-1",
  });
  expect(pending.ok).toBe(true);
  if (pending.ok) {
    expect((pending.value as any).status).toBe("waiting_for_person");
    expect((pending.value as any).question).toContain("Weekly Office Hours");
    expect((pending.value as any).question).toContain("cancellation email");
  }

  // Event is NOT cancelled yet until the builder says Yes.
  const beforeYes = await t.run(async (ctx) => ctx.db.get(f.eventId));
  expect(beforeYes?.cancelledOccurrences ?? []).toHaveLength(0);

  // Builder approves the question card in Polynet.
  const asOwner = t.withIdentity({ subject: "owner_subj" });
  const questions = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
    authSubject: "owner_subj",
    communityId: f.communityId,
  });
  expect(questions).toHaveLength(1);
  expect(questions[0].text).toContain("Travelling this week.");
  expect(questions[0].canAlways).toBe(false);

  const answered = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
    authSubject: "owner_subj",
    communityId: f.communityId,
    questionId: questions[0].id as any,
    answer: "yes",
  });
  expect(answered).toMatchObject({ status: "done", line: "The event was cancelled." });

  // Only week 1 is cancelled with the note; series remains live for week 2.
  const afterYes = await t.run(async (ctx) => ctx.db.get(f.eventId));
  expect(afterYes?.status).toBe("live");
  expect(afterYes?.cancelledOccurrences).toHaveLength(1);
  expect(afterYes?.cancelledOccurrences?.[0]).toMatchObject({
    startsAt: f.week1,
    note: "Travelling this week.",
  });

  // Trying to cancel the same already-cancelled date with a fresh key fails early with nothing_to_change.
  const already = await runMcpTool(t, owner, "polynet_cancel_event", {
    community: "builders",
    event: String(f.eventId),
    scope: "occurrence",
    occurrence_starts_at: new Date(f.week1).toISOString(),
    idempotency_key: "cancel-week-1-again",
  });
  expect(already.ok).toBe(false);
  if (!already.ok) expect(already.code).toBe("nothing_to_change");
});

test("polynet_announce is builder-only, shared-channel-only, supports in-app-only without spending 72h email cooldown, and enforces cooldown when emailing", async () => {
  const t = convexTest(schema, modules);
  const f = await seedFixture(t);
  const owner = { authSubject: "owner_subj", userId: String(f.ownerId) };
  const moderator = { authSubject: "mod_subj", userId: String(f.modId) };
  const member = { authSubject: "member_subj", userId: String(f.memberId) };

  // Moderators and members fail closed.
  const modAttempt = await runMcpTool(t, moderator, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "Not allowed",
  });
  expect(modAttempt.ok).toBe(false);

  const memberAttempt = await runMcpTool(t, member, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "Not allowed",
  });
  expect(memberAttempt.ok).toBe(false);

  // Restricted pod channel fails closed.
  const podAttempt = await runMcpTool(t, owner, "polynet_announce", {
    community: "builders",
    channel: "vip-pod",
    text: "No pod announcements",
  });
  expect(podAttempt.ok).toBe(false);
  if (!podAttempt.ok) expect(podAttempt.code).toBe("channel_restricted");

  // Regular polynet_post still refuses @everybody so ask:every_time cannot be bypassed.
  const bypassAttempt = await runMcpTool(t, owner, "polynet_post", {
    community: "builders",
    channel: "general",
    text: "@everybody sneaking past approval",
  });
  expect(bypassAttempt.ok).toBe(false);
  if (!bypassAttempt.ok) expect(bypassAttempt.code).toBe("ai_post_mentions_everyone");

  // 1) Paired in-app-only announcement (send_email: false) asks first, posts with @everybody, and does NOT spend 72h email cooldown.
  const inAppPending = await runMcpTool(t, owner, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "No office hours this week — see you next Thursday!",
    send_email: false,
    idempotency_key: "announce-in-app",
  });
  expect(inAppPending.ok).toBe(true);
  if (inAppPending.ok) {
    expect((inAppPending.value as any).status).toBe("waiting_for_person");
    expect((inAppPending.value as any).question).toContain("in-app only, no email");
  }

  const asOwner = t.withIdentity({ subject: "owner_subj" });
  const q1 = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
    authSubject: "owner_subj",
    communityId: f.communityId,
  });
  expect(q1).toHaveLength(1);
  // The approval card shows the exact @everybody text that will be posted.
  expect(q1[0].text).toBe("@everybody No office hours this week — see you next Thursday!");
  const a1 = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
    authSubject: "owner_subj",
    communityId: f.communityId,
    questionId: q1[0].id as any,
    answer: "yes",
  });
  expect(a1).toMatchObject({ status: "done", line: "The announcement was posted." });

  const broadcasts1 = await t.run(async (ctx) => ctx.db.query("communityMentionBroadcasts").collect());
  expect(broadcasts1).toHaveLength(1);
  expect(broadcasts1[0].emailMode).toBe("in_app_only");

  // 2) Next announcement WITH email (default send_email: true) STILL gets in_app_and_email because in-app-only did not consume the 72h cooldown!
  const emailPending = await runMcpTool(t, owner, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "Big community launch tomorrow!",
    idempotency_key: "announce-with-email",
  });
  expect(emailPending.ok).toBe(true);
  if (emailPending.ok) {
    expect((emailPending.value as any).question).toContain("in the app and by email");
  }

  const q2 = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
    authSubject: "owner_subj",
    communityId: f.communityId,
  });
  expect(q2).toHaveLength(1);
  const a2 = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
    authSubject: "owner_subj",
    communityId: f.communityId,
    questionId: q2[0].id as any,
    answer: "yes",
  });
  expect(a2).toMatchObject({ status: "done" });

  const broadcasts2 = await t.run(async (ctx) => ctx.db.query("communityMentionBroadcasts").collect());
  expect(broadcasts2).toHaveLength(2);
  expect(broadcasts2.some((b) => b.emailMode === "in_app_and_email")).toBe(true);

  // 3) Third announcement within 72 hours clearly warns on the confirmation card that the 72-hour cooldown is active,
  //    AND stays strictly in-app-only even if the 72-hour cooldown expires before the builder clicks Yes!
  const cooldownPending = await runMcpTool(t, owner, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "Another update the same day.",
    idempotency_key: "announce-during-cooldown",
  });
  expect(cooldownPending.ok).toBe(true);
  if (cooldownPending.ok) {
    expect((cooldownPending.value as any).question).toContain("72-hour email cooldown is active");
  }

  const q3 = await asOwner.query(api.communityGuideQuestions.listGuideQuestions, {
    authSubject: "owner_subj",
    communityId: f.communityId,
  });
  expect(q3).toHaveLength(1);

  // Simulate the 72-hour cooldown expiring BEFORE the builder clicks Yes on the in-app-only card.
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("communityMentionBroadcasts").collect();
    for (const row of existing) {
      if (row.emailMode === "in_app_and_email") {
        await ctx.db.patch(row._id, {
          sourceCreatedAt: Date.now() - 80 * 60 * 60 * 1000,
          createdAt: Date.now() - 80 * 60 * 60 * 1000,
        });
      }
    }
  });

  const a3 = await asOwner.action(api.communityGuideQuestions.answerGuideQuestion, {
    authSubject: "owner_subj",
    communityId: f.communityId,
    questionId: q3[0].id as any,
    answer: "yes",
  });
  expect(a3).toMatchObject({ status: "done", line: "The announcement was posted." });

  const broadcasts3 = await t.run(async (ctx) => ctx.db.query("communityMentionBroadcasts").collect());
  expect(broadcasts3).toHaveLength(3);
  const newestBroadcast = broadcasts3.reduce((latest, row) => (row.createdAt > latest.createdAt ? row : latest));
  expect(newestBroadcast.emailMode).toBe("in_app_only");

  // 4) An announcement of 7,995 characters without @everybody is rejected up front instead of silently truncating the tail.
  const tooLongAttempt = await runMcpTool(t, owner, "polynet_announce", {
    community: "builders",
    channel: "general",
    text: "a".repeat(7_995),
    idempotency_key: "announce-too-long-after-prefix",
  });
  expect(tooLongAttempt.ok).toBe(false);
  if (!tooLongAttempt.ok) {
    expect(tooLongAttempt.code).toBe("invalid_tool_args");
    expect(tooLongAttempt.message).toContain("@everybody");
  }
});
