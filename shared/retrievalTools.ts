export const RETRIEVAL_TOOL_NAMES = [
  "search_product_docs",
  "get_product_doc",
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "member_conversations_list",
  "member_conversation_read",
  "polynet_list_communities",
  "polynet_get_community",
  "member_profile_confirm_facts",
  "community_resources_read",
  "community_resources_search",
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
  "community_resource_builder_apply_changeset",
  "community_search",
  "community_memory_search",
  "community_memory_read",
  "community_chat_search",
  "community_chat_read",
  "web_research",
  "web_crawl",
  "list_dir",
  "read",
  "glob",
  "grep",
  "sha256",
  "write",
  "edit",
  "bash",
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
  "computer_open_url",
  "computer_screenshot",
  "computer_click",
  "computer_type",
  "computer_keypress",
  "computer_scroll",
  "computer_stop",
] as const;

export type RetrievalToolName = (typeof RETRIEVAL_TOOL_NAMES)[number];

export const COMPUTER_USE_TOOL_NAMES = [
  "computer_open_url",
  "computer_screenshot",
  "computer_click",
  "computer_type",
  "computer_keypress",
  "computer_scroll",
  "computer_stop",
] as const satisfies readonly RetrievalToolName[];

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const SANDBOX_FILE_SHELL_TOOL_NAMES: readonly RetrievalToolName[] = [
  "list_dir",
  "read",
  "glob",
  "grep",
  "sha256",
  "write",
  "edit",
  "bash",
];

export const PROJECT_WORKSPACE_TERMINAL_TOOL_NAMES: readonly RetrievalToolName[] = [
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
];

export const SANDBOX_PREVIEW_TOOL_NAMES: readonly RetrievalToolName[] = [
  "terminal_start",
  "terminal_stop",
];

export const PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES: readonly RetrievalToolName[] = [
  ...PROJECT_WORKSPACE_TERMINAL_TOOL_NAMES,
  ...COMPUTER_USE_TOOL_NAMES,
];

export const SANDBOX_TOOL_NAMES: readonly RetrievalToolName[] = [
  ...SANDBOX_FILE_SHELL_TOOL_NAMES,
  ...PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES,
];

export const NON_SANDBOX_TOOL_NAMES: readonly RetrievalToolName[] = [
  "search_product_docs",
  "get_product_doc",
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "member_conversations_list",
  "member_conversation_read",
  "polynet_list_communities",
  "polynet_get_community",
  "member_profile_confirm_facts",
  "community_resources_read",
  "community_resources_search",
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
  "community_resource_builder_apply_changeset",
  "community_search",
  "community_memory_search",
  "community_memory_read",
  "community_chat_search",
  "community_chat_read",
  "web_research",
  "web_crawl",
];

const SANDBOX_TOOL_NAME_SET = new Set<RetrievalToolName>(SANDBOX_TOOL_NAMES);

const COMPUTER_USE_TOOL_NAME_SET = new Set<RetrievalToolName>(COMPUTER_USE_TOOL_NAMES);

export function requiresSandboxSession(toolName: RetrievalToolName): boolean {
  return SANDBOX_TOOL_NAME_SET.has(toolName);
}

export function isComputerUseToolName(toolName: RetrievalToolName | string): toolName is ComputerUseToolName {
  return COMPUTER_USE_TOOL_NAME_SET.has(toolName as RetrievalToolName);
}
