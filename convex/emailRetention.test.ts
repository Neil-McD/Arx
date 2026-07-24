import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./email.ts",
  "./emailCore.ts",
  "./emailDigests.ts",
  "./communityMentionEmails.ts",
  "./directMessageEmails.ts",
  "./_generated/**/*.*s",
]);

const nowMs = 1_780_000_000_000;

async function createUser(t: ReturnType<typeof convexTest>, suffix: string, verified = true) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      authSubject: `email-retention-${suffix}`,
      displayName: suffix,
      email: `${suffix}@example.com`,
      ...(verified ? { emailVerifiedAt: nowMs } : null),
      createdAt: nowMs,
      updatedAt: nowMs,
    }),
  );
}

async function createCommunityFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  const ownerId = await createUser(t, `${suffix}-owner`);
  const memberId = await createUser(t, `${suffix}-member`);
  const communityId = await t.run(async (ctx) => {
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `email-${suffix}`,
      name: `Email ${suffix}`,
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return communityId;
  });
  return { ownerId, memberId, communityId };
}

beforeEach(() => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email content retention contraction", () => {
  test("stores no user email address and removes the payload at terminal completion", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, "terminal");
    const enqueue = await t.mutation((internal as any).email.enqueueEmailJobInternal, {
      kind: "weekly_member_digest",
      recipientUserId: userId,
      templateKey: "weekly_member_digest",
      payload: {
        communityId: "community-reference",
        itemRefs: [{ sourceType: "interaction_root", sourceId: "root-reference" }],
      },
      dedupeKey: "digest:terminal",
      nowMs,
    });
    const pending = await t.run(async (ctx) => await ctx.db.get(enqueue.outboxId)) as any;
    expect(pending?.recipientEmail).toBeUndefined();
    expect(pending?.payload).toEqual({
      communityId: "community-reference",
      itemRefs: [{ sourceType: "interaction_root", sourceId: "root-reference" }],
    });

    await t.mutation((internal as any).email.markEmailJobSentInternal, {
      outboxId: enqueue.outboxId,
      providerMessageId: "provider-message-terminal",
      nowMs: nowMs + 1,
    });
    const terminal = await t.run(async (ctx) => await ctx.db.get(enqueue.outboxId)) as any;
    expect(terminal).toMatchObject({
      status: "sent",
      providerMessageId: "provider-message-terminal",
      contentMinimizedAt: nowMs + 1,
    });
    expect(terminal?.recipientEmail).toBeUndefined();
    expect(terminal?.payload).toBeUndefined();

    const replay = await t.mutation((internal as any).email.enqueueEmailJobInternal, {
      kind: "weekly_member_digest",
      recipientUserId: userId,
      templateKey: "weekly_member_digest",
      payload: { forbiddenDuplicate: true },
      dedupeKey: "digest:terminal",
      nowMs: nowMs + 2,
    });
    expect(replay).toMatchObject({ deduped: true, outboxId: enqueue.outboxId, status: "sent" });
    expect(
      await t.run(async (ctx) => (await ctx.db.query("emailOutbox").collect()).length),
    ).toBe(1);
  });

  test("suppression never stores content or a recipient email address", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, "unverified", false);
    const enqueue = await t.mutation((internal as any).email.enqueueEmailJobInternal, {
      kind: "mention_notification",
      recipientUserId: userId,
      templateKey: "mention_notification",
      payload: { snippet: "must not persist" },
      dedupeKey: "mention:unverified",
      nowMs,
    });
    const row = await t.run(async (ctx) => await ctx.db.get(enqueue.outboxId)) as any;
    expect(row).toMatchObject({
      status: "suppressed",
      failureReason: "email_recipient_unverified",
      contentMinimizedAt: nowMs,
    });
    expect(row?.recipientEmail).toBeUndefined();
    expect(row?.payload).toBeUndefined();
  });

  test("normalizes webhook evidence and deduplicates provider retries", async () => {
    const t = convexTest(schema, modules);
    const outboxId = await t.run(async (ctx) =>
      await ctx.db.insert("emailOutbox", {
        kind: "billing_issue",
        recipientEmail: "billing@example.com",
        templateKey: "billing_issue",
        payload: { title: "temporary payload" },
        provider: "resend",
        providerMessageId: "provider-message-webhook",
        status: "sent",
        scheduledAt: nowMs,
        attemptCount: 1,
        sentAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      }),
    );
    const args = {
      provider: "resend",
      providerEventId: "provider-event-1",
      providerMessageId: "provider-message-webhook",
      eventType: "email.delivered",
      nowMs: nowMs + 1,
    };
    const first = await t.mutation(
      (internal as any).email.recordEmailDeliveryWebhookInternal,
      args,
    );
    const replay = await t.mutation(
      (internal as any).email.recordEmailDeliveryWebhookInternal,
      args,
    );
    expect(first).toMatchObject({ deduped: false, outboxId });
    expect(replay).toMatchObject({ deduped: true, outboxId });
    const deliveries = await t.run(async (ctx) => await ctx.db.query("emailDeliveries").collect());
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      provider: "resend",
      providerEventId: "provider-event-1",
      providerMessageId: "provider-message-webhook",
      eventType: "email.delivered",
    });
    expect((deliveries[0] as any).payload).toBeUndefined();
  });

  test("hydrates weekly excerpts from current canonical content and fails closed after access revocation", async () => {
    const t = convexTest(schema, modules);
    const { memberId, communityId } = await createCommunityFixture(t, "digest");
    await t.run(async (ctx) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "human",
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Current canonical digest excerpt",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "digest-current-root",
        createdAt: nowMs,
        updatedAt: nowMs,
      }),
    );
    const payload = {
      communityId,
      periodStartMs: nowMs - 7 * 24 * 60 * 60 * 1000,
      periodEndMs: nowMs,
      periodStartDay: "2026-07-17",
      periodEndDay: "2026-07-24",
      activity: {
        chatMessageCount: 1,
        aiFeedPostCount: 0,
        resourceCount: 0,
        newMemberCount: 0,
      },
    };
    const resolved = await t.query(
      (internal as any).emailDigests.resolveWeeklyMemberDigestPayloadForSendInternal,
      { recipientUserId: memberId, payload, nowMs },
    );
    expect(resolved).toMatchObject({
      ok: true,
      payload: {
        communityName: "Email digest",
        items: [{
          title: "Active discussion",
          summary: "Current canonical digest excerpt",
          url: "https://polynet-staging.vercel.app/c/email-digest/chat",
        }],
      },
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", communityId).eq("userId", memberId),
        )
        .unique();
      if (!membership) throw new Error("fixture_membership_missing");
      await ctx.db.patch(membership._id, { active: false, revokedAt: nowMs + 1 });
    });
    await expect(
      t.query(
        (internal as any).emailDigests.resolveWeeklyMemberDigestPayloadForSendInternal,
        { recipientUserId: memberId, payload, nowMs: nowMs + 1 },
      ),
    ).resolves.toEqual({ ok: false, reason: "email_recipient_access_revoked" });
  });

  test("hydrates mention and DM previews only while their source access remains live", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, memberId, communityId } = await createCommunityFixture(t, "notifications");
    const rootId = await t.run(async (ctx) => {
      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Mention source",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "mention-source-root",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("communityInteractionContentBlocks", {
        communityId,
        rootId,
        blockOrder: 0,
        blockType: "markdown_text",
        text: "Actual mention preview",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return rootId;
    });
    const mentionId = await t.run(async (ctx) =>
      await ctx.db.insert("communityInteractionMentions", {
        communityId,
        rootId,
        mentionKind: "user",
        mentionedUserId: memberId,
        notifyState: "sent",
        createdAt: nowMs,
        updatedAt: nowMs,
      }),
    );
    const mention = await t.query(
      (internal as any).communityMentionEmails.resolveMentionEmailPayloadForSendInternal,
      { recipientUserId: memberId, payload: { mentionId } },
    );
    expect(mention).toMatchObject({
      ok: true,
      payload: {
        mentionerName: "notifications-owner",
        snippet: "Actual mention preview",
        actionUrl: "https://polynet-staging.vercel.app/c/email-notifications/chat",
      },
    });

    const { conversationId, messageSeq } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("dmConversations", {
        kind: "direct",
        canonicalKey: "notifications-owner:notifications-member",
        createdByUserId: ownerId,
        createdFromCommunityId: communityId,
        lastSeq: 1,
        lastMessageAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("dmParticipants", {
        conversationId,
        participantType: "user",
        userId: memberId,
        status: "active",
        lastReadSeq: 0,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("dmMessages", {
        conversationId,
        seq: 1,
        senderType: "user",
        senderUserId: ownerId,
        contentJson: { text: "Actual DM preview" },
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return { conversationId, messageSeq: 1 };
    });
    const dm = await t.query(
      (internal as any).directMessageEmails.resolveDirectMessageEmailPayloadForSendInternal,
      { recipientUserId: memberId, payload: { conversationId, messageSeq } },
    );
    expect(dm).toMatchObject({
      ok: true,
      payload: {
        senderName: "notifications-owner",
        snippet: "Actual DM preview",
        actionUrl: `https://polynet-staging.vercel.app/?dm=${conversationId}`,
      },
    });

    await t.run(async (ctx) => {
      const participant = await ctx.db
        .query("dmParticipants")
        .withIndex("by_conversation_user", (q) =>
          q.eq("conversationId", conversationId).eq("userId", memberId),
        )
        .unique();
      if (!participant) throw new Error("fixture_participant_missing");
      await ctx.db.patch(participant._id, { status: "left", updatedAt: nowMs + 1 });
      await ctx.db.patch(rootId, { status: "deleted", deletedAt: nowMs + 1, updatedAt: nowMs + 1 });
    });
    await expect(
      t.query(
        (internal as any).communityMentionEmails.resolveMentionEmailPayloadForSendInternal,
        { recipientUserId: memberId, payload: { mentionId } },
      ),
    ).resolves.toEqual({ ok: false, reason: "email_content_unavailable" });
    await expect(
      t.query(
        (internal as any).directMessageEmails.resolveDirectMessageEmailPayloadForSendInternal,
        { recipientUserId: memberId, payload: { conversationId, messageSeq } },
      ),
    ).resolves.toEqual({ ok: false, reason: "email_recipient_access_revoked" });
  });
});
