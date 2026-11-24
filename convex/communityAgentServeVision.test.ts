/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { claimInteractionAttachmentsForTarget } from "./communityInteractionAttachmentBridge";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";
import {
  compileCommunityAgentThreadContext,
  type CommunityAgentThreadTurnInput,
} from "../shared/communityAgentThreadContext";

const modules = import.meta.glob([
  "./communityAgentServeWorker.ts",
  "./communityAgentChannelAccess.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

describe("Community guide vision in channels and threads", () => {
  test("readCommunityAgentServeRequestContextInternal collects authorized thread images and fails closed on non-images, pending, deleted, or cross-room attachments", async () => {
    const t = convexTest(schema, modules);
    const { requestId, expectedAttempt, calendarStorageId, rootPhotoStorageId } = await t.run(async (ctx) => {
      const nowMs = 10_000;
      const userId = await ctx.db.insert("users", {
        authSubject: "vision-rashid",
        displayName: "Rashid",
        handle: "rashid",
        normalizedHandle: "rashid",
        email: "rashid@example.com",
        emailVerifiedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const doc of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: doc.key,
          documentVersion: doc.version,
          acceptedAt: nowMs,
          source: "test",
          createdAt: nowMs,
        });
      }
      await ctx.db.insert("operatorRoles", {
        userId,
        role: "owner",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId: userId,
        slug: "vision-club",
        name: "Vision Club",
        visibility: "unlisted",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "manual_grant",
        state: "active",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const generalId = await ctx.db.insert("communityChannels", {
        communityId,
        slug: "general",
        name: "General",
        systemRole: "general",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const secretChannelId = await ctx.db.insert("communityChannels", {
        communityId,
        slug: "secret-pod",
        name: "Secret Pod",
        accessMode: "restricted",
        postingPolicy: "members",
        status: "active",
        position: 1,
        createdByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });

      const rootId = await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: generalId,
        actorType: "human",
        actorUserId: userId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: "Planning our sprint",
        replyCount: 2,
        reactionSummary: [],
        idempotencyKey: "vision-root",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const calendarReplyId = await ctx.db.insert("communityInteractionReplies", {
        communityId,
        channelId: generalId,
        rootId,
        seq: 1,
        actorType: "human",
        actorUserId: userId,
        status: "live",
        visibilityScope: "community",
        contentSummary: "Here is our calendar draft",
        reactionSummary: [],
        idempotencyKey: "vision-reply-1",
        createdAt: nowMs + 100,
        updatedAt: nowMs + 100,
      });
      const mentionReplyId = await ctx.db.insert("communityInteractionReplies", {
        communityId,
        channelId: generalId,
        rootId,
        seq: 2,
        actorType: "human",
        actorUserId: userId,
        status: "live",
        visibilityScope: "community",
        contentSummary: "@Vision Club Can you read whats in the image attached",
        reactionSummary: [],
        idempotencyKey: "vision-reply-2",
        createdAt: nowMs + 200,
        updatedAt: nowMs + 200,
      });

      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName: "Rashid",
        avatarUrl: "https://example.com/rashid.png",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const rootPhotoStorageId = await ctx.storage.store(new Blob([PNG_BYTES], { type: "image/png" }));
      const calendarStorageId = await ctx.storage.store(new Blob([PNG_BYTES], { type: "image/png" }));
      const ignoredStorageId = await ctx.storage.store(new Blob([PNG_BYTES], { type: "image/png" }));

      // Claim root & reply attachments through the real production claim path
      // (reply attachments store `replyId` + `uploadRootId` with `rootId` absent).
      const rootPendingId = await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        uploadMessageKey: "vision-root",
        uploadExpiresAt: nowMs + 60_000,
        attachmentKind: "image",
        status: "pending",
        name: "whiteboard.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        storageId: rootPhotoStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await claimInteractionAttachmentsForTarget({
        ctx,
        communityId,
        rootId,
        attachments: [{
          id: String(rootPendingId),
          attachmentId: rootPendingId,
          name: "whiteboard.png",
          attachmentKind: "image",
          mimeType: "image/png",
          sizeBytes: PNG_BYTES.byteLength,
        }],
        actorUserId: userId,
        nowMs,
        messageKey: "vision-root",
      });

      const replyPendingId = await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        uploadRootId: rootId,
        uploadMessageKey: "vision-reply-1",
        uploadExpiresAt: nowMs + 60_000,
        attachmentKind: "image",
        status: "pending",
        name: "calendar.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        storageId: calendarStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 100,
        updatedAt: nowMs + 100,
      });
      await claimInteractionAttachmentsForTarget({
        ctx,
        communityId,
        replyId: calendarReplyId,
        attachments: [{
          id: String(replyPendingId),
          attachmentId: replyPendingId,
          name: "calendar.png",
          attachmentKind: "image",
          mimeType: "image/png",
          sizeBytes: PNG_BYTES.byteLength,
        }],
        actorUserId: userId,
        nowMs: nowMs + 100,
        messageKey: "vision-reply-1",
      });
      const claimedReplyAttachment = await ctx.db.get(replyPendingId);
      if (claimedReplyAttachment?.rootId !== undefined) {
        throw new Error("expected canonical reply attachment to omit rootId");
      }

      // Must be ignored: SVG image.
      await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        replyId: calendarReplyId,
        attachmentKind: "image",
        status: "uploaded",
        name: "vector.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 120,
        storageId: ignoredStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 101,
        updatedAt: nowMs + 101,
      });
      // Must be ignored: pending upload, deleted image, PDF file, and wrong-channel row.
      await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        replyId: calendarReplyId,
        attachmentKind: "image",
        status: "pending",
        name: "pending.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        storageId: ignoredStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 102,
        updatedAt: nowMs + 102,
      });
      await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        replyId: calendarReplyId,
        attachmentKind: "image",
        status: "deleted",
        name: "deleted.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        storageId: ignoredStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 103,
        updatedAt: nowMs + 103,
      });
      await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: generalId,
        replyId: calendarReplyId,
        attachmentKind: "file",
        status: "uploaded",
        name: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
        storageId: ignoredStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 104,
        updatedAt: nowMs + 104,
      });
      await ctx.db.insert("communityInteractionAttachments", {
        communityId,
        channelId: secretChannelId,
        replyId: calendarReplyId,
        attachmentKind: "image",
        status: "uploaded",
        name: "wrong-channel.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        storageId: ignoredStorageId,
        createdByActorType: "human",
        createdByUserId: userId,
        createdAt: nowMs + 105,
        updatedAt: nowMs + 105,
      });

      const mentionId = await ctx.db.insert("communityInteractionMentions", {
        communityId,
        channelId: generalId,
        rootId,
        replyId: mentionReplyId,
        mentionKind: "community_agent",
        mentionedAgentKey: "community_agent",
        notifyState: "sent",
        createdAt: nowMs + 200,
        updatedAt: nowMs + 200,
      });
      const requestId = await ctx.db.insert("communityAgentServeRequests", {
        communityId,
        agentKey: "community_agent",
        sourceMentionId: mentionId,
        sourceRootId: rootId,
        sourceReplyId: mentionReplyId,
        requesterUserId: userId,
        sponsorUserId: userId,
        intakeReason: "accepted",
        sourceVisibilityScope: "community",
        responseVisibilityScope: "community",
        status: "running",
        attempt: 1,
        createdAt: nowMs + 200,
        updatedAt: nowMs + 200,
      } as any);
      return {
        requestId,
        expectedAttempt: 1,
        calendarStorageId: String(calendarStorageId),
        rootPhotoStorageId: String(rootPhotoStorageId),
      };
    });

    const context = await t.query(
      internalRefs.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
      { requestId, expectedAttempt },
    );

    expect(context.ok).toBe(true);
    const images = context.threadContext.images ?? [];
    expect(images.map((img: any) => img.name)).toEqual(["whiteboard.png", "calendar.png"]);
    expect(images.map((img: any) => img.storageId)).toEqual([rootPhotoStorageId, calendarStorageId]);
    expect(images.map((img: any) => img.turnLabel)).toEqual(["original post", "reply #1"]);
    expect(context.threadContext.rendered).toContain("[attached image: whiteboard.png]");
    expect(context.threadContext.rendered).toContain("[attached image: calendar.png]");

    // Persisted snapshot prompt must NOT contain any signed storage URLs.
    const snapshotBundle = buildCommunityAgentServePromptBundle(context);
    expect(typeof snapshotBundle.messages[1]!.content).toBe("string");
    expect(String(snapshotBundle.messages[1]!.content)).toContain("1. whiteboard.png (from Rashid (@rashid), original post)");
    expect(String(snapshotBundle.messages[1]!.content)).toContain("2. calendar.png (from Rashid (@rashid), reply #1)");
    expect(JSON.stringify(snapshotBundle.messages)).not.toContain("https://");

    // Live model call receives multimodal image parts for valid HTTPS URLs only.
    const liveBundle = buildCommunityAgentServePromptBundle({
      ...context,
      resolvedThreadImages: [
        { attachmentId: "a1", name: "whiteboard.png", speaker: "Rashid (@rashid)", turnLabel: "original post", imageUrl: "https://storage.example.com/whiteboard.png" },
        { attachmentId: "a2", name: "calendar.png", speaker: "Rashid (@rashid)", turnLabel: "reply #1", imageUrl: "https://storage.example.com/calendar.png" },
        { attachmentId: "a3", name: "bad.png", speaker: "Rashid (@rashid)", turnLabel: "reply #1", imageUrl: "http://insecure.example.com/bad.png" },
      ],
    });
    const liveUserContent = liveBundle.messages[1]!.content;
    expect(Array.isArray(liveUserContent)).toBe(true);
    expect(liveUserContent).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "image", imageUrl: "https://storage.example.com/whiteboard.png" },
      { type: "image", imageUrl: "https://storage.example.com/calendar.png" },
    ]);
  });

  test("caps thread vision inputs at 4 images prioritizing the triggering turn and newest replies in chronological order", () => {
    const makeTurn = (id: string, kind: "root" | "reply", seq: number | null, imgName: string): CommunityAgentThreadTurnInput => ({
      id,
      kind,
      seq,
      actorType: "human",
      actorUserId: "u1",
      actorAgentKey: null,
      displayName: "Rashid",
      handle: "rashid",
      targetReplyId: null,
      visibilityScope: "community",
      createdAt: 1000 + (seq ?? 0) * 100,
      editedAt: null,
      content: `Turn ${id}`,
      images: [
        {
          attachmentId: `att-${id}`,
          storageId: `st-${id}`,
          name: imgName,
          mimeType: "image/png",
          sizeBytes: 1024,
        },
      ],
    });

    const compiled = compileCommunityAgentThreadContext({
      capturedAt: 2000,
      selfAgentKey: "community_agent",
      selfAgentDisplayName: "Polynet",
      requesterUserId: "u1",
      requesterTimezone: null,
      sourceRootId: "r0",
      sourceReplyId: "r5",
      turns: [
        makeTurn("r0", "root", null, "oldest.png"),
        makeTurn("r1", "reply", 1, "first.png"),
        makeTurn("r2", "reply", 2, "second.png"),
        makeTurn("r3", "reply", 3, "third.png"),
        makeTurn("r4", "reply", 4, "fourth.png"),
        makeTurn("r5", "reply", 5, "trigger.png"),
      ],
      participants: [
        { userId: "u1", displayName: "Rashid", handle: "rashid", role: "member", activeInCommunity: true, situation: null, goals: [], interests: [], facts: [] },
      ],
    });

    expect((compiled.images ?? []).map((img) => img.name)).toEqual([
      "second.png",
      "third.png",
      "fourth.png",
      "trigger.png",
    ]);
  });
});
