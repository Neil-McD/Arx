export type RuntimeActivationDecision = {
  requestedAgenticTools: boolean;
  useWorkspaceRuntime: boolean;
  reason: string;
};

function normalizeIntentText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s./:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SIMPLE_CHAT_RE =
  /^(hi|hello|hey|yo|yo yo|sup|thanks|thank you|ok|okay|cool|nice|gm|gn|test)[.!?\s]*$/i;

const PROCEED_RE =
  /^(go|do it|let s do it|lets do it|continue|ship it|send it|fix it|make it live|make live|yes|yep|yeah|sounds good)[.!?\s]*$/i;

const WORKSPACE_NOUN_RE =
  /\b(app|website|web app|repo|repository|codebase|worktree|branch|commit|pr|pull request|file|files|folder|directory|terminal|shell|sandbox|workspace|server|preview|localhost|port|package|dependency|test|tests|typescript|typecheck|deploy|production|staging|convex|vercel|daytona|codex|npm|pnpm|yarn|python|bash|git)\b/;

const WORKSPACE_ACTION_RE =
  /\b(create|make|build|run|start|serve|open|inspect|read|list|search|grep|edit|write|patch|change|fix|debug|test|typecheck|install|deploy|commit|push|merge|rebase|checkout|diff|clean|delete|remove|rename|move|wire|implement|ship)\b/;

const DIRECT_WORKSPACE_RE =
  /\b(list dir|run app|run server|start server|open preview|take screenshot|read file|edit file|write file|search files|grep|typecheck|npm run|pnpm|yarn|python3?|bash|git status|git diff|git log|make live)\b/;

const FILE_PATH_RE =
  /(^|\s)(\.\/|\.\.\/|\/|[a-z0-9_-]+\.(tsx?|jsx?|css|json|md|py|sh|sql|html|yml|yaml))\b/;

const KNOWLEDGE_TOOL_RE =
  /\b(search|research|look up|lookup|crawl|verify|current|latest|docs|documentation|resource|resources|memory|community|web|tool|tools|attachment|attached|upload|screenshot|image|video|pdf|csv)\b/;

function hasWorkspaceRuntimeIntent(text: string): boolean {
  if (!text) return false;
  if (DIRECT_WORKSPACE_RE.test(text)) return true;
  if (FILE_PATH_RE.test(text)) return true;
  return WORKSPACE_ACTION_RE.test(text) && WORKSPACE_NOUN_RE.test(text);
}

function hasKnowledgeToolIntent(text: string): boolean {
  if (!text) return false;
  return KNOWLEDGE_TOOL_RE.test(text);
}

function isProceedIntent(text: string): boolean {
  return PROCEED_RE.test(text);
}

export function resolveRuntimeActivationForTurn(params: {
  latestUserText: unknown;
  recentConversationText?: readonly unknown[];
  hasAttachments?: boolean;
}): RuntimeActivationDecision {
  const latestText = normalizeIntentText(params.latestUserText);
  const recentTexts = (params.recentConversationText ?? [])
    .map(normalizeIntentText)
    .filter(Boolean);
  const priorTexts = recentTexts.slice(0, -1);
  const priorWorkspaceIntent = priorTexts.some(hasWorkspaceRuntimeIntent);
  const priorKnowledgeIntent = priorTexts.some(hasKnowledgeToolIntent);

  if (SIMPLE_CHAT_RE.test(latestText)) {
    return {
      requestedAgenticTools: false,
      useWorkspaceRuntime: false,
      reason: "simple_chat",
    };
  }

  if (hasWorkspaceRuntimeIntent(latestText)) {
    return {
      requestedAgenticTools: true,
      useWorkspaceRuntime: true,
      reason: "workspace_runtime_intent",
    };
  }

  if (isProceedIntent(latestText) && priorWorkspaceIntent) {
    return {
      requestedAgenticTools: true,
      useWorkspaceRuntime: true,
      reason: "workspace_runtime_continuation",
    };
  }

  if (params.hasAttachments === true) {
    return {
      requestedAgenticTools: true,
      useWorkspaceRuntime: false,
      reason: "attachment_context",
    };
  }

  if (hasKnowledgeToolIntent(latestText)) {
    return {
      requestedAgenticTools: true,
      useWorkspaceRuntime: false,
      reason: "knowledge_tool_intent",
    };
  }

  if (isProceedIntent(latestText) && priorKnowledgeIntent) {
    return {
      requestedAgenticTools: true,
      useWorkspaceRuntime: false,
      reason: "knowledge_tool_continuation",
    };
  }

  return {
    requestedAgenticTools: false,
    useWorkspaceRuntime: false,
    reason: "chat_turn",
  };
}
