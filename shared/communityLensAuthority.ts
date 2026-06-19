import {
  buildCommunityResourceRuntimeLaneState,
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";

export type CommunityLensAuthorityRelation =
  | "owner"
  | "admin"
  | "moderator"
  | "member";

export type CommunityLensAuthority = {
  relation: CommunityLensAuthorityRelation;
  effectiveRole: CommunityLensAuthorityRelation;
  canManage: boolean;
  canModerate: boolean;
  canManageResources: boolean;
  canReviewJoinRequests: boolean;
  communityResourceLane: CommunityResourceRuntimeLaneState;
};

function normalizeAuthorityRelation(
  value: unknown,
): CommunityLensAuthorityRelation | null {
  const relation = String(value ?? "").trim().toLowerCase();
  if (
    relation === "owner" ||
    relation === "admin" ||
    relation === "moderator" ||
    relation === "member"
  ) {
    return relation;
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => record[key] === true);
}

function readValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return null;
}

export function normalizeCommunityLensAuthority(
  value: unknown,
): CommunityLensAuthority | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const relation = normalizeAuthorityRelation(readValue(record, "relation"));
  if (!relation) return null;
  const effectiveRole =
    normalizeAuthorityRelation(readValue(record, "effectiveRole", "effective_role")) ??
    relation;
  const canManageResources = readBoolean(
    record,
    "canManageResources",
    "can_manage_resources",
  );
  const canReviewJoinRequests = readBoolean(
    record,
    "canReviewJoinRequests",
    "can_review_join_requests",
  );
  const canManage =
    readBoolean(record, "canManage", "can_manage", "canManageMembers", "can_manage_members") ||
    canManageResources;
  const canModerate =
    readBoolean(
      record,
      "canModerate",
      "can_moderate",
      "canModerateContent",
      "can_moderate_content",
    ) ||
    canReviewJoinRequests ||
    canManage;
  const explicitResourceLane = normalizeCommunityResourceRuntimeLaneState(
    readValue(record, "communityResourceLane", "community_resource_lane"),
  );
  const communityResourceLane =
    explicitResourceLane.lane === "none"
      ? buildCommunityResourceRuntimeLaneState(
          canManageResources ? "builder" : "member",
        )
      : explicitResourceLane;
  return {
    relation,
    effectiveRole,
    canManage,
    canModerate,
    canManageResources,
    canReviewJoinRequests,
    communityResourceLane,
  };
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

export function renderCommunityLensAuthorityForPrompt(
  authority: CommunityLensAuthority | null | undefined,
): string | null {
  const normalized = normalizeCommunityLensAuthority(authority);
  if (!normalized) return null;
  const authorityPath =
    normalized.communityResourceLane.lane === "builder" ? "builder" : "member";
  return [
    "COMMUNITY_LENS_AUTHORITY",
    `Community relation: ${normalized.relation}.`,
    `Effective role: ${normalized.effectiveRole}.`,
    `Authority path: ${authorityPath}.`,
    `Can manage community: ${yesNo(normalized.canManage)}.`,
    `Can moderate community: ${yesNo(normalized.canModerate)}.`,
    `Can manage Resources: ${yesNo(normalized.canManageResources)}.`,
    `Can review join requests: ${yesNo(normalized.canReviewJoinRequests)}.`,
    "This is orientation for the active community lens only. Backend access checks and available tools remain authoritative.",
  ].join("\n");
}
