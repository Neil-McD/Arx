/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
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
        communityId, userId, role: "member", accessSource: "free_grant", active: true,
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
        await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", accessSource: "free_grant", active: true, createdAt: nowMs - 10 * DAY + index, updatedAt: nowMs } as any);
      }
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
