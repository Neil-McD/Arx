export const RETRIEVAL_TOOL_NAMES = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "web_research",
] as const;

export type RetrievalToolName = (typeof RETRIEVAL_TOOL_NAMES)[number];
