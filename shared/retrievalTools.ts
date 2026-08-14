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
  "member_profile_confirm_facts",
  "web_research",
  "web_crawl",
] as const;

export type RetrievalToolName = (typeof RETRIEVAL_TOOL_NAMES)[number];
