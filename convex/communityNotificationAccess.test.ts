/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import {
  resolveMentionRecipientSource,
  resolveNotificationRecipientSource,
} from "./communityNotificationAccess";
import { scheduleEverybodyMentionBroadcast } from "./communityMentionBroadcasts";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_params: unknown) => ({
    providerMessageId: "simulated-notification-delivery",
  })),
);
vi.mock("./emailCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emailCore")>()),
  sendRenderedEmail: sendEmail,
}));

const modules = import.meta.glob([
  "./communityMentionEmails.ts",
  "./communityMentionBroadcasts.ts",
  "./communityAttention.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);
const refs = internal as any;
const NOW = 10_000_000;

test("the existing worker delivers an authorized mention once and records the provider receipt", async () => {
  sendEmail.mockClear();
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  await t.action(
    refs.communityMentionEmails.processPendingMentionEmailsInternal,
    {},
  );
  expect(
    await t.action(refs.email.processPendingEmailOutboxInternal, {
      nowMs: Date.now() + 1_000,
    }),
  ).toMatchObject({ sent: 1, failed: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
    to: "member@example.com",
    payload: { snippet: "Current message" },
    idempotencyKey: `mention_notification:${f.mentionId}`,
  });
  expect(
    await t.action(refs.email.processPendingEmailOutboxInternal, {
      nowMs: Date.now() + 2_000,
    }),
  ).toMatchObject({ sent: 0 });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  const rows = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "sent",
    providerMessageId: "simulated-notification-delivery",
  });
});

test("revoked queued mail never reaches the provider adapter", async () => {
  sendEmail.mockClear();
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  await t.mutation(refs.email.enqueueEmailJobInternal, enqueueArgs(f));
  await t.run((ctx) => ctx.db.patch(f.membershipId, { active: false }));
  expect(
    await t.action(refs.email.processPendingEmailOutboxInternal, {
      nowMs: NOW,
    }),
  ).toMatchObject({ sent: 0 });
  expect(sendEmail).not.toHaveBeenCalled();
});

async function fixture(ctx: MutationCtx) {
  const user = async (name: string) => {
    const id = await ctx.db.insert("users", {
      authSubject: name,
      displayName: name,
      handle: name,
      normalizedHandle: name,
      email: `${name}@example.com`,
      emailVerifiedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("userProfileDetails", {
      userId: id,
      displayName: name,
      avatarUrl: `https://example.com/${name}.png`,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const document of PLATFORM_LEGAL_DOCUMENTS)
      await ctx.db.insert("legalAcceptances", {
        userId: id,
        documentKey: document.key,
        documentVersion: document.version,
        acceptedAt: 1,
        source: "test",
        createdAt: 1,
      });
    return id;
  };
  const ownerId = await user("owner");
  const memberId = await user("member");
  const outsiderId = await user("outsider");
  const communityId = await ctx.db.insert("communities", {
    ownerId,
    name: "Notifications",
    slug: "notifications",
    visibility: "unlisted",
    entryPolicy: "open",
    inferenceFundingPolicy: "managed_required",
    lifecycleStatus: "active",
    lifecycleGeneration: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  const membershipId = await ctx.db.insert("communityMemberships", {
    communityId,
    userId: memberId,
    role: "member",
    active: true,
    createdAt: 1,
    updatedAt: 1,
  });
  await ctx.db.insert("communityMemberships", {
    communityId,
    userId: outsiderId,
    role: "member",
    active: true,
    createdAt: 1,
    updatedAt: 1,
  });
  const generalId = await ctx.db.insert("communityChannels", {
    communityId,
    systemRole: "general",
    name: "General",
    slug: "general",
    accessMode: "all_members",
    postingPolicy: "members",
    position: 0,
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  });
  const channelId = await ctx.db.insert("communityChannels", {
    communityId,
    name: "Client",
    slug: "client",
    accessMode: "all_members",
    postingPolicy: "members",
    position: 1,
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  });
  const grantId = await ctx.db.insert("communityChannelParticipants", {
    communityId,
    channelId,
    principalKey: `user:${memberId}`,
    membershipId, membershipActivationSequence: 0,
    status: "active",
    createdByUserId: ownerId,
    createdAt: 1,
    updatedAt: 1,
  });
  const rootId = await ctx.db.insert("communityInteractionRoots", {
    communityId,
    channelId,
    actorType: "human",
    actorUserId: ownerId,
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Current message",
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: "root",
    createdAt: 1_000,
    updatedAt: 1_000,
  });
  const mentionId = await ctx.db.insert("communityInteractionMentions", {
    communityId,
    channelId,
    rootId,
    mentionKind: "user",
    mentionedUserId: memberId,
    notifyState: "pending",
    createdAt: 1_000,
    updatedAt: 1_000,
  });
  return {
    ownerId,
    memberId,
    outsiderId,
    communityId,
    membershipId,
    generalId,
    channelId,
    grantId,
    rootId,
    mentionId,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function enqueueArgs(f: Fixture) {
  return {
    kind: "mention_notification",
    templateKey: "mention_notification",
    recipientUserId: f.memberId,
    communityId: f.communityId,
    communityLifecycleGeneration: 0,
    sourceMentionId: f.mentionId,
    payload: { snippet: "STALE SECRET" },
    dedupeKey: `mention_notification:${f.mentionId}`,
    nowMs: NOW,
  };
}

test("room grants, community access, owner access and source lineage govern notification eligibility", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    await ctx.db.patch(f.channelId, { accessMode: "restricted" });
    const args = {
      ctx,
      communityId: f.communityId,
      channelId: f.channelId,
      rootId: f.rootId,
      userId: f.memberId,
    };
    expect(await resolveNotificationRecipientSource(args)).not.toBeNull();
    expect(
      await resolveNotificationRecipientSource({ ...args, userId: f.ownerId }),
    ).not.toBeNull();
    expect(
      await resolveNotificationRecipientSource({
        ...args,
        userId: f.outsiderId,
      }),
    ).toBeNull();
    expect(
      await resolveNotificationRecipientSource({
        ...args,
        channelId: f.generalId,
      }),
    ).toBeNull();
    await ctx.db.patch(f.grantId, { status: "revoked" });
    expect(await resolveNotificationRecipientSource(args)).toBeNull();
    await ctx.db.patch(f.grantId, { status: "active" });
    await ctx.db.patch(f.membershipId, { active: false });
    expect(await resolveNotificationRecipientSource(args)).toBeNull();
  });
});

test.each([
  "hidden",
  "deleted",
  "wrong_channel",
  "blocked",
  "private_visibility",
  "archived",
  "wrong_recipient",
])("%s fails closed for a captured mention", async (fault) => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const f = await fixture(ctx);
    if (fault === "hidden" || fault === "deleted")
      await ctx.db.patch(f.rootId, { status: fault });
    if (fault === "wrong_channel")
      await ctx.db.patch(f.mentionId, { channelId: f.generalId });
    if (fault === "private_visibility")
      await ctx.db.patch(f.rootId, { visibilityScope: "private" });
    if (fault === "archived")
      await ctx.db.patch(f.channelId, { status: "archived" });
    if (fault === "blocked")
      await ctx.db.insert("communityBlocks", {
        communityId: f.communityId,
        userId: f.memberId,
        createdByUserId: f.ownerId,
        createdAt: 1,
        updatedAt: 1,
      });
    expect(
      await resolveMentionRecipientSource({
        ctx,
        mention: await ctx.db.get(f.mentionId),
        userId: fault === "wrong_recipient" ? f.outsiderId : f.memberId,
      }),
    ).toBeNull();
  });
});

test("outbox carries identity, refreshes content on claim, and suppresses revocation between claim and dispatch", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const enqueued = await t.mutation(
    refs.email.enqueueEmailJobInternal,
    enqueueArgs(f),
  );
  expect(await t.run((ctx) => ctx.db.get(enqueued.outboxId))).toMatchObject({
    sourceMentionId: f.mentionId,
    payload: {},
    status: "pending",
  });
  await t.run((ctx) =>
    ctx.db.patch(f.rootId, { contentSummary: "Edited message" }),
  );
  const jobs = await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
    nowMs: NOW,
  });
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payload.snippet).toBe("Edited message");
  await t.run((ctx) => ctx.db.patch(f.membershipId, { active: false }));
  expect(
    await t.mutation(refs.email.prepareMentionEmailDispatchInternal, {
      outboxId: enqueued.outboxId,
      attemptCount: 1,
    }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(enqueued.outboxId))).toMatchObject({
    status: "suppressed",
    payload: {},
  });
  expect(
    await t.mutation(refs.email.enqueueEmailJobInternal, enqueueArgs(f)),
  ).toMatchObject({ deduped: true, status: "suppressed" });
});

test("retry checks grants again; superseded workers cannot prepare a newer attempt", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  await t.run((ctx) => ctx.db.patch(f.channelId, { accessMode: "restricted" }));
  const enqueued = await t.mutation(
    refs.email.enqueueEmailJobInternal,
    enqueueArgs(f),
  );
  expect(enqueued.status).toBe("pending");
  expect(
    await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
      nowMs: NOW,
    }),
  ).toHaveLength(1);
  expect(
    await t.mutation(refs.email.prepareMentionEmailDispatchInternal, {
      outboxId: enqueued.outboxId,
      attemptCount: 0,
    }),
  ).toBeNull();
  expect(
    await t.mutation(refs.email.prepareMentionEmailDispatchInternal, {
      outboxId: enqueued.outboxId,
      attemptCount: 1,
    }),
  ).not.toBeNull();
  await t.mutation(refs.email.markEmailJobFailedInternal, {
    outboxId: enqueued.outboxId,
    nowMs: NOW,
    reason: "simulated transport failure",
  });
  await t.run((ctx) => ctx.db.patch(f.grantId, { status: "revoked" }));
  expect(
    await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
      nowMs: NOW + 600_000,
    }),
  ).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(enqueued.outboxId))).toMatchObject({
    status: "suppressed",
  });
});

test.each(["preferences", "email", "read", "generation"])(
  "%s change suppresses queued mention mail",
  async (fault) => {
    const t = convexTest(schema, modules);
    const f = await t.run(fixture);
    const enqueued = await t.mutation(
      refs.email.enqueueEmailJobInternal,
      enqueueArgs(f),
    );
    await t.run(async (ctx) => {
      if (fault === "preferences")
        await ctx.db.insert("emailPreferences", {
          userId: f.memberId,
          weeklyDigestEnabled: true,
          eventReminderEnabled: true,
          founderAdminEmailsEnabled: true,
          mentionEmailsEnabled: false,
          createdAt: 1,
          updatedAt: 1,
        });
      if (fault === "email")
        await ctx.db.patch(f.memberId, { email: "new-address@example.com" });
      if (fault === "read")
        await ctx.db.patch(f.mentionId, { notifyState: "read" });
      if (fault === "generation")
        await ctx.db.patch(f.communityId, { lifecycleGeneration: 1 });
    });
    expect(
      await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
        nowMs: NOW,
      }),
    ).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(enqueued.outboxId))).toMatchObject({
      status: "suppressed",
    });
  },
);

test("untraceable legacy jobs are suppressed without starving valid jobs in the batch", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const legacyId = await t.run((ctx) =>
    ctx.db.insert("emailOutbox", {
      kind: "mention_notification",
      templateKey: "mention_notification",
      recipientEmail: "member@example.com",
      recipientUserId: f.memberId,
      payload: { snippet: "LEGACY SECRET" },
      status: "pending",
      scheduledAt: NOW - 1,
      attemptCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const enqueued = await t.mutation(
    refs.email.enqueueEmailJobInternal,
    enqueueArgs(f),
  );
  expect(
    (
      await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
        nowMs: NOW,
      })
    ).map((j: any) => j._id),
  ).toEqual([enqueued.outboxId]);
  expect(await t.run((ctx) => ctx.db.get(legacyId))).toMatchObject({
    status: "suppressed",
    payload: {},
  });
});

test("mention email processing enqueues once with canonical lineage and no stored preview", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  await t.action(
    refs.communityMentionEmails.processPendingMentionEmailsInternal,
    {},
  );
  await t.action(
    refs.communityMentionEmails.processPendingMentionEmailsInternal,
    {},
  );
  const rows = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sourceMentionId: f.mentionId,
    communityId: f.communityId,
    communityLifecycleGeneration: 0,
    payload: {},
  });
});

test("broadcast fanout only notifies room readers, including its delayed existing-recipient path", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const broadcastId = await t.run(async (ctx) => {
    await ctx.db.patch(f.channelId, { accessMode: "restricted" });
    await ctx.db.insert("communityInteractionContentBlocks", {
      communityId: f.communityId,
      rootId: f.rootId,
      blockType: "markdown_text",
      text: "@everybody hello",
      blockOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const roleId = await ctx.db.insert("communityInteractionMentions", {
      communityId: f.communityId,
      channelId: f.channelId,
      rootId: f.rootId,
      mentionKind: "role",
      mentionedRoleKey: "everybody",
      notifyState: "pending",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    // A previously queued direct mention is not a permanent room grant.
    await ctx.db.insert("communityInteractionMentions", {
      communityId: f.communityId,
      channelId: f.channelId,
      rootId: f.rootId,
      mentionKind: "user",
      mentionedUserId: f.outsiderId,
      notifyState: "pending",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return (
      await scheduleEverybodyMentionBroadcast({
        ctx,
        communityId: f.communityId,
        channelId: f.channelId,
        rootId: f.rootId,
        actorUserId: f.ownerId,
        sourceMentionId: roleId,
        nowMs: NOW,
      })
    ).broadcastId;
  });
  await t.mutation(
    refs.communityMentionBroadcasts
      .processQueuedCommunityMentionBroadcastsInternal,
    { broadcastId, nowMs: NOW },
  );
  const mentions = await t.run((ctx) =>
    ctx.db.query("communityInteractionMentions").collect(),
  );
  expect(
    mentions.find((m) => m.mentionedUserId === f.memberId)?.sourceBroadcastId,
  ).toBe(broadcastId);
  expect(
    mentions.find((m) => m.mentionedUserId === f.outsiderId)?.notifyState,
  ).toBe("suppressed");
});

test("attention ignores an inaccessible mention and still finds older valid activity", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const member = t.withIdentity({ subject: "member" });
  const args = { communityIds: [f.communityId] };
  await t.run(async (ctx) => {
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId,
      channelId: f.channelId,
      actorType: "human",
      actorUserId: f.ownerId,
      kind: "discussion",
      status: "hidden",
      visibilityScope: "community",
      contentSummary: "Hidden newer message",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "hidden-newer",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityInteractionMentions", {
      communityId: f.communityId,
      channelId: f.channelId,
      rootId,
      mentionKind: "user",
      mentionedUserId: f.memberId,
      notifyState: "pending",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
  });
  expect(
    (
      await member.query(api.communityAttention.listMyCommunityAttention, args)
    )[0].mentions,
  ).toBe(true);
  await t.run((ctx) => ctx.db.patch(f.rootId, { status: "hidden" }));
  expect(
    (
      await member.query(api.communityAttention.listMyCommunityAttention, args)
    )[0].mentions,
  ).toBe(false);
});

test("direct mention validation rolls back the whole write for an ineligible recipient", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const owner = t.withIdentity({ subject: "owner" });
  const args = {
    communityId: f.communityId,
    channelId: f.channelId,
    text: "@member hello",
    mentions: [{ userId: f.memberId }],
    idempotencyKey: "direct-allowed",
  };
  await owner.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    args,
  );
  const before = await t.run(async (ctx) => ({
    roots: (await ctx.db.query("communityInteractionRoots").collect()).length,
    mentions: (await ctx.db.query("communityInteractionMentions").collect())
      .length,
  }));
  await t.run((ctx) => ctx.db.patch(f.membershipId, { active: false }));
  await expect(
    owner.mutation(
      api.communityInteractions.createCommunityInteractionComposerMessage,
      { ...args, idempotencyKey: "direct-denied" },
    ),
  ).rejects.toThrow("interaction_mention_user_not_allowed");
  expect(
    await t.run(async (ctx) => ({
      roots: (await ctx.db.query("communityInteractionRoots").collect()).length,
      mentions: (await ctx.db.query("communityInteractionMentions").collect())
        .length,
    })),
  ).toEqual(before);
});

test("a changed message cannot reuse an already-dispatched body fingerprint on retry", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(fixture);
  const enqueued = await t.mutation(
    refs.email.enqueueEmailJobInternal,
    enqueueArgs(f),
  );
  await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, { nowMs: NOW });
  expect(
    await t.mutation(refs.email.prepareMentionEmailDispatchInternal, {
      outboxId: enqueued.outboxId,
      attemptCount: 1,
    }),
  ).not.toBeNull();
  const stored: any = await t.run((ctx) => ctx.db.get(enqueued.outboxId));
  expect(stored.payload).toEqual({
    mentionContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  await t.mutation(refs.email.markEmailJobFailedInternal, {
    outboxId: enqueued.outboxId,
    nowMs: NOW,
  });
  await t.run((ctx) =>
    ctx.db.patch(f.rootId, { contentSummary: "Different message" }),
  );
  expect(
    await t.mutation(refs.email.claimDueEmailOutboxBatchInternal, {
      nowMs: NOW + 600_000,
    }),
  ).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(enqueued.outboxId))).toMatchObject({
    status: "suppressed",
    failureReason: "mention_content_changed",
  });
});
