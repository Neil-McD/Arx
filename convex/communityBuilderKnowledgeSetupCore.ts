import { internal } from "./_generated/api";

import { communityFounderWelcomeIdempotencyKey } from "../shared/communityFounderWelcome";

type BuilderKnowledgeCommunity = {
  _id: unknown;
  ownerId: unknown;
  builderKnowledgeSetupPending?: boolean;
};

export async function completeBuilderKnowledgeSetupForOwner(args: {
  ctx: any;
  community: BuilderKnowledgeCommunity;
  userId: unknown;
  nowMs: number;
}): Promise<{ changed: boolean }> {
  if (String(args.community.ownerId) !== String(args.userId)) {
    throw new Error("community_owner_required");
  }
  const changed = args.community.builderKnowledgeSetupPending === true;
  if (changed) {
    await args.ctx.db.patch(args.community._id as any, {
      builderKnowledgeSetupPending: false,
      updatedAt: args.nowMs,
    });
  }
  await args.ctx.scheduler.runAfter(
    0,
    internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
    {
      userId: args.userId,
      communityId: args.community._id,
      idempotencyKey: communityFounderWelcomeIdempotencyKey(args.community._id),
      founderBootstrap: true,
    },
  );
  return { changed };
}
