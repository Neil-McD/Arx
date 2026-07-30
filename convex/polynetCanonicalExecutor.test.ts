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
  "./communityCapabilityContext.ts",
  "./communityEvidenceAudit.ts",
  "./communityInteractionEvidence.ts",
  "./communityInteractions.ts",
  "./communityMentionLifecycle.ts",
  "./communityOnboarding.ts",
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

test("canonical five-tool executor derives member, builder, and community-agent authority per request", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: fixture.memberSubject });
  const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
  const memberCtx = executionContext(asMember);
  const ownerCtx = executionContext(asOwner);

  const memberList = await executePolynetCanonicalTool({
    ctx: memberCtx,
    authSubject: fixture.memberSubject,
    userId: fixture.memberId,
    principalKind: "personal_agent",
    evidenceSurface: "member_agent_dock",
    toolName: "polynet_list",
    input: { path: "/communities/canonical-community/" },
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
    content: { text: "A member-agent field report." },
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
    input: { path: memberWritePath },
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
        content: { text: "Conflicting payload." },
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
