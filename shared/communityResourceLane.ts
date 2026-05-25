export type CommunityResourceRuntimeLane = "none" | "member" | "builder";

export type CommunityResourceRuntimeLaneState = {
  lane: CommunityResourceRuntimeLane;
  can_read_published_resources: boolean;
  can_use_resource_builder: boolean;
};

export const EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE: CommunityResourceRuntimeLaneState = {
  lane: "none",
  can_read_published_resources: false,
  can_use_resource_builder: false,
};

export function buildCommunityResourceRuntimeLaneState(
  lane: CommunityResourceRuntimeLane,
): CommunityResourceRuntimeLaneState {
  if (lane === "builder") {
    return {
      lane,
      can_read_published_resources: true,
      can_use_resource_builder: true,
    };
  }
  if (lane === "member") {
    return {
      lane,
      can_read_published_resources: true,
      can_use_resource_builder: false,
    };
  }
  return EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
}

export function normalizeCommunityResourceRuntimeLane(
  value: unknown,
): CommunityResourceRuntimeLane {
  return value === "builder" || value === "member" ? value : "none";
}

export function normalizeCommunityResourceRuntimeLaneState(
  value: unknown,
): CommunityResourceRuntimeLaneState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
  }
  const record = value as Record<string, unknown>;
  const lane = normalizeCommunityResourceRuntimeLane(record.lane);
  if (lane === "none") return EMPTY_COMMUNITY_RESOURCE_RUNTIME_LANE;
  return {
    lane,
    can_read_published_resources:
      record.can_read_published_resources === true || lane === "member" || lane === "builder",
    can_use_resource_builder:
      record.can_use_resource_builder === true && lane === "builder",
  };
}
