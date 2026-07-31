import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import {
  retiredAuthTypeValidator,
  retiredConnectionResult,
  THIRD_PARTY_MCP_RETIRED_CODE,
} from "./thirdPartyMcpCompatibility";

// Fail-closed compatibility tombstones for cached production clients. These
// functions intentionally contain no database, network, scheduler, or runtime
// path and can never restore a third-party MCP mount.
export const listUserPlatformAppMounts = query({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async () => [],
});

export const connectUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    authType: retiredAuthTypeValidator,
    catalogAppId: v.optional(v.string()),
    connectAttemptId: v.optional(v.string()),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    name: v.string(),
    secret: v.optional(v.string()),
  },
  handler: async (_ctx, args) =>
    retiredConnectionResult(args.connectAttemptId ?? null),
});

export const setupImportedCommunityMcpUserHarness = action({
  args: {
    authSubject: v.optional(v.string()),
    authType: retiredAuthTypeValidator,
    communityAppMountId: v.id("communityAppMounts"),
    communityId: v.id("communities"),
    endpointUrl: v.string(),
    secret: v.optional(v.string()),
  },
  handler: async () => retiredConnectionResult(null),
});

export const refreshUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async () => null,
});

export const reconnectUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    secret: v.string(),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async () => null,
});

export const updateUserPlatformAppMount = mutation({
  args: {
    authSubject: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    enabledTools: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async () => null,
});

export const unmountUserPlatformApp = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async () => ({
    removed: false,
    error_code: THIRD_PARTY_MCP_RETIRED_CODE,
  }),
});
