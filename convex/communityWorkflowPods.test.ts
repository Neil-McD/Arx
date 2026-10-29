/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./communityChannelParticipants.ts", "./communityWorkflowGuideChannels.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

// Pods are invite-only channels. A stage can put a member in a pod, take them
// out, and run a step when someone else adds them to one.
async function setup(automations: (pod: string) => any[]) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "pods-owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "pods-member", displayName: "Member", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Pods", slug: "pods", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    const podId = await ctx.db.insert("communityChannels", { communityId, name: "Builders pod", slug: "builders-pod", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdAt: epoch, updatedAt: epoch });
    const openId = await ctx.db.insert("communityChannels", { communityId, name: "Lounge", slug: "lounge", accessMode: "all_members", postingPolicy: "members", status: "active", position: 2, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityClientProperties", { communityId, key: "pod", name: "Pod", type: "text", options: [], position: 0, createdByUserId: ownerId, createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId, podId, openId };
  });
  const owner = t.withIdentity({ subject: "pods-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Start" });
  const save = (rules: any[], expectedRevision = 1) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision,
    milestoneKey: first.milestone.key, name: "Start", automations: rules });
  const join = async () => {
    await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: Date.now() }));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  };
  const grant = (active: boolean) => owner.mutation(api.communityChannelParticipants.setParticipant, { communityId: f.communityId, channelId: f.podId, target: { kind: "member", userId: f.userId }, active });
  const rows = () => t.run(async ctx => ({
    grants: (await ctx.db.query("communityChannelParticipants").collect()).filter(row => row.principalKey === `user:${f.userId}`),
    values: await ctx.db.query("communityClientValues").collect(),
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
  }));
  return { t, f, save, join, grant, rows, automations: automations(String(f.podId)) };
}

test("reaching a stage can add a member to a pod, and that add doesn't set off 'added to a pod'", async () => {
  const s = await setup(pod => [
    { trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "set_pod_member", channelId: pod, active: true } },
    { trigger: { type: "pod_member_added", channelId: pod }, action: { type: "set_client_property", propertyKey: "pod", value: "added by someone" } },
  ]);
  await s.save(s.automations);
  await s.join();
  const rows = await s.rows();
  expect(rows.grants).toHaveLength(1);
  expect(rows.grants[0].status).toBe("active");
  expect(rows.runs.map(run => run.actionResult?.resultCode)).toContain("pod_member_added");
  expect(rows.values).toHaveLength(0);
});

test("someone else adding them to the pod runs the 'added to a pod' rule once", async () => {
  const s = await setup(pod => [
    { trigger: { type: "pod_member_added" }, action: { type: "set_client_property", propertyKey: "pod", value: "Builders" } },
  ]);
  await s.save(s.automations);
  await s.join();
  await s.grant(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.grant(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows = await s.rows();
  expect(rows.values.map(value => value.value)).toEqual(["Builders"]);
  expect(rows.runs).toHaveLength(1);
});

test("a step can take a member out of a pod", async () => {
  const s = await setup(pod => [
    { trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "set_pod_member", channelId: pod, active: false } },
  ]);
  await s.save(s.automations);
  await s.t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: s.f.communityId, userId: s.f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: Date.now() }));
  await s.grant(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows = await s.rows();
  expect(rows.grants[0].status).toBe("revoked");
});

test("only invite-only channels can be pods", async () => {
  const s = await setup(() => []);
  await expect(s.save([{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "set_pod_member", channelId: String(s.f.openId), active: true } }]))
    .rejects.toThrow("workflow_pod_unavailable");
  await expect(s.save([{ trigger: { type: "pod_member_added", channelId: String(s.f.openId) }, action: { type: "send_email", subject: "Hi", body: "Hello" } }]))
    .rejects.toThrow("workflow_pod_unavailable");
});

test("a member's personal pod can be a pod step, and creating it doesn't set off 'added to a pod'", async () => {
  const s = await setup(() => []);
  await s.save([{ trigger: { type: "pod_member_added" }, action: { type: "set_client_property", propertyKey: "pod", value: "joined" } }]);
  await s.join();
  // Make the invite-only channel this member's personal pod, then add them to it.
  await s.t.run(async ctx => {
    const membership = (await ctx.db.query("communityMemberships").collect()).find(row => row.userId === s.f.userId)!;
    await ctx.db.patch(membership._id, { serviceChannelId: s.f.podId });
  });
  await s.grant(true);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await s.rows()).values).toHaveLength(0);
  await s.save([{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "set_pod_member", channelId: String(s.f.podId), active: true } }], 2);
});
