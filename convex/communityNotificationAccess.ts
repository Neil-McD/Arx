import { normalizeIdValue } from "./communityCore";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  resolveCommunityChannelActor,
  requireCommunityChannelCapability,
} from "./communityChannelAccess";
import {
  interactionBelongsToChannel,
  requireCommunityChannelLineage,
  resolveRequestedCommunityChannel,
} from "./communityChannelCore";
import {
  communityInteractionEvidenceSourceIsReadable,
  resolveCommunityInteractionEvidenceSource,
} from "./communityInteractionEvidenceCore";

// Notifications confer no authority. Resolve source truth and the recipient's
// current permission together, including for delayed fanout and outbox retries.
export async function resolveNotificationRecipientSource(args: {
  ctx: any;
  communityId: any;
  userId: any;
  channelId?: any;
  rootId?: any;
  replyId?: any;
}) {
  try {
    if (!args.rootId && !args.replyId) return null;
    const community = await args.ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) return null;
    const actor = await resolveCommunityChannelActor(args);
    const source = await resolveCommunityInteractionEvidenceSource({
      ctx: args.ctx,
      communityId: args.communityId,
      objectType: args.replyId ? "reply" : "root",
      objectId: args.replyId ?? args.rootId,
    });
    if (!source || !communityInteractionEvidenceSourceIsReadable(source))
      return null;
    if (
      args.rootId &&
      normalizeIdValue(args.rootId) !== normalizeIdValue(source.root._id)
    )
      return null;
    const channel = source.root.channelId
      ? await requireCommunityChannelLineage({
          ctx: args.ctx,
          communityId: args.communityId,
          channelId: source.root.channelId,
        })
      : await resolveRequestedCommunityChannel({
          ctx: args.ctx,
          communityId: args.communityId,
        });
    if (
      !interactionBelongsToChannel(args, channel) ||
      !interactionBelongsToChannel(source.row, channel)
    )
      return null;
    await requireCommunityChannelCapability({
      ctx: args.ctx,
      channel,
      actor,
      capability: "canRead",
    });
    return { community, channel, source };
  } catch {
    return null;
  }
}

export async function resolveMentionRecipientSource(args: {
  ctx: any;
  mention: any;
  userId: any;
}) {
  const { mention, userId } = args;
  if (
    !mention ||
    mention.mentionKind !== "user" ||
    mention.notifyState === "suppressed" ||
    normalizeIdValue(mention.mentionedUserId) !== normalizeIdValue(userId)
  )
    return null;
  return resolveNotificationRecipientSource({
    ctx: args.ctx,
    communityId: mention.communityId,
    userId,
    channelId: mention.channelId,
    rootId: mention.rootId,
    replyId: mention.replyId,
  });
}
