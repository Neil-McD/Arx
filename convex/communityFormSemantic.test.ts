/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CommunityMemberWorkflowAutomation } from "../shared/communityMemberWorkflow";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { completeCanonicalOperationReceiptInternal } from "./polynetCanonicalReceipts";
const modules = import.meta.glob(["./*.ts", "./_generated/**/*.*s"]);
const joinHandler = internal.communityMemberWorkflows.handleFirstMemberJoinInternal;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function fixture(mode: "room" | "form" | "both" = "room", reverse = false) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "join-owner", displayName: "Owner", createdAt: now, updatedAt: now });
    const memberId = await ctx.db.insert("users", { authSubject: "join-member", displayName: "Member", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "join-workflow", name: "Join workflow", lifecycleStatus: "active",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    const formId = await ctx.db.insert("communityForms", { communityId, key: "intake", name: "Intake", questions: [], revision: 1, publishedRevision: 1, createdAt: now, updatedAt: now });
    const versionId = await ctx.db.insert("communityFormVersions", { communityId, formId, revision: 1, name: "Intake", questions: [], publishedBy: ownerId, publishedAt: now });
    const automations: CommunityMemberWorkflowAutomation[] = [];
    if (mode !== "form") automations.push({ key: "join", trigger: { type: "member_joined" }, action: { key: "room", type: "create_service_channel" } });
    if (mode !== "room") automations.push({ key: "intake", trigger: { type: "member_joined" }, action: { key: "intake", type: "request_form", formKey: "intake" } });
    if (reverse) automations.reverse();
    const workflowId = await ctx.db.insert("communityMemberWorkflows", { communityId, revision: 1,
      milestones: [{ key: "new", name: "New", automations }],
      createdByUserId: ownerId, updatedByUserId: ownerId, createdAt: now, updatedAt: now });
    return { now, ownerId, memberId, communityId, workflowId, formId, versionId };
  });
  const activation = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId,
    accessSource: "manual_grant", activationReason: "test", nowMs: f.now }));
  const membershipId = activation.membership._id as Id<"communityMemberships">;
  const job = { membershipId, workflowId: f.workflowId, workflowRevision: 1, lifecycleGeneration: 0, serviceChannelRevision: 0, activatedAt: f.now };
  return { t, ...f, membershipId, job };
}

async function formFixture() {
  vi.useFakeTimers();
  const f = await fixture("form");
  await f.t.run(ctx => ctx.db.patch(f.versionId, { questions: [
    { key: "q", title: "What did you complete?", description: "", type: "short_text", required: true, options: [] },
    { key: "choice", title: "Status", description: "", type: "single_choice", required: false, options: ["Done", "Working"] },
  ] }));
  await f.t.mutation(joinHandler, f.job);
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  const actor = f.t.withIdentity({ subject: "join-member" });
  const ctx = { runQuery: (ref: any, args: any) => actor.query(ref, args), runMutation: (ref: any, args: any) => actor.mutation(ref, args), runAction: (ref: any, args: any) => actor.action(ref, args) };
  const input = { target: "/communities/join-workflow/capabilities/community.form.submit.json", operation: "community.form.submit", version: 1,
    idempotency_key: "form-proof", input: { form_request_ref: `form-request:${row._id}`, form_version_ref: `form-version:${row.versionId}`, expected_revision: row.revision, answers: { q: "Synthetic verified step" } } };
  const execute = (toolName: any, input: Record<string, unknown>, overrides = {}) => executePolynetCanonicalTool({ ctx,
    authSubject: "join-member", userId: f.memberId, principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName, input, ...overrides });
  const call = (value: Record<string, unknown> = input) => execute("polynet_call", value);
  const path = `/communities/join-workflow/members/me/forms/${row._id}.json`;
  const snapshot = () => f.t.run(async ctx => ({ request: await ctx.db.get(row._id),
    receipts: await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
  return { ...f, row, actor, input, execute, call, path, snapshot };
}

test("private discovery/read, lost acknowledgment and post-transition replay preserve one evidence-backed completion", async () => {
  const f = await formFixture();
  const listed = await f.execute("polynet_list", { path: "/communities/join-workflow/members/me/forms/" });
  expect(listed).toMatchObject({ ok: true, value: { searchable: false, writable: false, truncated: false } });
  expect(JSON.stringify(listed)).toContain(f.path);
  const read = await f.execute("polynet_read", { path: f.path });
  expect(read).toMatchObject({ ok: true, value: { truncated: false, searchable: false, writable: false } });
  await f.call(); // Deliberately discard the first application acknowledgment.
  const submitted = await f.snapshot();
  expect(submitted.request).toMatchObject({ status: "submitted", revision: 1 });
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  await f.t.mutation(internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId: run._id });
  const before = await f.snapshot();
  expect(before.transitions).toHaveLength(1);
  expect(JSON.stringify(before.transitions[0].completionEvidence)).toContain(f.row._id);
  expect(before.transitions[0]).toMatchObject({ completedWorkflow: true, workflowRunId: run._id });
  expect(await f.call()).toMatchObject({ ok: true, value: { deduped: true, result: { status: "submitted" } } });
  expect(await f.snapshot()).toEqual(before);
  expect(await f.execute("polynet_read", { path: f.path })).toMatchObject({ ok: true, value: { truncated: false } });
  expect(await f.call({ ...f.input, idempotency_key: "new-key" })).toMatchObject({ ok: false, code: "form_request_unavailable" });
});

test("answer identity sorts keys; changed answers/version conflict without a second write", async () => {
  const f = await formFixture();
  const input = { ...f.input, input: { ...f.input.input, answers: { q: "done", choice: "0" } } };
  expect(await f.call(input)).toMatchObject({ ok: true });
  const before = await f.snapshot();
  expect(await f.call({ ...input, input: { ...input.input, answers: { choice: "0", q: "done" } } })).toMatchObject({ ok: true, value: { deduped: true } });
  expect(await f.call({ ...input, input: { ...input.input, answers: { q: "changed" } } })).toMatchObject({ ok: false, code: "idempotency_key_conflict" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["revision", "version", "required", "choice", "unknown", "null", "override"])("invalid %s submission leaves no receipt or answer write", async kind => {
  const f = await formFixture(); const before = await f.snapshot();
  const input: any = { ...f.input.input };
  if (kind === "revision") input.expected_revision++;
  if (kind === "version") input.form_version_ref = `form-version:${f.row._id}`;
  if (kind === "required") input.answers = {};
  if (kind === "choice") input.answers = { q: "done", choice: "99" };
  if (kind === "unknown") input.answers = { q: "done", alien: "x" };
  if (kind === "null") input.answers = null;
  if (kind === "override") input.membership_id = f.membershipId;
  expect(await f.call({ ...f.input, input })).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["revoked", "activation", "archived", "blocked", "funding"])("current %s authority denies read and completed receipt replay", async kind => {
  const f = await formFixture(); expect(await f.call()).toMatchObject({ ok: true });
  await f.t.run(async ctx => {
    if (kind === "revoked") await ctx.db.patch(f.membershipId, { active: false });
    if (kind === "activation") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (kind === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" });
    if (kind === "funding") { const role = (await ctx.db.query("operatorRoles").first())!; await ctx.db.patch(role._id, { active: false }); await ctx.db.patch(f.communityId, { builderAccessMode: "subscription_required" }); }
    if (kind === "blocked") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.memberId, createdByUserId: f.ownerId, createdAt: Date.now(), updatedAt: Date.now() });
  });
  const before = await f.snapshot();
  await expect(f.call().catch(() => ({ ok: false }))).resolves.toMatchObject({ ok: false });
  await expect(f.execute("polynet_read", { path: f.path }).catch(() => ({ ok: false }))).resolves.toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(before);
});

test("other member, community agent and funnel builder cannot read or submit private self forms", async () => {
  const f = await formFixture();
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const ownerCtx = { runQuery: (ref: any, args: any) => owner.query(ref, args), runMutation: (ref: any, args: any) => owner.mutation(ref, args) };
  for (const overrides of [{ principalKind: "community_agent" }, { evidenceSurface: "community_funnel_builder" }, { userId: f.ownerId, authSubject: "join-owner", ctx: ownerCtx }]) {
    expect(await f.execute("polynet_read", { path: f.path }, overrides).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
    expect(await f.execute("polynet_call", f.input, overrides).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
  }
});

test.each(["answers", "escaped", "questions"])("aggregate %s payload rejects before freezing or creating a receipt", async kind => {
  const f = await formFixture();
  if (kind === "questions") await f.t.run(ctx => ctx.db.patch(f.versionId, { name: "x".repeat(24000) }));
  const input = { ...f.input, input: { ...f.input.input, answers: { q: kind === "answers" ? "x".repeat(25000) : kind === "escaped" ? "\u0001".repeat(5000) : "done" } } };
  const before = await f.snapshot();
  expect(await f.call(input)).toMatchObject({ ok: false, code: "form_payload_too_large" });
  expect(await f.snapshot()).toEqual(before);
  if (kind === "questions") expect(await f.execute("polynet_read", { path: f.path })).toMatchObject({ ok: false, code: "form_payload_too_large" });
});

test("receipt completion fault rolls back frozen answers and scheduled reconciliation", async () => {
  const f = await formFixture(); const before = await f.snapshot();
  vi.spyOn(completeCanonicalOperationReceiptInternal as any, "_handler").mockImplementationOnce(async () => { throw new Error("simulated_completion_failure"); });
  expect(await f.call()).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(before);
  expect(await f.call()).toMatchObject({ ok: true });
});

test("concurrent identical submits create one answer revision and one receipt", async () => {
  const f = await formFixture();
  const results = await Promise.all([f.call(), f.call()]);
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true })]));
  const state = await f.snapshot(); expect(state.request?.revision).toBe(1); expect(state.receipts).toHaveLength(1);
});

test("first-party draft/retry compatibility survives extraction", async () => {
  const f = await formFixture();
  const args = { communityId: f.communityId, requestId: f.row._id, expectedRevision: 0, answers: { q: "web answer" }, submit: false };
  expect(await f.actor.mutation(api.communityFormRequests.saveMyAnswers, args)).toMatchObject({ revision: 1, submitted: false });
  expect(await f.actor.mutation(api.communityFormRequests.saveMyAnswers, { ...args, expectedRevision: 1, submit: true })).toMatchObject({ revision: 2, submitted: true });
  expect(await f.actor.mutation(api.communityFormRequests.saveMyAnswers, { ...args, submit: true })).toMatchObject({ revision: 2, submitted: true });
});


test("pagination is scoped to actor/community and rebinds instead of carrying an old visit", async () => {
  const f = await formFixture();
  await f.t.run(async ctx => {
    const { _id, _creationTime, ...row } = f.row;
    for (let i = 0; i < 12; i++) await ctx.db.insert("communityFormRequests", { ...row, automationKey: `legacy-${i}` });
  });
  const scope = { userId: f.memberId, communityId: f.communityId };
  const page = await f.t.query(internal.communityFormRequests.listOwnFormsInternal, scope);
  expect(page.rows).toHaveLength(12); expect(page.next_cursor).toBeTruthy();
  const cursor = page.next_cursor!;
  expect((await f.t.query(internal.communityFormRequests.listOwnFormsInternal, { ...scope, cursor })).rows).toHaveLength(1);
  const viaTool = await f.execute("polynet_list", { path: "/communities/join-workflow/members/me/forms/", cursor });
  expect(viaTool).toMatchObject({ ok: true, value: { truncated: false } });
  await expect(f.t.query(internal.communityFormRequests.listOwnFormsInternal, { ...scope, userId: f.ownerId, cursor })).rejects.toThrow("form_cursor_invalid");
  for (const cursor of ["broken", "null", JSON.stringify({ scope: "foreign", cursor: "x", visit: "x" })])
    await expect(f.t.query(internal.communityFormRequests.listOwnFormsInternal, { ...scope, cursor })).rejects.toThrow("form_cursor_invalid");
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { activationSequence: 2 }));
  expect(await f.t.query(internal.communityFormRequests.listOwnFormsInternal, { ...scope, cursor })).toMatchObject({ rows: [], next_cursor: null, visit_changed: true });
});

test.each(["cancelled", "visit", "activation"])("new submit rejects stale %s request without effects", async kind => {
  const f = await formFixture();
  await f.t.run(ctx => ctx.db.patch(f.row._id, kind === "cancelled" ? { status: "cancelled" } : kind === "visit" ? { milestoneEnteredAt: 1 } : { activationSequence: 0 }));
  const before = await f.snapshot(); expect(await f.call()).toMatchObject({ ok: false }); expect(await f.snapshot()).toEqual(before);
  expect(await f.execute("polynet_read", { path: f.path })).toMatchObject({ ok: false });
});

test.each(["approval", "rule-change"])("submitted form cannot override %s completion authority", async kind => {
  const f = await formFixture();
  if (kind === "approval") await f.t.run(async ctx => { const w = (await ctx.db.get(f.workflowId))!; await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], requireHumanApproval: true }] }); });
  expect(await f.call()).toMatchObject({ ok: true });
  if (kind === "rule-change") await f.t.run(async ctx => { const w = (await ctx.db.get(f.workflowId))!; await ctx.db.patch(w._id, { revision: 2, milestones: [{ ...w.milestones[0], automations: [] }] }); });
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  await f.t.mutation(internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId: run._id });
  expect((await f.snapshot()).transitions).toHaveLength(0);
});

test("aggregate valid text answers cannot make a submitted document unreadable", async () => {
  const f = await formFixture();
  await f.t.run(async ctx => { const version = (await ctx.db.get(f.versionId))!; await ctx.db.patch(version._id, { questions: ["a", "b", "c"].map(key => ({ ...version.questions[0], key })) }); });
  const before = await f.snapshot();
  expect(await f.call({ ...f.input, input: { ...f.input.input, answers: { a: "x".repeat(8000), b: "x".repeat(8000), c: "x".repeat(8000) } } })).toMatchObject({ ok: false, code: "form_payload_too_large" });
  expect(await f.snapshot()).toEqual(before);
});
