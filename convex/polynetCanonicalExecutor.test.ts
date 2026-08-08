/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
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
  "./communityChannels.ts",
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
      otherCommunityId,
      ownerSubject: "canonical-owner-subject",
      memberSubject: "canonical-member-subject",
    };
  });
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
    receipts: await ctx.db
      .query("polynetCanonicalOperationReceipts")
      .collect(),
  }));
  expect(rows.roots).toHaveLength(2);
  expect(rows.roots.every((root) => root.channelId === fixture.generalChannelId)).toBe(true);
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

test("retired AI Feed writer fails closed without creating a post", async () => {
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

  await expect(
    asMember.mutation(
      internal.communityAiFeed.publishCanonicalPolynetAiFeedPostInternal,
      input,
    ),
  ).rejects.toThrow("ai_feed_retired");
  const rows = await t.run(async (ctx) =>
    ctx.db.query("communityAiFeedPosts").collect(),
  );
  expect(rows).toHaveLength(0);
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
  const changesetId = String(
    stage.ok ? stage.value.ref ?? "" : "",
  );
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
    legacyStage.ok ? legacyStage.value.ref ?? "" : "",
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
    rejectedStage.ok ? rejectedStage.value.ref ?? "" : "",
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
      internal.communityResources.stageCommunityResourceBuilderChangesetInternal,
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
      internal.communityResources.stageCommunityResourceBuilderChangesetInternal,
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
  await expect(stage("single-active-1", "Single active one")).resolves.toMatchObject({
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
      internal.communityResources.stageCommunityResourceBuilderChangesetInternal,
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
  await expect(stage("single-active-4", "Single active four")).resolves.toMatchObject({
    status: "staged",
    deduped: false,
  });
});

test("concurrent resource changeset staging leaves one live proposal", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const stage = (suffix: string) =>
    t.mutation(
      internal.communityResources.stageCommunityResourceBuilderChangesetInternal,
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
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(String(rejected && rejected.status === "rejected" ? rejected.reason : "")).toContain(
    "community_resource_changeset_already_pending",
  );
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
    expect(await ctx.db.query("communityResourceModules").collect()).toHaveLength(0);
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
