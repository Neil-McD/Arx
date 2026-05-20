export function normalizeCommunityWorkflowImportCandidateKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(mcp|server|servers|integration|integrations|app|apps|api|tool|tools)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function buildCommunityWorkflowImportMcpReviewItemId(args: {
  name: string;
  source: string;
  index: number;
}): string {
  const key = normalizeCommunityWorkflowImportCandidateKey(`${args.name}-${args.source}`) || String(args.index);
  return `mcp:${key}:${args.index}`;
}

export function buildCommunityWorkflowImportSkillReviewItemId(args: {
  name: string;
  source: string;
  index: number;
}): string {
  const key = normalizeCommunityWorkflowImportCandidateKey(`${args.name}-${args.source}`) || String(args.index);
  return `skill:${key}:${args.index}`;
}

export function buildCommunityWorkflowImportMarkdownSkillReviewItemId(args: {
  name: string;
  source: string;
  index: number;
}): string {
  const key = normalizeCommunityWorkflowImportCandidateKey(`${args.name}-${args.source}`) || String(args.index);
  return `markdown-skill:${key}:${args.index}`;
}
