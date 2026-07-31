/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob([
  "./authActor.ts",
  "./authIdentity.ts",
  "./communityActivity.ts",
  "./communityAiFeed.ts",
  "./communityAiFeedEvidence.ts",
  "./communityCapabilityContext.ts",
  "./communityEvidenceAudit.ts",
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
  return await t.run(async (ctx) => {
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
      entryPolicy: "open",
      activeMemberCount: 1,
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
      otherCommunityId,
      ownerSubject: "canonical-owner-subject",
      memberSubject: "canonical-member-subject",
    };
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
    const aiFeedPostId = await ctx.db.insert("communityAiFeedPosts", {
      communityId: fixture.communityId,
      authorType: "agent",
      authorUserId: fixture.ownerId,
      agentKey: "community_agent",
      agentKind: "community_agent",
      authorLabel: "Polynet Agent",
      type: "observation",
      title: "Canonical repository search",
      body: "Canonical repository search proof from the AI Feed.",
      status: "live",
      score: 0.9,
      goodCount: 0,
      lowSignalCount: 0,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
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
      aiFeedPostId,
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
      | "community_concierge";
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
    ctx: ownerCtx,
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

  await expect(
    executePolynetCanonicalTool({
      ctx: ownerCtx,
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
  expect(results).toHaveLength(4);
  expect(results.map((result) => result.source_type).sort()).toEqual([
    "ai_feed",
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
      expect.stringMatching(
        /^\/communities\/canonical-community\/ai-feed\/ai_feed:/,
      ),
      expect.stringMatching(
        /^\/communities\/canonical-community\/resources\//,
      ),
      expect.stringMatching(
        /^\/communities\/canonical-community\/memory\//,
      ),
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
          expect.stringMatching(/^ai_feed:/),
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
    receipts: await ctx.db
      .query("polynetCanonicalOperationReceipts")
      .collect(),
  }));
  expect(rows.roots).toHaveLength(2);
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
    expect(
      await ctx.db.query("communityInteractionReplies").collect(),
    ).toHaveLength(1);
  });
});

test("AI Feed domain recovery does not recreate a canonical post hidden after its first effect", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const input = {
    userId: fixture.memberId,
    authSubject: fixture.memberSubject,
    communityId: fixture.communityId,
    principalKind: "personal_agent" as const,
    idempotencyKey: "feed-recovery-1",
    postType: "observation" as const,
    body: "A retry-safe feed observation.",
    evidence: ["interaction:root:example"],
  };

  const first = await asMember.mutation(
    internal.communityAiFeed.publishCanonicalPolynetAiFeedPostInternal,
    input,
  );
  expect(first).toMatchObject({
    deduped: false,
    agent_kind: "personal_agent",
  });
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("communityAiFeedPosts").collect();
    expect(rows).toHaveLength(1);
    await ctx.db.patch(rows[0]!._id, {
      status: "hidden",
      hiddenAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  await expect(
    asMember.mutation(
      internal.communityAiFeed.publishCanonicalPolynetAiFeedPostInternal,
      input,
    ),
  ).resolves.toMatchObject({
    deduped: true,
    agent_kind: "personal_agent",
  });
  await expect(
    asMember.mutation(
      internal.communityAiFeed.publishCanonicalPolynetAiFeedPostInternal,
      { ...input, body: "A conflicting observation." },
    ),
  ).rejects.toThrow("community_ai_feed_idempotency_key_conflict");
  const rows = await t.run(async (ctx) =>
    ctx.db.query("communityAiFeedPosts").collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "hidden",
    agentKind: "personal_agent",
    authorUserId: fixture.memberId,
  });
});

test("builder resource changes use staged writes plus discoverable, idempotent calls", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const memberCtx = executionContext(asMember);
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
  const changesetId = String(
    stage.ok ? stage.value.ref ?? "" : "",
  );
  expect(changesetId).not.toBe("");

  await expect(
    executePolynetCanonicalTool({
      ctx: memberCtx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      principalKind: "personal_agent",
      evidenceSurface: "member_agent_dock",
      toolName: "polynet_call",
      input: {
        operation: "community.resources.changeset.approve",
        version: 1,
        target:
          "/communities/canonical-community/capabilities/community.resources.changeset.approve.json",
        input: { changeset_id: changesetId },
        idempotency_key: "member-approve-denied",
      },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "operation_not_found",
  });

  const approveInput = {
    operation: "community.resources.changeset.approve",
    version: 1,
    target:
      "/communities/canonical-community/capabilities/community.resources.changeset.approve.json",
    input: { changeset_id: changesetId },
    idempotency_key: "builder-approve-1",
  };
  const approved = await executePolynetCanonicalTool({
    ctx: ownerCtx,
    authSubject: fixture.ownerSubject,
    userId: fixture.ownerId,
    principalKind: "external_mcp",
    evidenceSurface: "external_mcp",
    toolName: "polynet_call",
    input: approveInput,
  });
  expect(approved).toMatchObject({
    ok: true,
    value: {
      operation: "community.resources.changeset.approve",
      deduped: false,
      result: { status: "approved" },
    },
  });
  await expect(
    executePolynetCanonicalTool({
      ctx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_call",
      input: approveInput,
    }),
  ).resolves.toMatchObject({
    ok: true,
    value: {
      deduped: true,
      receipt: { deduped: true },
    },
  });
});

test("builder resource effects survive receipt-completion crashes without duplication", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const ownerCtx = executionContext(asOwner);
  const executeOwner = (
    ctx: ReturnType<typeof executionContext>,
    toolName: "polynet_write" | "polynet_call",
    input: Record<string, unknown>,
  ) =>
    executePolynetCanonicalTool({
      ctx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName,
      input,
    });

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
  const stagedChangesetId = await t.run(async (ctx) => {
    const changesets = await ctx.db
      .query("communityResourceBuilderChangesets")
      .collect();
    expect(changesets).toHaveLength(1);
    expect(changesets[0]).toMatchObject({ status: "staged" });
    return changesets[0]!._id;
  });

  const approveInput = {
    operation: "community.resources.changeset.approve",
    version: 1,
    target:
      "/communities/canonical-community/capabilities/community.resources.changeset.approve.json",
    input: { changeset_id: String(stagedChangesetId) },
    idempotency_key: "builder-approve-crash-1",
  };
  const recoveredApprove =
    await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
      healthyCtx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_call",
      input: approveInput,
      idempotencyKey: "builder-approve-crash-1",
      expectedErrorCode: "polynet_call_failed",
      assertDomainEffect: async () => {
        await t.run(async (ctx) => {
          expect(await ctx.db.get(stagedChangesetId)).toMatchObject({
            status: "approved",
          });
        });
      },
    });
  expect(recoveredApprove).toMatchObject({
    ok: true,
    value: {
      result: { status: "approved", deduped: true },
    },
  });

  const applyInput = {
    operation: "community.resources.changeset.apply",
    version: 1,
    target:
      "/communities/canonical-community/capabilities/community.resources.changeset.apply.json",
    input: { changeset_id: String(stagedChangesetId) },
    idempotency_key: "builder-apply-crash-1",
  };
  const recoveredApply =
    await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
      healthyCtx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_call",
      input: applyInput,
      idempotencyKey: "builder-apply-crash-1",
      expectedErrorCode: "polynet_call_failed",
      assertDomainEffect: async () => {
        await t.run(async (ctx) => {
          expect(await ctx.db.get(stagedChangesetId)).toMatchObject({
            status: "applied",
          });
          expect(
            await ctx.db.query("communityResourceModules").collect(),
          ).toHaveLength(1);
        });
      },
    });
  expect(recoveredApply).toMatchObject({
    ok: true,
    value: {
      result: { status: "applied", deduped: true },
    },
  });
  await t.run(async (ctx) => {
    const modules = await ctx.db.query("communityResourceModules").collect();
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ name: "Crash-safe module" });
  });

  const rejectedStage = await executeOwner(ownerCtx, "polynet_write", {
    path: "/communities/canonical-community/builder/resources/",
    mode: "create",
    content: {
      summary: "Stage one changeset for crash-safe rejection.",
      operations: [
        {
          op: "create_module",
          module_key: "rejected-module",
          name: "Rejected module",
          module_status: "draft",
        },
      ],
    },
    idempotency_key: "builder-stage-reject-1",
  });
  const rejectedChangesetId = String(
    rejectedStage.ok ? rejectedStage.value.ref ?? "" : "",
  );
  expect(rejectedChangesetId).not.toBe("");
  const rejectInput = {
    operation: "community.resources.changeset.reject",
    version: 1,
    target:
      "/communities/canonical-community/capabilities/community.resources.changeset.reject.json",
    input: {
      changeset_id: rejectedChangesetId,
      reason: "Rejected during crash-recovery proof.",
    },
    idempotency_key: "builder-reject-crash-1",
  };
  const recoveredReject =
    await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
      healthyCtx: ownerCtx,
      authSubject: fixture.ownerSubject,
      userId: fixture.ownerId,
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: "polynet_call",
      input: rejectInput,
      idempotencyKey: "builder-reject-crash-1",
      expectedErrorCode: "polynet_call_failed",
      assertDomainEffect: async () => {
        await t.run(async (ctx) => {
          expect(await ctx.db.get(rejectedChangesetId as any)).toMatchObject({
            status: "rejected",
          });
        });
      },
    });
  expect(recoveredReject).toMatchObject({
    ok: true,
    value: {
      result: { status: "rejected", deduped: true },
    },
  });
  await t.run(async (ctx) => {
    const changesets = await ctx.db
      .query("communityResourceBuilderChangesets")
      .collect();
    expect(changesets).toHaveLength(2);
    expect(
      changesets.filter((changeset) => changeset.status === "applied"),
    ).toHaveLength(1);
    expect(
      changesets.filter((changeset) => changeset.status === "rejected"),
    ).toHaveLength(1);
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

  const recovered =
    await recoverCanonicalOperationAfterReceiptCompletionCrash(t, {
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
            await ctx.db
              .query("communityIntelligenceChangeRequests")
              .collect(),
          ).toHaveLength(1);
        });
      },
    });
  expect(recovered).toMatchObject({
    ok: true,
    value: {
      result: { deduplicated: true },
    },
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communityOutcomeObservations").collect()).toHaveLength(
      1,
    );
    expect(
      await ctx.db.query("communityIntelligenceChangeRequests").collect(),
    ).toHaveLength(1);
  });
});
