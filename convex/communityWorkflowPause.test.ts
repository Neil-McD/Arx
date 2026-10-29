/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob("./**/*.*s");
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

test("an automation switched off keeps its steps, never runs, and comes back with the same keys", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "pause-owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "pause-member", displayName: "Ava", email: "ava@example.com", emailVerifiedAt: epoch, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Pause", slug: "pause", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    return { userId, communityId };
  });
  const owner = t.withIdentity({ subject: "pause-owner" });
  const created = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Start" });
  const email = (subject: string) => ({ type: "send_email" as const, subject, body: "Hi" });
  const first = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: created.milestone.key, name: "Start",
    automations: [
      { trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 }, action: { ...email("Day one"), key: "draft-a" } },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-a" }, action: email("After day one") },
      { trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 }, action: email("Still on") },
    ] });
  const [root, next, other] = first.milestone!.automations;

  // Switch the first automation off: its follow-up step goes off with it.
  const off = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 2,
    milestoneKey: created.milestone.key, name: "Start", automations: [{ ...root, paused: true }, next, other] });
  expect(off.milestone!.automations.map((rule) => rule.key)).toEqual([other.key]);
  expect(off.milestone!.pausedAutomations!.map((rule) => rule.key)).toEqual([root.key, next.key]);

  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const subjects = (await t.run(ctx => ctx.db.query("emailOutbox").collect())).map((row) => row.payload.subject);
  expect(subjects).toEqual(["Still on"]);

  // A save that leaves the switched-off rules out deletes them; sending them back on restores the same rules.
  const on = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 3,
    milestoneKey: created.milestone.key, name: "Start", automations: [other, root, next] });
  expect(on.milestone!.automations.map((rule) => rule.key)).toEqual([other.key, root.key, next.key]);
  expect(on.milestone!.pausedAutomations).toBeUndefined();
});
