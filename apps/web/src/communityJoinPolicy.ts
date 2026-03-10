export type CommunityJoinMode = "join_free" | "request_access" | "checkout";
export type CommunityEntryPolicy = "open" | "approval" | "paid_unlock" | "paid_subscription";
export type CommunityMembersJoinReviewMode = "paid" | "free_auto" | "free_approval";

export function isCommunityEntryPolicy(value: unknown): value is CommunityEntryPolicy {
  return value === "open" || value === "approval" || value === "paid_unlock" || value === "paid_subscription";
}

export function deriveCommunityJoinMode(args: {
  entry_policy?: unknown;
}): CommunityJoinMode {
  if (isCommunityEntryPolicy(args.entry_policy)) {
    if (args.entry_policy === "paid_unlock" || args.entry_policy === "paid_subscription") return "checkout";
    if (args.entry_policy === "approval") return "request_access";
    return "join_free";
  }
  return "request_access";
}

export function deriveCommunityMembersJoinReviewMode(args: {
  entry_policy?: unknown;
}): CommunityMembersJoinReviewMode {
  if (isCommunityEntryPolicy(args.entry_policy)) {
    if (args.entry_policy === "paid_unlock" || args.entry_policy === "paid_subscription") return "paid";
    if (args.entry_policy === "approval") return "free_approval";
    return "free_auto";
  }
  return "free_approval";
}
