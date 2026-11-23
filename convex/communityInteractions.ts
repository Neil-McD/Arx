import { markCommunityMemoryReviewDue } from "./communityMemory";
import { markCommunityBriefDue } from "./communityBriefs";
import { markReplyDraftDue } from "./communityReplyDrafts";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fingerprintCommunityComposerPayload } from "./communityComposerReplay";
import { v } from "convex/values";
import { requireCommunityChannelCapability, resolveCommunityChannelActor } from "./communityChannelAccess";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityModerator,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import {
  claimInteractionAttachmentsForTarget,
  resolveInteractionAttachmentClaims,
} from "./communityInteractionAttachmentBridge";
import {
  intakeCommunityAgentTurn,
  type ConciergeMentionRow,
} from "./communityAgentConciergeCore";
import { textContainsEverybodyMentionToken } from "./communityMentionBroadcasts";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import {
  buildCommunityFounderWelcomeText,
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import {
  clearPinnedRootIfMatches,
  ensureReplyChannelMatchesRoot,
  interactionBelongsToChannel,
  interactionIsChannelAddressable,
  listChannelReadableRows,
  requireChannelForAddressableRoot,
  resolveAuthorizedCommunityChannel,
} from "./communityChannelCore";
import {
  insertCommunityInteractionMentionRows,
  mapMentions,
  resolveMentionedUserIdsForInteractionWrite,
  suppressPendingMentionsForDeletedInteractionTarget,
  suppressPendingMentionsMissingFromInteractionText,
} from "./communityInteractionMentionsCore";
import {
  MAX_INTERACTION_TEXT_CHARS,
  type InteractionReplyRow,
  type InteractionRootRow,
  type NormalizedContentBlock,
  assertCommunityReadableReply,
  assertCommunityReadableRoot,
  assertLiveInteractionTarget,
  composerContentSummary,
  composerIdempotencyKey,
  contentSummary,
  extractLinkBlocksFromText,
  getExistingReplyByIdempotencyKey,
  getExistingRootByIdempotencyKey,
  insertContentBlocksForTarget,
  interactionVisibilityIsCommunityReadable,
  isReadableRootInCommunityChannel,
  listContentBlocksForReply,
  listContentBlocksForRoot,
  loadCommunityInteractionTarget,
  mapReactionSummary,
  mapReplyBundle,
  mapRootBundle,
  nextReplySeq,
  normalizeBeforeNumber,
  normalizeBoundedText,
  normalizeIdempotencyKey,
  normalizeReadLimit,
  resolveOptionalReplyTargetForCanonicalComposer,
  resolveReplyVisibilityScope,
} from "./communityInteractionBundlesCore";

export { mapMentions, resolveMentionedUserIdsForInteractionWrite };

const MAX_INTERACTION_ROOT_READ_LIMIT = 50;
const MAX_INTERACTION_REPLY_READ_LIMIT = 100;
const MAX_VIEWER_REACTIONS_PER_TARGET = 24;

const rootKindValidator = v.union(
  v.literal("discussion"),
  v.literal("announcement"),
  v.literal("question"),
  v.literal("resource_share"),
  v.literal("agent_signal"),
);

const interactionAttachmentInputValidator = v.object({
  attachmentId: v.id("communityInteractionAttachments"),
});

const communityInteractionComposerArgs = {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    idempotencyKey: v.string(),
    text: v.string(),
    rootId: v.optional(v.union(v.id("communityInteractionRoots"), v.null())),
    replyToMessageId: v.optional(v.union(v.string(), v.null())),
    // userId accepts a canonical users id OR an auth subject — the profiles
    // projection (the composer's member source) only knows the latter.
    mentions: v.optional(
      v.array(
        v.object({
          userId: v.optional(v.string()),
          agentKey: v.optional(v.string()),
          roleKey: v.optional(v.string()),
        }),
      ),
    ),
    attachments: v.optional(v.array(interactionAttachmentInputValidator)),
    // The community's agent writing for this member (Agent page tool use).
    asCommunityAgent: v.optional(v.boolean()),
  };

// One composer path. The public mutation verifies the signed-in caller; the
// internal variant serves trusted server adapters (community apps) that have
// already authenticated the member, and must never take a client-chosen user.
async function createCommunityInteractionComposerMessageCore(
  ctx: any,
  args: any,
  trustedUserId?: any,
  viaAi = false,
) {
    const userId = trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    // The agent acts within this member's access, so the channel checks are the member's.
    const forMember = args.asCommunityAgent === true;
    const channelActor = await resolveCommunityChannelActor({
      ctx, communityId: args.communityId, userId,
      kind: forMember ? "community_agent_for_member" : "human",
    });
    await requireProfileSetupCompleteForUser(ctx, userId);

    const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
    const attachments = await resolveInteractionAttachmentClaims({ ctx, communityId: args.communityId,
      actorUserId: userId, messageKey: args.idempotencyKey, rootId: args.rootId,
      attachments: args.attachments ?? [] });
    if (!text && attachments.length === 0) throw new Error("interaction_content_required");
    if (args.rootId && textContainsEverybodyMentionToken(text)) {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    const contentBlocks: NormalizedContentBlock[] = text
      ? [
          { blockType: "markdown_text", text },
          ...extractLinkBlocksFromText(text),
        ]
      : [];
    const summary = composerContentSummary(contentBlocks, attachments);
    // One agent per community: what it writes for a member is the community
    // agent's post, attributed to the member it acted for (actorUserId).
    const actorType = forMember ? "community_agent" : "human";
    const actorAgentKey = forMember ? CANONICAL_COMMUNITY_AGENT_KEY : null;
    const mentionedUserIds = await resolveMentionedUserIdsForInteractionWrite({
      ctx,
      communityId: args.communityId,
      actorUserId: userId,
      targetKind: args.rootId ? "reply" : "root",
      text,
      mentions: args.mentions ?? [],
    });
    const nowMs = Date.now();

    if (!args.rootId) {
      const requestedChannel = await resolveAuthorizedCommunityChannel({
        ctx,
        actor: channelActor,
        capability: "canPost",
        communityId: args.communityId,
        channelId: args.channelId,
        ensureGeneralForWrite: true,
        nowMs,
      });
      const idempotencyKey = composerIdempotencyKey(
        normalizeIdempotencyKey(args.idempotencyKey),
        "root",
        actorType,
      );
      const composerPayloadHash = await fingerprintCommunityComposerPayload({
        channelId: String(requestedChannel._id), text,
        attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
      });
      let root = await getExistingRootByIdempotencyKey(ctx, args.communityId, idempotencyKey);
      let communityAgentMention: ConciergeMentionRow | null = null;
      let deduped = true;
      if (
        root &&
        (root.actorType !== actorType ||
          normalizeIdValue(root.actorUserId) !== normalizeIdValue(userId) ||
          normalizeIdValue(root.actorAgentKey) !==
            normalizeIdValue(actorAgentKey) ||
          root.composerPayloadHash !== composerPayloadHash)
      ) {
        throw new Error("interaction_idempotency_key_conflict");
      }
      if (root) {
        const existingChannel = await requireChannelForAddressableRoot({
          ctx,
          root,
          nowMs,
          actor: channelActor,
        });
        if (
          normalizeIdValue(existingChannel._id) !==
          normalizeIdValue(requestedChannel._id)
        ) {
          throw new Error("interaction_idempotency_key_conflict");
        }
      }
      if (!root) {
        const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
          communityId: args.communityId,
          channelId: requestedChannel._id,
          actorType,
          actorUserId: userId,
          ...(actorAgentKey ? { actorAgentKey } : {}),
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: summary,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          ...(viaAi ? { viaAi: true } : {}),
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await insertContentBlocksForTarget({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          visibilityScope: "community",
          blocks: contentBlocks,
          nowMs,
        });
        const mentionRows = await insertCommunityInteractionMentionRows({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          mentionedUserIds,
          actorUserId: userId,
          nowMs,
        });
        communityAgentMention = mentionRows.communityAgentMention;
        root = (await ctx.db.get(rootId as any)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        await markCommunityMemoryReviewDue(ctx, { communityId: args.communityId, channelId: requestedChannel._id, actorType, nowMs });
        await markCommunityBriefDue(ctx, { communityId: args.communityId, channelId: requestedChannel._id, actorType, nowMs });
        await markReplyDraftDue(ctx, { communityId: args.communityId, channelId: requestedChannel._id, actorType, nowMs });
        await claimInteractionAttachmentsForTarget({
          ctx,
          messageKey: args.idempotencyKey,
          communityId: args.communityId,
          rootId: root._id,
          attachments,
          actorUserId: userId,
          nowMs,
        });
        deduped = false;
      }

      const rootChannel = await requireChannelForAddressableRoot({ ctx, root, actor: channelActor });
      if (
        normalizeIdValue(rootChannel._id) !==
        normalizeIdValue(requestedChannel._id)
      ) {
        throw new Error("interaction_channel_mismatch");
      }

      if (actorType === "human") {
        await intakeCommunityAgentTurn({
          ctx,
          communityId: args.communityId,
          rootId: root._id,
          ...(communityAgentMention ? { mention: communityAgentMention } : {}),
          nowMs,
        });
      }

      await scheduleCommunityInteractionEvidenceSync({
        ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
      return {
        rows: [],
        interaction: {
          kind: "root",
          root_id: normalizeIdValue(root._id),
          reply_id: null,
          deduped,
          idempotency_key: idempotencyKey,
        },
      };
    }

    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_not_found");
    if (normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("interaction_root_community_mismatch");
    }
    if (root.status !== "live" || root.lockedAt) {
      throw new Error("interaction_root_closed");
    }
    const rootChannel = await requireChannelForAddressableRoot({ ctx, root, actor: channelActor });
    await requireCommunityChannelCapability({ ctx, channel: rootChannel, actor: channelActor, capability: "canReply" });
    if (
      args.channelId &&
      normalizeIdValue(rootChannel._id) !== normalizeIdValue(args.channelId)
    ) {
      throw new Error("interaction_channel_mismatch");
    }

    const idempotencyKey = composerIdempotencyKey(
      normalizeIdempotencyKey(args.idempotencyKey),
      "reply",
      actorType,
    );
    const replyTarget = await resolveOptionalReplyTargetForCanonicalComposer({
      ctx,
      root,
      rootChannel,
      replyToMessageId: args.replyToMessageId ?? null,
    });
    const composerPayloadHash = await fingerprintCommunityComposerPayload({
      channelId: String(rootChannel._id), rootId: String(root._id),
      targetReplyId: replyTarget.targetReplyId ? String(replyTarget.targetReplyId) : undefined,
      text, attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
    });
    let reply = await getExistingReplyByIdempotencyKey(ctx, root.communityId, idempotencyKey);
    let communityAgentMention: ConciergeMentionRow | null = null;
    let deduped = true;
    if (
      reply &&
      (normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id) ||
        reply.actorType !== actorType ||
        normalizeIdValue(reply.actorUserId) !== normalizeIdValue(userId) ||
        normalizeIdValue(reply.actorAgentKey) !==
          normalizeIdValue(actorAgentKey) ||
        normalizeIdValue(reply.targetReplyId) !==
          normalizeIdValue(replyTarget.targetReplyId) ||
        reply.composerPayloadHash !== composerPayloadHash)
    ) {
      throw new Error("interaction_idempotency_key_conflict");
    }

    if (!reply) {
      const visibilityScope = resolveReplyVisibilityScope(root.visibilityScope, root.visibilityScope);
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert("communityInteractionReplies" as any, {
        communityId: root.communityId,
        channelId: rootChannel._id,
        rootId: root._id,
        seq,
        actorType,
        actorUserId: userId,
        ...(actorAgentKey ? { actorAgentKey } : {}),
        ...(replyTarget.targetReplyId ? { targetReplyId: replyTarget.targetReplyId } : {}),
        status: "live",
        visibilityScope,
        contentSummary: summary,
        reactionSummary: [],
        idempotencyKey,
        composerPayloadHash,
        ...(viaAi ? { viaAi: true } : {}),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await insertContentBlocksForTarget({
        ctx,
        communityId: root.communityId,
        channelId: rootChannel._id,
        replyId,
        visibilityScope,
        blocks: contentBlocks,
        nowMs,
      });
      const mentionRows = await insertCommunityInteractionMentionRows({
        ctx,
        communityId: root.communityId,
        channelId: rootChannel._id,
        replyId,
        mentionedUserIds,
        actorUserId: userId,
        nowMs,
      });
      communityAgentMention = mentionRows.communityAgentMention;
      await ctx.db.patch(root._id as any, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId as any)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      await markCommunityMemoryReviewDue(ctx, { communityId: root.communityId, channelId: rootChannel._id, actorType, nowMs });
      await markCommunityBriefDue(ctx, { communityId: root.communityId, channelId: rootChannel._id, actorType, nowMs });
      await claimInteractionAttachmentsForTarget({
        ctx,
        messageKey: args.idempotencyKey,
        communityId: root.communityId,
        replyId: reply._id,
        attachments,
        actorUserId: userId,
        nowMs,
      });
      deduped = false;
    }

    await ensureReplyChannelMatchesRoot({ ctx, root, reply, actor: channelActor });

    if (actorType === "human") {
      await intakeCommunityAgentTurn({
        ctx,
        communityId: root.communityId,
        rootId: root._id,
        replyId: reply._id,
        ...(communityAgentMention ? { mention: communityAgentMention } : {}),
        nowMs,
      });
    }

    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: root.communityId,
      objectType: "reply",
      objectId: reply._id,
    });
    return {
      rows: [],
      interaction: {
        kind: "reply",
        root_id: normalizeIdValue(root._id),
        reply_id: normalizeIdValue(reply._id),
        deduped,
        idempotency_key: idempotencyKey,
      },
    };
}

export const createCommunityInteractionComposerMessage = mutation({
  args: communityInteractionComposerArgs,
  handler: (ctx, args) => createCommunityInteractionComposerMessageCore(ctx, args),
});

export const createCommunityInteractionComposerMessageForTrustedUserInternal = internalMutation({
  // viaAi: written through the member's own AI (the MCP). Only this trusted
  // door takes it, so a client cannot set or clear the mark.
  args: { ...communityInteractionComposerArgs, trustedUserId: v.id("users"), viaAi: v.optional(v.boolean()) },
  handler: (ctx, { trustedUserId, viaAi, ...args }) =>
    createCommunityInteractionComposerMessageCore(ctx, args, trustedUserId, viaAi === true),
});

export const createCommunityAgentCanonicalInteractionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    idempotencyKey: v.string(),
    text: v.optional(v.string()),
    founderBootstrap: v.optional(v.boolean()),
    rootId: v.optional(v.union(v.id("communityInteractionRoots"), v.null())),
    replyToMessageId: v.optional(v.union(v.string(), v.null())),
    mentions: v.optional(
      v.array(
        v.object({
          userId: v.optional(v.string()),
          agentKey: v.optional(v.string()),
          roleKey: v.optional(v.string()),
        }),
      ),
    ),
    attachments: v.optional(v.array(interactionAttachmentInputValidator)),
  },
  handler: async (ctx, args) => {
    const founderBootstrap = args.founderBootstrap === true;
    let sponsorUserId: any;
    let canonicalText = args.text ?? "";
    if (founderBootstrap) {
      if (
        args.rootId ||
        args.replyToMessageId ||
        (args.mentions?.length ?? 0) > 0 ||
        (args.attachments?.length ?? 0) > 0 ||
        args.idempotencyKey !== communityFounderWelcomeIdempotencyKey(args.communityId)
      ) {
        throw new Error("community_founder_welcome_contract_invalid");
      }
      const [community, founderIdentity] = await Promise.all([
        ctx.db.get(args.communityId),
        readCanonicalUserIdentityProjection(ctx, args.userId),
      ]);
      if (!community || String(community.ownerId) !== String(args.userId) || !founderIdentity) {
        throw new Error("community_founder_welcome_owner_required");
      }
      sponsorUserId = args.userId;
      canonicalText = buildCommunityFounderWelcomeText({
        founderDisplayName: founderIdentity.displayName,
        communityName: community.name,
      });
    } else {
      sponsorUserId = await resolveUserIdForAuthenticatedRequest({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
      });
    }
    const channelActor = await resolveCommunityChannelActor({
      ctx,
      communityId: args.communityId,
      userId: sponsorUserId,
      kind: "community_agent",
    });

    const text = normalizeBoundedText(canonicalText, MAX_INTERACTION_TEXT_CHARS);
    const attachments = await resolveInteractionAttachmentClaims({ ctx, communityId: args.communityId,
      actorUserId: sponsorUserId, messageKey: args.idempotencyKey, rootId: args.rootId,
      attachments: args.attachments ?? [] });
    if (!text && attachments.length === 0) {
      throw new Error("interaction_content_required");
    }
    if (args.rootId && textContainsEverybodyMentionToken(text)) {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    if (args.mentions?.some((mention) => Boolean(String(mention.agentKey ?? "").trim()))) {
      throw new Error("interaction_mention_agent_self_reference");
    }
    const contentBlocks: NormalizedContentBlock[] = text
      ? [
          { blockType: "markdown_text", text },
          ...extractLinkBlocksFromText(text),
        ]
      : [];
    const summary = composerContentSummary(contentBlocks, attachments);
    const mentionedUserIds =
      await resolveMentionedUserIdsForInteractionWrite({
        ctx,
        communityId: args.communityId,
        actorUserId: sponsorUserId,
        targetKind: args.rootId ? "reply" : "root",
        text,
        mentions: args.mentions ?? [],
      });
    const nowMs = Date.now();
    const requestedChannel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: args.rootId ? "canReply" : "canPost",
      communityId: args.communityId,
      channelId: args.channelId,
      ensureGeneralForWrite: true,
      nowMs,
    });
    const idempotencyKey = composerIdempotencyKey(
      normalizeIdempotencyKey(args.idempotencyKey),
      args.rootId ? "reply" : "root",
      "community_agent",
    );

    if (!args.rootId) {
      const composerPayloadHash = await fingerprintCommunityComposerPayload({
        channelId: String(requestedChannel._id), text,
        attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
      });
      let root = await getExistingRootByIdempotencyKey(
        ctx,
        args.communityId,
        idempotencyKey,
      );
      let deduped = true;
      if (
        root &&
        (root.actorType !== "community_agent" ||
          Boolean(root.actorUserId) ||
          root.actorAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY ||
          (!founderBootstrap && root.composerPayloadHash !== composerPayloadHash))
      ) {
        throw new Error("interaction_idempotency_key_conflict");
      }
      if (root) {
        const existingChannel = await requireChannelForAddressableRoot({
          ctx,
          root,
          nowMs,
          actor: channelActor,
        });
        if (
          normalizeIdValue(existingChannel._id) !==
          normalizeIdValue(requestedChannel._id)
        ) {
          throw new Error("interaction_idempotency_key_conflict");
        }
      }
      if (!root) {
        const rootId = await ctx.db.insert("communityInteractionRoots" as any, {
          communityId: args.communityId,
          channelId: requestedChannel._id,
          actorType: "community_agent",
          actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
          kind: "discussion",
          status: "live",
          visibilityScope: "community",
          contentSummary: summary,
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        await insertContentBlocksForTarget({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          visibilityScope: "community",
          blocks: contentBlocks,
          nowMs,
        });
        await insertCommunityInteractionMentionRows({
          ctx,
          communityId: args.communityId,
          channelId: requestedChannel._id,
          rootId,
          mentionedUserIds,
          actorUserId: sponsorUserId,
          nowMs,
        });
        root = (await ctx.db.get(rootId)) as InteractionRootRow | null;
        if (!root) throw new Error("interaction_root_create_failed");
        await claimInteractionAttachmentsForTarget({
          ctx,
          messageKey: args.idempotencyKey,
          communityId: args.communityId,
          rootId: root._id,
          attachments,
          actorUserId: sponsorUserId,
          nowMs,
        });
        deduped = false;
      }
      await requireChannelForAddressableRoot({ ctx, root, nowMs, actor: channelActor });
      await scheduleCommunityInteractionEvidenceSync({
        ctx,
        communityId: args.communityId,
        objectType: "root",
        objectId: root._id,
      });
      return {
        rows: [],
        interaction: {
          kind: "root",
          root_id: normalizeIdValue(root._id),
          reply_id: null,
          deduped,
          idempotency_key: idempotencyKey,
        },
      };
    }

    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (
      !root ||
      normalizeIdValue(root.communityId) !==
        normalizeIdValue(args.communityId)
    ) {
      throw new Error("interaction_root_not_found");
    }
    if (root.status !== "live" || root.lockedAt) {
      throw new Error("interaction_root_closed");
    }
    const rootChannel = await requireChannelForAddressableRoot({
      ctx,
      root,
      nowMs,
      actor: channelActor,
    });
    if (
      normalizeIdValue(rootChannel._id) !==
      normalizeIdValue(requestedChannel._id)
    ) {
      throw new Error("interaction_channel_mismatch");
    }
    const replyTarget = await resolveOptionalReplyTargetForCanonicalComposer({
      ctx,
      root,
      rootChannel,
      replyToMessageId: args.replyToMessageId ?? null,
    });
    const composerPayloadHash = await fingerprintCommunityComposerPayload({
      channelId: String(rootChannel._id), rootId: String(root._id),
      targetReplyId: replyTarget.targetReplyId ? String(replyTarget.targetReplyId) : undefined,
      text, attachmentIds: attachments.map(attachment => attachment.attachmentId!), mentions: mentionedUserIds,
    });
    let reply = await getExistingReplyByIdempotencyKey(
      ctx,
      args.communityId,
      idempotencyKey,
    );
    let deduped = true;
    if (
      reply &&
      (normalizeIdValue(reply.rootId) !== normalizeIdValue(root._id) ||
        reply.actorType !== "community_agent" ||
        Boolean(reply.actorUserId) ||
        reply.actorAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY ||
        normalizeIdValue(reply.targetReplyId) !==
          normalizeIdValue(replyTarget.targetReplyId) ||
        reply.composerPayloadHash !== composerPayloadHash)
    ) {
      throw new Error("interaction_idempotency_key_conflict");
    }
    if (!reply) {
      const visibilityScope = resolveReplyVisibilityScope(
        root.visibilityScope,
        root.visibilityScope,
      );
      const seq = await nextReplySeq(ctx, root._id);
      const replyId = await ctx.db.insert(
        "communityInteractionReplies" as any,
        {
          communityId: args.communityId,
          channelId: rootChannel._id,
          rootId: root._id,
          seq,
          actorType: "community_agent",
          actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
          ...(replyTarget.targetReplyId
            ? { targetReplyId: replyTarget.targetReplyId }
            : {}),
          status: "live",
          visibilityScope,
          contentSummary: summary,
          reactionSummary: [],
          idempotencyKey,
          composerPayloadHash,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      await insertContentBlocksForTarget({
        ctx,
        communityId: args.communityId,
        channelId: rootChannel._id,
        replyId,
        visibilityScope,
        blocks: contentBlocks,
        nowMs,
      });
      await insertCommunityInteractionMentionRows({
        ctx,
        communityId: args.communityId,
        channelId: rootChannel._id,
        replyId,
        mentionedUserIds,
        actorUserId: sponsorUserId,
        nowMs,
      });
      await ctx.db.patch(root._id, {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0)) + 1,
        lastReplyAt: nowMs,
        updatedAt: nowMs,
      });
      reply = (await ctx.db.get(replyId)) as InteractionReplyRow | null;
      if (!reply) throw new Error("interaction_reply_create_failed");
      await claimInteractionAttachmentsForTarget({
        ctx,
        messageKey: args.idempotencyKey,
        communityId: args.communityId,
        replyId: reply._id,
        attachments,
        actorUserId: sponsorUserId,
        nowMs,
      });
      deduped = false;
    }
    await ensureReplyChannelMatchesRoot({ ctx, root, reply, nowMs, actor: channelActor });
    await scheduleCommunityInteractionEvidenceSync({
      ctx,
      communityId: args.communityId,
      objectType: "reply",
      objectId: reply._id,
    });
    return {
      rows: [],
      interaction: {
        kind: "reply",
        root_id: normalizeIdValue(root._id),
        reply_id: normalizeIdValue(reply._id),
        deduped,
        idempotency_key: idempotencyKey,
      },
    };
  },
});

export const listCommunityInteractionRoots = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    beforeCreatedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
    kind: v.optional(v.union(rootKindValidator, v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });

    const limit = normalizeReadLimit(args.limit, MAX_INTERACTION_ROOT_READ_LIMIT, 30);
    const beforeCreatedAt = normalizeBeforeNumber(args.beforeCreatedAt);
    const kind = args.kind ?? null;
    const visibleRows = await listChannelReadableRows<InteractionRootRow>({
      ctx,
      actor: channelActor,
      tableName: "communityInteractionRoots",
      communityId: args.communityId,
      channel,
      limit,
      beforeCreatedAt,
      kind,
    });
    const userIdCache = new Map<string, string | null>();
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", visibleRows.map((row) => row._id));
    const bundles = await Promise.all(
      visibleRows.map((row) => mapRootBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [])),
    );
    return {
      roots: bundles,
      next_before_created_at:
        visibleRows.length === limit && visibleRows.length > 0
          ? visibleRows[visibleRows.length - 1]!.createdAt
          : null,
    };
  },
});

export const getCommunityChannelPinnedRoot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });
    if (!channel.pinnedRootId) return { pinned_root: null };
    const root = (await ctx.db.get(channel.pinnedRootId)) as InteractionRootRow | null;
    if (!root || !isReadableRootInCommunityChannel({ root, communityId: args.communityId, channel })) {
      throw new Error("community_channel_pin_invalid");
    }
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", [root._id]);
    return {
      pinned_root: await mapRootBundle(
        ctx,
        root,
        false,
        new Map<string, string | null>(),
        viewerMap.get(normalizeIdValue(root._id)) ?? [],
      ),
    };
  },
});

export const getCommunityChannelInteractionRoot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.id("communityInteractionRoots"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: args.communityId,
      channelId: args.channelId,
    });
    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root || !isReadableRootInCommunityChannel({ root, communityId: args.communityId, channel })) {
      return { root: null };
    }
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "root", [root._id]);
    return {
      root: await mapRootBundle(
        ctx,
        root,
        false,
        new Map<string, string | null>(),
        viewerMap.get(normalizeIdValue(root._id)) ?? [],
      ),
    };
  },
});

export const listCommunityInteractionReplies = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    rootId: v.id("communityInteractionRoots"),
    beforeSeq: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const root = (await ctx.db.get(args.rootId)) as InteractionRootRow | null;
    if (!root) throw new Error("interaction_root_not_found");
    assertCommunityReadableRoot(root);
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const channelActor = await resolveCommunityChannelActor({ ctx, communityId: root.communityId, userId });
    const rootChannel = await resolveAuthorizedCommunityChannel({
      ctx,
      actor: channelActor,
      capability: "canRead",
      communityId: root.communityId,
      channelId: root.channelId,
    });

    const limit = normalizeReadLimit(args.limit, MAX_INTERACTION_REPLY_READ_LIMIT, 50);
    const beforeSeq = normalizeBeforeNumber(args.beforeSeq);
    const rows = (await ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_root_seq", (q: any) => {
        const base = q.eq("rootId", root._id);
        return beforeSeq === null ? base : base.lt("seq", beforeSeq);
      })
      .order("desc")
      .take(MAX_INTERACTION_REPLY_READ_LIMIT)) as InteractionReplyRow[];
    const filtered = rows
      .filter((row) => {
        try {
          assertCommunityReadableReply(row);
          if (!interactionBelongsToChannel(row, rootChannel)) {
            throw new Error("interaction_reply_channel_mismatch");
          }
          return true;
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.seq - right.seq)
      .slice(-limit);
    const userIdCache = new Map<string, string | null>();
    const viewerMap = await loadViewerReactionMapForTargets(ctx, userId, "reply", filtered.map((row) => row._id));
    const bundles = await Promise.all(
      filtered.map((row) => mapReplyBundle(ctx, row, false, userIdCache, viewerMap.get(normalizeIdValue(row._id)) ?? [])),
    );
    return {
      root_id: normalizeIdValue(root._id),
      replies: bundles,
      next_before_seq:
        filtered.length === limit && filtered.length > 0
          ? Math.max(0, Math.floor(filtered[0]!.seq ?? 0))
          : null,
    };
  },
});

async function loadViewerReactionMapForTargets(
  ctx: any,
  userId: any,
  targetType: "root" | "reply",
  targetIds: any[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!userId) return map;
  const actorKey = normalizeIdValue(userId);
  const uniqueTargetIds = Array.from(new Map(targetIds.map((id) => [normalizeIdValue(id), id])).values());
  await Promise.all(
    uniqueTargetIds.map(async (targetId) => {
      const rows = await ctx.db
        .query("communityInteractionReactions" as any)
        .withIndex(
          targetType === "root" ? "by_root_actor_emoji" : "by_reply_actor_emoji",
          (q: any) =>
            q
              .eq(targetType === "root" ? "rootId" : "replyId", targetId)
              .eq("actorKey", actorKey),
        )
        .take(MAX_VIEWER_REACTIONS_PER_TARGET);
      const emojis = rows
        .map((row: any) => String(row.emoji ?? "").trim().slice(0, 32))
        .filter(Boolean);
      if (emojis.length > 0) map.set(normalizeIdValue(targetId), emojis);
    }),
  );
  return map;
}

function applyReactionSummaryDelta(
  current: Array<{ emoji: string; count: number }> | undefined,
  emoji: string,
  delta: 1 | -1,
): Array<{ emoji: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of mapReactionSummary(current)) {
    counts.set(row.emoji, row.count);
  }
  const next = Math.max(0, (counts.get(emoji) ?? 0) + delta);
  if (next > 0) {
    counts.set(emoji, next);
  } else {
    counts.delete(emoji);
  }
  return Array.from(counts.entries()).map(([emojiValue, count]) => ({ emoji: emojiValue, count }));
}

async function requireTargetChannelAccess(args: {
  ctx: any; target: InteractionRootRow | InteractionReplyRow; userId: any;
}) {
  // Non-channel dock interactions retain their existing separate authority.
  if (!interactionIsChannelAddressable(args.target)) return;
  const root = "rootId" in args.target
    ? await args.ctx.db.get(args.target.rootId)
    : args.target;
  if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(args.target.communityId)) {
    throw new Error("community_channel_unavailable");
  }
  const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: root.communityId, userId: args.userId });
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx, communityId: root.communityId, channelId: root.channelId,
    actor, capability: "canRead",
  });
  if (!interactionBelongsToChannel(args.target, channel)) throw new Error("community_channel_unavailable");
}

// Sets one member's reaction on a post or reply. `on` undefined toggles (the
// web composer); true or false sets it, so retries are safe (the door).
async function setCommunityInteractionReactionCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string; emoji: string; on?: boolean;
}, userId: any) {
  const emoji = String(args.emoji).trim().slice(0, 32);
  if (!emoji) throw new Error("reaction_emoji_required");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  assertLiveInteractionTarget(target);
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  const actorKey = normalizeIdValue(userId);
  const nowMs = Date.now();
  const existing = await ctx.db
    .query("communityInteractionReactions" as any)
    .withIndex(
      args.targetType === "root" ? "by_root_actor_emoji" : "by_reply_actor_emoji",
      (q: any) =>
        q
          .eq(args.targetType === "root" ? "rootId" : "replyId", target._id)
          .eq("actorKey", actorKey)
          .eq("emoji", emoji),
    )
    .first();
  const reacted = args.on ?? !existing;
  if (reacted === Boolean(existing)) {
    return { reacted, reaction_summary: mapReactionSummary(target.reactionSummary) };
  }
  if (existing) {
    await ctx.db.delete(existing._id);
  } else {
    await ctx.db.insert("communityInteractionReactions" as any, {
      communityId,
      targetType: args.targetType,
      ...(args.targetType === "root" ? { rootId: target._id } : { replyId: target._id }),
      actorType: "human",
      actorKey,
      actorUserId: userId,
      emoji,
      createdAt: nowMs,
    });
  }
  const summary = applyReactionSummaryDelta(target.reactionSummary, emoji, reacted ? 1 : -1);
  await ctx.db.patch(target._id, { reactionSummary: summary, updatedAt: nowMs });
  return { reacted, reaction_summary: summary };
}

const reactionTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
  emoji: v.string(),
};

export const toggleCommunityInteractionReaction = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), ...reactionTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    setCommunityInteractionReactionCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    })),
});

// For the door: the member was already authenticated by the canonical executor.
export const setCommunityInteractionReactionForTrustedUserInternal = internalMutation({
  args: { ...reactionTargetArgs, on: v.boolean(), trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => setCommunityInteractionReactionCore(ctx, args, trustedUserId),
});

async function editCommunityInteractionTargetCore(args: {
  ctx: any;
  targetType: "root" | "reply";
  target: InteractionRootRow | InteractionReplyRow;
  communityId: any;
  text: string;
  actorUserId: any;
  nowMs: number;
}): Promise<void> {
  if (args.target.status !== "live") throw new Error("interaction_not_editable");
  const blocks: NormalizedContentBlock[] = args.text
    ? [
        { blockType: "markdown_text", text: args.text },
        ...extractLinkBlocksFromText(args.text),
      ]
    : [];
  const existingBlocks =
    args.targetType === "root"
      ? await listContentBlocksForRoot(args.ctx, args.target._id)
      : await listContentBlocksForReply(args.ctx, args.target._id);
  if (textContainsEverybodyMentionToken(args.text)) {
    if (args.targetType === "reply") {
      throw new Error("interaction_mention_everybody_reply_not_allowed");
    }
    const previousText = existingBlocks
      .filter((block) => block.blockType === "markdown_text")
      .map((block) => block.text)
      .join("\n\n");
    if (!textContainsEverybodyMentionToken(previousText)) {
      throw new Error("interaction_mention_everybody_edit_create_not_allowed");
    }
  }
  for (const block of existingBlocks) await args.ctx.db.delete(block._id);
  await insertContentBlocksForTarget({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: args.target.channelId,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    visibilityScope: args.target.visibilityScope,
    blocks,
    nowMs: args.nowMs,
  });
  await args.ctx.db.patch(args.target._id, {
    contentSummary: contentSummary(blocks),
    editedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await suppressPendingMentionsMissingFromInteractionText({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.target._id,
    text: args.text,
    nowMs: args.nowMs,
  });
  await args.ctx.db.insert("communityInteractionModerationEvents" as any, {
    communityId: args.communityId,
    targetType: args.targetType,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    eventType: "edit",
    actorType: "human",
    actorUserId: args.actorUserId,
    createdAt: args.nowMs,
  });
  await scheduleCommunityInteractionEvidenceSync({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: args.targetType,
    objectId: args.target._id,
  });
}

async function tombstoneCommunityInteractionTargetCore(args: {
  ctx: any;
  targetType: "root" | "reply";
  target: InteractionRootRow | InteractionReplyRow;
  communityId: any;
  actorUserId: any;
  nowMs: number;
}): Promise<void> {
  if (args.target.status === "deleted") return;
  const previousStatus = args.target.status;
  await args.ctx.db.patch(args.target._id, {
    status: "deleted",
    deletedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  if (args.targetType === "root") {
    await clearPinnedRootIfMatches({
      ctx: args.ctx,
      root: args.target as InteractionRootRow,
      actorUserId: args.actorUserId,
      reason: "root_tombstoned",
      nowMs: args.nowMs,
    });
  }
  await suppressPendingMentionsForDeletedInteractionTarget({
    ctx: args.ctx,
    targetType: args.targetType,
    targetId: args.target._id,
    nowMs: args.nowMs,
  });
  if (args.targetType === "reply") {
    const replyTarget = args.target as InteractionReplyRow;
    const root = (await args.ctx.db.get(replyTarget.rootId as any)) as InteractionRootRow | null;
    if (root) {
      const lastLive = (await args.ctx.db
        .query("communityInteractionReplies" as any)
        .withIndex("by_root_status_createdAt", (q: any) =>
          q.eq("rootId", root._id).eq("status", "live"),
        )
        .order("desc")
        .first()) as InteractionReplyRow | null;
      const rootPatch: any = {
        replyCount: Math.max(0, Math.floor(root.replyCount ?? 0) - 1),
        updatedAt: args.nowMs,
      };
      if (lastLive) rootPatch.lastReplyAt = lastLive.createdAt;
      await args.ctx.db.patch(root._id, rootPatch);
    }
  }
  await args.ctx.db.insert("communityInteractionModerationEvents" as any, {
    communityId: args.communityId,
    targetType: args.targetType,
    ...(args.targetType === "root" ? { rootId: args.target._id } : { replyId: args.target._id }),
    eventType: "tombstone",
    actorType: "human",
    actorUserId: args.actorUserId,
    previousStatus,
    nextStatus: "deleted",
    createdAt: args.nowMs,
  });
  await scheduleCommunityInteractionEvidenceSync({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: args.targetType,
    objectId: args.target._id,
  });
}

async function editCommunityInteractionMessageCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string; text: string;
}, userId: any) {
  const text = normalizeBoundedText(args.text, MAX_INTERACTION_TEXT_CHARS);
  if (!text) throw new Error("interaction_content_required");
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  assertLiveInteractionTarget(target);
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  // The community agent's words stay its own, even in a post made for you.
  if (normalizeIdValue(target.actorUserId) !== normalizeIdValue(userId) || target.actorType !== "human") {
    throw new Error("interaction_edit_forbidden");
  }
  if (target.status !== "live") throw new Error("interaction_not_editable");

  await editCommunityInteractionTargetCore({
    ctx,
    targetType: args.targetType,
    target,
    communityId,
    text,
    actorUserId: userId,
    nowMs: Date.now(),
  });
  return { ok: true };
}

const editTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
  text: v.string(),
};

export const editCommunityInteractionMessage = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), ...editTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    editCommunityInteractionMessageCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    })),
});

export const editCommunityInteractionMessageForTrustedUserInternal = internalMutation({
  args: { ...editTargetArgs, trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => editCommunityInteractionMessageCore(ctx, args, trustedUserId),
});

// Authors delete their own posts; moderators may delete others' only when
// `allowModerator` (Studio). The door deletes own posts only.
async function deleteCommunityInteractionMessageCore(ctx: any, args: {
  targetType: "root" | "reply"; targetId: string;
}, userId: any, allowModerator: boolean) {
  const { target, communityId } = await loadCommunityInteractionTarget({
    ctx,
    targetType: args.targetType,
    targetId: args.targetId,
  });
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  const isOwner = normalizeIdValue(target.actorUserId) === normalizeIdValue(userId);
  if (!isOwner) {
    let isModerator = false;
    if (allowModerator) {
      try {
        await requireCommunityModerator({ ctx, communityId, userId });
        isModerator = true;
      } catch {
        isModerator = false;
      }
    }
    if (!isModerator) throw new Error("interaction_delete_forbidden");
  }
  await tombstoneCommunityInteractionTargetCore({
    ctx,
    targetType: args.targetType,
    target,
    communityId,
    actorUserId: userId,
    nowMs: Date.now(),
  });
  return { ok: true };
}

const deleteTargetArgs = {
  targetType: v.union(v.literal("root"), v.literal("reply")),
  targetId: v.string(),
};

export const deleteCommunityInteractionMessage = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), ...deleteTargetArgs },
  handler: async (ctx, { userId, authSubject, ...args }) =>
    deleteCommunityInteractionMessageCore(ctx, args, await resolveUserIdForAuthenticatedRequest({
      ctx, userId, authSubject: authSubject ?? null,
    }), true),
});

// Moderation from a site's private twin (httpCommunityApps, private sessions
// only, so a site's own code never reaches it): a post of the session's own
// community, by ref, that its member may remove as a moderator.

// A moderator's removal of anyone's post in their community, by ref: run
// only after the person said yes to the guide's question about these posts
// (convex/polynetCanonicalExecutor.ts, askPersonFirst).
async function loadModerationTarget(ctx: any, args: { communityId: any; ref: string }) {
  const match = /^interaction:(root|reply):([A-Za-z0-9_-]{1,64})$/.exec(String(args.ref ?? ""));
  if (!match) return null;
  const targetType = match[1] as "root" | "reply";
  const id = ctx.db.normalizeId(targetType === "root" ? "communityInteractionRoots" : "communityInteractionReplies", match[2]);
  if (!id) return null;
  const target = (await ctx.db.get(id)) as InteractionRootRow | InteractionReplyRow | null;
  if (!target || normalizeIdValue(target.communityId) !== normalizeIdValue(args.communityId)) return null;
  return { targetType, target };
}

export const removeInteractionForTrustedModeratorInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), ref: v.string() },
  handler: async (ctx, args) => {
    const found = await loadModerationTarget(ctx, args);
    if (!found) throw new Error("interaction_target_not_found");
    // Already removed: still removed (a retried selection), for a moderator.
    if (found.target.status === "deleted") {
      await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
      return { ok: true, alreadyRemoved: true };
    }
    return await deleteCommunityInteractionMessageCore(ctx, {
      targetType: found.targetType, targetId: String(found.target._id),
    }, args.userId, true);
  },
});

export const deleteOwnCommunityInteractionMessageForTrustedUserInternal = internalMutation({
  args: { ...deleteTargetArgs, trustedUserId: v.id("users") },
  handler: (ctx, { trustedUserId, ...args }) => deleteCommunityInteractionMessageCore(ctx, args, trustedUserId, false),
});
