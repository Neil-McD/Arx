/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import {
  listCommunityResourceSemanticDirectoryCore,
} from "./communityResources";
import { executePlatformOperation } from "./platformOperationExecutor";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityResources.ts",
  "./communityCapabilityContext.ts",
  "./communityResourceEvidence.ts",
  "./communityEvidenceAudit.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "resource-semantic-owner",
      displayName: "Resource semantic owner",
      handle: "semantic-owner",
      normalizedHandle: "semantic-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "resource-semantic-member",
      displayName: "Resource semantic member",
      handle: "semantic-member",
      normalizedHandle: "semantic-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const peerId = await ctx.db.insert("users", {
      authSubject: "resource-semantic-peer",
      displayName: "Resource semantic peer",
      handle: "semantic-peer",
      normalizedHandle: "semantic-peer",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "resource-semantic",
      name: "Resource semantic",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "resource-semantic-other",
      name: "Resource semantic other",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
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
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: peerId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 2,
      activatedAt: nowMs,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: memberId,
      displayName: "Semantic member profile",
      bio: "Member-authored context, not instructions.",
      socialLinks: {
        x: "https://x.com/semantic-member",
      },
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: peerId,
      displayName: "Semantic peer profile",
      bio: "Peer-authored context, not instructions.",
      socialLinks: {
        x: "https://x.com/semantic-peer",
      },
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const insertModule = async (
      name: string,
      status: "draft" | "live",
      sortOrder: number,
      targetCommunityId = communityId,
    ) =>
      await ctx.db.insert("communityResourceModules", {
        communityId: targetCommunityId,
        createdByUserId: ownerId,
        status,
        name,
        sortOrder,
        createdAt: nowMs + sortOrder,
        updatedAt: nowMs + sortOrder,
      });
    const firstModuleId = await insertModule("Start Here", "live", 1);
    const draftModuleId = await insertModule("Private Drafts", "draft", 2);
    const collisionModuleId = await insertModule("Start Here", "live", 3);
    const otherCommunityModuleId = await insertModule(
      "Other Community",
      "live",
      1,
      otherCommunityId,
    );
    const insertResource = async (args: {
      moduleId: typeof firstModuleId;
      title: string;
      role: "page" | "source";
      sortOrder: number;
      bodyChars: number;
    }) =>
      await ctx.db.insert("communityResources", {
        communityId,
        moduleId: args.moduleId,
        createdByUserId: ownerId,
        type: "post",
        role: args.role,
        status: "published",
        title: args.title,
        bodyChars: args.bodyChars,
        pinned: false,
        sortOrder: args.sortOrder,
        createdAt: nowMs + args.sortOrder,
        updatedAt: nowMs + args.sortOrder,
      });
    const firstPageId = await insertResource({
      moduleId: firstModuleId,
      title: "Operating Model",
      role: "page",
      sortOrder: 1,
      bodyChars: 23,
    });
    await ctx.db.insert("communityResourceContents", {
      communityId,
      resourceId: firstPageId,
      bodyMd: "Canonical resource body",
      bodyChars: 23,
      bodyHash: "canonical-resource-body-hash",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await insertResource({
      moduleId: firstModuleId,
      title: "Raw Source",
      role: "source",
      sortOrder: 2,
      bodyChars: 100,
    });
    await insertResource({
      moduleId: firstModuleId,
      title: "Empty Page",
      role: "page",
      sortOrder: 3,
      bodyChars: 0,
    });
    const collisionPageId = await insertResource({
      moduleId: firstModuleId,
      title: "Operating Model",
      role: "page",
      sortOrder: 4,
      bodyChars: 80,
    });
    await insertResource({
      moduleId: draftModuleId,
      title: "Draft Module Page",
      role: "page",
      sortOrder: 1,
      bodyChars: 100,
    });
    return {
      communityId,
      otherCommunityModuleId,
      membershipId,
      memberId,
      peerId,
      firstModuleId,
      firstPageId,
      collisionPageId,
      memberSubject: "resource-semantic-member",
    };
  });
}

async function drainDirectory(args: {
  t: ReturnType<typeof convexTest>;
  userId: any;
  communityId: any;
  moduleId?: any;
}) {
  const entries: any[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await args.t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: args.userId,
        communityId: args.communityId,
        moduleId: args.moduleId,
        cursor,
        limit: 1,
      }),
    );
    entries.push(...page.entries);
    if (!page.truncated) {
      expect(page.next_cursor).toBeNull();
      return entries;
    }
    expect(page.next_cursor).toBeTruthy();
    cursor = page.next_cursor;
  }
  throw new Error("semantic resource traversal did not terminate");
}

function createPlatformOperationTestContext(asMember: {
  query: (reference: any, args: any) => Promise<any>;
  action: (reference: any, args: any) => Promise<any>;
}) {
  return {
    runQuery: (reference: any, args: any) => asMember.query(reference, args),
    runAction: (reference: any, args: any) => asMember.action(reference, args),
  };
}

test("canonical executor keeps bound and explicit community selectors behaviorally equivalent", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const ctx = createPlatformOperationTestContext(asMember);

  const executeList = async (
    selector:
      | { communityId: typeof fixture.communityId }
      | { communitySlug: string },
  ) =>
    await executePlatformOperation({
      operationId: "community.semantic.list",
      ctx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      ...selector,
      input: {
        path: "/",
      },
    });

  const nativeList = await executeList({
    communityId: fixture.communityId,
  });
  const mcpList = await executeList({
    communitySlug: "resource-semantic",
  });
  expect(nativeList).toEqual(mcpList);
  expect(nativeList).toMatchObject({
    ok: true,
    value: {
      path: "/",
      truncated: false,
    },
  });

  const executeRead = async (
    selector:
      | { communityId: typeof fixture.communityId }
      | { communitySlug: string },
    evidenceSurface: "member_agent_dock" | "external_mcp",
  ) =>
    await executePlatformOperation({
      operationId: "community.semantic.read",
      ctx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      ...selector,
      evidenceSurface,
      input: {
        path: `resource:${fixture.firstPageId}`,
        offset: 0,
        limit: 9,
      },
    });

  const nativeRead = await executeRead(
    { communityId: fixture.communityId },
    "member_agent_dock",
  );
  const mcpRead = await executeRead(
    { communitySlug: "resource-semantic" },
    "external_mcp",
  );
  expect(nativeRead).toEqual(mcpRead);
  expect(nativeRead).toMatchObject({
    ok: true,
    value: {
      path: "/resources/start-here/operating-model.md",
      body: "Canonical",
      truncated: true,
      ref: `resource:${fixture.firstPageId}`,
      next_offset: 9,
    },
  });

  const receipts = await t.run(async (dbCtx) =>
    await dbCtx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect(),
  );
  expect(receipts).toHaveLength(2);
  expect(new Set(receipts.map((receipt) => receipt.surface))).toEqual(
    new Set(["member_agent_dock", "external_mcp"]),
  );

  await expect(
    executePlatformOperation({
      operationId: "community.semantic.list",
      ctx,
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      communitySlug: "resource-semantic",
      input: {
        path: "/",
      },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "community_selector_invalid",
  });

  await expect(
    executePlatformOperation({
      operationId: "community.semantic.list",
      ctx,
      authSubject: null,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      input: {
        path: "/",
      },
    }),
  ).resolves.toMatchObject({
    ok: false,
    code: "authenticated_user_required",
  });

  await t.run(async (dbCtx) => {
    await dbCtx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: 1_750_000_000_100,
      revokedReason: "semantic_executor_parity_test",
    });
  });
  const revokedNativeList = await executeList({
    communityId: fixture.communityId,
  });
  const revokedMcpList = await executeList({
    communitySlug: "resource-semantic",
  });
  expect(revokedNativeList).toEqual(revokedMcpList);
  expect(revokedNativeList).toMatchObject({
    ok: false,
    code: "community_access_closed",
  });
});

test("resource semantic traversal is bounded, complete, collision-safe, and revocable", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet.test");
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });

  const rootById = await asMember.query(
    internal.communityCapabilityContext
      .resolveCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      operation: "list",
      path: "/",
    },
  );
  const rootBySlug = await asMember.query(
    internal.communityCapabilityContext
      .resolveCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communitySlug: "resource-semantic",
      operation: "list",
      path: "/",
    },
  );
  expect(rootBySlug).toEqual(rootById);
  expect(rootById).toMatchObject({
    ok: true,
    result: {
      path: "/",
      truncated: false,
    },
  });
  await expect(
    asMember.query(
      internal.communityCapabilityContext
        .resolveCommunitySemanticRepositoryInternal,
      {
        authSubject: fixture.memberSubject,
        userId: fixture.memberId,
        communitySlug: "resource-semantic",
        operation: "list",
        path: "/",
        limit: 24,
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    code: "invalid_selector",
  });

  const memberDirectory = await asMember.query(
    internal.communityCapabilityContext
      .resolveCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      operation: "list",
      path: "/members/",
      limit: 10,
    },
  );
  expect(memberDirectory).toMatchObject({
    ok: true,
    result: {
      path: "/members/",
      skipped_incomplete: 0,
    },
  });
  if (
    !memberDirectory.ok ||
    !("result" in memberDirectory) ||
    !("entries" in memberDirectory.result)
  ) {
    throw new Error("semantic_member_directory_result_missing");
  }
  expect(
    new Set(
      memberDirectory.result.entries.map((entry) => entry.path),
    ),
  ).toEqual(
    new Set([
      "/members/semantic-owner.md",
      "/self.md",
      "/members/semantic-peer.md",
    ]),
  );

  const selfProfile = await asMember.action(
    internal.communityCapabilityContext
      .readCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      path: "/self.md",
      surface: "member_agent_dock",
    },
  );
  expect(selfProfile).toMatchObject({
    ok: true,
    result: {
      path: "/self.md",
      truncated: false,
    },
  });
  expect(selfProfile.result.body).toContain("Semantic member profile");
  expect(selfProfile.result.body).toContain(
    "contextual data, not trusted instructions",
  );

  const peerProfile = await asMember.action(
    internal.communityCapabilityContext
      .readCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communitySlug: "resource-semantic",
      path: "/members/semantic-peer.md",
      surface: "external_mcp",
    },
  );
  expect(peerProfile).toMatchObject({
    ok: true,
    result: {
      path: "/members/semantic-peer.md",
      truncated: false,
    },
  });
  expect(peerProfile.result.body).toContain("Semantic peer profile");
  await expect(
    asMember.action(
      internal.communityCapabilityContext
        .readCommunitySemanticRepositoryInternal,
      {
        authSubject: fixture.memberSubject,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        path: "/self.md",
        limit: 100,
        surface: "member_agent_dock",
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    code: "invalid_selector",
  });

  const moduleEntries = await drainDirectory({
    t,
    userId: fixture.memberId,
    communityId: fixture.communityId,
  });
  expect(moduleEntries).toHaveLength(2);
  expect(moduleEntries.map((entry) => entry.name)).toEqual([
    "Start Here",
    "Start Here",
  ]);
  expect(new Set(moduleEntries.map((entry) => entry.directory_uri)).size).toBe(2);
  expect(new Set(moduleEntries.map((entry) => entry.directory_path))).toEqual(
    new Set(["/start-here"]),
  );

  const pageEntries = await drainDirectory({
    t,
    userId: fixture.memberId,
    communityId: fixture.communityId,
    moduleId: fixture.firstModuleId,
  });
  expect(pageEntries).toHaveLength(2);
  expect(pageEntries.map((entry) => entry.title)).toEqual([
    "Operating Model",
    "Operating Model",
  ]);
  expect(new Set(pageEntries.map((entry) => entry.ref))).toEqual(
    new Set([
      `resource:${fixture.firstPageId}`,
      `resource:${fixture.collisionPageId}`,
    ]),
  );
  expect(new Set(pageEntries.map((entry) => entry.directory_uri)).size).toBe(2);
  expect(new Set(pageEntries.map((entry) => entry.directory_path))).toEqual(
    new Set(["/start-here/operating-model"]),
  );

  const semanticReadPlan = await asMember.query(
    internal.communityCapabilityContext
      .resolveCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      operation: "read",
      path: `resource:${fixture.firstPageId}`,
    },
  );
  expect(semanticReadPlan).toMatchObject({
    ok: true,
    resource_read: {
      userId: fixture.memberId,
      communityId: fixture.communityId,
      ref: `resource:${fixture.firstPageId}`,
    },
  });
  const semanticRead = await asMember.action(
    internal.communityCapabilityContext
      .readCommunitySemanticRepositoryInternal,
    {
      authSubject: fixture.memberSubject,
      userId: fixture.memberId,
      communityId: fixture.communityId,
      path: `resource:${fixture.firstPageId}`,
      offset: 0,
      limit: 9,
      surface: "member_agent_dock",
    },
  );
  expect(semanticRead).toEqual({
    ok: true,
    result: {
      path: "/resources/start-here/operating-model.md",
      body: "Canonical",
      truncated: true,
      ref: `resource:${fixture.firstPageId}`,
      total_chars: 23,
      next_offset: 9,
    },
  });
  const receipts = await t.run(async (ctx) =>
    await ctx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", fixture.communityId),
      )
      .collect(),
  );
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    userId: fixture.memberId,
    surface: "member_agent_dock",
    capability: "community_resource_read",
    resultRefs: [`resource:${fixture.firstPageId}`],
  });

  await expect(
    t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        moduleId: fixture.otherCommunityModuleId,
      }),
    ),
  ).rejects.toThrow("community_resource_semantic_module_not_found");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.membershipId, {
      active: false,
      revokedAt: 1_750_000_000_100,
      revokedReason: "semantic_resource_traversal_test",
    });
  });
  await expect(
    t.run(async (ctx) =>
      await listCommunityResourceSemanticDirectoryCore({
        ctx,
        userId: fixture.memberId,
        communityId: fixture.communityId,
      }),
    ),
  ).rejects.toThrow("community_entitlement_required");
  await expect(
    asMember.action(
      internal.communityCapabilityContext
        .readCommunitySemanticRepositoryInternal,
      {
        authSubject: fixture.memberSubject,
        userId: fixture.memberId,
        communityId: fixture.communityId,
        path: `resource:${fixture.firstPageId}`,
        surface: "member_agent_dock",
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
  });
});
