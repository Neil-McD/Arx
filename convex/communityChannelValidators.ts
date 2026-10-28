import { v } from "convex/values";

export const channelAccessModeValidator = v.union(v.literal("all_members"), v.literal("restricted"));
export const channelPostingPolicyValidator = v.union(v.literal("members"), v.literal("managers"));
export const channelReplyPolicyValidator = v.union(v.literal("members"), v.literal("managers"), v.literal("disabled"));
export const channelActorKindValidator = v.union(
  v.literal("human"), v.literal("community_agent_for_member"), v.literal("external_mcp"), v.literal("community_agent"),
);
