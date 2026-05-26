export type CommunitySourceCrawlerProvider = "simple" | "crawl4ai";

export type CommunitySourceCrawlJobStatus = "queued" | "crawling" | "saving_sources" | "ready" | "failed";

export type CommunitySourcePageStatus = "ready" | "failed" | "skipped";

export type CommunitySourcePageLink = {
  url: string;
  title: string | null;
};

export type CommunitySourcePageResult = {
  requested_url: string;
  final_url: string;
  canonical_url: string;
  root_url: string;
  parent_url: string | null;
  depth: number;
  title: string | null;
  markdown: string;
  links: CommunitySourcePageLink[];
  status: CommunitySourcePageStatus;
  error: string | null;
};

export type CommunitySourceCrawlerNormalizeUrl = (raw: unknown) => string | null;

export type CommunitySourceCrawlerExistingSource<TPayload = unknown> = {
  id: string;
  hasReadyText: boolean;
  payload?: TPayload;
};

export type CommunitySourceCrawlerPageSaveAction =
  | "save_new"
  | "update_existing"
  | "skip"
  | "fail";

export type CommunitySourceCrawlerPageSaveReason =
  | "ready_new"
  | "existing_not_ready"
  | "existing_ready"
  | "duplicate_url"
  | "invalid_or_empty";

export type CommunitySourceCrawlerPageSaveDecision<TPayload = unknown> = {
  action: CommunitySourceCrawlerPageSaveAction;
  reason: CommunitySourceCrawlerPageSaveReason;
  final_url: string | null;
  aliases: string[];
  body_md: string;
  source_id: string | null;
  existing_source: CommunitySourceCrawlerExistingSource<TPayload> | null;
};

function normalizeCrawlerText(raw: unknown, maxChars: number): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.slice(0, Math.max(0, Math.floor(maxChars)));
}

export function buildCommunitySourceCrawledBody(
  page: CommunitySourcePageResult,
  maxChars = 50_000,
): string {
  const bodyLimit = Math.max(0, Math.floor(maxChars));
  const markdown = normalizeCrawlerText(page.markdown, bodyLimit);
  const depth = Number.isFinite(Number(page.depth))
    ? Math.max(0, Math.floor(Number(page.depth)))
    : 0;
  return normalizeCrawlerText(
    [
      page.title ? `# ${page.title}` : null,
      `Source URL: ${page.final_url}`,
      page.root_url && page.root_url !== page.final_url ? `Crawl root: ${page.root_url}` : null,
      page.parent_url ? `Parent URL: ${page.parent_url}` : null,
      `Crawl depth: ${depth}`,
      markdown,
    ].filter(Boolean).join("\n\n"),
    bodyLimit,
  );
}

export function addCommunitySourceCrawlerUrlAliases(
  out: Set<string>,
  raw: unknown,
  normalizeUrl: CommunitySourceCrawlerNormalizeUrl,
): void {
  const normalized = normalizeUrl(raw);
  if (!normalized) return;
  out.add(normalized);
  const parsed = new URL(normalized);
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    out.add(parsed.toString());
    return;
  }
  if (parsed.pathname !== "/" && !parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
    out.add(parsed.toString());
  }
}

export function communitySourceCrawlerUrlAliases(
  normalizeUrl: CommunitySourceCrawlerNormalizeUrl,
  ...urls: unknown[]
): Set<string> {
  const aliases = new Set<string>();
  for (const url of urls) addCommunitySourceCrawlerUrlAliases(aliases, url, normalizeUrl);
  return aliases;
}

function normalizeCrawlerScopePath(pathname: string): string {
  const path = pathname || "/";
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function communitySourceCrawlerUrlInRootScope(args: {
  rootUrl: unknown;
  candidateUrl: unknown;
  normalizeUrl: CommunitySourceCrawlerNormalizeUrl;
}): boolean {
  const rootUrl = args.normalizeUrl(args.rootUrl);
  const candidateUrl = args.normalizeUrl(args.candidateUrl);
  if (!rootUrl || !candidateUrl) return false;
  const root = new URL(rootUrl);
  const candidate = new URL(candidateUrl);
  if (root.origin !== candidate.origin) return false;
  const rootPath = normalizeCrawlerScopePath(root.pathname);
  if (rootPath === "/") return true;
  const candidatePath = normalizeCrawlerScopePath(candidate.pathname);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`);
}

export function planCommunitySourceCrawlerPageSave<TPayload = unknown>(args: {
  page: CommunitySourcePageResult;
  rootUrl: string;
  existingSourcesByAlias: Map<string, CommunitySourceCrawlerExistingSource<TPayload>>;
  seenAliases: Set<string>;
  normalizeUrl: CommunitySourceCrawlerNormalizeUrl;
  maxBodyChars?: number;
}): CommunitySourceCrawlerPageSaveDecision<TPayload> {
  const bodyLimit = Math.max(0, Math.floor(args.maxBodyChars ?? 50_000));
  const readableMarkdown = normalizeCrawlerText(args.page.markdown, bodyLimit);
  const finalUrl = args.normalizeUrl(args.page.final_url) ?? args.normalizeUrl(args.page.canonical_url);
  const bodyMd = finalUrl
    ? buildCommunitySourceCrawledBody({ ...args.page, final_url: finalUrl }, bodyLimit)
    : "";
  if (!finalUrl || args.page.status !== "ready" || !readableMarkdown || !bodyMd.trim()) {
    return {
      action: "fail",
      reason: "invalid_or_empty",
      final_url: finalUrl,
      aliases: [],
      body_md: bodyMd,
      source_id: null,
      existing_source: null,
    };
  }

  const depth = Number.isFinite(Number(args.page.depth))
    ? Math.max(0, Math.floor(Number(args.page.depth)))
    : 0;
  const aliases = Array.from(communitySourceCrawlerUrlAliases(
    args.normalizeUrl,
    args.page.final_url,
    args.page.canonical_url,
    args.page.requested_url,
    args.page.root_url,
    depth === 0 ? args.rootUrl : null,
  ));
  if (aliases.length === 0) {
    return {
      action: "fail",
      reason: "invalid_or_empty",
      final_url: finalUrl,
      aliases,
      body_md: bodyMd,
      source_id: null,
      existing_source: null,
    };
  }
  if (aliases.some((alias) => args.seenAliases.has(alias))) {
    return {
      action: "skip",
      reason: "duplicate_url",
      final_url: finalUrl,
      aliases,
      body_md: bodyMd,
      source_id: null,
      existing_source: null,
    };
  }
  for (const alias of aliases) args.seenAliases.add(alias);

  const existing = aliases
    .map((alias) => args.existingSourcesByAlias.get(alias))
    .find((source): source is CommunitySourceCrawlerExistingSource<TPayload> => Boolean(source)) ?? null;
  if (existing?.hasReadyText) {
    return {
      action: "skip",
      reason: "existing_ready",
      final_url: finalUrl,
      aliases,
      body_md: bodyMd,
      source_id: existing.id,
      existing_source: existing,
    };
  }
  if (existing) {
    return {
      action: "update_existing",
      reason: "existing_not_ready",
      final_url: finalUrl,
      aliases,
      body_md: bodyMd,
      source_id: existing.id,
      existing_source: existing,
    };
  }
  return {
    action: "save_new",
    reason: "ready_new",
    final_url: finalUrl,
    aliases,
    body_md: bodyMd,
    source_id: null,
    existing_source: null,
  };
}

export function summarizeCommunitySourceCrawlerPageSaveDecisions(
  decisions: CommunitySourceCrawlerPageSaveDecision[],
): {
  saved_source_count: number;
  skipped_source_count: number;
  failed_page_count: number;
  source_resource_ids: string[];
} {
  const sourceIds = new Set<string>();
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const decision of decisions) {
    if (decision.action === "save_new" || decision.action === "update_existing") saved += 1;
    if (decision.action === "skip") skipped += 1;
    if (decision.action === "fail") failed += 1;
    if (decision.source_id) sourceIds.add(decision.source_id);
  }
  return {
    saved_source_count: saved,
    skipped_source_count: skipped,
    failed_page_count: failed,
    source_resource_ids: Array.from(sourceIds),
  };
}
