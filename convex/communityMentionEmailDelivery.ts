import { normalizeIdValue } from "./communityCore";
import { communityLifecycleGenerationMatches } from "../shared/communityLifecycle";
import { resolveMentionRecipientSource } from "./communityNotificationAccess";
import { readCommunityChannelReadState } from "./communityReadCursorCore";
import { mentionBroadcastAllowsEmail } from "./communityMentionBroadcasts";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { buildCommunityTabPath } from "../shared/webAppRouteState";

// No captured preview is a delivery authority. The outbox points to a mention;
// content and audience are resolved again on every dispatch attempt.
export async function resolveMentionEmailDelivery(args: {
  ctx: any;
  sourceMentionId?: any;
  recipientUserId?: any;
  communityId?: any;
  communityLifecycleGeneration?: number;
}) {
  try {
    if (
      !args.sourceMentionId ||
      !args.recipientUserId ||
      !args.communityId ||
      args.communityLifecycleGeneration === undefined
    )
      return null;
    const mention = await args.ctx.db.get(args.sourceMentionId);
    if (
      !mention ||
      normalizeIdValue(mention.communityId) !==
        normalizeIdValue(args.communityId) ||
      mention.notifyState === "read" ||
      mention.emailEligible === false
    )
      return null;
    const authorized = await resolveMentionRecipientSource({
      ctx: args.ctx,
      mention,
      userId: args.recipientUserId,
    });
    if (
      !authorized ||
      !communityLifecycleGenerationMatches(
        authorized.community,
        args.communityLifecycleGeneration,
      )
    )
      return null;
    if (
      mention.sourceBroadcastId &&
      !(await mentionBroadcastAllowsEmail({
        ctx: args.ctx,
        broadcastId: mention.sourceBroadcastId,
      }))
    )
      return null;
    const { source, community, channel } = authorized;
    if (
      normalizeIdValue(source.row.actorUserId) ===
      normalizeIdValue(args.recipientUserId)
    )
      return null;
    const readState = await readCommunityChannelReadState(
      args.ctx,
      args.communityId,
      args.recipientUserId,
      channel,
    );
    if (readState.mentionSeenThroughAt >= mention.createdAt) return null;
    const blocks = await args.ctx.db
      .query("communityInteractionContentBlocks")
      .withIndex(
        mention.replyId ? "by_reply_order" : "by_root_order",
        (q: any) =>
          q.eq(mention.replyId ? "replyId" : "rootId", source.row._id),
      )
      .take(5);
    const text =
      blocks.find(
        (block: any) =>
          block.blockType === "markdown_text" &&
          String(block.text ?? "").trim(),
      )?.text ?? source.row.contentSummary;
    const author = source.row.actorUserId
      ? await args.ctx.db.get(source.row.actorUserId)
      : null;
    let actionUrl = "";
    try {
      const path = buildCommunityTabPath(
        community.slug,
        "chat",
        null,
        null,
        channel.slug,
      );
      if (path)
        actionUrl = new URL(path, readCanonicalPublicAppOrigin()).toString();
    } catch {
      /* Missing app origin leaves the optional CTA absent. */
    }
    return {
      communityName: String(community.name ?? "your community").slice(0, 200),
      mentionerName: String(author?.displayName ?? "A community member").slice(
        0,
        120,
      ),
      snippet: String(text ?? "")
        .trim()
        .slice(0, 140),
      actionUrl,
    };
  } catch {
    return null;
  }
}
