/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { createActiveCommunityChannel } from "./communityChannelCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { bindMemberServiceChannel } from "./communityMemberServiceChannelCore";
const modules = import.meta.glob(["./*.ts", "./_generated/**/*.*s"]);
const joinHandler = internal.communityMemberWorkflows.handleFirstMemberJoinInternal;

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "join-owner", displayName: "Owner", createdAt: now, updatedAt: now });
    const memberId = await ctx.db.insert("users", { authSubject: "join-member", displayName: "Member", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "join-workflow", name: "Join workflow", lifecycleStatus: "active",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    const workflowId = await ctx.db.insert("communityMemberWorkflows", { communityId, revision: 1,
      milestones: [{ key: "new", name: "New", automations: [{ key: "join", trigger: { type: "member_joined" }, action: { key: "room", type: "create_service_channel" } }] }],
      createdByUserId: ownerId, updatedByUserId: ownerId, createdAt: now, updatedAt: now });
    return { now, ownerId, memberId, communityId, workflowId };
  });
  const activation = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId,
    accessSource: "manual_grant", activationReason: "test", nowMs: f.now }));
  const membershipId = activation.membership._id as Id<"communityMemberships">;
  const job = { membershipId, workflowId: f.workflowId, workflowRevision: 1, lifecycleGeneration: 0, serviceChannelRevision: 0, activatedAt: f.now };
  return { t, ...f, membershipId, job };
}

test("first activation schedules configured job; sign-in/active grant does not schedule again", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    expect(jobs.filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
    await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId, accessSource: "manual_grant", activationReason: "again", nowMs: f.now + 1 });
    expect((await ctx.db.system.query("_scheduled_functions").collect()).filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
  });
});

test("join creates one private room, activation grants, binding and receipt; replay cannot duplicate", async () => {
  const f = await fixture();
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("service_channel_ready");
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("already_executed");
  await f.t.run(async ctx => {
    const membership = (await ctx.db.get(f.membershipId))! as any;
    expect((await resolveMemberServiceChannel({ ctx, membership })).status).toBe("available");
    const rooms = await ctx.db.query("communityChannels").collect();
    expect(rooms.filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(2);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(0);
    const outsiderId = await ctx.db.insert("users", { authSubject: "outsider", createdAt: f.now, updatedAt: f.now });
    await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: outsiderId, role: "member", active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: f.now, updatedAt: f.now });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: outsiderId });
    expect((await getCommunityChannelCapabilities({ ctx, actor, channel: (await ctx.db.get(membership.serviceChannelId))! as any })).canRead).toBe(false);
  });
});

test.each(["revision", "inactive", "reactivated", "archived", "moved"])("queued join fails closed after %s", async change => {
  const f = await fixture();
  await f.t.run(async ctx => {
    if (change === "revision") await ctx.db.patch(f.workflowId, { revision: 2 });
    if (change === "inactive") await ctx.db.patch(f.membershipId, { active: false });
    if (change === "reactivated") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (change === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" as any });
    if (change === "moved") await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: f.workflowId, membershipId: f.membershipId,
      currentMilestoneKey: "new", milestoneEnteredAt: f.now, transitionSeq: 1, createdAt: f.now, updatedAt: f.now });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("stale");
  expect(await f.t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(0);
});

test("capacity failure keeps membership active and leaves no partial General, room or grants", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let i = 0; i < 100; i++) await ctx.db.insert("communityChannels", { communityId: f.communityId,
      name: `Private ${i}`, normalizedName: `private ${i}`, slug: `private-${i}`, accessMode: "restricted", postingPolicy: "members", status: "active", position: i + 1, createdAt: f.now, updatedAt: f.now });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  await f.t.run(async ctx => {
    expect((await ctx.db.get(f.membershipId))!.active).toBe(true);
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(100);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(0);
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    expect(run.status).toBe("failed");
    expect(run.errorCode).toContain("limit");
  });
});

test("builder-cleared assignment is not replaced", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { serviceChannelRevision: 1 }));
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  expect(await f.t.run(ctx => ctx.db.query("communityChannels").collect())).toHaveLength(0);
});

test("rejoin does not reopen the existing room or enqueue another join", async () => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    await ctx.db.patch(f.membershipId, { active: false });
    await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId, accessSource: "manual_grant", activationReason: "rejoin", nowMs: f.now + 1 });
    expect((await resolveMemberServiceChannel({ ctx, membership: (await ctx.db.get(f.membershipId))! as any })).status).toBe("unavailable");
    expect((await ctx.db.system.query("_scheduled_functions").collect()).filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
  });
});

test("builder config only accepts one join/private-room rule in the first milestone", async () => {
  const f = await fixture(), builder = f.t.withIdentity({ subject: "join-owner" });
  const base = { communityId: f.communityId, expectedRevision: 1, milestoneKey: "new", name: "New" };
  await expect(builder.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { ...base,
    automations: [{ trigger: { type: "member_joined" }, action: { type: "prompt_agent", prompt: "hello" } }] })).rejects.toThrow("workflow_join_action_invalid");
  await expect(builder.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { ...base,
    automations: [1, 2].map(() => ({ trigger: { type: "member_joined" as const }, action: { type: "create_service_channel" as const } })) })).rejects.toThrow("workflow_join_requires_first_milestone");
});

test("a late member-access failure rolls back room and grants, retaining only failed receipt", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.memberId,
    createdByUserId: f.ownerId, createdAt: f.now, updatedAt: f.now }));
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(0);
    expect((await ctx.db.get(f.membershipId))!.serviceChannelId).toBeUndefined();
    expect((await ctx.db.query("communityMemberWorkflowRuns").first())!.status).toBe("failed");
  });
});

test.each(["valid", "revoked", "archived", "shared", "other_client"])("existing binding is reused only with intact single-client access: %s", async condition => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const channel = await createActiveCommunityChannel({ ctx, communityId: f.communityId, createdByUserId: f.ownerId, name: "Existing service", accessMode: "restricted" });
    for (const target of [{ kind: "member" as const, userId: f.memberId }, { kind: "community_agent" as const }]) {
      await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target, active: true });
    }
    await bindMemberServiceChannel({ ctx, membership: (await ctx.db.get(f.membershipId))! as any, channelId: channel._id, expectedRevision: 0 });
    if (condition === "revoked") await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target: { kind: "community_agent" }, active: false });
    if (condition === "archived") await ctx.db.patch(channel._id, { status: "archived" });
    if (condition === "shared") await ctx.db.patch(channel._id, { accessMode: "all_members" });
    if (condition === "other_client") {
      const userId = await ctx.db.insert("users", { authSubject: "other-client", createdAt: f.now, updatedAt: f.now });
      await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: f.now, updatedAt: f.now });
      await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target: { kind: "member", userId }, active: true });
    }
  });
  const before = await f.t.run(async ctx => ({ channels: await ctx.db.query("communityChannels").collect(), grants: await ctx.db.query("communityChannelParticipants").collect() }));
  expect((await f.t.mutation(joinHandler, { ...f.job, serviceChannelRevision: 1 })).status).toBe(condition === "valid" ? "service_channel_ready" : "action_failed");
  const after = await f.t.run(async ctx => ({ channels: await ctx.db.query("communityChannels").collect(), grants: await ctx.db.query("communityChannelParticipants").collect() }));
  expect(after).toEqual(before);
});

test("concurrent duplicate join dispatch creates one room and run", async () => {
  const f = await fixture();
  await Promise.all([f.t.mutation(joinHandler, f.job), f.t.mutation(joinHandler, f.job)]);
  await f.t.run(async ctx => {
    expect((await ctx.db.query("communityChannels").collect()).filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(1);
  });
});
