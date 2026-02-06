export type CommunityJoinMode = "join_free" | "request_access" | "checkout";

export function isCommunityJoinMode(value: unknown): value is CommunityJoinMode {
  return value === "join_free" || value === "request_access" || value === "checkout";
}
