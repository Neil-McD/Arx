// The tools a run may be given.
// - The base tools: reading Polynet (list, read, search), the web, and the two
//   general action tools every named tool is translated into. No AI is given
//   those two any more; they are how the server runs an action.
// - The named action tools (shared/actionTools.ts): one per action, by name.
export const BASE_TOOL_NAMES = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "web_research",
] as const;

export type BaseToolName = (typeof BASE_TOOL_NAMES)[number];

export function isBaseToolName(name: string): name is BaseToolName {
  return (BASE_TOOL_NAMES as readonly string[]).includes(name);
}

// A base tool, or a named action tool.
export type RetrievalToolName = BaseToolName | (string & {});

export const RETRIEVAL_TOOL_NAMES = BASE_TOOL_NAMES;
