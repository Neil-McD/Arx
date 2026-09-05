import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { interactionIsChannelAddressable, resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { resolveCommunityChannelActor } from "./communityChannelAccess";

export async function requireAgentSourceChannelAccess(args: { ctx: any; root: any; userId: any }) {
  if (!args.root || args.root.status !== "live") throw new Error("community_agent_serve_source_unavailable");
  if (!interactionIsChannelAddressable(args.root)) return null;
  const selection = { ctx: args.ctx, communityId: args.root.communityId, channelId: args.root.channelId };
  const member = await resolveCommunityChannelActor({ ...selection, userId: args.userId });
  await resolveAuthorizedCommunityChannel({ ...selection, actor: member, capability: "canRead" });
  const agent = await resolveCommunityChannelActor({ ...selection, userId: args.userId, kind: "community_agent" });
  return resolveAuthorizedCommunityChannel({ ...selection, actor: agent, capability: "canReply" });
}

export const authorizeServeToolsInternal = internalQuery({
  args: { requestId: v.id("communityAgentServeRequests"), expectedAttempt: v.number() },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "running" || request.attempt !== args.expectedAttempt || !request.sourceRootId || !request.requesterUserId) {
      throw new Error("community_agent_serve_request_unavailable");
    }
    const root = await ctx.db.get(request.sourceRootId);
    if (!root || root.communityId !== request.communityId || root.status !== "live") throw new Error("community_agent_serve_source_unavailable");
    const channel = await requireAgentSourceChannelAccess({ ctx, root, userId: request.requesterUserId });
    return { restricted: channel?.accessMode === "restricted" };
  },
});
