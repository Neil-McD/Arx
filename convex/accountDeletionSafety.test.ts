/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import {
  ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS,
  ACCOUNT_LIFECYCLE_POLICY_VERSION,
  ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES,
} from "./accountLifecyclePolicy";
import schema from "./schema";

const modules = import.meta.glob(["./account.ts", "./accountLifecycle.ts", "./_generated/**/*.*s"]);
const DELETING_SUBJECT = "account-deletion-safety-user";
const SURVIVING_SUBJECT = "account-deletion-safety-survivor";
const LIFECYCLE_BLOCKER = "account_delete_lifecycle_migration_blocked";

test("account deletion quarantine never provisions a missing account", async () => {
  const t = convexTest(schema, modules);
  const unprovisionedSubject = "account-deletion-unprovisioned-user";
  const asUnprovisionedIdentity = t.withIdentity({ subject: unprovisionedSubject });

  await expect(
    asUnprovisionedIdentity.mutation(api.account.deleteOwnAccount, {
      authSubject: unprovisionedSubject,
    }),
  ).rejects.toThrow("user_not_found");

  expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.query("criticalAuditEvents").collect())).toEqual([]);
});

test("account deletion quarantine requires verified identity", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.account.deleteOwnAccount, {}),
  ).rejects.toThrow("verified_identity_required");

  expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toEqual([]);
});

test("account deletion is quarantined before shared state can be destroyed", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_000_000_000;

  const fixture = await t.run(async (ctx) => {
    const deletingUserId = await ctx.db.insert("users", {
      authSubject: DELETING_SUBJECT,
      displayName: "Deleting member",
      createdAt: now,
      updatedAt: now,
    });
    const survivingUserId = await ctx.db.insert("users", {
      authSubject: SURVIVING_SUBJECT,
      displayName: "Surviving member",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: survivingUserId,
      slug: "account-deletion-safety",
      name: "Account deletion safety",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: deletingUserId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const conversationId = await ctx.db.insert("dmConversations", {
      kind: "direct",
      canonicalKey: "account-deletion-safety-pair",
      createdByUserId: deletingUserId,
      createdFromCommunityId: communityId,
      lastSeq: 1,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const deletingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: deletingUserId,
      status: "active",
      lastReadSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const survivingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: survivingUserId,
      status: "active",
      lastReadSeq: 0,
      createdAt: now,
      updatedAt: now,
    });
    const dmMessageId = await ctx.db.insert("dmMessages", {
      conversationId,
      seq: 1,
      senderType: "user",
      senderUserId: deletingUserId,
      contentJson: { text: "Shared history must survive." },
      createdAt: now,
      updatedAt: now,
    });
    const chatThreadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const legacyMessageId = await ctx.db.insert("communityChatMessages", {
      threadId: chatThreadId,
      seq: 1,
      role: "user",
      senderUserId: deletingUserId,
      contentJson: { text: "Legacy shared contribution." },
      createdAt: now,
      updatedAt: now,
    });
    const interactionRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: deletingUserId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Canonical shared contribution.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "account-deletion-safety-root",
      createdAt: now,
      updatedAt: now,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: deletingUserId,
      type: "page",
      role: "page",
      status: "published",
      title: "Shared resource",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: deletingUserId,
      title: "Shared event",
      startsAt: now + 86_400_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now,
      updatedAt: now,
    });

    return {
      deletingUserId,
      survivingUserId,
      communityId,
      membershipId,
      conversationId,
      deletingParticipantId,
      survivingParticipantId,
      dmMessageId,
      chatThreadId,
      legacyMessageId,
      interactionRootId,
      resourceId,
      eventId,
    };
  });

  const stateBeforeRejection = await t.run(async (ctx) => ({
    rows: await Promise.all(Object.values(fixture).map((id) => ctx.db.get(id))),
    auditEvents: await ctx.db.query("criticalAuditEvents").collect(),
  }));

  const asDeletingUser = t.withIdentity({ subject: DELETING_SUBJECT });
  await expect(
    asDeletingUser.mutation(api.account.deleteOwnAccount, {
      authSubject: DELETING_SUBJECT,
    }),
  ).rejects.toMatchObject({
    data: {
      code: LIFECYCLE_BLOCKER,
      reason: LIFECYCLE_BLOCKER,
    },
  });

  const stateAfterRejection = await t.run(async (ctx) => {
    const rows = await Promise.all(Object.values(fixture).map((id) => ctx.db.get(id)));
    const auditEvents = await ctx.db.query("criticalAuditEvents").collect();
    return { rows, auditEvents };
  });

  expect(stateAfterRejection).toEqual(stateBeforeRejection);
});

test("internal lifecycle request rejects missing identity without provisioning or lifecycle state", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(internal.accountLifecycle.recordOwnAccountDeletionRequestInternal, {}),
  ).rejects.toThrow("verified_identity_required");

  const asMissingUser = t.withIdentity({ subject: "account-lifecycle-missing-user" });
  await expect(
    asMissingUser.mutation(internal.accountLifecycle.recordOwnAccountDeletionRequestInternal, {}),
  ).rejects.toThrow("user_not_found");

  expect(await t.run(async (ctx) => await ctx.db.query("users").collect())).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.query("accountLifecycleRequests").collect())).toEqual([]);
  expect(await t.run(async (ctx) => await ctx.db.query("accountLifecycleReceipts").collect())).toEqual([]);
});

test("account lifecycle has one canonical root per account across policy versions", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_050_000_000;
  const firstSubject = "account-lifecycle-root-first";
  const secondSubject = "account-lifecycle-root-second";
  const stalePolicySubject = "account-lifecycle-root-stale-policy";

  const { stalePolicyUserId } = await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: firstSubject,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("users", {
      authSubject: secondSubject,
      createdAt: now,
      updatedAt: now,
    });
    const stalePolicyUserId = await ctx.db.insert("users", {
      authSubject: stalePolicySubject,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("accountLifecycleRequests", {
      userId: stalePolicyUserId,
      policyVersion: "account-lifecycle-policy-stale-fixture",
      status: "requested",
      phase: "preflight_blockers",
      checkpointRevision: 0,
      blockerCodes: [],
      createdAt: now,
      updatedAt: now,
    });
    return { stalePolicyUserId };
  });

  const asFirstUser = t.withIdentity({ subject: firstSubject });
  const first = await asFirstUser.mutation(
    internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
    {},
  );
  expect(
    await asFirstUser.mutation(
      internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
      {},
    ),
  ).toEqual(first);

  const second = await t.withIdentity({ subject: secondSubject }).mutation(
    internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
    {},
  );
  expect(second.requestId).not.toEqual(first.requestId);

  await expect(
    t.withIdentity({ subject: stalePolicySubject }).mutation(
      internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
      {},
    ),
  ).rejects.toThrow("account_lifecycle_request_corrupt");

  const state = await t.run(async (ctx) => ({
    requests: await ctx.db.query("accountLifecycleRequests").collect(),
    receipts: await ctx.db.query("accountLifecycleReceipts").collect(),
    stalePolicyRoots: await ctx.db
      .query("accountLifecycleRequests")
      .withIndex("by_user", (q) => q.eq("userId", stalePolicyUserId))
      .collect(),
  }));
  expect(state.requests).toHaveLength(3);
  expect(state.receipts).toHaveLength(2);
  expect(state.stalePolicyRoots).toHaveLength(1);
  expect(state.stalePolicyRoots[0]?.policyVersion).toBe("account-lifecycle-policy-stale-fixture");
});

test("duplicate lifecycle roots fail closed instead of selecting one", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_075_000_000;
  const subject = "account-lifecycle-duplicate-root";

  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
      createdAt: now,
      updatedAt: now,
    });
    for (let index = 0; index < 2; index += 1) {
      await ctx.db.insert("accountLifecycleRequests", {
        userId,
        policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
        status: "requested",
        phase: "preflight_blockers",
        checkpointRevision: 0,
        blockerCodes: [],
        createdAt: now + index,
        updatedAt: now + index,
      });
    }
    return userId;
  });

  await expect(
    t.withIdentity({ subject }).mutation(
      internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
      {},
    ),
  ).rejects.toThrow();

  expect(
    await t.run(async (ctx) =>
      await ctx.db
        .query("accountLifecycleRequests")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ),
  ).toHaveLength(2);
  expect(await t.run(async (ctx) => await ctx.db.query("accountLifecycleReceipts").collect())).toEqual([]);
});

test("account lifecycle request and preflight are idempotent, resumable, and metadata-only", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_100_000_000;

  const fixture = await t.run(async (ctx) => {
    const deletingUserId = await ctx.db.insert("users", {
      authSubject: DELETING_SUBJECT,
      displayName: "Deleting owner",
      createdAt: now,
      updatedAt: now,
    });
    const survivingUserId = await ctx.db.insert("users", {
      authSubject: SURVIVING_SUBJECT,
      displayName: "Surviving member",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: deletingUserId,
      slug: "account-lifecycle-owned-community",
      name: "Owned community",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: now,
      updatedAt: now,
    });
    const dmAttachmentStorageId = await ctx.storage.store(
      new Blob(["account lifecycle attachment"], { type: "text/plain" }),
    );
    const authSessionId = await ctx.db.insert("authSessions", {
      sessionTokenHash: "account-lifecycle-session-token-hash",
      userId: deletingUserId,
      encryptedSecretHex: "encrypted-session-secret",
      secretIvHex: "session-secret-iv",
      secretVersion: 1,
      expiresAt: now + 86_400_000,
      purgeAfterAt: now + 172_800_000,
      secretRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
    const providerConnectionId = await ctx.db.insert("userProviderConnections", {
      userId: deletingUserId,
      provider: "openai",
      authKind: "api_key",
      encryptedSecretHex: "encrypted-provider-secret",
      secretIvHex: "provider-secret-iv",
      secretVersion: 1,
      keyLastFour: "test",
      validatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const creditLedgerEntryId = await ctx.db.insert("creditLedgerEntries", {
      creditKey: "account-lifecycle-settled-credit",
      userId: deletingUserId,
      communityId,
      toolName: "account_lifecycle_fixture",
      status: "succeeded",
      creditsReserved: 10,
      creditsSettled: 10,
      includedCreditsDebited: 10,
      purchasedCreditsDebited: 0,
      rawVendorCostUsd: 0.01,
      polynetPriceUsd: 0.02,
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const auditEventId = await ctx.db.insert("criticalAuditEvents", {
      eventKey: "account-lifecycle-preserved-audit",
      eventType: "account.lifecycle.fixture",
      severity: "info",
      status: "succeeded",
      actorUserId: deletingUserId,
      subjectUserId: deletingUserId,
      communityId,
      provider: "polynet",
      metadata: { retention: "security_operations" },
      createdAt: now,
    });
    const developerAppId = await ctx.db.insert("developerApps", {
      ownerUserId: deletingUserId,
      name: "Owned app",
      slug: "account-lifecycle-owned-app",
      endpointUrl: "https://example.invalid/mcp",
      authType: "none",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const skillPackageId = await ctx.db.insert("skillPackages", {
      ownerUserId: deletingUserId,
      name: "Owned skill",
      mentionToken: "owned-skill",
      instructionsMd: "Preserve until explicitly transferred or removed.",
      createdAt: now,
      updatedAt: now,
    });
    const conversationId = await ctx.db.insert("dmConversations", {
      kind: "direct",
      canonicalKey: "account-lifecycle-shared-dm",
      createdByUserId: deletingUserId,
      createdFromCommunityId: communityId,
      lastSeq: 1,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const deletingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: deletingUserId,
      status: "active",
      lastReadSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const survivingParticipantId = await ctx.db.insert("dmParticipants", {
      conversationId,
      participantType: "user",
      userId: survivingUserId,
      status: "active",
      lastReadSeq: 0,
      createdAt: now,
      updatedAt: now,
    });
    const dmMessageId = await ctx.db.insert("dmMessages", {
      conversationId,
      seq: 1,
      senderType: "user",
      senderUserId: deletingUserId,
      contentJson: {
        text: "Shared history remains untouched by preflight.",
        attachments: [
          {
            id: "account-lifecycle-dm-attachment",
            name: "lifecycle.txt",
            type: "file",
            mime: "text/plain",
            size: 28,
            storageId: dmAttachmentStorageId,
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });
    const interactionRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: deletingUserId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Preserved canonical discussion",
      contentSummary: "Canonical shared content remains unchanged during preflight.",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "account-lifecycle-preserved-root",
      lastReplyAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const interactionReplyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId: interactionRootId,
      seq: 1,
      actorType: "human",
      actorUserId: deletingUserId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Canonical authored reply remains separate from account identity deletion.",
      reactionSummary: [],
      idempotencyKey: "account-lifecycle-preserved-reply",
      createdAt: now,
      updatedAt: now,
    });
    const interactionBlockId = await ctx.db.insert("communityInteractionContentBlocks", {
      communityId,
      replyId: interactionReplyId,
      blockOrder: 0,
      blockType: "markdown_text",
      text: "Authored content requires its own explicit purge lifecycle.",
      createdAt: now,
      updatedAt: now,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: deletingUserId,
      type: "page",
      role: "page",
      status: "published",
      title: "Community-owned lifecycle resource",
      bodyChars: 62,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    const resourceContentId = await ctx.db.insert("communityResourceContents", {
      communityId,
      resourceId,
      bodyMd: "Community-owned content is not deleted with its contributor identity.",
      bodyChars: 62,
      bodyHash: "account-lifecycle-resource-body-v1",
      createdAt: now,
      updatedAt: now,
    });
    const interactionRef = `interaction:reply:${interactionReplyId}`;
    const sourceTraceId = await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "interaction",
      sourceId: interactionRef,
      title: "Authored-content boundary evidence",
      summary: "Canonical interaction evidence must remain separately purgeable.",
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: deletingUserId,
      compilerState: "compiled",
      createdAt: now,
      updatedAt: now,
    });
    const citationId = await ctx.db.insert("communityEvidenceCitations", {
      communityId,
      sourceKind: "interaction",
      sourceRef: interactionRef,
      sourceTraceId,
      sourceVersion: "interaction-fixture-v1",
      contentHash: "a".repeat(64),
      provenanceHash: "b".repeat(64),
      capturedVisibility: "community",
      capturedAt: now,
    });
    const intelligenceNodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId,
      type: "warning_failure",
      title: "Do not merge identity deletion with authored-content purge",
      bodyMd: "Shared community continuity and explicit content privacy are distinct jobs.",
      status: "promising",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.9,
      evidenceStrength: "observed",
      workflowIds: [],
      tags: ["account_lifecycle_fixture"],
      sourceTraceIds: [sourceTraceId],
      evidenceCitationIds: [citationId],
      evidencePolicyVersion: "citation_v1",
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: "member",
      createdByUserId: deletingUserId,
      lastUpdatedByActorType: "member",
      lastUpdatedByUserId: deletingUserId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const retrievalLogId = await ctx.db.insert("communityIntelligenceRetrievalLogs", {
      communityId,
      userId: deletingUserId,
      receiptVersion: "community_memory_retrieval_receipt:v1",
      surface: "member_agent_dock",
      retrievedNodeIds: [intelligenceNodeId],
      injectedNodeIds: [intelligenceNodeId],
      outcomeObservationIds: [],
      createdAt: now,
      updatedAt: now,
    });
    const outcomeObservationId = await ctx.db.insert("communityOutcomeObservations", {
      communityId,
      nodeId: intelligenceNodeId,
      retrievalLogId,
      resultStatus: "worked",
      evidenceStrength: "observed",
      notes: "Historical outcome evidence remains auditable during preflight.",
      observedByActorType: "member",
      observedByUserId: deletingUserId,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(intelligenceNodeId, {
      outcomeObservationIds: [outcomeObservationId],
    });
    await ctx.db.patch(retrievalLogId, {
      outcomeObservationIds: [outcomeObservationId],
    });
    const compilerDigestId = await ctx.db.insert("communityCompilerDigests", {
      communityId,
      dedupeKey: "account-lifecycle-preserved-digest",
      versionKey: "account-lifecycle-preserved-digest-v1",
      agentHandoffState: "handled",
      agentHandledAt: now,
      agentTerminalReason: "settled",
      agentAttemptCount: 1,
      windowStartedAt: now - 86_400_000,
      windowEndedAt: now,
      summary: "Derived content must not outlive an explicit privacy purge.",
      itemCount: 1,
      items: [
        {
          workKey: "account-lifecycle-preserved-work",
          category: "source_trace_signal",
          title: "Authored-content privacy lineage",
          summary: "The canonical trace remains the evidence owner.",
          priority: 1,
          confidence: 0.9,
          sourceTypes: ["interaction"],
          sourceIds: [interactionRef],
          sourceTraceIds: [sourceTraceId],
          sourceRevisions: ["interaction-fixture-v1"],
        },
      ],
      signalCounts: {
        chat: 1,
        aiFeed: 0,
        resources: 0,
        events: 0,
        sourceTraces: 1,
        outcomes: 1,
        newMembers: 0,
        activeMembers: 2,
        postingMembers: 1,
        aiFeedReactingMembers: 0,
      },
      createdByActorType: "admin",
      createdByUserId: deletingUserId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      rowIds: {
        deletingUserId,
        survivingUserId,
        communityId,
        authSessionId,
        providerConnectionId,
        creditLedgerEntryId,
        auditEventId,
        developerAppId,
        skillPackageId,
        conversationId,
        deletingParticipantId,
        survivingParticipantId,
        dmMessageId,
        interactionRootId,
        interactionReplyId,
        interactionBlockId,
        resourceId,
        resourceContentId,
        sourceTraceId,
        citationId,
        intelligenceNodeId,
        retrievalLogId,
        outcomeObservationId,
        compilerDigestId,
      },
      dmAttachmentStorageId,
    };
  });

  const readProductState = async () => await t.run(async (ctx) => ({
    fixtureRows: await Promise.all(Object.values(fixture.rowIds).map((id) => ctx.db.get(id))),
    dmAttachmentUrl: await ctx.storage.getUrl(fixture.dmAttachmentStorageId),
    criticalAuditEvents: await ctx.db.query("criticalAuditEvents").collect(),
  }));
  const productStateBefore = await readProductState();
  expect(fixture.rowIds).toMatchObject({
    authSessionId: expect.any(String),
    providerConnectionId: expect.any(String),
    creditLedgerEntryId: expect.any(String),
    auditEventId: expect.any(String),
    dmMessageId: expect.any(String),
    interactionReplyId: expect.any(String),
    resourceContentId: expect.any(String),
    citationId: expect.any(String),
    intelligenceNodeId: expect.any(String),
    compilerDigestId: expect.any(String),
  });
  expect(productStateBefore.fixtureRows).toHaveLength(Object.keys(fixture.rowIds).length);
  expect(productStateBefore.fixtureRows.every(Boolean)).toBe(true);
  expect(productStateBefore.dmAttachmentUrl).toMatch(/^https:\/\//);
  expect(productStateBefore.criticalAuditEvents).toHaveLength(1);
  const asDeletingUser = t.withIdentity({ subject: DELETING_SUBJECT });

  const request = await asDeletingUser.mutation(
    internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
    {},
  );
  expect(request).toMatchObject({
    policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
    status: "requested",
    phase: "preflight_blockers",
    checkpointRevision: 0,
    blockerCodes: [],
  });
  expect(await readProductState()).toEqual(productStateBefore);

  const requestReplay = await asDeletingUser.mutation(
    internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
    {},
  );
  expect(requestReplay).toEqual(request);

  const interruptedState = await t.run(async (ctx) => ({
    requests: await ctx.db.query("accountLifecycleRequests").collect(),
    receipts: await ctx.db.query("accountLifecycleReceipts").collect(),
  }));
  expect(interruptedState.requests).toHaveLength(1);
  expect(interruptedState.receipts).toHaveLength(1);
  expect(interruptedState.receipts[0]).toMatchObject({
    sequence: 0,
    kind: "request_recorded",
    status: "requested",
  });

  const expectedBlockerCodes = [
    ...ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS.map((blocker) => blocker.code),
    ...Object.values(ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES),
  ].sort();
  const preflight = await asDeletingUser.mutation(
    internal.accountLifecycle.evaluateOwnAccountDeletionPreflightInternal,
    { requestId: request.requestId },
  );
  expect(preflight).toMatchObject({
    requestId: request.requestId,
    policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
    status: "blocked",
    phase: "preflight_blockers",
    checkpointRevision: 1,
    blockerCodes: expectedBlockerCodes,
  });
  expect(await readProductState()).toEqual(productStateBefore);

  const preflightReplay = await asDeletingUser.mutation(
    internal.accountLifecycle.evaluateOwnAccountDeletionPreflightInternal,
    { requestId: request.requestId },
  );
  expect(preflightReplay).toEqual(preflight);
  const blockedRequestReplay = await asDeletingUser.mutation(
    internal.accountLifecycle.recordOwnAccountDeletionRequestInternal,
    {},
  );
  expect(blockedRequestReplay).toEqual(preflight);

  const asSurvivingUser = t.withIdentity({ subject: SURVIVING_SUBJECT });
  await expect(
    asSurvivingUser.mutation(
      internal.accountLifecycle.evaluateOwnAccountDeletionPreflightInternal,
      { requestId: request.requestId },
    ),
  ).rejects.toThrow("account_lifecycle_request_actor_mismatch");

  const finalState = await t.run(async (ctx) => ({
    requests: await ctx.db.query("accountLifecycleRequests").collect(),
    receipts: await ctx.db.query("accountLifecycleReceipts").collect(),
  }));
  expect(finalState.requests).toHaveLength(1);
  expect(finalState.requests[0]).toMatchObject({
    status: "blocked",
    checkpointRevision: 1,
    blockerCodes: expectedBlockerCodes,
  });
  expect(finalState.receipts).toHaveLength(2);
  expect(finalState.receipts.map((receipt) => receipt.sequence).sort()).toEqual([0, 1]);
  expect(finalState.receipts.find((receipt) => receipt.sequence === 1)).toMatchObject({
    kind: "preflight_evaluated",
    status: "blocked",
    blockerCodes: expectedBlockerCodes,
  });
  expect(await readProductState()).toEqual(productStateBefore);
});
