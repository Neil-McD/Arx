import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  sha256HexText,
} from "./secretCrypto";
import {
  normalizeCommunityLessonFields,
  parseCommunityLessonElements,
  redactCommunityLessonAnswers,
  projectCommunityLessonBody,
  type CommunityLessonFields,
} from "../shared/communityLessonContract";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceBodyChars,
  communityResourceHasUsableKnowledgeContent,
  communityResourceIsLiveModulePage,
  communityResourceSourceHasReadyText,
  communityResourceModuleIsLive,
  getCommunityAndMembership,
  mapCommunityResourceModuleRow,
  mapCommunityResourceRow,
  maybeDeleteStorageAsset,
  normalizeIdValue,
  normalizeBannerFocus,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceRole,
  normalizeResourceModuleLessonStyle,
  normalizeResourceModuleStatus,
  normalizeResourceSourceIngestionKind,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  normalizeResourceType,
  requireActiveCommunity,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireResourceSourceIngestionKindForWrite,
  requireResourceSourceIngestionStatusForWrite,
  requireResourceModuleStatusForWrite,
  requireResourceStatusForWrite,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  welcomeLessonIsLive,
} from "./communityCore";
import {
  revokeCommunityResourceMemoryProjection,
  syncCommunityResourceMemoryProjection,
} from "./communityResourceMemoryProjection";
import {
  deleteCommunityResourceBodyContent,
  hydrateCommunityResourceBody,
  normalizeAuthoredCommunityResourceBodyMd,
  normalizeCommunityResourceBodyMd,
  writeCommunityResourceBodyContent,
  listCommunityResourceRevisionRows,
  type CommunityResourceRevisionLike,
} from "./communityResourceContent";
import { COMMUNITY_RESOURCE_BODY_MAX_CHARS, communityLessonSections } from "../shared/communityLessonSections";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import { readCommunityPaidLockedLessonIds } from "./communityLessonTracks";
import {
  requireSafeCommunitySourceFetcherEndpoint,
  requireSafeCommunitySourceUrl,
} from "./communitySourceUrlPolicy";
import {
  COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT,
  COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory";
import { resolveExactCommunityResourceEvidenceSelector } from "./communityResourceEvidenceCore";
import {
  buildCommunityResourceEvidenceRef,
  deriveCommunityResourceLineageEnvelope,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";
import type {
  CommunitySourceCrawlJobStatus,
  CommunitySourceCrawlerExistingSource,
  CommunitySourceCrawlerProvider,
  CommunitySourcePageResult,
  CommunitySourceUnitKind,
  CommunitySourceUnitResult,
  CommunitySourceUnitStatus,
} from "../shared/communitySourceCrawler";
import {
  buildCommunitySourceCrawlerUnitKey,
  communitySourceCrawlerUrlInRootScope,
  communitySourceCrawlerUrlAliases,
  normalizeCommunitySourceUnitPath,
  planCommunitySourceCrawlerPageSave,
} from "../shared/communitySourceCrawler";
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT = 100;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT = 5000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT = 500;
const COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT = 24;
const COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_MAX_LIMIT = 50;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS = 12_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS = 20_000;
const COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT = 50;
const COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT = 250;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT = 50;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS = 240;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_OPERATIONS = 25;
// A changeset is one stored record, so its page bodies share one budget that
// keeps it well inside the database's record size. A page body alone always fits.
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_BODY_CHARS = 250_000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_SUMMARY_MAX_CHARS = 2000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE =
  "This resource proposal expired after 24 hours.";
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT = 3;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS = 140;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TITLE_CHARS = 96;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES = 2_500_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS = 50_000;
const COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS;
const COMMUNITY_SOURCE_UNIT_MAX_PER_PAGE = 100;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS = 12_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS = 3;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_LEASE_MS = 60_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS = 3;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT =
  "Polynet Community Source Ingestion/1.0";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET";
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES = 1;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES = 1;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH = 0;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH = 0;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_DEFAULT_CHARS = 40_000;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_MAX_CHARS = 80_000;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_PAGE_CHARS = 8_000;
const GOOGLE_DRIVE_SOURCE_PROVIDER = "google_drive" as const;
const GITHUB_SOURCE_PROVIDER = "github" as const;

async function mapCommunityResourceRowWithBody(
  ctx: any,
  row: CommunityResourceLike,
  viewer: { canManage: boolean },
  userIdCache?: Map<string, string | null>,
  moduleNameCache?: Map<string, string | null>,
) {
  const hydrated = await hydrateCommunityResourceBody(ctx, row) ?? row;
  return await mapCommunityResourceRow(ctx, hydrated, userIdCache, moduleNameCache, viewer);
}

type CommunitySourceCrawlJobLike = {
  _id?: unknown;
  communityId: unknown;
  createdByUserId: unknown;
  provider: CommunitySourceCrawlerProvider;
  rootUrl: string;
  status: CommunitySourceCrawlJobStatus;
  maxPages: number;
  maxDepth: number;
  pageCount: number;
  readyPageCount: number;
  failedPageCount: number;
  savedSourceCount: number;
  skippedSourceCount: number;
  sourceResourceIds?: unknown[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type CommunitySourceUnitLike = {
  _id?: unknown;
  communityId: unknown;
  crawlJobId: unknown;
  sourceResourceId?: unknown;
  rootUrl: string;
  unitKey: string;
  unitKind: CommunitySourceUnitKind;
  title?: string | null;
  sourceUrl: string;
  parentUrl?: string | null;
  path?: string | null;
  order: number;
  depth: number;
  status: CommunitySourceUnitStatus;
  bodyChars: number;
  bodyOriginalChars?: number;
  bodyHash: string;
  bodyTruncated?: boolean;
  captureMethod?: string | null;
  error?: string | null;
  seenCount: number;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
};

type CommunityResourceBuilderChangesetRow = {
  _id?: unknown;
  communityId: unknown;
  createdByUserId: unknown;
  idempotencyKey?: string;
  status: "staged" | "approved" | "applied" | "rejected" | "failed" | "expired";
  summary: string;
  operations: CommunityResourceBuilderChangesetOperation[];
  preflight: unknown;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  approvedByUserId?: unknown;
  rejectedAt?: number;
  rejectedByUserId?: unknown;
  appliedAt?: number;
  appliedByUserId?: unknown;
};

type CommunityResourceBuilderChangesetOperation =
  | {
      op: "create_module";
      module_key?: string | null;
      name: string;
      description_md?: string | null;
      module_status?: "draft" | "live";
      lesson_style?: "article" | "video";
    }
  | {
      op: "edit_module";
      module_id: string;
      expected_updated_at: number;
      name?: string;
      description_md?: string | null;
      module_status?: "draft" | "live";
      lesson_style?: "article" | "video";
    }
  | {
      op: "create_page";
      module_id?: string | null;
      module_key?: string | null;
      title: string;
      body_md?: string | null;
      source_resource_id?: string | null;
      type?: string;
      url?: string | null;
      resource_status?: string;
      pinned?: boolean;
      lesson?: CommunityLessonFields | null;
    }
  | {
      op: "edit_page";
      resource_id: string;
      expected_updated_at: number;
      module_id?: string | null;
      title?: string;
      body_md?: string | null;
      source_resource_id?: string | null;
      type?: string;
      url?: string | null;
      resource_status?: string;
      pinned?: boolean;
      lesson?: CommunityLessonFields | null;
    }
  | {
      op: "move_resource";
      resource_id: string;
      expected_updated_at: number;
      module_id?: string | null;
    }
  | {
      op: "delete_page";
      resource_id: string;
      expected_updated_at: number;
    }
  | {
      op: "delete_category";
      module_id: string;
      expected_updated_at: number;
    }
  | {
      op: "link_source_to_page";
      page_resource_id: string;
      expected_updated_at: number;
      source_resource_id: string;
    };

type CommunityResourceBuilderChangesetPreviewItem = {
  op: CommunityResourceBuilderChangesetOperation["op"];
  marker: "+" | "~" | ">" | "x";
  title: string;
  preview: string | null;
};

function normalizeOptionalModuleId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

function resourceModuleIdentity(raw: unknown): string {
  return normalizeOptionalModuleId(raw) ?? "";
}

function compareCommunityResources(a: CommunityResourceLike, b: CommunityResourceLike): number {
  const aSortOrder = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : null;
  const bSortOrder = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : null;
  if (aSortOrder !== null || bSortOrder !== null) {
    if (aSortOrder !== bSortOrder) {
      return (aSortOrder ?? Number.MAX_SAFE_INTEGER) - (bSortOrder ?? Number.MAX_SAFE_INTEGER);
    }
  } else if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return Boolean(a.pinned) ? -1 : 1;
  }
  return b.createdAt - a.createdAt;
}

function normalizeSourceIntegrationString(value: unknown, maxLength = 2_000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isGoogleDriveSourceResource(row: CommunityResourceLike): boolean {
  return normalizeResourceSourceIngestionKind(row) === "google_drive" &&
    normalizeSourceIntegrationString(row.sourceExternalProvider, 80) === GOOGLE_DRIVE_SOURCE_PROVIDER;
}

function isGitHubSourceResource(row: CommunityResourceLike): boolean {
  return normalizeResourceSourceIngestionKind(row) === "github" &&
    normalizeSourceIntegrationString(row.sourceExternalProvider, 80) === GITHUB_SOURCE_PROVIDER;
}

function isSourceIntegrationSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  const provider = normalizeSourceIntegrationString(row.sourceExternalProvider, 80);
  return (
    kind === "google_drive" ||
    kind === "github" ||
    provider === GOOGLE_DRIVE_SOURCE_PROVIDER ||
    provider === GITHUB_SOURCE_PROVIDER
  );
}

function isPlainUrlSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.url ?? "").trim()) &&
    kind !== "file" &&
    !isSourceIntegrationSource(row);
}

function isPlainFileSource(row: CommunityResourceLike): boolean {
  const kind = normalizeResourceSourceIngestionKind(row);
  return Boolean(String(row.fileKey ?? "").trim()) &&
    kind !== "url" &&
    !isSourceIntegrationSource(row);
}

// GitHub and Google Drive import is retired (POL-22): sources imported that way
// keep their text but are never fetched again.
function isIngestibleCommunitySource(row: CommunityResourceLike): boolean {
  return isPlainUrlSource(row) || isPlainFileSource(row);
}

function normalizeCommunitySourceIngestionAttempt(value: unknown): number {
  const attempt = Math.floor(Number(value ?? 0));
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function requireSafeSourceIngestionUrl(raw: unknown): string {
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

async function fetchWithTimeout(
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

function resolveSourceUrlFetcherEndpoint(): string {
  return requireSafeCommunitySourceFetcherEndpoint(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV));
}

function sourceUrlFetcherHeaders(): Record<string, string> {
  const secret = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV), 4_000);
  if (!secret) throw new Error("community_source_url_fetcher_secret_not_configured");
  return {
    "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
  };
}

async function fetchSourceUrlViaConfiguredFetcher(rawUrl: string): Promise<{
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
    throw new Error(normalizeSourceIntegrationString(payload.error_code, 160) || "community_source_url_fetch_failed");
  }
  const finalUrl = requireSafeSourceIngestionUrl(payload.final_url || requestedUrl);
  const contentType = normalizeSourceIntegrationString(payload.content_type, 180).toLowerCase() || "text/plain";
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

function normalizeSourceCrawlerProvider(): CommunitySourceCrawlerProvider {
  return "simple";
}

function getCommunitySourceCrawlerStatusValue() {
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

function normalizeSourceCrawlerLimit(raw: unknown, fallback: number, max: number): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function maybeSafeSourceCrawlerUrl(raw: unknown): string | null {
  try {
    return requireSafeSourceIngestionUrl(raw);
  } catch {
    return null;
  }
}

async function crawlSourceRootWithSimpleFetcher(args: {
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

async function crawlSourceRootWithConfiguredProvider(args: {
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

function normalizeWebCrawlStrategyProvider(raw: unknown): CommunitySourceCrawlerProvider | undefined {
  const strategy = normalizeSourceIntegrationString(raw, 20).toLowerCase();
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

function buildWebCrawlContextPayload(args: {
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

function titleFromSourceCrawlerUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    return normalizeName(segment ? decodeURIComponent(segment).replace(/[-_]+/g, " ") : parsed.hostname);
  } catch {
    return "Crawled source";
  }
}

function mapCommunitySourceCrawlJob(row: CommunitySourceCrawlJobLike) {
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

function decodeBasicHtmlEntities(raw: string): string {
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

function normalizeExtractedText(raw: string, maxChars = COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS): string {
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

function extractReadableTextFromHtml(html: string): { title: string | null; text: string } {
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

function extractReadableText(raw: string, contentType: string): { title: string | null; text: string } {
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

function isReadableTextFileType(contentType: string, filename: string): boolean {
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

function isPdfFileType(contentType: string, filename: string): boolean {
  return contentType.toLowerCase().includes("application/pdf") || getFileExtension(filename) === "pdf";
}

async function extractSourceTextFromFile(args: {
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

async function extractSourceTextFromUrl(rawUrl: string): Promise<{
  finalUrl: string;
  title: string | null;
  text: string;
  contentType: string;
}> {
  return await fetchSourceUrlViaConfiguredFetcher(rawUrl);
}

function buildIngestedSourceBody(args: {
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

function buildIngestedFileSourceBody(args: {
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

async function requireValidResourceModule(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null;
}): Promise<any | undefined> {
  if (!args.moduleId) return undefined;
  const module = (await args.ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
  if (!module || String(module.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_module_not_found");
  }
  return module._id;
}

async function requireResourceModuleForRole(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null;
  role: "page" | "source";
}): Promise<any | undefined> {
  const moduleId = await requireValidResourceModule(args);
  if (args.role === "page" && !moduleId) {
    throw new Error("community_resource_course_required");
  }
  return moduleId;
}

async function canManageCommunityResources(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<boolean> {
  try {
    await requireCommunityManager(args);
    return true;
  } catch {
    return false;
  }
}

async function getNextResourceSortOrder(args: {
  ctx: any;
  communityId: any;
  moduleId: any | null | undefined;
  excludeResourceId?: any;
}): Promise<number> {
  const rows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceLike[];
  const targetModuleIdentity = resourceModuleIdentity(args.moduleId);
  const excludeResourceId = args.excludeResourceId ? normalizeIdValue(args.excludeResourceId) : null;
  return (
    rows
      .filter((row) => {
        if (excludeResourceId && normalizeIdValue(row._id) === excludeResourceId) return false;
        return resourceModuleIdentity(row.moduleId) === targetModuleIdentity;
      })
      .reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000
  );
}

async function syncResourceMemoryProjectionsForModule(args: {
  ctx: any;
  communityId: any;
  moduleId: any;
}): Promise<void> {
  const rows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module", (q: any) =>
      q.eq("communityId", args.communityId).eq("moduleId", args.moduleId),
    )
    .collect()) as CommunityResourceLike[];
  for (const row of rows) {
    await syncCommunityResourceMemoryProjection(args.ctx, row);
  }
}

function hasPersistedResourceModuleStatus(module: CommunityResourceModuleLike): boolean {
  return Object.prototype.hasOwnProperty.call(module, "status") &&
    parseResourceModuleStatusForBackfill(module.status) !== null;
}

function parseResourceModuleStatusForBackfill(raw: unknown): "draft" | "live" | null {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === "draft") return "draft";
  if (status === "live") return "live";
  return null;
}

function isLegacyLivePageResource(row: CommunityResourceLike): boolean {
  return normalizeResourceRole(row.role) === "page" &&
    normalizeResourceStatus(row.status) === "published" &&
    communityResourceHasUsableKnowledgeContent(row);
}

async function inferLegacyResourceModuleStatus(args: {
  ctx: any;
  communityId: any;
  moduleId: any;
}): Promise<"draft" | "live"> {
  const rows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module", (q: any) =>
      q.eq("communityId", args.communityId).eq("moduleId", args.moduleId),
    )
    .collect()) as CommunityResourceLike[];
  return rows.some(isLegacyLivePageResource) ? "live" : "draft";
}

export const backfillCommunityResourceModuleStatusesInternal = internalMutation({
  args: {
    communityId: v.optional(v.id("communities")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    ok: true;
    kind: "community_resource_module_status_backfill";
    dry_run: boolean;
    community_id: string | null;
    limit: number;
    modules_checked: number;
    modules_already_explicit: number;
    modules_updated: number;
    modules_live: number;
    modules_draft: number;
  }> => {
    const dryRun = args.dryRun !== false;
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 500)));
    const modules = args.communityId
      ? ((await ctx.db
          .query("communityResourceModules" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .take(limit)) as CommunityResourceModuleLike[])
      : ((await ctx.db
          .query("communityResourceModules" as any)
          .take(limit)) as CommunityResourceModuleLike[]);
    const nowMs = Date.now();
    let modulesAlreadyExplicit = 0;
    let modulesUpdated = 0;
    let modulesLive = 0;
    let modulesDraft = 0;

    for (const module of modules) {
      if (hasPersistedResourceModuleStatus(module)) {
        modulesAlreadyExplicit += 1;
        continue;
      }
      const nextStatus = await inferLegacyResourceModuleStatus({
        ctx,
        communityId: module.communityId,
        moduleId: module._id,
      });
      if (nextStatus === "live") modulesLive += 1;
      else modulesDraft += 1;
      if (!dryRun) {
        await ctx.db.patch(module._id as any, {
          status: nextStatus,
          updatedAt: nowMs,
        });
        await syncResourceMemoryProjectionsForModule({
          ctx,
          communityId: module.communityId,
          moduleId: module._id,
        });
      }
      modulesUpdated += 1;
    }

    return {
      ok: true,
      kind: "community_resource_module_status_backfill",
      dry_run: dryRun,
      community_id: args.communityId ? normalizeIdValue(args.communityId) : null,
      limit,
      modules_checked: modules.length,
      modules_already_explicit: modulesAlreadyExplicit,
      modules_updated: modulesUpdated,
      modules_live: modulesLive,
      modules_draft: modulesDraft,
    };
  },
});

// A long page's sections, so an agent can read it one section at a time with
// offset and limit. Pages with one section leave it out.
function readSectionOutline(body: string) {
  const sections = communityLessonSections(body);
  if (sections.length < 2) return undefined;
  return sections.map(({ index, heading, offset, chars }) => ({ index, heading, offset, chars }));
}

function boundedReadOffset(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1_000_000, parsed));
}

function boundedReadLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS, parsed));
}

function normalizeDirectoryToolPath(raw: unknown): string {
  const value = String(raw ?? "/").trim() || "/";
  const withRoot = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withRoot.replace(/\/+/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/$/, "") : "/";
}

function normalizeDirectoryPathForMatch(raw: unknown): string {
  return normalizeDirectoryToolPath(raw).toLowerCase();
}

function requireExpectedUpdatedAt(args: {
  expectedUpdatedAt: unknown;
  actualUpdatedAt: unknown;
}): void {
  const expected = Number(args.expectedUpdatedAt);
  const actual = Number(args.actualUpdatedAt);
  if (!Number.isFinite(expected)) {
    throw new Error("community_resource_expected_updated_at_required");
  }
  if (expected !== actual) {
    throw new Error("community_resource_edit_conflict");
  }
}

function normalizeBuilderResourceStatus(args: {
  raw: unknown;
  existingStatus?: unknown;
  publishing?: boolean;
  confirmPublish?: boolean;
  defaultStatus: "draft" | "review";
}): "draft" | "review" | "published" | "processing" | "failed" {
  const hasRaw = args.raw !== undefined;
  const next = hasRaw
    ? requireResourceStatusForWrite(args.raw)
    : args.existingStatus !== undefined
      ? normalizeResourceStatus(args.existingStatus)
      : args.defaultStatus;
  if (next === "published") {
    throw new Error("community_resource_page_status_deprecated");
  }
  if (args.publishing) {
    throw new Error("community_resource_page_status_deprecated");
  }
  return next;
}

// Members never get a quiz's answer key in the lesson text.
function memberLessonBody(row: CommunityResourceLike): string {
  const body = String(row.bodyMd ?? "");
  return row.lesson ? redactCommunityLessonAnswers(body) : body;
}

// An agent staging a body hears about a broken button, checklist or quiz right
// away; a body edited by hand just shows a bad block as plain code.
function strictLessonBody<T extends string | null | undefined>(bodyMd: T): T {
  parseCommunityLessonElements(bodyMd, { strict: true });
  return bodyMd;
}

function hasOwnField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function normalizeChangesetSummary(raw: unknown): string {
  const summary = normalizeOptionalText(raw, COMMUNITY_RESOURCE_BUILDER_CHANGESET_SUMMARY_MAX_CHARS);
  if (!summary) throw new Error("community_resource_changeset_summary_required");
  return summary;
}

function normalizeChangesetOperationKey(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value && /^[a-z0-9_-]{1,80}$/.test(value) ? value : null;
}

function normalizeRequiredResourceRef(raw: unknown, fieldName: string): string {
  const value = normalizeOptionalModuleId(raw);
  if (!value) throw new Error(`${fieldName}_required`);
  return value;
}

function normalizeExpectedUpdatedAtForChangeset(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error("community_resource_changeset_expected_updated_at_required");
  }
  return value;
}

function normalizeChangesetPageStatus(raw: unknown): "draft" | "review" | "processing" | "failed" {
  const status = normalizeResourceStatus(raw);
  if (status === "published") {
    throw new Error("community_resource_changeset_publish_deferred");
  }
  return status;
}

function normalizeChangesetModuleStatus(raw: unknown): "draft" | "live" {
  return requireResourceModuleStatusForWrite(raw);
}

// How a course's lessons read: "article" (clean page) or "video" (text on a
// card under the video). Agents must name one exactly.
function normalizeChangesetLessonStyle(raw: unknown): "article" | "video" {
  if (raw === "article" || raw === "video") return raw;
  throw new Error("community_resource_changeset_lesson_style_invalid");
}

function normalizeCommunityResourceBuilderChangesetOperations(
  rawOperations: unknown,
): CommunityResourceBuilderChangesetOperation[] {
  if (!Array.isArray(rawOperations)) {
    throw new Error("community_resource_changeset_operations_required");
  }
  if (rawOperations.length < 1) {
    throw new Error("community_resource_changeset_empty");
  }
  if (rawOperations.length > COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_OPERATIONS) {
    throw new Error("community_resource_changeset_too_large");
  }

  const operations = rawOperations.map((raw, index): CommunityResourceBuilderChangesetOperation => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`community_resource_changeset_operation_${index}_invalid`);
    }
    const record = raw as Record<string, unknown>;
    const op = String(record.op ?? record.kind ?? "").trim().toLowerCase();
    if (op === "create_module") {
      return {
        op,
        ...(normalizeChangesetOperationKey(record.module_key)
          ? { module_key: normalizeChangesetOperationKey(record.module_key) }
          : null),
        name: normalizeName(record.name),
        description_md: normalizeOptionalText(record.description_md, 1200) ?? null,
        module_status: hasOwnField(record, "module_status")
          ? normalizeChangesetModuleStatus(record.module_status)
          : "draft",
        ...(hasOwnField(record, "lesson_style")
          ? { lesson_style: normalizeChangesetLessonStyle(record.lesson_style) }
          : null),
      };
    }
    if (op === "edit_module") {
      const next: CommunityResourceBuilderChangesetOperation = {
        op,
        module_id: normalizeRequiredResourceRef(record.module_id, "community_resource_changeset_module_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
      if (hasOwnField(record, "name")) next.name = normalizeName(record.name);
      if (hasOwnField(record, "description_md")) {
        next.description_md = normalizeOptionalText(record.description_md, 1200) ?? null;
      }
      if (hasOwnField(record, "module_status")) {
        next.module_status = normalizeChangesetModuleStatus(record.module_status);
      }
      if (hasOwnField(record, "lesson_style")) {
        next.lesson_style = normalizeChangesetLessonStyle(record.lesson_style);
      }
      if (!hasOwnField(record, "name") && !hasOwnField(record, "description_md") && !hasOwnField(record, "module_status") && !hasOwnField(record, "lesson_style")) {
        throw new Error("community_resource_changeset_edit_module_empty");
      }
      return next;
    }
    if (op === "create_page") {
      return {
        op,
        module_id: normalizeOptionalModuleId(record.module_id),
        ...(normalizeChangesetOperationKey(record.module_key)
          ? { module_key: normalizeChangesetOperationKey(record.module_key) }
          : null),
        title: normalizeName(record.title),
        body_md: hasOwnField(record, "body_md")
          ? strictLessonBody(normalizeAuthoredCommunityResourceBodyMd(record.body_md))
          : null,
        source_resource_id: normalizeOptionalModuleId(record.source_resource_id),
        ...(hasOwnField(record, "type") ? { type: normalizeResourceType(record.type) } : null),
        ...(hasOwnField(record, "url") ? { url: normalizeOptionalUrl(record.url) ?? null } : null),
        ...(hasOwnField(record, "resource_status")
          ? { resource_status: normalizeChangesetPageStatus(record.resource_status) }
          : null),
        ...(hasOwnField(record, "pinned") ? { pinned: Boolean(record.pinned) } : null),
        ...(hasOwnField(record, "lesson") ? { lesson: normalizeCommunityLessonFields(record.lesson) } : null),
      };
    }
    if (op === "edit_page") {
      const next: CommunityResourceBuilderChangesetOperation = {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
      if (hasOwnField(record, "module_id")) next.module_id = normalizeOptionalModuleId(record.module_id);
      if (hasOwnField(record, "title")) next.title = normalizeName(record.title);
      if (hasOwnField(record, "body_md")) next.body_md = strictLessonBody(normalizeAuthoredCommunityResourceBodyMd(record.body_md));
      if (hasOwnField(record, "source_resource_id")) {
        next.source_resource_id = normalizeOptionalModuleId(record.source_resource_id);
      }
      if (hasOwnField(record, "type")) next.type = normalizeResourceType(record.type);
      if (hasOwnField(record, "url")) next.url = normalizeOptionalUrl(record.url) ?? null;
      if (hasOwnField(record, "resource_status")) next.resource_status = normalizeChangesetPageStatus(record.resource_status);
      if (hasOwnField(record, "pinned")) next.pinned = Boolean(record.pinned);
      if (hasOwnField(record, "lesson")) next.lesson = normalizeCommunityLessonFields(record.lesson);
      if (Object.keys(next).length <= 3) {
        throw new Error("community_resource_changeset_edit_page_empty");
      }
      return next;
    }
    if (op === "move_resource") {
      return {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
        module_id: normalizeOptionalModuleId(record.module_id),
      };
    }
    if (op === "delete_page") {
      return {
        op,
        resource_id: normalizeRequiredResourceRef(record.resource_id, "community_resource_changeset_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
    }
    if (op === "delete_category") {
      return {
        op,
        module_id: normalizeRequiredResourceRef(record.module_id, "community_resource_changeset_module_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
      };
    }
    if (op === "link_source_to_page") {
      return {
        op,
        page_resource_id: normalizeRequiredResourceRef(record.page_resource_id, "community_resource_changeset_page_resource_id"),
        expected_updated_at: normalizeExpectedUpdatedAtForChangeset(record.expected_updated_at),
        source_resource_id: normalizeRequiredResourceRef(record.source_resource_id, "community_resource_changeset_source_resource_id"),
      };
    }
    throw new Error("community_resource_changeset_operation_unsupported");
  });
  const bodyChars = operations.reduce((total, operation) =>
    total + ("body_md" in operation ? String(operation.body_md ?? "").length : 0), 0);
  if (bodyChars > COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_BODY_CHARS) {
    throw new Error(`community_resource_changeset_too_large: These pages hold ${bodyChars.toLocaleString("en-US")} characters together; one changeset carries up to ${COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_BODY_CHARS.toLocaleString("en-US")}. Stage the rest in the next changeset.`);
  }
  return operations;
}

function communityResourceBuilderChangesetOperationSummary(
  operation: CommunityResourceBuilderChangesetOperation,
): string {
  if (operation.op === "create_module") return `Create module "${operation.name}"`;
  if (operation.op === "edit_module") return `Edit module ${operation.module_id}`;
  if (operation.op === "create_page") return `Create page "${operation.title}"`;
  if (operation.op === "edit_page") return `Edit page ${operation.resource_id}`;
  if (operation.op === "move_resource") return `Move resource ${operation.resource_id}`;
  if (operation.op === "delete_page") return `Delete page ${operation.resource_id}`;
  if (operation.op === "delete_category") return `Delete empty category ${operation.module_id}`;
  return `Link source ${operation.source_resource_id} to page ${operation.page_resource_id}`;
}

function trimChangesetPreviewText(raw: unknown, maxChars: number): string | null {
  const normalized = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxChars
    ? `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
    : normalized;
}

function trimChangesetPreviewTitle(raw: unknown): string {
  return trimChangesetPreviewText(raw, COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TITLE_CHARS) ?? "Resource change";
}

function changesetOperationModuleTarget(
  operation: { module_id?: string | null; module_key?: string | null },
): string {
  if (operation.module_key) return operation.module_key;
  if (operation.module_id) return operation.module_id;
  return "Unsorted";
}

function previewCommunityResourceBuilderChangesetOperation(
  operation: CommunityResourceBuilderChangesetOperation,
): CommunityResourceBuilderChangesetPreviewItem {
  if (operation.op === "create_module") {
    return {
      op: operation.op,
      marker: "+",
      title: trimChangesetPreviewTitle(operation.name),
      preview: trimChangesetPreviewText(
        operation.description_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "edit_module") {
    return {
      op: operation.op,
      marker: "~",
      title: trimChangesetPreviewTitle(operation.name ?? operation.module_id),
      preview: trimChangesetPreviewText(
        operation.description_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "create_page") {
    return {
      op: operation.op,
      marker: "+",
      title: trimChangesetPreviewTitle(
        `${changesetOperationModuleTarget(operation)} / ${operation.title}`,
      ),
      preview: trimChangesetPreviewText(
        operation.body_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "edit_page") {
    return {
      op: operation.op,
      marker: "~",
      title: trimChangesetPreviewTitle(operation.title ?? operation.resource_id),
      preview: trimChangesetPreviewText(
        operation.body_md,
        COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
      ),
    };
  }
  if (operation.op === "move_resource") {
    return {
      op: operation.op,
      marker: ">",
      title: trimChangesetPreviewTitle(operation.resource_id),
      preview: `Moves to ${changesetOperationModuleTarget(operation)}`,
    };
  }
  if (operation.op === "delete_page") {
    return {
      op: operation.op,
      marker: "x",
      title: trimChangesetPreviewTitle(operation.resource_id),
      preview: "Deletes this page from Resources.",
    };
  }
  if (operation.op === "delete_category") {
    return {
      op: operation.op,
      marker: "x",
      title: trimChangesetPreviewTitle(operation.module_id),
      preview: "Deletes this empty category from Resources.",
    };
  }
  return {
    op: operation.op,
    marker: ">",
    title: trimChangesetPreviewTitle(operation.page_resource_id),
    preview: trimChangesetPreviewText(
      `Links source ${operation.source_resource_id}`,
      COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS,
    ),
  };
}

function buildCommunityResourceBuilderChangesetPreview(
  operations: CommunityResourceBuilderChangesetOperation[],
): {
  total_count: number;
  preview_limit: number;
  preview_items: CommunityResourceBuilderChangesetPreviewItem[];
} {
  return {
    total_count: operations.length,
    preview_limit: COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT,
    preview_items: operations
      .slice(0, COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT)
      .map(previewCommunityResourceBuilderChangesetOperation),
  };
}

function getCommunityResourceBuilderPreflightIssueCount(preflight: unknown): number {
  const record =
    preflight && typeof preflight === "object" && !Array.isArray(preflight)
      ? (preflight as Record<string, unknown>)
      : null;
  const health =
    record?.health && typeof record.health === "object" && !Array.isArray(record.health)
      ? (record.health as Record<string, unknown>)
      : null;
  const summary =
    health?.summary && typeof health.summary === "object" && !Array.isArray(health.summary)
      ? (health.summary as Record<string, unknown>)
      : null;
  const count = Number(summary?.issue_count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

async function requireChangesetModuleRef(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null | undefined;
  createdModuleKeys?: Set<string>;
  moduleKey?: string | null;
}): Promise<void> {
  if (args.moduleKey) {
    if (!args.createdModuleKeys?.has(args.moduleKey)) {
      throw new Error("community_resource_changeset_module_key_not_found");
    }
    return;
  }
  await requireValidResourceModule({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: args.moduleId ?? null,
  });
}

async function requireChangesetResourceRef(args: {
  ctx: any;
  communityId: any;
  resourceId: string;
  role?: "page" | "source";
  expectedUpdatedAt?: number;
}): Promise<CommunityResourceLike> {
  const resource = (await args.ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
  if (!resource || String(resource.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_changeset_resource_not_found");
  }
  if (args.role && normalizeResourceRole(resource.role) !== args.role) {
    throw new Error(args.role === "source" ? "community_source_resource_required" : "community_page_resource_required");
  }
  if (typeof args.expectedUpdatedAt === "number") {
    requireExpectedUpdatedAt({
      expectedUpdatedAt: args.expectedUpdatedAt,
      actualUpdatedAt: resource.updatedAt,
    });
  }
  return resource;
}

async function requireChangesetEmptyModuleRef(args: {
  ctx: any;
  communityId: any;
  moduleId: string;
  expectedUpdatedAt: number;
}): Promise<CommunityResourceModuleLike> {
  const module = (await args.ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
  if (!module || String(module.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_module_not_found");
  }
  requireExpectedUpdatedAt({
    expectedUpdatedAt: args.expectedUpdatedAt,
    actualUpdatedAt: module.updatedAt,
  });
  const children = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module", (q: any) =>
      q.eq("communityId", args.communityId).eq("moduleId", module._id),
    )
    .take(1)) as CommunityResourceLike[];
  if (children.length > 0) {
    throw new Error("community_resource_changeset_category_not_empty");
  }
  return module;
}

async function buildCommunityResourceBuilderChangesetPreflight(args: {
  ctx: any;
  communityId: any;
  operations: CommunityResourceBuilderChangesetOperation[];
  nowMs: number;
}): Promise<any> {
  const createdModuleKeys = new Set<string>();
  const operationSummaries: Array<Record<string, unknown>> = [];

  for (const [index, operation] of args.operations.entries()) {
    if (operation.op === "create_module") {
      if (operation.module_key) {
        if (createdModuleKeys.has(operation.module_key)) {
          throw new Error("community_resource_changeset_duplicate_module_key");
        }
        createdModuleKeys.add(operation.module_key);
      }
      operationSummaries.push({
        index,
        op: operation.op,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_module") {
      const module = (await args.ctx.db.get(operation.module_id as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: operation.expected_updated_at,
        actualUpdatedAt: module.updatedAt,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "create_page") {
      await requireChangesetModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
        moduleKey: operation.module_key,
        createdModuleKeys,
      });
      if (operation.source_resource_id) {
        await requireChangesetResourceRef({
          ctx: args.ctx,
          communityId: args.communityId,
          resourceId: operation.source_resource_id,
          role: "source",
        });
      }
      operationSummaries.push({
        index,
        op: operation.op,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_page") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        role: "page",
        expectedUpdatedAt: operation.expected_updated_at,
      });
      if (hasOwnField(operation as any, "module_id")) {
        await requireChangesetModuleRef({
          ctx: args.ctx,
          communityId: args.communityId,
          moduleId: operation.module_id,
        });
      }
      if (operation.source_resource_id) {
        await requireChangesetResourceRef({
          ctx: args.ctx,
          communityId: args.communityId,
          resourceId: operation.source_resource_id,
          role: "source",
        });
      }
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "move_resource") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      await requireChangesetModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_page") {
      await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        role: "page",
        expectedUpdatedAt: operation.expected_updated_at,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_category") {
      await requireChangesetEmptyModuleRef({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: operation.module_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      operationSummaries.push({
        index,
        op: operation.op,
        target_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.page_resource_id,
      role: "page",
      expectedUpdatedAt: operation.expected_updated_at,
    });
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.source_resource_id,
      role: "source",
    });
    operationSummaries.push({
      index,
      op: operation.op,
      target_id: operation.page_resource_id,
      summary: communityResourceBuilderChangesetOperationSummary(operation),
    });
  }

  return {
    ok: true,
    kind: "community_resource_builder_changeset_preflight",
    checked_at: toIsoString(args.nowMs),
    operation_count: args.operations.length,
    operations: operationSummaries,
    health: await buildCommunityResourceBuilderHealthReport({
      ctx: args.ctx,
      communityId: args.communityId,
      nowMs: args.nowMs,
    }),
  };
}

function resolveChangesetModuleId(args: {
  operation: { module_id?: string | null; module_key?: string | null };
  createdModuleIdsByKey: Map<string, any>;
}): any | undefined {
  if (args.operation.module_key) {
    const createdId = args.createdModuleIdsByKey.get(args.operation.module_key);
    if (!createdId) throw new Error("community_resource_changeset_module_key_not_applied");
    return createdId;
  }
  return args.operation.module_id ? args.operation.module_id : undefined;
}

async function createModuleFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "create_module" }>;
  nowMs: number;
}): Promise<CommunityResourceModuleLike> {
  const rows = (await args.ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceModuleLike[];
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
  const id = await args.ctx.db.insert("communityResourceModules" as any, {
    communityId: args.communityId,
    createdByUserId: args.userId,
    status: args.operation.module_status ?? "draft",
    name: args.operation.name,
    descriptionMd: args.operation.description_md ?? undefined,
    lessonStyle: args.operation.lesson_style ?? "article",
    sortOrder: nextSortOrder,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
  if (!created) throw new Error("community_resource_module_create_failed");
  return created;
}

async function createPageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "create_page" }>;
  createdModuleIdsByKey: Map<string, any>;
  nowMs: number;
}): Promise<CommunityResourceLike> {
  const moduleId = resolveChangesetModuleId({
    operation: args.operation,
    createdModuleIdsByKey: args.createdModuleIdsByKey,
  });
  const validatedModuleId = await requireResourceModuleForRole({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: normalizeOptionalModuleId(moduleId),
    role: "page",
  });
  const sourceResourceId = normalizeOptionalModuleId(args.operation.source_resource_id);
  if (sourceResourceId) {
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: sourceResourceId,
      role: "source",
    });
  }
  const sortOrder = await getNextResourceSortOrder({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: validatedModuleId,
  });
  const id = await args.ctx.db.insert("communityResources" as any, {
    communityId: args.communityId,
    moduleId: validatedModuleId,
    createdByUserId: args.userId,
    type: args.operation.type ? normalizeResourceType(args.operation.type) : "post",
    role: "page",
    status: args.operation.resource_status
      ? normalizeBuilderResourceStatus({
          raw: args.operation.resource_status,
          confirmPublish: false,
          defaultStatus: "draft",
        })
      : "draft",
    ...(sourceResourceId ? { sourceResourceId } : {}),
    title: args.operation.title,
    ...(args.operation.url ? { url: args.operation.url } : {}),
    sourceIngestionStatus: "not_required",
    sourceIngestionKind: "manual",
    pinned: Boolean(args.operation.pinned),
    ...(args.operation.lesson ? { lesson: args.operation.lesson } : {}),
    sortOrder,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as CommunityResourceLike | null;
  if (!created) throw new Error("community_resource_create_failed");
  if (args.operation.body_md) {
    await writeCommunityResourceBodyContent(args.ctx, {
      communityId: args.communityId,
      resourceId: created._id,
      bodyMd: args.operation.body_md,
      nowMs: args.nowMs,
      maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, created) ?? created;
  await syncCommunityResourceMemoryProjection(args.ctx, hydrated, args.nowMs);
  return hydrated;
}

async function editPageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "edit_page" }>;
  nowMs: number;
}): Promise<CommunityResourceLike> {
  const existing = await requireChangesetResourceRef({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: args.operation.resource_id,
    role: "page",
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  const nextModuleId = hasOwnField(args.operation as any, "module_id")
    ? await requireResourceModuleForRole({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(args.operation.module_id),
        role: "page",
      })
    : existing.moduleId;
  if (!nextModuleId) throw new Error("community_resource_course_required");
  const nextSourceResourceId = hasOwnField(args.operation as any, "source_resource_id")
    ? normalizeOptionalModuleId(args.operation.source_resource_id)
    : normalizeIdValue(existing.sourceResourceId ?? "");
  if (nextSourceResourceId) {
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: nextSourceResourceId,
      role: "source",
    });
  }
  const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
  const nextSortOrder = moduleChanged
    ? await getNextResourceSortOrder({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: nextModuleId,
        excludeResourceId: existing._id,
      })
    : existing.sortOrder;
  const bodyChanged = hasOwnField(args.operation as any, "body_md");
  await args.ctx.db.patch(existing._id as any, {
    moduleId: nextModuleId,
    ...(hasOwnField(args.operation as any, "type") ? { type: normalizeResourceType(args.operation.type) } : {}),
    ...(hasOwnField(args.operation as any, "resource_status")
      ? {
          status: normalizeBuilderResourceStatus({
            raw: args.operation.resource_status,
            confirmPublish: false,
            defaultStatus: "draft",
          }),
        }
      : {}),
    ...(nextSourceResourceId ? { sourceResourceId: nextSourceResourceId } : { sourceResourceId: undefined }),
    ...(hasOwnField(args.operation as any, "title") ? { title: normalizeName(args.operation.title) } : {}),
    ...(hasOwnField(args.operation as any, "url") ? { url: normalizeOptionalUrl(args.operation.url) } : {}),
    ...(hasOwnField(args.operation as any, "pinned") ? { pinned: Boolean(args.operation.pinned) } : {}),
    ...(hasOwnField(args.operation as any, "lesson") ? { lesson: args.operation.lesson ?? undefined } : {}),
    ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
    updatedAt: args.nowMs,
  });
  const updated = (await args.ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
  if (!updated) throw new Error("community_resource_not_found");
  if (bodyChanged) {
    await writeCommunityResourceBodyContent(args.ctx, {
      communityId: args.communityId,
      resourceId: updated._id,
      bodyMd: args.operation.body_md ?? null,
      nowMs: args.nowMs,
      maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, updated) ?? updated;
  await syncCommunityResourceMemoryProjection(args.ctx, hydrated, args.nowMs);
  return hydrated;
}

async function deletePageFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "delete_page" }>;
}): Promise<CommunityResourceLike> {
  const existing = await requireChangesetResourceRef({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: args.operation.resource_id,
    role: "page",
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  await revokeCommunityResourceMemoryProjection(args.ctx, existing);
  await deleteCommunityResourceBodyContent(args.ctx, existing._id);
  await args.ctx.db.delete(existing._id as any);
  return existing;
}

async function deleteCategoryFromChangesetOperation(args: {
  ctx: any;
  communityId: any;
  operation: Extract<CommunityResourceBuilderChangesetOperation, { op: "delete_category" }>;
}): Promise<CommunityResourceModuleLike> {
  const module = await requireChangesetEmptyModuleRef({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: args.operation.module_id,
    expectedUpdatedAt: args.operation.expected_updated_at,
  });
  if (module.bannerStorageId) {
    await maybeDeleteStorageAsset(args.ctx, module.bannerStorageId);
  }
  await args.ctx.db.delete(module._id as any);
  return module;
}

async function applyCommunityResourceBuilderChangesetOperations(args: {
  ctx: any;
  communityId: any;
  userId: any;
  operations: CommunityResourceBuilderChangesetOperation[];
  nowMs: number;
}): Promise<any> {
  const createdModuleIdsByKey = new Map<string, any>();
  const applied: Array<Record<string, unknown>> = [];

  for (const [index, operation] of args.operations.entries()) {
    if (operation.op === "create_module") {
      const module = await createModuleFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        userId: args.userId,
        operation,
        nowMs: args.nowMs,
      });
      if (operation.module_key) createdModuleIdsByKey.set(operation.module_key, module._id);
      applied.push({
        index,
        op: operation.op,
        module_id: normalizeIdValue(module._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_module") {
      const module = (await args.ctx.db.get(operation.module_id as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: operation.expected_updated_at,
        actualUpdatedAt: module.updatedAt,
      });
      const moduleStatusChanged = hasOwnField(operation as any, "module_status") &&
        normalizeResourceModuleStatus(module.status) !== operation.module_status;
      await args.ctx.db.patch(module._id as any, {
        ...(hasOwnField(operation as any, "name") ? { name: operation.name } : {}),
        ...(hasOwnField(operation as any, "description_md") ? { descriptionMd: operation.description_md ?? undefined } : {}),
        ...(hasOwnField(operation as any, "module_status") ? { status: operation.module_status } : {}),
        ...(hasOwnField(operation as any, "lesson_style") ? { lessonStyle: operation.lesson_style } : {}),
        updatedAt: args.nowMs,
      });
      if (moduleStatusChanged) {
        await syncResourceMemoryProjectionsForModule({
          ctx: args.ctx,
          communityId: args.communityId,
          moduleId: module._id,
        });
      }
      applied.push({
        index,
        op: operation.op,
        module_id: operation.module_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "create_page") {
      const page = await createPageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        userId: args.userId,
        operation,
        createdModuleIdsByKey,
        nowMs: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: normalizeIdValue(page._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "edit_page") {
      const page = await editPageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
        nowMs: args.nowMs,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: normalizeIdValue(page._id),
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "move_resource") {
      const resource = await requireChangesetResourceRef({
        ctx: args.ctx,
        communityId: args.communityId,
        resourceId: operation.resource_id,
        expectedUpdatedAt: operation.expected_updated_at,
      });
      const moduleId = await requireResourceModuleForRole({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(operation.module_id),
        role: normalizeResourceRole(resource.role),
      });
      const sortOrder = await getNextResourceSortOrder({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId,
        excludeResourceId: resource._id,
      });
      await args.ctx.db.patch(resource._id as any, {
        ...(moduleId ? { moduleId } : { moduleId: undefined }),
        sortOrder,
        updatedAt: args.nowMs,
      });
      const updated = (await args.ctx.db.get(resource._id as any)) as CommunityResourceLike | null;
      if (updated) await syncCommunityResourceMemoryProjection(args.ctx, updated, args.nowMs);
      applied.push({
        index,
        op: operation.op,
        resource_id: operation.resource_id,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_page") {
      const page = await deletePageFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
      });
      applied.push({
        index,
        op: operation.op,
        resource_id: operation.resource_id,
        title: page.title,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    if (operation.op === "delete_category") {
      const module = await deleteCategoryFromChangesetOperation({
        ctx: args.ctx,
        communityId: args.communityId,
        operation,
      });
      applied.push({
        index,
        op: operation.op,
        module_id: operation.module_id,
        name: module.name,
        summary: communityResourceBuilderChangesetOperationSummary(operation),
      });
      continue;
    }

    const page = await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.page_resource_id,
      role: "page",
      expectedUpdatedAt: operation.expected_updated_at,
    });
    await requireChangesetResourceRef({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: operation.source_resource_id,
      role: "source",
    });
    await args.ctx.db.patch(page._id as any, {
      sourceResourceId: operation.source_resource_id,
      updatedAt: args.nowMs,
    });
    const updated = (await args.ctx.db.get(page._id as any)) as CommunityResourceLike | null;
    if (updated) await syncCommunityResourceMemoryProjection(args.ctx, updated, args.nowMs);
    applied.push({
      index,
      op: operation.op,
      resource_id: operation.page_resource_id,
      source_resource_id: operation.source_resource_id,
      summary: communityResourceBuilderChangesetOperationSummary(operation),
    });
  }

  return {
    ok: true,
    kind: "community_resource_builder_changeset_apply_result",
    operation_count: args.operations.length,
    applied,
    health: await buildCommunityResourceBuilderHealthReport({
      ctx: args.ctx,
      communityId: args.communityId,
      nowMs: args.nowMs,
    }),
  };
}

async function requireCommunityResourceDirectoryToolAccess(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<any> {
  const userId =
    args.userId ??
    await resolveUserIdForAuthenticatedRequest({
      ctx: args.ctx,
      authSubject: args.authSubject ?? null,
    });
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return userId;
}

async function listResourceDirectoryModules(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceModuleLike[]> {
  return (await ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT)) as CommunityResourceModuleLike[];
}

async function listResourceDirectoryLiveModules(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceModuleLike[]> {
  const rows = await listResourceDirectoryModules(ctx, communityId);
  return rows.filter(communityResourceModuleIsLive);
}

async function listResourceDirectoryLivePageResources(
  ctx: any,
  communityId: any,
  liveModuleIds: Set<string>,
  readerUserId: any,
): Promise<CommunityResourceLike[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[];
  // A member's agent can't list or read lessons sold in a track they don't have.
  const paid = await readCommunityPaidLockedLessonIds(ctx, communityId, readerUserId);
  return rows
    .filter((row) => communityResourceIsLiveModulePage(row, liveModuleIds) && !paid.has(normalizeIdValue(row._id)))
    .sort(compareCommunityResources);
}

function normalizeCommunityResourceSemanticTraversalLimit(raw: unknown): number {
  const parsed = Math.floor(
    Number(raw ?? COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT),
  );
  if (!Number.isFinite(parsed)) {
    return COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_DEFAULT_LIMIT;
  }
  return Math.max(
    1,
    Math.min(COMMUNITY_RESOURCE_SEMANTIC_TRAVERSAL_MAX_LIMIT, parsed),
  );
}

function normalizeCommunityResourceSemanticTraversalCursor(
  raw: unknown,
): string | null {
  const cursor = String(raw ?? "").trim();
  if (cursor.length > 2_048) {
    throw new Error("community_resource_semantic_cursor_invalid");
  }
  return cursor || null;
}

function mapCommunityResourceSemanticModuleEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike;
}) {
  const directory = buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(args.module._id),
    moduleName: args.module.name,
  });
  return {
    kind: "directory" as const,
    name: args.module.name,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
  };
}

function mapCommunityResourceSemanticPageEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike;
  resource: CommunityResourceLike;
}) {
  const resourceId = normalizeIdValue(args.resource._id);
  const directory = buildCommunityResourceDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(args.module._id),
    moduleName: args.module.name,
    resourceId,
    resourceTitle: args.resource.title,
    resourceRole: "page",
  });
  return {
    kind: "document" as const,
    title: args.resource.title,
    ref: buildCommunityResourceEvidenceRef(resourceId),
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    lesson: args.resource.lesson ?? null,
  };
}

/**
 * Cursorable canonical traversal for the `/resources/` semantic mount.
 * This owns no product state and deliberately excludes bodies, sources,
 * builder state, counts, and readable-path resolution.
 */
export async function listCommunityResourceSemanticDirectoryCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  moduleId?: any;
  cursor?: string | null;
  limit?: number | null;
}) {
  await requireCommunityResourceDirectoryToolAccess({
    ctx: args.ctx,
    userId: args.userId,
    communityId: args.communityId,
  });
  const cursor = normalizeCommunityResourceSemanticTraversalCursor(args.cursor);
  const limit = normalizeCommunityResourceSemanticTraversalLimit(args.limit);

  if (!args.moduleId) {
    const page = await args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community_sortOrder", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate({
        cursor,
        numItems: limit,
        maximumRowsRead: limit,
      });
    return {
      scope: "modules" as const,
      entries: (page.page as CommunityResourceModuleLike[])
        .filter(communityResourceModuleIsLive)
        .map((module) =>
          mapCommunityResourceSemanticModuleEntry({
            communityId: args.communityId,
            module,
          }),
        ),
      next_cursor: page.isDone ? null : page.continueCursor,
      truncated: !page.isDone,
    };
  }

  const module = (await args.ctx.db.get(
    args.moduleId as any,
  )) as CommunityResourceModuleLike | null;
  if (
    !module ||
    normalizeIdValue(module.communityId) !== normalizeIdValue(args.communityId) ||
    !communityResourceModuleIsLive(module)
  ) {
    throw new Error("community_resource_semantic_module_not_found");
  }
  const page = await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_module_sortOrder", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("moduleId", args.moduleId),
    )
    .order("asc")
    .paginate({
      cursor,
      numItems: limit,
      maximumRowsRead: limit,
    });
  const liveModuleIds = new Set([normalizeIdValue(module._id)]);
  return {
    scope: "resources" as const,
    module: mapCommunityResourceSemanticModuleEntry({
      communityId: args.communityId,
      module,
    }),
    entries: (page.page as CommunityResourceLike[])
      .filter((resource) =>
        communityResourceIsLiveModulePage(resource, liveModuleIds),
      )
      .map((resource) =>
        mapCommunityResourceSemanticPageEntry({
          communityId: args.communityId,
          module,
          resource,
        }),
      ),
    next_cursor: page.isDone ? null : page.continueCursor,
    truncated: !page.isDone,
  };
}

function buildModuleNameMap(modules: CommunityResourceModuleLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const module of modules) {
    out.set(normalizeIdValue(module._id), module.name);
  }
  return out;
}

function buildUnsortedModuleDirectoryFields(communityId: any) {
  return buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(communityId),
    moduleId: COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
    moduleName: "Unsorted",
  });
}

function buildResourceDirectoryFieldsForTool(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const moduleId = row.moduleId ? normalizeIdValue(row.moduleId) : null;
  return buildCommunityResourceDirectoryFields({
    communityId: normalizeIdValue(row.communityId),
    moduleId,
    moduleName: moduleId ? moduleNameMap.get(moduleId) ?? null : null,
    resourceId: normalizeIdValue(row._id),
    resourceTitle: row.title,
    resourceRole: normalizeResourceRole(row.role),
  });
}

function compactResourceSummary(row: CommunityResourceLike): string | null {
  const body = String(row.bodyMd ?? "").replace(/\s+/g, " ").trim();
  if (body) return body.slice(0, 220);
  if (communityResourceBodyChars(row) > 0) return "Readable resource content stored.";
  const url = String(row.url ?? "").trim();
  if (url) return `External resource: ${url.slice(0, 180)}`;
  if (row.fileKey) return "Uploaded resource without parsed text.";
  return null;
}

function mapCompactCommunityResourceBuilderListRow(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const moduleId = row.moduleId ? normalizeIdValue(row.moduleId) : null;
  const directory = buildResourceDirectoryFieldsForTool(row, moduleNameMap);
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    module_id: moduleId,
    module_name: moduleId ? moduleNameMap.get(moduleId) ?? null : null,
    directory_uri: directory.directory_uri,
    directory_path: directory.directory_path,
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    type: String(row.type ?? "").trim().toLowerCase() || "post",
    provider: row.sourceExternalProvider ?? null,
    url: row.url ?? null,
    source_resource_id: row.sourceResourceId ? normalizeIdValue(row.sourceResourceId) : null,
    source_ingestion_status: normalizeResourceSourceIngestionStatus(row),
    source_ingestion_kind: normalizeResourceSourceIngestionKind(row),
    source_external_provider: row.sourceExternalProvider ?? null,
    source_external_name: row.sourceExternalName ?? null,
    source_external_url: row.sourceExternalUrl ?? null,
    source_external_mime_type: row.sourceExternalMimeType ?? null,
    source_external_modified_at:
      typeof row.sourceExternalModifiedAt === "number" ? toIsoString(row.sourceExternalModifiedAt) : null,
    has_file: Boolean(row.fileKey),
    body_chars: communityResourceBodyChars(row),
    summary: compactResourceSummary(row),
    updated_at: toIsoString(row.updatedAt),
  };
}

function compactModuleSummary(module: CommunityResourceModuleLike | null): string | null {
  const description = String(module?.descriptionMd ?? "").replace(/\s+/g, " ").trim();
  return description ? description.slice(0, 220) : null;
}

function buildResourceDirectoryEntry(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
) {
  const directory = buildResourceDirectoryFieldsForTool(row, moduleNameMap);
  const resourceId = normalizeIdValue(row._id);
  return {
    type: "resource",
    ref: buildCommunityResourceEvidenceRef(resourceId),
    resource_id: resourceId,
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    url: row.url ?? null,
    has_file: Boolean(row.fileKey),
    summary: compactResourceSummary(row),
    lesson: row.lesson ?? null,
    lineage: deriveCommunityResourceLineageEnvelope({
      communityId: normalizeIdValue(row.communityId),
      resourceId,
      recordedByUserId: row.createdByUserId
        ? normalizeIdValue(row.createdByUserId)
        : null,
    }),
    updated_at: toIsoString(row.updatedAt),
  };
}

function buildModuleDirectoryEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  resources: CommunityResourceLike[];
}) {
  const moduleId = args.module
    ? normalizeIdValue(args.module._id)
    : COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT;
  const directory = args.module
    ? buildCommunityResourceModuleDirectoryFields({
        communityId: normalizeIdValue(args.communityId),
        moduleId,
        moduleName: args.module.name,
      })
    : buildUnsortedModuleDirectoryFields(args.communityId);
  const sourceCount = args.resources.filter((row) => normalizeResourceRole(row.role) === "source").length;
  const pageCount = args.resources.length - sourceCount;
  return {
    type: "directory",
    module_id: args.module ? moduleId : null,
    name: args.module ? args.module.name : "Unsorted",
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    resource_count: args.resources.length,
    page_count: pageCount,
    source_count: sourceCount,
    summary: compactModuleSummary(args.module),
    updated_at: args.module ? toIsoString(args.module.updatedAt) : null,
  };
}

function moduleResources(
  resources: CommunityResourceLike[],
  moduleId: string | null,
): CommunityResourceLike[] {
  const target = moduleId ?? "";
  return resources.filter((row) => resourceModuleIdentity(row.moduleId) === target);
}

function compareCommunityResourceModules(
  a: CommunityResourceModuleLike,
  b: CommunityResourceModuleLike,
): number {
  const aSortOrder = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
    ? a.sortOrder
    : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
    ? b.sortOrder
    : Number.MAX_SAFE_INTEGER;
  if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
  return b.createdAt - a.createdAt;
}

function compareSuggestedResourceReadTargets(
  a: CommunityResourceLike,
  b: CommunityResourceLike,
): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
  const aRole = normalizeResourceRole(a.role);
  const bRole = normalizeResourceRole(b.role);
  if (aRole !== bRole) return aRole === "page" ? -1 : 1;
  const aBodyReady = communityResourceBodyChars(a) > 0;
  const bBodyReady = communityResourceBodyChars(b) > 0;
  if (aBodyReady !== bBodyReady) return aBodyReady ? -1 : 1;
  return compareCommunityResources(a, b);
}

function readContentUnavailableReason(row: CommunityResourceLike): string | null {
  if (communityResourceBodyChars(row) > 0) return null;
  if (row.fileKey && row.url) return "external_or_uploaded_content_not_parsed";
  if (row.fileKey) return "uploaded_file_not_parsed";
  if (row.url) return "external_url_metadata_only";
  return "resource_has_no_readable_content";
}

function resolveVisibleResourceById(args: {
  resources: CommunityResourceLike[];
  resourceId: string;
}): CommunityResourceLike | null {
  const resourceId = normalizeIdValue(args.resourceId);
  return args.resources.find((row) => normalizeIdValue(row._id) === resourceId) ?? null;
}

async function resolveResourceByRef(args: {
  ctx: any;
  communityId: any;
  ref: string;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}): Promise<
  | { ok: true; resource: CommunityResourceLike }
  | {
      ok: false;
      reason_code: "ambiguous_resource_ref";
      message: string;
      matches: ReturnType<typeof buildResourceDirectoryEntry>[];
    }
> {
  const ref = String(args.ref ?? "").trim();
  if (!ref) throw new Error("community_resource_ref_required");

  const typedResourceId = parseCommunityResourceEvidenceRef(ref);
  if (typedResourceId) {
    const typed = resolveVisibleResourceById({
      resources: args.resources,
      resourceId: typedResourceId,
    });
    if (!typed) throw new Error("community_resource_not_found");
    return { ok: true, resource: typed };
  }

  const parsed = parseCommunityResourceDirectoryUri(ref);
  if (parsed?.resourceId) {
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    const byUri = resolveVisibleResourceById({
      resources: args.resources,
      resourceId: parsed.resourceId,
    });
    if (!byUri) throw new Error("community_resource_not_found");
    return { ok: true, resource: byUri };
  }

  const byId = resolveVisibleResourceById({
    resources: args.resources,
    resourceId: ref,
  });
  if (byId) return { ok: true, resource: byId };

  const normalizedPath = normalizeDirectoryPathForMatch(ref);
  const matches = args.resources.filter((row) => {
    const directory = buildResourceDirectoryFieldsForTool(row, args.moduleNameMap);
    return normalizeDirectoryPathForMatch(directory.directory_path) === normalizedPath;
  });
  if (matches.length > 1) {
    return {
      ok: false,
      reason_code: "ambiguous_resource_ref",
      message: "Multiple community resources share this readable path. Use directory_uri or resource_id instead.",
      matches: matches
        .slice(0, COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT)
        .map((row) => buildResourceDirectoryEntry(row, args.moduleNameMap)),
    };
  }
  const match = matches[0];
  if (!match) throw new Error("community_resource_not_found");
  return { ok: true, resource: match };
}

async function buildCommunityResourceDirectoryReadPayload(args: {
  ctx: any;
  resource: CommunityResourceLike;
  moduleNameMap: Map<string, string>;
  offset: unknown;
  limit: unknown;
}) {
  const row = await hydrateCommunityResourceBody(args.ctx, args.resource) ?? args.resource;
  const body = memberLessonBody(row);
  const offset = boundedReadOffset(args.offset);
  const limit = boundedReadLimit(args.limit);
  const bodySlice = body ? body.slice(offset, offset + limit) : null;
  return {
    ok: true,
    kind: "community_resource_read",
    resource: buildResourceDirectoryEntry(row, args.moduleNameMap),
    source: null,
    content: {
      body_md: bodySlice,
      offset,
      limit,
      total_chars: body.length,
      sections: readSectionOutline(body),
      truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
      unavailable_reason: readContentUnavailableReason(row),
    },
    lesson_body: row.lesson ? projectCommunityLessonBody(row.bodyMd) : null,
  };
}

export const listCommunityResourceSemanticDirectoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    moduleId: v.optional(v.id("communityResourceModules")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listCommunityResourceSemanticDirectoryCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      moduleId: args.moduleId,
      cursor: args.cursor,
      limit: args.limit,
    }),
});

export const readCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const readerUserId = await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const exact = await resolveExactCommunityResourceEvidenceSelector({
      ctx,
      communityId: args.communityId,
      ref: args.ref,
    });
    if (exact && (await readCommunityPaidLockedLessonIds(ctx, args.communityId, readerUserId)).has(normalizeIdValue(exact.resource._id))) {
      return { ok: false, kind: "community_resource_read", ref: args.ref, reason_code: "community_resource_paywalled",
        message: "This lesson is in a track the member hasn't added to their plan." };
    }
    if (exact) {
      return await buildCommunityResourceDirectoryReadPayload({
        ctx,
        resource: exact.resource,
        moduleNameMap: buildModuleNameMap([exact.module]),
        offset: args.offset,
        limit: args.limit,
      });
    }

    const modules = await listResourceDirectoryLiveModules(ctx, args.communityId);
    const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
    const resources = await listResourceDirectoryLivePageResources(ctx, args.communityId, liveModuleIds, readerUserId);
    const moduleNameMap = buildModuleNameMap(modules);
    const resolved = await resolveResourceByRef({
      ctx,
      communityId: args.communityId,
      ref: args.ref,
      resources,
      moduleNameMap,
    });
    if (!resolved.ok) {
      return {
        kind: "community_resource_read",
        ...resolved,
      };
    }

    const row = await hydrateCommunityResourceBody(ctx, resolved.resource) ?? resolved.resource;
    const body = memberLessonBody(row);
    const offset = boundedReadOffset(args.offset);
    const limit = boundedReadLimit(args.limit);
    const bodySlice = body ? body.slice(offset, offset + limit) : null;
    return {
      ok: true,
      kind: "community_resource_read",
      resource: buildResourceDirectoryEntry(row, moduleNameMap),
      source: null,
      content: {
        body_md: bodySlice,
        offset,
        limit,
        total_chars: body.length,
        sections: readSectionOutline(body),
        truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
        unavailable_reason: readContentUnavailableReason(row),
      },
      lesson_body: row.lesson ? projectCommunityLessonBody(row.bodyMd) : null,
    };
  },
});

type CommunityResourceBuilderRefMatch =
  | {
      target_type: "resource";
      id: string;
      resource_id: string;
      title: string;
      module_id: string | null;
      module_name: string | null;
      directory_path: string;
      directory_uri: string;
      resource_role: string;
      resource_status: string;
    }
  | {
      target_type: "module";
      id: string | null;
      module_id: string | null;
      name: string;
      directory_path: string;
      directory_uri: string;
      module_status: string | null;
      source_inbox?: boolean;
      resource_count: number;
      page_count: number;
      source_count: number;
    };

type ResolvedCommunityResourceBuilderRef =
  | {
      ok: true;
      target_type: "resource";
      resource: CommunityResourceLike;
    }
  | {
      ok: true;
      target_type: "module";
      module: CommunityResourceModuleLike | null;
      sourceInbox: boolean;
    }
  | {
      ok: false;
      reason_code: "ambiguous_resource_builder_ref";
      message: string;
      matches: CommunityResourceBuilderRefMatch[];
    }
  | {
      ok: false;
      reason_code: "resource_builder_ref_not_found";
      message: string;
      suggested_refs: CommunityResourceBuilderRefMatch[];
    };

function normalizeBuilderRefLookupText(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeBuilderRefSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function buildBuilderResourceRefMatch(
  row: CommunityResourceLike,
  moduleNameMap: Map<string, string>,
): CommunityResourceBuilderRefMatch {
  const compact = mapCompactCommunityResourceBuilderListRow(row, moduleNameMap);
  return {
    target_type: "resource",
    id: compact.id,
    resource_id: compact.id,
    title: compact.title,
    module_id: compact.module_id,
    module_name: compact.module_name,
    directory_path: compact.directory_path,
    directory_uri: compact.directory_uri,
    resource_role: compact.resource_role,
    resource_status: compact.resource_status,
  };
}

function buildBuilderModuleRefMatch(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  resources: CommunityResourceLike[];
  sourceInbox?: boolean;
}): CommunityResourceBuilderRefMatch {
  const rows = moduleResources(
    args.resources,
    args.module ? normalizeIdValue(args.module._id) : null,
  );
  const resourceRows = args.sourceInbox
    ? rows.filter((row) => normalizeResourceRole(row.role) === "source")
    : rows;
  const entry = buildModuleDirectoryEntry({
    communityId: args.communityId,
    module: args.module,
    resources: resourceRows,
  });
  return {
    target_type: "module",
    id: entry.module_id,
    module_id: entry.module_id,
    name: args.sourceInbox ? `${entry.name} Source Inbox` : entry.name,
    directory_path: args.sourceInbox
      ? `${entry.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : entry.directory_path,
    directory_uri: args.sourceInbox
      ? `${entry.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : entry.directory_uri,
    module_status: args.module ? normalizeResourceModuleStatus(args.module.status) : null,
    ...(args.module && !args.sourceInbox ? { lesson_style: normalizeResourceModuleLessonStyle(args.module.lessonStyle) } : null),
    ...(args.sourceInbox ? { source_inbox: true } : null),
    resource_count: resourceRows.length,
    page_count: resourceRows.filter((row) => normalizeResourceRole(row.role) !== "source").length,
    source_count: resourceRows.filter((row) => normalizeResourceRole(row.role) === "source").length,
  };
}

function uniqueBuilderRefMatches(matches: CommunityResourceBuilderRefMatch[]): CommunityResourceBuilderRefMatch[] {
  const seen = new Set<string>();
  const out: CommunityResourceBuilderRefMatch[] = [];
  for (const match of matches) {
    const key = `${match.target_type}:${match.id ?? "unsorted"}:${"source_inbox" in match && match.source_inbox ? "source" : "main"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function ambiguousBuilderRef(matches: CommunityResourceBuilderRefMatch[], ref: string): ResolvedCommunityResourceBuilderRef {
  return {
    ok: false,
    reason_code: "ambiguous_resource_builder_ref",
    message: `Multiple resource builder targets match "${ref}". Call community_resource_builder_read again with one exact directory_uri or id from matches.`,
    matches: uniqueBuilderRefMatches(matches).slice(0, COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT),
  };
}

function missingBuilderRef(args: {
  ref: string;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  communityId: any;
}): ResolvedCommunityResourceBuilderRef {
  const suggestedModules = args.modules
    .slice()
    .sort(compareCommunityResourceModules)
    .slice(0, 5)
    .map((module) =>
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
      }),
    );
  const suggestedResources = args.resources
    .slice()
    .sort(compareSuggestedResourceReadTargets)
    .slice(0, 7)
    .map((row) => buildBuilderResourceRefMatch(row, args.moduleNameMap));
  return {
    ok: false,
    reason_code: "resource_builder_ref_not_found",
    message: `No resource builder target matched "${args.ref}". Use a module name, page/source title, id, directory_uri, or readable path from the builder resource listing.`,
    suggested_refs: uniqueBuilderRefMatches([...suggestedModules, ...suggestedResources]),
  };
}

function resolveBuilderModuleById(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleId: string;
  sourceInbox?: boolean;
}): ResolvedCommunityResourceBuilderRef {
  if (args.moduleId === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    return {
      ok: true,
      target_type: "module",
      module: null,
      sourceInbox: Boolean(args.sourceInbox),
    };
  }
  const module = args.modules.find((candidate) => normalizeIdValue(candidate._id) === args.moduleId) ?? null;
  if (!module) {
    return missingBuilderRef({
      ref: args.moduleId,
      modules: args.modules,
      resources: args.resources,
      moduleNameMap: buildModuleNameMap(args.modules),
      communityId: args.communityId,
    });
  }
  return {
    ok: true,
    target_type: "module",
    module,
    sourceInbox: Boolean(args.sourceInbox),
  };
}

function resolveBuilderRefStage(args: {
  ref: string;
  matches: Array<
    | { target_type: "resource"; resource: CommunityResourceLike; match: CommunityResourceBuilderRefMatch }
    | {
        target_type: "module";
        module: CommunityResourceModuleLike | null;
        sourceInbox: boolean;
        match: CommunityResourceBuilderRefMatch;
      }
  >;
}): ResolvedCommunityResourceBuilderRef | null {
  if (args.matches.length === 0) return null;
  if (args.matches.length > 1) {
    return ambiguousBuilderRef(args.matches.map((match) => match.match), args.ref);
  }
  const match = args.matches[0];
  if (match.target_type === "resource") {
    return {
      ok: true,
      target_type: "resource",
      resource: match.resource,
    };
  }
  return {
    ok: true,
    target_type: "module",
    module: match.module,
    sourceInbox: match.sourceInbox,
  };
}

function resolveCommunityResourceBuilderRef(args: {
  communityId: any;
  ref: string;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}): ResolvedCommunityResourceBuilderRef {
  const ref = String(args.ref ?? "").trim();
  if (!ref) throw new Error("community_resource_builder_read_ref_required");

  const resourceById = args.resources.find((row) => normalizeIdValue(row._id) === ref) ?? null;
  if (resourceById) {
    return {
      ok: true,
      target_type: "resource",
      resource: resourceById,
    };
  }

  const moduleById = resolveBuilderRefStage({
    ref,
    matches: args.modules
      .filter((module) => normalizeIdValue(module._id) === ref)
      .map((module) => ({
        target_type: "module" as const,
        module,
        sourceInbox: false,
        match: buildBuilderModuleRefMatch({
          communityId: args.communityId,
          module,
          resources: args.resources,
        }),
      })),
  });
  if (moduleById) return moduleById;
  if (ref === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    return {
      ok: true,
      target_type: "module",
      module: null,
      sourceInbox: false,
    };
  }

  const parsed = parseCommunityResourceDirectoryUri(ref);
  if (parsed) {
    if (parsed.communityId !== normalizeIdValue(args.communityId)) {
      throw new Error("community_resource_directory_community_mismatch");
    }
    if (parsed.resourceId) {
      const resource = args.resources.find((row) => normalizeIdValue(row._id) === parsed.resourceId) ?? null;
      if (!resource) {
        return missingBuilderRef({
          ref,
          modules: args.modules,
          resources: args.resources,
          moduleNameMap: args.moduleNameMap,
          communityId: args.communityId,
        });
      }
      return {
        ok: true,
        target_type: "resource",
        resource,
      };
    }
    return resolveBuilderModuleById({
      communityId: args.communityId,
      modules: args.modules,
      resources: args.resources,
      moduleId: parsed.moduleId,
      sourceInbox: parsed.sourceInbox,
    });
  }

  const resourcePathMatches = args.resources
    .filter((row) => {
      const directory = buildResourceDirectoryFieldsForTool(row, args.moduleNameMap);
      return normalizeDirectoryPathForMatch(directory.directory_path) === normalizeDirectoryPathForMatch(ref);
    })
    .map((resource) => ({
      target_type: "resource" as const,
      resource,
      match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
    }));
  const resourcePath = resolveBuilderRefStage({
    ref,
    matches: resourcePathMatches,
  });
  if (resourcePath) return resourcePath;

  const modulePathCandidates: Array<{
    target_type: "module";
    module: CommunityResourceModuleLike | null;
    sourceInbox: boolean;
    match: CommunityResourceBuilderRefMatch;
  }> = [];
  for (const module of args.modules) {
    for (const match of [
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
      }),
      buildBuilderModuleRefMatch({
        communityId: args.communityId,
        module,
        resources: args.resources,
        sourceInbox: true,
      }),
    ]) {
      modulePathCandidates.push({
        target_type: "module",
        module,
        sourceInbox: match.target_type === "module" && Boolean(match.source_inbox),
        match,
      });
    }
  }
  for (const match of [
    buildBuilderModuleRefMatch({
      communityId: args.communityId,
      module: null,
      resources: args.resources,
    }),
    buildBuilderModuleRefMatch({
      communityId: args.communityId,
      module: null,
      resources: args.resources,
      sourceInbox: true,
    }),
  ]) {
    modulePathCandidates.push({
      target_type: "module",
      module: null,
      sourceInbox: match.target_type === "module" && Boolean(match.source_inbox),
      match,
    });
  }
  const modulePathMatches = modulePathCandidates.filter((candidate) =>
    normalizeDirectoryPathForMatch(candidate.match.directory_path) === normalizeDirectoryPathForMatch(ref),
  );
  const modulePath = resolveBuilderRefStage({
    ref,
    matches: modulePathMatches,
  });
  if (modulePath) return modulePath;

  const refText = normalizeBuilderRefLookupText(ref);
  const moduleName = resolveBuilderRefStage({
    ref,
    matches: args.modules
      .filter((module) => normalizeBuilderRefLookupText(module.name) === refText)
      .map((module) => ({
        target_type: "module" as const,
        module,
        sourceInbox: false,
        match: buildBuilderModuleRefMatch({
          communityId: args.communityId,
          module,
          resources: args.resources,
        }),
      })),
  });
  if (moduleName) return moduleName;

  const resourceTitle = resolveBuilderRefStage({
    ref,
    matches: args.resources
      .filter((resource) => normalizeBuilderRefLookupText(resource.title) === refText)
      .map((resource) => ({
        target_type: "resource" as const,
        resource,
        match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
      })),
  });
  if (resourceTitle) return resourceTitle;

  const refSlug = normalizeBuilderRefSlug(ref);
  if (refSlug) {
    const moduleSlug = resolveBuilderRefStage({
      ref,
      matches: args.modules
        .filter((module) => normalizeBuilderRefSlug(module.name) === refSlug)
        .map((module) => ({
          target_type: "module" as const,
          module,
          sourceInbox: false,
          match: buildBuilderModuleRefMatch({
            communityId: args.communityId,
            module,
            resources: args.resources,
          }),
        })),
    });
    if (moduleSlug) return moduleSlug;

    const resourceSlug = resolveBuilderRefStage({
      ref,
      matches: args.resources
        .filter((resource) => normalizeBuilderRefSlug(resource.title) === refSlug)
        .map((resource) => ({
          target_type: "resource" as const,
          resource,
          match: buildBuilderResourceRefMatch(resource, args.moduleNameMap),
        })),
    });
    if (resourceSlug) return resourceSlug;
  }

  return missingBuilderRef({
    ref,
    modules: args.modules,
    resources: args.resources,
    moduleNameMap: args.moduleNameMap,
    communityId: args.communityId,
  });
}

async function buildCommunityResourceBuilderModuleReadPayload(args: {
  ctx: any;
  communityId: any;
  module: CommunityResourceModuleLike | null;
  sourceInbox: boolean;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}) {
  const moduleId = args.module ? normalizeIdValue(args.module._id) : null;
  const rows = moduleResources(args.resources, moduleId)
    .filter((row) => !args.sourceInbox || normalizeResourceRole(row.role) === "source")
    .sort(compareCommunityResources);
  const module = args.module
    ? await mapCommunityResourceModuleRow(args.ctx, args.module)
    : {
        id: null,
        community_id: normalizeIdValue(args.communityId),
        ...buildUnsortedModuleDirectoryFields(args.communityId),
        module_status: null,
        name: "Unsorted",
        description_md: "Existing knowledge items that are not assigned to a module.",
        banner_url: null,
        banner_storage_id: null,
        banner_focus_x: null,
        banner_focus_y: null,
        banner_zoom: null,
        sort_order: null,
        created_at: null,
        updated_at: null,
      };
  return {
    ok: true,
    kind: "community_resource_builder_read",
    target_type: "module",
    source_inbox: args.sourceInbox,
    module,
    resource_count: rows.length,
    resources: rows.map((row) => mapCompactCommunityResourceBuilderListRow(row, args.moduleNameMap)),
  };
}

async function listCommunityResourceBuilderDirectoryCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  limit?: number;
  // Resources to skip, for paging through a large directory. Modules are
  // always listed in full.
  offset?: number;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const limit = Math.max(
    1,
    Math.min(
      COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT,
      Math.floor(args.limit ?? COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT),
    ),
  );
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const [modules, resources] = await Promise.all([
    args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceLike[]>,
  ]);
  const moduleNameMap = new Map(
    modules.map((module) => [normalizeIdValue(module._id), module.name]),
  );
  return {
    ok: true,
    kind: "community_resource_builder_directory",
    limit,
    total_resources: resources.length,
    offset,
    truncated: resources.length > offset + limit,
    next_offset: resources.length > offset + limit ? offset + limit : null,
    health: buildCommunityResourceBuilderHealthReportFromRows({
      modules,
      resources,
      nowMs: Date.now(),
    }),
    modules: await Promise.all(
      modules
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
        .map((row) => mapCommunityResourceModuleRow(args.ctx, row)),
    ),
    resources: await Promise.all(
      resources
        .slice()
        .sort(compareCommunityResources)
        .slice(offset, offset + limit)
        .map((row) => mapCompactCommunityResourceBuilderListRow(row, moduleNameMap)),
    ),
  };
}

export const listCommunityResourceBuilderDirectory = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await listCommunityResourceBuilderDirectoryCore({
      ctx,
      userId,
      communityId: args.communityId,
      limit: args.limit,
    });
  },
});

export const listCommunityResourceBuilderDirectoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listCommunityResourceBuilderDirectoryCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      limit: args.limit,
      offset: args.offset,
    }),
});

async function readCommunityResourceBuilderResourceCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  ref?: string;
  resourceId?: any;
  moduleId?: any;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const ref = String(args.ref ?? args.resourceId ?? args.moduleId ?? "").trim();
  if (!ref) throw new Error("community_resource_builder_read_ref_required");

  const [modules, resources] = await Promise.all([
    args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceLike[]>,
  ]);
  const moduleNameMap = buildModuleNameMap(modules);
  const resolved = resolveCommunityResourceBuilderRef({
    communityId: args.communityId,
    ref,
    modules,
    resources,
    moduleNameMap,
  });
  if (!resolved.ok) {
    // A ref the resource map listed under a page's "revisions" is an earlier
    // version of that page: read its body, then restore it with edit_page.
    const revisionId = args.ctx.db.normalizeId("communityResourceRevisions", ref);
    const revision = revisionId ? (await args.ctx.db.get(revisionId)) as CommunityResourceRevisionLike | null : null;
    if (revision && normalizeIdValue(revision.communityId) === normalizeIdValue(args.communityId)) {
      return {
        ok: true,
        kind: "community_resource_builder_read",
        target_type: "revision",
        revision: mapCommunityResourceRevision(revision, { withBody: true }),
      };
    }
    return {
      kind: "community_resource_builder_read",
      ...resolved,
    };
  }
  if (resolved.target_type === "resource") {
    const revisions = await listCommunityResourceRevisionRows(args.ctx, resolved.resource._id);
    return {
      ok: true,
      kind: "community_resource_builder_read",
      target_type: "resource",
      resource: await mapCommunityResourceRowWithBody(args.ctx, resolved.resource, { canManage: true }),
      // Earlier versions, newest first. Read builder/resources/<id>.json for a
      // version's body; edit_page with that body_md (and title) restores it.
      revisions: revisions.map((revision) => mapCommunityResourceRevision(revision, { withBody: false })),
    };
  }
  return await buildCommunityResourceBuilderModuleReadPayload({
    ctx: args.ctx,
    communityId: args.communityId,
    module: resolved.module,
    sourceInbox: resolved.sourceInbox,
    resources,
    moduleNameMap,
  });
}

export const readCommunityResourceBuilderResource = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.optional(v.string()),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await readCommunityResourceBuilderResourceCore({
      ctx,
      userId,
      communityId: args.communityId,
      ref: args.ref,
      resourceId: args.resourceId,
      moduleId: args.moduleId,
    });
  },
});

function mapCommunityResourceRevision(revision: CommunityResourceRevisionLike, options: { withBody: boolean }) {
  const preview = revision.bodyMd.replace(/\s+/g, " ").trim();
  return {
    id: normalizeIdValue(revision._id),
    resource_id: normalizeIdValue(revision.resourceId),
    title: revision.title,
    saved_at: toIsoString(revision.savedAt),
    replaced_at: toIsoString(revision.createdAt),
    body_chars: revision.bodyChars,
    ...(options.withBody
      ? { body_md: revision.bodyMd }
      : { preview: preview.length > 160 ? `${preview.slice(0, 157).trimEnd()}...` : preview }),
  };
}

async function requireManagedResourceRevision(ctx: any, userId: any, revisionId: any) {
  const revision = (await ctx.db.get(revisionId)) as CommunityResourceRevisionLike | null;
  if (!revision) throw new Error("community_resource_revision_not_found");
  await requireCommunityManager({ ctx, communityId: revision.communityId, userId });
  return revision;
}

// A lesson's earlier versions, newest first, for the owner's Version history.
export const listCommunityResourceRevisions = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.id("communityResources"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const resource = (await ctx.db.get(args.resourceId)) as CommunityResourceLike | null;
    if (!resource) return [];
    await requireCommunityManager({ ctx, communityId: resource.communityId, userId });
    const rows = await listCommunityResourceRevisionRows(ctx, resource._id);
    return rows.map((revision) => mapCommunityResourceRevision(revision, { withBody: true }));
  },
});

// Puts an earlier version back. The version being replaced is kept too, so a
// restore can be undone the same way.
export const restoreCommunityResourceRevision = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    revisionId: v.id("communityResourceRevisions"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const revision = await requireManagedResourceRevision(ctx, userId, args.revisionId);
    const resource = (await ctx.db.get(revision.resourceId)) as CommunityResourceLike | null;
    if (!resource) throw new Error("community_resource_not_found");
    const nowMs = Date.now();
    const previousTitle = String(resource.title ?? "");
    if (revision.title.trim()) await ctx.db.patch(resource._id as any, { title: normalizeName(revision.title), updatedAt: nowMs });
    await writeCommunityResourceBodyContent(ctx, {
      communityId: resource.communityId,
      resourceId: resource._id,
      bodyMd: revision.bodyMd,
      nowMs,
      maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
      previousTitle,
      forceRevision: true,
    });
    const updated = (await ctx.db.get(resource._id)) as CommunityResourceLike | null;
    if (!updated) throw new Error("community_resource_not_found");
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
    return await mapCommunityResourceRow(ctx, hydrated, undefined, undefined, { canManage: true });
  },
});

export const readCommunityResourceBuilderResourceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    ref: v.optional(v.string()),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
  },
  handler: async (ctx, args) =>
    await readCommunityResourceBuilderResourceCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      ref: args.ref,
      resourceId: args.resourceId,
      moduleId: args.moduleId,
    }),
});

const COMMUNITY_RESOURCE_BUILDER_ACTIONABLE_STATUSES = [
  "staged",
  "approved",
] as const;

function communityResourceBuilderChangesetExpiresAt(
  changeset: CommunityResourceBuilderChangesetRow,
): number {
  return changeset.createdAt + COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS;
}

function communityResourceBuilderChangesetIsActionable(
  changeset: CommunityResourceBuilderChangesetRow,
): boolean {
  return changeset.status === "staged" || changeset.status === "approved";
}

function communityResourceBuilderChangesetIsExpired(
  changeset: CommunityResourceBuilderChangesetRow,
  nowMs: number,
): boolean {
  return (
    communityResourceBuilderChangesetIsActionable(changeset) &&
    nowMs >= communityResourceBuilderChangesetExpiresAt(changeset)
  );
}

function buildCommunityResourceBuilderExpiredResult(args: {
  changeset: CommunityResourceBuilderChangesetRow;
  changesetId: unknown;
  communityId: unknown;
  deduped: boolean;
}) {
  const operations = normalizeCommunityResourceBuilderChangesetOperations(
    args.changeset.operations,
  );
  const preview = buildCommunityResourceBuilderChangesetPreview(operations);
  return {
    ok: false,
    kind: "community_resource_builder_changeset_expired",
    code: "community_resource_changeset_expired",
    changeset_id: normalizeIdValue(args.changesetId),
    community_id: normalizeIdValue(args.communityId),
    status: "expired",
    summary: args.changeset.summary,
    operation_count: operations.length,
    preview_items: preview.preview_items,
    preview_total_count: preview.total_count,
    preview_limit: preview.preview_limit,
    error: COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE,
    expires_at: toIsoString(
      communityResourceBuilderChangesetExpiresAt(args.changeset),
    ),
    deduped: args.deduped,
  };
}

async function expireCommunityResourceBuilderChangesetIfNeeded(args: {
  ctx: any;
  changeset: CommunityResourceBuilderChangesetRow;
  nowMs: number;
}): Promise<boolean> {
  if (!communityResourceBuilderChangesetIsExpired(args.changeset, args.nowMs)) {
    return false;
  }
  await args.ctx.db.patch(args.changeset._id as any, {
    status: "expired",
    error: COMMUNITY_RESOURCE_BUILDER_CHANGESET_EXPIRED_MESSAGE,
    updatedAt: args.nowMs,
  });
  return true;
}

async function readLatestCommunityResourceBuilderActionableRows(args: {
  ctx: any;
  communityId: any;
}): Promise<CommunityResourceBuilderChangesetRow[]> {
  return (
    await Promise.all(
      COMMUNITY_RESOURCE_BUILDER_ACTIONABLE_STATUSES.map(async (status) =>
        await args.ctx.db
          .query("communityResourceBuilderChangesets" as any)
          .withIndex("by_community_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", status),
          )
          .order("desc")
          .first(),
      ),
    )
  ).filter(Boolean) as CommunityResourceBuilderChangesetRow[];
}

async function stageCommunityResourceBuilderChangesetCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  summary: string;
  operations: unknown[];
  idempotencyKey?: string | null;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const nowMs = Date.now();
  const summary = normalizeChangesetSummary(args.summary);
  const operations = normalizeCommunityResourceBuilderChangesetOperations(args.operations);
  const idempotencyKey = normalizeOptionalText(args.idempotencyKey, 200);
  if (idempotencyKey) {
    const existing = (await args.ctx.db
      .query("communityResourceBuilderChangesets" as any)
      .withIndex("by_community_creator_idempotencyKey", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("createdByUserId", args.userId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique()) as CommunityResourceBuilderChangesetRow | null;
    if (existing) {
      const existingOperations =
        normalizeCommunityResourceBuilderChangesetOperations(
          existing.operations,
        );
      if (
        existing.summary !== summary ||
        JSON.stringify(existingOperations) !== JSON.stringify(operations)
      ) {
        throw new Error("community_resource_changeset_idempotency_conflict");
      }
      if (existing.status === "expired") {
        return buildCommunityResourceBuilderExpiredResult({
          changeset: existing,
          changesetId: existing._id,
          communityId: args.communityId,
          deduped: true,
        });
      }
      if (
        await expireCommunityResourceBuilderChangesetIfNeeded({
          ctx: args.ctx,
          changeset: existing,
          nowMs,
        })
      ) {
        return buildCommunityResourceBuilderExpiredResult({
          changeset: existing,
          changesetId: existing._id,
          communityId: args.communityId,
          deduped: true,
        });
      }
      const existingPreview =
        buildCommunityResourceBuilderChangesetPreview(existingOperations);
      return {
        ok: true,
        kind: "community_resource_builder_changeset_staged",
        changeset_id: normalizeIdValue(existing._id),
        community_id: normalizeIdValue(args.communityId),
        status: existing.status,
        summary: existing.summary,
        operation_count: existingOperations.length,
        preview_items: existingPreview.preview_items,
        preview_total_count: existingPreview.total_count,
        preview_limit: existingPreview.preview_limit,
        warning_count:
          getCommunityResourceBuilderPreflightIssueCount(existing.preflight),
        preflight: existing.preflight,
        deduped: true,
      };
    }
  }
  const recentActionableRows = await readLatestCommunityResourceBuilderActionableRows({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  const liveActionableRows: CommunityResourceBuilderChangesetRow[] = [];
  for (const changeset of recentActionableRows) {
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx: args.ctx,
        changeset,
        nowMs,
      })
    ) {
      continue;
    }
    liveActionableRows.push(changeset);
  }
  if (liveActionableRows.length > 0) {
    throw new Error("community_resource_changeset_already_pending");
  }
  const preflight = await buildCommunityResourceBuilderChangesetPreflight({
    ctx: args.ctx,
    communityId: args.communityId,
    operations,
    nowMs,
  });
  const preview = buildCommunityResourceBuilderChangesetPreview(operations);
  const id = await args.ctx.db.insert("communityResourceBuilderChangesets" as any, {
    communityId: args.communityId,
    createdByUserId: args.userId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    status: "staged",
    summary,
    operations,
    preflight,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await args.ctx.scheduler.runAt(
    nowMs + COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS,
    (internal as any).communityResources
      .expireCommunityResourceBuilderChangesetInternal,
    { changesetId: id },
  );
  return {
    ok: true,
    kind: "community_resource_builder_changeset_staged",
    changeset_id: normalizeIdValue(id),
    community_id: normalizeIdValue(args.communityId),
    status: "staged",
    summary,
    operation_count: operations.length,
    preview_items: preview.preview_items,
    preview_total_count: preview.total_count,
    preview_limit: preview.preview_limit,
    warning_count: getCommunityResourceBuilderPreflightIssueCount(preflight),
    preflight,
    deduped: false,
  };
}

export const stageCommunityResourceBuilderChangesetInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    summary: v.string(),
    operations: v.array(v.any()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await stageCommunityResourceBuilderChangesetCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      summary: args.summary,
      operations: args.operations,
      idempotencyKey: args.idempotencyKey ?? null,
    }),
});

export const expireCommunityResourceBuilderChangesetInternal = internalMutation({
  args: {
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const changeset = (await ctx.db.get(
      args.changesetId as any,
    )) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_expiry_noop",
        status: "missing",
        changeset_id: normalizeIdValue(args.changesetId),
        deduped: true,
      };
    }
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: changeset.communityId,
        deduped: true,
      });
    }
    const nowMs = Date.now();
    if (
      !(await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      }))
    ) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_expiry_noop",
        status: changeset.status,
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(changeset.communityId),
        expires_at: toIsoString(
          communityResourceBuilderChangesetExpiresAt(changeset),
        ),
        deduped: true,
      };
    }
    return buildCommunityResourceBuilderExpiredResult({
      changeset,
      changesetId: args.changesetId,
      communityId: changeset.communityId,
      deduped: false,
    });
  },
});

export const getCommunityResourceBuilderChangesetStatus = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    const nowMs = Date.now();
    const expired = communityResourceBuilderChangesetIsExpired(
      changeset,
      nowMs,
    );
    const operations = normalizeCommunityResourceBuilderChangesetOperations(changeset.operations);
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    return {
      ok: true,
      kind: "community_resource_builder_changeset_status",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: expired ? "expired" : changeset.status,
      summary: changeset.summary,
      operation_count: operations.length,
      preview_items: preview.preview_items,
      preview_total_count: preview.total_count,
      preview_limit: preview.preview_limit,
      approved_by_current_user: changeset.approvedByUserId
        ? String(changeset.approvedByUserId) === String(userId)
        : false,
      updated_at: toIsoString(changeset.updatedAt),
    };
  },
});

export const listPendingCommunityResourceBuilderChangesets = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const rows = await readLatestCommunityResourceBuilderActionableRows({
      ctx,
      communityId: args.communityId,
    });
    const nowMs = Date.now();
    return rows
      .filter(
        (changeset) =>
          !communityResourceBuilderChangesetIsExpired(changeset, nowMs),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 1)
      .map((changeset) => {
        const operations = normalizeCommunityResourceBuilderChangesetOperations(
          changeset.operations,
        );
        const preview = buildCommunityResourceBuilderChangesetPreview(operations);
        return {
          ok: true,
          kind: "community_resource_builder_changeset_pending",
          changeset_id: normalizeIdValue(changeset._id),
          community_id: normalizeIdValue(args.communityId),
          status: changeset.status,
          summary: changeset.summary,
          operation_count: operations.length,
          preview_items: preview.preview_items,
          preview_total_count: preview.total_count,
          preview_limit: preview.preview_limit,
          warning_count:
            getCommunityResourceBuilderPreflightIssueCount(changeset.preflight),
          approved_by_current_user: changeset.approvedByUserId
            ? String(changeset.approvedByUserId) === String(userId)
            : false,
          created_at: toIsoString(changeset.createdAt),
          updated_at: toIsoString(changeset.updatedAt),
        };
      });
  },
});

export const rejectCommunityResourceBuilderChangeset = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    if (
      changeset.status === "rejected" &&
      changeset.rejectedByUserId &&
      String(changeset.rejectedByUserId) === String(userId) &&
      (changeset.error ?? null) ===
        (normalizeOptionalText(args.reason, 1000) ?? null)
    ) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_rejected",
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(args.communityId),
        status: "rejected",
        summary: changeset.summary,
        deduped: true,
      };
    }
    const nowMs = Date.now();
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: true,
      });
    }
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      })
    ) {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: false,
      });
    }
    if (changeset.status !== "staged" && changeset.status !== "approved") {
      throw new Error("community_resource_changeset_not_rejectable");
    }
    await ctx.db.patch(args.changesetId as any, {
      status: "rejected",
      error: normalizeOptionalText(args.reason, 1000),
      updatedAt: nowMs,
      rejectedAt: nowMs,
      rejectedByUserId: userId,
    });
    return {
      ok: true,
      kind: "community_resource_builder_changeset_rejected",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: "rejected",
      summary: changeset.summary,
      deduped: false,
    };
  },
});

export const applyCommunityResourceBuilderChangeset = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    if (changeset.status === "applied") {
      const operations = normalizeCommunityResourceBuilderChangesetOperations(
        changeset.operations,
      );
      const preview = buildCommunityResourceBuilderChangesetPreview(operations);
      return {
        ok: true,
        kind: "community_resource_builder_changeset_applied",
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(args.communityId),
        status: "applied",
        summary: changeset.summary,
        operation_count: operations.length,
        preview_items: preview.preview_items,
        preview_total_count: preview.total_count,
        preview_limit: preview.preview_limit,
        result: changeset.result ?? null,
        deduped: true,
      };
    }
    const nowMs = Date.now();
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: true,
      });
    }
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      })
    ) {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: false,
      });
    }
    if (changeset.status !== "staged" && changeset.status !== "approved") {
      throw new Error("community_resource_changeset_not_applicable");
    }
    const operations = normalizeCommunityResourceBuilderChangesetOperations(changeset.operations);
    const preflight = await buildCommunityResourceBuilderChangesetPreflight({
      ctx,
      communityId: args.communityId,
      operations,
      nowMs,
    });
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    const result = await applyCommunityResourceBuilderChangesetOperations({
      ctx,
      communityId: args.communityId,
      userId,
      operations,
      nowMs,
    });
    await ctx.db.patch(args.changesetId as any, {
      status: "applied",
      preflight,
      result,
      updatedAt: nowMs,
      appliedAt: nowMs,
      appliedByUserId: userId,
    });
    return {
      ok: true,
      kind: "community_resource_builder_changeset_applied",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: "applied",
      summary: changeset.summary,
      operation_count: operations.length,
      preview_items: preview.preview_items,
      preview_total_count: preview.total_count,
      preview_limit: preview.preview_limit,
      result,
      deduped: false,
    };
  },
});

export const compactCommunityResourceBodyStorage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(250, Math.floor(args.limit ?? 50)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const candidates = rows
      .filter((row) => String(row.bodyMd ?? "").trim())
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt)
      .slice(0, limit);
    if (!args.dryRun) {
      const nowMs = Date.now();
      for (const row of candidates) {
        await writeCommunityResourceBodyContent(ctx, {
          communityId: row.communityId,
          resourceId: row._id,
          bodyMd: row.bodyMd,
          nowMs,
          maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
          resourceUpdatedAt: row.updatedAt,
        });
      }
    }
    return {
      ok: true,
      kind: "community_resource_body_storage_compaction",
      dry_run: Boolean(args.dryRun),
      limit,
      compacted: args.dryRun ? 0 : candidates.length,
      candidates: candidates.length,
      remaining_candidates: Math.max(0, rows.filter((row) => String(row.bodyMd ?? "").trim()).length - candidates.length),
    };
  },
});

export async function buildCommunityResourceBuilderHealthReport(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}): Promise<any> {
  const [modules, resources] = await Promise.all([
    args.ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect() as Promise<CommunityResourceLike[]>,
  ]);
  return buildCommunityResourceBuilderHealthReportFromRows({
    modules,
    resources,
    nowMs: args.nowMs,
  });
}

function buildCommunityResourceBuilderHealthReportFromRows(args: {
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  nowMs: number;
}): any {
  const { modules, resources } = args;
  const pages = resources.filter((row) => normalizeResourceRole(row.role) === "page");
  const sources = resources.filter((row) => normalizeResourceRole(row.role) === "source");
  const referencedSourceIds = new Set(
    pages
      .map((row) => normalizeIdValue(row.sourceResourceId ?? ""))
      .filter(Boolean),
  );
  const modulePageCounts = new Map<string, number>();
  for (const page of pages) {
    const moduleId = normalizeIdValue(page.moduleId ?? "");
    if (!moduleId) continue;
    modulePageCounts.set(moduleId, (modulePageCounts.get(moduleId) ?? 0) + 1);
  }
  const staleDraftCutoff = args.nowMs - COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS;
  const allIssues = {
    emptyModules: modules
      .filter((module) => (modulePageCounts.get(normalizeIdValue(module._id)) ?? 0) === 0)
      .map((module) => ({
        module_id: normalizeIdValue(module._id),
        name: module.name,
      })),
    sparsePages: pages
      .filter((page) => communityResourceBodyChars(page) < COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS)
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
        body_chars: communityResourceBodyChars(page),
      })),
    pagesWithoutSourceLineage: pages
      .filter((page) => !normalizeIdValue(page.sourceResourceId ?? ""))
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
      })),
    unreferencedSources: sources
      .filter((source) => !referencedSourceIds.has(normalizeIdValue(source._id)))
      .map((source) => ({
        resource_id: normalizeIdValue(source._id),
        title: source.title,
        status: normalizeResourceStatus(source.status),
      })),
    staleDrafts: pages
      .filter((page) => normalizeResourceStatus(page.status) === "draft" && page.updatedAt < staleDraftCutoff)
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        updated_at: toIsoString(page.updatedAt),
      })),
  };
  const issueTotals = {
    emptyModules: allIssues.emptyModules.length,
    sparsePages: allIssues.sparsePages.length,
    pagesWithoutSourceLineage: allIssues.pagesWithoutSourceLineage.length,
    unreferencedSources: allIssues.unreferencedSources.length,
    staleDrafts: allIssues.staleDrafts.length,
  };
  const issues = {
    emptyModules: allIssues.emptyModules.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    sparsePages: allIssues.sparsePages.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    pagesWithoutSourceLineage: allIssues.pagesWithoutSourceLineage.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    unreferencedSources: allIssues.unreferencedSources.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
    staleDrafts: allIssues.staleDrafts.slice(0, COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT),
  };
  return {
    ok: true,
    kind: "community_resource_builder_health_report",
    checked_at: toIsoString(args.nowMs),
    summary: {
      modules: modules.length,
      live_modules: modules.filter(communityResourceModuleIsLive).length,
      draft_modules: modules.filter((module) => !communityResourceModuleIsLive(module)).length,
      resources: resources.length,
      pages: pages.length,
      sources: sources.length,
      draft_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "draft").length,
      source_inbox_items: sources.length,
      issue_count:
        issueTotals.emptyModules +
        issueTotals.sparsePages +
        issueTotals.pagesWithoutSourceLineage +
        issueTotals.unreferencedSources +
        issueTotals.staleDrafts,
      issue_counts: issueTotals,
      issue_sample_limit: COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT,
      issues_truncated: Object.values(issueTotals).some(
        (count) => count > COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT,
      ),
    },
    issues,
  };
}

export const listCommunityResourceModules = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const canManageResources = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return b.createdAt - a.createdAt;
        })
        .filter((row) => canManageResources || communityResourceModuleIsLive(row))
        .slice(0, limit)
        .map((row) => mapCommunityResourceModuleRow(ctx, row)),
    );
  },
});

export const saveCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const moduleId = String(args.moduleId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || moduleId.length > 0;

    if (isPatch) {
      if (!moduleId) throw new Error("community_resource_module_id_required");
      const existing = (await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null;
      if (!existing) throw new Error("community_resource_module_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextNameRaw = Object.prototype.hasOwnProperty.call(payload, "name") ? payload.name : existing.name;
      const nextDescriptionRaw = Object.prototype.hasOwnProperty.call(payload, "description_md")
        ? payload.description_md
        : existing.descriptionMd;
      const nextBannerUrlRaw = Object.prototype.hasOwnProperty.call(payload, "banner_url")
        ? payload.banner_url
        : existing.bannerUrl;
      const nextBannerStorageId = Object.prototype.hasOwnProperty.call(payload, "banner_storage_id")
        ? (payload.banner_storage_id ?? undefined)
        : existing.bannerStorageId;
      const previousBannerStorageId = existing.bannerStorageId;
      const nextModuleStatus = Object.prototype.hasOwnProperty.call(payload, "module_status")
        ? requireResourceModuleStatusForWrite(payload.module_status)
        : normalizeResourceModuleStatus(existing.status);
      const moduleStatusChanged = normalizeResourceModuleStatus(existing.status) !== nextModuleStatus;
      await ctx.db.patch(existing._id as any, {
        name: normalizeName(nextNameRaw),
        descriptionMd: normalizeOptionalText(nextDescriptionRaw, 1200),
        ...(Object.prototype.hasOwnProperty.call(payload, "module_status")
          ? { status: nextModuleStatus }
          : {}),
        bannerUrl: nextBannerStorageId ? undefined : normalizeOptionalUrl(nextBannerUrlRaw),
        bannerStorageId: nextBannerStorageId,
        bannerFocusX: normalizeBannerFocus(payload.banner_focus_x ?? existing.bannerFocusX),
        bannerFocusY: normalizeBannerFocus(payload.banner_focus_y ?? existing.bannerFocusY),
        bannerZoom: normalizeBannerZoom(payload.banner_zoom ?? existing.bannerZoom),
        ...(Object.prototype.hasOwnProperty.call(payload, "lesson_style")
          ? { lessonStyle: normalizeResourceModuleLessonStyle(payload.lesson_style) }
          : {}),
        updatedAt: nowMs,
      });
      if (previousBannerStorageId && String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")) {
        await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
      }
      if (moduleStatusChanged) {
        await syncResourceMemoryProjectionsForModule({
          ctx,
          communityId: existing.communityId,
          moduleId: existing._id,
        });
      }
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceModuleLike | null;
      if (!updated) throw new Error("community_resource_module_not_found");
      return await mapCommunityResourceModuleRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityManager({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityResourceModuleLike[];
    const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
    const bannerStorageId = payload.banner_storage_id ?? undefined;
    const id = await ctx.db.insert("communityResourceModules" as any, {
      communityId: community._id,
      createdByUserId: args.userId,
      status: Object.prototype.hasOwnProperty.call(payload, "module_status")
        ? requireResourceModuleStatusForWrite(payload.module_status)
        : "draft",
      name: normalizeName(payload.name),
      descriptionMd: normalizeOptionalText(payload.description_md, 1200),
      bannerUrl: bannerStorageId ? undefined : normalizeOptionalUrl(payload.banner_url),
      bannerStorageId,
      bannerFocusX: normalizeBannerFocus(payload.banner_focus_x),
      bannerFocusY: normalizeBannerFocus(payload.banner_focus_y),
      bannerZoom: normalizeBannerZoom(payload.banner_zoom),
      lessonStyle: normalizeResourceModuleLessonStyle(payload.lesson_style),
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
    if (!created) throw new Error("community_resource_module_create_failed");
    return await mapCommunityResourceModuleRow(ctx, created);
  },
});

export const reorderCommunityResourceModules = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleIds: v.array(v.id("communityResourceModules")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    const existingIds = new Set(rows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.moduleIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_module_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_module_order_stale");
    }
    for (const moduleId of requestedIds) {
      if (!existingIds.has(moduleId)) {
        throw new Error("community_resource_module_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((moduleId, index) =>
        ctx.db.patch(moduleId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
  },
});

export const deleteCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const module = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
    if (!module) return { ok: true, movedResources: 0 };

    await requireCommunityManager({
      ctx,
      communityId: module.communityId,
      userId: args.userId,
    });

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", module.communityId).eq("moduleId", module._id),
      )
      .collect()) as CommunityResourceLike[];
    const lessons = resources.filter((resource) => normalizeResourceRole(resource.role) === "page");
    const ingestionSources = resources.filter((resource) => normalizeResourceRole(resource.role) === "source");

    for (const lesson of lessons) {
      await revokeCommunityResourceMemoryProjection(ctx, lesson);
      await deleteCommunitySourceUnitsForSourceResource(ctx, lesson._id);
      await deleteCommunityResourceBodyContent(ctx, lesson._id);
      await ctx.db.delete(lesson._id as any);
    }

    const nowMs = Date.now();
    for (const source of ingestionSources) {
      await ctx.db.patch(source._id as any, {
        moduleId: undefined,
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(source._id as any)) as CommunityResourceLike | null;
      if (updated) await syncCommunityResourceMemoryProjection(ctx, updated, nowMs);
    }

    if (module.bannerStorageId) {
      await maybeDeleteStorageAsset(ctx, module.bannerStorageId);
    }
    await ctx.db.delete(module._id as any);
    return {
      ok: true,
      movedResources: 0,
      deletedLessons: lessons.length,
      detachedIngestionSources: ingestionSources.length,
    };
  },
});

export const listCommunityResources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const canManageResources = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const modules = canManageResources
      ? []
      : ((await ctx.db
          .query("communityResourceModules" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .collect()) as CommunityResourceModuleLike[]);
    const liveModuleIds = new Set(
      modules
        .filter(communityResourceModuleIsLive)
        .map((module) => normalizeIdValue(module._id)),
    );
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    // Lessons in a track sold through an offer the member doesn't have: listed
    // (so the Roadmap can show what's inside) without their text.
    const paid = canManageResources ? new Set<string>() : await readCommunityPaidLockedLessonIds(ctx, args.communityId, userId);
    return await Promise.all(
      rows
        .slice()
        .filter((row) => canManageResources || communityResourceIsLiveModulePage(row, liveModuleIds))
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map(async (row) => {
          if (!paid.has(normalizeIdValue(row._id))) return await mapCommunityResourceRowWithBody(ctx, row, { canManage: canManageResources }, userIdCache, moduleNameCache);
          const mapped = await mapCommunityResourceRow(ctx, { ...row, bodyMd: undefined }, userIdCache, moduleNameCache, { canManage: false });
          return { ...mapped, body_md: null, url: null, file_key: null, lesson_elements: [], lesson: row.lesson ? { ...row.lesson, video_url: undefined } : null, paywalled: true };
        }),
    );
  },
});

// The welcome page a member sees while held: the builder's words and the lesson
// pages to work through, in order. Readable while held, for these lessons only.
export const getMyWelcomePage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId, allowWelcome: true });
    const workflow = await ctx.db.query("communityMemberWorkflows" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).first() as any;
    const lessons = [];
    for (const resourceId of workflow?.welcomeGate ? workflow.welcomeLessonIds ?? [] : []) {
      if (!(await welcomeLessonIsLive(ctx, args.communityId, resourceId))) continue;
      const row = (await ctx.db.get(resourceId)) as CommunityResourceLike;
      lessons.push(await mapCommunityResourceRowWithBody(ctx, row, { canManage: false }));
    }
    return {
      title: workflow?.welcomePage?.title ?? null,
      message: workflow?.welcomePage?.message ?? null,
      media_url: workflow?.welcomePage?.mediaUrl ?? null,
      layout: workflow?.welcomeGate ? workflow?.welcomePage?.layout ?? null : null,
      lessons,
    };
  },
});

// Retired GitHub and Google Drive sources no longer have a connection.
function resolveCommunityLaunchKnowledgeSourceCredentialStatus(
  row: CommunityResourceLike,
): "available" | "missing" {
  const provider = normalizeSourceIntegrationString(row.sourceExternalProvider, 80);
  return provider === GOOGLE_DRIVE_SOURCE_PROVIDER || provider === GITHUB_SOURCE_PROVIDER
    ? "missing"
    : "available";
}

function mapCommunityLaunchKnowledgeSourceRow(row: CommunityResourceLike) {
  const provider = normalizeSourceIntegrationString(row.sourceExternalProvider, 80);
  const sourceIngestionKind = normalizeResourceSourceIngestionKind(row);
  const sourceIngestionStatus = normalizeResourceSourceIngestionStatus(row);
  const credentialStatus = resolveCommunityLaunchKnowledgeSourceCredentialStatus(row);
  const providerLabel = provider === GITHUB_SOURCE_PROVIDER
    ? "GitHub"
    : provider === GOOGLE_DRIVE_SOURCE_PROVIDER
      ? "Google Drive"
      : "Link";
  return {
    id: normalizeIdValue(row._id),
    title: String(row.title ?? "").trim() || `${providerLabel} source`,
    source_ingestion_status: sourceIngestionStatus,
    source_ingestion_kind: sourceIngestionKind,
    source_ingestion_error: normalizeOptionalText(row.sourceIngestionError, 500) ?? null,
    source_external_provider:
      provider === GITHUB_SOURCE_PROVIDER
        ? GITHUB_SOURCE_PROVIDER
        : provider === GOOGLE_DRIVE_SOURCE_PROVIDER
          ? GOOGLE_DRIVE_SOURCE_PROVIDER
          : null,
    source_external_id: normalizeSourceIntegrationString(row.sourceExternalId, 1_000) || null,
    source_external_name: normalizeSourceIntegrationString(row.sourceExternalName, 500) || null,
    source_external_url: normalizeOptionalUrl(row.sourceExternalUrl) ?? normalizeOptionalUrl(row.url) ?? null,
    source_external_mime_type: normalizeSourceIntegrationString(row.sourceExternalMimeType, 300) || null,
    source_external_modified_at:
      typeof row.sourceExternalModifiedAt === "number" && Number.isFinite(row.sourceExternalModifiedAt)
        ? toIsoString(row.sourceExternalModifiedAt)
        : null,
    credential_status: credentialStatus,
    credential_message:
      credentialStatus === "missing" && sourceIngestionStatus !== "ready"
        ? `Reconnect ${providerLabel} before processing this source.`
        : null,
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listCommunityLaunchKnowledgeSources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const sources = await Promise.all(
      rows
        .filter((row) => normalizeResourceRole(row.role) === "source")
        .filter((row) =>
          isPlainUrlSource(row) ||
          isPlainFileSource(row) ||
          isGoogleDriveSourceResource(row) ||
          isGitHubSourceResource(row)
        )
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityLaunchKnowledgeSourceRow(row)),
    );
    return {
      ok: true,
      kind: "community_launch_knowledge_sources",
      community_id: normalizeIdValue(args.communityId),
      sources,
    };
  },
});

async function resolveAuthenticatedActionUserId(ctx: any, authSubject?: string | null): Promise<any> {
  const actor = (await ctx.runQuery((internal as any).authActor.resolveAuthenticatedActorInternal, {
    authSubject: authSubject ?? undefined,
  })) as { dbUserId?: unknown } | null;
  if (!actor?.dbUserId) throw new Error("authenticated_user_required");
  return actor.dbUserId;
}

async function requireCommunityManagerForAction(ctx: any, userId: any, communityId: any): Promise<void> {
  await ctx.runQuery((internal as any).communityResources.requireCommunitySourceManagerInternal, {
    userId,
    communityId,
  });
}

export const requireCommunitySourceManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return { ok: true };
  },
});

export const generateCommunityResourceSourceUploadUrl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

// Lesson images go up through the same upload URL as source files; this
// confirms the upload is a picture of a sane size and hands back the address
// the lesson body links to. Anything else is deleted, not kept.
const COMMUNITY_RESOURCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
export const COMMUNITY_RESOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const resolveCommunityResourceImageUrl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const file = await ctx.db.system.get(args.storageId);
    if (!file) return { url: null, problem: "community_resource_image_missing" };
    const contentType = String(file.contentType ?? "").toLowerCase();
    // Refusals return instead of throwing, so the delete isn't rolled back.
    const problem = !COMMUNITY_RESOURCE_IMAGE_TYPES.has(contentType)
      ? "community_resource_image_type"
      : file.size > COMMUNITY_RESOURCE_IMAGE_MAX_BYTES
        ? "community_resource_image_too_large"
        : null;
    if (problem) {
      await ctx.storage.delete(args.storageId);
      return { url: null, problem };
    }
    const url = await ctx.storage.getUrl(args.storageId);
    return url ? { url, problem: null } : { url: null, problem: "community_resource_image_missing" };
  },
});

export const getCommunitySourceIngestionStateInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const sources = rows.filter((row) => normalizeResourceRole(row.role) === "source");
    const readySources = sources.filter(communityResourceSourceHasReadyText);
    const urlSources = sources.filter(isPlainUrlSource);
    const fileSources = sources.filter(isPlainFileSource);
    const googleDriveSources = sources.filter(isGoogleDriveSourceResource);
    const githubSources = sources.filter(isGitHubSourceResource);
    // Retired GitHub and Google Drive sources are never claimed or retried again,
    // so they count as neither pending nor failed work; their text stays.
    const failedSources = sources.filter(
      (row) => isIngestibleCommunitySource(row) && normalizeResourceSourceIngestionStatus(row) === "failed",
    );
    const pendingSources = sources.filter((row) => {
      const status = normalizeResourceSourceIngestionStatus(row);
      return isIngestibleCommunitySource(row) && (status === "queued" || status === "processing");
    });
    return {
      ok: true,
      kind: "community_source_ingestion_state",
      total_sources: sources.length,
      ready_sources: readySources.length,
      url_sources: urlSources.length,
      file_sources: fileSources.length,
      google_drive_sources: googleDriveSources.length,
      github_sources: githubSources.length,
      failed_sources: failedSources.length,
      pending_sources: pendingSources.length,
      pending_url_sources: urlSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
      pending_file_sources: fileSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
      pending_google_drive_sources: googleDriveSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
      pending_github_sources: githubSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
    };
  },
});

export const claimNextCommunitySourceIngestionInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    retryFailed: v.optional(v.boolean()),
    excludeResourceIds: v.optional(v.array(v.id("communityResources"))),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = args.nowMs ?? Date.now();
    const excludedResourceIds = new Set(
      (args.excludeResourceIds ?? []).map((resourceId) => normalizeIdValue(resourceId)),
    );
    const rows = ((await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[])
      .filter((row) =>
        normalizeResourceRole(row.role) === "source" &&
        !excludedResourceIds.has(normalizeIdValue(row._id)) &&
        isIngestibleCommunitySource(row),
      )
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt);

    for (const row of rows) {
      const status = normalizeResourceSourceIngestionStatus(row);
      const attempt = normalizeCommunitySourceIngestionAttempt(row.sourceIngestionAttempt);
      const leaseExpired = Number(row.sourceIngestionLeaseExpiresAt ?? 0) <= nowMs;
      const claimable =
        status === "queued" ||
        (status === "failed" && args.retryFailed === true) ||
        (status === "processing" && leaseExpired);
      if (!claimable) continue;
      const isExplicitFailedRetry = status === "failed" && args.retryFailed === true;
      if (attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS && !isExplicitFailedRetry) {
        if (status === "processing") {
          await ctx.db.patch(row._id as any, {
            sourceIngestionStatus: "failed",
            sourceIngestionError: "community_source_ingestion_attempts_exhausted",
            sourceIngestionLeaseId: undefined,
            sourceIngestionLeaseExpiresAt: undefined,
            updatedAt: nowMs,
          });
        }
        continue;
      }

      const leaseId = crypto.randomUUID();
      const nextAttempt = isExplicitFailedRetry && attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS
        ? 1
        : attempt + 1;
      const leaseExpiresAt = nowMs + COMMUNITY_RESOURCE_SOURCE_INGESTION_LEASE_MS;
      await ctx.db.patch(row._id as any, {
        sourceIngestionStatus: "processing",
        sourceIngestionError: undefined,
        sourceIngestionAttemptedAt: nowMs,
        sourceIngestionLeaseId: leaseId,
        sourceIngestionLeaseExpiresAt: leaseExpiresAt,
        sourceIngestionAttempt: nextAttempt,
        updatedAt: nowMs,
      });
      return {
        ok: true,
        claim: {
          resourceId: row._id,
          leaseId,
          leaseExpiresAt,
          attempt: nextAttempt,
          title: String(row.title ?? ""),
          url: String(row.url ?? "").trim(),
          fileKey: String(row.fileKey ?? "").trim(),
          sourceExternalProvider: normalizeSourceIntegrationString(row.sourceExternalProvider, 80),
          sourceExternalConnectionUserId: normalizeIdValue(
            row.sourceExternalConnectionUserId ?? row.createdByUserId,
          ),
          sourceExternalId: normalizeSourceIntegrationString(row.sourceExternalId, 1_000),
          sourceExternalUrl: normalizeSourceIntegrationString(row.sourceExternalUrl, 2_000),
          sourceExternalMimeType: normalizeSourceIntegrationString(row.sourceExternalMimeType, 300),
          sourceIngestionKind: normalizeResourceSourceIngestionKind(row),
        },
      };
    }
    return { ok: true, claim: null };
  },
});

export const finalizeCommunitySourceIngestionInternal = internalMutation({
  args: {
    resourceId: v.id("communityResources"),
    leaseId: v.string(),
    attempt: v.number(),
    status: v.union(v.literal("ready"), v.literal("failed")),
    kind: v.union(
      v.literal("url"),
      v.literal("file"),
      v.literal("google_drive"),
      v.literal("github"),
    ),
    bodyMd: v.optional(v.union(v.string(), v.null())),
    url: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    sourceOriginalFilename: v.optional(v.union(v.string(), v.null())),
    sourceOriginalMimeType: v.optional(v.union(v.string(), v.null())),
    sourceOriginalBytes: v.optional(v.union(v.number(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!existing) return { ok: false, code: "community_source_not_found" };
    if (normalizeResourceRole(existing.role) !== "source") {
      throw new Error("community_source_resource_required");
    }
    const community = await ctx.db.get(existing.communityId as any);
    if (!community) {
      return { ok: false, code: "community_source_ingestion_community_inactive" };
    }
    try {
      requireActiveCommunity(community as any);
    } catch {
      return { ok: false, code: "community_source_ingestion_community_inactive" };
    }
    const nowMs = args.nowMs ?? Date.now();
    const ownsClaim =
      normalizeResourceSourceIngestionStatus(existing) === "processing" &&
      String(existing.sourceIngestionLeaseId ?? "") === args.leaseId &&
      normalizeCommunitySourceIngestionAttempt(existing.sourceIngestionAttempt) ===
        normalizeCommunitySourceIngestionAttempt(args.attempt) &&
      Number(existing.sourceIngestionLeaseExpiresAt ?? 0) > nowMs;
    if (!ownsClaim) {
      return { ok: false, code: "community_source_ingestion_claim_lost" };
    }
    const hasBody = Object.prototype.hasOwnProperty.call(args, "bodyMd");
    const normalizedBodyMd = hasBody
      ? normalizeCommunityResourceBodyMd(
          args.bodyMd,
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
        )
      : null;
    if (args.status === "ready" && !String(normalizedBodyMd ?? "").trim()) {
      throw new Error("community_source_ingestion_body_required");
    }
    if (args.status === "failed" && hasBody) {
      throw new Error("community_source_ingestion_failed_body_forbidden");
    }
    const patch: Record<string, unknown> = {
      sourceIngestionStatus: args.status,
      sourceIngestionKind: args.kind,
      sourceIngestedAt: nowMs,
      sourceIngestionLeaseId: undefined,
      sourceIngestionLeaseExpiresAt: undefined,
      ...(Object.prototype.hasOwnProperty.call(args, "error")
        ? { sourceIngestionError: normalizeOptionalText(args.error, 1000) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalFilename")
        ? { sourceOriginalFilename: normalizeOptionalText(args.sourceOriginalFilename, 240) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalMimeType")
        ? { sourceOriginalMimeType: normalizeOptionalText(args.sourceOriginalMimeType, 180) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalBytes")
        ? {
            sourceOriginalBytes:
              typeof args.sourceOriginalBytes === "number" && Number.isFinite(args.sourceOriginalBytes)
                ? Math.max(0, Math.floor(args.sourceOriginalBytes))
                : undefined,
          }
        : {}),
      updatedAt: nowMs,
    };
    if (hasBody) {
      patch.bodyChars = normalizedBodyMd ? normalizedBodyMd.trim().length : 0;
    }
    if (Object.prototype.hasOwnProperty.call(args, "url")) {
      patch.url = normalizeOptionalUrl(args.url);
    }
    await ctx.db.patch(existing._id as any, patch);
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) return { ok: false, code: "community_source_not_found" };
    if (hasBody) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: updated.communityId,
        resourceId: updated._id,
        bodyMd: normalizedBodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
    return { ok: true, resource: await mapCommunityResourceRow(ctx, hydrated, undefined, undefined, { canManage: true }) };
  },
});

async function runCommunitySourceIngestion(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
  limit?: number;
  retryFailed?: boolean;
}): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const actingUserId = args.userId ?? await resolveAuthenticatedActionUserId(args.ctx, args.authSubject ?? null);
    const limit = Math.max(
      1,
      Math.min(
        COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
        Math.floor(
          args.limit ??
            COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
              COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES,
        ),
      ),
    );
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let lostClaims = 0;
    const claimedResourceIds: any[] = [];
    const failures: Array<{ resource_id: string; title: string; url: string | null; message: string }> = [];

    for (let iteration = 0; iteration < limit; iteration += 1) {
      const claimed = (await args.ctx.runMutation(
        (internal as any).communityResources.claimNextCommunitySourceIngestionInternal,
        {
          userId: actingUserId,
          authSubject: args.authSubject ?? undefined,
          communityId: args.communityId,
          retryFailed: args.retryFailed === true,
          excludeResourceIds: claimedResourceIds,
        },
      )) as any;
      const candidate = claimed?.claim;
      if (!candidate) break;
      processed += 1;
      claimedResourceIds.push(candidate.resourceId);
      const resourceId = String(candidate.resourceId ?? "").trim();
      const leaseId = String(candidate.leaseId ?? "").trim();
      const attempt = normalizeCommunitySourceIngestionAttempt(candidate.attempt);
      const url = String(candidate.url ?? "").trim();
      const fileKey = String(candidate.fileKey ?? "").trim();
      const title = String(candidate.title ?? "").trim();
      const externalUrl = String(candidate.sourceExternalUrl ?? "").trim();
      const ingestionKind = String(candidate.sourceIngestionKind ?? "").trim();
      const kind = ingestionKind === "google_drive" || ingestionKind === "github"
        ? "retired_provider"
        : ingestionKind === "file" || (!url && fileKey)
          ? "file"
          : "url";
      const invalidMessage =
        !resourceId
          ? "community_source_resource_not_found"
          : kind === "url" && !url
            ? "community_source_url_required"
            : kind === "file" && !fileKey
              ? "community_source_file_required"
              : kind === "retired_provider"
                ? "community_source_provider_retired"
                : null;
      const finalizeClaim = async (payload: Record<string, unknown>) => {
        return await args.ctx.runMutation(
          (internal as any).communityResources.finalizeCommunitySourceIngestionInternal,
          {
            resourceId,
            leaseId,
            attempt,
            kind,
            ...payload,
          },
        ) as any;
      };
      if (invalidMessage) {
        const finalized = resourceId
          ? await finalizeClaim({
              status: "failed",
              error: invalidMessage,
            })
          : null;
        if (finalized?.ok) {
          failed += 1;
          failures.push({
            resource_id: resourceId,
            title,
            url: url || externalUrl || null,
            message: invalidMessage,
          });
        } else {
          lostClaims += 1;
        }
        continue;
      }
      try {
        let finalized: any;
        if (kind === "file") {
          const extracted = await extractSourceTextFromFile({
            ctx: args.ctx,
            fileKey,
            filename: title,
          });
          const bodyMd = buildIngestedFileSourceBody({
            title: extracted.title,
            filename: title,
            contentType: extracted.contentType,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("community_source_file_no_readable_content");
          finalized = await finalizeClaim({
            status: "ready",
            bodyMd,
            error: null,
            sourceOriginalFilename: title || null,
            sourceOriginalMimeType: extracted.contentType || null,
            sourceOriginalBytes: extracted.bytes,
          });
        } else {
          const extracted = await extractSourceTextFromUrl(url);
          const bodyMd = buildIngestedSourceBody({
            title: extracted.title,
            url: extracted.finalUrl,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("community_source_url_no_readable_content");
          finalized = await finalizeClaim({
            status: "ready",
            bodyMd,
            url: extracted.finalUrl,
            error: null,
          });
        }
        if (finalized?.ok) {
          succeeded += 1;
        } else {
          lostClaims += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "community_source_ingestion_failed";
        const finalized = await finalizeClaim({
          status: "failed",
          error: message,
        });
        if (finalized?.ok) {
          failed += 1;
          failures.push({
            resource_id: resourceId,
            title,
            url: url || externalUrl || null,
            message,
          });
        } else {
          lostClaims += 1;
        }
      }
    }

    const after = (await args.ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceIngestionStateInternal,
      {
        userId: actingUserId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
      },
    )) as any;
    const readySources = Number(after?.ready_sources ?? 0);
    const totalSources = Number(after?.total_sources ?? 0);
    const failedSources = Number(after?.failed_sources ?? 0);
    const remainingPendingSources = Number(after?.pending_sources ?? 0);
    const ok = readySources > 0 && failedSources === 0 && remainingPendingSources === 0;
    const code = ok
      ? null
      : failedSources > 0
        ? "source_ingestion_partial_failure"
        : remainingPendingSources > 0
          ? "source_ingestion_incomplete"
          : totalSources > 0
            ? "no_ready_sources"
            : "source_material_required";
    return {
      ok,
      kind: "community_source_ingestion",
      processed,
      succeeded,
      failed,
      failed_sources: failedSources,
      lost_claims: lostClaims,
      ready_sources: readySources,
      total_sources: totalSources,
      pending_url_sources: Number(after?.pending_url_sources ?? 0),
      pending_file_sources: Number(after?.pending_file_sources ?? 0),
      pending_google_drive_sources: Number(after?.pending_google_drive_sources ?? 0),
      pending_github_sources: Number(after?.pending_github_sources ?? 0),
      pending_sources: remainingPendingSources,
      failures,
      duration_ms: Date.now() - startedAt,
      code,
      message: ok
        ? "Source material is ready."
        : code === "source_ingestion_partial_failure"
          ? "Some source material could not be read. Review the failed sources and try again."
          : code === "source_ingestion_incomplete"
            ? "Source material is still being prepared. Try again after the remaining sources finish."
            : totalSources > 0
              ? "Source material could not be read yet. Check the source and try again."
              : "Add at least one source before curating resources.",
    };
}

const communitySourceIngestionActionArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
  communityId: v.id("communities"),
  limit: v.optional(v.number()),
  retryFailed: v.optional(v.boolean()),
};

const communitySourceCrawlerPageArg = v.object({
  requested_url: v.string(),
  final_url: v.string(),
  canonical_url: v.string(),
  root_url: v.string(),
  parent_url: v.union(v.string(), v.null()),
  depth: v.number(),
  title: v.union(v.string(), v.null()),
  markdown: v.string(),
  links: v.array(v.object({
    url: v.string(),
    title: v.union(v.string(), v.null()),
  })),
  status: v.union(v.literal("ready"), v.literal("failed"), v.literal("skipped")),
  error: v.union(v.string(), v.null()),
  virtual_page_count: v.optional(v.number()),
  virtual_page_strategy: v.optional(v.union(v.string(), v.null())),
  source_units: v.optional(v.array(v.object({
    unit_key: v.optional(v.union(v.string(), v.null())),
    unit_kind: v.union(v.literal("page"), v.literal("virtual_section")),
    title: v.union(v.string(), v.null()),
    source_url: v.string(),
    root_url: v.string(),
    parent_url: v.union(v.string(), v.null()),
    path: v.union(v.string(), v.null()),
    order: v.number(),
    depth: v.number(),
    markdown: v.string(),
  status: v.union(
      v.literal("ready"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error: v.union(v.string(), v.null()),
    capture_method: v.optional(v.union(v.string(), v.null())),
  }))),
});

export const ingestCommunitySources: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
    });
  },
});

export const getCommunitySourceCrawlerStatus = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return {
      ...getCommunitySourceCrawlerStatusValue(),
      community_id: normalizeIdValue(args.communityId),
    };
  },
});

export const listCommunitySourceCrawlJobs = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const rows = (await ctx.db
      .query("communitySourceCrawlJobs" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(limit)) as CommunitySourceCrawlJobLike[];
    return {
      ok: true,
      kind: "community_source_crawl_jobs",
      community_id: normalizeIdValue(args.communityId),
      jobs: rows.map(mapCommunitySourceCrawlJob),
    };
  },
});

export const getCommunitySourceCrawlJob = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    crawlJobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const row = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_source_crawl_job_not_found");
    }
    return {
      ok: true,
      kind: "community_source_crawl_job",
      job: mapCommunitySourceCrawlJob(row),
    };
  },
});

export const getCommunitySourceCrawlJobInternal = internalQuery({
  args: {
    crawlJobId: v.string(),
  },
  handler: async (ctx, args) => {
    return ((await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null) ?? null;
  },
});

export const createCommunitySourceCrawlJobInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    provider: v.literal("simple"),
    maxPages: v.number(),
    maxDepth: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const id = await ctx.db.insert("communitySourceCrawlJobs" as any, {
      communityId: args.communityId,
      createdByUserId: args.userId,
      provider: args.provider,
      rootUrl: requireSafeSourceIngestionUrl(args.rootUrl),
      status: "queued",
      maxPages: normalizeSourceCrawlerLimit(
        args.maxPages,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
      ),
      maxDepth: normalizeSourceCrawlerLimit(
        args.maxDepth,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
      ),
      pageCount: 0,
      readyPageCount: 0,
      failedPageCount: 0,
      savedSourceCount: 0,
      skippedSourceCount: 0,
      sourceResourceIds: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(id as any)) as CommunitySourceCrawlJobLike | null;
    if (!row) throw new Error("community_source_crawl_job_create_failed");
    return mapCommunitySourceCrawlJob(row);
  },
});

export const patchCommunitySourceCrawlJobInternal = internalMutation({
  args: {
    crawlJobId: v.string(),
    status: v.optional(v.union(
      v.literal("queued"),
      v.literal("crawling"),
      v.literal("saving_sources"),
      v.literal("ready"),
      v.literal("failed"),
    )),
    pageCount: v.optional(v.number()),
    readyPageCount: v.optional(v.number()),
    failedPageCount: v.optional(v.number()),
    savedSourceCount: v.optional(v.number()),
    skippedSourceCount: v.optional(v.number()),
    sourceResourceIds: v.optional(v.array(v.string())),
    error: v.optional(v.union(v.string(), v.null())),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!existing) return null;
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      ...(args.status ? { status: args.status } : {}),
      ...(typeof args.pageCount === "number" && Number.isFinite(args.pageCount)
        ? { pageCount: Math.max(0, Math.floor(args.pageCount)) }
        : {}),
      ...(typeof args.readyPageCount === "number" && Number.isFinite(args.readyPageCount)
        ? { readyPageCount: Math.max(0, Math.floor(args.readyPageCount)) }
        : {}),
      ...(typeof args.failedPageCount === "number" && Number.isFinite(args.failedPageCount)
        ? { failedPageCount: Math.max(0, Math.floor(args.failedPageCount)) }
        : {}),
      ...(typeof args.savedSourceCount === "number" && Number.isFinite(args.savedSourceCount)
        ? { savedSourceCount: Math.max(0, Math.floor(args.savedSourceCount)) }
        : {}),
      ...(typeof args.skippedSourceCount === "number" && Number.isFinite(args.skippedSourceCount)
        ? { skippedSourceCount: Math.max(0, Math.floor(args.skippedSourceCount)) }
        : {}),
      ...(Array.isArray(args.sourceResourceIds)
        ? { sourceResourceIds: args.sourceResourceIds.map((id) => id as any) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "error")
        ? { error: normalizeOptionalText(args.error, 1000) ?? undefined }
        : {}),
      ...(typeof args.startedAt === "number" && Number.isFinite(args.startedAt)
        ? { startedAt: Math.floor(args.startedAt) }
        : {}),
      ...(typeof args.completedAt === "number" && Number.isFinite(args.completedAt)
        ? { completedAt: Math.floor(args.completedAt) }
        : {}),
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(existing._id as any)) as CommunitySourceCrawlJobLike | null;
    return updated ? mapCommunitySourceCrawlJob(updated) : null;
  },
});

function sourceUnitsForCrawlerPage(page: CommunitySourcePageResult): CommunitySourceUnitResult[] {
  const explicitUnits = Array.isArray(page.source_units)
    ? page.source_units.slice(0, COMMUNITY_SOURCE_UNIT_MAX_PER_PAGE)
    : [];
  if (explicitUnits.length > 0) return explicitUnits;
  return [{
    unit_key: null,
    unit_kind: "page",
    title: page.title,
    source_url: page.final_url,
    root_url: page.root_url,
    parent_url: page.parent_url,
    path: normalizeCommunitySourceUnitPath(page.title ?? page.final_url),
    order: Math.max(0, Math.floor(Number(page.depth) || 0)),
    depth: page.depth,
    markdown: page.markdown,
    status: page.status === "ready" ? "ready" : "failed",
    error: page.error,
    capture_method: "crawler_page",
  }];
}

async function writeCommunitySourceUnitContent(ctx: any, args: {
  communityId: any;
  sourceUnitId: any;
  bodyMd: string;
  bodyChars: number;
  bodyHash: string;
  nowMs: number;
}): Promise<void> {
  const existing = (await ctx.db
    .query("communitySourceUnitContents" as any)
    .withIndex("by_source_unit", (q: any) => q.eq("sourceUnitId", args.sourceUnitId))
    .unique()) as { _id?: unknown } | null;
  if (existing?._id) {
    await ctx.db.patch(existing._id as any, {
      bodyMd: args.bodyMd,
      bodyChars: args.bodyChars,
      bodyHash: args.bodyHash,
      updatedAt: args.nowMs,
    });
    return;
  }
  await ctx.db.insert("communitySourceUnitContents" as any, {
    communityId: args.communityId,
    sourceUnitId: args.sourceUnitId,
    bodyMd: args.bodyMd,
    bodyChars: args.bodyChars,
    bodyHash: args.bodyHash,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function saveCommunitySourceUnitsForPage(ctx: any, args: {
  crawlJobId: string;
  communityId: any;
  sourceResourceId: string;
  rootUrl: string;
  page: CommunitySourcePageResult;
  nowMs: number;
}): Promise<{ saved: number; skipped: number; failed: number }> {
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const rawUnit of sourceUnitsForCrawlerPage(args.page)) {
    const rootUrl = maybeSafeSourceCrawlerUrl(rawUnit.root_url) ?? maybeSafeSourceCrawlerUrl(args.rootUrl);
    const sourceUrl = maybeSafeSourceCrawlerUrl(rawUnit.source_url) ?? maybeSafeSourceCrawlerUrl(args.page.final_url);
    if (!rootUrl || !sourceUrl) {
      failed += 1;
      continue;
    }
    if (!communitySourceCrawlerUrlInRootScope({
      rootUrl: args.rootUrl,
      candidateUrl: sourceUrl,
      normalizeUrl: maybeSafeSourceCrawlerUrl,
    })) {
      failed += 1;
      continue;
    }
    const bodyRaw = normalizeOptionalText(rawUnit.markdown, COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS + 1) ?? "";
    if (!bodyRaw.trim() || rawUnit.status === "failed") {
      failed += 1;
      continue;
    }
    if (rawUnit.status === "skipped") {
      skipped += 1;
      continue;
    }
    const bodyOriginalChars = bodyRaw.length;
    const bodyTruncated = bodyOriginalChars > COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS;
    const bodyMd = bodyRaw.slice(0, COMMUNITY_SOURCE_UNIT_MAX_BODY_CHARS);
    const bodyChars = bodyMd.length;
    const bodyHash = await sha256HexText(bodyMd);
    const unitKind: CommunitySourceUnitKind = rawUnit.unit_kind === "virtual_section" ? "virtual_section" : "page";
    const title = normalizeOptionalText(rawUnit.title, 240) ?? null;
    const path = normalizeOptionalText(rawUnit.path, 160) ?? normalizeCommunitySourceUnitPath(title);
    const rawOrder = Number(rawUnit.order);
    const order = Number.isFinite(rawOrder) ? Math.max(0, Math.floor(rawOrder)) : 0;
    const unitKey = normalizeOptionalText(rawUnit.unit_key, 700) ?? buildCommunitySourceCrawlerUnitKey({
      rootUrl,
      unitKind,
      sourceUrl,
      path,
      title,
      order,
      normalizeUrl: maybeSafeSourceCrawlerUrl,
    });
    if (!unitKey) {
      failed += 1;
      continue;
    }
    const existing = (await ctx.db
      .query("communitySourceUnits" as any)
      .withIndex("by_community_unit_key", (q: any) =>
        q.eq("communityId", args.communityId).eq("unitKey", unitKey),
      )
      .unique()) as CommunitySourceUnitLike | null;
    const status = rawUnit.status;
    const parentUrl = maybeSafeSourceCrawlerUrl(rawUnit.parent_url);
    const depthValue = Number(rawUnit.depth);
    const depth = Number.isFinite(depthValue) ? Math.max(0, Math.floor(depthValue)) : 0;
    const captureMethod = normalizeOptionalText(rawUnit.capture_method, 80) ?? undefined;
    const error = normalizeOptionalText(rawUnit.error, 500) ?? undefined;
    if (existing?._id) {
      await ctx.db.patch(existing._id as any, {
        crawlJobId: args.crawlJobId as any,
        sourceResourceId: args.sourceResourceId as any,
        rootUrl,
        unitKind,
        title: title ?? undefined,
        sourceUrl,
        parentUrl: parentUrl ?? undefined,
        path: path ?? undefined,
        order,
        depth,
        status,
        bodyChars,
        bodyOriginalChars,
        bodyHash,
        bodyTruncated,
        captureMethod,
        error,
        seenCount: Math.max(0, Math.floor(Number(existing.seenCount) || 0)) + 1,
        lastSeenAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      if (existing.bodyHash !== bodyHash) {
        await writeCommunitySourceUnitContent(ctx, {
          communityId: args.communityId,
          sourceUnitId: existing._id,
          bodyMd,
          bodyChars,
          bodyHash,
          nowMs: args.nowMs,
        });
        saved += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    const id = await ctx.db.insert("communitySourceUnits" as any, {
      communityId: args.communityId,
      crawlJobId: args.crawlJobId as any,
      sourceResourceId: args.sourceResourceId as any,
      rootUrl,
      unitKey,
      unitKind,
      title: title ?? undefined,
      sourceUrl,
      parentUrl: parentUrl ?? undefined,
      path: path ?? undefined,
      order,
      depth,
      status,
      bodyChars,
      bodyOriginalChars,
      bodyHash,
      bodyTruncated,
      captureMethod,
      error,
      seenCount: 1,
      lastSeenAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await writeCommunitySourceUnitContent(ctx, {
      communityId: args.communityId,
      sourceUnitId: id,
      bodyMd,
      bodyChars,
      bodyHash,
      nowMs: args.nowMs,
    });
    saved += 1;
  }
  return { saved, skipped, failed };
}

async function deleteCommunitySourceUnitContent(ctx: any, sourceUnitId: unknown): Promise<void> {
  const content = (await ctx.db
    .query("communitySourceUnitContents" as any)
    .withIndex("by_source_unit", (q: any) => q.eq("sourceUnitId", sourceUnitId))
    .unique()) as { _id?: unknown } | null;
  if (content?._id) await ctx.db.delete(content._id as any);
}

async function deleteCommunitySourceUnitsForSourceResource(ctx: any, sourceResourceId: unknown): Promise<void> {
  const rows = (await ctx.db
    .query("communitySourceUnits" as any)
    .withIndex("by_source_resource", (q: any) => q.eq("sourceResourceId", sourceResourceId))
    .collect()) as CommunitySourceUnitLike[];
  for (const row of rows) {
    await deleteCommunitySourceUnitContent(ctx, row._id);
    if (row._id) await ctx.db.delete(row._id as any);
  }
}

export const saveCommunitySourceCrawlPagesInternal = internalMutation({
  args: {
    crawlJobId: v.string(),
    communityId: v.id("communities"),
    userId: v.id("users"),
    rootUrl: v.string(),
    provider: v.literal("simple"),
    pages: v.array(communitySourceCrawlerPageArg),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const job = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!job || normalizeIdValue(job.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_source_crawl_job_not_found");
    }
    const nowMs = Date.now();
    const existingSources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const existingByUrl = new Map<string, CommunitySourceCrawlerExistingSource<CommunityResourceLike>>();
    for (const source of existingSources) {
      for (const alias of communitySourceCrawlerUrlAliases(maybeSafeSourceCrawlerUrl, source.url)) {
        if (!existingByUrl.has(alias)) {
          existingByUrl.set(alias, {
            id: normalizeIdValue(source._id),
            hasReadyText: communityResourceSourceHasReadyText(source),
            payload: source,
          });
        }
      }
    }

    let saved = 0;
    let skipped = 0;
    let failed = 0;
    let savedUnits = 0;
    let skippedUnits = 0;
    let failedUnits = 0;
    const sourceResourceIds: string[] = [];
    const seenUrls = new Set<string>();

    for (const page of args.pages) {
      const decision = planCommunitySourceCrawlerPageSave({
        page,
        rootUrl: args.rootUrl,
        existingSourcesByAlias: existingByUrl,
        seenAliases: seenUrls,
        normalizeUrl: maybeSafeSourceCrawlerUrl,
        maxBodyChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
      const finalUrl = decision.final_url;
      const bodyMd = decision.body_md;
      if (decision.action === "fail" || !finalUrl || !bodyMd.trim()) {
        failed += 1;
        continue;
      }
      if (decision.action === "skip") {
        skipped += 1;
        if (decision.source_id) {
          sourceResourceIds.push(decision.source_id);
          const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
            crawlJobId: args.crawlJobId,
            communityId: args.communityId,
            sourceResourceId: decision.source_id,
            rootUrl: args.rootUrl,
            page,
            nowMs,
          });
          savedUnits += unitResult.saved;
          skippedUnits += unitResult.skipped;
          failedUnits += unitResult.failed;
        }
        continue;
      }
      const title = normalizeName(page.title || titleFromSourceCrawlerUrl(finalUrl));
      if (decision.action === "update_existing" && decision.source_id) {
        await ctx.db.patch(decision.source_id as any, {
          title,
          url: finalUrl,
          sourceIngestionStatus: "ready",
          sourceIngestionKind: "url",
          sourceIngestionError: undefined,
          sourceIngestionAttemptedAt: nowMs,
          sourceIngestedAt: nowMs,
          sourceIngestionLeaseId: undefined,
          sourceIngestionLeaseExpiresAt: undefined,
          sourceIngestionAttempt: undefined,
          updatedAt: nowMs,
        });
        await writeCommunityResourceBodyContent(ctx, {
          communityId: args.communityId,
          resourceId: decision.source_id as any,
          bodyMd,
          nowMs,
          maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
        });
        const updated = (await ctx.db.get(decision.source_id as any)) as CommunityResourceLike | null;
        if (updated) {
          const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
          await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
        }
        sourceResourceIds.push(decision.source_id);
        const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
          crawlJobId: args.crawlJobId,
          communityId: args.communityId,
          sourceResourceId: decision.source_id,
          rootUrl: args.rootUrl,
          page,
          nowMs,
        });
        savedUnits += unitResult.saved;
        skippedUnits += unitResult.skipped;
        failedUnits += unitResult.failed;
        saved += 1;
        continue;
      }
      const id = await ctx.db.insert("communityResources" as any, {
        communityId: args.communityId,
        createdByUserId: args.userId,
        type: "link",
        role: "source",
        status: "review",
        title,
        url: finalUrl,
        fileKey: undefined,
        sourceIngestionStatus: "ready",
        sourceIngestionKind: "url",
        sourceIngestionError: undefined,
        sourceIngestionAttemptedAt: nowMs,
        sourceIngestedAt: nowMs,
        pinned: false,
        sortOrder: undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await writeCommunityResourceBodyContent(ctx, {
        communityId: args.communityId,
        resourceId: id,
        bodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
      const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
      if (created) {
        const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
        await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
      }
      const sourceResourceId = normalizeIdValue(id);
      sourceResourceIds.push(sourceResourceId);
      const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
        crawlJobId: args.crawlJobId,
        communityId: args.communityId,
        sourceResourceId,
        rootUrl: args.rootUrl,
        page,
        nowMs,
      });
      savedUnits += unitResult.saved;
      skippedUnits += unitResult.skipped;
      failedUnits += unitResult.failed;
      saved += 1;
    }

    return {
      ok: true,
      kind: "community_source_crawl_pages_saved",
      crawl_job_id: args.crawlJobId,
      provider: args.provider,
      page_count: args.pages.length,
      ready_page_count: args.pages.length - failed,
      failed_page_count: failed,
      saved_source_count: saved,
      skipped_source_count: skipped,
      saved_source_unit_count: savedUnits,
      skipped_source_unit_count: skippedUnits,
      failed_source_unit_count: failedUnits,
      source_resource_ids: sourceResourceIds,
    };
  },
});

export const processCommunitySourceCrawlJobInternal = internalAction({
  args: {
    crawlJobId: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown> | null> => {
    const job = (await ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceCrawlJobInternal,
      { crawlJobId: args.crawlJobId },
    )) as CommunitySourceCrawlJobLike | null;
    if (!job) return null;
    if (job.status === "ready") {
      return {
        ok: true,
        kind: "community_source_crawl_job_already_ready",
        job: mapCommunitySourceCrawlJob(job),
      };
    }
    await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
      crawlJobId: args.crawlJobId,
      status: "crawling",
      error: null,
      startedAt: Date.now(),
    });
    try {
      const crawl = await crawlSourceRootWithConfiguredProvider({
        rootUrl: job.rootUrl,
      });
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "saving_sources",
        pageCount: crawl.pages.length,
        readyPageCount: crawl.pages.filter((page) => page.status === "ready").length,
        failedPageCount: crawl.pages.filter((page) => page.status !== "ready").length,
        error: null,
      });
      const saved = (await ctx.runMutation(
        (internal as any).communityResources.saveCommunitySourceCrawlPagesInternal,
        {
          crawlJobId: args.crawlJobId,
          communityId: job.communityId,
          userId: job.createdByUserId,
          rootUrl: job.rootUrl,
          provider: crawl.provider,
          pages: crawl.pages,
        },
      )) as any;
      const completedAt = Date.now();
      const sourceResourceIds = Array.isArray(saved?.source_resource_ids) ? saved.source_resource_ids : [];
      if (sourceResourceIds.length === 0) {
        const failed = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
          crawlJobId: args.crawlJobId,
          status: "failed",
          pageCount: Number(saved?.page_count ?? crawl.pages.length),
          readyPageCount: Number(saved?.ready_page_count ?? 0),
          failedPageCount: Number(saved?.failed_page_count ?? 0),
          savedSourceCount: Number(saved?.saved_source_count ?? 0),
          skippedSourceCount: Number(saved?.skipped_source_count ?? 0),
          sourceResourceIds,
          error: "community_source_crawl_no_usable_sources",
          completedAt,
        });
        return {
          ok: false,
          kind: "community_source_crawl_job_failed",
          job: failed,
          error: "community_source_crawl_no_usable_sources",
        };
      }
      const updated = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "ready",
        pageCount: Number(saved?.page_count ?? crawl.pages.length),
        readyPageCount: Number(saved?.ready_page_count ?? 0),
        failedPageCount: Number(saved?.failed_page_count ?? 0),
        savedSourceCount: Number(saved?.saved_source_count ?? 0),
        skippedSourceCount: Number(saved?.skipped_source_count ?? 0),
        sourceResourceIds,
        error: null,
        completedAt,
      });
      return {
        ok: true,
        kind: "community_source_crawl_job_completed",
        job: updated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "community_source_crawl_failed";
      const failed = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      return {
        ok: false,
        kind: "community_source_crawl_job_failed",
        job: failed,
        error: message,
      };
    }
  },
});

export const crawlWebRoot: any = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    strategy: v.optional(v.union(v.literal("auto"), v.literal("simple"), v.literal("crawl"))),
    destination: v.optional(v.union(v.literal("context"), v.literal("active_community_sources"))),
    maxPages: v.optional(v.number()),
    maxDepth: v.optional(v.number()),
    maxChars: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = args.userId;
    const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
    const destination = args.destination === "active_community_sources"
      ? "active_community_sources"
      : "context";
    const provider = normalizeWebCrawlStrategyProvider(args.strategy) ?? normalizeSourceCrawlerProvider();
    const maxPages = normalizeSourceCrawlerLimit(
      args.maxPages,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    );
    const maxDepth = normalizeSourceCrawlerLimit(
      args.maxDepth,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    );

    if (destination === "context") {
      const crawl = await crawlSourceRootWithConfiguredProvider({
        rootUrl,
      });
      return buildWebCrawlContextPayload({
        rootUrl,
        provider: crawl.provider,
        pages: crawl.pages,
        maxChars: args.maxChars,
      });
    }

    if (!args.communityId) throw new Error("web_crawl_active_community_required");
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const job = await ctx.runMutation((internal as any).communityResources.createCommunitySourceCrawlJobInternal, {
      userId,
      communityId: args.communityId,
      rootUrl,
      provider,
      maxPages,
      maxDepth,
    });
    const crawlJobId = String(job?.id ?? "").trim();
    if (!crawlJobId) throw new Error("community_source_crawl_job_create_failed");
    const processed = (await ctx.runAction(
      (internal as any).communityResources.processCommunitySourceCrawlJobInternal,
      { crawlJobId },
    )) as any;
    const processedJob = processed?.job;
    if (!processedJob) throw new Error("community_source_crawl_job_processing_failed");
    if (processed?.ok === false && processed?.error !== "community_source_crawl_no_usable_sources") {
      throw new Error(String(processed?.error ?? "web_crawl_failed"));
    }
    const sourceResourceIds = Array.isArray(processedJob.source_resource_ids)
      ? processedJob.source_resource_ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
      : [];
    return {
      ok: processed?.ok === true && sourceResourceIds.length > 0,
      kind: "web_crawl",
      destination,
      provider: processedJob.provider,
      root_url: rootUrl,
      crawl_job_id: crawlJobId,
      page_count: Number(processedJob.page_count ?? 0),
      ready_page_count: Number(processedJob.ready_page_count ?? 0),
      failed_page_count: Number(processedJob.failed_page_count ?? 0),
      saved_source_count: Number(processedJob.saved_source_count ?? 0),
      skipped_source_count: Number(processedJob.skipped_source_count ?? 0),
      source_resource_ids: sourceResourceIds,
    };
  },
});

export const crawlCommunitySourceRoot: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    maxPages: v.optional(v.number()),
    maxDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
    const provider = normalizeSourceCrawlerProvider();
    const maxPages = normalizeSourceCrawlerLimit(
      args.maxPages,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    );
    const maxDepth = normalizeSourceCrawlerLimit(
      args.maxDepth,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    );
    const job = await ctx.runMutation((internal as any).communityResources.createCommunitySourceCrawlJobInternal, {
      userId,
      communityId: args.communityId,
      rootUrl,
      provider,
      maxPages,
      maxDepth,
    });
    const crawlJobId = String(job?.id ?? "").trim();
    if (!crawlJobId) throw new Error("community_source_crawl_job_create_failed");
    try {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityResources.processCommunitySourceCrawlJobInternal,
        { crawlJobId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "community_source_crawl_schedule_failed";
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      throw error;
    }
    return {
      ok: true,
      kind: "community_source_root_crawl_job",
      job,
    };
  },
});

export const saveCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const resourceId = String(args.resourceId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || resourceId.length > 0;

    if (isPatch) {
      if (!resourceId) throw new Error("community_resource_id_required");
      const existing = (await ctx.db.get(resourceId as any)) as CommunityResourceLike | null;
      if (!existing) throw new Error("community_resource_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextTitleRaw = Object.prototype.hasOwnProperty.call(payload, "title") ? payload.title : existing.title;
      const nextTitle = normalizeName(nextTitleRaw);
      const nextTypeRaw = Object.prototype.hasOwnProperty.call(payload, "type") ? payload.type : existing.type;
      const nextRoleRaw = Object.prototype.hasOwnProperty.call(payload, "resource_role")
        ? payload.resource_role
        : existing.role;
      const nextStatusRaw = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? payload.resource_status
        : existing.status;
      const nextStatus = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? requireResourceStatusForWrite(nextStatusRaw)
        : normalizeResourceStatus(nextStatusRaw);
      const nextUrlRaw = Object.prototype.hasOwnProperty.call(payload, "url") ? payload.url : existing.url;
      const nextFileKeyRaw = Object.prototype.hasOwnProperty.call(payload, "file_key")
        ? payload.file_key
        : existing.fileKey;
      const nextSourceIngestionStatusRaw = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
        ? payload.source_ingestion_status
        : existing.sourceIngestionStatus;
      const nextSourceIngestionKindRaw = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
        ? payload.source_ingestion_kind
        : existing.sourceIngestionKind;
      const nextPinnedRaw = Object.prototype.hasOwnProperty.call(payload, "pinned") ? payload.pinned : existing.pinned;
      const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
        ? payload.module_id
        : existing.moduleId;
      const nextRole = normalizeResourceRole(nextRoleRaw);
      const bodyChanged = Object.prototype.hasOwnProperty.call(payload, "body_md");
      // Sources keep their old ceiling; pages are refused whole rather than cut off.
      const nextBodyMd = !bodyChanged
        ? null
        : normalizeResourceRole(nextRoleRaw) === "source"
          ? normalizeCommunityResourceBodyMd(payload.body_md, 20_000)
          : normalizeAuthoredCommunityResourceBodyMd(payload.body_md);
      const nextBodyChars = bodyChanged ? String(nextBodyMd ?? "").trim().length : communityResourceBodyChars(existing);
      const nextUrl = normalizeOptionalUrl(nextUrlRaw);
      const nextFileKey = normalizeOptionalFileKey(nextFileKeyRaw);
      const urlChanged = Object.prototype.hasOwnProperty.call(payload, "url") &&
        String(nextUrl ?? "") !== String(existing.url ?? "");
      const fileChanged = Object.prototype.hasOwnProperty.call(payload, "file_key") &&
        String(nextFileKey ?? "") !== String(existing.fileKey ?? "");
      const nextSourceIngestionStatus = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
        ? requireResourceSourceIngestionStatusForWrite(nextSourceIngestionStatusRaw)
        : nextRole !== "source"
          ? "not_required"
          : bodyChanged && nextBodyChars > 0
          ? "ready"
          : urlChanged || fileChanged
            ? "queued"
            : normalizeResourceSourceIngestionStatus({
                ...existing,
                role: nextRole,
                bodyMd: bodyChanged ? nextBodyMd ?? undefined : existing.bodyMd,
                bodyChars: nextBodyChars,
                url: nextUrl,
                fileKey: nextFileKey,
              });
      const nextSourceIngestionKind = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
        ? requireResourceSourceIngestionKindForWrite(nextSourceIngestionKindRaw)
        : nextRole !== "source"
          ? "manual"
          : fileChanged
            ? "file"
            : urlChanged
              ? "url"
              : normalizeResourceSourceIngestionKind({
                  ...existing,
                  role: nextRole,
                  url: nextUrl,
                  fileKey: nextFileKey,
                });
      const sourceRevisionChanged =
        bodyChanged ||
        urlChanged ||
        fileChanged ||
        nextRole !== normalizeResourceRole(existing.role) ||
        nextSourceIngestionKind !== normalizeResourceSourceIngestionKind(existing);
      const nextModuleId = await requireResourceModuleForRole({
        ctx,
        communityId: existing.communityId,
        moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
        role: nextRole,
      });
      const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
      const nextSortOrder = moduleChanged
        ? await getNextResourceSortOrder({
            ctx,
            communityId: existing.communityId,
            moduleId: nextModuleId,
            excludeResourceId: existing._id,
          })
        : existing.sortOrder;

      await ctx.db.patch(existing._id as any, {
        ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
        type: normalizeResourceType(nextTypeRaw),
        role: nextRole,
        status: nextStatus,
        title: nextTitle,
        url: nextUrl,
        fileKey: nextFileKey,
        sourceIngestionStatus: nextSourceIngestionStatus,
        sourceIngestionKind: nextSourceIngestionKind,
        ...(sourceRevisionChanged
          ? {
              sourceIngestionLeaseId: undefined,
              sourceIngestionLeaseExpiresAt: undefined,
              sourceIngestionAttempt: undefined,
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_ingestion_error")
          ? { sourceIngestionError: normalizeOptionalText(payload.source_ingestion_error, 1000) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_filename")
          ? { sourceOriginalFilename: normalizeOptionalText(payload.source_original_filename, 240) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_mime_type")
          ? { sourceOriginalMimeType: normalizeOptionalText(payload.source_original_mime_type, 180) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_bytes")
          ? {
              sourceOriginalBytes:
                typeof payload.source_original_bytes === "number" && Number.isFinite(payload.source_original_bytes)
                  ? Math.max(0, Math.floor(payload.source_original_bytes))
                  : undefined,
            }
          : {}),
        pinned: Boolean(nextPinnedRaw),
        ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
      if (!updated) throw new Error("community_resource_not_found");
      if (bodyChanged) {
        await writeCommunityResourceBodyContent(ctx, {
          communityId: updated.communityId,
          resourceId: updated._id,
          bodyMd: nextBodyMd,
          nowMs,
          maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
          previousTitle: String(existing.title ?? ""),
        });
      }
      const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
      await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
      return await mapCommunityResourceRow(ctx, hydrated, undefined, undefined, { canManage: true });
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityManager({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
    const type = normalizeResourceType(payload.type);
    const role = normalizeResourceRole(payload.resource_role);
    const hasStatusPayload = Object.prototype.hasOwnProperty.call(payload, "resource_status");
    const status = hasStatusPayload
      ? requireResourceStatusForWrite(payload.resource_status)
      : role === "source"
        ? "review"
        : "draft";
    const title = normalizeName(payload.title);
    const bodyMd = role === "source"
      ? normalizeCommunityResourceBodyMd(payload.body_md, 20_000)
      : normalizeAuthoredCommunityResourceBodyMd(payload.body_md);
    const url = normalizeOptionalUrl(payload.url);
    const fileKey = normalizeOptionalFileKey(payload.file_key);
    const sourceIngestionStatus = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
      ? requireResourceSourceIngestionStatusForWrite(payload.source_ingestion_status)
      : role === "source" && bodyMd
        ? "ready"
        : role === "source" && (url || fileKey)
          ? "queued"
          : "not_required";
    const sourceIngestionKind = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
      ? requireResourceSourceIngestionKindForWrite(payload.source_ingestion_kind)
      : role === "source" && url
        ? "url"
        : role === "source" && fileKey
          ? "file"
          : "manual";
    const pinned = Boolean(payload.pinned);
    const moduleId = await requireResourceModuleForRole({
      ctx,
      communityId: community._id,
      moduleId: normalizeOptionalModuleId(payload.module_id),
      role,
    });
    const nextSortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: community._id,
      moduleId,
    });
    const lessonFields = hasOwnField(payload, "lesson") ? normalizeCommunityLessonFields(payload.lesson) : null;

    const id = await ctx.db.insert("communityResources" as any, {
      communityId: community._id,
      ...(moduleId ? { moduleId } : {}),
      createdByUserId: args.userId,
      type,
      role,
      status,
      title,
      url,
      fileKey,
      sourceIngestionStatus,
      sourceIngestionKind,
      ...(Object.prototype.hasOwnProperty.call(payload, "source_ingestion_error")
        ? { sourceIngestionError: normalizeOptionalText(payload.source_ingestion_error, 1000) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_filename")
        ? { sourceOriginalFilename: normalizeOptionalText(payload.source_original_filename, 240) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_mime_type")
        ? { sourceOriginalMimeType: normalizeOptionalText(payload.source_original_mime_type, 180) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_bytes")
        ? {
            sourceOriginalBytes:
              typeof payload.source_original_bytes === "number" && Number.isFinite(payload.source_original_bytes)
                ? Math.max(0, Math.floor(payload.source_original_bytes))
                : undefined,
          }
        : {}),
      pinned,
      // "Add lesson" makes a lesson, so its buttons, checklists and quizzes work.
      ...(role === "page" && lessonFields ? { lesson: lessonFields } : {}),
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    if (bodyMd) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: community._id,
        resourceId: created._id,
        bodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_BODY_MAX_CHARS,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
    await syncCommunityResourceMemoryProjection(ctx, hydrated, nowMs);
    const createdModule = moduleId
      ? ((await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null)
      : null;
    const liveModuleIds = new Set(
      createdModule && communityResourceModuleIsLive(createdModule)
        ? [normalizeIdValue(createdModule._id)]
        : [],
    );
    if (communityResourceIsLiveModulePage(hydrated, liveModuleIds)) {
      await recordCommunityActivityEventBestEffort({
        ctx,
        communityId: community._id,
        type: "resource_added",
        actorUserId: args.userId,
        targetType: "resource",
        targetId: hydrated._id,
        targetTitle: hydrated.title,
        dedupeKey: `resource_added:${normalizeIdValue(hydrated._id)}`,
        nowMs,
      });
    }
    return await mapCommunityResourceRow(ctx, hydrated, undefined, undefined, { canManage: true });
  },
});

// Knowledge -> Roadmap editing: a lesson's stage, the stage's place, the
// lesson's place in it, and its title, for many lessons in one write (renaming
// or moving a stage touches every lesson in it).
export const updateCommunityLessonBoard = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    updates: v.array(v.object({
      resourceId: v.string(),
      stage: v.string(),
      stageOrder: v.optional(v.number()),
      order: v.optional(v.number()),
      title: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    if (args.updates.length > 300) throw new Error("community_lesson_board_too_many");
    const nowMs = Date.now();
    for (const update of args.updates) {
      const resourceId = ctx.db.normalizeId("communityResources", update.resourceId);
      const row = (resourceId ? await ctx.db.get(resourceId) : null) as CommunityResourceLike | null;
      if (!row || String(row.communityId) !== String(args.communityId)) throw new Error("community_resource_not_found");
      if (normalizeResourceRole(row.role) !== "page") throw new Error("community_lesson_board_page_required");
      const current = (row as any).lesson ?? {};
      const lesson = normalizeCommunityLessonFields({
        ...current,
        stage: update.stage,
        stage_order: update.stageOrder ?? current.stage_order,
        order: update.order ?? current.order,
      });
      if (!lesson?.stage) throw new Error("community_lesson_board_stage_required");
      const title = update.title === undefined ? null : normalizeName(update.title);
      await ctx.db.patch(row._id as any, { lesson, ...(title ? { title } : {}), updatedAt: nowMs });
      if (title && title !== row.title) {
        const updated = (await ctx.db.get(row._id as any)) as CommunityResourceLike | null;
        if (updated) await syncCommunityResourceMemoryProjection(ctx, await hydrateCommunityResourceBody(ctx, updated) ?? updated, nowMs);
      }
    }
    return { ok: true, updated: args.updates.length };
  },
});

export const reorderCommunityResources = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    resourceIds: v.array(v.id("communityResources")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const moduleId = args.moduleId ?? null;
    if (moduleId) {
      await requireValidResourceModule({
        ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(moduleId),
      });
    }

    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const targetModuleIdentity = resourceModuleIdentity(moduleId);
    const scopedRows = rows.filter(
      (row) =>
        resourceModuleIdentity(row.moduleId) === targetModuleIdentity &&
        normalizeResourceRole(row.role) === "page",
    );
    const existingIds = new Set(scopedRows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.resourceIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_order_stale");
    }
    for (const resourceId of requestedIds) {
      if (!existingIds.has(resourceId)) {
        throw new Error("community_resource_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((resourceId, index) =>
        ctx.db.patch(resourceId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
  },
});

export const moveCommunityResourceToModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    resourceId: v.id("communityResources"),
    targetModuleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    beforeResourceId: v.optional(v.union(v.id("communityResources"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!resource || String(resource.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_not_found");
    }
    if (normalizeResourceRole(resource.role) !== "page") {
      throw new Error("community_resource_move_requires_page");
    }

    const targetModuleId = await requireResourceModuleForRole({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(args.targetModuleId ?? null),
      role: "page",
    });
    const targetModuleIdentity = resourceModuleIdentity(targetModuleId);
    const resourceId = normalizeIdValue(resource._id);
    const beforeResourceId = args.beforeResourceId ? normalizeIdValue(args.beforeResourceId) : null;

    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const destinationRows = rows
      .filter(
        (row) =>
          normalizeIdValue(row._id) !== resourceId &&
          resourceModuleIdentity(row.moduleId) === targetModuleIdentity &&
          normalizeResourceRole(row.role) === "page",
      )
      .sort(compareCommunityResources);

    const insertIndex = beforeResourceId
      ? destinationRows.findIndex((row) => normalizeIdValue(row._id) === beforeResourceId)
      : -1;
    if (beforeResourceId && insertIndex < 0) {
      throw new Error("community_resource_move_before_not_found");
    }

    const orderedRows = destinationRows.slice();
    orderedRows.splice(insertIndex >= 0 ? insertIndex : orderedRows.length, 0, resource);
    const nowMs = Date.now();

    await Promise.all(
      orderedRows.map((row, index) => {
        const rowId = normalizeIdValue(row._id);
        return ctx.db.patch(row._id as any, {
          ...(rowId === resourceId
            ? targetModuleId
              ? { moduleId: targetModuleId }
              : { moduleId: undefined }
            : {}),
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        });
      }),
    );

    return { ok: true };
  },
});

export const deleteCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!resource) return { ok: true };
    await requireCommunityManager({
      ctx,
      communityId: resource.communityId,
      userId: args.userId,
    });
    await revokeCommunityResourceMemoryProjection(ctx, resource);
    await deleteCommunitySourceUnitsForSourceResource(ctx, resource._id);
    await deleteCommunityResourceBodyContent(ctx, resource._id);
    await ctx.db.delete(resource._id as any);
    return { ok: true };
  },
});
