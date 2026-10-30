/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { renderEmailTemplate } from "./emailCore";

const modules = import.meta.glob("./**/*.*s");
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup(t: ReturnType<typeof convexTest>) {
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "mail-owner", email: "owner@example.com", emailVerifiedAt: epoch, createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "mail-member", displayName: "Ava Stone", email: "ava@example.com", emailVerifiedAt: epoch, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Builders", slug: "builders", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId };
  });
  const owner = t.withIdentity({ subject: "mail-owner" });
  const stage = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Start" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: stage.milestone.key, name: "Start",
    automations: [{ trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 },
      action: { type: "send_email" as const, subject: "Welcome to {community}, {first_name}", body: "Hi {first_name},\n\nYour first step is ready." } }] });
  return { ...f, owner };
}

const outbox = (t: ReturnType<typeof convexTest>) => t.run(ctx => ctx.db.query("emailOutbox").collect());
const runs = (t: ReturnType<typeof convexTest>) => t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());

test("Send an email queues the owner's words for the member, with their name filled in and an unsubscribe link", async () => {
  const t = convexTest(schema, modules);
  const f = await setup(t);
  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});

  const [row] = await outbox(t);
  expect(row).toMatchObject({ templateKey: "community_workflow_email", recipientEmail: "ava@example.com", status: "pending" });
  expect(row.payload.subject).toBe("Welcome to Builders, Ava");
  expect(row.payload.body).toBe("Hi Ava,\n\nYour first step is ready.");
  expect(row.payload.unsubscribeUrl).toMatch(/^https:\/\/example\.convex\.site\/runtime\/email\/unsubscribe\?t=[0-9a-f]{48}$/);
  expect((await runs(t))[0]).toMatchObject({ status: "finished", actionResult: { resultCode: "email_queued" } });

  const rendered = renderEmailTemplate({ templateKey: "community_workflow_email", payload: row.payload });
  expect(rendered.subject).toBe("Welcome to Builders, Ava");
  expect(rendered.html).toContain("Your first step is ready.");
  expect(rendered.html).toContain("Unsubscribe from Builders emails");
  expect(rendered.text).toContain(`Unsubscribe: ${row.payload.unsubscribeUrl}`);
});

test("the unsubscribe link asks first, then stops the community's automation emails", async () => {
  const t = convexTest(schema, modules);
  const f = await setup(t);
  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const token = new URL((await outbox(t))[0].payload.unsubscribeUrl).searchParams.get("t")!;

  const page = await t.fetch(`/runtime/email/unsubscribe?t=${token}`, { method: "GET" });
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("Unsubscribe?");
  expect((await t.run(ctx => ctx.db.query("communityMemberSettings").collect()))[0].workflowEmailsOptedOutAt).toBeUndefined();

  const done = await t.fetch(`/runtime/email/unsubscribe`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `t=${token}` });
  expect(done.status).toBe(200);
  expect(await done.text()).toContain("Builders won't send you automated emails");
  expect((await t.fetch(`/runtime/email/unsubscribe?t=${"0".repeat(48)}`, { method: "POST" })).status).toBe(400);

  // The same rule for the next member visit is skipped, and the step still counts as done.
  const result = await t.run(async ctx => {
    const { sendWorkflowEmail } = await import("./communityWorkflowEmailCore");
    const membership = (await ctx.db.query("communityMemberships").collect()).find((row) => String(row.userId) === String(f.userId))!;
    return sendWorkflowEmail(ctx, { communityId: f.communityId, membership, workflowRunId: "again", autoplay: false, nowMs: Date.now(),
      action: { key: "a", type: "send_email", subject: "Again", body: "Again" } });
  });
  expect(result.resultCode).toBe("email_opted_out");
  expect(await outbox(t)).toHaveLength(1);
});

test("a test member's email goes to the admin running the test, marked as a test", async () => {
  const t = convexTest(schema, modules);
  const f = await setup(t);
  const testerId = await t.run(async ctx => {
    const testerId = await ctx.db.insert("users", { authSubject: "mail-tester", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityTestMembers", { communityId: f.communityId, userId: testerId, authSubject: "mail-tester", ownerUserId: f.ownerId,
      ownerAuthSubject: "mail-owner", label: "Test member 1", number: 1, createdAt: epoch });
    await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: testerId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch });
    return testerId;
  });
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const [row] = await outbox(t);
  expect(row).toMatchObject({ recipientEmail: "owner@example.com", status: "pending" });
  expect(String(row.recipientUserId)).toBe(String(f.ownerId));
  expect(String(row.recipientUserId)).not.toBe(String(testerId));
  expect(row.payload.subject).toBe("[Test] Welcome to Builders, Test");
});

test("an email step needs a subject and a message", async () => {
  const t = convexTest(schema, modules);
  const f = await setup(t);
  const stage = (await t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!.milestones[0];
  await expect(f.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 2,
    milestoneKey: stage.key, name: "Start", automations: [{ trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 },
      action: { type: "send_email" as const, subject: " ", body: "Hi" } }] })).rejects.toThrow("workflow_email_subject_invalid");
});

test("without an unsubscribe address the email step fails instead of sending", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "");
  const t = convexTest(schema, modules);
  const f = await setup(t);
  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  expect(await outbox(t)).toHaveLength(0);
  expect((await runs(t))[0]).toMatchObject({ status: "failed", errorCode: "workflow_email_unsubscribe_unavailable" });
});
