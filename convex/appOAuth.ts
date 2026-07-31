import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  THIRD_PARTY_MCP_RETIRED_CODE,
  THIRD_PARTY_MCP_RETIRED_MESSAGE,
} from "./thirdPartyMcpCompatibility";

// Fail-closed compatibility tombstones for cached production clients.
export const beginUserPlatformAppOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    callbackBaseUrl: v.optional(v.string()),
    catalogAppId: v.string(),
    communityAppMountId: v.optional(v.id("communityAppMounts")),
    communityId: v.optional(v.id("communities")),
    endpointUrl: v.optional(v.string()),
    returnToPath: v.optional(v.string()),
  },
  handler: async (_ctx, args) => ({
    ok: false as const,
    catalog_app_id: args.catalogAppId,
    authorize_url: null,
    redirect_uri: null,
    error_code: THIRD_PARTY_MCP_RETIRED_CODE,
    error_message: THIRD_PARTY_MCP_RETIRED_MESSAGE,
  }),
});

export const finalizeUserPlatformAppOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    finalizeToken: v.string(),
    state: v.string(),
  },
  handler: async () => ({
    ok: false as const,
    catalog_app_id: null,
    mount_id: null,
    validation_status: "retired" as const,
    error_code: THIRD_PARTY_MCP_RETIRED_CODE,
    error_message: THIRD_PARTY_MCP_RETIRED_MESSAGE,
  }),
});
