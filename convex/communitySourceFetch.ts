// Fetching and reading sources: Polynet's URL fetcher, the simple crawler, and
// turning HTML, text and uploaded files into readable text.
import {
  type CommunityResourceLike,
  normalizeIdValue,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeResourceSourceIngestionKind,
  toIsoString,
} from "./communityCore";
import {
  requireSafeCommunitySourceFetcherEndpoint,
  requireSafeCommunitySourceUrl,
} from "./communitySourceUrlPolicy";
import type {
  CommunitySourceCrawlerProvider,
  CommunitySourcePageResult,
} from "../shared/communitySourceCrawler";
import {
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
  COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV,
  COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV,
  COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_DEFAULT_CHARS,
  COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_MAX_CHARS,
  COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_PAGE_CHARS,
} from "./communityResourceConstants";
import {
  type CommunitySourceCrawlJobLike,
} from "./communityResourceShared";

function normalizeSourceString(value: unknown, maxLength = 2_000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function isPlainUrlSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.url ?? "").trim()) &&
    kind !== "file";
}

export function isPlainFileSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.fileKey ?? "").trim()) &&
    kind !== "url";
}

export function isIngestibleCommunitySource(row: CommunityResourceLike): boolean {
  return isPlainUrlSource(row) || isPlainFileSource(row);
}

export function normalizeCommunitySourceIngestionAttempt(value: unknown): number {
  const attempt = Math.floor(Number(value ?? 0));
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
}

export function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

export function requireSafeSourceIngestionUrl(raw: unknown): string {
  return requireSafeCommunitySourceUrl(raw);
}

function getHeaderNumber(headers: Headers, name: string): number | null {
  const value = Number(headers.get(name) ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function readResponseTextBounded(
  response: Response,
  maxBytes = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
): Promise<string> {
  const contentLength = getHeaderNumber(response.headers, "content-length");
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error("community_source_url_too_large");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error("community_source_url_too_large");
    }
    return text;
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value;
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("community_source_url_too_large");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveSourceUrlFetcherEndpoint(): string {
  return requireSafeCommunitySourceFetcherEndpoint(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV));
}

function sourceUrlFetcherHeaders(): Record<string, string> {
  const secret = normalizeSourceString(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV), 4_000);
  if (!secret) throw new Error("community_source_url_fetcher_secret_not_configured");
  return {
    "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
  };
}

export async function fetchSourceUrlViaConfiguredFetcher(rawUrl: string): Promise<{
  finalUrl: string;
  title: string | null;
  text: string;
  contentType: string;
}> {
  const requestedUrl = requireSafeSourceIngestionUrl(rawUrl);
  const response = await fetchWithTimeout(resolveSourceUrlFetcherEndpoint(), {
    method: "POST",
    headers: sourceUrlFetcherHeaders(),
    body: JSON.stringify({
      url: requestedUrl,
      max_bytes: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES,
      max_chars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      timeout_ms: COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS,
      max_redirects: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS,
      accept: "text/html,text/plain,text/markdown,application/json,application/xml,text/xml,*/*;q=0.5",
    }),
  });
  if (!response.ok) throw new Error(`community_source_url_fetcher_failed_${response.status}`);
  const rawPayload = await readResponseTextBounded(response);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error("community_source_url_fetcher_invalid_response");
  }
  if (payload.ok === false) {
    throw new Error(normalizeSourceString(payload.error_code, 160) || "community_source_url_fetch_failed");
  }
  const finalUrl = requireSafeSourceIngestionUrl(payload.final_url || requestedUrl);
  const contentType = normalizeSourceString(payload.content_type, 180).toLowerCase() || "text/plain";
  if (contentType.includes("application/pdf") || finalUrl.toLowerCase().includes(".pdf")) {
    throw new Error("community_source_pdf_ingestion_not_supported");
  }
  if (
    contentType &&
    !contentType.includes("text/") &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/xml") &&
    !contentType.includes("xml")
  ) {
    throw new Error("community_source_url_content_type_not_supported");
  }
  const text = normalizeExtractedText(String(payload.text ?? ""));
  if (!text) throw new Error("community_source_url_no_readable_content");
  return {
    finalUrl,
    title: normalizeOptionalText(payload.title, 240) ?? null,
    text,
    contentType,
  };
}

export function normalizeSourceCrawlerProvider(): CommunitySourceCrawlerProvider {
  return "simple";
}

export function getCommunitySourceCrawlerStatusValue() {
  return {
    ok: true,
    kind: "community_source_crawler_status",
    provider: "simple" as const,
    configured: true,
    default_max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
    default_max_depth: COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
    max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    max_depth: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    missing: [] as string[],
    code: null,
    message: "Only the linked page will be read.",
  };
}

export function normalizeSourceCrawlerLimit(raw: unknown, fallback: number, max: number): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

export function maybeSafeSourceCrawlerUrl(raw: unknown): string | null {
  try {
    return requireSafeSourceIngestionUrl(raw);
  } catch {
    return null;
  }
}

export async function crawlSourceRootWithSimpleFetcher(args: {
  rootUrl: string;
}): Promise<CommunitySourcePageResult[]> {
  const extracted = await fetchSourceUrlViaConfiguredFetcher(args.rootUrl);
  const finalUrl = requireSafeSourceIngestionUrl(extracted.finalUrl);
  return [{
    requested_url: args.rootUrl,
    final_url: finalUrl,
    canonical_url: finalUrl,
    root_url: args.rootUrl,
    parent_url: null,
    depth: 0,
    title: extracted.title,
    markdown: buildIngestedSourceBody({
      title: extracted.title,
      url: finalUrl,
      text: extracted.text,
    }),
    links: [],
    status: "ready",
    error: null,
  }];
}

export async function crawlSourceRootWithConfiguredProvider(args: {
  rootUrl: string;
}): Promise<{
  provider: CommunitySourceCrawlerProvider;
  pages: CommunitySourcePageResult[];
}> {
  const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
  const provider = normalizeSourceCrawlerProvider();
  const pages = await crawlSourceRootWithSimpleFetcher({ rootUrl });
  return { provider, pages };
}

export function normalizeWebCrawlStrategyProvider(raw: unknown): CommunitySourceCrawlerProvider | undefined {
  const strategy = normalizeSourceString(raw, 20).toLowerCase();
  if (strategy === "simple") return "simple";
  if (strategy === "crawl") return "simple";
  return undefined;
}

function normalizeWebCrawlContextBudget(raw: unknown): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value <= 0) {
    return COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_DEFAULT_CHARS;
  }
  return Math.min(value, COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_MAX_CHARS);
}

export function buildWebCrawlContextPayload(args: {
  rootUrl: string;
  provider: CommunitySourceCrawlerProvider;
  pages: CommunitySourcePageResult[];
  maxChars?: number;
}): Record<string, unknown> {
  const budgetChars = normalizeWebCrawlContextBudget(args.maxChars);
  let usedChars = 0;
  const pagePayloads: Record<string, unknown>[] = [];
  for (const page of args.pages) {
    if (usedChars >= budgetChars) break;
    const pageBudget = Math.min(
      COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_PAGE_CHARS,
      Math.max(0, budgetChars - usedChars),
    );
    const markdown = String(page.markdown ?? "");
    const markdownPreview = markdown.slice(0, pageBudget);
    usedChars += markdownPreview.length;
    pagePayloads.push({
      requested_url: page.requested_url,
      final_url: page.final_url,
      canonical_url: page.canonical_url,
      parent_url: page.parent_url,
      depth: page.depth,
      title: page.title,
      status: page.status,
      error: page.error,
      chars: markdown.length,
      markdown_preview: markdownPreview,
      truncated: markdownPreview.length < markdown.length,
      links: page.links.slice(0, 20),
      virtual_page_count: Math.max(0, Math.floor(Number(page.virtual_page_count) || 0)),
      virtual_page_strategy: normalizeOptionalText(page.virtual_page_strategy, 80) ?? null,
      source_unit_count: Array.isArray(page.source_units) ? page.source_units.length : 0,
      source_units: Array.isArray(page.source_units)
        ? page.source_units.slice(0, 12).map((unit) => ({
          unit_key: unit.unit_key ?? null,
          unit_kind: unit.unit_kind,
          title: unit.title,
          source_url: unit.source_url,
          path: unit.path,
          order: unit.order,
          status: unit.status,
          chars: String(unit.markdown ?? "").length,
        }))
        : [],
    });
  }
  const readyPages = args.pages.filter((page) => page.status === "ready");
  const virtualPageCount = args.pages.reduce(
    (total, page) => total + Math.max(0, Math.floor(Number(page.virtual_page_count) || 0)),
    0,
  );
  const sourceUnitCount = args.pages.reduce(
    (total, page) => total + (Array.isArray(page.source_units) ? page.source_units.length : 0),
    0,
  );
  return {
    ok: true,
    kind: "web_crawl",
    destination: "context",
    provider: args.provider,
    root_url: args.rootUrl,
    page_count: args.pages.length,
    virtual_page_count: virtualPageCount,
    source_unit_count: sourceUnitCount,
    ready_page_count: readyPages.length,
    failed_page_count: args.pages.length - readyPages.length,
    returned_page_count: pagePayloads.length,
    pages_omitted: Math.max(0, args.pages.length - pagePayloads.length),
    content_budget_chars: budgetChars,
    content_used_chars: usedChars,
    pages: pagePayloads,
  };
}

export function titleFromSourceCrawlerUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    return normalizeName(segment ? decodeURIComponent(segment).replace(/[-_]+/g, " ") : parsed.hostname);
  } catch {
    return "Crawled source";
  }
}

export function mapCommunitySourceCrawlJob(row: CommunitySourceCrawlJobLike) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    created_by_user_id: normalizeIdValue(row.createdByUserId),
    provider: row.provider,
    root_url: row.rootUrl,
    status: row.status,
    max_pages: Math.max(0, Math.floor(Number(row.maxPages) || 0)),
    max_depth: Math.max(0, Math.floor(Number(row.maxDepth) || 0)),
    page_count: Math.max(0, Math.floor(Number(row.pageCount) || 0)),
    ready_page_count: Math.max(0, Math.floor(Number(row.readyPageCount) || 0)),
    failed_page_count: Math.max(0, Math.floor(Number(row.failedPageCount) || 0)),
    saved_source_count: Math.max(0, Math.floor(Number(row.savedSourceCount) || 0)),
    skipped_source_count: Math.max(0, Math.floor(Number(row.skippedSourceCount) || 0)),
    source_resource_ids: Array.isArray(row.sourceResourceIds)
      ? row.sourceResourceIds.map((id) => normalizeIdValue(id)).filter(Boolean)
      : [],
    error: normalizeOptionalText(row.error, 1000) ?? null,
    started_at: typeof row.startedAt === "number" ? toIsoString(row.startedAt) : null,
    completed_at: typeof row.completedAt === "number" ? toIsoString(row.completedAt) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export function decodeBasicHtmlEntities(raw: string): string {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return raw.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    const lower = String(entity).toLowerCase();
    if (lower.startsWith("#x")) {
      const value = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    if (lower.startsWith("#")) {
      const value = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    return named[lower] ?? " ";
  });
}

export function normalizeExtractedText(raw: string, maxChars = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS): string {
  const lines = raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const value = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeBasicHtmlEntities(String(match?.[1] ?? "").replace(/<[^>]+>/g, " "));
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function extractReadableTextFromHtml(html: string): { title: string | null; text: string } {
  const title = extractTitleFromHtml(html);
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
  const blockSeparated = withoutScripts
    .replace(/<\/(?:p|div|section|article|header|footer|main|aside|li|ul|ol|h[1-6]|tr|table|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = normalizeExtractedText(decodeBasicHtmlEntities(blockSeparated.replace(/<[^>]+>/g, " ")));
  return {
    title,
    text: normalizeExtractedText([title, text].filter(Boolean).join("\n\n")),
  };
}

export function extractReadableText(raw: string, contentType: string): { title: string | null; text: string } {
  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType.includes("text/html") || /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    return extractReadableTextFromHtml(raw);
  }
  if (lowerContentType.includes("application/json")) {
    try {
      return {
        title: null,
        text: normalizeExtractedText(JSON.stringify(JSON.parse(raw), null, 2)),
      };
    } catch {
      return { title: null, text: normalizeExtractedText(raw) };
    }
  }
  return { title: null, text: normalizeExtractedText(raw) };
}

function getFileExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function isReadableTextFileType(contentType: string, filename: string): boolean {
  const lowerContentType = contentType.toLowerCase();
  const extension = getFileExtension(filename);
  if (lowerContentType.startsWith("text/")) return true;
  if (
    lowerContentType.includes("json") ||
    lowerContentType.includes("xml") ||
    lowerContentType.includes("csv") ||
    lowerContentType.includes("yaml") ||
    lowerContentType.includes("toml")
  ) {
    return true;
  }
  return [
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "jsonl",
    "xml",
    "html",
    "htm",
    "yaml",
    "yml",
    "toml",
    "log",
  ].includes(extension);
}

export function isPdfFileType(contentType: string, filename: string): boolean {
  return contentType.toLowerCase().includes("application/pdf") || getFileExtension(filename) === "pdf";
}

export async function extractSourceTextFromFile(args: {
  ctx: any;
  fileKey: string;
  filename: string;
}): Promise<{
  title: string | null;
  text: string;
  contentType: string;
  bytes: number | null;
}> {
  const storageId = normalizeOptionalFileKey(args.fileKey);
  if (!storageId) throw new Error("community_source_file_required");
  const downloadUrl = await args.ctx.storage.getUrl(storageId as any);
  if (!downloadUrl) throw new Error("community_source_file_missing");
  const response = await fetchWithTimeout(downloadUrl, {
    headers: {
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
      accept: "text/*,application/json,application/xml,text/xml,*/*;q=0.5",
    },
  });
  if (!response.ok) throw new Error(`community_source_file_fetch_failed_${response.status}`);
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = getHeaderNumber(response.headers, "content-length");
  if (isPdfFileType(contentType, args.filename)) {
    throw new Error("community_source_pdf_ingestion_not_supported");
  }
  if (!isReadableTextFileType(contentType, args.filename)) {
    throw new Error("community_source_file_content_type_not_supported");
  }
  const raw = await readResponseTextBounded(response);
  const extracted = extractReadableText(raw, contentType || "text/plain");
  if (!extracted.text) throw new Error("community_source_file_no_readable_content");
  return {
    title: extracted.title ?? args.filename ?? null,
    text: extracted.text,
    contentType: contentType || "text/plain",
    bytes,
  };
}

export async function extractSourceTextFromUrl(rawUrl: string): Promise<{
  finalUrl: string;
  title: string | null;
  text: string;
  contentType: string;
}> {
  return await fetchSourceUrlViaConfiguredFetcher(rawUrl);
}

export function buildIngestedSourceBody(args: {
  title: string | null;
  url: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      `Source URL: ${args.url}`,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}

export function buildIngestedFileSourceBody(args: {
  title: string | null;
  filename: string;
  contentType: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      args.filename ? `Uploaded file: ${args.filename}` : null,
      args.contentType ? `File type: ${args.contentType}` : null,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}
