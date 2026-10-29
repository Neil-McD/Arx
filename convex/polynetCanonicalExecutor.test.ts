/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { completeCanonicalOperationReceiptInternal } from "./polynetCanonicalReceipts";
import { COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS, ensurePendingCommunityJoinRequest } from "./communityJoinRequestCore";
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers();});

import { api, internal } from "./_generated/api";
import { fitJsonDocument, executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { communityTracksFinishedByLesson } from "./communityLessonTracks";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import schema from "./schema";
import { formatCommunityEventZonedDateTime } from "../shared/communityEventTime";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { buildCommunityFunnelContentTestFixture } from "../scripts/community_funnel_test_fixture";
import { renderCommunityMemberSelfContext } from "../shared/communityMemberSelfContext";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import { settleCommunityIntelligenceFromDigestItemsCore } from "./communityCompilerCandidates";
import { planContentPush, resolveCourses, stageChangeset } from "../packages/polynet-cli/content.mjs";
import { publishDesignDraft, publishTheme, readDesignRecord, readTheme, saveDesignDraft, saveThemeDraft } from "../packages/polynet-cli/design.mjs";

const selfContextPath = "/communities/canonical-community/members/me/context.md";
test("retired integration paths are not found", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const ctx = executionContext(t.withIdentity({ subject: f.memberSubject }));
  const read = await executeRetrievalHarnessTool({ ctx, userId: f.memberId, authSubject: f.memberSubject,
    runId: "integration-retired", toolCallId: "integration-call", communityId: f.communityId,
    communityBoundConversation: true, toolName: "polynet_read" as const,
    args: { path: "/communities/canonical-community/integrations/hubspot/contacts/123" },
    evidenceSurface: "member_agent_dock" as const });
  expect(read.status).toBe("error");
  expect(JSON.stringify(read)).toContain("semantic_not_found");
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

test.each(["community_agent_for_member", "external_mcp"] as const)("%s reads builder workflow dossiers with current authority", async principalKind => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const directory = "/communities/canonical-community/builder/workflow-members/";
  const execute = (subject: string, userId: any, toolName: "polynet_list" | "polynet_read", path: string, kind = principalKind as "community_agent_for_member" | "external_mcp" | "community_agent") => executePolynetCanonicalTool({
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

test("owner member dossier reports current channels, milestone and profile-visible relationships only", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const { membershipId, grantId } = await t.run(async ctx => {
    const now = Date.now();
    const membership = (await ctx.db.query("communityMemberships")
      .withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).first())!;
    const privateChannelId = await ctx.db.insert("communityChannels", { communityId: f.communityId, slug: "test", name: "test",
      accessMode: "restricted", postingPolicy: "members", status: "active", position: 2,
      createdAt: now, updatedAt: now });
    await ctx.db.insert("communityChannels", { communityId: f.communityId, slug: "denied", name: "denied",
      accessMode: "restricted", postingPolicy: "members", status: "active", position: 3,
      createdAt: now, updatedAt: now });
    const grantId = await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId,
      channelId: privateChannelId, principalKey: `user:${f.memberId}`, membershipId: membership._id,
      membershipActivationSequence: membership.activationSequence, status: "active",
      createdByUserId: f.ownerId, createdAt: now, updatedAt: now });
    await ctx.db.insert("communityMemberWorkflows", { communityId: f.communityId,
      milestones: [{ key: "onboarding", name: "Onboarding", automations: [] }], revision: 1,
      createdByUserId: f.ownerId, updatedByUserId: f.ownerId, createdAt: now, updatedAt: now });
    const detail = (await ctx.db.query("userProfileDetails").withIndex("by_user", q => q.eq("userId", f.memberId)).first())!;
    await ctx.db.patch(detail._id, { bio: "Public Rashid bio" });
    await ctx.db.insert("communities", { ownerId: f.memberId, slug: "hidden-owned", name: "Hidden owned",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open",
      activeMemberCount: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("communities", { ownerId: f.memberId, slug: "public-owned", name: "Public owned",
      visibility: "published", inferenceFundingPolicy: "managed_required", entryPolicy: "open",
      activeMemberCount: 1, createdAt: now, updatedAt: now });
    return { membershipId: membership._id, grantId };
  });
  const read = () => t.withIdentity({ subject: f.ownerSubject }).query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId });
  const dossier = await read();
  expect(dossier.channel_access).toMatchObject({ status: "available", truncated: false });
  expect(dossier.channel_access?.channels.map(channel => channel.slug)).toEqual(["general", "wins", "test"]);
  expect(dossier.workflow?.current_milestone_name).toBe("Onboarding");
  expect(dossier.visible_profile?.bio).toBe("Public Rashid bio");
  expect(dossier.visible_profile?.owned_communities.map(community => community.slug)).toContain("public-owned");
  expect(JSON.stringify(dossier)).not.toContain("hidden-owned");
  expect(dossier.markdown).toContain("test (private)");
  const toolRead = await executeRetrievalHarnessTool({
    ctx: executionContext(t.withIdentity({ subject: f.ownerSubject })), userId: f.ownerId,
    authSubject: f.ownerSubject, runId: "owner-member-dossier", communityId: f.communityId,
    communityBoundConversation: true, toolName: "polynet_read",
    args: { path: `/communities/canonical-community/builder/workflow-members/${membershipId}.md` },
    evidenceSurface: "member_agent_dock",
  });
  expect(toolRead.status, toolRead.errorMessage ?? undefined).toBe("ok");
  expect(toolRead.outputText).toContain("test (private)");
  await expect(t.withIdentity({ subject: f.memberSubject }).query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(grantId, { status: "revoked" }));
  expect((await read()).channel_access?.channels.map(channel => channel.slug)).not.toContain("test");
  await t.run(async ctx => {
    await ctx.db.patch(grantId, { status: "active" });
    await ctx.db.patch(membershipId, { activationSequence: 2 });
  });
  expect((await read()).channel_access?.channels.map(channel => channel.slug)).not.toContain("test");
  await t.run(ctx => ctx.db.patch(membershipId, { active: false }));
  await expect(read()).rejects.toThrow();
});

test.each(["community_agent_for_member", "external_mcp"] as const)("%s discovers and reads its own community context without writing state", async (principalKind) => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const ctx = executionContext(t.withIdentity({ subject: f.memberSubject }));
  const execute = (toolName: "polynet_list" | "polynet_read", path: string) => executePolynetCanonicalTool({
    ctx, authSubject: f.memberSubject, userId: f.memberId, principalKind,
    evidenceSurface: principalKind === "community_agent_for_member" ? "member_agent_dock" : "external_mcp", toolName, input: { path },
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
    ok: true, value: { writable: false, entries: [expect.objectContaining({ path: selfContextPath }), expect.objectContaining({ path: "/communities/canonical-community/members/me/forms/" }),
      expect.objectContaining({ path: "/communities/canonical-community/members/me/progress.json", type: "member_progress" })] },
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
    authSubject: f.memberSubject, userId: f.memberId, principalKind: "community_agent_for_member",
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
    authSubject: f.memberSubject, userId: f.memberId, principalKind: "community_agent_for_member",
    evidenceSurface: "member_agent_dock", toolName: "polynet_read", input: { path: selfContextPath },
  });
  expect(result).toMatchObject({ ok: false });
  expect(queryCount).toBe(2);
});

const modules = import.meta.glob([
  "./communityCompilerDigest.ts",
  "./communityPublic.ts",
  "./communityAccessQueries.ts",
  "./communityAdmin.ts",
  "./email.ts",
  "./communityAgent.ts",
  "./communityMemberWorkflows.ts",
  "./authActor.ts",
  "./authIdentity.ts",
  "./communityActivity.ts",
  "./communityAttention.ts",
  "./communityCapabilityContext.ts",
  "./communityChat.ts",
  "./communityChannels.ts",
  "./communityEvidenceAudit.ts",
  "./communityEvents.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityInteractionEvidence.ts",
  "./communityInteractions.ts",
  "./communityMentionLifecycle.ts",
  "./communityRepositorySearch.ts",
  "./communityResourceEvidence.ts",
  "./communityResources.ts",
  "./communityResourceProgress.ts",
  "./communityLessonTracks.ts",
  "./communityOffers.ts",
  "./communityWorkflowRunHistory.ts",
  "./communityClients.ts",
  "./communityThemes.ts",
  "./communityLayouts.ts",
  "./communityBrands.ts",
  "./communityLifecycle.ts",
  "./communityForms.ts",
  "./communityAccess.ts",
  "./communitySettingProposals.ts",
  "./communityWorkflowChanges.ts",
  "./communityColdArchive.ts",
  "./polynetCanonicalReceipts.ts",
  "./communityTestMembers.ts",
  "./profiles.ts",
  "./emailPreferences.ts",
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
    principalKind: "community_agent_for_member" | "external_mcp" | "community_agent";
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
    principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member" as const,
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
    principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
      principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
      principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member" as const,
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
    principalKind: "community_agent_for_member",
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
  // The mention worker runs in the background with no Convex identity; its
  // memory search must still read as the requesting member.
  const backgroundAgentSearch = await executePolynetCanonicalTool({
    ctx: executionContext(t as any),
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "community_agent",
    mountedCommunityId: fixture.communityId,
    evidenceSurface: "community_concierge",
    toolName: "polynet_search",
    input: { ...searchInput, path: "/communities/canonical-community/memory/" },
  });
  expect(backgroundAgentSearch).toMatchObject({ ok: true });
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
    principalKind: "community_agent_for_member",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_write",
    input: memberWrite,
  });
  expect(firstMemberWrite).toMatchObject({
    ok: true,
    value: {
      deduped: false,
      receipt: {
        principal_kind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
      principalKind: "community_agent_for_member",
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
      principalKind: "community_agent_for_member",
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
      // One agent per community: a write made for a member is the community
      // agent's post attributed to that member; an @mention reply has no member.
      expect.objectContaining({
        actorType: "community_agent",
        actorAgentKey: "community_agent",
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
    principalKind: "community_agent_for_member",
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
    principalKind: "community_agent_for_member",
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
      principalKind: "community_agent_for_member" as const,
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
      principalKind: "community_agent_for_member",
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


const admissionQueuePath = "/communities/canonical-community/builder/join-requests/";
async function admissionFixture(t: ReturnType<typeof convexTest>, count = 5) {
  const f = await createFixture(t);
  const admin = await createAdminFixture(t, f);
  const requests = await t.run(async ctx => {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const userId = await ctx.db.insert("users", { authSubject: `applicant-${i}`, email: `private-${i}@example.com`, createdAt: 100 + i, updatedAt: 100 + i });
      ids.push(await ctx.db.insert("communityJoinRequests", { communityId: f.communityId, userId, status: "pending", createdAt: 100 + i, updatedAt: 100 + i }));
    }
    return ids;
  });
  const call = (toolName: "polynet_list" | "polynet_read" | "polynet_search", input: Record<string, unknown>,
    actor = { userId: f.ownerId, authSubject: f.ownerSubject }, communityAgent = false) => executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject: actor.authSubject })), ...actor,
      principalKind: communityAgent ? "community_agent" : "external_mcp", evidenceSurface: "external_mcp",
      ...(communityAgent ? { mountedCommunityId: f.communityId } : {}), toolName, input,
    });
  return { ...f, admin, requests, call };
}

test("admission queue advances bounded pages, exact reads and replay without domain writes", async () => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t);
  const snapshot = () => t.run(async ctx => ({ requests: await ctx.db.query("communityJoinRequests").collect(),
    memberships: await ctx.db.query("communityMemberships").collect(), subscriptions: await ctx.db.query("communitySubscriptions").collect(),
    audit: await ctx.db.query("criticalAuditEvents").collect() }));
  const before = await snapshot();
  const builder = await f.call("polynet_list", { path: "/communities/canonical-community/builder/" });
  expect(builder).toMatchObject({ ok: true, value: { entries: expect.arrayContaining([expect.objectContaining({ path: admissionQueuePath })]) } });
  const found: string[] = []; const cursors = new Set<string>(); let cursor: string | null = null;
  do {
    const result = await f.call("polynet_list", { path: admissionQueuePath, limit: 2, ...(cursor ? { cursor } : {}) });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error("queue failed");
    expect(result.value).toMatchObject({ searchable: false, writable: false });
    expect(result.value.total_count).toBeUndefined();
    const entries = result.value.entries as Array<Record<string, any>>;
    expect(entries.length).toBeLessThanOrEqual(2);
    for (const entry of entries) {
      found.push(entry.path);
      expect(Object.keys(entry).sort()).toEqual(["applicant_ref", "created_at", "kind", "path", "ref", "status", "type", "updated_at"]);
      expect(entry.applicant_ref).toMatch(/^user:applicant-/);
      const read = await f.call("polynet_read", { path: entry.path });
      expect(read, entry.path).toMatchObject({ ok: true }); if (!read.ok) throw new Error("read failed");
      expect(JSON.parse(String(read.value.body))).toEqual({ ref: entry.ref, applicant_ref: entry.applicant_ref,
        status: "pending", created_at: entry.created_at, updated_at: entry.updated_at });
      expect(await f.call("polynet_read", { path: entry.path })).toEqual(read);
    }
    cursor = result.value.next_cursor as string | null;
    if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
    expect(cursors.size).toBeLessThan(5);
  } while (cursor);
  expect(found).toEqual([...f.requests].reverse().map(id => `${admissionQueuePath}${id}.md`));
  expect(await snapshot()).toEqual(before);
  expect(await f.call("polynet_list", { path: admissionQueuePath }, f.admin)).toMatchObject({ ok: true });
  expect(await f.call("polynet_read", { path: found[0] }, f.admin)).toMatchObject({ ok: true });
  expect(await f.call("polynet_search", { path: admissionQueuePath, query: "applicant" })).toMatchObject({ ok: false });
  const broad = await f.call("polynet_search", { path: "/communities/canonical-community/", query: "applicant" });
  expect(JSON.stringify(broad)).not.toContain("join-request:");
  expect(JSON.stringify(broad)).not.toContain("private-");
});

test("admission queue bounds, cursor scope and empty termination fail closed", async () => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t);
  const first = await f.call("polynet_list", { path: admissionQueuePath, limit: 2 });
  if (!first.ok) throw new Error("queue failed");
  const cursor = first.value.next_cursor;
  for (const limit of [1, 51, 2.5]) expect(await f.call("polynet_list", { path: admissionQueuePath, limit })).toMatchObject({ ok: false });
  expect(await f.call("polynet_list", { path: admissionQueuePath, limit: 50 })).toMatchObject({ ok: true });
  for (const invalid of ["bad", "{}", JSON.stringify({ scope: [], cursor: "bad" })]) {
    expect(await f.call("polynet_list", { path: admissionQueuePath, cursor: invalid })).toMatchObject({ ok: false });
  }
  expect(await f.call("polynet_list", { path: admissionQueuePath, cursor }, f.admin)).toMatchObject({ ok: false });
  const other = admissionQueuePath.replace("canonical-community", "other-community");
  expect(await f.call("polynet_list", { path: other, cursor })).toMatchObject({ ok: false });
  expect(await f.call("polynet_list", { path: other })).toMatchObject({ ok: true, value: { entries: [], next_cursor: null, truncated: false } });
  const tampered = JSON.parse(String(cursor)); tampered.cursor = "invalid-native-cursor";
  expect(await f.call("polynet_list", { path: admissionQueuePath, cursor: JSON.stringify(tampered) })).toMatchObject({ ok: false });
});

test.each(["member", "moderator", "applicant", "outsider", "community_agent"])("admission queue denies %s list and detail", async mode => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t);
  let actor = { userId: f.memberId, authSubject: f.memberSubject };
  if (mode === "moderator") await t.run(async ctx => {
    const membership = await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).unique();
    await ctx.db.patch(membership!._id, { role: "moderator" });
  });
  if (mode === "applicant") actor = await t.run(async ctx => ({ userId: (await ctx.db.get(f.requests[0]))!.userId, authSubject: "applicant-0" }));
  if (mode === "outsider") actor = await t.run(async ctx => ({ userId: await ctx.db.insert("users", { authSubject: "outsider", createdAt: 1, updatedAt: 1 }), authSubject: "outsider" }));
  if (mode === "community_agent") actor = { userId: f.ownerId, authSubject: f.ownerSubject };
  for (const [tool, path] of [["polynet_list", admissionQueuePath], ["polynet_read", `${admissionQueuePath}${f.requests[0]}.md`]] as const) {
    expect(await f.call(tool, { path }, actor, mode === "community_agent")).toMatchObject({ ok: false });
  }
  // Domain authorization independently protects reads even without the MCP lane guard.
  if (mode !== "community_agent") {
    await expect(t.query(internal.communityAdmin.listPendingAdmissionRequestsInternal, { userId: actor.userId, communityId: f.communityId })).rejects.toThrow();
    await expect(t.query(internal.communityAdmin.readPendingAdmissionRequestInternal, { userId: actor.userId, communityId: f.communityId, requestId: f.requests[0] })).rejects.toThrow();
  }
});

test.each(["role", "entitlement", "block", "archived"])("admission queue reauthorizes %s on subsequent pages and detail", async mode => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t);
  const first = await f.call("polynet_list", { path: admissionQueuePath, limit: 2 }, f.admin);
  if (!first.ok) throw new Error("queue failed");
  await t.run(async ctx => {
    const membership = await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.admin.userId)).unique();
    if (mode === "role") await ctx.db.patch(membership!._id, { role: "member" });
    if (mode === "entitlement") await ctx.db.patch(membership!._id, { active: false });
    if (mode === "block") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.admin.userId, createdByUserId: f.ownerId, createdAt: 1, updatedAt: 1 });
    if (mode === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" });
  });
  for (const [tool, input] of [["polynet_list", { path: admissionQueuePath, cursor: first.value.next_cursor }],
    ["polynet_read", { path: `${admissionQueuePath}${f.requests[0]}.md` }]] as const) {
    if (mode === "archived") await expect(f.call(tool, input, f.admin)).rejects.toThrow("community_archived");
    else expect(await f.call(tool, input, f.admin)).toMatchObject({ ok: false });
  }
  await expect(t.query(internal.communityAdmin.listPendingAdmissionRequestsInternal, { userId: f.admin.userId, communityId: f.communityId, cursor: "bad" })).rejects.toThrow();
  await expect(t.query(internal.communityAdmin.readPendingAdmissionRequestInternal, { userId: f.admin.userId, communityId: f.communityId, requestId: f.requests[0] })).rejects.toThrow();
});

test.each(["cancelled", "denied", "legacy", "malformed", "duplicate", "wrong-community"])("admission exact read denies %s state without repair", async mode => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t, 1);
  const id = f.requests[0];
  await t.run(async ctx => {
    const row = (await ctx.db.get(id))!;
    if (mode === "cancelled") await ctx.db.delete(id);
    if (mode === "denied") await ctx.db.patch(id, { status: "denied", deniedAt: 200, reapplyAt: 300 });
    if (mode === "legacy") await ctx.db.patch(id, { status: "approved" });
    if (mode === "malformed") await ctx.db.patch(id, { message: "private legacy message" });
    if (mode === "duplicate") await ctx.db.insert("communityJoinRequests", { communityId: f.communityId, userId: row.userId, status: "pending", createdAt: 101, updatedAt: 101 });
    if (mode === "wrong-community") await ctx.db.patch(id, { communityId: f.otherCommunityId });
  });
  const before = await t.run(ctx => ctx.db.query("communityJoinRequests").collect());
  expect(await f.call("polynet_read", { path: `${admissionQueuePath}${id}.md` })).toMatchObject({ ok: false });
  if (["malformed", "duplicate"].includes(mode)) expect(await f.call("polynet_list", { path: admissionQueuePath })).toMatchObject({ ok: false });
  expect(await t.run(ctx => ctx.db.query("communityJoinRequests").collect())).toEqual(before);
});


test("admission queue defaults to twenty and rejects write or decision operations", async () => {
  const t = convexTest(schema, modules); const f = await admissionFixture(t, 21);
  const page = await f.call("polynet_list", { path: admissionQueuePath });
  expect(page).toMatchObject({ ok: true, value: { entries: expect.any(Array), next_cursor: expect.any(String) } });
  if (!page.ok) throw new Error("queue failed");
  expect(page.value.entries).toHaveLength(20);
  const common = { ctx: executionContext(t.withIdentity({ subject: f.ownerSubject })), userId: f.ownerId,
    authSubject: f.ownerSubject, principalKind: "external_mcp" as const, evidenceSurface: "external_mcp" as const };
  expect(await executePolynetCanonicalTool({ ...common, toolName: "polynet_write", input: {
    path: admissionQueuePath, content: "approve", idempotency_key: "queue-must-not-write" } })).toMatchObject({ ok: false });
  expect(await executePolynetCanonicalTool({ ...common, toolName: "polynet_call", input: {
    path: admissionQueuePath, operation: "community.admission.approve", version: 1,
    input: { request_id: f.requests[0] }, idempotency_key: "queue-must-not-decide" } })).toMatchObject({ ok: false });
  expect(await t.run(ctx => ctx.db.query("communityJoinRequests").collect())).toHaveLength(21);
});


const admissionApprovalPath = "/communities/canonical-community/capabilities/community.admission.approve.json";
async function approvalFixture(t: ReturnType<typeof convexTest>, operation = "approve") {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const f = await admissionFixture(t, 1);
  const row = await t.run(async ctx => {
    await ctx.db.patch(f.communityId, { entryPolicy: "approval" });
    return (await ctx.db.get(f.requests[0]))!;
  });
  const input = { operation: `community.admission.${operation}`, version: 1, target: admissionApprovalPath.replace(".approve.", `.${operation}.`),
    input: { request_ref: `join-request:${row._id}`, expected_created_at: new Date(row.createdAt).toISOString(),
      expected_updated_at: new Date(row.updatedAt).toISOString() }, idempotency_key: "approve-one" };
  const call = (request: any = input, actor = { userId: f.ownerId, authSubject: f.ownerSubject }, principalKind: any = "external_mcp",
    overrideCtx?: any) => executePolynetCanonicalTool({ ctx: overrideCtx ?? executionContext(t.withIdentity({ subject: actor.authSubject })),
      ...actor, principalKind, evidenceSurface: "external_mcp", toolName: "polynet_call", input: request });
  const snapshot = () => t.run(async ctx => ({
    request: await ctx.db.get(row._id),
    memberships: (await ctx.db.query("communityMemberships").collect()).filter(m => m.communityId === f.communityId && m.userId === row.userId),
    audit: await ctx.db.query("criticalAuditEvents").collect(), receipts: await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    email: await ctx.db.query("emailOutbox").collect(), activity: await ctx.db.query("communityActivityEvents").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(), timers: await ctx.db.query("communityMemberWorkflowTimers").collect(),
  }));
  return { ...f, row, input, call, snapshot };
}

test.each(["owner", "admin"])("fresh admission %s grants once, stores a historical result and cannot restore revoked access", async role => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t);
  const actor = role === "owner" ? { userId: f.ownerId, authSubject: f.ownerSubject } : f.admin;
  const approve = (request = f.input) => f.call(request, actor);
  const capability = await approve();
  expect(capability, JSON.stringify(capability)).toMatchObject({ ok: true, value: { deduped: false, result: { status: "approved" } } });
  const state = await f.snapshot();
  expect(state.request).toBeNull(); expect(state.memberships).toHaveLength(1);
  expect(state.memberships[0]).toMatchObject({ active: true, role: "member", accessSource: "free_grant", activationSequence: 1 });
  expect(state.audit).toHaveLength(1); expect(state.receipts).toHaveLength(1); expect(state.receipts[0].status).toBe("completed");
  expect(state.email).toHaveLength(1); expect(state.activity).toHaveLength(1);
  const replay = await approve(); expect(replay).toMatchObject({ ok: true, value: { deduped: true } });
  expect(await f.snapshot()).toEqual(state);
  expect(await approve()).toMatchObject({ ok: true, value: { result: (capability as any).value.result, deduped: true } });
  await t.run(ctx => ctx.db.patch(state.memberships[0]._id, { active: false, revokedAt: Date.now(), revokedReason: "test_revocation" }));
  const revoked = await f.snapshot(); expect(await approve()).toMatchObject({ ok: true, value: { deduped: true } });
  expect(await f.snapshot()).toEqual(revoked);
  expect(await approve({ ...f.input, idempotency_key: "different" })).toMatchObject({ ok: false });
  expect(await f.call(f.input, role === "owner" ? f.admin : { userId: f.ownerId, authSubject: f.ownerSubject })).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(revoked);
});

test.each(["member", "moderator", "applicant", "outsider", "community_agent"].flatMap(mode => ["approve", "deny"].map(operation => ({ mode, operation }))))("admission $operation denies $mode without any mutation", async ({ mode, operation }) => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  let actor = { userId: f.memberId, authSubject: f.memberSubject };
  if (mode === "moderator") await t.run(async ctx => {
    const row = (await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).unique())!;
    await ctx.db.patch(row._id, { role: "moderator" });
  });
  if (mode === "applicant") actor = { userId: f.row.userId, authSubject: "applicant-0" };
  if (mode === "outsider") actor = await t.run(async ctx => ({ userId: await ctx.db.insert("users", { authSubject: "outsider", createdAt: 1, updatedAt: 1 }), authSubject: "outsider" }));
  if (mode === "community_agent") actor = { userId: f.ownerId, authSubject: f.ownerSubject };
  const before = await f.snapshot();
  expect(await f.call(f.input, actor, mode === "community_agent" ? mode : "external_mcp")).toMatchObject({ ok: false });
  if (mode !== "community_agent") await expect(t.mutation((operation === "approve" ? internal.communityAdmin.approveFreshAdmissionInternal : internal.communityAdmin.denyFreshAdmissionInternal), {
    userId: actor.userId, communityId: f.communityId, principalKind: "external_mcp", requestId: f.row._id,
    expectedCreatedAt: f.row.createdAt, expectedUpdatedAt: f.row.updatedAt, idempotencyKey: "direct",
  })).rejects.toThrow();
  expect(await f.snapshot()).toEqual(before);
});

test.each(["paid", "open", "cancelled", "denied", "reopened", "duplicate", "legacy", "wrong-community", "blocked", "owner-applicant", "membership-active", "membership-inactive", "membership-admin", "membership-paid", "subscription"].flatMap(mode => ["approve", "deny"].map(operation => ({ mode, operation }))))("admission $operation rejects $mode without effects", async ({ mode, operation }) => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  await t.run(async ctx => {
    if (["paid", "open"].includes(mode)) await ctx.db.patch(f.communityId, { entryPolicy: mode === "paid" ? "paid_subscription" : "open" });
    if (mode === "cancelled") await ctx.db.delete(f.row._id);
    if (mode === "denied") await ctx.db.patch(f.row._id, { status: "denied", deniedAt: 200, reapplyAt: 300 });
    if (mode === "reopened") {
      await ctx.db.patch(f.row._id, { status: "denied", deniedAt: 200, reapplyAt: 300 });
      await ensurePendingCommunityJoinRequest({ ctx, communityId: f.communityId, userId: f.row.userId, nowMs: 400 });
    }
    if (mode === "duplicate") await ctx.db.insert("communityJoinRequests", { communityId: f.communityId, userId: f.row.userId, status: "pending", createdAt: 101, updatedAt: 101 });
    if (mode === "legacy") await ctx.db.patch(f.row._id, { message: "legacy private content" });
    if (mode === "wrong-community") await ctx.db.patch(f.row._id, { communityId: f.otherCommunityId });
    if (mode === "blocked") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.row.userId, createdByUserId: f.ownerId, createdAt: 1, updatedAt: 1 });
    if (mode === "owner-applicant") await ctx.db.patch(f.row._id, { userId: f.ownerId });
    if (mode.startsWith("membership")) await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: f.row.userId,
      role: mode === "membership-admin" ? "admin" : "member", active: mode !== "membership-inactive",
      accessSource: mode === "membership-paid" ? "paid_subscription" : "free_grant", createdAt: 1, updatedAt: 1 });
    if (mode === "subscription") {
      const membership = (await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.memberId)).unique())!;
      const pricePointId = await ctx.db.insert("communityPricePoints", { communityId: f.communityId, name: "Test", description: "", billingPeriod: "monthly", amountBaseUnits: 100, currency: "usd", currencyDecimals: 2, isCurrent: false, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("communitySubscriptions", { communityId: f.communityId, userId: f.row.userId, membershipId: membership._id, pricePointId,
        status: "ended", cancelAtPeriodEnd: false, createdAt: 1, updatedAt: 1 });
    }
  });
  const before = await f.snapshot(); expect(await f.call()).toMatchObject({ ok: false }); expect(await f.snapshot()).toEqual(before);
});

test.each(["role", "entitlement", "block", "funding", "archived"].flatMap(mode => ["approve", "deny"].map(operation => ({ mode, operation }))))("admission $operation reauthorizes $mode even for a completed receipt", async ({ mode, operation }) => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  expect(await f.call(f.input, f.admin)).toMatchObject({ ok: true });
  await t.run(async ctx => {
    const membership = (await ctx.db.query("communityMemberships").withIndex("by_community_user", q => q.eq("communityId", f.communityId).eq("userId", f.admin.userId)).unique())!;
    if (mode === "role") await ctx.db.patch(membership._id, { role: "member" });
    if (mode === "entitlement") await ctx.db.patch(membership._id, { active: false });
    if (mode === "block") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.admin.userId, createdByUserId: f.ownerId, createdAt: 1, updatedAt: 1 });
    if (mode === "funding") await ctx.db.patch(f.communityId, { builderAccessMode: "subscription_required" });
    if (mode === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" });
  });
  const before = await f.snapshot();
  if (mode === "archived") await expect(f.call(f.input, f.admin)).rejects.toThrow("community_archived");
  else expect(await f.call(f.input, f.admin)).toMatchObject({ ok: false });
  await expect(t.mutation((operation === "approve" ? internal.communityAdmin.approveFreshAdmissionInternal : internal.communityAdmin.denyFreshAdmissionInternal), { userId: f.admin.userId, communityId: f.communityId,
    principalKind: "external_mcp", requestId: f.row._id, expectedCreatedAt: f.row.createdAt, expectedUpdatedAt: f.row.updatedAt, idempotencyKey: "approve-one" })).rejects.toThrow();
  expect(await f.snapshot()).toEqual(before);
});

test.each(["approve", "deny"])("admission input is exact and a key cannot be reused for different observations (%s)", async operation => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  for (const input of [{ ...f.input.input, role: "admin" }, { ...f.input.input, request_ref: "user:applicant-0" },
    { ...f.input.input, expected_created_at: "1970-01-01" }, { ...f.input.input, expected_updated_at: null }])
    expect(await f.call({ ...f.input, input })).toMatchObject({ ok: false, code: "invalid_tool_args" });
  expect(await f.call({ ...f.input, target: admissionQueuePath })).toMatchObject({ ok: false, code: "invalid_tool_args" });
  expect(await f.call()).toMatchObject({ ok: true });
  const before = await f.snapshot();
  expect(await f.call({ ...f.input, input: { ...f.input.input, expected_created_at: new Date(101).toISOString() } })).toMatchObject({ ok: false, code: "idempotency_key_conflict" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["approve", "deny"])("admission and receipt roll back together when completion fails (%s)", async operation => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation); const before = await f.snapshot();
  const handler = vi.spyOn(completeCanonicalOperationReceiptInternal as any, "_handler").mockImplementationOnce(async () => { throw new Error("simulated_completion_failure"); });
  expect(await f.call()).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(before); handler.mockRestore();
  expect(await f.call()).toMatchObject({ ok: true });
});

test.each(["same-key", "different-key", "first-party-approve", "first-party-deny", "cancel"])("concurrent admission %s cannot create duplicate effects", async mode => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t);
  const owner = t.withIdentity({ subject: f.ownerSubject });
  const competitor = mode === "same-key" ? () => f.call() : mode === "different-key" ? () => f.call({ ...f.input, idempotency_key: "other" }) :
    mode === "first-party-approve" ? () => owner.mutation(api.communityAdmin.approveCommunityJoinRequest, { requestId: f.row._id }) :
    mode === "first-party-deny" ? () => owner.mutation(api.communityAdmin.denyCommunityJoinRequest, { requestId: f.row._id }) :
    () => t.run(ctx => ctx.db.delete(f.row._id));
  const results = await Promise.allSettled([f.call(), competitor()]);
  const state = await f.snapshot(); expect(state.memberships.length).toBeLessThanOrEqual(1);
  expect(state.email.length).toBeLessThanOrEqual(1); expect(state.activity.length).toBeLessThanOrEqual(1); expect(state.audit.length).toBeLessThanOrEqual(1);
  if (state.memberships.length) expect(state.memberships[0].activationSequence).toBe(1);
  if (mode === "same-key") { expect(results.every(r => r.status === "fulfilled" && (r.value as any).ok === true)).toBe(true); expect(state.receipts).toHaveLength(1); }
});

test.each(["approve", "deny"])("admission first response can be discarded after commit and safely recovered (%s)", async operation => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  const ctx = executionContext(t.withIdentity({ subject: f.ownerSubject }));
  expect(await f.call(f.input, undefined, "external_mcp", { ...ctx, runMutation: async (ref: any, args: any) => {
    await ctx.runMutation(ref, args); throw new Error("discarded_committed_response");
  } })).toMatchObject({ ok: false });
  const committed = await f.snapshot(); expect(committed.receipts[0].status).toBe("completed");
  const recovered = await f.call(); expect(recovered).toMatchObject({ ok: true, value: { deduped: true, result: committed.receipts[0].result.result } });
  expect(await f.snapshot()).toEqual(committed);
});

test.each(["approve", "deny"])("admission capability is discoverable only by current human builders (%s)", async operation => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  for (const actor of [{ userId: f.ownerId, authSubject: f.ownerSubject }, f.admin, { userId: f.memberId, authSubject: f.memberSubject }]) {
    const execute = (toolName: "polynet_list" | "polynet_read", path: string) => executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject: actor.authSubject })), ...actor, principalKind: "external_mcp",
      evidenceSurface: "external_mcp", toolName, input: { path } });
    const list = await execute("polynet_list", "/communities/canonical-community/capabilities/");
    const read = await execute("polynet_read", admissionApprovalPath.replace(".approve.", `.${operation}.`));
    const permitted = actor.userId !== f.memberId;
    expect(JSON.stringify(list).includes(`community.admission.${operation}`)).toBe(permitted);
    expect(read.ok).toBe(permitted);
  }
  const before = await f.snapshot();
  const personalAgent = { ctx: executionContext(t.withIdentity({ subject: f.ownerSubject })), userId: f.ownerId,
    authSubject: f.ownerSubject, principalKind: "community_agent_for_member" as const, evidenceSurface: "member_agent_dock" as const };
  const inventory = await executePolynetCanonicalTool({ ...personalAgent, toolName: "polynet_list",
    input: { path: "/communities/canonical-community/capabilities/" } });
  expect(inventory.ok).toBe(true);
  expect(JSON.stringify(inventory).includes(`community.admission.${operation}`)).toBe(false);
  expect(await executePolynetCanonicalTool({ ...personalAgent, toolName: "polynet_call", input: f.input }))
    .toMatchObject({ ok: false, code: "operation_not_found" });
  expect(await f.snapshot()).toEqual(before);
});

test.each(["owner", "admin"])("denial by %s preserves one cooldown and has no activation effects", async role => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, "deny");
  const before = await f.snapshot();
  const actor = role === "owner" ? undefined : f.admin;
  const result = await f.call(f.input, actor);
  expect(result).toMatchObject({ ok: true, value: { operation: "community.admission.deny", deduped: false,
    result: { status: "denied", request_ref: `join-request:${f.row._id}` } } });
  const denied = await f.snapshot();
  expect(denied.request).toMatchObject({ status: "denied", createdAt: f.row.createdAt });
  expect(denied.request!.reapplyAt! - denied.request!.deniedAt!).toBe(COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS);
  expect(denied.audit).toHaveLength(1); expect(denied.audit[0].eventType).toBe("community_join_request_denied");
  expect(denied.receipts).toHaveLength(1); expect(denied.receipts[0].status).toBe("completed");
  for (const key of ["memberships", "email", "activity", "scheduled", "timers"] as const)
    expect(denied[key]).toEqual(before[key]);
  expect(await f.call(f.input, actor)).toMatchObject({ ok: true, value: { deduped: true,
    result: (result as any).value.result } });
  expect(await f.snapshot()).toEqual(denied);
  expect(await f.call({ ...f.input, idempotency_key: "new-key" }, actor)).toMatchObject({ ok: false });
  expect(await f.call(f.input, role === "owner" ? f.admin : { userId: f.ownerId, authSubject: f.ownerSubject })).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(denied);
});

test.each(["approve", "deny"])("%s and opposite operation cannot share an idempotency key", async operation => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, operation);
  expect(await f.call()).toMatchObject({ ok: true });
  const before = await f.snapshot(); const opposite = operation === "deny" ? "approve" : "deny";
  expect(await f.call({ ...f.input, operation: `community.admission.${opposite}`,
    target: admissionApprovalPath.replace(".approve.", `.${opposite}.`) })).toMatchObject({ ok: false, code: "idempotency_key_conflict" });
  expect(await f.snapshot()).toEqual(before);
});

test.each([-1, 0, 1])("public reapplication at expiry %s ms preserves attempt and historical-retry boundaries", async offset => {
  // Advance the actual public domain clock; never shorten the seven-day policy.
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
  const t = convexTest(schema, modules); const f = await approvalFixture(t, "deny");
  await t.run(async ctx => {
    await ctx.db.patch(f.row.userId, { handle: "applicant", normalizedHandle: "applicant" });
    await ctx.db.insert("userProfileDetails", { userId: f.row.userId, displayName: "Applicant",
      avatarUrl: "https://example.com/avatar.png", onboardingCompletedAt: 1, createdAt: 1, updatedAt: 1 });
    for (const d of PLATFORM_LEGAL_DOCUMENTS) await ctx.db.insert("legalAcceptances", {
      userId: f.row.userId, documentKey: d.key, documentVersion: d.version, acceptedAt: 1, source: "test", createdAt: 1 });
  });
  const applicant = t.withIdentity({ subject: "applicant-0" });
  const join = () => applicant.mutation(api.communityPublic.joinPublicCommunityBySlug, { communitySlug: "canonical-community" });
  const original = await f.call(); expect(original).toMatchObject({ ok: true });
  const denied = await f.snapshot(); const expiry = denied.request!.reapplyAt!;
  const access = await applicant.query(api.communityAccessQueries.getMyCommunityAccessBySlug, { communitySlug: "canonical-community" });
  expect(access).toMatchObject({ can_enter_community: false, join_request_status: "denied",
    join_request_reapply_at: new Date(expiry).toISOString() });
  vi.setSystemTime(expiry - 1);
  for (let i = 0; i < 2; i++) expect(await join()).toMatchObject({ outcome: "approval_denied", reapply_at: new Date(expiry).toISOString() });
  expect(await applicant.mutation(api.communityPublic.cancelMyJoinRequestBySlug, { communitySlug: "canonical-community" }))
    .toMatchObject({ outcome: "ignored", status: "denied" });
  expect(await f.snapshot()).toEqual(denied);
  vi.setSystemTime(expiry + offset);
  // Time passing alone cannot reopen a request or grant access.
  expect(await f.snapshot()).toEqual(denied);
  expect(await join()).toMatchObject({ outcome: offset < 0 ? "approval_denied" : "approval_pending" });
  if (offset < 0) { expect(await f.snapshot()).toEqual(denied); return; }
  const reopened = await f.snapshot();
  expect(reopened.request).toMatchObject({ _id: f.row._id, status: "pending", createdAt: expiry + offset, updatedAt: expiry + offset });
  expect(reopened.request!.deniedAt).toBeUndefined(); expect(reopened.request!.reapplyAt).toBeUndefined();
  expect(await f.call()).toMatchObject({ ok: true, value: { deduped: true, result: (original as any).value.result } });
  for (const operation of ["approve", "deny"]) expect(await f.call({ ...f.input,
    operation: `community.admission.${operation}`, target: admissionApprovalPath.replace(".approve.", `.${operation}.`),
    idempotency_key: `stale-${operation}` })).toMatchObject({ ok: false });
  expect(await f.snapshot()).toEqual(reopened);
  expect(await join()).toMatchObject({ outcome: "approval_pending" });
  const fresh = { ...f.input, idempotency_key: "second-attempt", input: { ...f.input.input,
    expected_created_at: new Date(reopened.request!.createdAt).toISOString(),
    expected_updated_at: new Date(reopened.request!.updatedAt).toISOString() } };
  expect(await f.call(fresh)).toMatchObject({ ok: true, value: { deduped: false, result: { status: "denied" } } });
  const second = await f.snapshot(); expect(second.audit).toHaveLength(2);
  expect(new Set(second.audit.map(x => x.eventKey)).size).toBe(2);
  expect(second.request!.reapplyAt).toBe(expiry + offset + COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS);
  expect(second.memberships).toHaveLength(0); expect(second.email).toEqual(denied.email);
  expect(second.activity).toEqual(denied.activity); expect(second.timers).toEqual(denied.timers);
});

test.each(["same-key", "different-key", "external-approve", "first-party-approve", "first-party-deny", "cancel"])("concurrent denial versus %s preserves one outcome", async mode => {
  const t = convexTest(schema, modules); const f = await approvalFixture(t, "deny");
  const owner = t.withIdentity({ subject: f.ownerSubject });
  const competitor = mode === "same-key" ? () => f.call() : mode === "different-key" ? () => f.call({ ...f.input, idempotency_key: "other" }) :
    mode === "external-approve" ? () => f.call({ ...f.input, operation: "community.admission.approve", target: admissionApprovalPath, idempotency_key: "approve" }) :
    mode === "first-party-approve" ? () => owner.mutation(api.communityAdmin.approveCommunityJoinRequest, { requestId: f.row._id }) :
    mode === "first-party-deny" ? () => owner.mutation(api.communityAdmin.denyCommunityJoinRequest, { requestId: f.row._id }) :
    () => t.withIdentity({ subject: "applicant-0" }).mutation(api.communityPublic.cancelMyJoinRequestBySlug, { communitySlug: "canonical-community" });
  const results = await Promise.allSettled([f.call(), competitor()]); const state = await f.snapshot();
  expect(state.audit.length).toBeLessThanOrEqual(1); expect(state.receipts.length).toBeLessThanOrEqual(1);
  if (state.request?.status === "denied") {
    expect(state.memberships).toHaveLength(0); expect(state.email).toHaveLength(0); expect(state.activity).toHaveLength(0);
    expect(state.request.reapplyAt! - state.request.deniedAt!).toBe(COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS);
  } else {
    expect(state.request).toBeNull(); expect(state.memberships.length).toBeLessThanOrEqual(1);
    expect(state.email.length).toBeLessThanOrEqual(1); expect(state.activity.length).toBeLessThanOrEqual(1);
  }
  if (mode === "same-key") expect(results.every(r => r.status === "fulfilled" && (r.value as any).ok)).toBe(true);
});

// Real source -> trace -> deterministic digest -> governed synthetic decision.
// This fixture exercises current compiler/citation owners without model inference.
async function memoryConsumptionFixture() {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const source = await t.run(async ctx => {
    const now = Date.now(), text = "Synthetic amber protocol: verify the canonical receipt before retrying.";
    const rootId = await ctx.db.insert("communityInteractionRoots", { communityId:f.communityId, channelId:f.generalChannelId,
      actorType:"human",actorUserId:f.memberId,kind:"discussion",status:"live",visibilityScope:"community",contentSummary:text,
      replyCount:0,reactionSummary:[],idempotencyKey:"memory-source",createdAt:now,updatedAt:now });
    const blockId = await ctx.db.insert("communityInteractionContentBlocks", {communityId:f.communityId,rootId,blockOrder:0,
      blockType:"markdown_text",text,createdAt:now,updatedAt:now});
    const trace = await recordTrustedCommunitySourceTraceCore({ctx,communityId:f.communityId,channelId:f.generalChannelId,
      sourceType:"interaction",sourceId:`interaction:root:${rootId}`,title:"Synthetic amber protocol",summary:text,
      visibilityScope:"community",sourceVisibility:"community",actorType:"member",actorUserId:f.memberId,nowMs:now});
    return {rootId,blockId,traceId:trace.id};
  });
  const digest = await t.mutation(internal.communityCompilerDigest.runCommunityCompilerDigestPassInternal,{communityId:f.communityId});
  if (!("items" in digest)) throw new Error("expected deterministic digest");
  expect(digest.items).toHaveLength(1);
  await t.run(ctx => settleCommunityIntelligenceFromDigestItemsCore({ctx,communityId:f.communityId,digestId:digest.id,
    decisions:[{workKey:digest.items[0].workKey!,disposition:"retain",nodeType:"insight",title:"Synthetic amber protocol",
      bodyMd:"Verify the canonical receipt before retrying.",appliesWhen:null,doesNotApplyWhen:null,confidence:0.8,
      existingNodeId:null,reason:"Synthetic deterministic consumption fixture."}],actorType:"compiler",actorAgentKey:"synthetic_test_compiler"}));
  const node = (await t.run(ctx=>ctx.db.query("communityIntelligenceNodes").first()))!;
  expect(node).toMatchObject({status:"promising",tags:expect.arrayContaining(["compiler_memory"]),evidencePolicyVersion:"citation_v1"});
  expect(node.evidenceCitationIds).toHaveLength(1);
  const memberCtx=executionContext(t.withIdentity({subject:f.memberSubject}));
  const execute=(toolName:any,input:Record<string,unknown>,overrides={})=>executePolynetCanonicalTool({ctx:memberCtx,
    authSubject:f.memberSubject,userId:f.memberId,principalKind:"external_mcp",evidenceSurface:"external_mcp",toolName,input,...overrides});
  const read=()=>execute("polynet_read",{path:`/communities/canonical-community/memory/${node._id}.md`});
  const search=()=>execute("polynet_search",{path:"/communities/canonical-community/memory/",query:"amber"});
  const consumed=await read();expect(consumed).toMatchObject({ok:true,value:{ref:`memory:${node._id}`}});
  const retrievalId=(consumed as any).value.retrieval_id;
  const input={operation:"community.memory.record_outcome",version:1,
    target:"/communities/canonical-community/capabilities/community.memory.record_outcome.json",
    input:{node_id:String(node._id),retrieval_log_id:retrievalId,result_status:"worked",notes:"Synthetic observation."},idempotency_key:"memory-consumption-1"};
  const call=(value:Record<string,unknown>=input,overrides={})=>execute("polynet_call",value,overrides);
  const snapshot=()=>t.run(async ctx=>({outcomes:await ctx.db.query("communityOutcomeObservations").collect(),
    changes:await ctx.db.query("communityIntelligenceChangeRequests").collect(),receipts:await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    logs:await ctx.db.query("communityIntelligenceRetrievalLogs").collect()}));
  return {...f,t,...source,node,memberCtx,execute,search,read,call,input,retrievalId,snapshot};
}

test("memory consumption returns one citation-backed node and distinct actor-owned search/read receipts",async()=>{
  const f=await memoryConsumptionFixture();const searched:any=await f.search();expect(searched).toMatchObject({ok:true,value:{results:[{id:String(f.node._id)}]}});
  const s=await f.snapshot();const search=s.logs.find(x=>String(x._id)===searched.value.retrieval_id)!;
  const read=s.logs.find(x=>String(x._id)===f.retrievalId)!;
  expect(search).toMatchObject({userId:f.memberId,surface:"external_mcp",retrievedNodeIds:[f.node._id],injectedNodeIds:[]});
  expect(read).toMatchObject({userId:f.memberId,surface:"external_mcp",retrievedNodeIds:[f.node._id],injectedNodeIds:[f.node._id]});
  expect(search._id).not.toBe(read._id);
});

test.each(["foreign-actor","foreign-community","surface","version","search-only","unreturned","corrupt"])(
  "memory outcome %s refusal is a canonical error without a successful receipt",async mode=>{
    const f=await memoryConsumptionFixture();let retrievalId=f.retrievalId;
    if(mode==="search-only") retrievalId=((await f.search()) as any).value.retrieval_id;
    await f.t.run(async ctx=>{
      const id=ctx.db.normalizeId("communityIntelligenceRetrievalLogs",retrievalId)!;
      if(mode==="foreign-actor") await ctx.db.patch(id,{userId:f.ownerId});
      if(mode==="foreign-community") await ctx.db.patch(id,{communityId:f.otherCommunityId});
      if(mode==="surface") await ctx.db.patch(id,{surface:"member_agent_dock"});
      if(mode==="version") await ctx.db.patch(id,{receiptVersion:undefined});
      if(mode==="unreturned") await ctx.db.patch(id,{retrievedNodeIds:[],injectedNodeIds:[]});
      if(mode==="corrupt") {const orphan=await ctx.db.insert("communityOutcomeObservations",{communityId:f.communityId,nodeId:f.node._id,
        resultStatus:"worked",evidenceStrength:"observed",observedByActorType:"member",observedByUserId:f.memberId,
        observedAt:Date.now(),createdAt:Date.now(),updatedAt:Date.now()});await ctx.db.delete(orphan);await ctx.db.patch(id,{outcomeObservationIds:[orphan]});}
    });
    const codes={"foreign-actor":"community_intelligence_retrieval_log_forbidden","foreign-community":"community_intelligence_retrieval_log_not_found",
      surface:"community_intelligence_retrieval_receipt_surface_mismatch",version:"community_intelligence_retrieval_receipt_version_required",
      "search-only":"community_intelligence_retrieval_node_not_injected",unreturned:"community_intelligence_retrieval_node_not_injected",corrupt:"community_memory_outcome_receipt_corrupt"};
    expect(await f.call({...f.input,input:{...f.input.input,retrieval_log_id:retrievalId}})).toMatchObject({ok:false,code:codes[mode as keyof typeof codes]});
    const s=await f.snapshot();expect(s.outcomes).toHaveLength(0);expect(s.changes.filter(x=>x.operation==="attach_outcome")).toHaveLength(0);
    expect(s.receipts).toMatchObject([{status:"failed",lastErrorCode:codes[mode as keyof typeof codes]}]);
  });

test.each([null,{},[],{ok:true},{ok:false},{ok:true,outcome_observation_id:"x",outcome:{id:"different"},deduplicated:false}].map(result=>({result})))(
  "memory malformed acknowledgment $result never completes success",async ({result})=>{
    const f=await memoryConsumptionFixture();const ctx={...f.memberCtx,runMutation:(ref:any,args:any)=>
      getFunctionName(ref)===getFunctionName(internal.communityIntelligenceDirectory.recordCommunityOutcomeObservationInternal)?Promise.resolve(result):f.memberCtx.runMutation(ref,args)};
    expect(await f.call(f.input,{ctx})).toMatchObject({ok:false,code:(result as any)?.ok===false?"community_memory_outcome_failed":"community_memory_outcome_acknowledgment_invalid"});
    const s=await f.snapshot();expect(s.outcomes).toHaveLength(0);expect(s.receipts[0].status).toBe("failed");
  });

test.each(["refusal","malformed"])("memory cached %s is rejected without rewriting history",async mode=>{
  const f=await memoryConsumptionFixture();expect(await f.call()).toMatchObject({ok:true});
  await f.t.run(async ctx=>{const r=(await ctx.db.query("polynetCanonicalOperationReceipts").first())!;
    await ctx.db.patch(r._id,{result:{ok:true,operation:"community.memory.record_outcome",result:mode==="refusal"?
      {ok:false,reason_code:"community_intelligence_retrieval_log_forbidden",message:"Historical refusal."}:{ok:true}}});});
  const before=await f.snapshot();expect(await f.call()).toMatchObject({ok:false,code:mode==="refusal"?
    "community_intelligence_retrieval_log_forbidden":"community_memory_outcome_acknowledgment_invalid"});
  expect(await f.snapshot()).toEqual(before);
});

test("memory same-episode retries and conflicting reports preserve one observation and pending request",async()=>{
  const f=await memoryConsumptionFixture();const first:any=await f.call();expect(first).toMatchObject({ok:true,value:{deduped:false}});
  const before=await f.snapshot();expect(before.outcomes).toHaveLength(1);expect(before.changes.filter(x=>x.operation==="attach_outcome")).toMatchObject([{status:"pending_decision"}]);
  expect(await f.call()).toMatchObject({ok:true,value:{deduped:true,result:{outcome_observation_id:first.value.result.outcome_observation_id}}});
  expect(await f.snapshot()).toEqual(before);
  expect(await f.call({...f.input,input:{...f.input.input,notes:"changed"}})).toMatchObject({ok:false,code:"idempotency_key_conflict"});
  expect(await f.call({...f.input,idempotency_key:"same-episode-new-key"})).toMatchObject({ok:true,value:{deduped:true}});
  expect(await f.call({...f.input,idempotency_key:"conflicting-episode-new-key",input:{...f.input.input,result_status:"failed"}})).toMatchObject({ok:false,code:"community_memory_outcome_conflict"});
  const after=await f.snapshot();expect(after.outcomes).toEqual(before.outcomes);expect(after.changes).toEqual(before.changes);
  expect(await f.t.run(ctx=>ctx.db.get(f.node._id))).toEqual(f.node);
});

test.each([true,false])("memory concurrent reports preserve one episode (same key=%s)",async sameKey=>{
  const f=await memoryConsumptionFixture();const results=await Promise.all([f.call(),f.call({...f.input,idempotency_key:sameKey?f.input.idempotency_key:"parallel-new-key"})]);
  expect(results.some(x=>x.ok)).toBe(true);for(const r of results)if(!r.ok)expect(r.code).toBe("operation_in_progress");
  expect(await f.call()).toMatchObject({ok:true,value:{deduped:true}});const s=await f.snapshot();
  expect(s.outcomes).toHaveLength(1);expect(s.changes.filter(x=>x.operation==="attach_outcome")).toHaveLength(1);
});

test.each(["revoked","archived","funding"])("memory current %s authority denies completed replay",async mode=>{
  const f=await memoryConsumptionFixture();expect(await f.call()).toMatchObject({ok:true});
  await f.t.run(async ctx=>{
    if(mode==="revoked"){const m=await ctx.db.query("communityMemberships").withIndex("by_community_user",q=>q.eq("communityId",f.communityId).eq("userId",f.memberId)).unique();await ctx.db.patch(m!._id,{active:false});}
    if(mode==="archived")await ctx.db.patch(f.communityId,{lifecycleStatus:"archived"});
    if(mode==="funding"){await ctx.db.patch(f.communityId,{builderAccessMode:"subscription_required"});}
  });const before=await f.snapshot();
  if(mode==="archived")await expect(f.call()).rejects.toThrow("community_archived");
  else expect(await f.call()).toMatchObject({ok:false,code:"semantic_not_found"});
  expect(await f.snapshot()).toEqual(before);
});

test("citation-backed memory outcome recovers uncertain receipt completion without repeating its domain effect",async()=>{
  const f=await memoryConsumptionFixture();
  await recoverCanonicalOperationAfterReceiptCompletionCrash(f.t,{healthyCtx:f.memberCtx,authSubject:f.memberSubject,userId:f.memberId,
    principalKind:"external_mcp",evidenceSurface:"external_mcp",toolName:"polynet_call",input:f.input,idempotencyKey:f.input.idempotency_key,
    expectedErrorCode:"polynet_call_failed",assertDomainEffect:async()=>{const s=await f.snapshot();expect(s.outcomes).toHaveLength(1);
      expect(s.changes.filter(x=>x.operation==="attach_outcome")).toHaveLength(1);}});
  const s=await f.snapshot();expect(s.outcomes).toHaveLength(1);expect(s.changes.filter(x=>x.operation==="attach_outcome")).toHaveLength(1);
});

test.each(["draft","admin","private","foreign","revoked-source","superseded-citation"])(
  "memory %s is not consumed through member or founder external context",async mode=>{
    const f=await memoryConsumptionFixture();await f.t.run(async ctx=>{
      if(mode==="draft")await ctx.db.patch(f.node._id,{status:"draft"});
      if(mode==="admin"||mode==="private")await ctx.db.patch(f.node._id,{visibilityScope:mode});
      if(mode==="foreign")await ctx.db.patch(f.node._id,{communityId:f.otherCommunityId});
      if(mode==="revoked-source")await ctx.db.patch(f.rootId,{status:"hidden"});
      if(mode==="superseded-citation")await ctx.db.patch(f.blockId,{text:"Materially changed source.",updatedAt:Date.now()+100});
    });
    for(const who of [{}, {ctx:executionContext(f.t.withIdentity({subject:f.ownerSubject})),authSubject:f.ownerSubject,userId:f.ownerId}]){
      expect(await f.execute("polynet_read",{path:`/communities/canonical-community/memory/${f.node._id}.md`},who)).toMatchObject({ok:false});
      expect(await f.execute("polynet_search",{path:"/communities/canonical-community/memory/",query:"amber"},who)).toMatchObject({ok:true,value:{results:[]}});
    }
    const s=await f.snapshot();expect(s.logs.filter(x=>x.injectedNodeIds.includes(f.node._id))).toHaveLength(1); // Only the earlier authorized control read.
  });

test("lesson fields staged by the builder reach member list and read on every surface", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);
  const lessonBody = [
    "Draw.io holds the visual outputs.",
    "",
    "### In Cowork",
    "",
    "```",
    "https://mcp.draw.io/mcp",
    "```",
    "",
    "### In Claude Code",
    "",
    "```bash",
    "claude mcp add --transport http drawio https://mcp.draw.io/mcp",
    "```",
    "",
    "## Slides",
    "",
    "![Slide 1: why](media/x/01.png)",
    "",
    "First note.",
  ].join("\n");

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
        summary: "Add the first checkpoint lesson.",
        operations: [
          { op: "create_module", module_key: "map", name: "Map the business", module_status: "live" },
          {
            op: "create_page",
            module_key: "map",
            title: "Set up Draw.io",
            body_md: lessonBody,
            lesson: {
              kind: "build",
              stage: "Map the business",
              stage_order: 1,
              order: 1,
              minutes: 10,
              video_url: "https://share.descript.com/embed/42pEyvI1VyH",
              gate: "yes",
              summary: "A map first.",
            },
          },
        ],
      },
      idempotency_key: "lesson-stage-1",
    },
  });
  expect(stage.ok).toBe(true);
  const changesetId = String(stage.ok ? (stage.value.ref ?? "") : "");
  await expect(
    asOwner.mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
      communityId: fixture.communityId,
      changesetId: changesetId as any,
    }),
  ).resolves.toMatchObject({ ok: true, status: "applied" });

  const page = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("communityResources")
      .withIndex("by_community", (q) => q.eq("communityId", fixture.communityId))
      .collect();
    const row = rows.find((resource) => resource.title === "Set up Draw.io")!;
    // Publishing stays a human decision in Studio; the changeset leaves a draft.
    expect(row.status).toBe("draft");
    await ctx.db.patch(row._id, { status: "published" });
    return row;
  });
  expect(page.lesson).toEqual({
    kind: "build",
    stage: "Map the business",
    stage_order: 1,
    order: 1,
    minutes: 10,
    video_url: "https://share.descript.com/embed/42pEyvI1VyH",
    gate: true,
    summary: "A map first.",
  });

  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const surfaces = [
    { principalKind: "external_mcp" as const },
    { principalKind: "community_app" as const, mountedCommunityId: fixture.communityId },
  ];
  for (const surface of surfaces) {
    const run = (toolName: "polynet_list" | "polynet_read", path: string) =>
      executePolynetCanonicalTool({
        ctx: executionContext(asMember),
        authSubject: fixture.memberSubject,
        userId: fixture.memberId,
        evidenceSurface: "external_mcp",
        ...surface,
        toolName,
        input: { path },
      });
    const courses = await run("polynet_list", "/communities/canonical-community/resources/");
    expect(courses.ok).toBe(true);
    const course = (courses.ok ? (courses.value.entries as any[]) : []).find(
      (entry) => entry.name === "Map the business",
    );
    expect(course).toBeTruthy();
    const lessons = await run("polynet_list", course.path);
    const entry = (lessons.ok ? (lessons.value.entries as any[]) : [])[0];
    expect(entry).toMatchObject({
      kind: "document",
      name: "Set up Draw.io",
      lesson: { kind: "build", stage: "Map the business", gate: true, order: 1 },
    });
    const read = await run("polynet_read", entry.path);
    expect(read).toMatchObject({
      ok: true,
      value: {
        body: lessonBody,
        lesson: {
          kind: "build",
          video_url: "https://share.descript.com/embed/42pEyvI1VyH",
          gate: true,
          intro_md: "Draw.io holds the visual outputs.",
          variants: [
            { key: "cowork", label: "Cowork" },
            { key: "claude_code", label: "Claude Code" },
          ],
          slides: [{ image: "media/x/01.png", alt: "Slide 1: why", note_md: "First note." }],
          commands: [
            { variant: "cowork", language: null, text: "https://mcp.draw.io/mcp" },
            {
              variant: "claude_code",
              language: "bash",
              text: "claude mcp add --transport http drawio https://mcp.draw.io/mcp",
            },
          ],
        },
      },
    });
  }

  // The canonical write drops null fields, so an empty object clears them.
  const clear = await executePolynetCanonicalTool({
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
        summary: "Clear the lesson fields.",
        operations: [
          {
            op: "edit_page",
            resource_id: String(page._id),
            expected_updated_at: (await t.run(async (ctx) => (await ctx.db.get(page._id))!.updatedAt)),
            lesson: {},
          },
        ],
      },
      idempotency_key: "lesson-clear-1",
    },
  });
  expect(clear.ok).toBe(true);
  await asOwner.mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
    communityId: fixture.communityId,
    changesetId: String(clear.ok ? clear.value.ref : "") as any,
  });
  expect((await t.run(async (ctx) => await ctx.db.get(page._id)))!.lesson).toBeUndefined();
});

test("invalid lesson fields are refused before a changeset is staged", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const staged = await executePolynetCanonicalTool({
    ctx: executionContext(asOwner),
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/builder/resources/",
      mode: "create",
      content: {
        summary: "Bad lesson.",
        operations: [
          { op: "create_module", module_key: "m", name: "M" },
          { op: "create_page", module_key: "m", title: "T", lesson: { video_url: "javascript:alert(1)" } },
        ],
      },
      idempotency_key: "lesson-bad-1",
    },
  });
  expect(staged.ok).toBe(false);
  const changesets = await t.run(async (ctx) => await ctx.db.query("communityResourceBuilderChangesets").collect());
  expect(changesets).toHaveLength(0);
});

test("members set their own lesson progress, gates lock later stages, and progress.json shows the workflow journey", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const pages = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId, createdByUserId: fixture.ownerId, status: "live",
      name: "Checkpoints", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = async (title: string, sortOrder: number, lesson: Record<string, unknown>) =>
      await ctx.db.insert("communityResources", {
        communityId: fixture.communityId, moduleId, createdByUserId: fixture.ownerId, type: "post",
        role: "page", status: "published", title, bodyMd: `${title} body`, bodyChars: title.length + 5,
        pinned: false, sortOrder, lesson: lesson as any,
        createdAt: now, updatedAt: now,
      });
    const intro = await page("What is a map", 1, { stage: "Map the business", stage_order: 1, order: 1 });
    const gate = await page("Lock your first target", 2, { stage: "Map the business", stage_order: 1, order: 2, gate: true, kind: "checkpoint" });
    const skill = await page("What is a skill", 3, { stage: "Your first skill", stage_order: 2, order: 1 });
    await ctx.db.insert("communityMemberWorkflows", {
      communityId: fixture.communityId,
      milestones: [
        { key: "map", name: "Map the business", instructions: "PRIVATE_BUILDER_NOTE", automations: [] },
        { key: "skill", name: "First skill", automations: [] },
      ],
      revision: 1, createdByUserId: fixture.ownerId, updatedByUserId: fixture.ownerId, createdAt: now, updatedAt: now,
    });
    return { intro: `resource:${intro}`, gate: `resource:${gate}`, skill: `resource:${skill}` };
  });

  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  for (const surface of [
    { principalKind: "community_app" as const, mountedCommunityId: fixture.communityId },
    { principalKind: "external_mcp" as const },
  ]) {
    const run = (toolName: "polynet_read" | "polynet_call" | "polynet_list", input: Record<string, unknown>) =>
      executePolynetCanonicalTool({
        ctx: executionContext(asMember), authSubject: fixture.memberSubject, userId: fixture.memberId,
        evidenceSurface: "external_mcp", ...surface, toolName, input,
      });
    const setProgress = (ref: string, status: string, key: string) =>
      run("polynet_call", {
        operation: "community.resource.progress.set", version: 1,
        target: "/communities/canonical-community/capabilities/community.resource.progress.set.json",
        input: { ref, status }, idempotency_key: `${surface.principalKind}-${key}`,
      });
    const progress = async () => {
      const read = await run("polynet_read", { path: "/communities/canonical-community/members/me/progress.json" });
      expect(read, JSON.stringify(read)).toMatchObject({ ok: true });
      return JSON.parse(String(read.ok ? read.value.body : "{}"));
    };

    const listing = await run("polynet_list", { path: "/communities/canonical-community/members/me/" });
    expect(JSON.stringify(listing)).toContain("/members/me/progress.json");

    let state = await progress();
    expect(state.stages).toEqual([
      { name: "Map the business", order: 1, lesson_count: 2, done_count: 0, locked: false, blocked_by: null },
      { name: "Your first skill", order: 2, lesson_count: 1, done_count: 0, locked: true, blocked_by: pages.gate },
    ]);
    expect(state.lessons.find((lesson: any) => lesson.ref === pages.skill)).toMatchObject({ status: "not_started", locked: true });
    expect(state.journey).toMatchObject({
      current_milestone_key: "map",
      current_milestone_name: "Map the business",
      milestones: [
        { key: "map", name: "Map the business", position: 1 },
        { key: "skill", name: "First skill", position: 2 },
      ],
    });
    expect(JSON.stringify(state)).not.toContain("PRIVATE_BUILDER_NOTE");

    await expect(setProgress(pages.skill, "done", "skill-early")).resolves.toMatchObject({ ok: false, code: "lesson_locked" });
    await expect(setProgress(pages.intro, "in_progress", "intro")).resolves.toMatchObject({ ok: true, value: { status: "in_progress" } });
    await expect(setProgress(pages.gate, "done", "gate")).resolves.toMatchObject({ ok: true, value: { status: "done" } });
    // Retrying the same status is harmless.
    await expect(setProgress(pages.gate, "done", "gate-again")).resolves.toMatchObject({ ok: true });

    state = await progress();
    expect(state.stages.map((stage: any) => [stage.name, stage.locked, stage.done_count])).toEqual([
      ["Map the business", false, 1],
      ["Your first skill", false, 0],
    ]);
    expect(state.lessons.find((lesson: any) => lesson.ref === pages.intro)).toMatchObject({ status: "in_progress", completed_at: null });
    expect(state.lessons.find((lesson: any) => lesson.ref === pages.gate).completed_at).toEqual(expect.any(String));
    await expect(setProgress(pages.skill, "done", "skill")).resolves.toMatchObject({ ok: true });

    // Reset for the next surface; not_started removes the row.
    for (const ref of [pages.intro, pages.gate, pages.skill]) {
      await expect(setProgress(ref, "not_started", `reset-${ref}`)).resolves.toMatchObject({ ok: true });
    }
    const rows = await t.run(async (ctx) => await ctx.db.query("communityResourceProgress").collect());
    expect(rows).toHaveLength(0);
  }

  // The community agent cannot mark progress for its sponsor, and bad input is refused.
  await expect(executePolynetCanonicalTool({
    ctx: executionContext(asMember), authSubject: fixture.memberSubject, userId: fixture.memberId,
    principalKind: "community_agent", evidenceSurface: "community_concierge", mountedCommunityId: fixture.communityId,
    toolName: "polynet_call",
    input: {
      operation: "community.resource.progress.set", version: 1,
      target: "/communities/canonical-community/capabilities/community.resource.progress.set.json",
      input: { ref: pages.intro, status: "done" }, idempotency_key: "agent-progress",
    },
  })).resolves.toMatchObject({ ok: false, code: "operation_not_found" });
  await expect(executePolynetCanonicalTool({
    ctx: executionContext(asMember), authSubject: fixture.memberSubject, userId: fixture.memberId,
    principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: "polynet_call",
    input: {
      operation: "community.resource.progress.set", version: 1,
      target: "/communities/canonical-community/capabilities/community.resource.progress.set.json",
      input: { ref: pages.intro, status: "finished" }, idempotency_key: "bad-progress",
    },
  })).resolves.toMatchObject({ ok: false, code: "invalid_tool_args" });
});

test("the web app reads lesson fields with resources and sets the member's own progress, gates included", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId, createdByUserId: fixture.ownerId, status: "live",
      name: "Checkpoints", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = async (title: string, sortOrder: number, lesson: Record<string, unknown>) =>
      await ctx.db.insert("communityResources", {
        communityId: fixture.communityId, moduleId, createdByUserId: fixture.ownerId, type: "post",
        role: "page", status: "published", title, bodyMd: `${title} body`, bodyChars: title.length + 5,
        pinned: false, sortOrder, lesson: lesson as any, createdAt: now, updatedAt: now,
      });
    return {
      gate: String(await page("Lock your first target", 1, { stage: "Map the business", stage_order: 1, order: 1, gate: true })),
      skill: String(await page("What is a skill", 2, { stage: "Your first skill", stage_order: 2, order: 1 })),
    };
  });
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const args = { authSubject: fixture.memberSubject, communityId: fixture.communityId };

  const listed = await asMember.query(api.communityResources.listCommunityResources, args);
  expect(listed.find((row: any) => row.id === ids.skill)?.lesson).toMatchObject({ stage: "Your first skill", order: 1 });

  const locked = await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...args, resourceId: ids.skill, status: "in_progress" });
  expect(locked).toMatchObject({ ok: false, code: "lesson_locked" });

  expect(await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...args, resourceId: ids.gate, status: "done" }))
    .toMatchObject({ ok: true, status: "done" });
  const state = await asMember.query(api.communityResourceProgress.getOwnResourceProgress, args);
  expect(state.stages.map((stage: any) => [stage.name, stage.locked, stage.done_count])).toEqual([
    ["Map the business", false, 1],
    ["Your first skill", false, 0],
  ]);
  expect(state.lessons.find((lesson: any) => lesson.ref === `resource:${ids.gate}`)).toMatchObject({ status: "done" });
  expect(await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...args, resourceId: ids.skill, status: "in_progress" }))
    .toMatchObject({ ok: true });
});

test("owners add a follow-on skill track that opens after a checkpoint, and members read every track", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId, createdByUserId: fixture.ownerId, status: "live",
      name: "Core", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = async (title: string, sortOrder: number, lesson: Record<string, unknown> | null) =>
      String(await ctx.db.insert("communityResources", {
        communityId: fixture.communityId, moduleId, createdByUserId: fixture.ownerId, type: "post",
        role: "page", status: "published", title, bodyMd: `${title} body`, bodyChars: title.length + 5,
        pinned: false, sortOrder, ...(lesson ? { lesson: lesson as any } : {}), createdAt: now, updatedAt: now,
      }));
    return {
      gate: await page("Connect & onboard", 1, { stage: "Get set up", stage_order: 1, order: 1, gate: true }),
      later: await page("Map the business", 2, { stage: "Map", stage_order: 2, order: 1 }),
      content: await page("Content basics", 3, null),
    };
  });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const owner = { authSubject: fixture.ownerSubject, communityId: fixture.communityId };
  await expect(asOwner.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
    ...owner, key: "content", expectedRevision: 0, title: "Content Employee", opensWhen: [{ type: "after_checkpoint", resource_id: ids.gate }],
    stages: [{ name: "Start", steps: [{ resource_id: ids.content }] }],
  })).resolves.toEqual({ key: "content", revision: 1 });
  await expect(asOwner.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
    ...owner, key: "content", expectedRevision: 0, title: "Again", opensWhen: [], stages: [{ name: "S", steps: [{ resource_id: ids.content }] }],
  })).rejects.toThrow(/track_revision_conflict/);
  await expect(asOwner.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
    ...owner, key: "main", expectedRevision: 0, title: "Build your AI Employee", opensWhen: [], stages: [],
  })).resolves.toEqual({ key: "main", revision: 1 });
  const builder = await asOwner.query(api.communityLessonTracks.listCommunityLessonTracks, owner);
  expect(builder.tracks.map((track: any) => [track.key, track.title, track.derived, track.revision])).toEqual([
    ["main", "Build your AI Employee", true, 1],
    ["content", "Content Employee", false, 1],
  ]);

  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const member = { authSubject: fixture.memberSubject, communityId: fixture.communityId };
  expect(await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...member, resourceId: ids.content, status: "in_progress" }))
    .toMatchObject({ ok: false, code: "lesson_locked" });
  const before = await asMember.query(api.communityResourceProgress.getOwnResourceProgress, member);
  expect(before.tracks.map((track: any) => [track.key, track.status, track.opens_reason])).toEqual([
    ["main", "open", null],
    ["content", "locked", 'Opens when you finish "Connect & onboard"'],
  ]);
  expect(await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...member, resourceId: ids.gate, status: "done" }))
    .toMatchObject({ ok: true });
  const after = await asMember.query(api.communityResourceProgress.getOwnResourceProgress, member);
  expect(after.tracks.map((track: any) => [track.key, track.status])).toEqual([["main", "in_progress"], ["content", "open"]]);
  expect(after.stages.map((stage: any) => [stage.name, stage.locked])).toEqual([["Get set up", false], ["Map", false]]);
  expect(await asMember.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, { ...member, resourceId: ids.content, status: "done" }))
    .toMatchObject({ ok: true });
  await expect(asMember.query(api.communityLessonTracks.listCommunityLessonTracks, member)).rejects.toThrow();
  // Finishing a track's last step is what the Workflow trigger "When they finish a track" reads.
  expect(await t.run(async (ctx) => await communityTracksFinishedByLesson(ctx, fixture.communityId, fixture.memberId, ids.content)))
    .toEqual([{ key: "content", title: "Content Employee" }]);
  expect(await t.run(async (ctx) => await communityTracksFinishedByLesson(ctx, fixture.communityId, fixture.memberId, ids.gate))).toEqual([]);
});

test("members answer lesson buttons, checklists and quizzes, and owners see course completion", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const body = [
    "Follow along.",
    "```button installed required",
    "I installed Claude Code",
    "```",
    "```checklist setup",
    "- [ ] Open the terminal",
    "- [ ] Run claude {#run}",
    "```",
    "```quiz pick-tool required",
    "Which app runs on your own computer?",
    "- [ ] Claude in the browser",
    "- [x] Claude Code",
    "> Claude Code runs locally, so it can read your files.",
    "```",
  ].join("\n");
  const pages = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId, createdByUserId: fixture.ownerId, status: "live",
      name: "Get set up", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = async (title: string, sortOrder: number, bodyMd: string) =>
      await ctx.db.insert("communityResources", {
        communityId: fixture.communityId, moduleId, createdByUserId: fixture.ownerId, type: "post",
        role: "page", status: "published", title, bodyMd, bodyChars: bodyMd.length,
        pinned: false, sortOrder, lesson: { kind: "build" } as any, createdAt: now, updatedAt: now,
      });
    const install = await page("Install Claude Code", 1, body);
    const next = await page("Say hello", 2, "Say hello to Claude.");
    return { course: `module:${moduleId}`, install: `resource:${install}`, next: `resource:${next}` };
  });

  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const run = (toolName: "polynet_read" | "polynet_call", input: Record<string, unknown>) =>
    executePolynetCanonicalTool({
      ctx: executionContext(asMember), authSubject: fixture.memberSubject, userId: fixture.memberId,
      principalKind: "community_app", mountedCommunityId: fixture.communityId,
      evidenceSurface: "external_mcp", toolName, input,
    });
  let key = 0;
  const callOp = (operation: string, input: Record<string, unknown>) => run("polynet_call", {
    operation, version: 1, target: `/communities/canonical-community/capabilities/${operation}.json`,
    input, idempotency_key: `answer-${key++}`,
  });
  const answer = (element: string, value: unknown) =>
    callOp("community.resource.response.set", { ref: pages.install, element, value });

  // Members see the elements, never the quiz answer.
  const courses = await run("polynet_list" as any, { path: "/communities/canonical-community/resources/" });
  const course = ((courses as any).value.entries as any[]).find((entry) => entry.name === "Get set up");
  const lessonsListing = await run("polynet_list" as any, { path: course.path });
  const entry = ((lessonsListing as any).value.entries as any[]).find((item) => item.name === "Install Claude Code");
  const read = await run("polynet_read", { path: entry.path });
  expect(read, JSON.stringify(read)).toMatchObject({ ok: true });
  const elements = (read as any).value.lesson.elements;
  expect(elements).toEqual([
    { id: "installed", type: "button", required: true, prompt: "", label: "I installed Claude Code", action: "confirm" },
    { id: "setup", type: "checklist", required: false, prompt: "",
      choices: [{ id: "open-the-terminal", label: "Open the terminal" }, { id: "run", label: "Run claude" }] },
    { id: "pick-tool", type: "quiz", required: true, prompt: "Which app runs on your own computer?", multiple: false,
      choices: [{ id: "claude-in-the-browser", label: "Claude in the browser" }, { id: "claude-code", label: "Claude Code" }] },
  ]);
  expect(JSON.stringify(read)).not.toContain("runs locally");
  expect((read as any).value.lesson.commands).toEqual([]);

  await expect(callOp("community.resource.progress.set", { ref: pages.install, status: "done" }))
    .resolves.toMatchObject({ ok: false, code: "lesson_elements_incomplete" });
  await expect(answer("installed", true)).resolves.toMatchObject({
    ok: true, value: { response: { value: true, complete: true }, required_remaining: ["pick-tool"] } });
  await expect(answer("setup", ["run"])).resolves.toMatchObject({ ok: true, value: { response: { complete: false } } });
  await expect(answer("setup", ["nope"])).resolves.toMatchObject({ ok: false, code: "invalid_response" });
  await expect(answer("missing", true)).resolves.toMatchObject({ ok: false, code: "element_unavailable" });
  await expect(answer("pick-tool", ["claude-in-the-browser", "claude-code"])).resolves.toMatchObject({ ok: false, code: "invalid_response" });
  // A wrong answer shows the explanation but not the answer; the right one shows both.
  await expect(answer("pick-tool", ["claude-in-the-browser"])).resolves.toMatchObject({ ok: true, value: {
    response: { correct: false, complete: false, answer: null, explanation_md: "Claude Code runs locally, so it can read your files." },
    required_remaining: ["pick-tool"] } });
  await expect(answer("pick-tool", ["claude-code"])).resolves.toMatchObject({ ok: true, value: {
    response: { correct: true, complete: true, answer: ["claude-code"] }, required_remaining: [] } });
  await expect(callOp("community.resource.progress.set", { ref: pages.install, status: "done" }))
    .resolves.toMatchObject({ ok: true, value: { status: "done" } });

  const mine = await run("polynet_read", { path: "/communities/canonical-community/members/me/progress.json" });
  const state = JSON.parse(String((mine as any).value.body));
  expect(state.courses).toEqual([{ ref: pages.course, name: "Get set up", lesson_count: 2, done_count: 1, percent: 50, completed_at: null }]);
  expect(state.lessons.find((lesson: any) => lesson.ref === pages.install).responses.map((row: any) => [row.element, row.value, row.correct]))
    .toEqual([["installed", true, null], ["setup", ["run"], null], ["pick-tool", ["claude-code"], true]]);

  // Owners see each member's completion; members cannot.
  const asOwner = (toolName: "polynet_list" | "polynet_read", path: string, subject = fixture.ownerSubject, userId: any = fixture.ownerId) =>
    executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName, input: { path },
    });
  const builder = await asOwner("polynet_list", "/communities/canonical-community/builder/");
  expect(JSON.stringify(builder)).toContain("/builder/progress/");
  const report = await asOwner("polynet_list", "/communities/canonical-community/builder/progress/");
  expect(report, JSON.stringify(report)).toMatchObject({ ok: true, value: {
    courses: [{ ref: pages.course, name: "Get set up", lesson_count: 2 }] } });
  const row = ((report as any).value.entries as any[]).find((entry) => entry.user_id === String(fixture.memberId));
  expect(row).toMatchObject({
    name: "canonical-member", lessons_done: 1, quizzes: { answered: 1, correct: 1 },
    courses: [{ ref: pages.course, lesson_count: 2, done_count: 1, percent: 50, completed_at: null }],
  });
  const detail = await asOwner("polynet_read", row.path);
  expect(detail, JSON.stringify(detail)).toMatchObject({ ok: true });
  const detailState = JSON.parse(String((detail as any).value.body));
  expect(detailState).toMatchObject({ kind: "community_member_progress_report", name: "canonical-member" });
  expect(detailState.lessons.find((lesson: any) => lesson.ref === pages.install).status).toBe("done");
  const dossier = await asOwner("polynet_read", `/communities/canonical-community/builder/workflow-members/${row.membership_id}.md`);
  expect(dossier, JSON.stringify(dossier)).toMatchObject({ ok: true });
  expect(String((dossier as any).value.body)).toContain("- Get set up: 1 of 2 lessons (50%)");

  // The web app's resource list hides quiz answers from members, not owners.
  const memberRows = await asMember.query(api.communityResources.listCommunityResources, { communityId: fixture.communityId });
  const memberLesson = memberRows.find((resource: any) => resource.title === "Install Claude Code")!;
  expect(memberLesson.body_md).not.toContain("runs locally");
  expect(memberLesson.body_md).not.toContain("[x]");
  expect(memberLesson.lesson_elements).toEqual(elements);
  const ownerRows = await t.withIdentity({ subject: fixture.ownerSubject })
    .query(api.communityResources.listCommunityResources, { communityId: fixture.communityId });
  expect(ownerRows.find((resource: any) => resource.title === "Install Claude Code")!.body_md).toContain("- [x] Claude Code");

  // The web app reads and writes the same state through public functions.
  const web = await asMember.query(api.communityResourceProgress.getOwnResourceProgress, { communityId: fixture.communityId });
  expect(web.courses[0]).toMatchObject({ done_count: 1, percent: 50 });
  await expect(asMember.mutation(api.communityResourceProgress.setOwnLessonResponse, {
    communityId: fixture.communityId, resourceId: pages.install.slice("resource:".length), element: "setup", value: null,
  })).resolves.toMatchObject({ ok: true, response: null });
  await expect(asMember.query(api.communityResourceProgress.listCommunityProgressReport, { communityId: fixture.communityId }))
    .rejects.toThrow();
  const ownerReport = await t.withIdentity({ subject: fixture.ownerSubject })
    .query(api.communityResourceProgress.listCommunityProgressReport, { communityId: fixture.communityId });
  expect(ownerReport.members.find((member: any) => member.user_id === String(fixture.memberId))).toMatchObject({ lessons_done: 1 });
  await expect(t.withIdentity({ subject: fixture.ownerSubject }).query(api.communityResourceProgress.getMemberProgressReport, {
    communityId: fixture.communityId, membershipId: row.membership_id,
  })).resolves.toMatchObject({ kind: "community_member_progress_report" });

  await expect(asOwner("polynet_list", "/communities/canonical-community/builder/progress/", fixture.memberSubject, fixture.memberId))
    .resolves.toMatchObject({ ok: false });
  await expect(asOwner("polynet_read", row.path, fixture.memberSubject, fixture.memberId))
    .resolves.toMatchObject({ ok: false });
});

test("a staged lesson body with a broken quiz is refused before the changeset is stored", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const result = await executePolynetCanonicalTool({
    ctx: executionContext(asOwner), authSubject: fixture.ownerSubject, userId: fixture.ownerId,
    principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: "polynet_write",
    input: {
      path: "/communities/canonical-community/builder/resources/",
      mode: "create",
      content: {
        summary: "Quiz with no right answer.",
        operations: [
          { op: "create_module", module_key: "m", name: "M" },
          { op: "create_page", module_key: "m", title: "Quiz", lesson: { kind: "lesson" },
            body_md: "```quiz q1\nWhich?\n- [ ] A\n- [ ] B\n```" },
        ],
      },
      idempotency_key: "lesson-bad-quiz",
    },
  });
  expect(result.ok).toBe(false);
  const changesets = await t.run(async (ctx) => await ctx.db.query("communityResourceBuilderChangesets").collect());
  expect(changesets).toHaveLength(0);
});

test("owners and their external agent read clients and set their own client properties; members and the community agent cannot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const membership = await t.run(async (ctx) => (await ctx.db.query("communityMemberships")
    .withIndex("by_community_user", (q) => q.eq("communityId", fixture.communityId).eq("userId", fixture.memberId)).unique())!);
  const as = (principalKind: any, subject: string, userId: any) => {
    let key = 0;
    const run = (toolName: "polynet_list" | "polynet_read" | "polynet_call", input: Record<string, unknown>) =>
      executePolynetCanonicalTool({
        ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
        principalKind, evidenceSurface: "external_mcp", toolName, input,
      });
    const callOp = (operation: string, input: Record<string, unknown>) => run("polynet_call", {
      operation, version: 1, target: `/communities/canonical-community/capabilities/${operation}.json`,
      input, idempotency_key: `clients-${principalKind}-${key++}`,
    });
    return { run, callOp };
  };
  const owner = as("external_mcp", fixture.ownerSubject, fixture.ownerId);

  const builder = await owner.run("polynet_list", { path: "/communities/canonical-community/builder/" });
  expect(JSON.stringify(builder)).toContain("/builder/clients/");
  await expect(owner.callOp("community.client.property.define", { name: "Tier", type: "select", options: ["VIP", "Standard"] }))
    .resolves.toMatchObject({ ok: true, value: { property: { key: "tier", type: "select" } } });
  await expect(owner.callOp("community.client.value.set", { membership_ref: `membership:${membership._id}`, key: "tier", value: "Gold" }))
    .resolves.toMatchObject({ ok: false, code: "client_property_value_invalid" });
  await expect(owner.callOp("community.client.value.set", { membership_ref: `membership:${membership._id}`, key: "tier", value: "VIP" }))
    .resolves.toMatchObject({ ok: true, value: { key: "tier", value: "VIP" } });

  await expect(owner.callOp("community.client.settings.set", { stuck_days: 3 }))
    .resolves.toMatchObject({ ok: true, value: { stuck_days: 3 } });
  const clients = await owner.run("polynet_list", { path: "/communities/canonical-community/builder/clients/" });
  expect(clients, JSON.stringify(clients)).toMatchObject({ ok: true, value: { stuck_days: 3, properties: [{ key: "tier" }] } });
  const row = ((clients as any).value.entries as any[]).find((entry) => entry.user_id === String(fixture.memberId));
  expect(row).toMatchObject({ name: "canonical-member", status: "active", ref: `membership:${membership._id}`,
    properties: { tier: "VIP" } });
  expect(row.dossier_path).toContain(`/builder/workflow-members/${membership._id}.md`);
  await expect(owner.callOp("community.client.event.record", { membership_ref: `membership:${membership._id}`, type: "flagged", body: "No lesson in 9 days" }))
    .resolves.toMatchObject({ ok: true, value: { type: "flagged" } });
  // A retry with the same key answers from the first call: no second event, no rewrite, no name conflict.
  const retry = (operation: string, input: Record<string, unknown>) => owner.run("polynet_call", {
    operation, version: 1, target: `/communities/canonical-community/capabilities/${operation}.json`, input, idempotency_key: `retry-${operation}` });
  const contacted = { membership_ref: `membership:${membership._id}`, type: "contacted", body: "Sent a check-in" };
  await expect(retry("community.client.event.record", contacted)).resolves.toMatchObject({ ok: true, value: { type: "contacted", deduped: false } });
  await expect(retry("community.client.event.record", contacted)).resolves.toMatchObject({ ok: true, value: { type: "contacted", deduped: true } });
  await expect(retry("community.client.event.record", { ...contacted, body: "Something else" })).resolves.toMatchObject({ ok: false, code: "idempotency_key_conflict" });
  const defineScore = { name: "Score", type: "number" };
  await expect(retry("community.client.property.define", defineScore)).resolves.toMatchObject({ ok: true, value: { property: { key: "score" } } });
  await expect(retry("community.client.property.define", defineScore)).resolves.toMatchObject({ ok: true, value: { property: { key: "score" }, deduped: true } });
  expect((await t.run(async (ctx) => await ctx.db.query("communityClientEvents").collect())).filter((event: any) => event.type === "contacted")).toHaveLength(1);
  // The change and its receipt commit together: a receipt that can't complete undoes the change.
  await expect(t.mutation((internal as any).communityClients.recordClientEventInternal, { communityId: fixture.communityId, userId: fixture.ownerId,
    membershipId: String(membership._id), type: "contacted", body: "Second try", via: "agent", receipt: { value: {}, attempt: { communityId: fixture.communityId,
      userId: fixture.ownerId, principalKind: "external_mcp", toolName: "polynet_call", idempotencyKey: "community-client:never-reserved",
      requestFingerprint: "none", attemptToken: "none" } } })).rejects.toThrow("polynet_operation_receipt_reservation_missing");
  expect((await t.run(async (ctx) => await ctx.db.query("communityClientEvents").collect())).filter((event: any) => event.type === "contacted")).toHaveLength(1);
  const timeline = await owner.run("polynet_read", { path: row.path });
  expect(timeline, JSON.stringify(timeline)).toMatchObject({ ok: true });
  const events = JSON.parse(String((timeline as any).value.body)).entries.map((entry: any) => [entry.type, entry.actor ?? null]);
  expect(events).toEqual(expect.arrayContaining([["flagged", "agent"], ["property_set", "agent"], ["joined", null]]));
  const stored = await t.run(async (ctx) => await ctx.db.query("communityClientValues").collect());
  expect(stored).toMatchObject([{ propertyKey: "tier", value: "VIP", updatedVia: "agent" }]);

  // Views: the agent reads one view's members, saves its own, and only proposes removals and bulk changes.
  expect((clients as any).value.views.map((view: any) => view.key)).toContain("stuck");
  expect((clients as any).value.fields.some((field: any) => field.key === "prop:tier")).toBe(true);
  await expect(owner.callOp("community.client.view.save", { view: { name: "VIPs", columns: ["status", "prop:tier"],
    filters: [{ field: "prop:tier", op: "is", value: ["VIP"] }] } })).resolves.toMatchObject({ ok: true, value: { result: { view: { key: "vips" } } } });
  const vips = await owner.run("polynet_list", { path: "/communities/canonical-community/builder/clients/views/vips/" });
  expect(vips, JSON.stringify(vips)).toMatchObject({ ok: true });
  expect((vips as any).value.entries.map((entry: any) => entry.ref)).toEqual([`membership:${membership._id}`]);
  await expect(owner.run("polynet_list", { path: "/communities/canonical-community/builder/clients/views/nope/" }))
    .resolves.toMatchObject({ ok: false, code: "client_view_not_found" });
  await expect(owner.callOp("community.client.property.define", { key: "tier", archive: true })).resolves.toMatchObject({ ok: false, code: "invalid_tool_args" });
  await expect(owner.callOp("community.client.bulk", { action: { type: "message", body: "Hi {first_name}" }, membership_ids: [String(membership._id)] }))
    .resolves.toMatchObject({ ok: true, value: { review: "owner_apply", kind: "community_setting_change_proposed" } });
  expect(await t.run(async (ctx) => await ctx.db.query("communityClientBulkActions").collect())).toEqual([]);

  // Members and the community-owned agent get neither the list nor the operations.
  const member = as("external_mcp", fixture.memberSubject, fixture.memberId);
  await expect(member.run("polynet_list", { path: "/communities/canonical-community/builder/clients/" }))
    .resolves.toMatchObject({ ok: false });
  await expect(member.callOp("community.client.value.set", { membership_ref: `membership:${membership._id}`, key: "tier", value: "Standard" }))
    .resolves.toMatchObject({ ok: false });
  const communityAgent = as("community_agent", fixture.ownerSubject, fixture.ownerId);
  await expect(communityAgent.run("polynet_list", { path: "/communities/canonical-community/builder/clients/" }))
    .resolves.toMatchObject({ ok: false });
  await expect(member.run("polynet_read", { path: row.path })).resolves.toMatchObject({ ok: false });
  await expect(communityAgent.run("polynet_read", { path: row.path })).resolves.toMatchObject({ ok: false });
});

test("polynet push stages a courses folder through the MCP tools, and a second push after Apply changes nothing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  // The CLI's MCP client, replaced by the executor the MCP runs.
  const call = async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(asOwner), authSubject: fixture.ownerSubject, userId: fixture.ownerId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result.value;
  };
  const community = "canonical-community";
  const folder = (welcome: string, lesson: Record<string, unknown>) => resolveCourses([{
    key: "01-start-here", folder: "01-start-here", name: "Start here", description: "Begin with the map.", status: "live",
    lessons: [
      { path: "01-start-here/01-welcome.md", title: "Welcome", lesson, source_md: welcome },
      { path: "01-start-here/02-map.md", title: "Map the business", lesson: { kind: "build", stage: "Map", order: 2 },
        source_md: "```polynet-embed\nsrc: embeds/xray/business-map.html\nheight: 900\n```" },
    ],
  }], "https://canonical-community.polynet.page");
  const apply = async (changesetId: string) =>
    await asOwner.mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
      communityId: fixture.communityId, changesetId: changesetId as any,
    });

  const first = await planContentPush({ community, courses: folder("Hello ![Slide](../media/a.png)", { stage: "Map", order: 1 }), call });
  expect(first.changesets).toHaveLength(1);
  expect(first.changesets[0].operations.map((op: any) => op.op)).toEqual(["create_module", "create_page", "create_page"]);
  const staged = await stageChangeset({ community, changeset: first.changesets[0], call });
  expect(staged).toMatchObject({ ok: true, deduped: false });
  // Running push again before Apply finds the same changeset, not a second one.
  const again = await planContentPush({ community, courses: folder("Hello ![Slide](../media/a.png)", { stage: "Map", order: 1 }), call });
  expect(await stageChangeset({ community, changeset: again.changesets[0], call })).toMatchObject({ ok: true, ref: staged.ref, deduped: true });
  await apply(staged.ref);

  const pages = await t.run(async (ctx) => await ctx.db.query("communityResources").collect());
  const body = async (resourceId: any) => await t.run(async (ctx) =>
    (await ctx.db.query("communityResourceContents").collect()).find((row: any) => row.resourceId === resourceId)?.bodyMd);
  const welcome = pages.find((row: any) => row.title === "Welcome")!;
  expect(welcome).toMatchObject({ status: "draft", lesson: { stage: "Map", order: 1 } });
  expect(await body(welcome._id)).toBe("Hello ![Slide](https://canonical-community.polynet.page/media/a.png)");
  expect(await body(pages.find((row: any) => row.title === "Map the business")!._id)).toContain("src: embeds/xray/business-map.html");
  expect((await planContentPush({ community, courses: folder("Hello ![Slide](../media/a.png)", { stage: "Map", order: 1 }), call })).changesets).toEqual([]);

  // An edited lesson becomes one edit_page with only what changed.
  const edited = await planContentPush({ community, courses: folder("Hello again", { stage: "Map", order: 1, minutes: 5 }), call });
  expect(edited.changesets).toHaveLength(1);
  expect(edited.changesets[0].operations).toEqual([
    { op: "edit_page", resource_id: String(welcome._id), expected_updated_at: welcome.updatedAt, body_md: "Hello again", lesson: { stage: "Map", order: 1, minutes: 5 } },
  ]);
  await apply((await stageChangeset({ community, changeset: edited.changesets[0], call })).ref);
  expect((await t.run(async (ctx) => await ctx.db.get(welcome._id)))).toMatchObject({ lesson: { minutes: 5 } });
  expect(await body(welcome._id)).toBe("Hello again");
  expect((await planContentPush({ community, courses: folder("Hello again", { stage: "Map", order: 1, minutes: 5 }), call })).changesets).toEqual([]);
});

test("builder/resources/ pages through every resource with the cursor it returns", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let i = 0; i < 60; i += 1) {
      await ctx.db.insert("communityResources", {
        communityId: fixture.communityId, createdByUserId: fixture.ownerId, type: "post", role: "page",
        status: "draft", title: `Lesson ${i}`, pinned: false, sortOrder: i, createdAt: now, updatedAt: now,
      });
    }
  });
  const list = async (cursor?: string) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject: fixture.ownerSubject })), authSubject: fixture.ownerSubject,
      userId: fixture.ownerId, principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: "polynet_list",
      input: { path: "/communities/canonical-community/builder/resources/", limit: 50, ...(cursor ? { cursor } : {}) },
    });
    if (!result.ok) throw new Error(result.message);
    return result.value as any;
  };
  const first = await list();
  expect(first).toMatchObject({ truncated: true, next_cursor: "builder-resources:50" });
  const second = await list(first.next_cursor);
  expect(second).toMatchObject({ truncated: false, next_cursor: null });
  const titles = [...first.entries, ...second.entries].filter((row: any) => row.resource_role === "page").map((row: any) => row.title);
  expect(new Set(titles).size).toBe(60);
});

test("a founder's agent drafts and publishes the community theme through the MCP, and members never see a draft", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const published = async () => await t.query(api.communityThemes.getPublishedCommunityTheme, { communityId: fixture.communityId });

  const start = await readTheme({ community, call: owner });
  expect(start).toMatchObject({ contract: 1, draft_revision: 0, published: null, has_unpublished_changes: false });
  const stopwatch = { version: 1, schemes: { dark: { background: "#0B0B0B", surface: "#151515", text: "#F2F2EF", muted: "#9C9C96",
    border: "#2B2B2B", accent: "#3FD15A", on_accent: "#0B0B0B", button: "#3FD15A", on_button: "#0B0B0B" } }, heading_case: "upper" };

  const saved = await saveThemeDraft({ community, theme: stopwatch, expectedRevision: 0, call: owner });
  expect(saved).toMatchObject({ draft_revision: 1, published: null, has_unpublished_changes: true });
  expect(saved.draft.heading_case).toBe("upper");
  expect(await published()).toBeNull();

  // Saving the same theme again is not a new revision.
  expect(await saveThemeDraft({ community, theme: stopwatch, expectedRevision: 1, call: owner })).toMatchObject({ draft_revision: 1 });
  // A stale folder can't overwrite a newer draft.
  await expect(saveThemeDraft({ community, theme: { ...stopwatch, heading_case: "none" }, expectedRevision: 0, call: owner }))
    .rejects.toThrow("theme_revision_conflict");
  // A theme that breaks the contract comes back with the problems to fix.
  const unreadable = { version: 1, schemes: { light: { ...stopwatch.schemes.dark, background: "#FFFFFF", surface: "#FFFFFF", text: "#EEEEEE" } } };
  const refusal = await saveThemeDraft({ community, theme: unreadable, expectedRevision: 1, call: owner }).catch((error: any) => error);
  expect(refusal.message).toContain("theme_invalid");
  expect(JSON.stringify(refusal.value)).toContain("schemes.light.text");

  expect(await publishTheme({ community, expectedRevision: 1, call: owner })).toMatchObject({ has_unpublished_changes: false });
  expect((await published())?.heading_case).toBe("upper");

  // Members can't read the builder theme or call the theme operations.
  await expect(readTheme({ community, call: member })).rejects.toThrow("semantic_not_found");
  await expect(publishTheme({ community, expectedRevision: 1, call: member })).rejects.toThrow();
  const listing = await member("polynet_list", { path: `/communities/${community}/capabilities/` });
  expect(JSON.stringify(listing)).not.toContain("community.theme");
  const ownerListing = await owner("polynet_list", { path: `/communities/${community}/capabilities/` });
  expect(JSON.stringify(ownerListing)).toContain("community.theme.save_draft");
});

test("the layout is its own design record over the MCP: publishing it never resets the theme", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);

  await saveThemeDraft({ community, theme: { version: 1, radius: 0 }, expectedRevision: 0, call: owner });
  await publishTheme({ community, expectedRevision: 1, call: owner });

  expect(await readDesignRecord({ community, kind: "layout", call: owner })).toMatchObject({ contract: 1, draft_revision: 0, published: null });
  const top = { version: 1, navigation: { position: "top" } };
  expect(await saveDesignDraft({ community, kind: "layout", record: top, expectedRevision: 0, call: owner }))
    .toMatchObject({ draft_revision: 1, published: null, has_unpublished_changes: true });
  const refusal = await saveDesignDraft({ community, kind: "layout", record: { version: 1, pages: { chat: { aside: ["leaderboard"] } } },
    expectedRevision: 1, call: owner }).catch((error: any) => error);
  expect(refusal.message).toContain("layout_invalid");
  await expect(saveDesignDraft({ community, kind: "layout", record: top, expectedRevision: 0, call: owner })).rejects.toThrow("layout_revision_conflict");
  // The record key must match the operation: a theme can't be sent to the layout.
  await expect(owner("polynet_call", { operation: "community.layout.save_draft", version: 1,
    target: `/communities/${community}/capabilities/community.layout.save_draft.json`,
    input: { theme: top, expected_draft_revision: 1 }, idempotency_key: "layout-wrong-key" })).rejects.toThrow("invalid_tool_args");

  expect(await publishDesignDraft({ community, kind: "layout", expectedRevision: 1, call: owner })).toMatchObject({ has_unpublished_changes: false });
  expect((await t.query(api.communityLayouts.getPublishedCommunityLayout, { communityId: fixture.communityId }) as any)?.navigation?.position).toBe("top");
  expect((await t.query(api.communityThemes.getPublishedCommunityTheme, { communityId: fixture.communityId }))?.radius).toBe(0);

  await expect(readDesignRecord({ community, kind: "layout", call: member })).rejects.toThrow("semantic_not_found");
  const listing = await member("polynet_list", { path: `/communities/${community}/capabilities/` });
  expect(JSON.stringify(listing)).not.toContain("community.layout");
  const builder = await owner("polynet_list", { path: `/communities/${community}/builder/` });
  expect(JSON.stringify(builder)).toContain("/builder/layout.json");

  // A top layout lets each member pick Classroom (top) or Channels (side) for themselves.
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const memberArgs = { authSubject: fixture.memberSubject, communityId: fixture.communityId };
  expect(await asMember.query(api.communityLayouts.getMyCommunityLayoutChoice, memberArgs))
    .toEqual({ allowed: ["top", "side"], position: null });
  expect(await asMember.mutation(api.communityLayouts.setMyCommunityLayoutChoice, { ...memberArgs, position: "side" }))
    .toEqual({ allowed: ["top", "side"], position: "side" });
  expect((await asMember.query(api.communityLayouts.getMyCommunityLayoutChoice, memberArgs)).position).toBe("side");
  expect((await asMember.mutation(api.communityLayouts.setMyCommunityLayoutChoice, { ...memberArgs, position: null })).position).toBeNull();
  // An owner who takes the choice away: members see the owner's layout, and can't pick.
  await asMember.mutation(api.communityLayouts.setMyCommunityLayoutChoice, { ...memberArgs, position: "side" });
  await saveDesignDraft({ community, kind: "layout", record: { version: 1, navigation: { position: "top", member_choice: [] } }, expectedRevision: 1, call: owner });
  await publishDesignDraft({ community, kind: "layout", expectedRevision: 2, call: owner });
  expect(await asMember.query(api.communityLayouts.getMyCommunityLayoutChoice, memberArgs)).toEqual({ allowed: [], position: null });
  await expect(asMember.mutation(api.communityLayouts.setMyCommunityLayoutChoice, { ...memberArgs, position: "side" }))
    .rejects.toThrow();
});

test("a long lesson goes up whole in sections, reads back section by section, and an oversized section is refused, never cut", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const call = async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(asOwner), authSubject: fixture.ownerSubject, userId: fixture.ownerId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result.value as any;
  };
  const community = "canonical-community";
  // About the size of a long real lesson (27.8k characters), in three sections.
  const part = (title: string) => `## ${title}\n\n${"Each asset has a score and an owner. ".repeat(250)}\n`;
  const long = ["Start by listing what you own.", part("Find your assets"), part("Score them"), part("Pick the first one")].join("\n\n").trim();
  expect(long.length).toBeGreaterThan(27_000);
  const courses = (body: string) => resolveCourses([{
    key: "01-start", folder: "01-start", name: "Start here", description: "", status: "live",
    lessons: [{ path: "01-start/01-assets.md", title: "Asset Explorer", lesson: { stage: "Map", order: 1 }, source_md: body }],
  }], "https://canonical-community.polynet.page");

  const plan = await planContentPush({ community, courses: courses(long), call });
  const staged = await stageChangeset({ community, changeset: plan.changesets[0], call });
  await asOwner.mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
    communityId: fixture.communityId, changesetId: staged.ref as any,
  });
  const page = (await t.run(async (ctx) => await ctx.db.query("communityResources").collect())).find((row: any) => row.title === "Asset Explorer")!;
  const stored = await t.run(async (ctx) =>
    (await ctx.db.query("communityResourceContents").collect()).find((row: any) => row.resourceId === page._id)?.bodyMd);
  expect(stored).toBe(long);

  // An agent sees the sections and reads one at a time by offset.
  await t.run(async (ctx) => { await ctx.db.patch(page._id, { status: "published" }); });
  const module = (await t.run(async (ctx) => await ctx.db.query("communityResourceModules").collect())).find((row: any) => row.name === "Start here")!;
  const path = `/communities/${community}/resources/start-here~${module._id}/asset-explorer~${page._id}.md`;
  const first = await call("polynet_read", { path });
  expect(first.sections.map((section: any) => section.heading)).toEqual([null, "Find your assets", "Score them", "Pick the first one"]);
  const third = first.sections[2];
  const section = await call("polynet_read", { path, offset: third.offset, limit: third.chars });
  expect(section.body.startsWith("## Score them")).toBe(true);

  // One section over 20,000 characters is refused whole, with what to do, and nothing is staged.
  const oversized = `${long}\n\n## Appendix\n\n${"x".repeat(20_500)}`;
  const refused = await planContentPush({ community, courses: courses(oversized), call })
    .then((next) => stageChangeset({ community, changeset: next.changesets[0], call }))
    .catch((error: Error) => error);
  expect(String(refused)).toContain('The section "Appendix" is');
  expect(String(refused)).toContain("Add a ## heading inside it");
  expect(await t.run(async (ctx) =>
    (await ctx.db.query("communityResourceContents").collect()).find((row: any) => row.resourceId === page._id)?.bodyMd)).toBe(long);
});

test("the community brand is a design record with no publish step, for managers only", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const read = (call: typeof owner) => readDesignRecord({ community, kind: "brand", call });
  const save = (brand: unknown, expected: number, key: string) => owner("polynet_call", { operation: "community.brand.save", version: 1,
    target: `/communities/${community}/capabilities/community.brand.save.json`,
    input: { brand, expected_draft_revision: expected }, idempotency_key: key });

  expect(await read(owner)).toMatchObject({ draft: { version: 1 }, draft_revision: 0 });
  const brand = { version: 1, words: ["calm", "premium", "practical"], colours: [{ hex: "#2b863a", role: "primary", note: "CLO green" }] };
  expect((await save(brand, 0, "brand-1")).result).toMatchObject({ draft_revision: 1, draft: { colours: [{ hex: "#2B863A" }] } });
  await expect(save({ version: 1, colour: "#2B863A" }, 1, "brand-2")).rejects.toThrow("brand_invalid");
  await expect(save(brand, 0, "brand-3")).rejects.toThrow("brand_revision_conflict");
  await expect(owner("polynet_call", { operation: "community.brand.publish", version: 1,
    target: `/communities/${community}/capabilities/community.brand.publish.json`,
    input: { expected_draft_revision: 1 }, idempotency_key: "brand-publish" })).rejects.toThrow();

  await expect(read(member)).rejects.toThrow("semantic_not_found");
  const builder = await owner("polynet_list", { path: `/communities/${community}/builder/` });
  expect(JSON.stringify(builder)).toContain("/builder/brand.json");
});

test("an owner's agent changes Settings through the MCP with the same saves the Settings page makes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const settings = async (call = owner) =>
    JSON.parse((await call("polynet_read", { path: `/communities/${community}/builder/settings.json` })).body);
  const change = (operation: string, input: Record<string, unknown>, call = owner) => call("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });

  const builder = await owner("polynet_list", { path: `/communities/${community}/builder/` });
  expect(JSON.stringify(builder)).toContain("/builder/settings.json");
  const capabilities = JSON.stringify(await owner("polynet_list", { path: `/communities/${community}/capabilities/` }));
  for (const operation of ["community.settings.save", "community.welcome.save", "community.form.save", "community.channel.create", "community.agent.save"])
    expect(capabilities).toContain(operation);
  const definition = await owner("polynet_read", { path: `/communities/${community}/capabilities/community.settings.save.json` });
  expect(definition.body).toContain("expected_settings_revision");

  const before = await settings();
  expect(before.contract).toBe("polynet.builder_settings.v1");
  const revision = before.general.settings_revision;
  // Only the fields sent change; the name and web address stay as they were.
  await change("community.settings.save", { expected_settings_revision: revision, one_liner: "Two hours a day, one business" });
  const after = await settings();
  expect(after.general).toMatchObject({ one_liner: "Two hours a day, one business", name: before.general.name, slug: before.general.slug });
  expect(after.general.settings_revision).toBeGreaterThan(revision);
  // Someone saved since: refused, like the page.
  await expect(change("community.settings.save", { expected_settings_revision: revision, one_liner: "stale" })).rejects.toThrow("setting_refused");
  // Price isn't one of this operation's fields, and identity can't be sent.
  await expect(change("community.settings.save", { expected_settings_revision: after.general.settings_revision, monthly_amount_base_units: 100 }))
    .rejects.toThrow("invalid_tool_args");
  await expect(change("community.settings.save", { expected_settings_revision: after.general.settings_revision, user_id: fixture.memberId }))
    .rejects.toThrow("invalid_tool_args");

  // The page's own checks still apply (this fixture's channels predate named channels).
  await expect(change("community.channel.create", { name: "wins" })).rejects.toThrow("setting_refused: community_channel_name_migration_required");

  await change("community.agent.save", { community_system_prompt: "Answer like a calm coach." });
  expect(JSON.stringify((await settings()).agent)).toContain("Answer like a calm coach.");

  // Members can't read Settings or change them.
  await expect(settings(member)).rejects.toThrow("semantic_not_found");
  await expect(change("community.channel.create", { name: "mine" }, member)).rejects.toThrow("operation_not_found");
  expect(JSON.stringify(await member("polynet_list", { path: `/communities/${community}/capabilities/` }))).not.toContain("community.settings.save");
});

test("an owner's agent reads and saves skill tracks through /builder/tracks.json and community.track.*", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const tracks = async (call = owner) => JSON.parse((await call("polynet_read", { path: `/communities/${community}/builder/tracks.json` })).body);
  const change = (operation: string, input: Record<string, unknown>) => owner("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });
  const lessonId = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: fixture.communityId, createdByUserId: fixture.ownerId, status: "live", name: "Core", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    return String(await ctx.db.insert("communityResources", {
      communityId: fixture.communityId, moduleId, createdByUserId: fixture.ownerId, type: "post", role: "page", status: "published",
      title: "Content basics", bodyMd: "body", bodyChars: 4, pinned: false, sortOrder: 1, createdAt: now, updatedAt: now,
    }));
  });

  expect(JSON.stringify(await owner("polynet_list", { path: `/communities/${community}/builder/` }))).toContain("/builder/tracks.json");
  const before = await tracks();
  expect(before).toMatchObject({ contract: "polynet.builder_tracks.v1", tracks: [] });
  expect(before.lessons).toEqual([{ id: lessonId, title: "Content basics", kind: null }]);
  await change("community.track.save", { key: "content", expected_revision: 0, title: "Content Employee", opens_when: [],
    stages: [{ name: "Start", steps: [{ resource_id: lessonId, checkpoint: true }] }] });
  expect((await tracks()).tracks).toMatchObject([{ key: "content", title: "Content Employee", revision: 1, stages: [{ name: "Start" }] }]);
  await expect(change("community.track.save", { key: "content", expected_revision: 1, title: "x", opens_when: [],
    stages: [{ name: "S", steps: [{ resource_id: "missing" }] }] })).rejects.toThrow("setting_refused");
  const archived = await change("community.track.archive", { key: "content", archived: true });
  expect(archived).toMatchObject({ kind: "community_setting_change_proposed", result: { status: "staged" } });
  expect((await tracks()).tracks).toHaveLength(1);
  await expect(tracks(member)).rejects.toThrow("semantic_not_found");
});

test("an owner's agent reads offers through /builder/offers.json and sets a private channel's offers", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const offers = async (call = owner) => JSON.parse((await call("polynet_read", { path: `/communities/${community}/builder/offers.json` })).body);
  const change = (operation: string, input: Record<string, unknown>) => owner("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  await asOwner.mutation(api.communityOffers.saveCommunityOffer, { authSubject: fixture.ownerSubject, communityId: fixture.communityId,
    name: "Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 } });
  const channelId = await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("communityChannels", { communityId: fixture.communityId, slug: "consulting-calls", name: "consulting-calls",
      accessMode: "restricted", postingPolicy: "members", status: "active", position: 99, createdAt: now, updatedAt: now });
  });

  expect(JSON.stringify(await owner("polynet_list", { path: `/communities/${community}/builder/` }))).toContain("/builder/offers.json");
  const before = await offers();
  expect(before).toMatchObject({ contract: "polynet.builder_offers.v1" });
  expect(before.offers.map((offer: any) => offer.name)).toEqual(["Membership", "Consulting"]);
  const consulting = before.offers.find((offer: any) => offer.name === "Consulting");
  await change("community.offer.channel_audience", { channel_id: String(channelId), offer_keys: [consulting.key] });
  expect((await offers()).channels).toEqual(expect.arrayContaining([expect.objectContaining({ id: String(channelId), offer_audience: [consulting.key] })]));
  // Prices and the ladder wait for the owner's Apply.
  const staged = await change("community.offer.save", { key: consulting.key, name: "Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 90000 } });
  expect(staged).toMatchObject({ kind: "community_setting_change_proposed", result: { status: "staged" } });
  expect(staged.result.details).toEqual(expect.arrayContaining([{ label: "Price", value: "$900.00 a month" }]));
  expect((await offers()).offers.find((offer: any) => offer.key === consulting.key).price).toMatchObject({ amount_base_units: 50000 });
  await expect(offers(member)).rejects.toThrow("semantic_not_found");
});

test("hard-to-undo Settings changes are only proposed by the agent and happen when the owner taps Apply", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const propose = (operation: string, input: Record<string, unknown>, call = owner) => call("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerScope = { authSubject: fixture.ownerSubject, communityId: fixture.communityId };
  const freeAccess = async () => (await t.run(async ctx => await ctx.db.get(fixture.communityId)) as any);

  const definition = await owner("polynet_read", { path: `/communities/${community}/capabilities/community.free_access.set.json` });
  expect(definition.body).toContain("owner_apply");

  const before = await freeAccess();
  const staged = await propose("community.free_access.set", { mode: "approval", note: "Too many spam joins this week" });
  expect(staged.result.details).toEqual([{ label: "Joining", value: "You approve each request" }]);
  expect(staged).toMatchObject({ kind: "community_setting_change_proposed", result: { status: "staged", summary: "Who can join for free",
    note: "Too many spam joins this week" } });
  // Proposing the same thing again is the same proposal.
  expect((await propose("community.free_access.set", { mode: "approval", note: "Too many spam joins this week" })).result.proposal_id)
    .toBe(staged.result.proposal_id);
  // Nothing changed yet.
  expect(await freeAccess()).toEqual(before);

  const list = await asOwner.query(api.communitySettingProposals.listCommunitySettingProposals, ownerScope);
  expect(list.pending.map((row: any) => row.proposal_id)).toEqual([staged.result.proposal_id]);
  // The agent sees it waiting too.
  const settings = JSON.parse((await owner("polynet_read", { path: `/communities/${community}/builder/settings.json` })).body);
  expect(settings.proposals.pending[0].operation).toBe("community.free_access.set");

  // A member can't apply it.
  await expect(t.withIdentity({ subject: fixture.memberSubject }).action(api.communitySettingProposals.applyCommunitySettingProposal,
    { authSubject: fixture.memberSubject, communityId: fixture.communityId, proposalId: staged.result.proposal_id })).rejects.toThrow();

  const applied = await asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { ...ownerScope, proposalId: staged.result.proposal_id });
  expect(applied).toMatchObject({ status: "applied", error: null });
  expect(await freeAccess()).not.toEqual(before);
  // Applying twice does nothing more.
  await expect(asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { ...ownerScope, proposalId: staged.result.proposal_id })).rejects.toThrow("setting_proposal_applied");

  // Rejected proposals never run.
  const archive = await propose("community.archive", {});
  expect(await asOwner.mutation(api.communitySettingProposals.rejectCommunitySettingProposal,
    { ...ownerScope, proposalId: archive.result.proposal_id })).toMatchObject({ status: "rejected" });
  await expect(asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { ...ownerScope, proposalId: archive.result.proposal_id })).rejects.toThrow("setting_proposal_rejected");

  // A refusal from the Settings function is recorded, not hidden.
  const bad = await propose("community.free_access.set", { mode: "everyone" });
  expect(await asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { ...ownerScope, proposalId: bad.result.proposal_id })).toMatchObject({ status: "failed", error: "community_free_access_mode_invalid" });

  // Proposals expire after a day.
  const late = await propose("community.free_access.set", { mode: "open" });
  await t.run(async ctx => { await ctx.db.patch(late.result.proposal_id, { expiresAt: Date.now() - 1 }); });
  await expect(asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { ...ownerScope, proposalId: late.result.proposal_id })).rejects.toThrow("setting_proposal_expired");
});

test("an owner's agent reads Run history at /builder/workflow-runs.json and members cannot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => executePolynetCanonicalTool({
    ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
    principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
  });
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const listing = await owner("polynet_list", { path: `/communities/${community}/builder/` });
  expect(JSON.stringify(listing)).toContain("/builder/workflow-runs.json");
  const read = await owner("polynet_read", { path: `/communities/${community}/builder/workflow-runs.json` });
  expect(read.ok).toBe(true);
  expect(JSON.parse((read as any).value.body)).toEqual({ runs: [], truncated: false });
  const member = caller(fixture.memberSubject, fixture.memberId);
  expect((await member("polynet_read", { path: `/communities/${community}/builder/workflow-runs.json` })).ok).toBe(false);
});

test("builder resource agents can set a course's lesson style", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);
  const stageCourse = (lessonStyle: unknown, key: string) => executePolynetCanonicalTool({
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
        summary: "Stage a video course.",
        operations: [
          { op: "create_module", module_key: key, name: `Course ${key}`, lesson_style: lessonStyle },
        ],
      },
      idempotency_key: `lesson-style-${key}`,
    },
  });

  const stage = await stageCourse("video", "video-course");
  expect(stage).toMatchObject({ ok: true });
  const changesetId = String(stage.ok ? (stage.value.ref ?? "") : "");
  await expect(
    asOwner.mutation(api.communityResources.applyCommunityResourceBuilderChangeset, {
      communityId: fixture.communityId,
      changesetId: changesetId as any,
    }),
  ).resolves.toMatchObject({ ok: true, status: "applied" });
  const rows = await t.run(async (ctx: any) =>
    await ctx.db
      .query("communityResourceModules")
      .withIndex("by_community", (q: any) => q.eq("communityId", fixture.communityId))
      .collect());
  expect(rows.find((row: any) => row.name === "Course video-course")?.lessonStyle).toBe("video");

  expect(await stageCourse("slides", "bad-style")).toMatchObject({ ok: false });
});

test("an owner's agent runs events, test runs and posts; a member's agent changes only that member's own choices", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any, principalKind: any = "external_mcp", evidenceSurface: any = "external_mcp") =>
    async (toolName: string, input: Record<string, unknown>) => {
      const result = await executePolynetCanonicalTool({
        ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
        principalKind, evidenceSurface, toolName: toolName as any, input,
        ...(principalKind === "community_agent" ? { mountedCommunityId: fixture.communityId } : {}),
      });
      if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
      return result.value as any;
    };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const change = (operation: string, input: Record<string, unknown>, call = owner) => call("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });
  const readJson = async (path: string, call = owner) => JSON.parse((await call("polynet_read", { path: `/communities/${community}${path}` })).body);

  // Events: created in the mounted community, changed, cancelled.
  const created = await change("community.event.save", { payload: { title: "Office hours", starts_at: "2030-01-07T15:00:00Z", timezone: "Europe/London" } });
  const eventId = created.result.id ?? created.result.event_id;
  expect(String(created.result.community_id)).toBe(String(fixture.communityId));
  await change("community.event.save", { event_id: eventId, payload: { title: "Office hours (live)" } });
  await change("community.event.cancel", { event_id: eventId });
  const events = await readJson("/builder/events.json");
  expect(JSON.stringify(events)).toContain("Office hours (live)");
  expect(JSON.stringify(events)).toContain("cancelled");
  await expect(change("community.event.save", { payload: { title: "Mine", starts_at: "2030-01-07T15:00:00Z", timezone: "Europe/London" } }, member))
    .rejects.toThrow("operation_not_found");
  await expect(readJson("/builder/events.json", member)).rejects.toThrow("semantic_not_found");

  // A test run, started and ended by the agent.
  const run = await change("community.test_member.start", {});
  expect((await readJson("/builder/test-runs.json")).test_members).toHaveLength(1);
  await change("community.test_member.end", { test_member_id: run.result.id });
  expect((await readJson("/builder/test-runs.json")).test_members).toHaveLength(0);

  // Removing someone's post is only proposed; the owner applies it in the app.
  const proposed = await change("community.post.remove", { target_type: "root", target_id: "nothing-yet" });
  expect(proposed).toMatchObject({ kind: "community_setting_change_proposed", review: "owner_apply" });

  // A member's own Display pick: their agent (online or their own MCP) sets it for them, nobody else's.
  const top = { version: 1, navigation: { position: "top" } };
  await saveDesignDraft({ community, kind: "layout", record: top, expectedRevision: 0, call: owner });
  await publishDesignDraft({ community, kind: "layout", expectedRevision: 1, call: owner });
  const memberArgs = { authSubject: fixture.memberSubject, communityId: fixture.communityId };
  const choice = async () => (await t.withIdentity({ subject: fixture.memberSubject }).query(api.communityLayouts.getMyCommunityLayoutChoice, memberArgs)).position;
  await change("member.display.layout.set", { position: "side" }, member);
  expect(await choice()).toBe("side");
  const onlineBuilder = caller(fixture.memberSubject, fixture.memberId, "community_agent", "community_concierge");
  await change("member.display.layout.set", { position: null }, onlineBuilder);
  expect(await choice()).toBeNull();
  // The owner's agent changes the owner's own pick, never the member's, and can't name a member.
  await change("member.display.layout.set", { position: "side" });
  expect(await choice()).toBeNull();
  await expect(change("member.display.layout.set", { position: "side", user_id: fixture.memberId })).rejects.toThrow("invalid_tool_args");

  // Light/Dark is on the account: the member's own agent sets it; the owner's agent sets only the owner's.
  const look = async (subject: string) => await t.withIdentity({ subject }).query(api.profiles.getMyDisplayPreferences, { authSubject: subject });
  expect(await look(fixture.memberSubject)).toEqual({ theme: null, look_everywhere: null });
  await change("member.display.theme.set", { theme: "light", look_everywhere: true }, onlineBuilder);
  expect(await look(fixture.memberSubject)).toEqual({ theme: "light", look_everywhere: true });
  await change("member.display.theme.set", { theme: "dark" });
  expect((await look(fixture.memberSubject)).theme).toBe("light");
  expect((await look(fixture.ownerSubject)).theme).toBe("dark");
});

test("an owner's agent builds Workflows through the MCP: a coloured stage, an email step and an Only if with an Otherwise", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw Object.assign(new Error(`${result.code}: ${result.message}`), { value: (result as any).value });
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const workflows = async () => JSON.parse((await owner("polynet_read", { path: `/communities/${community}/builder/settings.json` })).body).workflows;
  const change = (operation: string, input: Record<string, unknown>) => owner("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}` });

  const definition = await owner("polynet_read", { path: `/communities/${community}/capabilities/community.workflow.stage.update.json` });
  expect(definition.body).toContain("send_email");
  expect(definition.body).toContain("color");

  const revision = (await workflows())?.revision ?? 0;
  await change("community.workflow.stage.create", { expected_revision: revision, name: "Onboarding", color: "green" });
  const stage = (await workflows()).milestones.at(-1);
  expect(stage).toMatchObject({ name: "Onboarding", color: "green" });
  await change("community.workflow.stage.update", { expected_revision: revision + 1, milestone_key: stage.key, name: "Onboarding", color: "blue",
    automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 1440 }, action: { type: "send_email", subject: "Hi {first_name}", body: "Day one." } }] });
  const updated = (await workflows()).milestones.find((item: any) => item.key === stage.key);
  expect(updated).toMatchObject({ color: "blue", automations: [{ action: { type: "send_email", subject: "Hi {first_name}", body: "Day one." } }] });
  await expect(change("community.workflow.stage.update", { expected_revision: revision + 2, milestone_key: stage.key, name: "Onboarding", color: "neon",
    automations: [] })).rejects.toThrow("community_member_workflow_stage_color_invalid");

  // Only if with an AND group, and its Otherwise path.
  expect(definition.body).toContain("otherwise");
  expect(definition.body).toContain("client_property_changed");
  expect(definition.body).toContain("property_date");
  const first = updated.automations[0];
  const group = { propertyKey: "plan", op: "is", value: "Pro", match: "all", also: [{ propertyKey: "goal", op: "is_set" }] };
  const after = { type: "previous_action_completed", predecessorActionKey: first.action.key };
  await change("community.workflow.stage.update", { expected_revision: revision + 2, milestone_key: stage.key, name: "Onboarding",
    automations: [first,
      { condition: group, trigger: after, action: { type: "send_email", subject: "Pro", body: "For Pro." } },
      { condition: { ...group, otherwise: true }, trigger: after, action: { type: "send_email", subject: "Everyone else", body: "For the rest." } }] });
  const branched = (await workflows()).milestones.find((item: any) => item.key === stage.key);
  expect(branched.automations.map((rule: any) => rule.condition ?? null)).toEqual([null, group, { ...group, otherwise: true }]);
});

test("the design guide is a read-only builder document for managers over the MCP", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const caller = (subject: string, userId: any) => async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(t.withIdentity({ subject })), authSubject: subject, userId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result.value as any;
  };
  const owner = caller(fixture.ownerSubject, fixture.ownerId);
  const member = caller(fixture.memberSubject, fixture.memberId);
  const path = `/communities/${community}/builder/design-guide.md`;

  const guide = await owner("polynet_read", { path });
  expect(guide).toMatchObject({ truncated: false, writable: false });
  expect(guide.body).toContain("# UI design for Polynet communities");
  expect(guide.body).toContain("# Applying the craft inside the Polynet app");
  expect(guide.body).not.toMatch(/^---\nname:/);
  expect(JSON.stringify(await owner("polynet_list", { path: `/communities/${community}/builder/` }))).toContain("/builder/design-guide.md");
  await expect(member("polynet_read", { path })).rejects.toThrow("semantic_not_found");
  const review = await owner("polynet_read", { path: `/communities/${community}/builder/design-review.md` });
  expect(review.body).toContain("# The mistake ledger");
  expect(review.body).toContain("# The fresh-eyes review");
  for (const doc of [guide, review]) expect(doc.body.length).toBeLessThanOrEqual(24_000);
});

test("an agent's stage change goes live and shows in Recent changes with Undo, or waits for the owner when they ask", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const community = "canonical-community";
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const owner = async (toolName: string, input: Record<string, unknown>) => {
    const result = await executePolynetCanonicalTool({
      ctx: executionContext(asOwner), authSubject: fixture.ownerSubject, userId: fixture.ownerId,
      principalKind: "external_mcp", evidenceSurface: "external_mcp", toolName: toolName as any, input,
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result.value as any;
  };
  const change = (operation: string, input: Record<string, unknown>) => owner("polynet_call", { operation, version: 1,
    target: `/communities/${community}/capabilities/${operation}.json`, input, idempotency_key: `${operation}:${JSON.stringify(input)}:${Math.random()}` });
  const changes = async () => JSON.parse((await owner("polynet_read", { path: `/communities/${community}/builder/workflow-changes.json` })).body);
  const stage = async () => (await t.run(async (ctx) => (await ctx.db.query("communityMemberWorkflows").first())!)).milestones[0];
  const revision = async () => (await t.run(async (ctx) => (await ctx.db.query("communityMemberWorkflows").first())!)).revision;
  const created = await asOwner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    { communityId: fixture.communityId, expectedRevision: await revision().catch(() => 0), name: "Onboarding" });
  const key = created.milestone.key;
  const welcome = [{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "send_email", subject: "Welcome", body: "Hi {first_name}" } }];
  const update = async (automations: any[]) => change("community.workflow.stage.update", { expected_revision: await revision(),
    milestone_key: key, name: "Onboarding", automations, changed_by: "Claude Code" });

  // Apply right away (the default): live at once, listed with who made it, and undoable.
  expect(JSON.stringify(await owner("polynet_list", { path: `/communities/${community}/builder/` }))).toContain("/builder/workflow-changes.json");
  await update(welcome);
  expect((await stage()).automations).toHaveLength(1);
  const first = await changes();
  expect(first.agent_change_review).toBe("apply");
  expect(first.changes[0]).toMatchObject({ via: "agent", changed_by: "Claude Code", stage_name: "Onboarding", can_undo: true });
  await change("community.workflow.change.undo", { change_id: first.changes[0].change_id, changed_by: "Claude Code" });
  expect((await stage()).automations).toHaveLength(0);
  const undone = await changes();
  expect(undone.changes[0]).toMatchObject({ undo_of: first.changes[0].change_id, can_undo: true });
  expect(undone.changes[1].can_undo).toBe(false);

  // Only the owner sets the permission in the app; an agent can only propose it.
  expect(await change("community.workflow.agent_review.set", { review: "apply" })).toMatchObject({ kind: "community_setting_change_proposed" });
  await asOwner.mutation(api.communityWorkflowChanges.setBuilderWorkflowAgentChangeReview, { communityId: fixture.communityId, review: "ask" });

  // Always ask: the same call waits, and the owner's Apply puts it live.
  const held = await update(welcome);
  expect(held).toMatchObject({ kind: "community_setting_change_proposed", result: { status: "staged", proposed_by: "Claude Code" } });
  expect((await stage()).automations).toHaveLength(0);
  const stageProposals = async () => (await asOwner.query(api.communitySettingProposals.listCommunitySettingProposals, { communityId: fixture.communityId }))
    .pending.filter((row: any) => row.operation === "community.workflow.stage.propose");
  const waiting = { pending: await stageProposals() };
  expect(waiting.pending).toHaveLength(1);
  expect(waiting.pending[0]).toMatchObject({ summary: "Change the Onboarding stage", workflow: { milestone_key: key, stale: false } });
  expect((waiting.pending[0] as any).workflow.proposed.automations).toHaveLength(1);
  // Something else changed meanwhile (the revision moved on); this stage didn't, so Apply still works.
  await asOwner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: fixture.communityId, expectedRevision: await revision(), name: "Later" });
  expect(await asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { communityId: fixture.communityId, proposalId: waiting.pending[0].proposal_id as any })).toMatchObject({ status: "applied" });
  expect((await stage()).automations).toHaveLength(1);
  expect((await changes()).changes[0]).toMatchObject({ via: "agent", changed_by: "Claude Code", approved_by: expect.any(String) });

  // A suggestion for a stage that changed since can't be applied over the newer edit.
  await update([]);
  await asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: fixture.communityId,
    expectedRevision: await revision(), milestoneKey: key, name: "Onboarding (renamed)", automations: (await stage()).automations });
  const stale = (await stageProposals())[0];
  expect(stale).toMatchObject({ workflow: { stale: true } });
  await expect(asOwner.action(api.communitySettingProposals.applyCommunitySettingProposal,
    { communityId: fixture.communityId, proposalId: stale.proposal_id as any })).rejects.toThrow("setting_proposal_stale");
  expect((await stage()).name).toBe("Onboarding (renamed)");
  // A broken rule is refused when it's proposed, not when the owner taps Apply.
  await expect(update([{ trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: { type: "set_pod_member", channelId: "nope", active: true } }]))
    .rejects.toThrow("setting_refused");
});

test("site rails: the community agent gets no read state, presence, typing or member JSON; a member harness gets read state only", async () => {
  const t = convexTest(schema, modules);
  const f = await createFixture(t);
  const execute = (principalKind: "community_agent" | "external_mcp", toolName: "polynet_list" | "polynet_read" | "polynet_call", input: Record<string, unknown>) =>
    executePolynetCanonicalTool({ ctx: executionContext(t.withIdentity({ subject: f.memberSubject })), authSubject: f.memberSubject,
      userId: f.memberId, principalKind, evidenceSurface: principalKind === "external_mcp" ? "external_mcp" : "member_agent_dock", toolName, input });
  const community = "/communities/canonical-community";
  const callInput = (operation: string, input: Record<string, unknown>) =>
    ({ target: `${community}/capabilities/${operation}.json`, operation, version: 1, idempotencyKey: `${operation}-key`, input });

  const agentChannels = await execute("community_agent", "polynet_list", { path: `${community}/channels/` });
  if (!agentChannels.ok) throw new Error(agentChannels.code);
  for (const entry of agentChannels.value.entries as Array<Record<string, unknown>>) {
    expect(entry).not.toHaveProperty("unread");
    expect(entry).not.toHaveProperty("seen_through_at");
  }
  for (const path of [`${community}/presence.json`, `${community}/members/canonical-owner.json`]) {
    expect(await execute("community_agent", "polynet_read", { path })).toMatchObject({ ok: false, code: "semantic_not_found" });
  }
  for (const [operation, input] of [["community.channel.mark_read", { channel: "general" }], ["community.presence.heartbeat", {}],
    ["community.typing.set", { channel: "general", on: true }]] as const) {
    expect(await execute("community_agent", "polynet_call", callInput(operation, input))).toMatchObject({ ok: false, code: "operation_not_found" });
  }

  // A member's own harness sees and moves the member's read state, and can
  // read who is online, but cannot claim the member is present or typing.
  const memberChannels = await execute("external_mcp", "polynet_list", { path: `${community}/channels/` });
  if (!memberChannels.ok) throw new Error(memberChannels.code);
  expect((memberChannels.value.entries as Array<Record<string, unknown>>).find((entry) => entry.slug === "wins"))
    .toMatchObject({ unread: false, mentioned: false, latest_activity_at: null, seen_through_at: null });
  expect(await execute("external_mcp", "polynet_call", callInput("community.channel.mark_read", { channel: "wins" })))
    .toMatchObject({ ok: true, value: { channel: "wins", advanced: false } });
  expect(await execute("external_mcp", "polynet_read", { path: `${community}/presence.json` })).toMatchObject({ ok: true });
  for (const [operation, input] of [["community.presence.heartbeat", {}], ["community.typing.set", { channel: "general", on: true }]] as const) {
    expect(await execute("external_mcp", "polynet_call", callInput(operation, input))).toMatchObject({ ok: false, code: "operation_not_found" });
  }
  expect(await t.run((ctx) => ctx.db.query("communityPresence").collect())).toHaveLength(0);
});

test("a JSON document over the limit is shortened inside its longest text and still parses", () => {
  const payload = { title: "Long memory", body_md: "x".repeat(40_000), type: "memory" };
  const full = JSON.stringify(payload, null, 2);
  const body = fitJsonDocument(payload, full, 24_000);
  expect(body.length).toBeLessThanOrEqual(24_000);
  const parsed = JSON.parse(body);
  expect(parsed.title).toBe("Long memory");
  expect(parsed.type).toBe("memory");
  expect(parsed.body_md.endsWith("[…shortened]")).toBe(true);
  // Small documents are untouched.
  const small = JSON.stringify({ a: 1 }, null, 2);
  expect(fitJsonDocument({ a: 1 }, small, 24_000)).toBe(small);
});
