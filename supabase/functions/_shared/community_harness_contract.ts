export const COMMUNITY_HARNESS_RUNTIME_CONTRACT_ID = "community_harness_runtime_contract_v1";

export type CommunityHarnessRequiredRpcSpec = {
  symbol_id: string;
  openapi_path: `/rpc/${string}`;
  required_args: readonly string[];
};

export type CommunityHarnessRequiredTableSpec = {
  symbol_id: string;
  openapi_path: `/${string}`;
};

export const COMMUNITY_HARNESS_REQUIRED_RPCS = Object.freeze<readonly CommunityHarnessRequiredRpcSpec[]>([
  {
    symbol_id: "rpc.search_compiled_community_context",
    openapi_path: "/rpc/search_compiled_community_context",
    required_args: ["p_user_id", "p_community_id", "p_query", "p_limit"],
  },
  {
    symbol_id: "rpc.search_community_chat_snippets",
    openapi_path: "/rpc/search_community_chat_snippets",
    required_args: ["p_user_id", "p_community_id", "p_query", "p_limit"],
  },
  {
    symbol_id: "rpc.search_community_resource_snippets",
    openapi_path: "/rpc/search_community_resource_snippets",
    required_args: ["p_user_id", "p_community_id", "p_query", "p_limit"],
  },
  {
    symbol_id: "rpc.search_community_memory_items",
    openapi_path: "/rpc/search_community_memory_items",
    required_args: ["p_user_id", "p_community_id", "p_query", "p_limit"],
  },
  {
    symbol_id: "rpc.community_memory_candidate_propose",
    openapi_path: "/rpc/community_memory_candidate_propose",
    required_args: ["p_community_id", "p_title", "p_memory_text", "p_evidence", "p_request_key"],
  },
]);

export const COMMUNITY_HARNESS_REQUIRED_TABLES = Object.freeze<readonly CommunityHarnessRequiredTableSpec[]>([
  {
    symbol_id: "table.community_context_items",
    openapi_path: "/community_context_items",
  },
  {
    symbol_id: "table.community_context_state",
    openapi_path: "/community_context_state",
  },
  {
    symbol_id: "table.community_memory_items",
    openapi_path: "/community_memory_items",
  },
  {
    symbol_id: "table.community_memory_candidates",
    openapi_path: "/community_memory_candidates",
  },
]);

