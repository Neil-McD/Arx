/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";

const modules = import.meta.glob(["./communityChannelParticipants.ts", "./_generated/**/*.*s"]);
const set = "communityChannelParticipants:setParticipant" as any;
const list = "communityChannelParticipants:listMemberAccess" as any;
const roster = "communityChannelParticipants:listChannelRoster" as any;

test("implicit General works without a stored channel and returns canonical presence leases", async () => {
  const { t, f, owner } = await fixture();
  const now = Date.now();
  await t.run(ctx => ctx.db.insert("communityPresence", { communityId: f.communityId, userId: f.memberId,
    lastSeenAt: now, activeUntil: now + 90000, createdAt: now, updatedAt: now }));
  const result: any = await owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 50, cursor: null } });
  expect(result.page.map((row: any) => row.user_id)).toEqual(["member"]);
  expect(result.page[0]).toMatchObject({ last_seen_at: now, active_until: now + 90000 });
  expect(result.page[0].membership_id).toBe(String(f.membershipId));
  expect(result.page[0].membership_created_at).toBe(new Date(1).toISOString());
  const rest: any = await owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 50, cursor: result.continueCursor } });
  expect(rest.page.map((row: any) => row.user_id)).toEqual(["owner"]);
  expect(rest.page[0]).not.toHaveProperty("membership_id");
  expect(result.agents).toHaveLength(1);
});

test("a member held by the welcome flow is left off the roster without failing it", async () => {
  const { t, f, owner } = await fixture();
  const now = Date.now();
  await t.run(async ctx => {
    await ctx.db.insert("communityMemberWorkflows", { communityId: f.communityId, welcomeGate: true, welcomeGateEnabledAt: 0,
      revision: 1, createdByUserId: f.ownerId, updatedByUserId: f.ownerId, createdAt: 1, updatedAt: 1,
      milestones: [{ key: "onboarding", name: "Onboarding", automations: [{
        key: "welcome", trigger: { type: "member_joined" }, action: { key: "intake", type: "request_form", formKey: "intake" } }] }] });
    await ctx.db.patch(f.membershipId, { activatedAt: now });
    await ctx.db.insert("communityPresence", { communityId: f.communityId, userId: f.memberId,
      lastSeenAt: now, activeUntil: now + 90000, createdAt: now, updatedAt: now });
  });
  const rows: any[] = [];
  let cursor = null;
  for (let i = 0; i < 5; i++) {
    const result: any = await owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 50, cursor } });
    rows.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(rows.map(row => row.user_id)).toEqual(["owner"]);
});

test("roster pages newest activity first, includes unknowns last, and reorders after activity changes", async () => {
  const { t, f, owner } = await fixture();
  const ids = await t.run(async ctx => {
    const ids = [];
    for (const [userId, lastSeenAt] of [[f.ownerId, 10], [f.memberId, 30]] as const) {
      ids.push(await ctx.db.insert("communityPresence", { communityId: f.communityId, userId, lastSeenAt, createdAt: 1, updatedAt: 1 }));
    }
    await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: f.outsiderId, role: "member", active: true, createdAt: 2, updatedAt: 2 });
    return ids;
  });
  const readAll = async () => {
    const rows: any[] = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const result: any = await owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 2, cursor } });
      rows.push(...result.page);
      if (result.isDone) return rows;
      expect(result.continueCursor).not.toBe(cursor);
      cursor = result.continueCursor;
    }
    throw new Error("roster failed to terminate");
  };
  expect((await readAll()).map(r => r.user_id)).toEqual(["member", "owner", "outsider"]);
  await t.run(ctx => ctx.db.patch(ids[0], { lastSeenAt: 40 }));
  expect((await readAll()).map(r => r.user_id)).toEqual(["owner", "member", "outsider"]);
  await t.run(ctx => ctx.db.patch(ids[1], { lastSeenAt: 40 }));
  const tied = await readAll();
  expect(tied.map(r => r.user_id)).toEqual((await readAll()).map(r => r.user_id));
  expect(new Set(tied.map(r => r.user_id)).size).toBe(3);
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: false }));
  expect((await readAll()).map(r => r.user_id)).toEqual(["owner", "outsider"]);
});

test("equal timestamps cross page boundaries without lost people", async () => {
  const { t, f, owner } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 6; i++) {
      const userId = await ctx.db.insert("users", { authSubject: `recent-${i}`, displayName: `recent-${i}`, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", active: true, createdAt: i + 2, updatedAt: 1 });
      await ctx.db.insert("communityPresence", { communityId: f.communityId, userId, lastSeenAt: 100, createdAt: 1, updatedAt: 1 });
    }
  });
  const rows: any[] = [];
  let cursor = null;
  let done = false;
  for (let i = 0; i < 15 && !done; i++) {
    const result: any = await owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 2, cursor } });
    expect(result.page.length).toBeLessThanOrEqual(2);
    rows.push(...result.page); cursor = result.continueCursor; done = result.isDone;
  }
  expect(done).toBe(true);
  expect(rows).toHaveLength(8);
  expect(new Set(rows.map(r => r.user_id)).size).toBe(8);
  expect(rows.slice(0, 6).every(r => r.last_seen_at === 100)).toBe(true);
  expect(rows.slice(6).map(r => r.user_id)).toEqual(["owner", "member"]);
});

test("recent presence cannot bypass private-channel grants or duplicate canonical people", async () => {
  const { t, f, owner } = await fixture();
  await t.run(async ctx => {
    for (const userId of [f.memberId, f.outsiderId, f.ownerId, f.ownerId]) {
      await ctx.db.insert("communityPresence", { communityId: f.communityId, userId, lastSeenAt: 100, createdAt: 1, updatedAt: 1 });
    }
  });
  const result: any = await owner.query(roster, { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 50, cursor: null } });
  expect(result.page.map((r: any) => r.user_id)).toEqual(["owner"]);
  await expect(owner.query(roster, { communityId: f.communityId, paginationOpts: { numItems: 50, cursor: result.continueCursor } })).rejects.toThrow("community_channel_roster_cursor_invalid");
});

test("channel roster is viewer-authorized without weakening the grant editor", async () => {
  const { t, f, args, owner } = await fixture();
  const request = { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } };
  const member = t.withIdentity({ subject: "member" });
  await expect(member.query(roster, request)).rejects.toThrow();
  await expect(t.withIdentity({ subject: "outsider" }).query(roster, request)).rejects.toThrow();
  await owner.mutation(set, args);
  const page: any = await member.query(roster, request);
  expect(page.page.map((p: any) => p.user_id)).toEqual(["owner", "member"]);
  expect(page.page[1]).toMatchObject({ role: "member", last_seen_at: null, profile: { display_name: "member" } });
  expect(page.page[1]).not.toHaveProperty("membershipActivationSequence");
  expect(page.page[1]).not.toHaveProperty("membership_id");
  expect(page.page[1]).not.toHaveProperty("membership_created_at");
  expect(page.agents).toEqual([]);
  await expect(member.query(list, request)).rejects.toThrow();
  await owner.mutation(set, { ...args, target: { kind: "community_agent" } });
  expect((await member.query(roster, request) as any).agents[0]).toMatchObject({ key: "community_agent", capabilities: { canRead: true, canManage: false } });
  await owner.mutation(set, { ...args, active: false });
  await expect(member.query(roster, request)).rejects.toThrow();
  expect((await owner.query(roster, request) as any).page.map((p: any) => p.user_id)).toEqual(["owner"]);
});

test("roster follows demotion, activation lineage, archive, and channel scope", async () => {
  const { t, f, args, owner } = await fixture();
  const request = { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } };
  await t.run(ctx => ctx.db.patch(f.membershipId, { role: "admin" }));
  expect((await owner.query(roster, request) as any).page).toHaveLength(2);
  await t.run(ctx => ctx.db.patch(f.membershipId, { role: "member" }));
  expect((await owner.query(roster, request) as any).page).toHaveLength(1);
  await owner.mutation(set, args);
  await t.run(ctx => ctx.db.patch(f.membershipId, { activationSequence: 2 }));
  expect((await owner.query(roster, request) as any).page).toHaveLength(1);
  await expect(owner.query(roster, { ...request, paginationOpts: { numItems: 10, cursor: "another-channel:cursor" } })).rejects.toThrow("community_channel_roster_cursor_invalid");
  await t.run(ctx => ctx.db.patch(f.channelId, { status: "archived" }));
  await expect(owner.query(roster, request)).rejects.toThrow();
});

test("General roster is paginated, includes owner once, and filters inactive memberships", async () => {
  const { t, f, owner } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(f.channelId, { accessMode: "all_members", systemRole: "general", slug: "general", name: "General", position: 0 });
    await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: f.outsiderId, role: "member", active: false, createdAt: 2, updatedAt: 2 });
  });
  const request = { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 2, cursor: null } };
  const first: any = await owner.query(roster, request);
  expect(first.page.map((p: any) => p.user_id)).toEqual(["owner", "member"]);
  expect(first.isDone).toBe(false);
  const second: any = await owner.query(roster, { ...request, paginationOpts: { numItems: 2, cursor: first.continueCursor } });
  expect(second.page).toEqual([]);
  expect(second.isDone).toBe(true);
});

test("roster rejects foreign channel IDs and excludes revoked membership even with a grant", async () => {
  const { t, f, args, owner } = await fixture();
  await owner.mutation(set, args);
  const otherCommunityId = await t.run(ctx => ctx.db.insert("communities", { ownerId: f.ownerId, name: "Other", slug: "other",
    visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 }));
  const request = { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } };
  await expect(owner.query(roster, { ...request, communityId: otherCommunityId })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: false, revokedAt: Date.now() }));
  expect((await owner.query(roster, request) as any).page.map((p: any) => p.user_id)).toEqual(["owner"]);
  await expect(t.withIdentity({ subject: "member" }).query(roster, request)).rejects.toThrow();
});

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const user = async (name: string) => ctx.db.insert("users", { authSubject: name, displayName: name, createdAt: 1, updatedAt: 1 });
    const ownerId = await user("owner"), memberId = await user("member"), outsiderId = await user("outsider");
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Client service", slug: "client-service",
      visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member",
      active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: 1, updatedAt: 1 });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Client", slug: "client", position: 1,
      accessMode: "restricted", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    return { ownerId, memberId, outsiderId, communityId, membershipId, channelId };
  });
  const args = { communityId: f.communityId, channelId: f.channelId, target: { kind: "member", userId: f.memberId }, active: true };
  const owner = t.withIdentity({ subject: "owner" });
  const canRead = async () => t.run(async ctx => getCommunityChannelCapabilities({ ctx,
    channel: (await ctx.db.get(f.channelId))!, actor: await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.memberId }) }));
  return { t, f, args, owner, canRead };
}

test("participant upserts and revocations are idempotent and cannot confer manager authority", async () => {
  const { t, f, args, owner, canRead } = await fixture();
  expect((await canRead()).canRead).toBe(false);
  expect(await owner.mutation(set, args)).toEqual({ changed: true });
  expect(await owner.mutation(set, args)).toEqual({ changed: false });
  expect(await canRead()).toEqual({ canRead: true, canPost: true, canReply: true, canManage: false });
  expect(await t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(1);
  const page: any = await owner.query(list, { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } });
  expect(page.page[0]).toMatchObject({ user_id: f.memberId, active: true, profile: { display_name: "member" } });
  expect(await owner.mutation(set, { ...args, active: false })).toEqual({ changed: true });
  expect(await owner.mutation(set, { ...args, active: false })).toEqual({ changed: false });
  expect((await canRead()).canRead).toBe(false);
});

test("rejoining a community cannot resurrect an old private-room grant", async () => {
  const { t, f, args, owner, canRead } = await fixture();
  await owner.mutation(set, args);
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: false, revokedAt: 2 }));
  await expect(canRead()).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: true, revokedAt: undefined, activationSequence: 2 }));
  expect((await canRead()).canRead).toBe(false);
  await owner.mutation(set, args);
  expect((await canRead()).canRead).toBe(true);
  expect(await t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(1);
});

test("members and outsiders cannot manage grants or enumerate participants", async () => {
  const { t, f, args, owner } = await fixture();
  for (const subject of ["member", "outsider"]) {
    const actor = t.withIdentity({ subject });
    await expect(actor.mutation(set, args)).rejects.toThrow();
    await expect(actor.query(list, { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
  }
  await expect(owner.mutation(set, { ...args, target: { kind: "member", userId: f.outsiderId } })).rejects.toThrow("community_channel_member_inactive");
});

test("community-agent grant is independent and archive blocks all access", async () => {
  const { t, f, args, owner } = await fixture();
  const agentRead = () => t.run(async ctx => getCommunityChannelCapabilities({ ctx, channel: (await ctx.db.get(f.channelId))!,
    actor: await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.ownerId, kind: "community_agent" }) }));
  expect((await agentRead()).canRead).toBe(false);
  const grant = { ...args, target: { kind: "community_agent" } };
  await owner.mutation(set, grant);
  expect((await agentRead()).canRead).toBe(true);
  expect((await agentRead()).canManage).toBe(false);
  await owner.mutation(set, { ...grant, active: false });
  expect((await agentRead()).canRead).toBe(false);
  await t.run(ctx => ctx.db.patch(f.channelId, { status: "archived" }));
  await expect(owner.mutation(set, grant)).rejects.toThrow();
});
