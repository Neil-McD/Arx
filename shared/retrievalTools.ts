export const RETRIEVAL_TOOL_NAMES = [
  "search_product_docs",
  "get_product_doc",
  "community_search",
  "community_write",
  "web_research",
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

export const WORKSPACE_SANDBOX_TOOL_NAMES: readonly RetrievalToolName[] = [
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
  ...COMPUTER_USE_TOOL_NAMES,
];

export const NON_SANDBOX_TOOL_NAMES: readonly RetrievalToolName[] = [
  "search_product_docs",
  "get_product_doc",
  "community_search",
  "community_write",
  "web_research",
];

const WORKSPACE_SANDBOX_TOOL_NAME_SET = new Set<RetrievalToolName>(
  WORKSPACE_SANDBOX_TOOL_NAMES,
);

const COMPUTER_USE_TOOL_NAME_SET = new Set<RetrievalToolName>(COMPUTER_USE_TOOL_NAMES);

export function requiresWorkspaceSandbox(toolName: RetrievalToolName): boolean {
  return WORKSPACE_SANDBOX_TOOL_NAME_SET.has(toolName);
}

export function isComputerUseToolName(toolName: RetrievalToolName | string): toolName is ComputerUseToolName {
  return COMPUTER_USE_TOOL_NAME_SET.has(toolName as RetrievalToolName);
}
