/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  briefMarkdown,
  deterministicBrief,
  localDateAndHour,
  nextOccurrenceMs,
  parseBrief,
  snapshotIsQuiet,
  type FounderBriefSnapshot,
} from "./communityFounderBrief";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "./_generated/**/*.*s"]);
const internalRefs = internal as any;
const HOUR_MS = 60 * 60 * 1000;
const DAY = 24 * HOUR_MS;
const originalPublicAppUrl = process.env.ARX_PUBLIC_APP_URL;

beforeAll(() => {
  process.env.ARX_PUBLIC_APP_URL = "https://polynet.test";
});

afterAll(() => {
  if (originalPublicAppUrl === undefined) delete process.env.ARX_PUBLIC_APP_URL;
  else process.env.ARX_PUBLIC_APP_URL = originalPublicAppUrl;
});

const quiet: FounderBriefSnapshot = {
  communityName: "Dawn Patrol",
  memberCount: 12,
  windowHours: 24,
  newMembers: { count: 0, names: [] },
  activity: { posts: 0, replies: 0, activePeople: 0 },
  week: { joined: 0, activePeople: 0, messages: 0 },
  busiest: null,
  highlight: null,
  unanswered: [],
  quietNewcomers: { count: 1, names: ["Sam"] },
  joinRequestsPending: 0,
  upcomingEvents: [],
};

describe("founder brief writing", () => {
  it("reads the founder's local date and hour", () => {
    const nowMs = Date.parse("2026-10-26T13:30:00.000Z");
    expect(localDateAndHour(nowMs, "America/New_York")).toEqual({ date: "2026-10-26", hour: 9 });
    expect(localDateAndHour(nowMs, "Asia/Tokyo")).toEqual({ date: "2026-10-26", hour: 22 });
    expect(localDateAndHour(Date.parse("2026-10-26T02:00:00.000Z"), "America/Los_Angeles").date).toBe("2026-10-25");
  });

  it("writes a plain brief: quiet days get one nudge, busy days lead with what's waiting", () => {
    expect(snapshotIsQuiet(quiet)).toBe(true);
    expect(deterministicBrief(quiet)).toMatchObject({ headline: "A quiet day in Dawn Patrol", nextStep: "Say hello to a quiet newcomer: Sam." });
    const busy = deterministicBrief({
      ...quiet,
      newMembers: { count: 2, names: ["Ana", "Ben"] },
      activity: { posts: 3, replies: 1, activePeople: 2 },
      unanswered: [{ author: "Ana", channel: "general", text: "Where do we meet?", hoursAgo: 5 }],
      joinRequestsPending: 1,
    });
    expect(busy.headline).toBe("2 things waiting on you in Dawn Patrol");
    expect(busy.sections.map((section) => section.title)).toEqual(["Waiting on you", "People", "Activity"]);
    expect(busy.sections[0].items).toEqual(["1 join request to review.", 'Ana in #general, 5h with no reply: "Where do we meet?"']);
    expect(busy.nextStep).toBe("Reply to Ana in #general.");
    expect(briefMarkdown(busy)).toContain("### Waiting on you\n- 1 join request to review.");
  });

  it("accepts only a bounded, well-formed model brief", () => {
    const parsed = parseBrief('Here you go:\n{"headline":"Two people need you","sections":[{"title":"Waiting","items":["Reply to Ana", ""]},{"title":"","items":["x"]}],"next_step":"Reply to Ana"}');
    expect(parsed).toEqual({ headline: "Two people need you", sections: [{ title: "Waiting", items: ["Reply to Ana"] }], nextStep: "Reply to Ana" });
    expect(parseBrief("not json")).toBeNull();
    expect(parseBrief('{"headline":"","sections":[]}')).toBeNull();
    const long = parseBrief(JSON.stringify({ headline: "h", sections: [{ title: "t", items: Array.from({ length: 9 }, () => "y".repeat(400)) }] }))!;
    expect(long.sections[0].items).toHaveLength(5);
    expect(long.sections[0].items[0].length).toBeLessThanOrEqual(260);
  });
});

async function fixture(t: ReturnType<typeof convexTest>, nowMs: number) {
  return await t.run(async (ctx) => {
    const user = async (name: string) => ctx.db.insert("users", {
      authSubject: `brief-${name}`, displayName: name, handle: `brief-${name.toLowerCase()}`,
      normalizedHandle: `brief-${name.toLowerCase()}`, email: `${name.toLowerCase()}@example.com`,
      emailVerifiedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    const ownerId = await user("Owner");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "dawn-patrol", name: "Dawn Patrol", lifecycleStatus: "active", lifecycleGeneration: 0,
      visibility: "published", inferenceFundingPolicy: "managed_required", entryPolicy: "open",
      createdAt: nowMs - 30 * 24 * HOUR_MS, updatedAt: nowMs,
    } as any);
    const channelId = await ctx.db.insert("communityChannels", {
      communityId, systemRole: "general", slug: "general", name: "general", accessMode: "all_members",
      postingPolicy: "members", status: "active", position: 0, createdByUserId: ownerId, createdAt: nowMs, updatedAt: nowMs,
    } as any);
    const member = async (name: string, joinedAgoHours: number) => {
      const userId = await user(name);
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role: "member", accessSource: "free_grant", state: "active",
        createdAt: nowMs - joinedAgoHours * HOUR_MS, updatedAt: nowMs,
      } as any);
      return userId;
    };
    const ana = await member("Ana", 5);
    await member("Ben", 5 * 24);
    await ctx.db.insert("communityInteractionRoots", {
      communityId, channelId, actorType: "human", actorUserId: ana, kind: "question", status: "live",
      visibilityScope: "community", contentSummary: "Where do we meet on Saturday?", replyCount: 0, reactionSummary: [],
      idempotencyKey: "brief-root-1", createdAt: nowMs - 4 * HOUR_MS, updatedAt: nowMs - 4 * HOUR_MS,
    } as any);
    const requester = await user("Cleo");
    await ctx.db.insert("communityJoinRequests", { communityId, userId: requester, status: "pending", createdAt: nowMs, updatedAt: nowMs });
    return { ownerId, communityId };
  });
}

describe("founder brief delivery", () => {
  it("only the owner turns the brief on, with a valid hour and time zone", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const set = (overrides: Record<string, unknown>) => t.mutation(internalRefs.communityFounderBrief.setFounderBriefSettingsInternal, {
      communityId: f.communityId, enabled: true, localHour: 8, timeZone: "America/New_York", actorUserId: f.ownerId, ...overrides,
    });
    await expect(set({ localHour: 24 })).rejects.toThrow(/hour_invalid/);
    await expect(set({ timeZone: "Mars/Olympus" })).rejects.toThrow(/time_zone_invalid/);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { authSubject: "x", createdAt: 0, updatedAt: 0 } as any));
    await expect(set({ actorUserId: stranger })).rejects.toThrow(/owner_required/);
    await expect(set({})).resolves.toEqual({ ok: true });
  });

  it("the owner turns their brief on and off in Studio; nobody else can read or change it", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const asOwner = t.withIdentity({ subject: "brief-Owner" });
    await expect(asOwner.query(api.communityFounderBrief.getFounderBriefSettings, { communityId: f.communityId }))
      .resolves.toEqual({ enabled: false, local_hour: 8, time_zone: null });
    await expect(asOwner.mutation(api.communityFounderBrief.setFounderBriefSettings, {
      communityId: f.communityId, enabled: true, localHour: 7, timeZone: "Europe/London",
    })).resolves.toEqual({ enabled: true, local_hour: 7, time_zone: "Europe/London" });
    const due = await t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs: Date.now() + 2 * DAY });
    expect(due.map((row: any) => row.communityId)).toEqual([f.communityId]);
    await expect(asOwner.mutation(api.communityFounderBrief.setFounderBriefSettings, {
      communityId: f.communityId, enabled: false, localHour: 7, timeZone: "Europe/London",
    })).resolves.toMatchObject({ enabled: false });
    expect(await t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs: Date.now() + 2 * DAY })).toEqual([]);

    await t.run((ctx) => ctx.db.insert("users", { authSubject: "brief-stranger", createdAt: 0, updatedAt: 0 } as any));
    const asStranger = t.withIdentity({ subject: "brief-stranger" });
    await expect(asStranger.query(api.communityFounderBrief.getFounderBriefSettings, { communityId: f.communityId })).rejects.toThrow(/owner_required/);
    await expect(asStranger.mutation(api.communityFounderBrief.setFounderBriefSettings, {
      communityId: f.communityId, enabled: true, localHour: 7, timeZone: "UTC",
    })).rejects.toThrow(/owner_required/);
  });

  it("a post that asks nothing is never 'waiting for an answer'", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    await t.run(async (ctx) => {
      const root = await ctx.db.query("communityInteractionRoots").first();
      const nowMs = Date.now();
      // A win, 30 hours old, with no replies: not a question.
      await ctx.db.insert("communityInteractionRoots", {
        communityId: f.communityId, channelId: (root as any).channelId, actorType: "human", actorUserId: (root as any).actorUserId,
        kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "First paid member came in today.",
        replyCount: 0, reactionSummary: [], idempotencyKey: "brief-root-win", createdAt: nowMs - 30 * HOUR_MS, updatedAt: nowMs - 30 * HOUR_MS,
      } as any);
    });
    const home = await t.withIdentity({ subject: "brief-Owner" }).query(api.communityFounderBrief.getCommunityHomeSnapshot, { communityId: f.communityId });
    expect(home?.unanswered.map((row: any) => row.text)).toEqual(["Where do we meet on Saturday?"]);
  });

  it("Home's Today names the post with the most replies, from shared channels", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    await t.run(async (ctx) => {
      const root = await ctx.db.query("communityInteractionRoots").first();
      const nowMs = Date.now();
      for (const [key, summary, replies] of [["busy", "Jon passed 100 members", 3], ["calm", "Morning all", 1]] as const) {
        await ctx.db.insert("communityInteractionRoots", {
          communityId: f.communityId, channelId: (root as any).channelId, actorType: "human", actorUserId: (root as any).actorUserId,
          kind: "discussion", status: "live", visibilityScope: "community", contentSummary: summary,
          replyCount: replies, reactionSummary: [], idempotencyKey: `brief-root-${key}`, createdAt: nowMs - 3 * HOUR_MS, updatedAt: nowMs - 3 * HOUR_MS,
        } as any);
      }
    });
    const memberHome = await t.withIdentity({ subject: "brief-Ana" }).query(api.communityFounderBrief.getCommunityMemberHomeSnapshot, { communityId: f.communityId });
    expect(memberHome?.highlight).toMatchObject({ title: "Jon passed 100 members", channel: "general", replies: 3 });
    expect(memberHome?.busiest).toMatchObject({ channel: "general", posts: 3 });
  });

  it("Home shows the owner the brief's facts for the last day, and nobody else", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const asOwner = t.withIdentity({ subject: "brief-Owner" });
    const home = await asOwner.query(api.communityFounderBrief.getCommunityHomeSnapshot, { communityId: f.communityId });
    expect(home).toMatchObject({
      communityName: "Dawn Patrol",
      windowHours: 24,
      newMembers: { count: 1, names: ["Ana"] },
      activity: { posts: 1, replies: 0, activePeople: 1 },
      // Ana (5 hours ago) and Ben (5 days ago) both joined this week.
      week: { joined: 2, activePeople: 1 },
      unanswered: [{ author: "Ana", channel: "general", text: "Where do we meet on Saturday?", hoursAgo: 4 }],
      quietNewcomers: { count: 1, names: ["Ben"] },
      joinRequestsPending: 1,
      upcomingEvents: [],
      busiest: { channel: "general", posts: 1, replies: 0, people: 1 },
      highlight: null,
    });

    const asMember = t.withIdentity({ subject: "brief-Ana" });
    await expect(asMember.query(api.communityFounderBrief.getCommunityHomeSnapshot, { communityId: f.communityId }))
      .rejects.toThrow(/community_home_owner_required/);
    await t.run((ctx) => ctx.db.insert("users", { authSubject: "home-stranger", createdAt: 0, updatedAt: 0 } as any));
    await expect(t.withIdentity({ subject: "home-stranger" }).query(api.communityFounderBrief.getCommunityHomeSnapshot, { communityId: f.communityId }))
      .rejects.toThrow(/community_home_owner_required/);

    // A member's Home has the shared facts and none of the owner's.
    const memberHome = await asMember.query(api.communityFounderBrief.getCommunityMemberHomeSnapshot, { communityId: f.communityId });
    expect(memberHome).toMatchObject({
      newMembers: { count: 1, names: [] },
      activity: { posts: 1, replies: 0, activePeople: 1 },
      unanswered: [{ author: "Ana", channel: "general" }],
      quietNewcomers: { count: 0, names: [] },
      joinRequestsPending: 0,
    });
    await expect(t.withIdentity({ subject: "home-stranger" }).query(api.communityFounderBrief.getCommunityMemberHomeSnapshot, { communityId: f.communityId }))
      .rejects.toThrow();

    await t.run((ctx) => ctx.db.patch(f.communityId, { lifecycleStatus: "archived" } as any));
    await expect(asOwner.query(api.communityFounderBrief.getCommunityHomeSnapshot, { communityId: f.communityId })).resolves.toBeNull();
  });

  it("schedules the next brief at the founder's next local hour", () => {
    expect(new Date(nextOccurrenceMs(Date.parse("2026-10-26T08:30:00.000Z"), 8, "UTC")).toISOString()).toBe("2026-10-27T08:00:00.000Z");
    expect(new Date(nextOccurrenceMs(Date.parse("2026-10-26T13:30:00.000Z"), 8, "America/New_York")).toISOString()).toBe("2026-10-27T12:00:00.000Z");
    // Fractional offsets land on the local hour too.
    expect(new Date(nextOccurrenceMs(Date.parse("2026-10-26T12:00:00.000Z"), 8, "Asia/Kolkata")).toISOString()).toBe("2026-10-27T02:30:00.000Z");
    expect(new Date(nextOccurrenceMs(Date.parse("2026-10-26T12:00:00.000Z"), 8, "Asia/Kathmandu")).toISOString()).toBe("2026-10-27T02:15:00.000Z");
    // Across the US daylight-saving change, 8am moves from 12:00 to 13:00 UTC.
    expect(new Date(nextOccurrenceMs(Date.parse("2026-10-31T13:00:00.000Z"), 8, "America/New_York")).toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });

  it("is due at its time, retries failures twice, then waits for tomorrow", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const T = Date.parse("2026-10-26T08:00:00.000Z");
    await t.run((ctx) => ctx.db.insert("communityFounderBriefSettings", {
      communityId: f.communityId, enabled: true, localHour: 8, timeZone: "UTC", nextDueAt: T,
      updatedByUserId: f.ownerId, createdAt: T, updatedAt: T,
    }));
    const due = (nowMs: number) => t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs });
    const nextDueAt = async () => (await t.run((ctx) => ctx.db.query("communityFounderBriefSettings").first()))!.nextDueAt;
    const claim = (nowMs: number) => t.mutation(internalRefs.communityFounderBrief.claimFounderBriefInternal, { communityId: f.communityId, briefDate: "2026-10-26", nowMs });
    const finish = (claimed: any, status: "sent" | "failed", nowMs: number) =>
      t.mutation(internalRefs.communityFounderBrief.finishFounderBriefInternal, { briefId: claimed.briefId, status, nowMs });

    expect(await due(T - 1)).toEqual([]);
    expect(await due(T)).toEqual([{ communityId: f.communityId, briefDate: "2026-10-26" }]);
    let claimed = await claim(T);
    expect(await due(T + 60_000)).toEqual([]); // held while it runs
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await finish(claimed, "failed", T + attempt * 1000);
      if (attempt < 3) {
        expect(await nextDueAt()).toBe(T + attempt * 1000 + 30 * 60_000);
        claimed = await claim(await nextDueAt());
        expect(claimed).not.toBeNull();
      }
    }
    // Three failed attempts: done for today, due again tomorrow at 8.
    expect(await nextDueAt()).toBe(Date.parse("2026-10-27T08:00:00.000Z"));
    expect(await claim(T + DAY)).toBeNull();
  });

  it("an archived community moves to tomorrow instead of blocking the queue", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const T = Date.parse("2026-10-26T08:00:00.000Z");
    await t.run(async (ctx) => {
      await ctx.db.insert("communityFounderBriefSettings", {
        communityId: f.communityId, enabled: true, localHour: 8, timeZone: "UTC", nextDueAt: T,
        updatedByUserId: f.ownerId, createdAt: T, updatedAt: T,
      });
      await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" } as any);
    });
    expect(await t.mutation(internalRefs.communityFounderBrief.claimFounderBriefInternal, { communityId: f.communityId, briefDate: "2026-10-26", nowMs: T })).toBeNull();
    expect(await t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs: T + HOUR_MS })).toEqual([]);
  });

  it("counts yesterday's joins even after a busy fortnight", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const f = await fixture(t, nowMs);
    await t.run(async (ctx) => {
      for (let index = 0; index < 210; index += 1) {
        const userId = await ctx.db.insert("users", { authSubject: `bulk-${index}`, displayName: `Bulk ${index}`, createdAt: nowMs, updatedAt: nowMs } as any);
        await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", accessSource: "free_grant", state: "active", createdAt: nowMs - 10 * DAY + index, updatedAt: nowMs } as any);
      }
    });
    // Notes the agent saved in the window are listed; the founder's own and older ones aren't.
    await t.run(async (ctx) => {
      const note = (slug: string, source: string, at: number) => ctx.db.insert("communityNotes", {
        communityId: f.communityId, slug, title: slug, bodyMd: "x", source, searchText: slug, createdAt: at, updatedAt: at } as any);
      await note("new-from-ask", "ask", nowMs - HOUR_MS);
      await note("founder-wrote-this", "founder", nowMs - HOUR_MS);
      await note("older-note", "tag", nowMs - 3 * DAY);
    });
    const read = await t.query(internalRefs.communityFounderBrief.readFounderBriefSnapshotInternal, {
      communityId: f.communityId, windowStartMs: nowMs - DAY, nowMs,
    });
    expect(read.snapshot.newMembers).toMatchObject({ count: 1, names: ["Ana"] });
  });

  it("a sent brief isn't sent again, and the schedule moves on", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const T = Date.parse("2026-10-26T08:00:00.000Z");
    await t.run((ctx) => ctx.db.insert("communityFounderBriefSettings", {
      communityId: f.communityId, enabled: true, localHour: 8, timeZone: "UTC", nextDueAt: T,
      updatedByUserId: f.ownerId, createdAt: T, updatedAt: T,
    }));
    const claimed = await t.mutation(internalRefs.communityFounderBrief.claimFounderBriefInternal, { communityId: f.communityId, briefDate: "2026-10-26", nowMs: T });
    await t.mutation(internalRefs.communityFounderBrief.finishFounderBriefInternal, { briefId: claimed.briefId, status: "sent", nowMs: T + 1000 });
    expect(await t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs: T + HOUR_MS })).toEqual([]);
    expect(await t.mutation(internalRefs.communityFounderBrief.claimFounderBriefInternal, { communityId: f.communityId, briefDate: "2026-10-26", nowMs: T + HOUR_MS })).toBeNull();
    expect(await t.query(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs: Date.parse("2026-10-27T08:00:00.000Z") })).toHaveLength(1);
  });

  it("delivers today's brief to the founder's agent thread and email, once", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const send = () => t.action(internalRefs.communityFounderBrief.sendFounderBriefNowInternal, { communityId: f.communityId });
    expect(await send()).toBe("sent");
    expect(await send()).toBe("skipped");

    const state = await t.run(async (ctx) => ({
      briefs: await ctx.db.query("communityFounderBriefs").collect(),
      messages: await ctx.db.query("cloudMessages" as any).collect(),
      emails: await ctx.db.query("emailOutbox" as any).collect(),
    }));
    expect(state.briefs).toHaveLength(1);
    // No founder plan in this fixture: the plain brief, no model call.
    expect(state.briefs[0]).toMatchObject({ status: "sent", writer: "deterministic", stats: expect.objectContaining({ unanswered: 1, joinRequests: 1, newMembers: 1, quietNewcomers: 1 }) });
    const brief = state.messages.find((row: any) => row.contentJson?.meta?.kind === "founder_brief") as any;
    expect(brief.role).toBe("assistant");
    expect(brief.contentJson.text).toContain("### Waiting on you");
    expect(brief.contentJson.text).toContain('Ana in #general');
    expect(brief.contentJson.text).toContain("Ben");
    const email = state.emails.find((row: any) => row.templateKey === "founder_daily_brief") as any;
    expect(email).toMatchObject({ recipientUserId: f.ownerId });
    expect(email.payload.actionUrl).toBe("https://polynet.test/c/dawn-patrol/agent");
  });
});

describe("founder brief retries after a partial delivery", () => {
  it("re-sends the saved brief to the saved thread and keeps the original window", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const today = localDateAndHour(Date.now(), "UTC").date;
    const conversation = await t.mutation(internalRefs.threads.ensureCommunityAgentConversationForTrustedUserInternal, {
      communityId: f.communityId, trustedUserId: f.ownerId,
    });
    const windowEndMs = Date.now() - 2 * HOUR_MS;
    await t.run((ctx) => ctx.db.insert("communityFounderBriefs", {
      communityId: f.communityId, ownerUserId: f.ownerId, briefDate: today, status: "failed", attempts: 1,
      windowStartMs: windowEndMs - DAY, windowEndMs, leaseExpiresAt: 0, createdAt: windowEndMs, updatedAt: windowEndMs,
      delivery: {
        threadId: String(conversation.thread_id), markdown: "**The saved brief**", writer: "deterministic",
        communityLifecycleGeneration: 0,
        emailPayload: { communityName: "Dawn Patrol", headline: "The saved brief", sections: [], nextStep: null, actionUrl: "https://polynet.test" },
      },
    } as any));
    expect(await t.action(internalRefs.communityFounderBrief.sendFounderBriefNowInternal, { communityId: f.communityId })).toBe("sent");
    const state = await t.run(async (ctx) => ({
      brief: await ctx.db.query("communityFounderBriefs").first(),
      message: (await ctx.db.query("cloudMessages" as any).collect()).find((row: any) => row.contentJson?.meta?.kind === "founder_brief"),
    }));
    expect(state.brief).toMatchObject({ status: "sent", attempts: 2, windowEndMs });
    expect((state.message as any).contentJson.text).toBe("**The saved brief**");
    expect(String((state.message as any).threadId)).toBe(String(conversation.thread_id));
  });
});

describe("staging seed for the brief", () => {
  it("refuses without POLYNET_ALLOW_SEED, then seeds a run club the brief can read, and re-seeds cleanly", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const seed = () => t.mutation(internalRefs.stagingSeedBriefLab.seedBriefLabInternal, { communityId: f.communityId, communityName: "Dawn Patrol Run Club" });
    delete process.env.POLYNET_ALLOW_SEED;
    await expect(seed()).rejects.toThrow(/seed_not_allowed/);
    process.env.POLYNET_ALLOW_SEED = "1";
    try {
      expect(await seed()).toEqual({ members: 8, posts: 5 });
      expect(await seed()).toEqual({ members: 8, posts: 5 });
      const counts = await t.run(async (ctx) => ({
        roots: (await ctx.db.query("communityInteractionRoots").collect()).filter((r: any) => r.idempotencyKey.startsWith("seed:")).length,
        events: (await ctx.db.query("communityEvents").collect()).length,
        name: (await ctx.db.get(f.communityId))?.name,
      }));
      expect(counts).toEqual({ roots: 5, events: 1, name: "Dawn Patrol Run Club" });
      const snapshot = await t.query(internalRefs.communityFounderBrief.readFounderBriefSnapshotInternal, {
        communityId: f.communityId, windowStartMs: Date.now() - 24 * HOUR_MS, nowMs: Date.now(),
      });
      expect(snapshot.snapshot.unanswered.map((post: any) => post.author)).toEqual(expect.arrayContaining(["Hannah Kim", "Priya Shah"]));
      expect(snapshot.snapshot.newMembers.names).toEqual(expect.arrayContaining(["Priya Shah", "Marcus Lee"]));
      expect(snapshot.snapshot.quietNewcomers.names).toEqual(expect.arrayContaining(["Jonah Reyes", "Elena Park"]));
      expect(snapshot.snapshot.upcomingEvents[0].title).toBe("Saturday Long Run: River Loop");
    } finally {
      delete process.env.POLYNET_ALLOW_SEED;
    }
  });
});

describe("owner moments", () => {
  it("only the owner gets a card; shown, it stays for the week; dismissed, nothing new until next week", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const asOwner = t.withIdentity({ subject: "brief-Owner" });
    const moment = () => asOwner.query(api.communityOwnerMoments.getOwnerMoment, { communityId: f.communityId });
    // A quiet community with no milestone yet has no card.
    expect(await moment()).toBeNull();
    // Ten members besides the owner: the milestone, with no problem to name.
    await t.run((ctx) => ctx.db.patch(f.communityId, { activeMemberCount: 11 } as any));
    const first = await moment();
    expect(first).toMatchObject({ isNew: true, moment: { key: "members_10", kind: "milestone" } });
    await expect(t.withIdentity({ subject: "brief-Ana" }).query(api.communityOwnerMoments.getOwnerMoment, { communityId: f.communityId }))
      .rejects.toThrow(/owner_required/);

    await asOwner.mutation(api.communityOwnerMoments.markOwnerMomentShown, { communityId: f.communityId, key: first!.moment.key });
    expect(await moment()).toMatchObject({ isNew: false, moment: { key: first!.moment.key } });

    await asOwner.mutation(api.communityOwnerMoments.dismissOwnerMoment, { communityId: f.communityId, key: first!.moment.key });
    expect(await moment()).toBeNull();
    await expect(asOwner.mutation(api.communityOwnerMoments.dismissOwnerMoment, { communityId: f.communityId, key: "anything" }))
      .rejects.toThrow(/unknown/);
  });
});

describe("Home moments", () => {
  it("a visit after half an hour away becomes 'since you were last here'; members never get names", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const asAna = t.withIdentity({ subject: "brief-Ana" });
    const asOwner = t.withIdentity({ subject: "brief-Owner" });

    await asAna.mutation(api.communityHomeMoments.recordHomeVisit, { communityId: f.communityId });
    const first = await asAna.query(api.communityHomeMoments.getHomeMoments, { communityId: f.communityId });
    expect(first.firstVisit).toBe(true);
    // Ana asked a question herself: she has posted, so no "say hello".
    expect(first.nextStep?.kind ?? null).not.toBe("say_hello");

    // Back after an hour: the earlier visit is now the one to count from.
    const hourAgo = Date.now() - 60 * 60 * 1000;
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("communityMemberVisits").collect())[0];
      await ctx.db.patch(row._id, { currentVisitAt: hourAgo });
    });
    await asAna.mutation(api.communityHomeMoments.recordHomeVisit, { communityId: f.communityId });
    const again = await asAna.query(api.communityHomeMoments.getHomeMoments, { communityId: f.communityId });
    expect(again.firstVisit).toBe(false);
    expect(Date.parse(again.since)).toBe(hourAgo);

    // The owner sees who joined by name; viewing as a member, not.
    const ownerView = await asOwner.query(api.communityHomeMoments.getHomeMoments, { communityId: f.communityId });
    const memberView = await asOwner.query(api.communityHomeMoments.getHomeMoments, { communityId: f.communityId, asMember: true });
    expect(ownerView.moments.find((moment: any) => moment.kind === "joined")?.title).toContain("Ana");
    expect(JSON.stringify(memberView.moments)).not.toContain("Ben");

    await t.run((ctx) => ctx.db.insert("users", { authSubject: "moments-stranger", createdAt: 0, updatedAt: 0 } as any));
    await expect(t.withIdentity({ subject: "moments-stranger" }).query(api.communityHomeMoments.getHomeMoments, { communityId: f.communityId }))
      .rejects.toThrow();
  });
});

describe("pods", () => {
  it("builders see every pod; a member sees only pods they were added to; purpose is the builder's", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const podId = await t.run(async (ctx) => {
      const nowMs = Date.now();
      const ana = (await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", "brief-Ana")).first())!;
      const anaMembership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ana._id))!;
      await ctx.db.patch(anaMembership._id, { activationSequence: 1, activatedAt: nowMs } as any);
      const channelId = await ctx.db.insert("communityChannels", {
        communityId: f.communityId, slug: "founders-pod", name: "Founders pod", accessMode: "restricted",
        postingPolicy: "members", status: "active", position: 1, createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs,
      } as any);
      await ctx.db.insert("communityChannelParticipants", {
        communityId: f.communityId, channelId, principalKey: `user:${ana._id}`, membershipId: anaMembership._id, membershipActivationSequence: 1,
        status: "active", createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs,
      } as any);
      return channelId;
    });
    const list = (subject: string, asMember?: boolean) => t.withIdentity({ subject })
      .query(api.communityPods.listCommunityPods, { communityId: f.communityId, ...(asMember ? { asMember } : {}) });

    const owner = await list("brief-Owner");
    expect(owner.can_manage).toBe(true);
    expect(owner.pods).toMatchObject([{ name: "Founders pod", members: 1, is_member: false }]);
    expect((await list("brief-Ana")).pods.map((pod: any) => pod.name)).toEqual(["Founders pod"]);
    // Ben isn't in it, and a hidden pod (every room from before pods) isn't shown from outside either.
    expect(await list("brief-Ben")).toEqual({ can_manage: false, pods: [], outside: [] });
    // Viewing as a member, the builder sees only pods they are in.
    expect((await list("brief-Owner", true)).pods).toEqual([]);

    const asOwner = t.withIdentity({ subject: "brief-Owner" });
    const asAna = t.withIdentity({ subject: "brief-Ana" });
    const asBen = t.withIdentity({ subject: "brief-Ben" });
    await asOwner.mutation(api.communityPods.savePodDetails, { communityId: f.communityId, channelId: podId, purpose: "  Weekly accountability for founders  " });
    expect((await list("brief-Ana")).pods[0].purpose).toBe("Weekly accountability for founders");
    await expect(asAna.mutation(api.communityPods.savePodDetails, { communityId: f.communityId, channelId: podId, purpose: "mine" })).rejects.toThrow();

    // Listed with one seat (Ana has it): Ben sees the outside only, and asking puts him on the waitlist.
    await asOwner.mutation(api.communityPods.savePodDetails, { communityId: f.communityId, channelId: podId, visibility: "listed", seats: 1 });
    const outside = (await list("brief-Ben")).outside;
    expect(outside).toEqual([{ channel_id: String(podId), name: "Founders pod", purpose: "Weekly accountability for founders", hosts: [], seats_left: 0, price: null, my_request: null }]);
    expect(JSON.stringify(outside)).not.toContain("Ana");
    await expect(asBen.query(api.communityPods.getPod, { communityId: f.communityId, channelId: podId })).rejects.toThrow();
    expect(await asBen.mutation(api.communityPods.requestToJoinPod, { communityId: f.communityId, channelId: podId })).toEqual({ status: "waitlist" });
    expect((await list("brief-Ben")).outside[0].my_request).toBe("waitlist");

    // Only the pod's managers decide; the owner says yes and Ben is in.
    const ben = await t.run(async (ctx) => (await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", "brief-Ben")).first())!);
    await t.run(async (ctx) => {
      const membership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ben._id))!;
      await ctx.db.patch(membership._id, { activationSequence: 1, activatedAt: Date.now() } as any);
    });
    await expect(asAna.mutation(api.communityPods.decidePodRequest, { communityId: f.communityId, channelId: podId, userId: ben._id, approve: true })).rejects.toThrow(/manager_required/);
    expect((await asOwner.query(api.communityPods.getPod, { communityId: f.communityId, channelId: podId })).requests).toMatchObject([{ name: "Ben", status: "waitlist" }]);
    await asOwner.mutation(api.communityPods.decidePodRequest, { communityId: f.communityId, channelId: podId, userId: ben._id, approve: true });
    expect((await list("brief-Ben")).pods.map((pod: any) => pod.name)).toEqual(["Founders pod"]);
    expect((await asBen.query(api.communityPods.getPod, { communityId: f.communityId, channelId: podId })).members.map((member: any) => member.name).sort()).toEqual(["Ana", "Ben"]);

    // A host the builder names can decide for their pod.
    await asOwner.mutation(api.communityPods.setPodHost, { communityId: f.communityId, channelId: podId, userId: ben._id, host: true });
    expect((await asBen.query(api.communityPods.getPod, { communityId: f.communityId, channelId: podId })).can_manage).toBe(true);
  });

  it("paid pods: a price on top of membership; Stripe's notice puts the payer in and an ended subscription takes them out", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const ids = await t.run(async (ctx) => {
      const nowMs = Date.now();
      const find = async (subject: string) => (await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", subject)).first())!;
      const ana = await find("brief-Ana");
      const ben = await find("brief-Ben");
      for (const row of await ctx.db.query("communityMemberships").collect()) await ctx.db.patch(row._id, { activationSequence: 1, activatedAt: nowMs } as any);
      const channelId = await ctx.db.insert("communityChannels", {
        communityId: f.communityId, slug: "inner-circle", name: "Inner circle", accessMode: "restricted",
        postingPolicy: "members", status: "active", position: 1, createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs,
      } as any);
      await ctx.db.insert("communityPods", { communityId: f.communityId, channelId, purpose: "Closer time", visibility: "listed", seats: 1, createdAt: nowMs, updatedAt: nowMs });
      return { ana: ana._id, ben: ben._id, channelId };
    });
    const asOwner = t.withIdentity({ subject: "brief-Owner" });
    const asAna = t.withIdentity({ subject: "brief-Ana" });
    const setPrice = (amountBaseUnits: number, who = asOwner) => who.mutation(api.communityPodPayments.savePodPrice, { communityId: f.communityId, channelId: ids.channelId, amountBaseUnits });
    // Charging needs the builder's Stripe; only builders set it; $1 to $10,000.
    await expect(setPrice(10000)).rejects.toThrow(/community_checkout_unavailable/);
    await t.run((ctx) => ctx.db.insert("userStripeConnectAccounts", {
      userId: f.ownerId, stripeAccountId: "acct_builder", accountType: "express", status: "ready", detailsSubmitted: true,
      chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [], createdAt: 0, updatedAt: 0,
    }));
    await expect(setPrice(10000, asAna)).rejects.toThrow();
    await expect(setPrice(50)).rejects.toThrow(/community_pod_price_invalid/);
    await setPrice(10000);
    // From outside: the price, and asking is closed (payment is the gate).
    const outside = (await asAna.query(api.communityPods.listCommunityPods, { communityId: f.communityId })).outside;
    expect(outside).toMatchObject([{ name: "Inner circle", price: { amount_base_units: 10000, currency: "usd" }, seats_left: 1 }]);
    await expect(asAna.mutation(api.communityPods.requestToJoinPod, { communityId: f.communityId, channelId: ids.channelId })).rejects.toThrow(/community_pod_paid/);
    const config = (userId: any) => t.query(internalRefs.communityPodPayments.podCheckoutConfigInternal, { userId, communityId: f.communityId, channelId: ids.channelId, nowMs: Date.now() });
    await expect(config(ids.ana)).resolves.toMatchObject({ amountBaseUnits: 10000, providerAccountId: "acct_builder", openCheckoutUrl: null });
    // A checkout Ana opened is reused rather than started twice.
    const paymentId = await t.mutation(internalRefs.communityPodPayments.createPendingPodPaymentInternal, {
      communityId: f.communityId, channelId: ids.channelId, userId: ids.ana, amountBaseUnits: 10000, currency: "usd",
      providerAccountId: "acct_builder", providerPriceId: "price_pod", nowMs: Date.now(),
    });
    await t.mutation(internalRefs.communityPodPayments.attachPodCheckoutInternal, { paymentId, providerCheckoutSessionId: "cs_1", checkoutUrl: "https://checkout.stripe.com/c/1" });
    expect((await config(ids.ana)).openCheckoutUrl).toBe("https://checkout.stripe.com/c/1");
    const sync = (status: string, providerEventAt: number, extra: Record<string, unknown> = {}) => t.mutation(internalRefs.communityPodPayments.syncPodPaymentInternal, {
      paymentId, providerAccountId: "acct_builder", providerSubscriptionId: "sub_1", subscriptionStatus: status, providerEventAt, ...extra,
    });
    // Another account's notice is refused; Stripe's confirmation puts Ana in.
    await expect(t.mutation(internalRefs.communityPodPayments.syncPodPaymentInternal, {
      paymentId, providerAccountId: "acct_other", providerSubscriptionId: "sub_1", subscriptionStatus: "active", providerEventAt: 1,
    })).rejects.toThrow(/provider_account_mismatch/);
    await expect(sync("active", 1000)).resolves.toMatchObject({ status: "active", granted: true });
    expect((await asAna.query(api.communityPods.getPod, { communityId: f.communityId, channelId: ids.channelId })).members.map((m: any) => m.name)).toEqual(["Ana"]);
    // Full now: Ben can't start a checkout, and Ana can't pay twice.
    await expect(config(ids.ben)).rejects.toThrow(/community_pod_full/);
    await expect(config(ids.ana)).rejects.toThrow(/already_in_pod/);
    // Leaving keeps access to the period's end; an older notice changes nothing.
    await expect(sync("active", 2000, { cancelAtPeriodEnd: true })).resolves.toMatchObject({ status: "cancel_at_period_end", granted: true });
    await expect(sync("canceled", 500)).resolves.toMatchObject({ ignored: true, reason: "stale_event" });
    // The subscription ends: Ana is out, and Ben can join.
    await expect(sync("canceled", 3000)).resolves.toMatchObject({ status: "ended", granted: false });
    await expect(asAna.query(api.communityPods.getPod, { communityId: f.communityId, channelId: ids.channelId })).rejects.toThrow(/community_pod_not_found/);
    await expect(config(ids.ben)).resolves.toMatchObject({ amountBaseUnits: 10000 });
    // A new price is for new joins; the builder can make the pod free again.
    await setPrice(12700);
    expect((await config(ids.ben)).providerPriceId).toBeNull();
    await setPrice(0);
    await expect(config(ids.ben)).rejects.toThrow(/community_pod_not_paid/);
  });

  it("paid pods end: a refund ends that pod only; leaving the community stops pod billing, refunding one that never let them in", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const ids = await t.run(async (ctx) => {
      const nowMs = Date.now();
      const find = async (subject: string) => (await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", subject)).first())!;
      for (const row of await ctx.db.query("communityMemberships").collect()) await ctx.db.patch(row._id, { activationSequence: 1, activatedAt: nowMs } as any);
      const room = (slug: string) => ctx.db.insert("communityChannels", {
        communityId: f.communityId, slug, name: slug, accessMode: "restricted",
        postingPolicy: "members", status: "active", position: 1, createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs,
      } as any);
      return { ana: (await find("brief-Ana"))._id, ben: (await find("brief-Ben"))._id, podA: await room("pod-a"), podB: await room("pod-b") };
    });
    const pay = async (userId: any, channelId: any, sub: string) => {
      const paymentId = await t.mutation(internalRefs.communityPodPayments.createPendingPodPaymentInternal, {
        communityId: f.communityId, channelId, userId, amountBaseUnits: 10000, currency: "usd", providerAccountId: "acct_builder", providerPriceId: "price_pod", nowMs: Date.now(),
      });
      const result = await t.mutation(internalRefs.communityPodPayments.syncPodPaymentInternal, {
        paymentId, providerAccountId: "acct_builder", providerSubscriptionId: sub, subscriptionStatus: "active", providerEventAt: 1000,
      });
      return { paymentId, granted: result.granted };
    };
    const allUnreachable = async () => {
      const found: any[] = [];
      for (const status of ["active", "past_due", "cancel_at_period_end"]) {
        let cursor: string | null = null;
        for (;;) {
          const page: any = await t.query(internalRefs.communityPodPayments.listUnreachablePodPaymentsPageInternal, { status, cursor });
          found.push(...page.targets);
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
      }
      return found;
    };
    const inPod = (channelId: any, subject: string) => t.withIdentity({ subject }).query(api.communityPods.getPod, { communityId: f.communityId, channelId }).then(() => true, () => false);
    expect((await pay(ids.ana, ids.podA, "sub_a")).granted).toBe(true);
    expect((await pay(ids.ana, ids.podB, "sub_b")).granted).toBe(true);
    // A refund on pod A: out of pod A only.
    await expect(t.mutation(internalRefs.communityPodPayments.endPodPaymentForRiskInternal, { providerAccountId: "acct_builder", providerSubscriptionId: "sub_a" })).resolves.toEqual({ found: true });
    expect(await inPod(ids.podA, "brief-Ana")).toBe(false);
    expect(await inPod(ids.podB, "brief-Ana")).toBe(true);
    // A community subscription isn't a pod payment.
    await expect(t.mutation(internalRefs.communityPodPayments.endPodPaymentForRiskInternal, { providerAccountId: "acct_builder", providerSubscriptionId: "sub_community" })).resolves.toEqual({ found: false });
    // Nothing to stop while everyone can reach their pod.
    await expect(allUnreachable()).resolves.toEqual([]);
    // Ben paid, but left the community before Stripe confirmed: never let in, refunded in full.
    await t.run(async (ctx) => {
      const membership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ids.ben))!;
      await ctx.db.patch(membership._id, { state: "left" } as any);
    });
    expect((await pay(ids.ben, ids.podB, "sub_ben")).granted).toBe(false);
    // Ana leaves the community: her pod B billing stops, keeping what she paid.
    await t.run(async (ctx) => {
      const membership = (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(ids.ana))!;
      await ctx.db.patch(membership._id, { state: "left" } as any);
    });
    const unreachable = await allUnreachable();
    // The check scheduled when Ana left finds the same one, for her only.
    expect((await t.query(internalRefs.communityPodPayments.listUnreachablePodPaymentsForScopeInternal, { communityId: f.communityId, userId: ids.ana }))
      .map((row: any) => row.providerSubscriptionId)).toEqual(["sub_b"]);
    expect(unreachable.map((row: any) => [row.providerSubscriptionId, row.refund]).sort()).toEqual([["sub_b", false], ["sub_ben", true]]);
    for (const row of unreachable) await t.mutation(internalRefs.communityPodPayments.endUnreachablePodPaymentInternal, { paymentId: row.paymentId });
    await expect(allUnreachable()).resolves.toEqual([]);
  });

  it("paid pods: a host taking someone off, or archiving, stops their billing; re-added meanwhile keeps it; fees reverse; abandoned checkouts expire", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, Date.now());
    const ids = await t.run(async (ctx) => {
      const nowMs = Date.now();
      const ana = (await ctx.db.query("users").withIndex("by_authSubject" as any, (q: any) => q.eq("authSubject", "brief-Ana")).first())!;
      for (const row of await ctx.db.query("communityMemberships").collect()) await ctx.db.patch(row._id, { activationSequence: 1, activatedAt: nowMs } as any);
      const channelId = await ctx.db.insert("communityChannels", {
        communityId: f.communityId, slug: "pod", name: "pod", accessMode: "restricted",
        postingPolicy: "members", status: "active", position: 1, createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs,
      } as any);
      return { ana: ana._id, channelId };
    });
    const paymentId = await t.mutation(internalRefs.communityPodPayments.createPendingPodPaymentInternal, {
      communityId: f.communityId, channelId: ids.channelId, userId: ids.ana, amountBaseUnits: 10000, currency: "usd", providerAccountId: "acct_builder", providerPriceId: "price_pod", nowMs: Date.now(),
    });
    await t.mutation(internalRefs.communityPodPayments.syncPodPaymentInternal, {
      paymentId, providerAccountId: "acct_builder", providerSubscriptionId: "sub_x", subscriptionStatus: "active", providerEventAt: 1000,
    });
    // Polynet's fee reverses on a pod refund: the refund path recognises the payment.
    await expect(t.query(internalRefs.communityPodPayments.getPodPaymentByProviderSubscriptionInternal, { providerAccountId: "acct_builder", providerSubscriptionId: "sub_x" }))
      .resolves.toMatchObject({ status: "active" });
    const scope = (args: Record<string, unknown>) => t.query(internalRefs.communityPodPayments.listUnreachablePodPaymentsForScopeInternal, args);
    await expect(scope({ channelId: ids.channelId, userId: ids.ana })).resolves.toEqual([]);
    // The builder takes Ana off the pod (the room's own control).
    await t.withIdentity({ subject: "brief-Owner" }).mutation(api.communityChannelParticipants.setParticipant, {
      communityId: f.communityId, channelId: ids.channelId, target: { kind: "member", userId: ids.ana }, active: false,
    } as any);
    await expect(scope({ channelId: ids.channelId, userId: ids.ana })).resolves.toMatchObject([{ providerSubscriptionId: "sub_x", refund: false }]);
    // Put back before the check ran: billing goes on.
    await t.withIdentity({ subject: "brief-Owner" }).mutation(api.communityChannelParticipants.setParticipant, {
      communityId: f.communityId, channelId: ids.channelId, target: { kind: "member", userId: ids.ana }, active: true,
    } as any);
    await t.mutation(internalRefs.communityPodPayments.endUnreachablePodPaymentInternal, { paymentId });
    await expect(t.run((ctx) => ctx.db.get(paymentId))).resolves.toMatchObject({ status: "active" });
    // The community is archived: every pod payment in it is unreachable.
    await t.run((ctx) => ctx.db.patch(f.communityId, { lifecycleStatus: "archived", lifecycleGeneration: 1 } as any));
    await expect(scope({ communityId: f.communityId })).resolves.toMatchObject([{ providerSubscriptionId: "sub_x" }]);
    // An unpaid checkout is marked expired a day after Stripe closed it.
    const stale = await t.mutation(internalRefs.communityPodPayments.createPendingPodPaymentInternal, {
      communityId: f.communityId, channelId: ids.channelId, userId: ids.ana, amountBaseUnits: 10000, currency: "usd", providerAccountId: "acct_builder", providerPriceId: "price_pod", nowMs: Date.now() - 3 * DAY,
    });
    await expect(t.mutation(internalRefs.communityPodPayments.expireAbandonedPodCheckoutsInternal, { nowMs: Date.now() })).resolves.toMatchObject({ expired: 1 });
    await expect(t.run((ctx) => ctx.db.get(stale))).resolves.toMatchObject({ status: "expired" });
  });
});
