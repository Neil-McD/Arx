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
import { readWorkflowApprovalObservation } from "./communityWorkflowCompletionCore";
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

const operation = "community.workflow.approve_milestone";
async function approvalFixture(submit = true, terminal = true) {
  vi.useFakeTimers(); const f = await fixture("form");
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], requireHumanApproval: true },
      ...(terminal ? [] : [{ key: "next", name: "Next", automations: [] }])] });
    await ctx.db.patch(f.versionId, { questions: [{ key: "q", title: "Synthetic proof", description: "", type: "short_text", required: true, options: [] }] });
  });
  await f.t.mutation(joinHandler, f.job);
  const request = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  const member = f.t.withIdentity({ subject: "join-member" }), owner = f.t.withIdentity({ subject: "join-owner" });
  if (submit) await member.mutation(api.communityFormRequests.saveMyAnswers,
    { communityId: f.communityId, requestId: request._id, expectedRevision: 0, answers: { q: "Synthetic verified answer" }, submit: true });
  const dossierArgs = { communityId: f.communityId, membershipId: f.membershipId };
  const dossier = () => owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, dossierArgs);
  const observation = (await dossier()).workflow?.approval;
  const input = { target: `/communities/join-workflow/capabilities/${operation}.json`, operation, version: 1,
    idempotency_key: "approval-proof", input: { membership_ref: `membership:${f.membershipId}`,
      expected_activation_sequence: 1, review_ref: observation?.review_ref ?? `workflow-approval:v1:${"0".repeat(64)}` } };
  const identityContext = (actor: typeof owner) => ({ runQuery: (ref: any, args: any) => actor.query(ref, args),
    runMutation: (ref: any, args: any) => actor.mutation(ref, args), runAction: (ref: any, args: any) => actor.action(ref, args) });
  const execute = (toolName: any, input: Record<string, unknown>, overrides = {}) => executePolynetCanonicalTool({
    ctx: identityContext(owner), authSubject: "join-owner", userId: f.ownerId, principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName, input, ...overrides });
  const call = (value: Record<string, unknown> = input, overrides = {}) => execute("polynet_call", value, overrides);
  const snapshot = () => f.t.run(async ctx => ({ requests: await ctx.db.query("communityFormRequests").collect(),
    receipts: await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
    timers: await ctx.db.query("communityMemberWorkflowTimers").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
  const direct = (value = input) => f.t.mutation(internal.communityMemberWorkflows.approveObservedMilestoneInternal,
    { communityId: f.communityId, userId: f.ownerId, membershipId: f.membershipId, principalKind: "external_mcp",
      expectedActivationSequence: value.input.expected_activation_sequence, reviewRef: value.input.review_ref, idempotencyKey: value.idempotency_key });
  return { ...f, request, owner, member, dossier, observation, input, execute, call, snapshot, direct, identityContext };
}

test.each([true, false])("exact reviewed evidence approves once and recovers after lost acknowledgment (terminal=%s)", async terminal => {
  const f = await approvalFixture(true, terminal);
  expect(await f.execute("polynet_read", { path: f.input.target })).toMatchObject({ ok: true });
  const canonicalDossier = await f.execute("polynet_read", { path: `/communities/join-workflow/builder/workflow-members/${f.membershipId}.md` });
  expect(canonicalDossier).toMatchObject({ ok: true, value: { context: { workflow: { approval: f.observation } } } });
  expect(f.observation?.review_ref).toMatch(/^workflow-approval:v1:[a-f0-9]{64}$/);
  const self = await f.t.run(async ctx => { const { resolveSelfCommunityMembershipContext } = await import("./communityMembershipContextCore"); return resolveSelfCommunityMembershipContext({ ctx, actorUserId: f.memberId, communityId: f.communityId }); });
  expect(self.workflow).not.toHaveProperty("approval");
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  expect(await f.t.mutation(internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId: run._id })).toMatchObject({ status: "awaiting_human_approval" });
  expect((await f.snapshot()).transitions).toHaveLength(0);
  await f.call(); // Discard first application acknowledgment after commit.
  const before = await f.snapshot(); expect(before.transitions).toHaveLength(1);
  expect(before.transitions[0]).toMatchObject({ actionKey: "human_approved", completedWorkflow: terminal,
    approval: { actorUserId: f.ownerId, activationSequence: 1 } });
  expect(before.transitions[0].forcedByUserId).toBeUndefined();
  expect(before.transitions[0].completionEvidence?.[0].source_id).toBe(f.request._id);
  expect(await f.call()).toMatchObject({ ok: true, value: { deduped: true, result: { status: "approved", completed_workflow: terminal } } });
  expect(await f.snapshot()).toEqual(before);
  expect(await f.call({ ...f.input, idempotency_key: "new-key" })).toMatchObject({ ok: false, code: "workflow_approval_unavailable" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["revision", "goal", "instructions", "approval-mode", "visit", "sequence", "answers", "version"])("review identity rejects changed %s before a decision", async kind => {
  const f = await approvalFixture();
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    if (kind === "revision") await ctx.db.patch(w._id, { revision: 2 });
    if (["goal", "instructions", "approval-mode"].includes(kind)) await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0],
      ...(kind === "goal" ? { goal: "Changed goal" } : kind === "instructions" ? { instructions: "Changed instructions" } : { requireHumanApproval: false }) }] });
    if (kind === "visit" || kind === "sequence") await ctx.db.insert("communityMemberWorkflowMemberMilestones", {
      workflowId: f.workflowId, membershipId: f.membershipId, currentMilestoneKey: "new", milestoneEnteredAt: kind === "visit" ? 1 : f.now,
      transitionSeq: kind === "sequence" ? 1 : 0, createdAt: f.now, updatedAt: f.now });
    if (kind === "answers") await ctx.db.patch(f.request._id, { answers: { q: "Different evidence" }, revision: 2 });
    if (kind === "version") await ctx.db.patch(f.versionId, { questions: [{ key: "q", title: "Changed schema", description: "", type: "short_text", required: true, options: [] }] });
  });
  const before = await f.snapshot(); expect(await f.call()).toMatchObject({ ok: false, code: "workflow_approval_unavailable" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["pending", "zero-actions", "truncated", "oversized", "unreadable-evidence"])("%s evidence offers no executable observation", async kind => {
  const f = await approvalFixture(kind !== "pending");
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    if (kind === "zero-actions") await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], automations: [] }] });
    if (kind === "truncated") { const row = (await ctx.db.query("communityMemberWorkflowRuns").first())!; const { _id, _creationTime, ...rest } = row;
      for (let i=0;i<257;i++) await ctx.db.insert("communityMemberWorkflowRuns", { ...rest, triggerReceiptRef: `noise-${i}` }); }
    if (kind === "oversized") await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], instructions: "x".repeat(25000) }] });
    if (kind === "unreadable-evidence") await ctx.db.patch(f.request._id, { answers: {} });
  });
  expect((await f.dossier()).workflow?.approval).toBeNull();
  const before = await f.snapshot(); expect(await f.call()).toMatchObject({ ok: false, code: "workflow_approval_unavailable" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["revoked", "blocked", "reactivated", "archived", "funding", "duplicate-pair"])("current target %s denies historical approval replay", async kind => {
  const f = await approvalFixture(); expect(await f.direct()).toMatchObject({ ok: true });
  await f.t.run(async ctx => {
    if (kind === "revoked") await ctx.db.patch(f.membershipId, { active: false });
    if (kind === "reactivated") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (kind === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" });
    if (kind === "blocked") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.memberId, createdByUserId: f.ownerId, createdAt: f.now, updatedAt: f.now });
    if (kind === "funding") { const role = (await ctx.db.query("operatorRoles").first())!; await ctx.db.patch(role._id, { active: false }); await ctx.db.patch(f.communityId, { builderAccessMode: "subscription_required" }); }
    if (kind === "duplicate-pair") { const row = (await ctx.db.get(f.membershipId))!; const { _id, _creationTime, ...rest } = row; await ctx.db.insert("communityMemberships", rest); }
  });
  const before = await f.snapshot(); await expect(f.direct()).rejects.toThrow(kind === "archived" ? "community_archived" : kind === "funding" ? "community_temporarily_unavailable" : kind === "duplicate-pair" ? "community_membership_pair_not_unique" : kind === "blocked" ? "community_user_blocked" : "workflow_approval_unavailable");
  expect(await f.snapshot()).toEqual(before);
});

test("manager loss denies a completed receipt; prior manager privilege cannot be replayed", async () => {
  const f = await approvalFixture();
  const adminId = await f.t.run(async ctx => { const id=await ctx.db.insert("users", { authSubject:"approval-admin", createdAt:f.now, updatedAt:f.now });
    await ctx.db.insert("communityMemberships", { communityId:f.communityId,userId:id,role:"admin",active:true,activationSequence:1,createdAt:f.now,updatedAt:f.now,accessSource:"manual_grant" });return id; });
  const admin=f.t.withIdentity({subject:"approval-admin"});
  const overrides={ctx:f.identityContext(admin),authSubject:"approval-admin",userId:adminId};
  expect(await f.call(f.input,overrides)).toMatchObject({ok:true});
  await f.t.run(async ctx=>{const row=(await ctx.db.query("communityMemberships").withIndex("by_community_user",q=>q.eq("communityId",f.communityId).eq("userId",adminId)).unique())!;await ctx.db.patch(row._id,{role:"member"});});
  const before=await f.snapshot();expect(await f.call(f.input,overrides)).toMatchObject({ok:false,code:"operation_not_found"});expect(await f.snapshot()).toEqual(before);
});

test("member, moderator, mounted community agent and funnel controls deny approval discovery/execution", async () => {
  const f=await approvalFixture();
  const controls=[{ctx:f.identityContext(f.member),authSubject:"join-member",userId:f.memberId},
    {principalKind:"community_agent",mountedCommunityId:f.communityId}, {evidenceSurface:"community_funnel_builder"}];
  for(const overrides of controls){
    const inventory = await f.execute("polynet_list", { path: "/communities/join-workflow/capabilities/" }, overrides);
    expect(inventory).toMatchObject({ ok: true }); expect(JSON.stringify(inventory)).not.toContain(operation);
    expect(await f.execute("polynet_read",{path:f.input.target},overrides)).toMatchObject({ok:false});
    expect(await f.call(f.input,overrides)).toMatchObject({ok:false,code:"operation_not_found"});
  }
  const funnelDossier=await f.execute("polynet_read",{path:`/communities/join-workflow/builder/workflow-members/${f.membershipId}.md`},{evidenceSurface:"community_funnel_builder"});
  expect(funnelDossier).toMatchObject({ok:true});expect(JSON.stringify(funnelDossier)).not.toContain(f.observation!.review_ref);
  await f.t.run(ctx=>ctx.db.patch(f.membershipId,{role:"moderator"}));
  expect(await f.call(f.input,controls[0])).toMatchObject({ok:false,code:"operation_not_found"});
});

test("receipt completion failure rolls transition, pending-form cancellation and timer enrollment back", async () => {
  const f=await approvalFixture(true,false);
  await f.t.run(async ctx=>{const w=(await ctx.db.get(f.workflowId))!;await ctx.db.patch(w._id,{milestones:[w.milestones[0],{...w.milestones[1],automations:[{key:"later",trigger:{type:"milestone_elapsed",delayMinutes:5},timerGeneration:"timer-proof",action:{key:"form-later",type:"request_form",formKey:"intake"}}]}]});});
  const observation=(await f.dossier()).workflow!.approval!;const input={...f.input,input:{...f.input.input,review_ref:observation.review_ref}};
  await f.t.run(async ctx => { const { _id, _creationTime, ...row } = f.request; await ctx.db.insert("communityFormRequests", { ...row, automationKey: "pending-cleanup-proof" }); });
  const before=await f.snapshot();vi.spyOn(completeCanonicalOperationReceiptInternal as any,"_handler").mockImplementationOnce(async()=>{throw new Error("completion_fault");});
  expect(await f.call(input)).toMatchObject({ok:false,code:"workflow_approval_unavailable"});expect(await f.snapshot()).toEqual(before);
  expect(await f.call(input)).toMatchObject({ok:true});expect((await f.snapshot()).timers).toHaveLength(1);
  expect((await f.snapshot()).requests.find(r => r.automationKey === "pending-cleanup-proof")?.status).toBe("cancelled");
});

test.each(["same-key","different-key","first-party"])("concurrent %s approval cannot duplicate transitions",async mode=>{
  const f=await approvalFixture();const competitor=mode==="first-party"?()=>f.owner.mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone,{communityId:f.communityId,membershipId:f.membershipId,expectedWorkflowId:f.workflowId,expectedWorkflowRevision:1,expectedMilestoneKey:"new",expectedMilestoneEnteredAt:f.now,expectedActivationSequence:1,expectedTransitionSeq:0}):()=>f.call(mode==="same-key"?f.input:{...f.input,idempotency_key:"competitor"});
  const results=await Promise.allSettled([f.call(),competitor()]);const state=await f.snapshot();expect(state.transitions).toHaveLength(1);expect(state.receipts.length).toBeLessThanOrEqual(1);
  expect(results.some(r=>r.status==="fulfilled")).toBe(true);
  if(mode==="same-key") { expect(results.every(r=>r.status==="fulfilled" && (r.value as any).ok===true)).toBe(true); expect(state.receipts).toHaveLength(1); }
});

test("exact capability/input validation rejects unknown flags; changed review identity conflicts",async()=>{
  const f=await approvalFixture();
  for(const input of [{...f.input.input,force:true},{...f.input.input,expected_activation_sequence:-1},{...f.input.input,review_ref:null},{...f.input.input,membership_ref:`user:${f.memberId}`}])
    expect(await f.call({...f.input,input})).toMatchObject({ok:false,code:"invalid_tool_args"});
  expect(await f.call({...f.input,target:"/communities/join-workflow/"})).toMatchObject({ok:false,code:"invalid_tool_args"});
  expect(await f.call()).toMatchObject({ok:true});const before=await f.snapshot();
  expect(await f.call({...f.input,input:{...f.input.input,review_ref:`workflow-approval:v1:${"0".repeat(64)}`}})).toMatchObject({ok:false,code:"idempotency_key_conflict"});expect(await f.snapshot()).toEqual(before);
});


test("foreign-community and changed-member references cannot move or disclose another subject", async () => {
  const f = await approvalFixture();
  const other = await f.t.run(async ctx => {
    const communityId = await ctx.db.insert("communities", { ownerId: f.ownerId, slug: "other-community", name: "Other", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", visibility: "unlisted", lifecycleStatus: "active", createdAt: f.now, updatedAt: f.now });
    const userId = await ctx.db.insert("users", { authSubject: "second-member", createdAt: f.now, updatedAt: f.now });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", accessSource: "manual_grant", activationSequence: 1, active: true, createdAt: f.now, updatedAt: f.now });
    return { communityId, membershipId };
  });
  expect(await f.call({ ...f.input, target: `/communities/other-community/capabilities/${operation}.json` })).toMatchObject({ ok: false, code: "workflow_approval_unavailable" });
  expect(await f.call()).toMatchObject({ ok: true }); const before = await f.snapshot();
  expect(await f.call({ ...f.input, input: { ...f.input.input, membership_ref: `membership:${other.membershipId}` } })).toMatchObject({ ok: false, code: "idempotency_key_conflict" });
  expect(await f.snapshot()).toEqual(before);
});

test("native personal agent cannot discover or execute owner milestone approval", async () => {
  const f = await approvalFixture(); const before = await f.snapshot();
  const inventory = await f.execute("polynet_list", { path: "/communities/join-workflow/capabilities/" }, { principalKind: "community_agent_for_member" });
  expect(inventory).toMatchObject({ ok: true }); expect(JSON.stringify(inventory)).not.toContain(operation);
  expect(await f.call(f.input, { principalKind: "community_agent_for_member" })).toMatchObject({ ok: false, code: "operation_not_found" });
  expect(await f.snapshot()).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("communityAgentServeRequests").collect())).toHaveLength(0);
});
