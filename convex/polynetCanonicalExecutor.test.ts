/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import * as verificationPilot from "./integrationVerificationPilot";
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});

import { api, internal } from "./_generated/api";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import schema from "./schema";
import { connectWithAdapter, verifyWithAdapter, revokeWithAdapter, integrationAttemptAlias } from "./communityIntegrationActions";
import { formatCommunityEventZonedDateTime } from "../shared/communityEventTime";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { buildCommunityFunnelContentTestFixture } from "../scripts/community_funnel_test_fixture";
import { renderCommunityMemberSelfContext } from "../shared/communityMemberSelfContext";

const selfContextPath = "/communities/canonical-community/members/me/context.md";
test.each(["deployment", "member", "community", "config", "expired", "disabled"])("pilot %s denial precedes remote initiation", async mode => {
  const t = convexTest(schema, modules); const f = await createFixture(t);
  await t.run(c => c.db.patch(f.communityId, {integrationReadPilotEnabled: true}));
  const policy = verificationPilot.integrationVerificationPilot()!;
  if (mode === "deployment") vi.stubEnv("CONVEX_CLOUD_URL", "https://wry-hawk-715.convex.cloud");
  else vi.mocked(verificationPilot.integrationVerificationPilot).mockReturnValue(mode === "disabled" ? null : {
    ...policy, ...(mode === "member" ? {actorUserId: "other"} : mode === "community" ? {communityId: "other"} :
      mode === "config" ? {authConfigId: "other"} : {expiresAt: Date.now() - 1}),
  });
  const adapter = {authConfigId: "config", initiate: vi.fn(), verify: vi.fn(), revoke: vi.fn()};
  const ctx = executionContext(t.withIdentity({subject: f.memberSubject}));
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow("integration_pilot_unavailable");
  expect(await verifyWithAdapter(ctx, f.communityId, "session", adapter)).toBe(false);
  expect(adapter.initiate).not.toHaveBeenCalled(); expect(adapter.verify).not.toHaveBeenCalled();
  expect(await t.run(c => c.db.query("communityIntegrationConnections").collect())).toEqual([]);
});

test.each(["expired", "disabled"])("pilot %s and community disablement do not prevent cleanup", async mode => {
  const t = convexTest(schema, modules); const f = await createFixture(t);
  await t.run(c => c.db.patch(f.communityId, {integrationReadPilotEnabled: true}));
  const policy = verificationPilot.integrationVerificationPilot()!;
  vi.mocked(verificationPilot.integrationVerificationPilot).mockReturnValue({...policy, expiresAt: Date.now() + 30_000});
  const ctx = executionContext(t.withIdentity({subject: f.memberSubject}));
  const adapter = {authConfigId: "config", initiate: vi.fn(async () => ({connectedAccountId: "account", authorizationUrl: "https://connect.composio.dev/link"})), verify: vi.fn(), revoke: vi.fn(async () => {})};
  const attempt = await connectWithAdapter(ctx, f.communityId, adapter);
  if (!attempt.available) throw new Error("expected available integration connection");
  expect(attempt.expiresAt).toBeLessThanOrEqual(Date.now() + 30_000);
  vi.mocked(verificationPilot.integrationVerificationPilot).mockReturnValue(mode === "disabled" ? null : {...policy, expiresAt: 1});
  await t.run(c => c.db.patch(f.communityId, {integrationReadPilotEnabled: false}));
  expect(await verifyWithAdapter(ctx, f.communityId, "late", adapter)).toBe(false);
  expect(await revokeWithAdapter(ctx, f.communityId, {...adapter, authConfigId: "wrong"})).toEqual({cleanupPending: true});
  expect(adapter.revoke).not.toHaveBeenCalled();
  adapter.revoke.mockRejectedValueOnce(new Error("uncertain"));
  expect(await revokeWithAdapter(ctx, f.communityId, adapter)).toEqual({cleanupPending: true});
  expect(await revokeWithAdapter(ctx, f.communityId, adapter)).toEqual({cleanupPending: false});
  expect(adapter.revoke).toHaveBeenLastCalledWith("account");
});

test("attempt correlation is stable, opaque and isolated by binding and generation",async()=>{
  const alias=await integrationAttemptAlias("binding-one",1);
  expect(alias).toMatch(/^pn_[a-f0-9]{64}$/);
  expect(alias).toBe(await integrationAttemptAlias("binding-one",1));
  expect(alias).not.toBe(await integrationAttemptAlias("binding-two",1));
  expect(alias).not.toBe(await integrationAttemptAlias("binding-one",2));
  for(const generation of [0,-1,NaN,Infinity,1.5])
    await expect(integrationAttemptAlias("binding-one",generation)).rejects.toThrow("integration_invalid_attempt");
});

test.each(["before", "after", "persistent"])("initiation attachment failure %s never repeats remote work", async (failure) => {
  const t=convexTest(schema,modules); const f=await createFixture(t);
  const member=t.withIdentity({subject:f.memberSubject}); const ctx=executionContext(member);
  const refs=(internal as any).communityIntegrationConnections;
  const who={authSubject:f.memberSubject,userId:f.memberId,communityId:f.communityId};
  await t.run(c=>c.db.patch(f.communityId,{integrationReadPilotEnabled:true}));
  const adapter={authConfigId:"config",initiate:vi.fn(async()=>({connectedAccountId:"account",authorizationUrl:"https://connect.composio.dev/link"})),verify:vi.fn(),revoke:vi.fn(async()=>{})};
  let attachments=0;
  const broken={...ctx,runMutation:async(ref:any,args:any)=>{
    if (args.connectedAccountId === "account" && args.authorizationUrl) {
      attachments++;
      if(failure === "persistent") throw new Error("database down");
      if(attachments === 1) {
        if(failure === "after") await ctx.runMutation(ref,args);
        throw new Error("lost response");
      }
    }
    return ctx.runMutation(ref,args);
  }};
  if(failure === "persistent") {
    await expect(connectWithAdapter(broken,f.communityId,adapter)).rejects.toThrow("integration_reconciliation_required");
    const row=await member.query(refs.ownBindingInternal,who);
    expect(row.initiationState).toBe("awaiting");
    await connectWithAdapter(ctx,f.communityId,adapter);
  } else {
    expect(await connectWithAdapter(broken,f.communityId,adapter)).toMatchObject({available:true});
    expect(await member.query(refs.ownBindingInternal,who)).toMatchObject({connectedAccountId:"account",initiationState:"ready"});
  }
  expect(attachments).toBe(2);expect(adapter.initiate).toHaveBeenCalledTimes(1);expect(adapter.revoke).not.toHaveBeenCalled();
});

test("callback admission rejects invalid expiry and revocation reports failed finalization",async()=>{
  const t=convexTest(schema,modules); const f=await createFixture(t);
  const member=t.withIdentity({subject:f.memberSubject}); const ctx=executionContext(member);
  const refs=(internal as any).communityIntegrationConnections;
  const who={authSubject:f.memberSubject,userId:f.memberId,communityId:f.communityId};
  await t.run(c=>c.db.patch(f.communityId,{integrationReadPilotEnabled:true}));
  const adapter={authConfigId:"config",initiate:vi.fn(async()=>({connectedAccountId:"account",authorizationUrl:"https://connect.composio.dev/link"})),verify:vi.fn(),revoke:vi.fn(async()=>{})};
  await connectWithAdapter(ctx,f.communityId,adapter);
  const row=await member.query(refs.ownBindingInternal,who);
  for(const expiresAt of [undefined,NaN,Infinity,0]) {
    await t.run(c=>c.db.patch(row._id,{expiresAt}));
    expect(await verifyWithAdapter(ctx,f.communityId,"session",adapter,row.generation)).toBe(false);
    expect(await member.mutation(refs.claimCallbackInternal,{...who,generation:row.generation})).toBe(false);
  }
  expect(adapter.verify).not.toHaveBeenCalled();
  for(const throws of [false,true]) {
    const broken={...ctx,runMutation:async(ref:any,args:any)=>{
      if(args.connectedAccountId === "account") {if(throws) throw new Error("database down");return false;}
      return ctx.runMutation(ref,args);
    }};
    expect(await revokeWithAdapter(broken,f.communityId,adapter)).toEqual({cleanupPending:true});
    expect((await member.query(refs.ownBindingInternal,who)).revokePending).toBe(true);
  }
  expect(await revokeWithAdapter(ctx,f.communityId,adapter)).toEqual({cleanupPending:false});
});

test("connection lifecycle orders remote work after one durable attempt", async () => {
  const t = convexTest(schema, modules); const f = await createFixture(t);
  const member = t.withIdentity({ subject: f.memberSubject });
  const owner = t.withIdentity({ subject: "canonical-owner-subject" });
  const ctx = executionContext(member);
  const pub = (api as any).communityIntegrationConnections;
  const refs = (internal as any).communityIntegrationConnections;
  const who = { authSubject: f.memberSubject, userId: f.memberId, communityId: f.communityId };
  const adapter = { authConfigId: "config",
    initiate: vi.fn(async () => ({ connectedAccountId: "account", authorizationUrl: "https://connect.composio.dev/link" })),
    verify: vi.fn(async (_id: string, userId: string) => ({ connectedAccountId: "account", providerUserId: userId, authConfigId: "config", toolkit: "hubspot", active: true, scopes: ["crm.objects.contacts.read"] })),
    revoke: vi.fn(async () => {}) };
  await expect(member.mutation(pub.setPilotEnabled, { communityId: f.communityId, enabled: true })).rejects.toThrow();
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow();
  await owner.mutation(pub.setPilotEnabled, { communityId: f.communityId, enabled: true });
  expect(await connectWithAdapter(ctx, f.communityId, null)).toEqual({ available: false });
  await Promise.all([connectWithAdapter(ctx, f.communityId, adapter), connectWithAdapter(ctx, f.communityId, adapter)]);
  expect(adapter.initiate).toHaveBeenCalledTimes(1);
  const firstBinding=await member.query(refs.ownBindingInternal,who);
  expect(adapter.initiate).toHaveBeenLastCalledWith(firstBinding.providerUserId,
    await integrationAttemptAlias(firstBinding._id,firstBinding.generation));
  expect(await verifyWithAdapter(ctx, f.communityId, "session", adapter, -1)).toBe(false);
  expect(adapter.verify).not.toHaveBeenCalled();
  const results = await Promise.all([verifyWithAdapter(ctx, f.communityId, "session", adapter), verifyWithAdapter(ctx, f.communityId, "session", adapter)]);
  expect(results.sort()).toEqual([false, true]);
  expect(adapter.verify).toHaveBeenCalledTimes(1);
  expect(await member.query(pub.connectionStatus, { communityId: f.communityId })).toMatchObject({ status: "active" });
  adapter.revoke.mockRejectedValueOnce(new Error("provider down"));
  expect(await revokeWithAdapter(ctx, f.communityId, adapter)).toEqual({ cleanupPending: true });
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow();
  expect(await verifyWithAdapter(ctx, f.communityId, "late", adapter)).toBe(false);
  expect(await revokeWithAdapter(ctx, f.communityId, adapter)).toEqual({ cleanupPending: false });
  await connectWithAdapter(ctx, f.communityId, adapter);
  const b = await member.query(refs.ownBindingInternal, who);
  expect(adapter.initiate).toHaveBeenLastCalledWith(b.providerUserId,await integrationAttemptAlias(b._id,b.generation));
  expect(await integrationAttemptAlias(b._id,b.generation)).not.toBe(await integrationAttemptAlias(firstBinding._id,firstBinding.generation));
  await t.run(ctx => ctx.db.patch(b._id, { expiresAt: 1 }));
  expect(await verifyWithAdapter(ctx, f.communityId, "expired", adapter)).toBe(false);
  expect(await member.query(pub.connectionStatus, {communityId:f.communityId})).toMatchObject({status:"error",actions:["disconnect"]});
  await revokeWithAdapter(ctx, f.communityId, adapter);
  adapter.initiate.mockImplementationOnce(async () => {
    await member.mutation(refs.disconnectInternal, who);
    return { connectedAccountId: "late-account", authorizationUrl: "https://connect.composio.dev/link" };
  });
  expect(await connectWithAdapter(ctx, f.communityId, adapter)).toEqual({ available: false });
  expect(adapter.revoke).toHaveBeenLastCalledWith("late-account");
  expect(await member.query(pub.connectionStatus, { communityId: f.communityId })).toMatchObject({ status: "disconnected" });
  adapter.initiate.mockRejectedValueOnce(new Error("ambiguous timeout"));
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow("integration_reconciliation_required");
  const calls = adapter.initiate.mock.calls.length;
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow();
  expect(adapter.initiate).toHaveBeenCalledTimes(calls);
  expect(await t.run(ctx => ctx.db.query("communityIntegrationConnections").collect())).toHaveLength(1);
  await t.run(async ctx => {
    const row = await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).first();
    await ctx.db.patch(row!._id, { active: false });
  });
  expect(await revokeWithAdapter(ctx, f.communityId, adapter)).toEqual({ cleanupPending: true });
  expect(await member.query(pub.connectionStatus, { communityId: f.communityId })).toMatchObject({ status: "disconnected", cleanupPending: true });
  await expect(connectWithAdapter(ctx, f.communityId, adapter)).rejects.toThrow();
});
test("connection descriptors are atomic and failed callbacks cannot replay", async () => {
  const t = convexTest(schema, modules); const f = await createFixture(t);
  const member = t.withIdentity({subject:f.memberSubject});
  const ctx = executionContext(member);
  const pub = (api as any).communityIntegrationConnections;
  const refs = (internal as any).communityIntegrationConnections;
  const who = {authSubject:f.memberSubject,userId:f.memberId,communityId:f.communityId};
  await t.withIdentity({subject:f.ownerSubject}).mutation(pub.setPilotEnabled,{communityId:f.communityId,enabled:true});
  const adapter = {authConfigId:"config",initiate:vi.fn(async()=>({connectedAccountId:"account",authorizationUrl:"https://connect.composio.dev/link"})),
    verify:vi.fn(async()=>{throw new Error("provider failure");}),revoke:vi.fn(async()=>{})};
  const first=await connectWithAdapter(ctx,f.communityId,adapter);
  if (!first.available) throw new Error("expected available integration connection");
  const [a,b]=await Promise.all([connectWithAdapter(ctx,f.communityId,adapter),connectWithAdapter(ctx,f.communityId,adapter)]);
  expect(a).toEqual(first);expect(b).toEqual(first);
  const row=await member.query(refs.ownBindingInternal,who);
  expect(first).toMatchObject({generation:row.generation,expiresAt:row.expiresAt,authorizationUrl:row.authorizationUrl});
  expect(await verifyWithAdapter(ctx,f.communityId,"callback",adapter,first.generation)).toBe(false);
  expect(await member.query(pub.connectionStatus,{communityId:f.communityId})).toMatchObject({status:"error",actions:["disconnect"]});
  expect(await verifyWithAdapter(ctx,f.communityId,"callback",adapter,first.generation)).toBe(false);
  expect(adapter.verify).toHaveBeenCalledTimes(1);
  await revokeWithAdapter(ctx,f.communityId,adapter);
  expect(await member.query(pub.connectionStatus,{communityId:f.communityId})).toMatchObject({actions:["connect"]});
});

test("mocked integration read traverses the scoped harness and real binding query", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await t.run(async ctx => {
    await ctx.db.patch(f.communityId, { integrationReadPilotEnabled: true });
    await ctx.db.insert("communityIntegrationConnections", { communityId: f.communityId, ownerUserId: f.memberId,
      provider: "composio", toolkit: "hubspot", providerUserId: "opaque", authConfigId: "config", connectedAccountId: "account",
      generation: 1, status: "active", scopes: ["crm.objects.contacts.read"], createdAt: 1, updatedAt: 1 });
  });
  const ctx = executionContext(t.withIdentity({ subject: f.memberSubject }));
  const deps = {
    load: async () => ({ ...await ctx.runQuery((internal as any).communityIntegrationConnections.readPilotBindingInternal,
      { authSubject: f.memberSubject, userId: f.memberId, communityId: f.communityId }), approvedContactId: "123" }),
    claim: vi.fn(async () => ({receiptKey:"receipt",claimToken:"claim"})), start:vi.fn(async()=>true),
    execute: vi.fn(async () => ({ successful: true, data: { id: "123", archived: false,
      createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", properties: { firstname: "Fixture" } } })),
    finalize: vi.fn(async () => {}),
  };
  const base = { ctx, userId: f.memberId, authSubject: f.memberSubject, runId: "integration-test", toolCallId:"integration-call", communityId: f.communityId,
    communityBoundConversation: true, toolName: "polynet_read" as const,
    args: { path: "/communities/canonical-community/integrations/hubspot/contacts/123" },
    evidenceSurface: "member_agent_dock" as const, integrationRead: deps };
  const read = await executeRetrievalHarnessTool(base);
  expect(read.status, JSON.stringify(read)).toBe("ok");
  expect(deps.execute).toHaveBeenCalledTimes(1);
  expect((await executeRetrievalHarnessTool({ ...base, args: { ...base.args, connectedAccountId: "forged" } })).status).toBe("ok");
  expect(deps.execute).toHaveBeenLastCalledWith(expect.objectContaining({ connectedAccountId: "account" }));
  deps.execute.mockClear();
  for (const override of [{ communityBoundConversation: false }, { communityId: "other-community" },
    { evidenceSurface: "external_mcp" as const },
    { evidenceSurface: "community_concierge" as const }, { integrationRead: undefined },
    { toolName: "polynet_list" as const },
    { args: { path: "/communities/canonical-community/integrations/hubspot/contacts/not-an-id" } }]) {
    expect((await executeRetrievalHarnessTool({ ...base, ...override })).status, JSON.stringify(override)).toBe("error");
  }
  await t.run(async dbctx => { await dbctx.db.patch(f.communityId, { integrationReadPilotEnabled: false }); });
  expect((await executeRetrievalHarnessTool(base)).status).toBe("error");
  expect(deps.execute).not.toHaveBeenCalled();
  await expect(ctx.runQuery((internal as any).communityIntegrationConnections.readPilotBindingInternal,
    { authSubject: f.memberSubject, userId: f.ownerId, communityId: f.communityId })).rejects.toThrow();
});

test("scoped interactive harness reads member context without gaining builder or platform access", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const execute = (path: string) => executeRetrievalHarnessTool({ ctx: executionContext(t.withIdentity({ subject: f.memberSubject })), userId: f.memberId, authSubject: f.memberSubject, runId: "scoped-tools", communityId: f.communityId, communityBoundConversation: true, toolName: "polynet_read", args: { path }, evidenceSurface: "member_agent_dock" });
  expect((await execute(selfContextPath)).status).toBe("ok");
  const root = await executeRetrievalHarnessTool({ ctx: executionContext(t.withIdentity({ subject: f.memberSubject })), userId: f.memberId, authSubject: f.memberSubject, runId: "scoped-root", communityId: f.communityId, communityBoundConversation: true, toolName: "polynet_list", args: { path: "/" }, evidenceSurface: "member_agent_dock" });
  expect(root.status, root.outputText || root.errorMessage || undefined).toBe("ok");
  expect((await execute("/communities/canonical-community/builder/workflow-members/")).status).toBe("error");
  expect((await execute("/members/me/context.md")).status).toBe("error");
  expect((await executeRetrievalHarnessTool({ ctx: executionContext(t.withIdentity({ subject: f.memberSubject })), userId: f.memberId, authSubject: f.memberSubject, runId: "wrong-mount", communityId: "other-community", communityBoundConversation: true, toolName: "polynet_read", args: { path: selfContextPath }, evidenceSurface: "member_agent_dock" })).errorCode).toBe("community_context_mismatch");
});

test("builder context discovery paginates and rechecks administrator authority", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const memberId = await t.run(async ctx => {
    const membership = (await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).first())!;
    await ctx.db.patch(membership._id, { role: "admin" });
    for (let i = 0; i < 51; i++) {
      const userId = await ctx.db.insert("users", { authSubject: `page-${i}`, displayName: "Same name", createdAt: i, updatedAt: i });
      await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", active: true, createdAt: i, updatedAt: i });
    }
    return membership._id;
  });
  const client = t.withIdentity({ subject: f.memberSubject });
  const first = await client.query(api.communityMemberWorkflows.listBuilderWorkflowContextMembers, { communityId: f.communityId });
  expect(first.members).toHaveLength(50);
  expect(first.next_cursor).toBeTruthy();
  const second = await client.query(api.communityMemberWorkflows.listBuilderWorkflowContextMembers, { communityId: f.communityId, cursor: first.next_cursor! });
  expect(second.next_cursor).toBeNull();
  const all = [...first.members, ...second.members];
  expect(new Set(all.map(m => m.membership_id)).size).toBe(all.length);
  await t.run(ctx => ctx.db.patch(memberId, { role: "member" }));
  await expect(client.query(api.communityMemberWorkflows.listBuilderWorkflowContextMembers, { communityId: f.communityId })).rejects.toThrow();
  await expect(client.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, { communityId: f.communityId, membershipId: memberId })).rejects.toThrow();
});

test.each(["personal_agent", "external_mcp"] as const)("%s reads builder workflow dossiers with current authority", async principalKind => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const directory = "/communities/canonical-community/builder/workflow-members/";
  const execute = (subject: string, userId: any, toolName: "polynet_list" | "polynet_read", path: string, kind = principalKind as "personal_agent" | "external_mcp" | "community_agent") => executePolynetCanonicalTool({
    ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId, principalKind: kind,
    evidenceSurface: "member_agent_dock", toolName, input: { path },
  });
  const listed = await execute(f.ownerSubject, f.ownerId, "polynet_list", directory);
  expect(listed, JSON.stringify(listed)).toMatchObject({ ok: true, value: { writable: false, next_cursor: null } });
  if (!listed.ok) throw new Error(listed.code);
  const entry = (listed.value.entries as any[]).find(e => e.user_id === f.memberId);
  expect(entry.name).toBe("canonical-member");
  const versionId = await t.run(async ctx => {
    const now = Date.now();
    const workflowId = await ctx.db.insert("communityMemberWorkflows", { communityId: f.communityId,
      milestones: [{ key: "new", name: "New", automations: [] }], revision: 1, createdByUserId: f.ownerId, updatedByUserId: f.ownerId, createdAt: now, updatedAt: now });
    const runId = await ctx.db.insert("communityMemberWorkflowRuns", { communityId: f.communityId, workflowId,
      membershipId: entry.membership_id, milestoneKey: "new", milestoneName: "New", milestoneEnteredAt: now,
      workflowRevision: 1, automationKey: "intake", triggerType: "member_contributed", triggerReceiptRef: "fixture",
      actionSnapshot: { key: "request", type: "request_form", formKey: "intake" }, status: "finished", createdAt: now, updatedAt: now });
    const questions = [{ key: "q", title: "What help?", description: "", type: "short_text" as const, required: true, options: [] }];
    const formId = await ctx.db.insert("communityForms", { communityId: f.communityId, key: "intake", name: "Changed draft", questions: [], revision: 2, createdAt: now, updatedAt: now });
    const versionId = await ctx.db.insert("communityFormVersions", { communityId: f.communityId, formId, revision: 1,
      name: "Original intake", questions, publishedBy: f.ownerId, publishedAt: now });
    await ctx.db.insert("communityFormRequests", { communityId: f.communityId, membershipId: entry.membership_id,
      workflowId, workflowRunId: runId, automationKey: "intake", milestoneKey: "new", milestoneEnteredAt: now,
      activationSequence: (await ctx.db.get(entry.membership_id) as any).activationSequence ?? 0, formKey: "intake", versionId, status: "submitted", answers: { q: "PRIVATE_PRICING_HELP" },
      revision: 1, createdAt: now, updatedAt: now, submittedAt: now });
    return versionId;
  });
  const read = await execute(f.ownerSubject, f.ownerId, "polynet_read", entry.path);
  expect(read, JSON.stringify(read)).toMatchObject({ ok: true, value: { writable: false, context: {
    user_id: f.memberId, community_id: f.communityId, submitted_form_evidence: { submissions: [expect.objectContaining({ form_name: "Original intake", form_revision: 1 })] },
  } } });
  expect(JSON.stringify(read)).toContain("PRIVATE_PRICING_HELP");
  expect(JSON.stringify(read)).toContain(versionId);
  expect(JSON.stringify(read)).not.toContain("Changed draft");
  const selfRead = await execute(f.memberSubject, f.memberId, "polynet_read", selfContextPath);
  expect(selfRead).toMatchObject({ ok: true, value: { writable: false } });
  expect(JSON.stringify(selfRead)).toContain("PRIVATE_PRICING_HELP");
  expect(JSON.stringify(selfRead)).toContain(versionId);
  expect(JSON.stringify(selfRead)).not.toContain("Changed draft");
  const ownerSelf = await execute(f.ownerSubject, f.ownerId, "polynet_read", selfContextPath);
  expect(JSON.stringify(ownerSelf)).not.toContain("PRIVATE_PRICING_HELP");
  expect(await execute(f.memberSubject, f.memberId, "polynet_read", selfContextPath, "community_agent")).toMatchObject({ ok: false });
  expect(entry.forms_path).toBe(`${directory}${entry.membership_id}/forms.md`);
  expect(JSON.stringify(read)).toContain(entry.forms_path);
  const forms = await execute(f.ownerSubject, f.ownerId, "polynet_read", entry.forms_path);
  expect(forms).toMatchObject({ ok: true, value: { writable: false, context: {
    membership_id: entry.membership_id, user_id: f.memberId,
    submitted_form_evidence: { submissions: [expect.objectContaining({ version_id: versionId, form_name: "Original intake" })] },
  } } });
  expect(JSON.stringify(forms)).toContain("PRIVATE_PRICING_HELP");
  expect(JSON.stringify(forms)).not.toContain("Changed draft");
  expect(JSON.stringify(forms)).not.toContain("recent_workflow_activity");
  expect(JSON.stringify(forms)).not.toContain("approved_community_context");
  expect((await execute(f.ownerSubject, f.ownerId, "polynet_list", entry.forms_path)).ok).toBe(false);
  expect((await execute(f.ownerSubject, f.ownerId, "polynet_read", `${directory}${entry.membership_id}/../forms.md`)).ok).toBe(false);
  expect((await execute(f.memberSubject, f.ownerId, "polynet_read", entry.forms_path)).ok).toBe(false);
  expect((await execute(f.memberSubject, f.ownerId, "polynet_read", entry.path)).ok).toBe(false);
  for (const [tool, path] of [["polynet_list", directory], ["polynet_read", entry.path], ["polynet_read", entry.forms_path]] as const) {
    expect((await execute(f.memberSubject, f.memberId, tool, path)).ok).toBe(false);
    expect((await execute(f.ownerSubject, f.ownerId, tool, path, "community_agent")).ok).toBe(false);
  }
  await t.run(async ctx => { await ctx.db.patch(entry.membership_id, { active: false }); });
  expect((await execute(f.ownerSubject, f.ownerId, "polynet_read", entry.path)).ok).toBe(false);
  expect((await execute(f.ownerSubject, f.ownerId, "polynet_read", entry.forms_path)).ok).toBe(false);
});

test.each(["personal_agent", "external_mcp"] as const)("%s discovers and reads its own community context without writing state", async (principalKind) => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const ctx = executionContext(t.withIdentity({ subject: f.memberSubject }));
  const execute = (toolName: "polynet_list" | "polynet_read", path: string) => executePolynetCanonicalTool({
    ctx, authSubject: f.memberSubject, userId: f.memberId, principalKind,
    evidenceSurface: principalKind === "personal_agent" ? "member_agent_dock" : "external_mcp", toolName, input: { path },
  });
  const snapshot = () => t.run(async (ctx) => ({
    memberships: await ctx.db.query("communityMemberships").collect(),
    workflows: await ctx.db.query("communityMemberWorkflows").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    facts: await ctx.db.query("memberFacts").collect(),
  }));
  const before = await snapshot();
  const directory = await execute("polynet_list", "/communities/canonical-community/members/");
  expect(directory, JSON.stringify(directory)).toMatchObject({ ok: true, value: { entries: expect.arrayContaining([
    expect.objectContaining({ path: "/communities/canonical-community/members/me/", kind: "directory" }),
  ]) } });
  expect(await execute("polynet_list", "/communities/canonical-community/members/me/")).toMatchObject({
    ok: true, value: { writable: false, entries: [expect.objectContaining({ path: selfContextPath })] },
  });
  const read = await execute("polynet_read", selfContextPath);
  expect(read.ok).toBe(true);
  if (!read.ok) throw new Error(read.code);
  const context = JSON.parse(String(read.value.body).split("\n").slice(-1)[0]);
  expect(context).toMatchObject({ user_id: f.memberId, community_id: f.communityId,
    role: "member", display_name: "canonical-member", workflow: null,
    approved_community_context: [], recent_workflow_activity: [], milestone_history: [],
  });
  expect(context.membership_id).toBeTruthy();
  expect(Number.isFinite(Date.parse(context.read_at))).toBe(true);
  expect(read.value.body).not.toContain("other-community");
  expect(await snapshot()).toEqual(before);
});

test("self context excludes private, other-member, other-community, and unapproved facts", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await t.run(async (ctx) => {
    const base = { userId: f.memberId, communityId: f.communityId, kind: "goal" as const,
      body: "Shared goal A", provenance: "form_answer" as const, consentState: "approved" as const,
      confidence: 1, evidenceRefs: [], stalenessScore: 0, createdByActorType: "member" as const,
      version: 1, createdAt: 100, updatedAt: 100 };
    await ctx.db.insert("memberFacts", base);
    await ctx.db.insert("memberFacts", { ...base, communityId: f.otherCommunityId, body: "Shared goal B" });
    await ctx.db.insert("memberFacts", { ...base, communityId: undefined, body: "PRIVATE_PLATFORM" });
    await ctx.db.insert("memberFacts", { ...base, userId: f.ownerId, body: "OTHER_MEMBER" });
    await ctx.db.insert("memberFacts", { ...base, provenance: "observed_behavior", body: "INTERNAL_OBSERVATION" });
    for (const consentState of ["pending", "rejected", "retracted", "superseded", "agent_internal"] as const) {
      await ctx.db.insert("memberFacts", { ...base, consentState, body: `SECRET_${consentState}` });
    }
    await ctx.db.insert("communityMemberships", { communityId: f.otherCommunityId, userId: f.memberId,
      role: "member", active: true, accessSource: "free_grant", createdAt: 100, updatedAt: 100 });
  });
  const actor = t.withIdentity({ subject: f.memberSubject });
  for (const [communityId, body] of [[f.communityId, "Shared goal A"], [f.otherCommunityId, "Shared goal B"]] as const) {
    const result = await actor.query(internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
      { authSubject: f.memberSubject, userId: f.memberId, communityId });
    expect(result).toMatchObject({ ok: true, context: { community_id: communityId,
      approved_community_context: [expect.objectContaining({ body, provenance: "form_answer" })] } });
  }
});

test.each(["spoof_user", "spoof_subject", "revoked", "duplicate_membership", "other_community"])("self context fails closed for %s", async (failure) => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await t.run(async (ctx) => {
    const membership = (await ctx.db.query("communityMemberships").first())!;
    if (failure === "revoked") await ctx.db.patch(membership._id, { active: false });
    if (failure === "duplicate_membership") {
      const { _id, _creationTime, ...row } = membership;
      await ctx.db.insert("communityMemberships", row);
    }
  });
  const result = await t.withIdentity({ subject: f.memberSubject }).query(
    internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
    { authSubject: failure === "spoof_subject" ? f.ownerSubject : f.memberSubject,
      userId: failure === "spoof_user" ? f.ownerId : f.memberId,
      communityId: failure === "other_community" ? f.otherCommunityId : f.communityId });
  expect(result).toEqual({ ok: false, code: "semantic_not_found", message: "Semantic path not found or not accessible." });
});

test("community agent cannot discover or read sponsor self context; owner self has no synthetic membership", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const actor = t.withIdentity({ subject: f.ownerSubject });
  const owner = await actor.query(internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
    { authSubject: f.ownerSubject, userId: f.ownerId, communityId: f.communityId });
  expect(owner).toMatchObject({ ok: true, context: { role: "owner", membership_id: null, joined_at: null, workflow: null } });
  for (const [toolName, path] of [
    ["polynet_list", "/communities/canonical-community/members/"],
    ["polynet_list", "/communities/canonical-community/members/me/"],
    ["polynet_read", selfContextPath],
  ] as const) {
    const result = await executePolynetCanonicalTool({ ctx: executionContext(actor), authSubject: f.ownerSubject,
      userId: f.ownerId, principalKind: "community_agent", mountedCommunityId: f.communityId,
      evidenceSurface: "external_mcp", toolName, input: { path } });
    if (path.endsWith("/members/")) {
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(JSON.stringify(result)).not.toContain("/members/me/");
    } else expect(result).toMatchObject({ ok: false });
  }
});

test("self context bounds facts and omits builder prompt snapshots from activity", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  await t.run(async (ctx) => {
    const membership = (await ctx.db.query("communityMemberships").first())!;
    const workflowId = await ctx.db.insert("communityMemberWorkflows", { communityId: f.communityId,
      milestones: [{ key: "new", name: "New", instructions: "SECRET_STAGE_INSTRUCTION", goal: "Define an offer", requireHumanApproval: true,
        automations: [{ key: "help", trigger: { type: "member_joined" }, action: { key: "help", type: "prompt_agent", prompt: "SECRET_BUILDER_INSTRUCTION" } }] }], revision: 1,
      createdByUserId: f.ownerId, updatedByUserId: f.ownerId, createdAt: 100, updatedAt: 100 });
    for (let i = 0; i < 121; i++) await ctx.db.insert("memberFacts", { userId: f.memberId, communityId: f.communityId,
      kind: "goal", body: "X".repeat(2000), provenance: "form_answer", consentState: "approved",
      confidence: 1, evidenceRefs: [], stalenessScore: 0, createdByActorType: "member", version: 1, createdAt: i, updatedAt: i });
    for (let i = 0; i < 13; i++) await ctx.db.insert("communityMemberWorkflowRuns", {
      communityId: f.communityId, workflowId, membershipId: membership._id,
      milestoneKey: "new", milestoneName: "New", milestoneEnteredAt: 100, workflowRevision: 1,
      automationKey: `automation-${i}`, triggerType: "member_contributed", triggerReceiptRef: `receipt-${i}`,
      actionSnapshot: { key: "action", type: "prompt_agent", prompt: "SECRET_BUILDER_INSTRUCTION" },
      status: "finished", createdAt: i, updatedAt: i,
    });
  });
  const result = await t.withIdentity({ subject: f.memberSubject }).query(
    internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
    { authSubject: f.memberSubject, userId: f.memberId, communityId: f.communityId });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  expect(result.context.facts_truncated).toBe(true);
  expect(result.context.approved_community_context).toHaveLength(12);
  expect(result.context.recent_workflow_activity).toHaveLength(12);
  expect(result.context.recent_workflow_activity.every((activity) => activity.status === "unavailable")).toBe(true);
  expect(JSON.stringify(result)).not.toContain("SECRET_BUILDER_INSTRUCTION");
  expect(JSON.stringify(result)).not.toContain("SECRET_STAGE_INSTRUCTION");
  expect(result.context.workflow).toMatchObject({ goal: "Define an offer", require_human_approval: true,
    action_progress: { actions: [expect.objectContaining({ label: "Agent assistance", status: "unavailable" })] } });
  expect(result.context.workflow).not.toHaveProperty("goal_review");
  expect(result.context.workflow).not.toHaveProperty("override_state");
  expect(result.context.recent_workflow_activity.every((activity) => !("prompt" in activity))).toBe(true);
  const { body } = renderCommunityMemberSelfContext(result.context);
  expect(body.length).toBeLessThan(24_000);
  expect(body).not.toContain("X".repeat(401));
  const oversized = renderCommunityMemberSelfContext({ ...result.context,
    facts_truncated: false,
    approved_community_context: result.context.approved_community_context.map((fact) => ({ ...fact, body: "\u0001".repeat(400) })),
  });
  expect(oversized.body.length).toBeLessThanOrEqual(24_000);
  expect(oversized.truncated).toBe(true);
  expect(JSON.parse(oversized.body.split("\n").slice(-1)[0]).workflow).toEqual(result.context.workflow);
  const longGoal = renderCommunityMemberSelfContext({ ...result.context,
    workflow: { ...result.context.workflow!, goal: "X".repeat(30_000) } });
  expect(longGoal.body.length).toBeLessThanOrEqual(24_000);
  expect(longGoal.truncated).toBe(true);
});

test.each(["/self.md", "/communities/canonical-community/self.md", "/communities/canonical-community/members/canonical-owner/context.md"])("retired and other-member self-context paths are denied: %s", async (path) => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const result = await executePolynetCanonicalTool({ ctx: executionContext(t.withIdentity({ subject: f.memberSubject })),
    authSubject: f.memberSubject, userId: f.memberId, principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock", toolName: "polynet_read", input: { path } });
  expect(result.ok).toBe(false);
});

test("self-context query rechecks access after path resolution and refuses direct unauthenticated reads", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const query = internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal;
  const args = { authSubject: f.memberSubject, userId: f.memberId, communityId: f.communityId };
  expect(await t.query(query, args)).toMatchObject({ ok: false });
  const actor = t.withIdentity({ subject: f.memberSubject });
  const base = executionContext(actor);
  let queryCount = 0;
  const result = await executePolynetCanonicalTool({
    ctx: { ...base, runQuery: async (reference: any, args: any) => {
      const result = await base.runQuery(reference, args);
      if (++queryCount === 1) await t.run(async (ctx) => {
        const membership = (await ctx.db.query("communityMemberships").first())!;
        await ctx.db.patch(membership._id, { active: false });
      });
      return result;
    } },
    authSubject: f.memberSubject, userId: f.memberId, principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock", toolName: "polynet_read", input: { path: selfContextPath },
  });
  expect(result).toMatchObject({ ok: false });
  expect(queryCount).toBe(2);
});

const modules = import.meta.glob([
  "./communityIntegrationConnections.ts",
  "./communityIntegrationActions.ts",
  "./communityAgent.ts",
  "./communityMemberWorkflows.ts",
  "./authActor.ts",
  "./authIdentity.ts",
  "./communityActivity.ts",
  "./communityAiFeedEvidence.ts",
  "./communityCapabilityContext.ts",
  "./communityChannels.ts",
  "./communityEvidenceAudit.ts",
  "./communityEvents.ts",
  "./communityFunnel.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityInteractionEvidence.ts",
  "./communityInteractions.ts",
  "./communityMentionLifecycle.ts",
  "./communityOnboarding.ts",
  "./communityRecentContext.ts",
  "./communityRepositorySearch.ts",
  "./communityResourceEvidence.ts",
  "./communityResources.ts",
  "./polynetCanonicalReceipts.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_760_000_000_000;
  const fixture = await t.run(async (ctx) => {
    const createUser = async (subject: string, handle: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: subject,
        displayName: handle,
        handle,
        normalizedHandle: handle,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName: handle,
        avatarUrl: `https://example.com/${handle}.png`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: document.key,
          documentVersion: document.version,
          acceptedAt: nowMs,
          source: "test",
          createdAt: nowMs,
        });
      }
      return userId;
    };
    const ownerId = await createUser(
      "canonical-owner-subject",
      "canonical-owner",
    );
    const memberId = await createUser(
      "canonical-member-subject",
      "canonical-member",
    );
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "canonical-community",
      name: "Canonical community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "other-community",
      name: "Other community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const generalChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const winsChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "wins",
      name: "Wins",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
    });
    await ctx.db.insert("communityChannels", {
      communityId: otherCommunityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      ownerId,
      memberId,
      communityId,
      generalChannelId,
      winsChannelId,
      otherCommunityId,
      ownerSubject: "canonical-owner-subject",
      memberSubject: "canonical-member-subject",
    };
  });
  vi.stubEnv("CONVEX_CLOUD_URL", verificationPilot.INTEGRATION_PILOT_TARGET.deploymentUrl);
  vi.spyOn(verificationPilot, "integrationVerificationPilot").mockReturnValue({id: "test-pilot",
    communityId: fixture.communityId, actorUserId: fixture.memberId, authConfigId: "config", expiresAt: Date.now() + 600_000});
  return fixture;
}

async function createAdminFixture(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const nowMs = 1_760_000_000_100;
  return await t.run(async (ctx) => {
    const authSubject = "canonical-admin-subject";
    const userId = await ctx.db.insert("users", {
      authSubject,
      displayName: "canonical-admin",
      handle: "canonical-admin",
      normalizedHandle: "canonical-admin",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: fixture.communityId,
      userId,
      role: "admin",
      accessSource: "free_grant",
      active: true,
      activationSequence: 2,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { authSubject, userId };
  });
}

async function createCanonicalSearchFixture(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const nowMs = 1_760_000_000_000;
  return await t.run(async (ctx) => {
    const interactionId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: fixture.generalChannelId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Canonical repository search",
      contentSummary:
        "Canonical repository search proof from the community channel.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "canonical-root-search-interaction",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId,
      createdByUserId: fixture.ownerId,
      status: "live",
      name: "Canonical search",
      sortOrder: 0,
      createdAt: nowMs + 2,
      updatedAt: nowMs + 2,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId: fixture.communityId,
      moduleId,
      createdByUserId: fixture.ownerId,
      type: "page",
      role: "page",
      status: "published",
      title: "Canonical repository search",
      bodyMd: "Canonical repository search proof from community resources.",
      pinned: false,
      createdAt: nowMs + 3,
      updatedAt: nowMs + 3,
    });
    const memoryNodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId: fixture.communityId,
      type: "insight",
      title: "Canonical repository search",
      bodyMd: "Canonical repository search proof from accepted memory.",
      status: "promising",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.7,
      evidenceStrength: "observed",
      workflowIds: [],
      tags: ["canonical-search"],
      sourceTraceIds: [],
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: "admin",
      createdByUserId: fixture.ownerId,
      lastUpdatedByActorType: "admin",
      lastUpdatedByUserId: fixture.ownerId,
      version: 1,
      createdAt: nowMs + 4,
      updatedAt: nowMs + 4,
    });
    const adminMemoryNodeId = await ctx.db.insert(
      "communityIntelligenceNodes",
      {
        communityId: fixture.communityId,
        type: "insight",
        title: "Canonical repository search admin note",
        bodyMd:
          "Canonical repository search proof that must stay outside the member projection.",
        status: "promising",
        visibilityScope: "admin",
        sourceVisibility: "admin",
        confidence: 0.7,
        evidenceStrength: "observed",
        workflowIds: [],
        tags: ["canonical-search", "admin-only"],
        sourceTraceIds: [],
        outcomeObservationIds: [],
        stalenessScore: 0,
        retrievalUsefulnessScore: 0,
        outcomeImpactScore: 0,
        createdByActorType: "admin",
        createdByUserId: fixture.ownerId,
        lastUpdatedByActorType: "admin",
        lastUpdatedByUserId: fixture.ownerId,
        version: 1,
        createdAt: nowMs + 5,
        updatedAt: nowMs + 5,
      },
    );
    return {
      interactionId,
      resourceId,
      memoryNodeId,
      adminMemoryNodeId,
    };
  });
}

function executionContext(
  identity: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
) {
  return {
    runQuery: (reference: any, args: any) => identity.query(reference, args),
    runMutation: (reference: any, args: any) =>
      identity.mutation(reference, args),
    runAction: (reference: any, args: any) => identity.action(reference, args),
  };
}

function crashAfterDomainWriteContext(
  ctx: ReturnType<typeof executionContext>,
) {
  return {
    ...ctx,
    runMutation: async (reference: any, mutationArgs: any) => {
      if (
        mutationArgs &&
        typeof mutationArgs === "object" &&
        typeof mutationArgs.attemptToken === "string" &&
        ("result" in mutationArgs || "errorCode" in mutationArgs)
      ) {
        throw new Error("simulated_crash_after_domain_write");
      }
      return await ctx.runMutation(reference, mutationArgs);
    },
  };
}

async function expireCanonicalReceipt(
  t: ReturnType<typeof convexTest>,
  args: {
    toolName: "polynet_write" | "polynet_call";
    idempotencyKey: string;
  },
) {
  await t.run(async (ctx) => {
    const receipts = await ctx.db
      .query("polynetCanonicalOperationReceipts")
      .collect();
    const receipt = receipts.find(
      (candidate) =>
        candidate.toolName === args.toolName &&
        candidate.idempotencyKey === args.idempotencyKey,
    );
    expect(receipt).toBeDefined();
    await ctx.db.patch(receipt!._id, { leaseExpiresAt: 0 });
  });
}

async function recoverCanonicalOperationAfterReceiptCompletionCrash(
  t: ReturnType<typeof convexTest>,
  args: {
    healthyCtx: ReturnType<typeof executionContext>;
    authSubject: string;
    userId: any;
    principalKind: "personal_agent" | "external_mcp" | "community_agent";
    evidenceSurface:
      | "member_agent_dock"
      | "coding_harness"
      | "external_mcp"
      | "community_concierge"
      | "community_funnel_builder";
    toolName: "polynet_write" | "polynet_call";
    input: Record<string, unknown>;
    idempotencyKey: string;
    expectedErrorCode: string;
    mountedCommunityId?: any;
    assertDomainEffect: () => Promise<void>;
  },
) {
  const common = {
    authSubject: args.authSubject,
    userId: args.userId,
    principalKind: args.principalKind,
    evidenceSurface: args.evidenceSurface,
    toolName: args.toolName,
    input: args.input,
    ...(args.mountedCommunityId
      ? { mountedCommunityId: args.mountedCommunityId }
      : {}),
  };
  await expect(
    executePolynetCanonicalTool({
      ctx: crashAfterDomainWriteContext(args.healthyCtx),
      ...common,
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: args.expectedErrorCode,
    message: "simulated_crash_after_domain_write",
  });
  await t.run(async (ctx) => {
    const receipt = (
      await ctx.db.query("polynetCanonicalOperationReceipts").collect()
    ).find(
      (candidate) =>
        candidate.toolName === args.toolName &&
        candidate.idempotencyKey === args.idempotencyKey,
    );
    expect(receipt).toMatchObject({
      status: "executing",
      attemptCount: 1,
    });
  });
  await args.assertDomainEffect();
  await expireCanonicalReceipt(t, {
    toolName: args.toolName,
    idempotencyKey: args.idempotencyKey,
  });
  const recovered = await executePolynetCanonicalTool({
    ctx: args.healthyCtx,
    ...common,
  });
  expect(recovered).toMatchObject({
    ok: true,
    value: {
      deduped: true,
      receipt: { deduped: true },
    },
  });
  await t.run(async (ctx) => {
    const receipt = (
      await ctx.db.query("polynetCanonicalOperationReceipts").collect()
    ).find(
      (candidate) =>
        candidate.toolName === args.toolName &&
        candidate.idempotencyKey === args.idempotencyKey,
    );
    expect(receipt).toMatchObject({
      status: "completed",
      attemptCount: 2,
    });
  });
  return recovered;
}

test("canonical five-tool executor derives member, builder, and community-agent authority per request", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const memberCtx = executionContext(asMember);
  const ownerCtx = executionContext(asOwner);
  const scheduledCommunityAgentCtx = executionContext(t as any);

  const platformRoot = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: { path: "/", cursor: null, limit: 50 },
  });
  expect(platformRoot).toMatchObject({
    ok: true,
    value: {
      path: "/",
      entries: [
        { path: "/communities/", kind: "directory" },
        { path: "/users/", kind: "directory" },
      ],
    },
  });

  const memberList = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: {
      path: "/communities/canonical-community/",
      cursor: null,
      limit: 50,
    },
  });
  expect(memberList).toMatchObject({
    ok: true,
    value: {
      authority: { lane: "member", relation: "member" },
    },
  });
  expect(JSON.stringify(memberList)).not.toContain(
    "/communities/canonical-community/builder/",
  );

  const ownerList = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/" },
  });
  expect(ownerList).toMatchObject({
    ok: true,
    value: {
      authority: { lane: "builder", relation: "owner" },
    },
  });
  expect(JSON.stringify(ownerList)).toContain(
    "/communities/canonical-community/builder/",
  );

  const communityAgentList = await executePolynetCanonicalTool({
    ctx: scheduledCommunityAgentCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "community_agent",
    mountedCommunityId: fixture.communityId,
    evidenceSurface: "community_concierge",
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/" },
  });
  expect(communityAgentList).toMatchObject({
    ok: true,
    value: {
      authority: { lane: "member", relation: "member" },
    },
  });
  expect(JSON.stringify(communityAgentList)).not.toContain(
    "/communities/canonical-community/builder/",
  );

  for (const path of [
    "/communities/canonical-community/channels/",
    "/communities/canonical-community/resources/",
    "/communities/canonical-community/events/",
    "/communities/canonical-community/members/",
  ]) {
    await expect(
      executePolynetCanonicalTool({
        ctx: scheduledCommunityAgentCtx,
        authSubject: fixture.ownerSubject,
        userId: fixture.ownerId,
        principalKind: "community_agent",
        mountedCommunityId: fixture.communityId,
        evidenceSurface: "community_concierge",
        toolName: "polynet_list",
        input: { path },
      }),
    ).resolves.toMatchObject({ ok: true });
  }

  await expect(
    executePolynetCanonicalTool({
      ctx: scheduledCommunityAgentCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "community_agent",
      mountedCommunityId: fixture.communityId,
      evidenceSurface: "community_concierge",
      toolName: "polynet_list",
      input: { path: "/communities/other-community/" },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "community_context_mismatch",
  });

  await expect(
    executePolynetCanonicalTool({
      ctx: scheduledCommunityAgentCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.ownerId,
      principalKind: "community_agent",
      mountedCommunityId: fixture.communityId,
      evidenceSurface: "community_concierge",
      toolName: "polynet_list",
      input: { path: "/communities/canonical-community/" },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "semantic_not_found",
  });
});

test("retired funnel draft capability is absent and cannot write through the canonical executor", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const ownerCtx = executionContext(t.withIdentity({ subject: fixture.ownerSubject }));
  const capabilityPath = "/communities/canonical-community/capabilities/community.funnel.update_draft.json";
  const common = {
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "personal_agent" as const,
    evidenceSurface: "community_funnel_builder" as const,
  };
  await expect(executePolynetCanonicalTool({
    ...common, toolName: "polynet_list",
    input: { path: "/communities/canonical-community/capabilities/" },
  })).resolves.toMatchObject({ ok: true, value: { entries: [] } });
  await expect(executePolynetCanonicalTool({
    ...common, toolName: "polynet_read", input: { path: capabilityPath },
  })).resolves.toMatchObject({ ok: false, code: "semantic_not_found" });
  const update = () => executePolynetCanonicalTool({
    ...common,
    toolName: "polynet_call",
    input: {
      operation: "community.funnel.update_draft",
      version: 1,
      target: capabilityPath,
      input: { expected_revision: 0, content: buildCommunityFunnelContentTestFixture() },
      idempotency_key: "retired-builder-retry",
    },
  });
  await expect(update()).resolves.toMatchObject({ ok: false, code: "operation_not_found" });
  await expect(update()).resolves.toMatchObject({ ok: false, code: "operation_not_found" });
  const rows = await t.run(async (ctx) => ctx.db.query("communityFunnels").collect());
  expect(rows).toHaveLength(0);
});

test("retired AI Feed paths are uniformly absent across canonical operations", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);
  const path = "/communities/canonical-community/ai-feed/";
  const cases = [
    { toolName: "polynet_list" as const, input: { path } },
    { toolName: "polynet_read" as const, input: { path } },
    {
      toolName: "polynet_search" as const,
      input: { path, query: "retired feed" },
    },
    {
      toolName: "polynet_write" as const,
      input: {
        path,
        mode: "create",
        content: { body: "This write must remain impossible." },
        idempotency_key: "retired-feed-write-denial",
      },
    },
  ];

  for (const operation of cases) {
    await expect(
      executePolynetCanonicalTool({
        ctx: ownerCtx,
        authSubject: fixture.ownerSubject,
        userId: fixture.ownerId,
        principalKind: "external_mcp",
        evidenceSurface: "external_mcp",
        toolName: operation.toolName,
        input: operation.input,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "semantic_not_found",
      message: "Repository path not found or not accessible.",
    });
  }
});

test("community activity and events list directly and round-trip through read", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const startsAt = Date.now() + 60 * 60 * 1000;
  const endsAt = startsAt + 60 * 60 * 1000;
  const { interactionId, eventId } = await t.run(async (ctx) => {
    const interactionId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: fixture.generalChannelId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Current community activity",
      contentSummary: "Members are coordinating the next community session.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "current-community-activity",
      createdAt: startsAt - 1_000,
      updatedAt: startsAt - 1_000,
    });
    const eventId = await ctx.db.insert("communityEvents", {
      communityId: fixture.communityId,
      createdByUserId: fixture.ownerId,
      title: "Community working session",
      descriptionMd: "A live working session for members.",
      startsAt,
      endsAt,
      timezone: "America/New_York",
      locationType: "online",
      locationLabel: "Member room",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "none",
      recurrenceInterval: 1,
      createdAt: startsAt - 2_000,
      updatedAt: startsAt - 2_000,
    });
    return { interactionId, eventId };
  });
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const memberCtx = executionContext(asMember);

  const root = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/" },
  });
  expect(root).toMatchObject({
    ok: true,
    value: {
      entries: expect.arrayContaining([
        expect.objectContaining({
          path: "/communities/canonical-community/events/",
          kind: "directory",
        }),
      ]),
    },
  });

  const activity = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: {
      path: "/communities/canonical-community/channels/general/",
      limit: 20,
    },
  });
  const interactionPath = `/communities/canonical-community/channels/general/interaction:root:${interactionId}.md`;
  expect(activity).toMatchObject({
    ok: true,
    value: {
      entries: expect.arrayContaining([
        expect.objectContaining({
          path: interactionPath,
          type: "interaction",
        }),
      ]),
    },
  });
  await expect(
    executePolynetCanonicalTool({
      ctx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_read",
      input: { path: interactionPath },
    }),
  ).resolves.toMatchObject({
    ok: true,
    value: { path: interactionPath, ref: `interaction:root:${interactionId}` },
  });

  const events = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: {
      path: "/communities/canonical-community/events/",
      limit: 20,
    },
  });
  const eventPath = `/communities/canonical-community/events/event:${eventId}:${startsAt}.md`;
  expect(events).toMatchObject({
    ok: true,
    value: {
      entries: expect.arrayContaining([
        expect.objectContaining({
          path: eventPath,
          type: "event",
          title: "Community working session",
          starts_at_zoned: formatCommunityEventZonedDateTime(
            startsAt,
            "America/New_York",
          ),
          ends_at_zoned: formatCommunityEventZonedDateTime(
            endsAt,
            "America/New_York",
          ),
        }),
      ]),
    },
  });
  const eventRead = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_read",
    input: { path: eventPath },
  });
  expect(eventRead).toMatchObject({
    ok: true,
    value: { path: eventPath, ref: `event:${eventId}:${startsAt}` },
  });
  expect(JSON.parse(String((eventRead as any).value.body))).toMatchObject({
    title: "Community working session",
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    starts_at_zoned: formatCommunityEventZonedDateTime(
      startsAt,
      "America/New_York",
    ),
    ends_at_zoned: formatCommunityEventZonedDateTime(
      endsAt,
      "America/New_York",
    ),
  });

  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", fixture.communityId).eq("userId", fixture.memberId),
      )
      .unique();
    if (!membership) throw new Error("test_membership_missing");
    await ctx.db.patch(membership._id, { active: false, updatedAt: Date.now() });
  });
  await expect(
    executePolynetCanonicalTool({
      ctx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_list",
      input: { path: "/communities/canonical-community/events/", limit: 20 },
    }),
  ).resolves.toMatchObject({ ok: false });
});

test("community event writes reject an explicitly invalid timezone", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });

  await expect(
    asOwner.mutation(api.communityEvents.saveCommunityEvent, {
      payload: {
        community_id: fixture.communityId,
        title: "Invalid timezone event",
        starts_at: "2026-08-13T14:00:00.000Z",
        timezone: "Mars/Olympus_Mons",
      },
    }),
  ).rejects.toThrow("community_event_timezone_invalid");
});

test("custom channels discover, isolate, search, read, and write through exact paths", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const nowMs = Date.now();
  const { generalRootId, winsRootId } = await t.run(async (ctx) => {
    const generalRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: fixture.generalChannelId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "General channel planning marker.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "semantic-general-channel-marker",
      createdAt: nowMs - 1_000,
      updatedAt: nowMs - 1_000,
    });
    const winsRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: fixture.winsChannelId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "announcement",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Wins channel launch marker.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "semantic-wins-channel-marker",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { generalRootId, winsRootId };
  });
  const memberCtx = executionContext(
    t.withIdentity({ subject: fixture.memberSubject }),
  );
  const base = {
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent" as const,
    evidenceSurface: "member_agent_dock" as const,
  };

  const channels = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/channels/" },
  });
  expect(channels).toMatchObject({
    ok: true,
    value: {
      writable: false,
      entries: [
        expect.objectContaining({
          path: "/communities/canonical-community/channels/general/",
          channel_id: String(fixture.generalChannelId),
          system_role: "general",
        }),
        expect.objectContaining({
          path: "/communities/canonical-community/channels/wins/",
          channel_id: String(fixture.winsChannelId),
          system_role: null,
        }),
      ],
    },
  });

  await expect(
    executePolynetCanonicalTool({
      ...base,
      toolName: "polynet_write",
      input: {
        path: "/communities/canonical-community/channels/",
        mode: "create",
        content: { text: "This discovery-root write must fail." },
        idempotency_key: "semantic-channel-root-write",
      },
    }),
  ).resolves.toMatchObject({ ok: false, code: "semantic_not_writable" });

  const general = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_list",
    input: {
      path: "/communities/canonical-community/channels/general/",
      limit: 20,
    },
  });
  const wins = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_list",
    input: {
      path: "/communities/canonical-community/channels/wins/",
      limit: 20,
    },
  });
  expect(JSON.stringify(general)).toContain(String(generalRootId));
  expect(JSON.stringify(general)).not.toContain(String(winsRootId));
  expect(JSON.stringify(wins)).toContain(String(winsRootId));
  expect(JSON.stringify(wins)).not.toContain(String(generalRootId));
  expect(JSON.stringify(wins)).not.toContain('"lineage"');
  expect(JSON.stringify(wins)).not.toContain('"object_id"');
  expect(JSON.stringify(wins)).not.toContain('"root_id"');
  expect(wins).toMatchObject({
    ok: true,
    value: {
      entries: [
        expect.objectContaining({
          path: `/communities/canonical-community/channels/wins/interaction:root:${winsRootId}.md`,
          channel_slug: "wins",
          interaction_kind: "announcement",
        }),
      ],
    },
  });

  const winsPath = `/communities/canonical-community/channels/wins/interaction:root:${winsRootId}.md`;
  await expect(
    executePolynetCanonicalTool({
      ...base,
      toolName: "polynet_read",
      input: { path: winsPath },
    }),
  ).resolves.toMatchObject({
    ok: true,
    value: {
      path: winsPath,
      body: expect.stringContaining('"interaction_kind": "announcement"'),
    },
  });
  await expect(
    executePolynetCanonicalTool({
      ...base,
      toolName: "polynet_read",
      input: {
        path: `/communities/canonical-community/channels/general/interaction:root:${winsRootId}.md`,
      },
    }),
  ).resolves.toMatchObject({ ok: false, code: "semantic_not_found" });

  const searched = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_search",
    input: {
      path: "/communities/canonical-community/channels/wins/",
      query: "channel marker",
      limit: 10,
    },
  });
  expect(JSON.stringify(searched)).toContain(winsPath);
  expect(JSON.stringify(searched)).not.toContain(String(generalRootId));

  const repositorySearch = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_search",
    input: {
      path: "/communities/canonical-community/",
      query: "Wins channel launch marker",
      limit: 10,
    },
  });
  expect(JSON.stringify(repositorySearch)).toContain(winsPath);

  const written = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/channels/wins/",
      mode: "create",
      content: { text: "A channel-aware personal-agent update." },
      idempotency_key: "semantic-wins-write",
    },
  });
  expect(written).toMatchObject({
    ok: true,
    value: {
      path: expect.stringMatching(
        /^\/communities\/canonical-community\/channels\/wins\/interaction:root:/,
      ),
    },
  });
  const writtenRootId = String((written as any).value.result.interaction.root_id);
  await t.run(async (ctx) => {
    const rootId = ctx.db.normalizeId("communityInteractionRoots", writtenRootId);
    expect(rootId).not.toBeNull();
    const root = rootId ? await ctx.db.get(rootId) : null;
    expect(root?.channelId).toBe(fixture.winsChannelId);
  });

  const communityAgentWritten = await executePolynetCanonicalTool({
    ctx: executionContext(t.withIdentity({ subject: fixture.ownerSubject })),
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "community_agent",
    mountedCommunityId: fixture.communityId,
    evidenceSurface: "community_concierge",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/channels/wins/",
      mode: "create",
      content: { text: "A channel-aware community-agent update." },
      idempotency_key: "semantic-wins-community-agent-write",
    },
  });
  expect(communityAgentWritten).toMatchObject({
    ok: true,
    value: {
      path: expect.stringMatching(
        /^\/communities\/canonical-community\/channels\/wins\/interaction:root:/,
      ),
    },
  });

  await expect(
    executePolynetCanonicalTool({
      ...base,
      toolName: "polynet_write",
      input: {
        path: "/communities/canonical-community/channels/wins/",
        mode: "append",
        content: {
          root_id: String(generalRootId),
          text: "This cross-channel reply must fail.",
        },
        idempotency_key: "semantic-cross-channel-reply",
      },
    }),
  ).resolves.toMatchObject({ ok: false });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.winsChannelId, {
      status: "archived",
      updatedAt: Date.now(),
    });
  });
  const channelsAfterArchive = await executePolynetCanonicalTool({
    ...base,
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/channels/" },
  });
  expect(JSON.stringify(channelsAfterArchive)).not.toContain(
    "/channels/wins/",
  );
  await expect(
    executePolynetCanonicalTool({
      ...base,
      toolName: "polynet_list",
      input: { path: "/communities/canonical-community/channels/wins/" },
    }),
  ).resolves.toMatchObject({ ok: false, code: "semantic_not_found" });
});

test("community-root search returns canonical paths that round-trip through read", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const searchFixture = await createCanonicalSearchFixture(t, fixture);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const ownerCtx = executionContext(asOwner);
  const memberCtx = executionContext(asMember);
  const searchInput = {
    path: "/communities/canonical-community/",
    query: "canonical repository search",
    limit: 10,
  };

  const searched = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_search",
    input: searchInput,
  });
  if (!searched.ok) {
    throw new Error(`${searched.code}: ${searched.message}`);
  }
  expect(searched.value).toMatchObject({
    path: "/communities/canonical-community/",
    truncated: false,
    retrieval_id: expect.any(String),
  });
  const results = Array.isArray(searched.value.results)
    ? (searched.value.results as Array<Record<string, unknown>>)
    : [];
  expect(results).toHaveLength(3);
  expect(results.map((result) => result.source_type).sort()).toEqual([
    "interaction",
    "memory",
    "resource",
  ]);
  const paths = results.map((result) => String(result.path ?? ""));
  expect(paths).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        /^\/communities\/canonical-community\/channels\/general\/interaction:root:/,
      ),
      expect.stringMatching(/^\/communities\/canonical-community\/resources\//),
      expect.stringMatching(/^\/communities\/canonical-community\/memory\//),
    ]),
  );
  expect(JSON.stringify(results)).not.toContain(String(fixture.ownerId));

  for (const path of paths) {
    const read = await executePolynetCanonicalTool({
      ctx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_read",
      input: { path, offset: 0, limit: 2_000 },
    });
    expect(read).toMatchObject({
      ok: true,
      value: {
        path,
        body: expect.stringContaining("Canonical repository search"),
        truncated: false,
      },
    });
    expect(JSON.stringify(read)).not.toContain(String(fixture.ownerId));
  }

  const memberSearch = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_search",
    input: searchInput,
  });
  const communityAgentSearch = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "community_agent",
    mountedCommunityId: fixture.communityId,
    evidenceSurface: "community_concierge",
    toolName: "polynet_search",
    input: searchInput,
  });
  expect(memberSearch).toMatchObject({ ok: true });
  expect(communityAgentSearch).toMatchObject({ ok: true });
  const memberPaths =
    memberSearch.ok && Array.isArray(memberSearch.value.results)
      ? memberSearch.value.results.map((result) =>
          String((result as Record<string, unknown>).path ?? ""),
        )
      : [];
  const communityAgentPaths =
    communityAgentSearch.ok && Array.isArray(communityAgentSearch.value.results)
      ? communityAgentSearch.value.results.map((result) =>
          String((result as Record<string, unknown>).path ?? ""),
        )
      : [];
  expect(memberPaths).toEqual(paths);
  expect(communityAgentPaths).toEqual(paths);

  await expect(
    executePolynetCanonicalTool({
      ctx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_search",
      input: { ...searchInput, limit: 2 },
    }),
  ).resolves.toMatchObject({
    ok: true,
    value: {
      results: [expect.any(Object), expect.any(Object)],
      truncated: true,
    },
  });

  await expect(
    executePolynetCanonicalTool({
      ctx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_read",
      input: {
        path: `/communities/canonical-community/memory/${String(
          searchFixture.adminMemoryNodeId,
        )}.md`,
        offset: 0,
        limit: 2_000,
      },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "semantic_not_found",
  });

  const receipts = await t.run(async (ctx) =>
    ctx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect(),
  );
  expect(receipts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        capability: "community_repository_search",
        surface: "external_mcp",
        resultRefs: expect.arrayContaining([
          expect.stringMatching(/^interaction:root:/),
          expect.stringMatching(/^resource:/),
          expect.stringMatching(/^\/memory\//),
        ]),
      }),
    ]),
  );
});

test("canonical writes are attributed, retry safe, and reject conflicting idempotency keys", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const memberCtx = executionContext(asMember);
  const ownerCtx = executionContext(asOwner);
  const memberWrite = {
    path: "/communities/canonical-community/channels/general/",
    mode: "create",
    content: {
      body: "A member-agent field report.",
      root_id: null,
      reply_to_message_id: null,
      mentions: null,
      attachments: null,
      post_type: null,
      title: null,
      evidence: null,
      summary: null,
      operations: null,
    },
    expected_revision: null,
    idempotency_key: "member-chat-1",
  };

  const firstMemberWrite = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_write",
    input: memberWrite,
  });
  expect(firstMemberWrite).toMatchObject({
    ok: true,
    value: {
      deduped: false,
      receipt: {
        principal_kind: "personal_agent",
        authority_lane: "member",
      },
    },
  });
  const memberWritePath =
    firstMemberWrite.ok && typeof firstMemberWrite.value.path === "string"
      ? firstMemberWrite.value.path
      : "";
  expect(memberWritePath).toMatch(
    /^\/communities\/canonical-community\/channels\/general\/interaction:root:/,
  );
  const memberRead = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_read",
    input: { path: memberWritePath, offset: 0, limit: 2_000 },
  });
  if (!memberRead.ok) {
    throw new Error(`${memberRead.code}: ${memberRead.message}`);
  }
  expect(memberRead).toMatchObject({
    ok: true,
    value: {
      path: memberWritePath,
      ref: expect.stringMatching(/^interaction:root:/),
      body: expect.stringContaining("A member-agent field report."),
      truncated: false,
      retrieval_id: expect.any(String),
    },
  });
  await expect(
    executePolynetCanonicalTool({
      ctx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_write",
      input: memberWrite,
    }),
  ).resolves.toMatchObject({
    ok: true,
    value: {
      deduped: true,
      receipt: { deduped: true },
    },
  });
  await expect(
    executePolynetCanonicalTool({
      ctx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_write",
      input: {
        ...memberWrite,
        content: { body: "Conflicting payload." },
      },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "idempotency_key_conflict",
  });

  const communityAgentWrite = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "community_agent",
    mountedCommunityId: fixture.communityId,
    evidenceSurface: "community_concierge",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/channels/general/",
      mode: "create",
      content: { text: "A community-owned agent field report." },
      idempotency_key: "community-agent-chat-1",
    },
  });
  expect(communityAgentWrite).toMatchObject({
    ok: true,
    value: {
      receipt: {
        principal_kind: "community_agent",
        authority_lane: "member",
      },
    },
  });

  const rows = await t.run(async (ctx) => ({
    roots: await ctx.db.query("communityInteractionRoots").collect(),
    receipts: await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
  }));
  expect(rows.roots).toHaveLength(2);
  expect(
    rows.roots.every((root) => root.channelId === fixture.generalChannelId),
  ).toBe(true);
  expect(rows.roots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actorType: "personal_agent",
        actorUserId: fixture.memberId,
      }),
      expect.objectContaining({
        actorType: "community_agent",
        actorAgentKey: "community_agent",
      }),
    ]),
  );
  expect(rows.receipts).toHaveLength(2);
});

test("chat roots and replies survive receipt-completion crashes without duplication", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const memberCtx = executionContext(asMember);
  const input = {
    path: "/communities/canonical-community/channels/general/",
    mode: "create",
    content: {
      text: "A crash-safe member-agent field report.",
    },
    idempotency_key: "member-chat-crash-after-write-1",
  };
  await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
    healthyCtx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_write",
    input,
    idempotencyKey: "member-chat-crash-after-write-1",
    expectedErrorCode: "community_chat_write_failed",
    assertDomainEffect: async () => {
      await t.run(async (ctx) => {
        expect(
          await ctx.db.query("communityInteractionRoots").collect(),
        ).toHaveLength(1);
      });
    },
  });

  const rootId = await t.run(async (ctx) => {
    const roots = await ctx.db.query("communityInteractionRoots").collect();
    expect(roots).toHaveLength(1);
    return roots[0]!._id;
  });

  const replyInput = {
    path: "/communities/canonical-community/channels/general/",
    mode: "append",
    content: {
      root_id: String(rootId),
      text: "A crash-safe reply.",
    },
    idempotency_key: "member-reply-crash-after-write-1",
  };
  await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
    healthyCtx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_write",
    input: replyInput,
    idempotencyKey: "member-reply-crash-after-write-1",
    expectedErrorCode: "community_chat_write_failed",
    assertDomainEffect: async () => {
      await t.run(async (ctx) => {
        expect(
          await ctx.db.query("communityInteractionReplies").collect(),
        ).toHaveLength(1);
      });
    },
  });
  await t.run(async (ctx) => {
    const replies = await ctx.db.query("communityInteractionReplies").collect();
    expect(replies).toHaveLength(1);
    expect(replies[0]?.channelId).toBe(fixture.generalChannelId);
  });
});

test("builder resource agents may stage changes but cannot make terminal decisions", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);

  const stage = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/builder/resources/",
      mode: "create",
      content: {
        summary: "Stage one bounded resource category.",
        operations: [
          {
            op: "create_module",
            module_key: "canonical-test",
            name: "Canonical test",
            module_status: "draft",
          },
        ],
      },
      idempotency_key: "builder-stage-1",
    },
  });
  expect(stage).toMatchObject({
    ok: true,
    value: {
      deduped: false,
      receipt: { authority_lane: "builder" },
    },
  });
  const changesetId = String(stage.ok ? (stage.value.ref ?? "") : "");
  expect(changesetId).not.toBe("");

  const agentPrincipals = [
    {
      principalKind: "personal_agent" as const,
      evidenceSurface: "member_agent_dock" as const,
    },
    {
      principalKind: "external_mcp" as const,
      evidenceSurface: "external_mcp" as const,
    },
    {
      principalKind: "community_agent" as const,
      evidenceSurface: "community_concierge" as const,
      mountedCommunityId: fixture.communityId,
    },
  ];
  for (const principal of agentPrincipals) {
    for (const operation of ["approve", "reject", "apply"] as const) {
      await expect(
        executePolynetCanonicalTool({
          ctx: ownerCtx,
          authSubject: fixture.ownerSubject,
          userId: fixture.ownerId,
          principalKind: principal.principalKind,
          evidenceSurface: principal.evidenceSurface,
          ...(principal.mountedCommunityId
            ? { mountedCommunityId: principal.mountedCommunityId }
            : {}),
          toolName: "polynet_call",
          input: {
            operation: `community.resources.changeset.${operation}`,
            version: 1,
            target: `/communities/canonical-community/capabilities/community.resources.changeset.${operation}.json`,
            input: { changeset_id: changesetId },
            idempotency_key: `${principal.principalKind}-${operation}-denied`,
          },
        }),
      ).resolves.toMatchObject({
        ok: false,
        code: "operation_not_found",
      });
    }
  }

  const applied = await asOwner.mutation(
    api.communityResources.applyCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: changesetId as any,
    },
  );
  expect(applied).toMatchObject({
    ok: true,
    status: "applied",
    deduped: false,
  });

  const admin = await createAdminFixture(t, fixture);
  const asAdmin = t.withIdentity({ subject: admin.authSubject });
  await expect(
    asAdmin.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: changesetId as any,
      },
    ),
  ).resolves.toMatchObject({
    ok: true,
    status: "applied",
    deduped: true,
  });

  const legacyStage = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/builder/resources/",
      mode: "create",
      content: {
        summary: "Stage one legacy-approved resource category.",
        operations: [
          {
            op: "create_module",
            module_key: "legacy-approved-test",
            name: "Legacy approved test",
            module_status: "draft",
          },
        ],
      },
      idempotency_key: "builder-stage-legacy-approved-1",
    },
  });
  const legacyChangesetId = String(
    legacyStage.ok ? (legacyStage.value.ref ?? "") : "",
  );
  expect(legacyChangesetId).not.toBe("");
  await asOwner.mutation(
    api.communityResources.approveCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: legacyChangesetId as any,
    },
  );
  await expect(
    asAdmin.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: legacyChangesetId as any,
      },
    ),
  ).resolves.toMatchObject({
    ok: true,
    status: "applied",
    deduped: false,
  });

  const rejectedStage = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/builder/resources/",
      mode: "create",
      content: {
        summary: "Stage one rejected resource category.",
        operations: [
          {
            op: "create_module",
            module_key: "rejected-test",
            name: "Rejected test",
            module_status: "draft",
          },
        ],
      },
      idempotency_key: "builder-stage-rejected-1",
    },
  });
  const rejectedChangesetId = String(
    rejectedStage.ok ? (rejectedStage.value.ref ?? "") : "",
  );
  await asOwner.mutation(
    api.communityResources.rejectCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: rejectedChangesetId as any,
      reason: "Rejected in lifecycle proof.",
    },
  );
  await expect(
    asOwner.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: rejectedChangesetId as any,
      },
    ),
  ).rejects.toThrow("community_resource_changeset_not_applicable");

  await t.run(async (ctx) => {
    const modules = await ctx.db.query("communityResourceModules").collect();
    expect(modules.map((module) => module.name).sort()).toEqual([
      "Canonical test",
      "Legacy approved test",
    ]);
  });
});

test("resource changeset staging permits only one live proposal per community", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const stage = (idempotencyKey: string, name: string) =>
    t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.communityId,
        summary: `Stage ${name}.`,
        operations: [
          {
            op: "create_module",
            module_key: idempotencyKey,
            name,
            module_status: "draft",
          },
        ],
        idempotencyKey,
      },
    );

  await expect(
    t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.memberId,
        communityId: fixture.communityId,
        summary: "Unauthorized proposal.",
        operations: [
          {
            op: "create_module",
            module_key: "unauthorized",
            name: "Unauthorized",
            module_status: "draft",
          },
        ],
        idempotencyKey: "unauthorized",
      },
    ),
  ).rejects.toThrow();

  const first = await stage("single-active-1", "Single active one");
  expect(first).toMatchObject({ status: "staged", deduped: false });
  await expect(
    stage("single-active-1", "Single active one"),
  ).resolves.toMatchObject({
    changeset_id: first.changeset_id,
    status: "staged",
    deduped: true,
  });
  await expect(stage("single-active-2", "Single active two")).rejects.toThrow(
    "community_resource_changeset_already_pending",
  );
  await expect(
    asOwner.query(
      api.communityResources.listPendingCommunityResourceBuilderChangesets,
      { communityId: fixture.communityId, limit: 5 },
    ),
  ).resolves.toHaveLength(1);
  await expect(
    t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.otherCommunityId,
        summary: "Independent community proposal.",
        operations: [
          {
            op: "create_module",
            module_key: "other-community",
            name: "Other community",
            module_status: "draft",
          },
        ],
        idempotencyKey: "other-community",
      },
    ),
  ).resolves.toMatchObject({ status: "staged", deduped: false });

  await asOwner.mutation(
    api.communityResources.rejectCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: first.changeset_id as any,
      reason: "Release the active slot.",
    },
  );
  const second = await stage("single-active-2", "Single active two");
  await t.run(async (ctx) => {
    await ctx.db.patch(second.changeset_id as any, {
      createdAt: Date.now() - 25 * 60 * 60 * 1000,
      updatedAt: Date.now() - 25 * 60 * 60 * 1000,
    });
  });
  const third = await stage("single-active-3", "Single active three");
  await t.run(async (ctx) => {
    expect(await ctx.db.get(second.changeset_id as any)).toMatchObject({
      status: "expired",
    });
  });

  await asOwner.mutation(
    api.communityResources.approveCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: third.changeset_id as any,
    },
  );
  await expect(stage("single-active-4", "Single active four")).rejects.toThrow(
    "community_resource_changeset_already_pending",
  );
  await asOwner.mutation(
    api.communityResources.applyCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: third.changeset_id as any,
    },
  );
  await expect(
    stage("single-active-4", "Single active four"),
  ).resolves.toMatchObject({
    status: "staged",
    deduped: false,
  });
});

test("expired resource changesets commit one terminal state across every decision path", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const stage = (suffix: string) =>
    t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.communityId,
        summary: `Expiring proposal ${suffix}.`,
        operations: [
          {
            op: "create_module",
            module_key: `expired-${suffix}`,
            name: `Expired ${suffix}`,
            module_status: "draft",
          },
        ],
        idempotencyKey: `expired-${suffix}`,
      },
    );
  const makeExpired = async (changesetId: string) => {
    await t.run(async (ctx) => {
      const expiredAt = Date.now() - 25 * 60 * 60 * 1000;
      await ctx.db.patch(changesetId as any, {
        createdAt: expiredAt,
        updatedAt: expiredAt,
      });
    });
  };

  const applyCandidate = await stage("apply");
  await makeExpired(applyCandidate.changeset_id);
  await expect(
    asOwner.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: applyCandidate.changeset_id as any,
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    code: "community_resource_changeset_expired",
    status: "expired",
    deduped: false,
  });
  await expect(
    asOwner.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: applyCandidate.changeset_id as any,
      },
    ),
  ).resolves.toMatchObject({ status: "expired", deduped: true });

  const rejectCandidate = await stage("reject");
  await makeExpired(rejectCandidate.changeset_id);
  await expect(
    asOwner.mutation(
      api.communityResources.rejectCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: rejectCandidate.changeset_id as any,
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    code: "community_resource_changeset_expired",
    status: "expired",
    deduped: false,
  });

  const approvedCandidate = await stage("legacy-approved");
  await asOwner.mutation(
    api.communityResources.approveCommunityResourceBuilderChangeset,
    {
      communityId: fixture.communityId,
      changesetId: approvedCandidate.changeset_id as any,
    },
  );
  await makeExpired(approvedCandidate.changeset_id);
  await expect(
    asOwner.mutation(
      api.communityResources.applyCommunityResourceBuilderChangeset,
      {
        communityId: fixture.communityId,
        changesetId: approvedCandidate.changeset_id as any,
      },
    ),
  ).resolves.toMatchObject({ status: "expired", deduped: false });

  const idempotentCandidate = await stage("idempotent");
  await makeExpired(idempotentCandidate.changeset_id);
  await expect(stage("idempotent")).resolves.toMatchObject({
    ok: false,
    changeset_id: idempotentCandidate.changeset_id,
    status: "expired",
    deduped: true,
  });

  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("communityResourceBuilderChangesets")
      .collect();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.status === "expired")).toBe(true);
    expect(
      await ctx.db.query("communityResourceModules").collect(),
    ).toHaveLength(0);
  });
});

test("scheduled resource changeset expiry commits without customer action", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t);
    const staged = await t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.communityId,
        summary: "Expire this proposal on schedule.",
        operations: [
          {
            op: "create_module",
            module_key: "scheduled-expiry",
            name: "Scheduled expiry",
            module_status: "draft",
          },
        ],
        idempotencyKey: "scheduled-expiry",
      },
    );

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await t.run(async (ctx) => {
      expect(await ctx.db.get(staged.changeset_id as any)).toMatchObject({
        status: "expired",
        error: "This resource proposal expired after 24 hours.",
      });
      expect(
        await ctx.db.query("communityResourceModules").collect(),
      ).toHaveLength(0);
    });
  } finally {
    vi.useRealTimers();
  }
});

test("concurrent resource changeset staging leaves one live proposal", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const stage = (suffix: string) =>
    t.mutation(
      internal.communityResources
        .stageCommunityResourceBuilderChangesetInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.communityId,
        summary: `Concurrent proposal ${suffix}.`,
        operations: [
          {
            op: "create_module",
            module_key: `concurrent-${suffix}`,
            name: `Concurrent ${suffix}`,
            module_status: "draft",
          },
        ],
        idempotencyKey: `concurrent-${suffix}`,
      },
    );
  const results = await Promise.allSettled([stage("a"), stage("b")]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(
    String(rejected && rejected.status === "rejected" ? rejected.reason : ""),
  ).toContain("community_resource_changeset_already_pending");
  await expect(
    asOwner.query(
      api.communityResources.listPendingCommunityResourceBuilderChangesets,
      { communityId: fixture.communityId, limit: 5 },
    ),
  ).resolves.toHaveLength(1);
});

test("builder resource effects survive receipt-completion crashes without duplication", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);

  const stageInput = {
    path: "/communities/canonical-community/builder/resources/",
    mode: "create",
    content: {
      summary: "Create one crash-safe resource module.",
      operations: [
        {
          op: "create_module",
          module_key: "crash-safe-module",
          name: "Crash-safe module",
          module_status: "draft",
        },
      ],
    },
    idempotency_key: "builder-stage-crash-1",
  };
  await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
    healthyCtx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_write",
    input: stageInput,
    idempotencyKey: "builder-stage-crash-1",
    expectedErrorCode: "builder_changeset_stage_failed",
    assertDomainEffect: async () => {
      await t.run(async (ctx) => {
        const changesets = await ctx.db
          .query("communityResourceBuilderChangesets")
          .collect();
        expect(changesets).toHaveLength(1);
        expect(changesets[0]).toMatchObject({ status: "staged" });
      });
    },
  });
  await t.run(async (ctx) => {
    const changesets = await ctx.db
      .query("communityResourceBuilderChangesets")
      .collect();
    expect(changesets).toHaveLength(1);
    expect(changesets[0]).toMatchObject({ status: "staged" });
    expect(
      await ctx.db.query("communityResourceModules").collect(),
    ).toHaveLength(0);
  });
});

test("community-memory outcome effects survive receipt-completion crashes without duplication", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const memberCtx = executionContext(asMember);
  const nowMs = 1_760_000_000_000;
  const memoryScope = await t.run(async (ctx) => {
    const nodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId: fixture.communityId,
      type: "insight",
      title: "Crash-safe memory",
      bodyMd: "A memory node used to verify retry-safe outcome recording.",
      status: "promising",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.7,
      evidenceStrength: "observed",
      workflowIds: [],
      tags: ["receipt-test"],
      sourceTraceIds: [],
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: "admin",
      createdByUserId: fixture.ownerId,
      lastUpdatedByActorType: "admin",
      lastUpdatedByUserId: fixture.ownerId,
      version: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const retrievalLogId = await ctx.db.insert(
      "communityIntelligenceRetrievalLogs",
      {
        communityId: fixture.communityId,
        userId: fixture.memberId,
        receiptVersion: "community_memory_retrieval_receipt:v1",
        surface: "member_agent_dock",
        retrievedNodeIds: [nodeId],
        injectedNodeIds: [nodeId],
        outcomeObservationIds: [],
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return { nodeId, retrievalLogId };
  });
  const input = {
    operation: "community.memory.record_outcome",
    version: 1,
    target:
      "/communities/canonical-community/capabilities/community.memory.record_outcome.json",
    input: {
      retrieval_log_id: String(memoryScope.retrievalLogId),
      node_id: String(memoryScope.nodeId),
      result_status: "worked",
      notes: "The retry-safe approach worked.",
    },
    idempotency_key: "memory-outcome-crash-1",
  };

  const recovered = await recoverCanonicalOperationAfterReceiptCompletionCrash(
    t,
    {
      healthyCtx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_call",
      input,
      idempotencyKey: "memory-outcome-crash-1",
      expectedErrorCode: "polynet_call_failed",
      assertDomainEffect: async () => {
        await t.run(async (ctx) => {
          expect(
            await ctx.db.query("communityOutcomeObservations").collect(),
          ).toHaveLength(1);
          expect(
            await ctx.db.query("communityIntelligenceChangeRequests").collect(),
          ).toHaveLength(1);
        });
      },
    },
  );
  expect(recovered).toMatchObject({
    ok: true,
    value: {
      result: { deduplicated: true },
    },
  });
  await t.run(async (ctx) => {
    expect(
      await ctx.db.query("communityOutcomeObservations").collect(),
    ).toHaveLength(1);
    expect(
      await ctx.db.query("communityIntelligenceChangeRequests").collect(),
    ).toHaveLength(1);
  });
});
