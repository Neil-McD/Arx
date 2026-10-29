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
  const versionId = await f.t.run(async ctx => { const { _id, _creationTime, ...version } = (await ctx.db.get(f.versionId))!; return ctx.db.insert("communityFormVersions", { ...version, revision: 2 }); });
  expect(await f.call({ ...input, input: { ...input.input, form_version_ref: `form-version:${versionId}` } })).toMatchObject({ ok: false, code: "idempotency_key_conflict" });
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
  if (kind === "archived") {
    await expect(f.call()).rejects.toThrow("community_archived");
    await expect(f.execute("polynet_read", { path: f.path })).rejects.toThrow("community_archived");
  } else {
    expect(await f.call()).toMatchObject({ ok: false });
    expect(await f.execute("polynet_read", { path: f.path })).toMatchObject({ ok: false });
  }
  expect(await f.snapshot()).toEqual(before);
});

test("other member, community agent and funnel builder cannot read or submit private self forms", async () => {
  const f = await formFixture();
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const ownerCtx = { runQuery: (ref: any, args: any) => owner.query(ref, args), runMutation: (ref: any, args: any) => owner.mutation(ref, args) };
  for (const overrides of [{ principalKind: "community_agent", mountedCommunityId: f.communityId }, { evidenceSurface: "community_funnel_builder" }, { userId: f.ownerId, authSubject: "join-owner", ctx: ownerCtx }]) {
    expect(await f.execute("polynet_read", { path: f.path }, overrides)).toMatchObject({ ok: false });
    expect(await f.execute("polynet_call", f.input, overrides)).toMatchObject({ ok: false });
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

test("funnel builder self directory does not advertise the private forms adapter", async () => {
  const f = await formFixture();
  const result = await f.execute("polynet_list", { path: "/communities/join-workflow/members/me/" }, { evidenceSurface: "community_funnel_builder" });
  expect(result).toMatchObject({ ok: true });
  expect(JSON.stringify(result)).not.toContain("/forms/");
});

test("the welcome flow holds a new member to the join form until it is submitted, then opens the community", async () => {
  const f = await fixture("form");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const member = f.t.withIdentity({ subject: "join-member" });
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, { communityId: f.communityId, expectedRevision: 1, enabled: true });
  await f.t.mutation(joinHandler, { ...f.job, workflowRevision: 2 });
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  const gate = () => f.t.run(async ctx => {
    const { getCommunityAndMembership, readCommunityWelcomeGate, requireCommunityChatAccess } = await import("./communityCore");
    const { community, membership } = await getCommunityAndMembership({ ctx, communityId: f.communityId, userId: f.memberId });
    const held = await requireCommunityChatAccess({ ctx, communityId: f.communityId, userId: f.memberId }).then(() => null, (error: Error) => error.message);
    const owner = await requireCommunityChatAccess({ ctx, communityId: f.communityId, userId: f.ownerId }).then(() => "open");
    return { ...(await readCommunityWelcomeGate({ ctx, community, membership, userId: f.memberId })), held, owner };
  });
  expect(await gate()).toEqual({ required: true, requestIds: [String(row._id)], lessonIds: [], display: "page", held: "community_welcome_required", owner: "open" });
  // As a pop-up it still asks, but the community opens behind it.
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeDisplay, { communityId: f.communityId, expectedRevision: 2, display: "popup" });
  expect(await gate()).toEqual({ required: true, requestIds: [String(row._id)], lessonIds: [], display: "popup", held: null, owner: "open" });
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeDisplay, { communityId: f.communityId, expectedRevision: 3, display: "page" });
  expect((await gate()).held).toBe("community_welcome_required");
  // The form itself stays reachable, so the member can finish it.
  await member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: row._id, expectedRevision: row.revision, answers: {}, submit: true });
  expect(await gate()).toEqual({ required: false, requestIds: [], lessonIds: [], display: "page", held: null, owner: "open" });
});

test.each([false, true])("with the welcome flow on, a join rule still sets up the member's private channel (form first=%s)", async reverse => {
  const f = await fixture("both", reverse);
  await f.t.run(ctx => ctx.db.patch(f.workflowId, { welcomeGate: true, welcomeGateEnabledAt: f.now - 1 }));
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityFormRequests").collect()).toHaveLength(1);
    expect((await ctx.db.get(f.membershipId))!.serviceChannelId).toBeDefined();
    expect((await ctx.db.query("communityMemberWorkflowRuns").collect()).map(r => r.status)).toEqual(["finished", "finished"]);
    // The room is theirs, but the hold still keeps them out of it until the form is in.
    const { requireCommunityChatAccess } = await import("./communityCore");
    await expect(requireCommunityChatAccess({ ctx, communityId: f.communityId, userId: f.memberId })).rejects.toThrow("community_welcome_required");
  });
});

test("a member who joins after the welcome flow is on is held before the join rule has made their form", async () => {
  const f = await fixture("form");
  const gate = () => f.t.run(async ctx => {
    const { getCommunityAndMembership, readCommunityWelcomeGate } = await import("./communityCore");
    const { community, membership } = await getCommunityAndMembership({ ctx, communityId: f.communityId, userId: f.memberId });
    return await readCommunityWelcomeGate({ ctx, community, membership, userId: f.memberId });
  });
  const setActivatedAt = (activatedAt: number) => f.t.run(ctx => ctx.db.patch(f.membershipId, { activatedAt }));
  await f.t.run(ctx => ctx.db.patch(f.workflowId, { welcomeGate: true, welcomeGateEnabledAt: f.now - 1 }));
  // Joined, join rule not run yet: held, with no form to show yet.
  expect(await gate()).toEqual({ required: true, requestIds: [], lessonIds: [], display: "page" });
  // Joined before the flow was turned on: never held for a form that isn't coming.
  await setActivatedAt(f.now - 2);
  expect(await gate()).toEqual({ required: false, requestIds: [], lessonIds: [], display: "page" });
  // The join rule never ran: the hold lapses instead of locking the member out.
  await setActivatedAt(Date.now() - 3 * 60_000);
  await f.t.run(ctx => ctx.db.patch(f.workflowId, { welcomeGateEnabledAt: Date.now() - 4 * 60_000 }));
  expect(await gate()).toEqual({ required: false, requestIds: [], lessonIds: [], display: "page" });
  await setActivatedAt(f.now);
  await f.t.run(ctx => ctx.db.patch(f.workflowId, { welcomeGateEnabledAt: f.now - 1 }));
  await f.t.mutation(joinHandler, f.job);
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  expect(await gate()).toEqual({ required: true, requestIds: [String(row._id)], lessonIds: [], display: "page" });
});

test("welcome lessons hold the member after the forms, and only they open while held", async () => {
  const f = await fixture("form");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const member = f.t.withIdentity({ subject: "join-member" });
  const { welcomeLesson, otherLesson } = await f.t.run(async ctx => {
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId: f.communityId, createdByUserId: f.ownerId, status: "live",
      name: "Start here", sortOrder: 0, createdAt: f.now, updatedAt: f.now });
    const page = (title: string, lesson: object) => ctx.db.insert("communityResources", { communityId: f.communityId, moduleId, createdByUserId: f.ownerId,
      type: "post", role: "page", title, bodyMd: `# ${title}\n\nRead this.`, pinned: false, lesson, createdAt: f.now, updatedAt: f.now } as any);
    // The welcome lesson sits in a later board stage, behind the other lesson's gate.
    return { welcomeLesson: await page("Install Claude Code", { stage: "Week 2", stage_order: 2 }),
      otherLesson: await page("Week 1 check-in", { stage: "Week 1", stage_order: 1, gate: true }) };
  });
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, { communityId: f.communityId, expectedRevision: 1, enabled: true });
  await owner.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, { communityId: f.communityId, expectedRevision: 2,
    title: "Welcome, builder", message: "Two quick steps.", mediaUrl: "", lessonIds: [String(welcomeLesson)] });
  // The member joined before the flow existed, so only their pending join form holds them; lessons follow it.
  await f.t.mutation(joinHandler, { ...f.job, workflowRevision: 3 });
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  const gate = () => f.t.run(async ctx => {
    const { getCommunityAndMembership, readCommunityWelcomeGate } = await import("./communityCore");
    const { community, membership } = await getCommunityAndMembership({ ctx, communityId: f.communityId, userId: f.memberId });
    const { required, requestIds, lessonIds } = await readCommunityWelcomeGate({ ctx, community, membership, userId: f.memberId });
    return { required, requestIds, lessonIds };
  });
  expect(await gate()).toEqual({ required: true, requestIds: [String(row._id)], lessonIds: [String(welcomeLesson)] });
  const page = await member.query(api.communityResources.getMyWelcomePage, { communityId: f.communityId });
  expect(page).toMatchObject({ title: "Welcome, builder", message: "Two quick steps.", media_url: null });
  expect(page.lessons.map((lesson: any) => lesson.title)).toEqual(["Install Claude Code"]);
  await member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: row._id, expectedRevision: row.revision, answers: {}, submit: true });
  // Form done: the member is still held by the lesson, and may work on it but not on other lessons.
  expect(await gate()).toEqual({ required: true, requestIds: [], lessonIds: [String(welcomeLesson)] });
  // While held, their progress shows only the welcome lesson, unlocked despite the earlier stage's gate.
  const progress = await member.query(api.communityResourceProgress.getOwnResourceProgress, { communityId: f.communityId });
  expect(progress).toMatchObject({ journey: null, courses: [], stages: [] });
  expect(progress.lessons.map((lesson: any) => [lesson.title, lesson.locked])).toEqual([["Install Claude Code", false]]);
  await expect(member.mutation(api.communityResourceProgress.setOwnResourceProgressStatus,
    { communityId: f.communityId, resourceId: String(otherLesson), status: "done" })).rejects.toThrow("community_welcome_required");
  await expect(member.mutation(api.communityResourceProgress.setOwnResourceProgressStatus,
    { communityId: f.communityId, resourceId: String(welcomeLesson), status: "done" })).resolves.toMatchObject({ ok: true });
  expect(await gate()).toEqual({ required: false, requestIds: [], lessonIds: [] });
  // Released: the full progress comes back, and the gate still locks the rest of week 2.
  const released = await member.query(api.communityResourceProgress.getOwnResourceProgress, { communityId: f.communityId });
  expect(released.lessons.map((lesson: any) => lesson.title).sort()).toEqual(["Install Claude Code", "Week 1 check-in"]);
  expect(released.courses).toHaveLength(1);
});

test("a welcome page saved as blocks keeps its order, and its forms become the join forms", async () => {
  const f = await fixture("both");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const member = f.t.withIdentity({ subject: "join-member" });
  const lesson = await f.t.run(async ctx => {
    await ctx.db.insert("communityForms", { communityId: f.communityId, key: "goals", name: "Goals", questions: [], revision: 1, publishedRevision: 1, createdAt: f.now, updatedAt: f.now });
    await ctx.db.insert("communityForms", { communityId: f.communityId, key: "draft", name: "Draft", questions: [], revision: 1, createdAt: f.now, updatedAt: f.now } as any);
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId: f.communityId, createdByUserId: f.ownerId, status: "live",
      name: "Start here", sortOrder: 0, createdAt: f.now, updatedAt: f.now });
    return await ctx.db.insert("communityResources", { communityId: f.communityId, moduleId, createdByUserId: f.ownerId,
      type: "post", role: "page", title: "Install Claude Code", bodyMd: "Read this.", pinned: false, createdAt: f.now, updatedAt: f.now } as any);
  });
  const save = (layout: any[], expectedRevision: number) => owner.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, {
    communityId: f.communityId, expectedRevision, title: "Welcome, builder", message: "", mediaUrl: "", lessonIds: [], layout });
  await expect(save([{ type: "form", formKey: "draft" }], 1)).rejects.toThrow("form_not_published");
  await expect(save([{ type: "form", formKey: "goals" }, { type: "next" }, { type: "form", formKey: "goals" }], 1)).rejects.toThrow("welcome_step_duplicate");
  await save([
    { type: "next" }, { type: "text", markdown: "  Hello  " }, { type: "text", markdown: "https://youtu.be/abc" }, { type: "next" }, { type: "next" },
    { type: "lesson", resourceId: String(lesson) }, { type: "next" }, { type: "form", formKey: "goals" }, { type: "text", markdown: " " }, { type: "next" },
  ], 1);
  const workflow = (await f.t.run(ctx => ctx.db.get(f.workflowId)))!;
  // Tidied: no breaks at the ends or twice in a row, no empty text.
  expect(workflow.welcomePage).toEqual({ title: "Welcome, builder", layout: [
    { type: "text", markdown: "Hello" }, { type: "text", markdown: "https://youtu.be/abc" }, { type: "next" },
    { type: "lesson", resourceId: String(lesson) }, { type: "next" }, { type: "form", formKey: "goals" },
  ] });
  expect(workflow.welcomeLessonIds).toEqual([lesson]);
  // The private-channel rule stays; the intake form left the page, so its join rule went, and goals joined.
  expect(workflow.milestones[0].automations.map(a => [a.trigger.type, a.action.type, (a.action as any).formKey ?? null]))
    .toEqual([["member_joined", "create_service_channel", null], ["member_joined", "request_form", "goals"]]);
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, { communityId: f.communityId, expectedRevision: 2, enabled: true });
  const page = await member.query(api.communityResources.getMyWelcomePage, { communityId: f.communityId });
  expect(page.layout).toEqual(workflow.welcomePage!.layout);
  expect(page.lessons.map((row: any) => row.title)).toEqual(["Install Claude Code"]);
});

test("a lesson-done rule after the join form still runs, and the stage waits for that lesson", async () => {
  vi.useFakeTimers();
  const f = await fixture("form");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const member = f.t.withIdentity({ subject: "join-member" });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Stage", type: "select", options: ["Joined", "Building"] });
  const lesson = await f.t.run(async ctx => {
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId: f.communityId, createdByUserId: f.ownerId, status: "live",
      name: "Start here", sortOrder: 0, createdAt: f.now, updatedAt: f.now });
    return ctx.db.insert("communityResources", { communityId: f.communityId, moduleId, createdByUserId: f.ownerId,
      type: "post", role: "page", title: "Watch this first", bodyMd: "Hello.", pinned: false, createdAt: f.now, updatedAt: f.now });
  });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, milestoneKey: "new", expectedRevision: 1, name: "New",
    automations: [
      { key: "intake", trigger: { type: "member_joined" as const }, action: { key: "intake", type: "request_form" as const, formKey: "intake" } },
      { key: "", trigger: { type: "lesson_completed" as const, resourceId: String(lesson) }, action: { key: "", type: "set_client_property" as const, propertyKey: "stage", value: "Building" } },
    ] });
  await f.t.mutation(joinHandler, { ...f.job, workflowRevision: 2 });
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  await member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: row._id, expectedRevision: row.revision, answers: {}, submit: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  // The form alone no longer finishes the stage: finishing the lesson is still to do.
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
  await member.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { communityId: f.communityId, resourceId: String(lesson), status: "done" });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run(ctx => ctx.db.query("communityClientValues").collect())).toMatchObject([{ propertyKey: "stage", value: "Building", updatedVia: "workflow" }]);
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toMatchObject([{ completedWorkflow: true }]);
});

test("a welcome page with only a lesson can be turned on, and holds members who join after it", async () => {
  const f = await fixture("room");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const lesson = await f.t.run(async ctx => {
    const moduleId = await ctx.db.insert("communityResourceModules", { communityId: f.communityId, createdByUserId: f.ownerId, status: "live",
      name: "Start here", sortOrder: 0, createdAt: f.now, updatedAt: f.now });
    return ctx.db.insert("communityResources", { communityId: f.communityId, moduleId, createdByUserId: f.ownerId,
      type: "post", role: "page", title: "Watch this first", bodyMd: "Hello.", pinned: false, createdAt: f.now, updatedAt: f.now });
  });
  await expect(owner.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, { communityId: f.communityId, expectedRevision: 1,
    title: "Hi", message: "", mediaUrl: "not a link", lessonIds: [String(lesson)] })).rejects.toThrow("welcome_media_url_invalid");
  await owner.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, { communityId: f.communityId, expectedRevision: 1,
    title: "  Hi   there ", message: "", mediaUrl: "https://www.youtube.com/watch?v=abc", lessonIds: [String(lesson)] });
  await owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, { communityId: f.communityId, expectedRevision: 2, enabled: true });
  const board = await owner.query(api.communityMemberWorkflows.getBuilderWorkflowBoardPage, { communityId: f.communityId });
  expect(board.workflow).toMatchObject({ welcome_gate: true, welcome_lesson_ids: [String(lesson)],
    welcome_page: { title: "Hi there", message: "", media_url: "https://www.youtube.com/watch?v=abc" } });
  // Removing the last step while the page is on would leave nothing to finish, so it is refused.
  await expect(owner.mutation(api.communityMemberWorkflows.saveBuilderWelcomePage, { communityId: f.communityId, expectedRevision: 3,
    title: "", message: "", mediaUrl: "", lessonIds: [] })).rejects.toThrow("welcome_gate_requires_join_form");
  await f.t.run(ctx => ctx.db.patch(f.workflowId, { welcomeGateEnabledAt: f.now - 1 }));
  const gate = () => f.t.run(async ctx => {
    const { getCommunityAndMembership, readCommunityWelcomeGate } = await import("./communityCore");
    const { community, membership } = await getCommunityAndMembership({ ctx, communityId: f.communityId, userId: f.memberId });
    const { required, requestIds, lessonIds } = await readCommunityWelcomeGate({ ctx, community, membership, userId: f.memberId });
    return { required, requestIds, lessonIds };
  });
  expect(await gate()).toEqual({ required: true, requestIds: [], lessonIds: [String(lesson)] });
  await f.t.withIdentity({ subject: "join-member" }).mutation(api.communityResourceProgress.setOwnResourceProgressStatus,
    { communityId: f.communityId, resourceId: String(lesson), status: "done" });
  expect(await gate()).toEqual({ required: false, requestIds: [], lessonIds: [] });
});

test("the welcome flow can only be turned on when the first stage requests a form on join", async () => {
  const f = await fixture("room");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  await expect(owner.mutation(api.communityMemberWorkflows.setBuilderWelcomeGate, { communityId: f.communityId, expectedRevision: 1, enabled: true }))
    .rejects.toThrow("welcome_gate_requires_join_form");
});

test("a submitted form fills the client properties its questions map to, asks for the right shape, and logs an answer that no longer fits", async () => {
  const f = await fixture("form");
  const owner = f.t.withIdentity({ subject: "join-owner" });
  const member = f.t.withIdentity({ subject: "join-member" });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Business", type: "text" });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Hours per week", type: "number" });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Stage", type: "select", options: ["Idea", "Selling"] });
  await expect(owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "check", expectedRevision: 0, name: "Check",
    questions: [{ key: "s", title: "Stage", description: "", required: false, type: "long_text", options: [], clientPropertyKey: "stage" }] }))
    .rejects.toThrow("form_property_type_mismatch");
  // A choice the property doesn't have would never fill it, so the mapping is refused.
  await expect(owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "check", expectedRevision: 0, name: "Check",
    questions: [{ key: "s", title: "Stage", description: "", required: false, type: "single_choice", options: ["Beginner", "Experienced"], clientPropertyKey: "stage" }] }))
    .rejects.toThrow("form_property_options_mismatch");
  await f.t.run(ctx => ctx.db.patch(f.versionId, { questions: [
    { key: "sells", title: "What does your business sell?", description: "", type: "long_text", required: true, options: [], clientPropertyKey: "business" },
    { key: "hours", title: "How many hours a week?", description: "", type: "short_text", required: false, options: [], clientPropertyKey: "hours_per_week" },
    { key: "stage", title: "Where are you?", description: "", type: "single_choice", required: false, options: ["Selling", "Idea"], clientPropertyKey: "stage" },
    { key: "free", title: "Anything else?", description: "", type: "short_text", required: false, options: [] },
  ] }));
  await f.t.mutation(joinHandler, f.job);
  const row = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  // The member is told the hours answer must be a number, and can't submit text there.
  const served = await member.query(api.communityFormRequests.getMyRequest, { communityId: f.communityId, requestId: row._id });
  expect(served.questions.find((q: any) => q.key === "hours")).toMatchObject({ answerFormat: "number" });
  await expect(member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: row._id, expectedRevision: row.revision,
    answers: { sells: "AI employee builds", hours: "about 5", stage: "0", free: "hi" }, submit: true })).rejects.toThrow("Enter a number");
  // The owner renames a Stage option after publishing: that answer can't fill it any more.
  const stage = (await f.t.run(ctx => ctx.db.query("communityClientProperties").collect())).find(row => row.key === "stage")!;
  await f.t.run(ctx => ctx.db.patch(stage._id, { options: ["Idea", "Scaling"] }));
  await member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: row._id, expectedRevision: row.revision,
    answers: { sells: "AI employee builds", hours: "5", stage: "0", free: "hi" }, submit: true });
  const values = await f.t.run(ctx => ctx.db.query("communityClientValues").collect());
  expect(values.map(row => [row.propertyKey, row.value, row.updatedVia]).sort()).toEqual([
    ["business", "AI employee builds", "form"], ["hours_per_week", 5, "form"]]);
  expect(await f.t.run(ctx => ctx.db.get(row._id))).toMatchObject({ status: "submitted" });
  const timeline = await owner.query(api.communityClients.getClientTimeline, { communityId: f.communityId, membershipId: String(f.membershipId) });
  expect(timeline.entries.map((entry: any) => entry.summary)).toContain("Form answer to “Where are you?” didn’t fit stage, so it wasn’t saved");
});
