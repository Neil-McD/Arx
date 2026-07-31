import { v } from "convex/values";

export const THIRD_PARTY_MCP_RETIRED_CODE = "third_party_mcp_retired";
export const THIRD_PARTY_MCP_RETIRED_MESSAGE =
  "Third-party MCP connections are no longer supported by Polynet.";

export const retiredAuthTypeValidator = v.union(
  v.literal("none"),
  v.literal("api_key"),
  v.literal("bearer"),
  v.literal("oauth"),
);

export function retiredConnectionResult(connectAttemptId: string | null) {
  return {
    ok: false as const,
    mount: null,
    validation_report: null,
    error_code: THIRD_PARTY_MCP_RETIRED_CODE,
    error_message: THIRD_PARTY_MCP_RETIRED_MESSAGE,
    connect_attempt_id: connectAttemptId,
  };
}
