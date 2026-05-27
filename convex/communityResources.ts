import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  decryptStoredSecret,
  encryptSecret,
  sha256HexText,
} from "./providerConnections";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
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
  normalizeResourceModuleStatus,
  normalizeResourceSourceIngestionKind,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  normalizeResourceType,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireResourceSourceIngestionKindForWrite,
  requireResourceSourceIngestionStatusForWrite,
  requireResourceModuleStatusForWrite,
  requireResourceStatusForWrite,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import {
  deleteCommunityResourceBodyContent,
  hydrateCommunityResourceBody,
  normalizeCommunityResourceBodyMd,
  writeCommunityResourceBodyContent,
} from "./communityResourceContent";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import {
  COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT,
  COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory";
import type {
  CommunitySourceCrawlJobStatus,
  CommunitySourceCrawlerExistingSource,
  CommunitySourceCrawlerProvider,
  CommunitySourcePageLink,
  CommunitySourcePageResult,
} from "../shared/communitySourceCrawler";
import {
  buildCommunitySourceCrawledBody,
  communitySourceCrawlerUrlInRootScope,
  communitySourceCrawlerUrlAliases,
  planCommunitySourceCrawlerPageSave,
} from "../shared/communitySourceCrawler";

const COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT = 50;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT = 100;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT = 5000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT = 500;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS = 12_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS = 20_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS = 420;
const COMMUNITY_RESOURCE_MAP_DEFAULT_LIMIT = 100;
const COMMUNITY_RESOURCE_MAP_MAX_LIMIT = 250;
const COMMUNITY_RESOURCE_MAP_DEFAULT_PER_MODULE_LIMIT = 8;
const COMMUNITY_RESOURCE_MAP_MAX_PER_MODULE_LIMIT = 25;
const COMMUNITY_RESOURCE_MAP_SUGGESTED_TARGET_LIMIT = 12;
const COMMUNITY_RESOURCE_BATCH_READ_MAX_REFS = 10;
const COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_TOTAL_CHARS = 36_000;
const COMMUNITY_RESOURCE_BATCH_READ_MAX_TOTAL_CHARS = 50_000;
const COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_PER_RESOURCE_CHARS = 12_000;
const COMMUNITY_RESOURCE_BATCH_READ_MAX_PER_RESOURCE_CHARS = 20_000;
const COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT = 50;
const COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT = 250;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_ISSUE_LIMIT = 50;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS = 240;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_MAX_OPERATIONS = 25;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_SUMMARY_MAX_CHARS = 2000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_ITEM_LIMIT = 3;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TEXT_CHARS = 140;
const COMMUNITY_RESOURCE_BUILDER_CHANGESET_PREVIEW_TITLE_CHARS = 96;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES = 2_500_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS = 50_000;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES = 10_000_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS = 12_000;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_TIMEOUT_MS = 90_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS = 3;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT =
  "PolyNet Community Source Ingestion/1.0";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET";
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_PROVIDER_ENV = "ARX_SOURCE_CRAWLER_PROVIDER";
const COMMUNITY_RESOURCE_CRAWL4AI_ENDPOINT_ENV = "ARX_CRAWL4AI_ENDPOINT";
const COMMUNITY_RESOURCE_CRAWL4AI_TOKEN_ENV = "ARX_CRAWL4AI_TOKEN";
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES = 75;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES = 100;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH = 3;
const COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH = 4;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_DEFAULT_CHARS = 40_000;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_MAX_CHARS = 80_000;
const COMMUNITY_RESOURCE_WEB_CRAWL_CONTEXT_PAGE_CHARS = 8_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_DENIED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".corp",
  ".arpa",
  ".test",
  ".invalid",
  ".example",
];
const GOOGLE_DRIVE_SOURCE_PROVIDER = "google_drive" as const;
const GOOGLE_DRIVE_SOURCE_OAUTH_STATE_TTL_MS = 10 * 60_000;
const GOOGLE_DRIVE_SOURCE_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS = 2 * 60_000;
const GOOGLE_DRIVE_SOURCE_REFRESH_WINDOW_MS = 60_000;
const GOOGLE_DRIVE_SOURCE_MAX_FILES = 20;
const GOOGLE_DRIVE_SOURCE_LIST_PAGE_SIZE = 20;
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_DRIVE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_SOURCE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");
const GITHUB_SOURCE_PROVIDER = "github" as const;
const GITHUB_SOURCE_OAUTH_STATE_TTL_MS = 10 * 60_000;
const GITHUB_SOURCE_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS = 2 * 60_000;
const GITHUB_SOURCE_MAX_FILES = 20;
const GITHUB_SOURCE_REPO_LIST_PAGE_SIZE = 30;
const GITHUB_SOURCE_FILE_LIST_LIMIT = 80;
const GITHUB_OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
// Alpha-only OAuth fallback until this moves to a GitHub App install flow with per-repository read permissions.
const GITHUB_SOURCE_SCOPES = ["read:user", "user:email", "repo"].join(" ");
const GITHUB_SOURCE_READABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "mdx",
  "rst",
  "adoc",
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
  "ini",
  "conf",
  "config",
  "env",
  "example",
  "log",
  "sql",
  "graphql",
  "gql",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "sass",
  "less",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "swift",
  "php",
  "cs",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "hh",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "dockerfile",
  "gitignore",
  "gitattributes",
]);

async function mapCommunityResourceRowWithBody(
  ctx: any,
  row: CommunityResourceLike,
  userIdCache?: Map<string, string | null>,
  moduleNameCache?: Map<string, string | null>,
) {
  const hydrated = await hydrateCommunityResourceBody(ctx, row) ?? row;
  return await mapCommunityResourceRow(ctx, hydrated, userIdCache, moduleNameCache);
}

type SourceIntegrationProvider = typeof GOOGLE_DRIVE_SOURCE_PROVIDER | typeof GITHUB_SOURCE_PROVIDER;
type SourceIntegrationReturnContextKind = "community_launch_knowledge" | null;

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

type CommunityResourceBuilderChangesetRow = {
  _id?: unknown;
  communityId: unknown;
  createdByUserId: unknown;
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
    }
  | {
      op: "edit_module";
      module_id: string;
      expected_updated_at: number;
      name?: string;
      description_md?: string | null;
      module_status?: "draft" | "live";
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

type UserSourceIntegrationConnectionRow = {
  _id?: unknown;
  userId: unknown;
  provider: SourceIntegrationProvider;
  authKind: "oauth_tokens";
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
  accountId?: string | null;
  accountLogin?: string | null;
  email?: string | null;
  scope?: string | null;
  accessTokenExpiresAt?: number | null;
  validatedAt: number;
  createdAt: number;
  updatedAt: number;
};

type UserSourceIntegrationAuthStateRow = {
  _id?: unknown;
  userId: unknown;
  provider: SourceIntegrationProvider;
  communityId?: unknown;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnToPath: string;
  returnContextKind?: SourceIntegrationReturnContextKind;
  callbackCodeEncryptedHex?: string;
  callbackCodeIvHex?: string;
  callbackCodeVersion?: number;
  finalizeTokenHash?: string;
  callbackReceivedAt?: number;
  finalizeStatus?: "processing" | "completed" | "failed";
  finalizeStartedAt?: number;
  finalizeCompletedAt?: number;
  finalizeResultJson?: string;
  finalizeErrorMessage?: string;
  createdAt: number;
  expiresAt: number;
};

type StoredGoogleDriveAuthV1 = {
  kind: "google_drive_oauth_tokens_v1";
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: number | null;
  idToken: string | null;
};

type GoogleDriveFileCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  size: string | null;
};

type GoogleDriveOAuthFinalizeResult = {
  ok: boolean;
  provider: typeof GOOGLE_DRIVE_SOURCE_PROVIDER;
  community_id?: string | null;
  return_context_kind?: SourceIntegrationReturnContextKind;
  email?: string | null;
  error_message?: string | null;
};

type StoredGitHubAuthV1 = {
  kind: "github_oauth_token_v1";
  accessToken: string;
  tokenType: string;
  scope: string | null;
  accountId: string | null;
  login: string | null;
  email: string | null;
};

type GitHubRepoCandidate = {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  htmlUrl: string | null;
  defaultBranch: string;
  updatedAt: string | null;
  pushedAt: string | null;
};

type GitHubFileCandidate = {
  id: string;
  repoFullName: string;
  path: string;
  name: string;
  ref: string;
  sha: string | null;
  size: number | null;
  htmlUrl: string | null;
};

type GitHubOAuthFinalizeResult = {
  ok: boolean;
  provider: typeof GITHUB_SOURCE_PROVIDER;
  community_id?: string | null;
  return_context_kind?: SourceIntegrationReturnContextKind;
  login?: string | null;
  email?: string | null;
  error_message?: string | null;
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

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function normalizeReturnToPath(value: unknown): string {
  const trimmed = normalizeSourceIntegrationString(value, 2_000);
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/discover";
  }
  return trimmed;
}

function normalizeSourceIntegrationReturnContextKind(value: unknown): SourceIntegrationReturnContextKind {
  const normalized = normalizeSourceIntegrationString(value, 80);
  return normalized === "community_launch_knowledge" ? normalized : null;
}

function resolveSourceIntegrationReturnContextKind(returnToPath: unknown): SourceIntegrationReturnContextKind {
  try {
    const url = new URL(normalizeReturnToPath(returnToPath), "https://polynet.ai");
    const setup = String(url.searchParams.get("community_launch_setup") ?? "")
      .trim()
      .toLowerCase();
    const step = String(url.searchParams.get("community_launch_step") ?? "")
      .trim()
      .toLowerCase();
    return (setup === "1" || setup === "true") && step === "knowledge"
      ? "community_launch_knowledge"
      : null;
  } catch {
    return null;
  }
}

function normalizeHttpsOrLocalOrigin(value: unknown): string | null {
  const raw = normalizeSourceIntegrationString(value, 2_000).replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveGoogleDriveOAuthCallbackOrigin(fallback: unknown): string {
  const envOrigin = normalizeHttpsOrLocalOrigin(
    readEnv("ARX_GOOGLE_DRIVE_OAUTH_CALLBACK_BASE_URL") ||
      readEnv("ARX_APP_OAUTH_CALLBACK_BASE_URL") ||
      readEnv("CONVEX_SITE_URL") ||
      readEnv("VITE_CONVEX_SITE_URL") ||
      readEnv("PUBLIC_CONVEX_SITE_URL"),
  );
  if (envOrigin) return envOrigin;
  const fallbackOrigin = normalizeHttpsOrLocalOrigin(fallback);
  if (fallbackOrigin) return fallbackOrigin;
  throw new Error("google_drive_oauth_callback_origin_missing");
}

function buildGoogleDriveOAuthRedirectUri(callbackBaseUrl: unknown): string {
  return `${resolveGoogleDriveOAuthCallbackOrigin(callbackBaseUrl)}/source-integrations/google-drive/callback`;
}

function resolveGitHubOAuthCallbackOrigin(fallback: unknown): string {
  const envOrigin = normalizeHttpsOrLocalOrigin(
    readEnv("ARX_GITHUB_OAUTH_CALLBACK_BASE_URL") ||
      readEnv("ARX_APP_OAUTH_CALLBACK_BASE_URL") ||
      readEnv("CONVEX_SITE_URL") ||
      readEnv("VITE_CONVEX_SITE_URL") ||
      readEnv("PUBLIC_CONVEX_SITE_URL"),
  );
  if (envOrigin) return envOrigin;
  const fallbackOrigin = normalizeHttpsOrLocalOrigin(fallback);
  if (fallbackOrigin) return fallbackOrigin;
  throw new Error("github_oauth_callback_origin_missing");
}

function buildGitHubOAuthRedirectUri(callbackBaseUrl: unknown): string {
  return `${resolveGitHubOAuthCallbackOrigin(callbackBaseUrl)}/source-integrations/github/callback`;
}

function buildSourceIntegrationRedirectUrl(params: {
  returnToPath: string;
  status: "connected" | "error" | "pending";
  provider: string;
  message?: string | null;
  state?: string | null;
  finalizeToken?: string | null;
  returnContextKind?: SourceIntegrationReturnContextKind;
}): string {
  let origin = "https://polynet.ai";
  try {
    origin = readCanonicalPublicAppOrigin();
  } catch {
    // Use the product origin as a last-resort redirect target.
  }
  const url = new URL(params.returnToPath || "/discover", origin);
  url.searchParams.set("source_integration_oauth", params.status);
  url.searchParams.set("source_integration_provider", params.provider);
  if (params.returnContextKind) {
    url.searchParams.set("source_integration_context", params.returnContextKind);
  }
  if (params.message) url.searchParams.set("source_integration_message", params.message.slice(0, 300));
  if (params.state) url.searchParams.set("source_integration_state", params.state);
  if (params.finalizeToken) {
    url.searchParams.set("source_integration_finalize_token", params.finalizeToken);
  }
  return url.toString();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (const value of bytes) out += String.fromCharCode(value);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = normalizeSourceIntegrationString(token, 20_000);
  if (!raw) return null;
  try {
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jwtStringClaim(token: string | null | undefined, key: string): string | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseGoogleDriveExpiresAt(expiresIn: unknown, nowMs: number): number | null {
  const seconds =
    typeof expiresIn === "number"
      ? expiresIn
      : Number.parseInt(normalizeSourceIntegrationString(expiresIn, 40), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return nowMs + Math.floor(seconds) * 1000;
}

function encodeStoredGoogleDriveAuth(value: StoredGoogleDriveAuthV1): string {
  return JSON.stringify({
    kind: "google_drive_oauth_tokens_v1",
    accessToken: value.accessToken,
    refreshToken: value.refreshToken ?? null,
    tokenType: value.tokenType || "Bearer",
    scope: value.scope ?? null,
    expiresAt: value.expiresAt ?? null,
    idToken: value.idToken ?? null,
  });
}

function parseStoredGoogleDriveAuth(raw: unknown): StoredGoogleDriveAuthV1 | null {
  try {
    const parsed = JSON.parse(normalizeSourceIntegrationString(raw, 80_000)) as Record<string, unknown>;
    if (!parsed || parsed.kind !== "google_drive_oauth_tokens_v1") return null;
    const accessToken = normalizeSourceIntegrationString(parsed.accessToken, 20_000);
    if (!accessToken) return null;
    return {
      kind: "google_drive_oauth_tokens_v1",
      accessToken,
      refreshToken: normalizeSourceIntegrationString(parsed.refreshToken, 20_000) || null,
      tokenType: normalizeSourceIntegrationString(parsed.tokenType, 40) || "Bearer",
      scope: normalizeSourceIntegrationString(parsed.scope, 2_000) || null,
      expiresAt:
        typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
          ? Math.floor(parsed.expiresAt)
          : null,
      idToken: normalizeSourceIntegrationString(parsed.idToken, 20_000) || null,
    };
  } catch {
    return null;
  }
}

function encodeStoredGitHubAuth(value: StoredGitHubAuthV1): string {
  return JSON.stringify({
    kind: "github_oauth_token_v1",
    accessToken: value.accessToken,
    tokenType: value.tokenType || "Bearer",
    scope: value.scope ?? null,
    accountId: value.accountId ?? null,
    login: value.login ?? null,
    email: value.email ?? null,
  });
}

function parseStoredGitHubAuth(raw: unknown): StoredGitHubAuthV1 | null {
  try {
    const parsed = JSON.parse(String(raw ?? "{}")) as Partial<StoredGitHubAuthV1> | null;
    if (!parsed || parsed.kind !== "github_oauth_token_v1") return null;
    const accessToken = normalizeSourceIntegrationString(parsed.accessToken, 20_000);
    if (!accessToken) return null;
    return {
      kind: "github_oauth_token_v1",
      accessToken,
      tokenType: normalizeSourceIntegrationString(parsed.tokenType, 40) || "Bearer",
      scope: normalizeSourceIntegrationString(parsed.scope, 2_000) || null,
      accountId: normalizeSourceIntegrationString(parsed.accountId, 320) || null,
      login: normalizeSourceIntegrationString(parsed.login, 320) || null,
      email: normalizeSourceIntegrationString(parsed.email, 320) || null,
    };
  } catch {
    return null;
  }
}

function stringifyGoogleDriveOAuthFinalizeResult(result: GoogleDriveOAuthFinalizeResult): string {
  return JSON.stringify({
    ok: result.ok === true,
    provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
    community_id: result.community_id ?? null,
    return_context_kind: normalizeSourceIntegrationReturnContextKind(result.return_context_kind),
    email: result.email ?? null,
    error_message: result.error_message ?? null,
  });
}

function parseGoogleDriveOAuthFinalizeResult(raw: unknown): GoogleDriveOAuthFinalizeResult | null {
  try {
    const parsed = JSON.parse(normalizeSourceIntegrationString(raw, 4_000)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      ok: parsed.ok === true,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      community_id: normalizeSourceIntegrationString(parsed.community_id, 200) || null,
      return_context_kind: normalizeSourceIntegrationReturnContextKind(parsed.return_context_kind),
      email: normalizeSourceIntegrationString(parsed.email, 320) || null,
      error_message: normalizeSourceIntegrationString(parsed.error_message, 500) || null,
    };
  } catch {
    return null;
  }
}

function stringifyGitHubOAuthFinalizeResult(result: GitHubOAuthFinalizeResult): string {
  return JSON.stringify({
    ok: result.ok === true,
    provider: GITHUB_SOURCE_PROVIDER,
    community_id: result.community_id ?? null,
    return_context_kind: normalizeSourceIntegrationReturnContextKind(result.return_context_kind),
    login: result.login ?? null,
    email: result.email ?? null,
    error_message: result.error_message ?? null,
  });
}

function parseGitHubOAuthFinalizeResult(raw: unknown): GitHubOAuthFinalizeResult | null {
  try {
    const parsed = JSON.parse(String(raw ?? "{}")) as GitHubOAuthFinalizeResult | null;
    if (!parsed || parsed.provider !== GITHUB_SOURCE_PROVIDER) return null;
    return {
      ok: parsed.ok === true,
      provider: GITHUB_SOURCE_PROVIDER,
      community_id: normalizeSourceIntegrationString(parsed.community_id, 200) || null,
      return_context_kind: normalizeSourceIntegrationReturnContextKind(parsed.return_context_kind),
      login: normalizeSourceIntegrationString(parsed.login, 320) || null,
      email: normalizeSourceIntegrationString(parsed.email, 320) || null,
      error_message: normalizeSourceIntegrationString(parsed.error_message, 500) || null,
    };
  } catch {
    return null;
  }
}

function isGoogleDriveNativeDocumentMimeType(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.document";
}

function isGoogleDriveFolderMimeType(mimeType: string): boolean {
  return mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

function isSupportedGoogleDriveSourceMimeType(mimeType: string, filename = ""): boolean {
  const normalized = mimeType.toLowerCase();
  return isGoogleDriveNativeDocumentMimeType(normalized) ||
    isReadableTextFileType(normalized, filename);
}

function escapeGoogleDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseGoogleDriveModifiedAt(value: unknown): number | undefined {
  const raw = normalizeSourceIntegrationString(value, 120);
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

function isLiteralIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function isLiteralPrivateIpv4(hostname: string): boolean {
  if (!isLiteralIpv4(hostname)) return false;
  const parts = hostname.split(".").map((part) => Number(part));
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224
  );
}

function hasEmbeddedPrivateIpv4(hostname: string): boolean {
  const candidates = hostname.replace(/-/g, ".").match(/\d{1,3}(?:\.\d{1,3}){3}/g) ?? [];
  return candidates.some(isLiteralPrivateIpv4);
}

function isDeniedSourceIngestionHostname(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.includes(":") ||
    hostname.startsWith("[") ||
    hostname.endsWith("]") ||
    /^\d+$/.test(hostname) ||
    isLiteralIpv4(hostname) ||
    hasEmbeddedPrivateIpv4(hostname) ||
    COMMUNITY_RESOURCE_SOURCE_INGESTION_DENIED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function requireSafeSourceIngestionUrl(raw: unknown): string {
  const url = normalizeOptionalUrl(raw);
  if (!url) throw new Error("community_source_url_required");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("community_source_url_https_required");
  }
  if (parsed.username || parsed.password) {
    throw new Error("community_source_url_credentials_not_supported");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("community_source_url_port_not_supported");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (isDeniedSourceIngestionHostname(hostname)) {
    throw new Error("community_source_url_private_or_local");
  }
  parsed.hash = "";
  return parsed.toString();
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
  const raw = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV), 2_000);
  if (!raw) throw new Error("community_source_url_fetcher_not_configured");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("community_source_url_fetcher_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("community_source_url_fetcher_invalid");
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("community_source_url_fetcher_invalid");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("community_source_url_fetcher_invalid");
  }
  return parsed.toString();
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
  const raw = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_SOURCE_CRAWLER_PROVIDER_ENV), 40)
    .toLowerCase();
  if (!raw || raw === "simple") return "simple";
  if (raw === "crawl4ai") return "crawl4ai";
  throw new Error("community_source_crawler_provider_invalid");
}

function getCommunitySourceCrawlerStatusValue() {
  const providerRaw = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_SOURCE_CRAWLER_PROVIDER_ENV), 40)
    .toLowerCase();
  if (providerRaw && providerRaw !== "simple" && providerRaw !== "crawl4ai") {
    return {
      ok: true,
      kind: "community_source_crawler_status",
      provider: "simple" as const,
      configured: false,
      full_site_crawl_available: false,
      default_max_pages: 0,
      default_max_depth: 0,
      max_pages: 0,
      max_depth: 0,
      missing: [COMMUNITY_RESOURCE_SOURCE_CRAWLER_PROVIDER_ENV],
      code: "community_source_crawler_provider_invalid",
      message: "Source crawler provider is invalid.",
    };
  }
  if (!providerRaw || providerRaw === "simple") {
    return {
      ok: true,
      kind: "community_source_crawler_status",
      provider: "simple" as const,
      configured: true,
      full_site_crawl_available: false,
      default_max_pages: 1,
      default_max_depth: 0,
      max_pages: 1,
      max_depth: 0,
      missing: [] as string[],
      code: null,
      message: "Only the pasted page will be read.",
    };
  }

  const missing: string[] = [];
  try {
    resolveCrawl4AiEndpoint();
  } catch {
    missing.push(COMMUNITY_RESOURCE_CRAWL4AI_ENDPOINT_ENV);
  }
  try {
    crawl4AiHeaders();
  } catch {
    missing.push(COMMUNITY_RESOURCE_CRAWL4AI_TOKEN_ENV);
  }
  const configured = missing.length === 0;
  return {
    ok: true,
    kind: "community_source_crawler_status",
    provider: "crawl4ai" as const,
    configured,
    full_site_crawl_available: configured,
    default_max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
    default_max_depth: COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
    max_pages: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    max_depth: COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    missing,
    code: configured ? null : "community_source_crawl4ai_not_configured",
    message: configured ? null : "Full site crawling is not configured.",
  };
}

function normalizeSourceCrawlerLimit(raw: unknown, fallback: number, max: number): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function resolveCrawl4AiEndpoint(): string {
  const raw = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_CRAWL4AI_ENDPOINT_ENV), 2_000);
  if (!raw) throw new Error("community_source_crawl4ai_endpoint_not_configured");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("community_source_crawl4ai_endpoint_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("community_source_crawl4ai_endpoint_invalid");
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("community_source_crawl4ai_endpoint_invalid");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("community_source_crawl4ai_endpoint_invalid");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

function crawl4AiHeaders(): Record<string, string> {
  const token = normalizeSourceIntegrationString(readEnv(COMMUNITY_RESOURCE_CRAWL4AI_TOKEN_ENV), 4_000);
  if (!token) throw new Error("community_source_crawl4ai_token_not_configured");
  return {
    "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
}

function sourceCrawlerEndpointUrl(path: string): string {
  return `${resolveCrawl4AiEndpoint()}${path.startsWith("/") ? path : `/${path}`}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstCrawlerString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeCrawl4AiMarkdown(raw: unknown): string {
  if (typeof raw === "string") {
    return normalizeOptionalText(raw, COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS) ?? "";
  }
  const record = asRecord(raw);
  return normalizeOptionalText(
    firstCrawlerString(record, ["fit_markdown", "raw_markdown", "markdown", "text"]),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}

function maybeSafeSourceCrawlerUrl(raw: unknown): string | null {
  try {
    return requireSafeSourceIngestionUrl(raw);
  } catch {
    return null;
  }
}

function normalizeCrawl4AiLinks(raw: unknown, rootUrl: string): CommunitySourcePageLink[] {
  const linksRecord = asRecord(raw);
  const rawLinks = Array.isArray(raw)
    ? raw
    : [
        ...(Array.isArray(linksRecord?.internal) ? linksRecord.internal : []),
        ...(Array.isArray(linksRecord?.external) ? linksRecord.external : []),
      ];
  const links: CommunitySourcePageLink[] = [];
  const seen = new Set<string>();
  for (const entry of rawLinks) {
    const record = asRecord(entry);
    const rawUrl = typeof entry === "string"
      ? entry
      : firstCrawlerString(record, ["href", "url", "link"]);
    let url: string;
    try {
      url = requireSafeSourceIngestionUrl(rawUrl);
    } catch {
      continue;
    }
    if (
      !communitySourceCrawlerUrlInRootScope({
        rootUrl,
        candidateUrl: url,
        normalizeUrl: maybeSafeSourceCrawlerUrl,
      }) || seen.has(url)
    ) continue;
    seen.add(url);
    links.push({
      url,
      title: normalizeOptionalText(firstCrawlerString(record, ["text", "title", "label"]), 240) ?? null,
    });
  }
  return links.slice(0, COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES);
}

function extractCrawl4AiRows(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  const candidates = [
    payload,
    record?.results,
    record?.result,
    record?.data,
    data?.results,
    data?.result,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
    const row = asRecord(candidate);
    if (row && (row.url || row.final_url || row.markdown || row.success !== undefined)) return [row];
  }
  return [];
}

function normalizeCrawl4AiSourcePageResult(args: {
  row: Record<string, unknown>;
  rootUrl: string;
  requestedUrl: string;
  maxDepth: number;
}): CommunitySourcePageResult | null {
  const metadata = asRecord(args.row.metadata);
  const rawRequestedUrl = firstCrawlerString(args.row, ["requested_url", "requestedUrl"]) || args.requestedUrl;
  const rawFinalUrl = firstCrawlerString(args.row, ["final_url", "finalUrl", "url"]) || rawRequestedUrl;
  let requestedUrl: string;
  let finalUrl: string;
  try {
    requestedUrl = requireSafeSourceIngestionUrl(rawRequestedUrl);
    finalUrl = requireSafeSourceIngestionUrl(rawFinalUrl);
  } catch {
    return null;
  }
  if (!communitySourceCrawlerUrlInRootScope({
    rootUrl: args.rootUrl,
    candidateUrl: finalUrl,
    normalizeUrl: maybeSafeSourceCrawlerUrl,
  })) return null;
  const rawDepth = Number(metadata?.depth ?? args.row.depth ?? 0);
  const depth = Number.isFinite(rawDepth)
    ? Math.min(Math.max(0, Math.floor(rawDepth)), args.maxDepth)
    : 0;
  const rawVirtualPageCount = Number(metadata?.virtual_page_count ?? args.row.virtual_page_count ?? 0);
  const virtualPageCount = Number.isFinite(rawVirtualPageCount)
    ? Math.max(0, Math.floor(rawVirtualPageCount))
    : 0;
  const markdown = normalizeCrawl4AiMarkdown(args.row.markdown ?? args.row.text);
  const success = args.row.success !== false && String(args.row.status ?? "").toLowerCase() !== "failed";
  const error = normalizeOptionalText(
    firstCrawlerString(args.row, ["error", "error_message", "message"]),
    500,
  ) ?? null;
  let parentUrl: string | null = null;
  const rawParentUrl = firstCrawlerString(args.row, ["parent_url", "parentUrl"]) ||
    firstCrawlerString(metadata, ["parent_url", "parentUrl"]);
  if (rawParentUrl) {
    try {
      const normalizedParentUrl = requireSafeSourceIngestionUrl(rawParentUrl);
      parentUrl = communitySourceCrawlerUrlInRootScope({
        rootUrl: args.rootUrl,
        candidateUrl: normalizedParentUrl,
        normalizeUrl: maybeSafeSourceCrawlerUrl,
      })
        ? normalizedParentUrl
        : null;
    } catch {
      parentUrl = null;
    }
  }
  return {
    requested_url: requestedUrl,
    final_url: finalUrl,
    canonical_url: finalUrl,
    root_url: args.rootUrl,
    parent_url: parentUrl,
    depth,
    title: normalizeOptionalText(
      firstCrawlerString(args.row, ["title"]) || firstCrawlerString(metadata, ["title"]),
      240,
    ) ?? null,
    markdown,
    links: normalizeCrawl4AiLinks(args.row.links, args.rootUrl),
    status: success && markdown ? "ready" : "failed",
    error: success && markdown ? null : error ?? "community_source_crawl4ai_no_readable_content",
    virtual_page_count: virtualPageCount,
    virtual_page_strategy: normalizeOptionalText(
      firstCrawlerString(args.row, ["virtual_page_strategy"]) || firstCrawlerString(metadata, ["virtual_page_strategy"]),
      80,
    ) ?? null,
  };
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

async function crawlSourceRootWithCrawl4AI(args: {
  rootUrl: string;
  maxPages: number;
  maxDepth: number;
}): Promise<CommunitySourcePageResult[]> {
  const preflight = await fetchSourceUrlViaConfiguredFetcher(args.rootUrl);
  const crawlerRootUrl = requireSafeSourceIngestionUrl(preflight.finalUrl);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      sourceCrawlerEndpointUrl("/crawl"),
      {
        method: "POST",
        headers: crawl4AiHeaders(),
        body: JSON.stringify({
          urls: [crawlerRootUrl],
          browser_config: {
            type: "BrowserConfig",
            params: { headless: true },
          },
          crawler_config: {
            type: "CrawlerRunConfig",
            params: {
              stream: false,
              cache_mode: "bypass",
              markdown_generator_options: { include_links: true },
              deep_crawl_strategy: {
                type: "BFSDeepCrawlStrategy",
                params: {
                  max_depth: args.maxDepth,
                  max_pages: args.maxPages,
                  include_external: false,
                },
              },
            },
          },
        }),
      },
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("community_source_crawl4ai_timeout");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`community_source_crawl4ai_failed_${response.status}`);
  const rawPayload = await readResponseTextBounded(
    response,
    COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_RESPONSE_BYTES,
  );
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new Error("community_source_crawl4ai_invalid_response");
  }
  const payloadRecord = asRecord(payload);
  if (payloadRecord?.task_id && !payloadRecord.results) {
    throw new Error("community_source_crawl4ai_job_not_completed");
  }
  const pages = extractCrawl4AiRows(payload)
    .map((row) => normalizeCrawl4AiSourcePageResult({
      row,
      rootUrl: crawlerRootUrl,
      requestedUrl: args.rootUrl,
      maxDepth: args.maxDepth,
    }))
    .filter((page): page is CommunitySourcePageResult => Boolean(page))
    .filter((page) => page.depth <= args.maxDepth)
    .slice(0, args.maxPages);
  if (pages.length === 0) throw new Error("community_source_crawl4ai_no_results");
  return pages;
}

async function crawlSourceRootWithConfiguredProvider(args: {
  rootUrl: string;
  maxPages?: number;
  maxDepth?: number;
  provider?: CommunitySourceCrawlerProvider;
}): Promise<{
  provider: CommunitySourceCrawlerProvider;
  pages: CommunitySourcePageResult[];
}> {
  const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
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
  const provider = args.provider ?? normalizeSourceCrawlerProvider();
  const pages = provider === "crawl4ai"
    ? await crawlSourceRootWithCrawl4AI({ rootUrl, maxPages, maxDepth })
    : await crawlSourceRootWithSimpleFetcher({ rootUrl });
  return { provider, pages };
}

function normalizeWebCrawlStrategyProvider(raw: unknown): CommunitySourceCrawlerProvider | undefined {
  const strategy = normalizeSourceIntegrationString(raw, 20).toLowerCase();
  if (strategy === "simple") return "simple";
  if (strategy === "crawl") return "crawl4ai";
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
    });
  }
  const readyPages = args.pages.filter((page) => page.status === "ready");
  const virtualPageCount = args.pages.reduce(
    (total, page) => total + Math.max(0, Math.floor(Number(page.virtual_page_count) || 0)),
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

function buildIngestedGoogleDriveSourceBody(args: {
  title: string | null;
  fileId: string;
  webUrl: string | null;
  contentType: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      `Google Drive file: ${args.fileId}`,
      args.webUrl ? `Google Drive URL: ${args.webUrl}` : null,
      args.contentType ? `File type: ${args.contentType}` : null,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}

function buildIngestedGitHubSourceBody(args: {
  title: string | null;
  externalId: string;
  webUrl: string | null;
  contentType: string;
  text: string;
}): string {
  return normalizeOptionalText(
    [
      args.title ? `# ${args.title}` : null,
      `GitHub file: ${args.externalId}`,
      args.webUrl ? `GitHub URL: ${args.webUrl}` : null,
      args.contentType ? `File type: ${args.contentType}` : null,
      args.text,
    ].filter(Boolean).join("\n\n"),
    COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
  ) ?? "";
}

async function readJsonResponseBounded(response: Response): Promise<Record<string, unknown>> {
  const text = await readResponseTextBounded(response);
  try {
    return JSON.parse(text || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function exchangeGoogleDriveCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  nowMs: number;
}): Promise<StoredGoogleDriveAuthV1> {
  const response = await fetchWithTimeout(GOOGLE_DRIVE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code_verifier: params.codeVerifier,
    }),
  });
  const parsed = await readJsonResponseBounded(response);
  if (!response.ok) {
    const message = normalizeSourceIntegrationString(parsed.error_description, 500) ||
      normalizeSourceIntegrationString(parsed.error, 200) ||
      `google_drive_oauth_token_exchange_failed_${response.status}`;
    throw new Error(message);
  }
  const accessToken = normalizeSourceIntegrationString(parsed.access_token, 20_000);
  if (!accessToken) throw new Error("google_drive_oauth_access_token_missing");
  return {
    kind: "google_drive_oauth_tokens_v1",
    accessToken,
    refreshToken: normalizeSourceIntegrationString(parsed.refresh_token, 20_000) || null,
    tokenType: normalizeSourceIntegrationString(parsed.token_type, 40) || "Bearer",
    scope: normalizeSourceIntegrationString(parsed.scope, 2_000) || null,
    expiresAt: parseGoogleDriveExpiresAt(parsed.expires_in, params.nowMs),
    idToken: normalizeSourceIntegrationString(parsed.id_token, 20_000) || null,
  };
}

async function refreshGoogleDriveTokens(params: {
  bundle: StoredGoogleDriveAuthV1;
  clientId: string;
  clientSecret: string;
  nowMs: number;
}): Promise<StoredGoogleDriveAuthV1> {
  if (!params.bundle.refreshToken) throw new Error("google_drive_reauth_required");
  const response = await fetchWithTimeout(GOOGLE_DRIVE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.bundle.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });
  const parsed = await readJsonResponseBounded(response);
  if (!response.ok) throw new Error("google_drive_reauth_required");
  const accessToken = normalizeSourceIntegrationString(parsed.access_token, 20_000);
  if (!accessToken) throw new Error("google_drive_reauth_required");
  return {
    kind: "google_drive_oauth_tokens_v1",
    accessToken,
    refreshToken: normalizeSourceIntegrationString(parsed.refresh_token, 20_000) || params.bundle.refreshToken,
    tokenType: normalizeSourceIntegrationString(parsed.token_type, 40) || params.bundle.tokenType || "Bearer",
    scope: normalizeSourceIntegrationString(parsed.scope, 2_000) || params.bundle.scope,
    expiresAt: parseGoogleDriveExpiresAt(parsed.expires_in, params.nowMs),
    idToken: normalizeSourceIntegrationString(parsed.id_token, 20_000) || params.bundle.idToken,
  };
}

function mapGoogleDriveFileCandidate(raw: unknown): GoogleDriveFileCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = normalizeSourceIntegrationString(record.id, 300);
  const name = normalizeSourceIntegrationString(record.name, 300);
  const mimeType = normalizeSourceIntegrationString(record.mimeType, 300).toLowerCase();
  if (!id || !name || !mimeType) return null;
  return {
    id,
    name,
    mimeType,
    webViewLink: normalizeSourceIntegrationString(record.webViewLink, 2_000) || null,
    modifiedTime: normalizeSourceIntegrationString(record.modifiedTime, 120) || null,
    size: normalizeSourceIntegrationString(record.size, 80) || null,
  };
}

async function fetchGoogleDriveJson(params: {
  accessToken: string;
  url: string;
}): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(params.url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/json",
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
  });
  const parsed = await readJsonResponseBounded(response);
  if (!response.ok) {
    const message = normalizeSourceIntegrationString((parsed.error as any)?.message, 500) ||
      normalizeSourceIntegrationString(parsed.error_description, 500) ||
      normalizeSourceIntegrationString(parsed.error, 200) ||
      `google_drive_api_failed_${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function fetchGoogleDriveText(params: {
  accessToken: string;
  fileId: string;
  mimeType: string;
  filename: string;
}): Promise<{ text: string; contentType: string }> {
  const fileId = encodeURIComponent(params.fileId);
  const mimeType = params.mimeType.toLowerCase();
  const url = isGoogleDriveNativeDocumentMimeType(mimeType)
    ? `${GOOGLE_DRIVE_API_BASE_URL}/files/${fileId}/export?mimeType=${encodeURIComponent("text/plain")}`
    : `${GOOGLE_DRIVE_API_BASE_URL}/files/${fileId}?alt=media`;
  const response = await fetchWithTimeout(url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "text/plain,text/markdown,text/csv,application/json,application/xml,text/xml,*/*;q=0.5",
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`google_drive_file_fetch_failed_${response.status}`);
  const responseContentType = String(response.headers.get("content-type") ?? "").trim();
  const contentType = (responseContentType || mimeType || "text/plain").toLowerCase();
  if (!isGoogleDriveNativeDocumentMimeType(mimeType) && !isReadableTextFileType(contentType, params.filename)) {
    throw new Error("google_drive_file_content_type_not_supported");
  }
  const raw = await readResponseTextBounded(response);
  const extracted = extractReadableText(raw, contentType);
  if (!extracted.text) throw new Error("google_drive_file_no_readable_content");
  return {
    text: extracted.text,
    contentType: contentType || (isGoogleDriveNativeDocumentMimeType(mimeType) ? "text/plain" : mimeType),
  };
}

function getFilenameFromPath(path: string): string {
  const normalized = normalizeSourceIntegrationString(path, 1_000).replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized || "GitHub source";
}

function getGitHubSourcePathKey(path: string): string {
  const filename = getFilenameFromPath(path).toLowerCase();
  const extension = getFileExtension(filename);
  return extension || filename;
}

function isSupportedGitHubSourcePath(path: string, size?: number | null): boolean {
  if (typeof size === "number" && Number.isFinite(size) && size > COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES) {
    return false;
  }
  return GITHUB_SOURCE_READABLE_EXTENSIONS.has(getGitHubSourcePathKey(path));
}

function inferGitHubSourceContentType(path: string): string {
  const key = getGitHubSourcePathKey(path);
  if (key === "md" || key === "markdown" || key === "mdx") return "text/markdown";
  if (key === "html" || key === "htm") return "text/html";
  if (key === "json" || key === "jsonl") return "application/json";
  if (key === "xml") return "application/xml";
  if (key === "csv") return "text/csv";
  if (key === "yaml" || key === "yml") return "application/yaml";
  if (key === "toml") return "application/toml";
  return "text/plain";
}

function encodeGitHubPath(path: string): string {
  return normalizeSourceIntegrationString(path, 2_000)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function normalizeGitHubRepoFullName(value: unknown): string | null {
  const raw = normalizeSourceIntegrationString(value, 300);
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(raw);
  return match ? `${match[1]}/${match[2]}` : null;
}

function splitGitHubRepoFullName(value: unknown): { owner: string; repo: string } | null {
  const fullName = normalizeGitHubRepoFullName(value);
  if (!fullName) return null;
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function buildGitHubFileExternalId(params: {
  repoFullName: string;
  ref: string;
  path: string;
}): string {
  return `${params.repoFullName}@${encodeURIComponent(params.ref)}:${encodeURIComponent(params.path)}`;
}

function parseGitHubFileExternalId(value: unknown): {
  repoFullName: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
} | null {
  const raw = normalizeSourceIntegrationString(value, 1_000);
  const atIndex = raw.indexOf("@");
  const colonIndex = raw.indexOf(":", atIndex + 1);
  if (atIndex <= 0 || colonIndex <= atIndex + 1) return null;
  const repoFullName = normalizeGitHubRepoFullName(raw.slice(0, atIndex));
  const split = splitGitHubRepoFullName(repoFullName);
  if (!repoFullName || !split) return null;
  try {
    const ref = decodeURIComponent(raw.slice(atIndex + 1, colonIndex)).trim();
    const path = decodeURIComponent(raw.slice(colonIndex + 1)).trim().replace(/^\/+/, "");
    if (!ref || !path || !isSupportedGitHubSourcePath(path)) return null;
    return {
      repoFullName,
      owner: split.owner,
      repo: split.repo,
      ref,
      path,
    };
  } catch {
    return null;
  }
}

function buildGitHubFileWebUrl(params: {
  repoFullName: string;
  ref: string;
  path: string;
}): string {
  return `https://github.com/${params.repoFullName}/blob/${encodeURIComponent(params.ref)}/${encodeGitHubPath(params.path)}`;
}

function decodeGitHubBase64Content(raw: unknown): string {
  const normalized = normalizeSourceIntegrationString(raw, COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES * 2)
    .replace(/\s+/g, "");
  if (!normalized) return "";
  const binary = atob(normalized);
  if (binary.length > COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES) {
    throw new Error("github_file_too_large");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function mapGitHubRepoCandidate(raw: unknown): GitHubRepoCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const fullName = normalizeGitHubRepoFullName(record.full_name);
  const split = splitGitHubRepoFullName(fullName);
  const id = normalizeSourceIntegrationString(record.id, 120);
  const name = normalizeSourceIntegrationString(record.name, 240);
  const defaultBranch = normalizeSourceIntegrationString(record.default_branch, 240) || "main";
  if (!fullName || !split || !id || !name) return null;
  return {
    id,
    name,
    fullName,
    owner: split.owner,
    private: record.private === true,
    htmlUrl: normalizeSourceIntegrationString(record.html_url, 2_000) || null,
    defaultBranch,
    updatedAt: normalizeSourceIntegrationString(record.updated_at, 120) || null,
    pushedAt: normalizeSourceIntegrationString(record.pushed_at, 120) || null,
  };
}

function mapGitHubFileCandidate(raw: unknown, params: {
  repoFullName: string;
  ref: string;
}): GitHubFileCandidate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (normalizeSourceIntegrationString(record.type, 40) !== "blob") return null;
  const path = normalizeSourceIntegrationString(record.path, 1_000).replace(/^\/+/, "");
  const size =
    typeof record.size === "number" && Number.isFinite(record.size)
      ? Math.max(0, Math.floor(record.size))
      : null;
  if (!path || !isSupportedGitHubSourcePath(path, size)) return null;
  const id = buildGitHubFileExternalId({
    repoFullName: params.repoFullName,
    ref: params.ref,
    path,
  });
  return {
    id,
    repoFullName: params.repoFullName,
    path,
    name: getFilenameFromPath(path),
    ref: params.ref,
    sha: normalizeSourceIntegrationString(record.sha, 120) || null,
    size,
    htmlUrl: buildGitHubFileWebUrl({
      repoFullName: params.repoFullName,
      ref: params.ref,
      path,
    }),
  };
}

async function fetchGitHubJson(params: {
  accessToken: string;
  url: string;
  method?: string;
  body?: BodyInit | null;
}): Promise<Record<string, unknown> | unknown[]> {
  const response = await fetchWithTimeout(params.url, {
    method: params.method ?? "GET",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": GITHUB_API_VERSION,
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
    body: params.body ?? undefined,
  });
  const parsed = await readJsonResponseBounded(response);
  if (!response.ok) {
    const message = normalizeSourceIntegrationString((parsed as any)?.message, 500) ||
      `github_api_failed_${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function exchangeGitHubCodeForToken(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}): Promise<Pick<StoredGitHubAuthV1, "accessToken" | "tokenType" | "scope">> {
  const response = await fetchWithTimeout(GITHUB_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  });
  const parsed = await readJsonResponseBounded(response);
  if (!response.ok || parsed.error) {
    const message = normalizeSourceIntegrationString(parsed.error_description, 500) ||
      normalizeSourceIntegrationString(parsed.error, 200) ||
      `github_oauth_token_exchange_failed_${response.status}`;
    throw new Error(message);
  }
  const accessToken = normalizeSourceIntegrationString(parsed.access_token, 20_000);
  if (!accessToken) throw new Error("github_oauth_access_token_missing");
  return {
    accessToken,
    tokenType: normalizeSourceIntegrationString(parsed.token_type, 40) || "Bearer",
    scope: normalizeSourceIntegrationString(parsed.scope, 2_000) || null,
  };
}

async function fetchGitHubViewer(params: {
  accessToken: string;
}): Promise<{ accountId: string | null; login: string | null; email: string | null }> {
  const viewer = await fetchGitHubJson({
    accessToken: params.accessToken,
    url: `${GITHUB_API_BASE_URL}/user`,
  }) as Record<string, unknown>;
  let email = normalizeSourceIntegrationString(viewer.email, 320) || null;
  if (!email) {
    try {
      const emailsPayload = await fetchGitHubJson({
        accessToken: params.accessToken,
        url: `${GITHUB_API_BASE_URL}/user/emails`,
      });
      if (Array.isArray(emailsPayload)) {
        const primary = emailsPayload.find((entry) =>
          entry && typeof entry === "object" && (entry as Record<string, unknown>).primary === true,
        ) as Record<string, unknown> | undefined;
        email = normalizeSourceIntegrationString(primary?.email, 320) || null;
      }
    } catch {
      email = null;
    }
  }
  return {
    accountId: normalizeSourceIntegrationString(viewer.id, 120) || null,
    login: normalizeSourceIntegrationString(viewer.login, 320) || null,
    email,
  };
}

async function fetchGitHubFileText(params: {
  accessToken: string;
  repoFullName: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
}): Promise<{
  title: string | null;
  text: string;
  contentType: string;
  htmlUrl: string | null;
  size: number | null;
}> {
  if (!isSupportedGitHubSourcePath(params.path)) {
    throw new Error("github_file_content_type_not_supported");
  }
  const url = new URL(
    `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${encodeGitHubPath(params.path)}`,
  );
  url.searchParams.set("ref", params.ref);
  const payload = await fetchGitHubJson({
    accessToken: params.accessToken,
    url: url.toString(),
  }) as Record<string, unknown>;
  if (Array.isArray(payload) || normalizeSourceIntegrationString(payload.type, 40) !== "file") {
    throw new Error("github_file_required");
  }
  const size =
    typeof payload.size === "number" && Number.isFinite(payload.size)
      ? Math.max(0, Math.floor(payload.size))
      : null;
  if (!isSupportedGitHubSourcePath(params.path, size)) {
    throw new Error("github_file_content_type_not_supported");
  }
  const encoding = normalizeSourceIntegrationString(payload.encoding, 80).toLowerCase();
  if (encoding !== "base64") throw new Error("github_file_encoding_not_supported");
  const raw = decodeGitHubBase64Content(payload.content);
  const contentType = inferGitHubSourceContentType(params.path);
  const extracted = extractReadableText(raw, contentType);
  if (!extracted.text) throw new Error("github_file_no_readable_content");
  return {
    title: getFilenameFromPath(params.path),
    text: extracted.text,
    contentType,
    htmlUrl: normalizeSourceIntegrationString(payload.html_url, 2_000) ||
      buildGitHubFileWebUrl({
        repoFullName: params.repoFullName,
        ref: params.ref,
        path: params.path,
      }),
    size,
  };
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

async function syncArchiveDocumentsForModule(args: {
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
    await upsertArchiveDocumentForResource(args.ctx, row);
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
        await syncArchiveDocumentsForModule({
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

function normalizeDraftLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function truncateDraftLine(raw: string, maxLength: number): string {
  const value = normalizeDraftLine(raw);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function stripDraftBulletPrefix(raw: string): string {
  return normalizeDraftLine(raw.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/, ""));
}

function uniqueDraftLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const normalized = truncateDraftLine(line, 240);
    if (normalized.length < 12) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function extractDraftSummary(sourceBody: string): string {
  const paragraphs = sourceBody
    .split(/\n{2,}/)
    .map((paragraph) => normalizeDraftLine(paragraph.replace(/\r?\n/g, " ")))
    .filter((paragraph) => paragraph.length >= 24);
  const firstParagraph = paragraphs[0] ?? "";
  if (firstParagraph) return truncateDraftLine(stripDraftBulletPrefix(firstParagraph), 520);
  return "Review the source and replace this with the durable takeaway members should remember.";
}

function extractDraftKeyIdeas(sourceBody: string): string[] {
  const lines = sourceBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = uniqueDraftLines(
    lines
      .filter((line) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line))
      .map(stripDraftBulletPrefix),
  );
  if (bulletLines.length > 0) return bulletLines.slice(0, 5);

  const sentenceLines = uniqueDraftLines(
    normalizeDraftLine(sourceBody)
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map(stripDraftBulletPrefix) ?? [],
  );
  return sentenceLines.slice(0, 5);
}

function buildPageDraftBodyFromSource(source: CommunityResourceLike): string {
  const sourceBody = normalizeOptionalText(source.bodyMd, 10_000);
  const sourceUrl = normalizeOptionalUrl(source.url);
  const sourceFile = normalizeOptionalFileKey(source.fileKey);
  const sourceLine = sourceUrl
    ? `[Original source](${sourceUrl})`
    : sourceFile
      ? `Uploaded file: ${sourceFile}`
      : source.title;
  const summary = sourceBody
    ? extractDraftSummary(sourceBody)
    : "Review the source and replace this with the durable takeaway members should remember.";
  const keyIdeas = sourceBody ? extractDraftKeyIdeas(sourceBody) : [];
  const keyIdeaLines = keyIdeas.length > 0
    ? keyIdeas.map((line) => `- ${line}`)
    : [
      "- Add the main idea.",
      "- Add the most useful detail.",
      "- Remove anything that should stay as raw source material.",
    ];
  const memberUse = sourceBody
    ? "Use this page as the member-facing version of the source. Tighten the summary, remove private notes, then move it into a live module when the content is accurate."
    : "Review the source, add the member-facing takeaway, then move it into a live module when the page is accurate.";
  const sourceNotes = sourceBody
    ? sourceBody
    : "Review the original source and replace this note with the durable context members should reuse.";

  return [
    "## Summary",
    "",
    summary,
    "",
    "## Key Ideas",
    "",
    ...keyIdeaLines,
    "",
    "## How Members Should Use This",
    "",
    memberUse,
    "",
    "## Source Notes",
    "",
    sourceNotes,
    "",
    "## Source",
    "",
    sourceLine,
  ].join("\n");
}

function boundedToolLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT, parsed));
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

function boundedMapLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_MAP_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_MAP_DEFAULT_LIMIT;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_MAP_MAX_LIMIT, parsed));
}

function boundedMapPerModuleLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_MAP_DEFAULT_PER_MODULE_LIMIT));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_MAP_DEFAULT_PER_MODULE_LIMIT;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_MAP_MAX_PER_MODULE_LIMIT, parsed));
}

function boundedBatchReadMaxChars(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_TOTAL_CHARS));
  if (!Number.isFinite(parsed)) return COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_TOTAL_CHARS;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_BATCH_READ_MAX_TOTAL_CHARS, parsed));
}

function boundedBatchReadPerResourceChars(raw: unknown, maxChars: number): number {
  const parsed = Math.floor(Number(raw ?? COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_PER_RESOURCE_CHARS));
  const fallback = Math.min(COMMUNITY_RESOURCE_BATCH_READ_DEFAULT_PER_RESOURCE_CHARS, maxChars);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(COMMUNITY_RESOURCE_BATCH_READ_MAX_PER_RESOURCE_CHARS, maxChars, parsed));
}

function normalizeBatchReadRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("community_resources_read_refs_required");
  const refs = raw
    .map((ref) => String(ref ?? "").trim().slice(0, 1024))
    .filter(Boolean);
  if (refs.length < 1) throw new Error("community_resources_read_refs_required");
  return refs.slice(0, COMMUNITY_RESOURCE_BATCH_READ_MAX_REFS);
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

function normalizeBuilderWriteKind(raw: unknown): "module" | "page" | "source" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "module" || value === "page" || value === "source") return value;
  throw new Error("community_resource_builder_kind_invalid");
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

  return rawOperations.map((raw, index) => {
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
      if (!hasOwnField(record, "name") && !hasOwnField(record, "description_md") && !hasOwnField(record, "module_status")) {
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
          ? normalizeCommunityResourceBodyMd(record.body_md, 20_000)
          : null,
        source_resource_id: normalizeOptionalModuleId(record.source_resource_id),
        ...(hasOwnField(record, "type") ? { type: normalizeResourceType(record.type) } : null),
        ...(hasOwnField(record, "url") ? { url: normalizeOptionalUrl(record.url) ?? null } : null),
        ...(hasOwnField(record, "resource_status")
          ? { resource_status: normalizeChangesetPageStatus(record.resource_status) }
          : null),
        ...(hasOwnField(record, "pinned") ? { pinned: Boolean(record.pinned) } : null),
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
      if (hasOwnField(record, "body_md")) next.body_md = normalizeCommunityResourceBodyMd(record.body_md, 20_000);
      if (hasOwnField(record, "source_resource_id")) {
        next.source_resource_id = normalizeOptionalModuleId(record.source_resource_id);
      }
      if (hasOwnField(record, "type")) next.type = normalizeResourceType(record.type);
      if (hasOwnField(record, "url")) next.url = normalizeOptionalUrl(record.url) ?? null;
      if (hasOwnField(record, "resource_status")) next.resource_status = normalizeChangesetPageStatus(record.resource_status);
      if (hasOwnField(record, "pinned")) next.pinned = Boolean(record.pinned);
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
  await requireValidResourceModule({
    ctx: args.ctx,
    communityId: args.communityId,
    moduleId: normalizeOptionalModuleId(moduleId),
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
    moduleId,
  });
  const id = await args.ctx.db.insert("communityResources" as any, {
    communityId: args.communityId,
    ...(moduleId ? { moduleId } : {}),
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
      maxChars: 20_000,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, created) ?? created;
  await upsertArchiveDocumentForResource(args.ctx, hydrated);
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
    ? await requireValidResourceModule({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(args.operation.module_id),
      })
    : existing.moduleId;
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
    ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
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
      maxChars: 20_000,
    });
  }
  const hydrated = await hydrateCommunityResourceBody(args.ctx, updated) ?? updated;
  await upsertArchiveDocumentForResource(args.ctx, hydrated);
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
  await deleteCommunityResourceBodyContent(args.ctx, existing._id);
  await args.ctx.db.delete(existing._id as any);
  await deleteArchiveDocumentBySource(args.ctx, {
    communityId: existing.communityId,
    sourceType: "resource",
    sourceId: normalizeIdValue(existing._id),
  });
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
        updatedAt: args.nowMs,
      });
      if (moduleStatusChanged) {
        await syncArchiveDocumentsForModule({
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
      const moduleId = await requireValidResourceModule({
        ctx: args.ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(operation.module_id),
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
      if (updated) await upsertArchiveDocumentForResource(args.ctx, updated);
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
    if (updated) await upsertArchiveDocumentForResource(args.ctx, updated);
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
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
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
): Promise<CommunityResourceLike[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[];
  return rows
    .filter((row) => communityResourceIsLiveModulePage(row, liveModuleIds))
    .sort(compareCommunityResources);
}

async function listResourceDirectoryAllResources(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceLike[]> {
  return ((await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[])
    .sort(compareCommunityResources);
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
  return {
    type: "resource",
    resource_id: normalizeIdValue(row._id),
    resource_role: normalizeResourceRole(row.role),
    resource_status: normalizeResourceStatus(row.status),
    title: row.title,
    path: directory.directory_path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    url: row.url ?? null,
    has_file: Boolean(row.fileKey),
    summary: compactResourceSummary(row),
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

function sourceInboxEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike | null;
  sourceCount: number;
}) {
  const moduleDirectory = args.module
    ? buildCommunityResourceModuleDirectoryFields({
        communityId: normalizeIdValue(args.communityId),
        moduleId: normalizeIdValue(args.module._id),
        moduleName: args.module.name,
      })
    : buildUnsortedModuleDirectoryFields(args.communityId);
  return {
    type: "directory",
    name: "Source Inbox",
    path: `${moduleDirectory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    directory_path: `${moduleDirectory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    directory_uri: `${moduleDirectory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`,
    resource_count: args.sourceCount,
    resource_role: "source",
    summary: "Source materials for this module.",
    updated_at: null,
  };
}

function listRootResourceDirectory(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  limit: number;
}) {
  const entries = args.modules
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    })
    .map((module) =>
      buildModuleDirectoryEntry({
        communityId: args.communityId,
        module,
        resources: moduleResources(args.resources, normalizeIdValue(module._id)),
      }),
    );
  const unsortedResources = moduleResources(args.resources, null);
  if (unsortedResources.length > 0) {
    entries.push(
      buildModuleDirectoryEntry({
        communityId: args.communityId,
        module: null,
        resources: unsortedResources,
      }),
    );
  }
  return entries.slice(0, args.limit);
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

function buildCommunityResourceMapResourceEntry(args: {
  row: CommunityResourceLike;
  moduleNameMap: Map<string, string>;
  builder: boolean;
}) {
  const entry = buildResourceDirectoryEntry(args.row, args.moduleNameMap);
  if (!args.builder) return entry;
  return {
    ...entry,
    builder_metadata: mapCompactCommunityResourceBuilderListRow(args.row, args.moduleNameMap),
  };
}

function buildCommunityResourceMapModuleEntry(args: {
  communityId: any;
  module: CommunityResourceModuleLike;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  perModuleLimit: number;
  remainingResourceSlots: number;
  builder: boolean;
}) {
  const rows = moduleResources(args.resources, normalizeIdValue(args.module._id));
  const resourceLimit = Math.max(0, Math.min(args.perModuleLimit, args.remainingResourceSlots));
  return {
    ...buildModuleDirectoryEntry({
      communityId: args.communityId,
      module: args.module,
      resources: rows,
    }),
    module_status: normalizeResourceModuleStatus(args.module.status),
    resources: rows
      .slice(0, resourceLimit)
      .map((row) =>
        buildCommunityResourceMapResourceEntry({
          row,
          moduleNameMap: args.moduleNameMap,
          builder: args.builder,
        }),
      ),
    resources_truncated: rows.length > resourceLimit,
  };
}

function buildCommunityResourceMapUnassignedEntry(args: {
  communityId: any;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  perModuleLimit: number;
  remainingResourceSlots: number;
}) {
  const rows = moduleResources(args.resources, null);
  const resourceLimit = Math.max(0, Math.min(args.perModuleLimit, args.remainingResourceSlots));
  return {
    ...buildModuleDirectoryEntry({
      communityId: args.communityId,
      module: null,
      resources: rows,
    }),
    module_status: null,
    resources: rows
      .slice(0, resourceLimit)
      .map((row) =>
        buildCommunityResourceMapResourceEntry({
          row,
          moduleNameMap: args.moduleNameMap,
          builder: true,
        }),
      ),
    resources_truncated: rows.length > resourceLimit,
  };
}

function buildCommunityResourceSuggestedReadTargets(args: {
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  builder: boolean;
}) {
  return args.resources
    .slice()
    .filter(communityResourceHasUsableKnowledgeContent)
    .sort(compareSuggestedResourceReadTargets)
    .slice(0, COMMUNITY_RESOURCE_MAP_SUGGESTED_TARGET_LIMIT)
    .map((row) =>
      buildCommunityResourceMapResourceEntry({
        row,
        moduleNameMap: args.moduleNameMap,
        builder: args.builder,
      }),
    );
}

function buildCommunityResourceMapPayload(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  resources: CommunityResourceLike[];
  scope: "member" | "builder";
  limit: number;
  perModuleLimit: number;
  nowMs: number;
}) {
  const moduleNameMap = buildModuleNameMap(args.modules);
  const modules = args.modules.slice().sort(compareCommunityResourceModules);
  const builder = args.scope === "builder";
  let remainingResourceSlots = args.limit;
  let returnedResourceCount = 0;
  const mappedModules = modules.map((module) => {
    const entry = buildCommunityResourceMapModuleEntry({
      communityId: args.communityId,
      module,
      resources: args.resources,
      moduleNameMap,
      perModuleLimit: args.perModuleLimit,
      remainingResourceSlots,
      builder,
    });
    const included = entry.resources.length;
    returnedResourceCount += included;
    remainingResourceSlots = Math.max(0, remainingResourceSlots - included);
    return entry;
  });
  const unassignedEntry = builder
    ? buildCommunityResourceMapUnassignedEntry({
        communityId: args.communityId,
        resources: args.resources,
        moduleNameMap,
        perModuleLimit: args.perModuleLimit,
        remainingResourceSlots,
      })
    : null;
  if (unassignedEntry) {
    const included = unassignedEntry.resources.length;
    returnedResourceCount += included;
    remainingResourceSlots = Math.max(0, remainingResourceSlots - included);
  }

  return {
    ok: true,
    kind: "community_resources_map",
    scope: args.scope,
    limit: args.limit,
    per_module_limit: args.perModuleLimit,
    total_modules: modules.length,
    total_resources: args.resources.length,
    returned_resources: returnedResourceCount,
    truncated: returnedResourceCount < args.resources.length,
    modules: mappedModules,
    ...(unassignedEntry && unassignedEntry.resource_count > 0
      ? { unassigned_resources: unassignedEntry }
      : null),
    suggested_read_targets: buildCommunityResourceSuggestedReadTargets({
      resources: args.resources,
      moduleNameMap,
      builder,
    }),
    ...(builder
      ? {
          health: buildCommunityResourceBuilderHealthReportFromRows({
            modules: args.modules,
            resources: args.resources,
            nowMs: args.nowMs,
          }),
        }
      : null),
  };
}

type ResolvedResourceDirectoryModuleTarget =
  | {
      ok: true;
      module: CommunityResourceModuleLike | null;
      moduleId: string | null;
      sourceInbox: boolean;
      path: string;
      directoryUri: string;
    }
  | {
      ok: false;
      reason_code: "ambiguous_resource_directory_path";
      message: string;
      matches: Array<{ module_id: string | null; name: string; directory_path: string; directory_uri: string }>;
    };

function resolveModuleTargetFromUri(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  ref: string;
}): ResolvedResourceDirectoryModuleTarget | null {
  const parsed = parseCommunityResourceDirectoryUri(args.ref);
  if (!parsed) return null;
  if (parsed.communityId !== normalizeIdValue(args.communityId)) {
    throw new Error("community_resource_directory_community_mismatch");
  }
  if (parsed.resourceId) {
    throw new Error("community_resource_directory_path_not_listable");
  }
  if (parsed.moduleId === COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT) {
    const directory = buildUnsortedModuleDirectoryFields(args.communityId);
    return {
      ok: true,
      module: null,
      moduleId: null,
      sourceInbox: parsed.sourceInbox,
      path: parsed.sourceInbox
        ? `${directory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
        : directory.directory_path,
      directoryUri: parsed.sourceInbox
        ? `${directory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
        : directory.directory_uri,
    };
  }
  const module = args.modules.find((candidate) => normalizeIdValue(candidate._id) === parsed.moduleId) ?? null;
  if (!module) throw new Error("community_resource_directory_module_not_found");
  const directory = buildCommunityResourceModuleDirectoryFields({
    communityId: normalizeIdValue(args.communityId),
    moduleId: normalizeIdValue(module._id),
    moduleName: module.name,
  });
  return {
    ok: true,
    module,
    moduleId: normalizeIdValue(module._id),
    sourceInbox: parsed.sourceInbox,
    path: parsed.sourceInbox
      ? `${directory.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : directory.directory_path,
    directoryUri: parsed.sourceInbox
      ? `${directory.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : directory.directory_uri,
  };
}

function resolveModuleTargetFromPath(args: {
  communityId: any;
  modules: CommunityResourceModuleLike[];
  ref: string;
}): ResolvedResourceDirectoryModuleTarget {
  const normalizedPath = normalizeDirectoryToolPath(args.ref);
  const sourceSuffix = `/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`;
  const sourceInbox = normalizedPath.endsWith(sourceSuffix);
  const modulePath = sourceInbox
    ? normalizedPath.slice(0, -sourceSuffix.length) || "/"
    : normalizedPath;

  const candidates: Array<{
    module: CommunityResourceModuleLike | null;
    moduleId: string | null;
    name: string;
    directory_path: string;
    directory_uri: string;
  }> = [];
  const unsortedDirectory = buildUnsortedModuleDirectoryFields(args.communityId);
  if (normalizeDirectoryPathForMatch(modulePath) === normalizeDirectoryPathForMatch(unsortedDirectory.directory_path)) {
    candidates.push({
      module: null,
      moduleId: null,
      name: "Unsorted",
      directory_path: unsortedDirectory.directory_path,
      directory_uri: unsortedDirectory.directory_uri,
    });
  }
  for (const module of args.modules) {
    const directory = buildCommunityResourceModuleDirectoryFields({
      communityId: normalizeIdValue(args.communityId),
      moduleId: normalizeIdValue(module._id),
      moduleName: module.name,
    });
    if (normalizeDirectoryPathForMatch(modulePath) !== normalizeDirectoryPathForMatch(directory.directory_path)) {
      continue;
    }
    candidates.push({
      module,
      moduleId: normalizeIdValue(module._id),
      name: module.name,
      directory_path: directory.directory_path,
      directory_uri: directory.directory_uri,
    });
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      reason_code: "ambiguous_resource_directory_path",
      message: "Multiple community resource modules share this readable path. Use directory_uri instead.",
      matches: candidates.map((candidate) => ({
        module_id: candidate.moduleId,
        name: candidate.name,
        directory_path: candidate.directory_path,
        directory_uri: candidate.directory_uri,
      })),
    };
  }
  const candidate = candidates[0];
  if (!candidate) throw new Error("community_resource_directory_module_not_found");
  return {
    ok: true,
    module: candidate.module,
    moduleId: candidate.moduleId,
    sourceInbox,
    path: sourceInbox
      ? `${candidate.directory_path}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : candidate.directory_path,
    directoryUri: sourceInbox
      ? `${candidate.directory_uri}/${COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT}`
      : candidate.directory_uri,
  };
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

async function buildSourceResourceMetadata(args: {
  ctx: any;
  communityId: any;
  sourceResourceId: any;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
}) {
  const source = resolveVisibleResourceById({
    resources: args.resources,
    resourceId: normalizeIdValue(args.sourceResourceId),
  });
  if (!source) {
    return {
      source_resource_id: normalizeIdValue(args.sourceResourceId),
      available: false,
    };
  }
  return {
    source_resource_id: normalizeIdValue(source._id),
    available: true,
    ...buildResourceDirectoryEntry(source, args.moduleNameMap),
  };
}

function buildBatchReadFailure(ref: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    ref,
    reason_code: message || "community_resource_read_failed",
    message: message || "Community resource read failed.",
  };
}

async function buildBatchReadResourceResult(args: {
  ctx: any;
  communityId: any;
  ref: string;
  resources: CommunityResourceLike[];
  moduleNameMap: Map<string, string>;
  builder: boolean;
  contentLimit: number;
}) {
  const resolved = await resolveResourceByRef({
    ctx: args.ctx,
    communityId: args.communityId,
    ref: args.ref,
    resources: args.resources,
    moduleNameMap: args.moduleNameMap,
  });
  if (!resolved.ok) {
    const { ok: _ok, ...failure } = resolved;
    return {
      ok: false,
      ref: args.ref,
      ...failure,
    };
  }

  const row = await hydrateCommunityResourceBody(args.ctx, resolved.resource) ?? resolved.resource;
  const body = String(row.bodyMd ?? "");
  const contentLimit = Math.max(0, Math.floor(args.contentLimit));
  const bodySlice = body && contentLimit > 0 ? body.slice(0, contentLimit) : null;
  const source = row.sourceResourceId
    ? await buildSourceResourceMetadata({
        ctx: args.ctx,
        communityId: args.communityId,
        sourceResourceId: row.sourceResourceId,
        resources: args.resources,
        moduleNameMap: args.moduleNameMap,
      })
    : null;

  return {
    ok: true,
    ref: args.ref,
    resource: buildCommunityResourceMapResourceEntry({
      row,
      moduleNameMap: args.moduleNameMap,
      builder: args.builder,
    }),
    source,
    content: {
      body_md: bodySlice,
      offset: 0,
      limit: contentLimit,
      total_chars: body.length,
      truncated: Boolean(body && (bodySlice?.length ?? 0) < body.length),
      unavailable_reason: readContentUnavailableReason(row),
    },
  };
}

function normalizeSearchQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function resourceSearchText(row: CommunityResourceLike): string {
  return [row.title, row.bodyMd ?? "", row.url ?? ""].join("\n").toLowerCase();
}

function resourceSearchScore(row: CommunityResourceLike, query: string, terms: string[]): number {
  const text = resourceSearchText(row);
  if (!terms.every((term) => text.includes(term))) return 0;
  const title = String(row.title ?? "").toLowerCase();
  const body = String(row.bodyMd ?? "").toLowerCase();
  let score = 1;
  if (text.includes(query)) score += 4;
  if (title.includes(query)) score += 6;
  for (const term of terms) {
    if (title.includes(term)) score += 2;
    if (body.includes(term)) score += 1;
  }
  if (row.pinned) score += 0.5;
  return score;
}

function excerptAroundQuery(row: CommunityResourceLike, query: string, terms: string[]): string | null {
  const source = String(row.bodyMd ?? row.url ?? row.title ?? "").replace(/\s+/g, " ").trim();
  if (!source) return null;
  const lower = source.toLowerCase();
  const needles = [query, ...terms].filter(Boolean);
  const index = needles
    .map((needle) => lower.indexOf(needle))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 120);
  const excerpt = source.slice(start, start + COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS).trim();
  const prefix = start > 0 ? "..." : "";
  const suffix = start + COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS < source.length ? "..." : "";
  return `${prefix}${excerpt}${suffix}`;
}

export const listCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const limit = boundedToolLimit(args.limit);
    const path = String(args.path ?? "/").trim() || "/";
    const modules = await listResourceDirectoryLiveModules(ctx, args.communityId);
    const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
    const resources = await listResourceDirectoryLivePageResources(ctx, args.communityId, liveModuleIds);
    const moduleNameMap = buildModuleNameMap(modules);

    if (normalizeDirectoryToolPath(path) === "/" && !parseCommunityResourceDirectoryUri(path)) {
      return {
        ok: true,
        kind: "community_resources_list",
        path: "/",
        entries: listRootResourceDirectory({
          communityId: args.communityId,
          modules,
          resources,
          limit,
        }),
      };
    }

    const target = resolveModuleTargetFromUri({
      communityId: args.communityId,
      modules,
      ref: path,
    }) ?? resolveModuleTargetFromPath({
      communityId: args.communityId,
      modules,
      ref: path,
    });
    if (!target.ok) {
      return {
        kind: "community_resources_list",
        ...target,
      };
    }

    const rows = moduleResources(resources, target.moduleId);
    const sourceRows = rows.filter((row) => normalizeResourceRole(row.role) === "source");
    const pageRows = rows.filter((row) => normalizeResourceRole(row.role) !== "source");
    const entries = target.sourceInbox
      ? sourceRows.slice(0, limit).map((row) => buildResourceDirectoryEntry(row, moduleNameMap))
      : [
          ...pageRows.slice(0, limit).map((row) => buildResourceDirectoryEntry(row, moduleNameMap)),
          ...(sourceRows.length > 0
            ? [
                sourceInboxEntry({
                  communityId: args.communityId,
                  module: target.module,
                  sourceCount: sourceRows.length,
                }),
              ]
            : []),
        ].slice(0, limit);

    return {
      ok: true,
      kind: "community_resources_list",
      path: target.path,
      directory_uri: target.directoryUri,
      source_inbox: target.sourceInbox,
      entries,
    };
  },
});

export const mapCommunityResourcesForToolInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    perModuleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const canManage = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = boundedMapLimit(args.limit);
    const perModuleLimit = boundedMapPerModuleLimit(args.perModuleLimit);
    const modules = canManage
      ? await listResourceDirectoryModules(ctx, args.communityId)
      : await listResourceDirectoryLiveModules(ctx, args.communityId);
    const resources = canManage
      ? await listResourceDirectoryAllResources(ctx, args.communityId)
      : await listResourceDirectoryLivePageResources(
          ctx,
          args.communityId,
          new Set(modules.map((module) => normalizeIdValue(module._id))),
        );
    return buildCommunityResourceMapPayload({
      communityId: args.communityId,
      modules,
      resources,
      scope: canManage ? "builder" : "member",
      limit,
      perModuleLimit,
      nowMs: Date.now(),
    });
  },
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
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const modules = await listResourceDirectoryLiveModules(ctx, args.communityId);
    const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
    const resources = await listResourceDirectoryLivePageResources(ctx, args.communityId, liveModuleIds);
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
    const body = String(row.bodyMd ?? "");
    const offset = boundedReadOffset(args.offset);
    const limit = boundedReadLimit(args.limit);
    const bodySlice = body ? body.slice(offset, offset + limit) : null;
    const source = row.sourceResourceId
      ? await buildSourceResourceMetadata({
          ctx,
          communityId: args.communityId,
          sourceResourceId: row.sourceResourceId,
          resources,
          moduleNameMap,
        })
      : null;
    return {
      ok: true,
      kind: "community_resource_read",
      resource: buildResourceDirectoryEntry(row, moduleNameMap),
      source,
      content: {
        body_md: bodySlice,
        offset,
        limit,
        total_chars: body.length,
        truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
        unavailable_reason: readContentUnavailableReason(row),
      },
    };
  },
});

export const readCommunityResourcesForToolInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    refs: v.array(v.string()),
    maxChars: v.optional(v.number()),
    perResourceChars: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const canManage = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const refs = normalizeBatchReadRefs(args.refs);
    const maxChars = boundedBatchReadMaxChars(args.maxChars);
    const perResourceChars = boundedBatchReadPerResourceChars(args.perResourceChars, maxChars);
    const modules = canManage
      ? await listResourceDirectoryModules(ctx, args.communityId)
      : await listResourceDirectoryLiveModules(ctx, args.communityId);
    const resources = canManage
      ? await listResourceDirectoryAllResources(ctx, args.communityId)
      : await listResourceDirectoryLivePageResources(
          ctx,
          args.communityId,
          new Set(modules.map((module) => normalizeIdValue(module._id))),
        );
    const moduleNameMap = buildModuleNameMap(modules);
    let remainingChars = maxChars;
    const results = [];
    for (const ref of refs) {
      if (remainingChars <= 0) {
        results.push({
          ok: false,
          ref,
          reason_code: "community_resources_read_budget_exhausted",
          message: "The community_resources_read character budget was exhausted before this resource could be read.",
        });
        continue;
      }
      try {
        const item = await buildBatchReadResourceResult({
          ctx,
          communityId: args.communityId,
          ref,
          resources,
          moduleNameMap,
          builder: canManage,
          contentLimit: Math.min(perResourceChars, remainingChars),
        });
        if (item.ok && "content" in item && item.content) {
          remainingChars = Math.max(0, remainingChars - String(item.content.body_md ?? "").length);
        }
        results.push(item);
      } catch (error) {
        results.push(buildBatchReadFailure(ref, error));
      }
    }

    return {
      ok: true,
      kind: "community_resources_read",
      scope: canManage ? "builder" : "member",
      requested_refs: refs,
      max_chars: maxChars,
      per_resource_chars: perResourceChars,
      remaining_chars: remainingChars,
      returned_count: results.filter((item) => item.ok).length,
      resources: results,
    };
  },
});

export const searchCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const query = String(args.query ?? "").trim().toLowerCase();
    if (!query) throw new Error("community_resource_search_query_required");
    const limit = boundedToolLimit(args.limit);
    const modules = await listResourceDirectoryLiveModules(ctx, args.communityId);
    const moduleNameMap = buildModuleNameMap(modules);
    const terms = normalizeSearchQueryTerms(query);
    const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
    const liveResources = await listResourceDirectoryLivePageResources(ctx, args.communityId, liveModuleIds);
    const hydratedResources = await Promise.all(
      liveResources.map((row) => hydrateCommunityResourceBody(ctx, row).then((hydrated) => hydrated ?? row)),
    );
    const matches = hydratedResources
      .map((row) => ({
        row,
        score: resourceSearchScore(row, query, terms),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || b.row.updatedAt - a.row.updatedAt)
      .slice(0, limit)
      .map((match) => ({
        ...buildResourceDirectoryEntry(match.row, moduleNameMap),
        score: Number(match.score.toFixed(2)),
        snippet: excerptAroundQuery(match.row, query, terms),
      }));
    return {
      ok: true,
      kind: "community_resources_search",
      query: args.query,
      matches,
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
    message: `No resource builder target matched "${args.ref}". Use a module name, page/source title, id, directory_uri, or readable path from community_resource_builder_list or community_resources_map.`,
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(
      1,
      Math.min(
        COMMUNITY_RESOURCE_BUILDER_LIST_MAX_LIMIT,
        Math.floor(args.limit ?? COMMUNITY_RESOURCE_BUILDER_LIST_DEFAULT_LIMIT),
      ),
    );
    const [modules, resources] = await Promise.all([
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
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
      truncated: resources.length > limit,
      health: buildCommunityResourceBuilderHealthReportFromRows({
        modules,
        resources,
        nowMs: Date.now(),
      }),
      modules: await Promise.all(
        modules
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
          .map((row) => mapCommunityResourceModuleRow(ctx, row)),
      ),
      resources: await Promise.all(
        resources
          .slice()
          .sort(compareCommunityResources)
          .slice(0, limit)
          .map((row) => mapCompactCommunityResourceBuilderListRow(row, moduleNameMap)),
      ),
    };
  },
});

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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const ref = String(args.ref ?? args.resourceId ?? args.moduleId ?? "").trim();
    if (!ref) throw new Error("community_resource_builder_read_ref_required");

    const [modules, resources] = await Promise.all([
      ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceModuleLike[]>,
      ctx.db
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
      return {
        kind: "community_resource_builder_read",
        ...resolved,
      };
    }
    if (resolved.target_type === "resource") {
      return {
        ok: true,
        kind: "community_resource_builder_read",
        target_type: "resource",
        resource: await mapCommunityResourceRowWithBody(ctx, resolved.resource),
      };
    }
    return await buildCommunityResourceBuilderModuleReadPayload({
      ctx,
      communityId: args.communityId,
      module: resolved.module,
      sourceInbox: resolved.sourceInbox,
      resources,
      moduleNameMap,
    });
  },
});

export const stageCommunityResourceBuilderChangeset = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    summary: v.string(),
    operations: v.array(v.any()),
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
    const nowMs = Date.now();
    const summary = normalizeChangesetSummary(args.summary);
    const operations = normalizeCommunityResourceBuilderChangesetOperations(args.operations);
    const preflight = await buildCommunityResourceBuilderChangesetPreflight({
      ctx,
      communityId: args.communityId,
      operations,
      nowMs,
    });
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    const id = await ctx.db.insert("communityResourceBuilderChangesets" as any, {
      communityId: args.communityId,
      createdByUserId: userId,
      status: "staged",
      summary,
      operations,
      preflight,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
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
    };
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
    const expired =
      (changeset.status === "staged" || changeset.status === "approved") &&
      nowMs - changeset.createdAt > COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS;
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

export const approveCommunityResourceBuilderChangeset = mutation({
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
    if (changeset.status !== "staged") {
      throw new Error("community_resource_changeset_not_staged");
    }
    const nowMs = Date.now();
    if (nowMs - changeset.createdAt > COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS) {
      await ctx.db.patch(args.changesetId as any, {
        status: "expired",
        updatedAt: nowMs,
      });
      throw new Error("community_resource_changeset_expired");
    }
    const operations = normalizeCommunityResourceBuilderChangesetOperations(changeset.operations);
    const preflight = await buildCommunityResourceBuilderChangesetPreflight({
      ctx,
      communityId: args.communityId,
      operations,
      nowMs,
    });
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    await ctx.db.patch(args.changesetId as any, {
      status: "approved",
      preflight,
      updatedAt: nowMs,
      approvedAt: nowMs,
      approvedByUserId: userId,
      rejectedAt: undefined,
      rejectedByUserId: undefined,
    });
    return {
      ok: true,
      kind: "community_resource_builder_changeset_approved",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: "approved",
      summary: changeset.summary,
      operation_count: operations.length,
      preview_items: preview.preview_items,
      preview_total_count: preview.total_count,
      preview_limit: preview.preview_limit,
      warning_count: getCommunityResourceBuilderPreflightIssueCount(preflight),
      preflight,
    };
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
    if (changeset.status !== "staged" && changeset.status !== "approved") {
      throw new Error("community_resource_changeset_not_rejectable");
    }
    const nowMs = Date.now();
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
    if (changeset.status !== "approved") {
      throw new Error("community_resource_changeset_approval_required");
    }
    if (!changeset.approvedByUserId || String(changeset.approvedByUserId) !== String(userId)) {
      throw new Error("community_resource_changeset_approved_manager_required");
    }
    const nowMs = Date.now();
    if (nowMs - changeset.createdAt > COMMUNITY_RESOURCE_BUILDER_CHANGESET_TTL_MS) {
      await ctx.db.patch(args.changesetId as any, {
        status: "expired",
        updatedAt: nowMs,
      });
      throw new Error("community_resource_changeset_expired");
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
    };
  },
});

export const writeCommunityResourceBuilderResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    kind: v.string(),
    payload: v.optional(v.any()),
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
    const kind = normalizeBuilderWriteKind(args.kind);
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const nowMs = Date.now();

    if (kind === "module") {
      const rows = (await ctx.db
        .query("communityResourceModules" as any)
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect()) as CommunityResourceModuleLike[];
      const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
      const id = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        status: Object.prototype.hasOwnProperty.call(payload, "module_status")
          ? requireResourceModuleStatusForWrite(payload.module_status)
          : "draft",
        name: normalizeName(payload.name),
        descriptionMd: normalizeOptionalText(payload.description_md, 1200),
        sortOrder: nextSortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
      if (!created) throw new Error("community_resource_module_create_failed");
      return {
        ok: true,
        kind: "community_resource_builder_write",
        module: await mapCommunityResourceModuleRow(ctx, created),
      };
    }

    const role = kind === "source" ? "source" : "page";
    const status = normalizeBuilderResourceStatus({
      raw: payload.resource_status,
      confirmPublish: Boolean(payload.confirm_publish),
      defaultStatus: role === "source" ? "review" : "draft",
    });
    const moduleId = await requireValidResourceModule({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(payload.module_id),
    });
    const sourceResourceIdRaw = normalizeOptionalModuleId(payload.source_resource_id);
    const sourceResource = sourceResourceIdRaw
      ? ((await ctx.db.get(sourceResourceIdRaw as any)) as CommunityResourceLike | null)
      : null;
    if (sourceResourceIdRaw) {
      if (!sourceResource || String(sourceResource.communityId) !== String(args.communityId)) {
        throw new Error("community_source_resource_not_found");
      }
      if (normalizeResourceRole(sourceResource.role) !== "source") {
        throw new Error("community_source_resource_required");
      }
    }
    const sortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: args.communityId,
      moduleId,
    });
    const bodyMd = normalizeCommunityResourceBodyMd(payload.body_md, 20_000);
    const url = normalizeOptionalUrl(payload.url);
    const fileKey = normalizeOptionalFileKey(payload.file_key);
    const sourceIngestionStatus = role === "source" && bodyMd
      ? "ready"
      : role === "source" && (url || fileKey)
        ? "queued"
        : "not_required";
    const sourceIngestionKind = role === "source" && url
      ? "url"
      : role === "source" && fileKey
        ? "file"
        : "manual";
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: args.communityId,
      ...(moduleId ? { moduleId } : {}),
      createdByUserId: userId,
      type: normalizeResourceType(payload.type),
      role,
      status,
      ...(sourceResource ? { sourceResourceId: sourceResource._id } : {}),
      title: normalizeName(payload.title),
      url,
      fileKey,
      sourceIngestionStatus,
      sourceIngestionKind,
      pinned: Boolean(payload.pinned),
      sortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    if (bodyMd) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: args.communityId,
        resourceId: created._id,
        bodyMd,
        nowMs,
        maxChars: 20_000,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
    await upsertArchiveDocumentForResource(ctx, hydrated);
    return {
      ok: true,
      kind: "community_resource_builder_write",
      resource: await mapCommunityResourceRow(ctx, hydrated),
    };
  },
});

export const editCommunityResourceBuilderResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    expectedUpdatedAt: v.number(),
    confirmPublish: v.optional(v.boolean()),
    payload: v.optional(v.any()),
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
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const nowMs = Date.now();

    if (args.moduleId) {
      const existing = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
      if (!existing || String(existing.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      requireExpectedUpdatedAt({
        expectedUpdatedAt: args.expectedUpdatedAt,
        actualUpdatedAt: existing.updatedAt,
      });
      const moduleStatusChanged = Object.prototype.hasOwnProperty.call(payload, "module_status") &&
        normalizeResourceModuleStatus(existing.status) !== requireResourceModuleStatusForWrite(payload.module_status);
      await ctx.db.patch(existing._id as any, {
        ...(Object.prototype.hasOwnProperty.call(payload, "name")
          ? { name: normalizeName(payload.name) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "description_md")
          ? { descriptionMd: normalizeOptionalText(payload.description_md, 1200) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "module_status")
          ? { status: requireResourceModuleStatusForWrite(payload.module_status) }
          : {}),
        updatedAt: nowMs,
      });
      if (moduleStatusChanged) {
        await syncArchiveDocumentsForModule({
          ctx,
          communityId: args.communityId,
          moduleId: existing._id,
        });
      }
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceModuleLike | null;
      if (!updated) throw new Error("community_resource_module_not_found");
      return {
        ok: true,
        kind: "community_resource_builder_edit",
        module: await mapCommunityResourceModuleRow(ctx, updated),
      };
    }

    if (!args.resourceId) throw new Error("community_resource_builder_edit_ref_required");
    const existing = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!existing || String(existing.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_not_found");
    }
    requireExpectedUpdatedAt({
      expectedUpdatedAt: args.expectedUpdatedAt,
      actualUpdatedAt: existing.updatedAt,
    });
    const nextStatus = Object.prototype.hasOwnProperty.call(payload, "resource_status")
      ? normalizeBuilderResourceStatus({
          raw: payload.resource_status,
          existingStatus: existing.status,
          confirmPublish: Boolean(args.confirmPublish),
          defaultStatus: normalizeResourceRole(existing.role) === "source" ? "review" : "draft",
        })
      : normalizeResourceStatus(existing.status);
    const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
      ? payload.module_id
      : existing.moduleId;
    const nextModuleId = await requireValidResourceModule({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
    });
    const sourceResourceIdRaw = Object.prototype.hasOwnProperty.call(payload, "source_resource_id")
      ? normalizeOptionalModuleId(payload.source_resource_id)
      : normalizeIdValue(existing.sourceResourceId ?? "");
    const sourceResource = sourceResourceIdRaw
      ? ((await ctx.db.get(sourceResourceIdRaw as any)) as CommunityResourceLike | null)
      : null;
    if (sourceResourceIdRaw) {
      if (!sourceResource || String(sourceResource.communityId) !== String(args.communityId)) {
        throw new Error("community_source_resource_not_found");
      }
      if (normalizeResourceRole(sourceResource.role) !== "source") {
        throw new Error("community_source_resource_required");
      }
    }
    const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
    const nextSortOrder = moduleChanged
      ? await getNextResourceSortOrder({
          ctx,
          communityId: args.communityId,
          moduleId: nextModuleId,
          excludeResourceId: existing._id,
        })
      : existing.sortOrder;
    const bodyChanged = Object.prototype.hasOwnProperty.call(payload, "body_md");
    const urlChanged = Object.prototype.hasOwnProperty.call(payload, "url");
    const fileChanged = Object.prototype.hasOwnProperty.call(payload, "file_key");
    const nextBodyMd = bodyChanged ? normalizeCommunityResourceBodyMd(payload.body_md, 20_000) : null;
    const nextBodyChars = bodyChanged ? String(nextBodyMd ?? "").trim().length : communityResourceBodyChars(existing);
    const nextUrl = urlChanged ? normalizeOptionalUrl(payload.url) : existing.url;
    const nextFileKey = fileChanged ? normalizeOptionalFileKey(payload.file_key) : existing.fileKey;
    const sourceIngestionPatch =
      normalizeResourceRole(existing.role) === "source"
        ? {
            sourceIngestionStatus: bodyChanged && nextBodyChars > 0
              ? "ready"
              : urlChanged || fileChanged
                ? "queued"
                : normalizeResourceSourceIngestionStatus({
                    ...existing,
                    bodyMd: bodyChanged ? nextBodyMd ?? undefined : existing.bodyMd,
                    bodyChars: nextBodyChars,
                    url: nextUrl,
                    fileKey: nextFileKey,
                  }),
            sourceIngestionKind: nextUrl
              ? "url"
              : nextFileKey
                ? "file"
                : "manual",
          }
        : {};

    await ctx.db.patch(existing._id as any, {
      ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
      ...(Object.prototype.hasOwnProperty.call(payload, "type") ? { type: normalizeResourceType(payload.type) } : {}),
      status: nextStatus,
      ...(sourceResource ? { sourceResourceId: sourceResource._id } : { sourceResourceId: undefined }),
      ...(Object.prototype.hasOwnProperty.call(payload, "title") ? { title: normalizeName(payload.title) } : {}),
      ...(urlChanged ? { url: nextUrl } : {}),
      ...(fileChanged ? { fileKey: nextFileKey } : {}),
      ...sourceIngestionPatch,
      ...(Object.prototype.hasOwnProperty.call(payload, "pinned") ? { pinned: Boolean(payload.pinned) } : {}),
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
        maxChars: 20_000,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    await upsertArchiveDocumentForResource(ctx, hydrated);
    return {
      ok: true,
      kind: "community_resource_builder_edit",
      resource: await mapCommunityResourceRow(ctx, hydrated),
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
          maxChars: 20_000,
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
        updatedAt: nowMs,
      });
      if (previousBannerStorageId && String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")) {
        await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
      }
      if (moduleStatusChanged) {
        await syncArchiveDocumentsForModule({
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

    const nowMs = Date.now();
    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", module.communityId).eq("moduleId", module._id),
      )
      .collect()) as CommunityResourceLike[];

    const movedResources = resources.slice().sort(compareCommunityResources);
    const nextLegacySortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: module.communityId,
      moduleId: null,
    });

    await Promise.all(
      movedResources.map(async (resource, index) => {
        await ctx.db.patch(resource._id as any, {
          moduleId: undefined,
          sortOrder: nextLegacySortOrder + index * 1000,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(resource._id as any)) as CommunityResourceLike | null;
        if (updated) await upsertArchiveDocumentForResource(ctx, updated);
      }),
    );

    if (module.bannerStorageId) {
      await maybeDeleteStorageAsset(ctx, module.bannerStorageId);
    }
    await ctx.db.delete(module._id as any);
    return { ok: true, movedResources: resources.length };
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
    return await Promise.all(
      rows
        .slice()
        .filter((row) => canManageResources || communityResourceIsLiveModulePage(row, liveModuleIds))
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityResourceRowWithBody(ctx, row, userIdCache, moduleNameCache)),
    );
  },
});

export const countCommunityResources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const sinceMs = parseIsoMs(args.sinceIso);
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    if (sinceMs === null) return rows.length;
    return rows.reduce((count, row) => count + (row.createdAt >= sinceMs ? 1 : 0), 0);
  },
});

async function getGoogleDriveConnectionRow(ctx: any, userId: any): Promise<UserSourceIntegrationConnectionRow | null> {
  return ((await ctx.db
    .query("userSourceIntegrationConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", userId).eq("provider", GOOGLE_DRIVE_SOURCE_PROVIDER),
    )
    .first()) as UserSourceIntegrationConnectionRow | null) ?? null;
}

async function getGitHubConnectionRow(ctx: any, userId: any): Promise<UserSourceIntegrationConnectionRow | null> {
  return ((await ctx.db
    .query("userSourceIntegrationConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", userId).eq("provider", GITHUB_SOURCE_PROVIDER),
    )
    .first()) as UserSourceIntegrationConnectionRow | null) ?? null;
}

function toPublicGoogleDriveConnection(row: UserSourceIntegrationConnectionRow | null) {
  return {
    provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
    auth_kind: "oauth_tokens",
    connected: Boolean(row),
    email: normalizeSourceIntegrationString(row?.email, 320) || null,
    account_id: normalizeSourceIntegrationString(row?.accountId, 320) || null,
    scope: normalizeSourceIntegrationString(row?.scope, 2_000) || null,
    access_token_expires_at:
      typeof row?.accessTokenExpiresAt === "number" && Number.isFinite(row.accessTokenExpiresAt)
        ? toIsoString(row.accessTokenExpiresAt)
        : null,
    validated_at:
      typeof row?.validatedAt === "number" && Number.isFinite(row.validatedAt)
        ? toIsoString(row.validatedAt)
        : null,
    updated_at:
      typeof row?.updatedAt === "number" && Number.isFinite(row.updatedAt)
        ? toIsoString(row.updatedAt)
        : null,
  };
}

function toPublicGitHubConnection(row: UserSourceIntegrationConnectionRow | null) {
  return {
    provider: GITHUB_SOURCE_PROVIDER,
    auth_kind: "oauth_tokens",
    connected: Boolean(row),
    email: normalizeSourceIntegrationString(row?.email, 320) || null,
    account_id: normalizeSourceIntegrationString(row?.accountId, 320) || null,
    login: normalizeSourceIntegrationString(row?.accountLogin, 320) || null,
    scope: normalizeSourceIntegrationString(row?.scope, 2_000) || null,
    access_token_expires_at:
      typeof row?.accessTokenExpiresAt === "number" && Number.isFinite(row.accessTokenExpiresAt)
        ? toIsoString(row.accessTokenExpiresAt)
        : null,
    validated_at:
      typeof row?.validatedAt === "number" && Number.isFinite(row.validatedAt)
        ? toIsoString(row.validatedAt)
        : null,
    updated_at:
      typeof row?.updatedAt === "number" && Number.isFinite(row.updatedAt)
        ? toIsoString(row.updatedAt)
        : null,
  };
}

async function resolveCommunityLaunchKnowledgeSourceCredentialStatus(
  ctx: any,
  row: CommunityResourceLike,
  cache: Map<string, boolean>,
): Promise<"available" | "missing"> {
  const provider = normalizeSourceIntegrationString(row.sourceExternalProvider, 80);
  if (provider !== GOOGLE_DRIVE_SOURCE_PROVIDER && provider !== GITHUB_SOURCE_PROVIDER) {
    return "available";
  }
  const connectionUserId = row.sourceExternalConnectionUserId ?? row.createdByUserId;
  const connectionUserIdKey = normalizeIdValue(connectionUserId);
  if (!connectionUserIdKey) return "missing";
  const cacheKey = `${provider}:${connectionUserIdKey}`;
  const cached = cache.get(cacheKey);
  if (typeof cached === "boolean") return cached ? "available" : "missing";
  const connection = provider === GOOGLE_DRIVE_SOURCE_PROVIDER
    ? await getGoogleDriveConnectionRow(ctx, connectionUserId)
    : provider === GITHUB_SOURCE_PROVIDER
      ? await getGitHubConnectionRow(ctx, connectionUserId)
      : null;
  const isAvailable = Boolean(connection);
  cache.set(cacheKey, isAvailable);
  return isAvailable ? "available" : "missing";
}

async function mapCommunityLaunchKnowledgeSourceRow(
  ctx: any,
  row: CommunityResourceLike,
  credentialStatusCache: Map<string, boolean>,
) {
  const provider = normalizeSourceIntegrationString(row.sourceExternalProvider, 80);
  const sourceIngestionKind = normalizeResourceSourceIngestionKind(row);
  const sourceIngestionStatus = normalizeResourceSourceIngestionStatus(row);
  const credentialStatus = await resolveCommunityLaunchKnowledgeSourceCredentialStatus(
    ctx,
    row,
    credentialStatusCache,
  );
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
    const credentialStatusCache = new Map<string, boolean>();
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
        .map((row) => mapCommunityLaunchKnowledgeSourceRow(ctx, row, credentialStatusCache)),
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

export const getGoogleDriveSourceConnectionForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getGoogleDriveConnectionRow(ctx, args.userId);
  },
});

export const getGoogleDriveSourceAuthStateByStateInternal = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const state = normalizeSourceIntegrationString(args.state, 500);
    if (!state) return null;
    const row = ((await ctx.db
      .query("userSourceIntegrationAuthStates" as any)
      .withIndex("by_state", (q: any) => q.eq("state", state))
      .first()) as UserSourceIntegrationAuthStateRow | null) ?? null;
    return row?.provider === GOOGLE_DRIVE_SOURCE_PROVIDER ? row : null;
  },
});

export const insertGoogleDriveSourceAuthStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnToPath: v.string(),
    returnContextKind: v.optional(v.literal("community_launch_knowledge")),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("userSourceIntegrationAuthStates" as any, {
      userId: args.userId,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      communityId: args.communityId,
      state: normalizeSourceIntegrationString(args.state, 500),
      codeVerifier: normalizeSourceIntegrationString(args.codeVerifier, 500),
      redirectUri: normalizeSourceIntegrationString(args.redirectUri, 2_000),
      returnToPath: normalizeReturnToPath(args.returnToPath),
      returnContextKind: normalizeSourceIntegrationReturnContextKind(args.returnContextKind) ?? undefined,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const patchGoogleDriveSourceAuthStateCallbackInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    callbackCodeEncryptedHex: v.string(),
    callbackCodeIvHex: v.string(),
    callbackCodeVersion: v.number(),
    finalizeTokenHash: v.string(),
    callbackReceivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      callbackCodeEncryptedHex: args.callbackCodeEncryptedHex,
      callbackCodeIvHex: args.callbackCodeIvHex,
      callbackCodeVersion: args.callbackCodeVersion,
      finalizeTokenHash: args.finalizeTokenHash,
      callbackReceivedAt: args.callbackReceivedAt,
    });
    return { ok: true };
  },
});

export const claimGoogleDriveSourceOAuthFinalizeInternal = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    finalizeTokenHash: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = ((await ctx.db
      .query("userSourceIntegrationAuthStates" as any)
      .withIndex("by_state", (q: any) => q.eq("state", normalizeSourceIntegrationString(args.state, 500)))
      .first()) as UserSourceIntegrationAuthStateRow | null) ?? null;
    if (!row) {
      return {
        status: "missing",
        result: {
          ok: false,
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          error_message: "Google Drive connection expired. Start again.",
        },
      };
    }
    const existingResult = parseGoogleDriveOAuthFinalizeResult(row.finalizeResultJson);
    if (row.finalizeStatus === "completed" || row.finalizeStatus === "failed") {
      return {
        status: row.finalizeStatus,
        result: existingResult ?? {
          ok: false,
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          error_message: row.finalizeErrorMessage ?? "Google Drive connection could not be finalized.",
        },
      };
    }
    if (String(row.userId) !== String(args.userId)) {
      return {
        status: "wrong_user",
        result: {
          ok: false,
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          error_message: "Google Drive must be finalized by the Polynet account that started it.",
        },
      };
    }
    if (args.nowMs > Number(row.expiresAt ?? 0)) {
      return {
        status: "expired",
        result: {
          ok: false,
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          error_message: "Google Drive connection expired. Start again.",
        },
      };
    }
    if (normalizeSourceIntegrationString(row.finalizeTokenHash, 200) !== args.finalizeTokenHash) {
      throw new Error("google_drive_oauth_finalize_token_mismatch");
    }
    if (
      row.finalizeStatus === "processing" &&
      typeof row.finalizeStartedAt === "number" &&
      row.finalizeStartedAt > args.nowMs - GOOGLE_DRIVE_SOURCE_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS
    ) {
      return {
        status: "processing",
        result: {
          ok: false,
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          error_message: "Google Drive connection is finishing.",
        },
      };
    }
    await ctx.db.patch(row._id as any, {
      finalizeStatus: "processing",
      finalizeStartedAt: args.nowMs,
    });
    return { status: "claimed", stateId: row._id };
  },
});

export const completeGoogleDriveSourceOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    resultJson: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      finalizeStatus: "completed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: undefined,
    });
    return { ok: true };
  },
});

export const failGoogleDriveSourceOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    resultJson: v.string(),
    errorMessage: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      finalizeStatus: "failed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: args.errorMessage,
    });
    return { ok: true };
  },
});

export const upsertGoogleDriveSourceConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    accountId: v.optional(v.string()),
    email: v.optional(v.string()),
    scope: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    validatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getGoogleDriveConnectionRow(ctx, args.userId);
    const patch = {
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      authKind: "oauth_tokens" as const,
      encryptedSecretHex: args.encryptedSecretHex,
      secretIvHex: args.secretIvHex,
      secretVersion: args.secretVersion,
      accountId: normalizeSourceIntegrationString(args.accountId, 320) || undefined,
      email: normalizeSourceIntegrationString(args.email, 320) || undefined,
      scope: normalizeSourceIntegrationString(args.scope, 2_000) || undefined,
      accessTokenExpiresAt:
        typeof args.accessTokenExpiresAt === "number" && Number.isFinite(args.accessTokenExpiresAt)
          ? Math.floor(args.accessTokenExpiresAt)
          : undefined,
      validatedAt: args.validatedAt,
      updatedAt: args.nowMs,
    };
    if (!existing) {
      const id = await ctx.db.insert("userSourceIntegrationConnections" as any, {
        userId: args.userId,
        ...patch,
        createdAt: args.nowMs,
      });
      return { id };
    }
    await ctx.db.patch(existing._id as any, patch);
    return { id: existing._id };
  },
});

export const disconnectGoogleDriveSourceConnection = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const row = await getGoogleDriveConnectionRow(ctx, userId);
    if (row?._id) {
      await ctx.db.delete(row._id as any);
    }
    return {
      ok: true,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      connection: toPublicGoogleDriveConnection(null),
    };
  },
});

export const getGitHubSourceConnectionForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getGitHubConnectionRow(ctx, args.userId);
  },
});

export const getGitHubSourceAuthStateByStateInternal = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const state = normalizeSourceIntegrationString(args.state, 500);
    if (!state) return null;
    const row = ((await ctx.db
      .query("userSourceIntegrationAuthStates" as any)
      .withIndex("by_state", (q: any) => q.eq("state", state))
      .first()) as UserSourceIntegrationAuthStateRow | null) ?? null;
    return row?.provider === GITHUB_SOURCE_PROVIDER ? row : null;
  },
});

export const insertGitHubSourceAuthStateInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnToPath: v.string(),
    returnContextKind: v.optional(v.literal("community_launch_knowledge")),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("userSourceIntegrationAuthStates" as any, {
      userId: args.userId,
      provider: GITHUB_SOURCE_PROVIDER,
      communityId: args.communityId,
      state: normalizeSourceIntegrationString(args.state, 500),
      codeVerifier: normalizeSourceIntegrationString(args.codeVerifier, 500),
      redirectUri: normalizeSourceIntegrationString(args.redirectUri, 2_000),
      returnToPath: normalizeReturnToPath(args.returnToPath),
      returnContextKind: normalizeSourceIntegrationReturnContextKind(args.returnContextKind) ?? undefined,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const patchGitHubSourceAuthStateCallbackInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    callbackCodeEncryptedHex: v.string(),
    callbackCodeIvHex: v.string(),
    callbackCodeVersion: v.number(),
    finalizeTokenHash: v.string(),
    callbackReceivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      callbackCodeEncryptedHex: args.callbackCodeEncryptedHex,
      callbackCodeIvHex: args.callbackCodeIvHex,
      callbackCodeVersion: args.callbackCodeVersion,
      finalizeTokenHash: args.finalizeTokenHash,
      callbackReceivedAt: args.callbackReceivedAt,
    });
    return { ok: true };
  },
});

export const claimGitHubSourceOAuthFinalizeInternal = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    finalizeTokenHash: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = ((await ctx.db
      .query("userSourceIntegrationAuthStates" as any)
      .withIndex("by_state", (q: any) => q.eq("state", normalizeSourceIntegrationString(args.state, 500)))
      .first()) as UserSourceIntegrationAuthStateRow | null) ?? null;
    if (!row || row.provider !== GITHUB_SOURCE_PROVIDER) {
      return {
        status: "missing",
        result: {
          ok: false,
          provider: GITHUB_SOURCE_PROVIDER,
          error_message: "GitHub connection expired. Start again.",
        },
      };
    }
    const existingResult = parseGitHubOAuthFinalizeResult(row.finalizeResultJson);
    if (row.finalizeStatus === "completed" || row.finalizeStatus === "failed") {
      return {
        status: row.finalizeStatus,
        result: existingResult ?? {
          ok: false,
          provider: GITHUB_SOURCE_PROVIDER,
          error_message: row.finalizeErrorMessage ?? "GitHub connection could not be finalized.",
        },
      };
    }
    if (String(row.userId) !== String(args.userId)) {
      return {
        status: "wrong_user",
        result: {
          ok: false,
          provider: GITHUB_SOURCE_PROVIDER,
          error_message: "GitHub must be finalized by the Polynet account that started it.",
        },
      };
    }
    if (args.nowMs > Number(row.expiresAt ?? 0)) {
      return {
        status: "expired",
        result: {
          ok: false,
          provider: GITHUB_SOURCE_PROVIDER,
          error_message: "GitHub connection expired. Start again.",
        },
      };
    }
    if (normalizeSourceIntegrationString(row.finalizeTokenHash, 200) !== args.finalizeTokenHash) {
      throw new Error("github_oauth_finalize_token_mismatch");
    }
    if (
      row.finalizeStatus === "processing" &&
      typeof row.finalizeStartedAt === "number" &&
      row.finalizeStartedAt > args.nowMs - GITHUB_SOURCE_OAUTH_FINALIZE_PROCESSING_TIMEOUT_MS
    ) {
      return {
        status: "processing",
        result: {
          ok: false,
          provider: GITHUB_SOURCE_PROVIDER,
          error_message: "GitHub connection is finishing.",
        },
      };
    }
    await ctx.db.patch(row._id as any, {
      finalizeStatus: "processing",
      finalizeStartedAt: args.nowMs,
    });
    return { status: "claimed", stateId: row._id };
  },
});

export const completeGitHubSourceOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    resultJson: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      finalizeStatus: "completed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: undefined,
    });
    return { ok: true };
  },
});

export const failGitHubSourceOAuthFinalizeInternal = internalMutation({
  args: {
    stateId: v.id("userSourceIntegrationAuthStates"),
    resultJson: v.string(),
    errorMessage: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId as any, {
      finalizeStatus: "failed",
      finalizeCompletedAt: args.nowMs,
      finalizeResultJson: args.resultJson,
      finalizeErrorMessage: args.errorMessage,
    });
    return { ok: true };
  },
});

export const upsertGitHubSourceConnectionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    accountId: v.optional(v.string()),
    accountLogin: v.optional(v.string()),
    email: v.optional(v.string()),
    scope: v.optional(v.string()),
    validatedAt: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await getGitHubConnectionRow(ctx, args.userId);
    const patch = {
      provider: GITHUB_SOURCE_PROVIDER,
      authKind: "oauth_tokens" as const,
      encryptedSecretHex: args.encryptedSecretHex,
      secretIvHex: args.secretIvHex,
      secretVersion: args.secretVersion,
      accountId: normalizeSourceIntegrationString(args.accountId, 320) || undefined,
      accountLogin: normalizeSourceIntegrationString(args.accountLogin, 320) || undefined,
      email: normalizeSourceIntegrationString(args.email, 320) || undefined,
      scope: normalizeSourceIntegrationString(args.scope, 2_000) || undefined,
      accessTokenExpiresAt: undefined,
      validatedAt: args.validatedAt,
      updatedAt: args.nowMs,
    };
    if (!existing) {
      const id = await ctx.db.insert("userSourceIntegrationConnections" as any, {
        userId: args.userId,
        ...patch,
        createdAt: args.nowMs,
      });
      return { id };
    }
    await ctx.db.patch(existing._id as any, patch);
    return { id: existing._id };
  },
});

export const disconnectGitHubSourceConnection = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const row = await getGitHubConnectionRow(ctx, userId);
    if (row?._id) {
      await ctx.db.delete(row._id as any);
    }
    return {
      ok: true,
      provider: GITHUB_SOURCE_PROVIDER,
      connection: toPublicGitHubConnection(null),
    };
  },
});

async function resolveGitHubAccessToken(ctx: any, userId: any): Promise<{
  accessToken: string;
  bundle: StoredGitHubAuthV1;
  connection: UserSourceIntegrationConnectionRow;
}> {
  const row = (await ctx.runQuery(
    (internal as any).communityResources.getGitHubSourceConnectionForUserInternal,
    { userId },
  )) as UserSourceIntegrationConnectionRow | null;
  if (!row) throw new Error("github_connection_required");
  const bundle = parseStoredGitHubAuth(await decryptStoredSecret(row));
  if (!bundle) throw new Error("github_connection_invalid");
  return { accessToken: bundle.accessToken, bundle, connection: row };
}

async function extractSourceTextFromGitHub(args: {
  ctx: any;
  userId: any;
  externalId: string;
}): Promise<{
  title: string | null;
  text: string;
  contentType: string;
  htmlUrl: string | null;
  size: number | null;
}> {
  const parsed = parseGitHubFileExternalId(args.externalId);
  if (!parsed) throw new Error("github_file_id_required");
  const { accessToken } = await resolveGitHubAccessToken(args.ctx, args.userId);
  return await fetchGitHubFileText({
    accessToken,
    repoFullName: parsed.repoFullName,
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    path: parsed.path,
  });
}

async function resolveFreshGoogleDriveAccessToken(ctx: any, userId: any): Promise<{
  accessToken: string;
  bundle: StoredGoogleDriveAuthV1;
  connection: UserSourceIntegrationConnectionRow;
}> {
  const row = (await ctx.runQuery(
    (internal as any).communityResources.getGoogleDriveSourceConnectionForUserInternal,
    { userId },
  )) as UserSourceIntegrationConnectionRow | null;
  if (!row) throw new Error("google_drive_connection_required");
  const bundle = parseStoredGoogleDriveAuth(await decryptStoredSecret(row));
  if (!bundle) throw new Error("google_drive_connection_invalid");
  const nowMs = Date.now();
  if (!bundle.expiresAt || bundle.expiresAt > nowMs + GOOGLE_DRIVE_SOURCE_REFRESH_WINDOW_MS) {
    return { accessToken: bundle.accessToken, bundle, connection: row };
  }
  const clientId = normalizeSourceIntegrationString(readEnv("ARX_GOOGLE_DRIVE_OAUTH_CLIENT_ID"), 500);
  const clientSecret = normalizeSourceIntegrationString(readEnv("ARX_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"), 2_000);
  if (!clientId || !clientSecret) throw new Error("google_drive_oauth_client_not_configured");
  const refreshed = await refreshGoogleDriveTokens({ bundle, clientId, clientSecret, nowMs });
  const encrypted = await encryptSecret(encodeStoredGoogleDriveAuth(refreshed));
  await ctx.runMutation((internal as any).communityResources.upsertGoogleDriveSourceConnectionInternal, {
    userId,
    ...encrypted,
    accountId: row.accountId ?? undefined,
    email: row.email ?? undefined,
    scope: refreshed.scope ?? row.scope ?? undefined,
    accessTokenExpiresAt: refreshed.expiresAt ?? undefined,
    validatedAt: nowMs,
    nowMs,
  });
  const updated = {
    ...row,
    scope: refreshed.scope ?? row.scope,
    accessTokenExpiresAt: refreshed.expiresAt ?? row.accessTokenExpiresAt,
    validatedAt: nowMs,
    updatedAt: nowMs,
  };
  return { accessToken: refreshed.accessToken, bundle: refreshed, connection: updated };
}

async function extractSourceTextFromGoogleDrive(args: {
  ctx: any;
  userId: any;
  fileId: string;
  filename: string;
  mimeType: string;
  webUrl: string | null;
}): Promise<{
  title: string | null;
  text: string;
  contentType: string;
}> {
  const fileId = normalizeSourceIntegrationString(args.fileId, 500);
  if (!fileId) throw new Error("google_drive_file_id_required");
  const mimeType = normalizeSourceIntegrationString(args.mimeType, 300).toLowerCase();
  if (!isSupportedGoogleDriveSourceMimeType(mimeType, args.filename)) {
    throw new Error("google_drive_file_content_type_not_supported");
  }
  const { accessToken } = await resolveFreshGoogleDriveAccessToken(args.ctx, args.userId);
  const extracted = await fetchGoogleDriveText({
    accessToken,
    fileId,
    mimeType,
    filename: args.filename,
  });
  return {
    title: args.filename || null,
    text: extracted.text,
    contentType: extracted.contentType,
  };
}

export const getGoogleDriveSourceConnectionStatus = query({
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
    const row = await getGoogleDriveConnectionRow(ctx, userId);
    return toPublicGoogleDriveConnection(row);
  },
});

export const beginGoogleDriveSourceOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    returnToPath: v.optional(v.string()),
    callbackBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const clientId = normalizeSourceIntegrationString(readEnv("ARX_GOOGLE_DRIVE_OAUTH_CLIENT_ID"), 500);
    if (!clientId) throw new Error("google_drive_oauth_client_not_configured");
    const redirectUri = buildGoogleDriveOAuthRedirectUri(args.callbackBaseUrl);
    const codeVerifier = randomBase64Url(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomBase64Url(32);
    const nowMs = Date.now();
    const returnToPath = normalizeReturnToPath(args.returnToPath);
    await ctx.runMutation((internal as any).communityResources.insertGoogleDriveSourceAuthStateInternal, {
      userId,
      communityId: args.communityId,
      state,
      codeVerifier,
      redirectUri,
      returnToPath,
      returnContextKind: resolveSourceIntegrationReturnContextKind(returnToPath) ?? undefined,
      createdAt: nowMs,
      expiresAt: nowMs + GOOGLE_DRIVE_SOURCE_OAUTH_STATE_TTL_MS,
    });
    const authorizationUrl = new URL(GOOGLE_DRIVE_OAUTH_AUTHORIZE_URL);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", GOOGLE_DRIVE_SOURCE_SCOPES);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    return {
      ok: true,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      authorize_url: authorizationUrl.toString(),
      redirect_uri: redirectUri,
    };
  },
});

export const completeGoogleDriveSourceOAuthCallbackInternal = internalAction({
  args: {
    state: v.string(),
    code: v.optional(v.string()),
    oauthError: v.optional(v.string()),
    oauthErrorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const state = normalizeSourceIntegrationString(args.state, 500);
    const row = (await ctx.runQuery(
      (internal as any).communityResources.getGoogleDriveSourceAuthStateByStateInternal,
      { state },
    )) as UserSourceIntegrationAuthStateRow | null;
    if (!row) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: "/discover",
          status: "error",
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          message: "Google Drive connection expired. Start again.",
        }),
      };
    }
    if (Date.now() > Number(row.expiresAt ?? 0)) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message: "Google Drive connection expired. Start again.",
        }),
      };
    }
    const oauthError = normalizeSourceIntegrationString(args.oauthError, 300);
    if (oauthError) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message:
            normalizeSourceIntegrationString(args.oauthErrorDescription, 300) ||
            oauthError ||
            "Google Drive authorization was denied.",
        }),
      };
    }
    const code = normalizeSourceIntegrationString(args.code, 4_000);
    if (!code) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message: "Google Drive callback did not include an authorization code.",
        }),
      };
    }
    const encryptedCode = await encryptSecret(code);
    const finalizeToken = randomBase64Url(32);
    await ctx.runMutation((internal as any).communityResources.patchGoogleDriveSourceAuthStateCallbackInternal, {
      stateId: row._id,
      callbackCodeEncryptedHex: encryptedCode.encryptedSecretHex,
      callbackCodeIvHex: encryptedCode.secretIvHex,
      callbackCodeVersion: encryptedCode.secretVersion,
      finalizeTokenHash: await sha256HexText(finalizeToken),
      callbackReceivedAt: Date.now(),
    });
    return {
      redirect_url: buildSourceIntegrationRedirectUrl({
        returnToPath: row.returnToPath,
        status: "pending",
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
        state,
        finalizeToken,
      }),
    };
  },
});

export const finalizeGoogleDriveSourceOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    state: v.string(),
    finalizeToken: v.string(),
  },
  handler: async (ctx, args): Promise<GoogleDriveOAuthFinalizeResult> => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    const state = normalizeSourceIntegrationString(args.state, 500);
    const finalizeToken = normalizeSourceIntegrationString(args.finalizeToken, 500);
    const row = (await ctx.runQuery(
      (internal as any).communityResources.getGoogleDriveSourceAuthStateByStateInternal,
      { state },
    )) as UserSourceIntegrationAuthStateRow | null;
    if (!row) {
      return {
        ok: false,
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        error_message: "Google Drive connection expired. Start again.",
      };
    }
    const sourceCommunityId = normalizeSourceIntegrationString(row.communityId, 200) || null;
    const sourceReturnContextKind = normalizeSourceIntegrationReturnContextKind(row.returnContextKind);
    if (String(row.userId) !== String(userId)) {
      return {
        ok: false,
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "Google Drive must be finalized by the Polynet account that started it.",
      };
    }
    const expectedFinalizeTokenHash = normalizeSourceIntegrationString(row.finalizeTokenHash, 200);
    const actualFinalizeTokenHash = finalizeToken ? await sha256HexText(finalizeToken) : "";
    if (!expectedFinalizeTokenHash || expectedFinalizeTokenHash !== actualFinalizeTokenHash) {
      throw new Error("google_drive_oauth_finalize_token_mismatch");
    }
    const claim = (await ctx.runMutation(
      (internal as any).communityResources.claimGoogleDriveSourceOAuthFinalizeInternal,
      {
        state,
        userId,
        finalizeTokenHash: actualFinalizeTokenHash,
        nowMs: Date.now(),
      },
    )) as { status?: string; stateId?: unknown; result?: GoogleDriveOAuthFinalizeResult } | null;
    if (claim?.status !== "claimed") {
      const result = claim?.result ?? {
        ok: false,
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        error_message: "Google Drive connection could not be finalized.",
      };
      return {
        ...result,
        community_id: result.community_id ?? sourceCommunityId,
        return_context_kind: result.return_context_kind ?? sourceReturnContextKind,
      };
    }
    if (!row.callbackCodeEncryptedHex || !row.callbackCodeIvHex) {
      return {
        ok: false,
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "Google Drive callback has not completed yet.",
      };
    }
    const code = normalizeSourceIntegrationString(
      await decryptStoredSecret({
        encryptedSecretHex: row.callbackCodeEncryptedHex,
        secretIvHex: row.callbackCodeIvHex,
      }),
      4_000,
    );
    const clientId = normalizeSourceIntegrationString(readEnv("ARX_GOOGLE_DRIVE_OAUTH_CLIENT_ID"), 500);
    const clientSecret = normalizeSourceIntegrationString(readEnv("ARX_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"), 2_000);
    if (!clientId || !clientSecret) throw new Error("google_drive_oauth_client_not_configured");
    let tokenBundle: StoredGoogleDriveAuthV1;
    try {
      tokenBundle = await exchangeGoogleDriveCodeForTokens({
        code,
        redirectUri: row.redirectUri,
        codeVerifier: row.codeVerifier,
        clientId,
        clientSecret,
        nowMs: Date.now(),
      });
    } catch {
      const result = {
        ok: false,
        provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "Google Drive authorization could not be finalized. Start again.",
      } satisfies GoogleDriveOAuthFinalizeResult;
      await ctx.runMutation((internal as any).communityResources.failGoogleDriveSourceOAuthFinalizeInternal, {
        stateId: row._id,
        resultJson: stringifyGoogleDriveOAuthFinalizeResult(result),
        errorMessage: result.error_message,
        nowMs: Date.now(),
      });
      return result;
    }
    const encrypted = await encryptSecret(encodeStoredGoogleDriveAuth(tokenBundle));
    const email = jwtStringClaim(tokenBundle.idToken, "email");
    const accountId = jwtStringClaim(tokenBundle.idToken, "sub");
    const nowMs = Date.now();
    await ctx.runMutation((internal as any).communityResources.upsertGoogleDriveSourceConnectionInternal, {
      userId,
      ...encrypted,
      accountId: accountId ?? undefined,
      email: email ?? undefined,
      scope: tokenBundle.scope ?? undefined,
      accessTokenExpiresAt: tokenBundle.expiresAt ?? undefined,
      validatedAt: nowMs,
      nowMs,
    });
    const result = {
      ok: true,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      community_id: sourceCommunityId,
      return_context_kind: sourceReturnContextKind,
      email,
    } satisfies GoogleDriveOAuthFinalizeResult;
    await ctx.runMutation((internal as any).communityResources.completeGoogleDriveSourceOAuthFinalizeInternal, {
      stateId: row._id,
      resultJson: stringifyGoogleDriveOAuthFinalizeResult(result),
      nowMs: Date.now(),
    });
    return result;
  },
});

export const listGoogleDriveSourceFiles = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    folderId: v.optional(v.string()),
    pageToken: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const { accessToken, connection } = await resolveFreshGoogleDriveAccessToken(ctx, userId);
    const url = new URL(`${GOOGLE_DRIVE_API_BASE_URL}/files`);
    const search = normalizeSourceIntegrationString(args.query, 120);
    const folderId = normalizeSourceIntegrationString(args.folderId, 300);
    const pageToken = normalizeSourceIntegrationString(args.pageToken, 2_000);
    const queryParts = [
      "trashed = false",
    ];
    if (search) {
      queryParts.push(`name contains '${escapeGoogleDriveQueryLiteral(search)}'`);
    } else {
      queryParts.push(`'${escapeGoogleDriveQueryLiteral(folderId || "root")}' in parents`);
    }
    url.searchParams.set("q", queryParts.join(" and "));
    url.searchParams.set("pageSize", String(GOOGLE_DRIVE_SOURCE_LIST_PAGE_SIZE));
    url.searchParams.set("orderBy", search ? "folder,name" : "folder,modifiedTime desc");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    const payload = await fetchGoogleDriveJson({ accessToken, url: url.toString() });
    const files = Array.isArray(payload.files)
      ? payload.files
          .map(mapGoogleDriveFileCandidate)
          .filter((file): file is GoogleDriveFileCandidate => Boolean(file))
          .filter((file) => (
            isGoogleDriveFolderMimeType(file.mimeType) ||
            isSupportedGoogleDriveSourceMimeType(file.mimeType, file.name)
          ))
          .slice(0, GOOGLE_DRIVE_SOURCE_LIST_PAGE_SIZE)
          .map((file) => ({
            id: file.id,
            name: file.name,
            mime_type: file.mimeType,
            web_url: file.webViewLink,
            modified_time: file.modifiedTime,
            size: file.size,
            kind: isGoogleDriveFolderMimeType(file.mimeType) ? "folder" : "file",
            importable: !isGoogleDriveFolderMimeType(file.mimeType) &&
              isSupportedGoogleDriveSourceMimeType(file.mimeType, file.name),
          }))
      : [];
    return {
      ok: true,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      connection: toPublicGoogleDriveConnection(connection),
      folder_id: folderId || null,
      query: search || null,
      next_page_token: normalizeSourceIntegrationString(payload.nextPageToken, 2_000) || null,
      files,
    };
  },
});

export const importGoogleDriveSourceFiles = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    fileIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const fileIds = [...new Set(args.fileIds.map((id) => normalizeSourceIntegrationString(id, 300)).filter(Boolean))]
      .slice(0, GOOGLE_DRIVE_SOURCE_MAX_FILES);
    if (fileIds.length === 0) throw new Error("google_drive_file_ids_required");
    const { accessToken } = await resolveFreshGoogleDriveAccessToken(ctx, userId);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ id: string; name: string | null; message: string }> = [];
    for (const fileId of fileIds) {
      try {
        const metadataUrl = new URL(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`);
        metadataUrl.searchParams.set("fields", "id,name,mimeType,webViewLink,modifiedTime,size");
        metadataUrl.searchParams.set("supportsAllDrives", "true");
        const metadata = mapGoogleDriveFileCandidate(
          await fetchGoogleDriveJson({ accessToken, url: metadataUrl.toString() }),
        );
        if (!metadata || !isSupportedGoogleDriveSourceMimeType(metadata.mimeType, metadata.name)) {
          skipped += 1;
          continue;
        }
        const existing = (await ctx.runQuery(
          (internal as any).communityResources.getCommunitySourceByExternalIdInternal,
          {
            communityId: args.communityId,
            provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
            externalId: metadata.id,
          },
        )) as CommunityResourceLike | null;
        if (existing) {
          skipped += 1;
          continue;
        }
        await ctx.runMutation(
          (internal as any).communityResources.insertGoogleDriveSourceResourceInternal,
          {
            communityId: args.communityId,
            userId,
            fileId: metadata.id,
            name: metadata.name,
            mimeType: metadata.mimeType,
            webUrl: metadata.webViewLink ?? null,
            modifiedAt: parseGoogleDriveModifiedAt(metadata.modifiedTime),
          },
        );
        imported += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          id: fileId,
          name: null,
          message: error instanceof Error ? error.message : "google_drive_file_import_failed",
        });
      }
    }
    return {
      ok: failed === 0,
      provider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      imported,
      skipped,
      failed,
      failures,
    };
  },
});

export const getGitHubSourceConnectionStatus = query({
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
    const row = await getGitHubConnectionRow(ctx, userId);
    return toPublicGitHubConnection(row);
  },
});

export const beginGitHubSourceOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    returnToPath: v.optional(v.string()),
    callbackBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const clientId = normalizeSourceIntegrationString(readEnv("ARX_GITHUB_OAUTH_CLIENT_ID"), 500);
    if (!clientId) throw new Error("github_oauth_client_not_configured");
    const redirectUri = buildGitHubOAuthRedirectUri(args.callbackBaseUrl);
    const codeVerifier = randomBase64Url(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomBase64Url(32);
    const nowMs = Date.now();
    const returnToPath = normalizeReturnToPath(args.returnToPath);
    await ctx.runMutation((internal as any).communityResources.insertGitHubSourceAuthStateInternal, {
      userId,
      communityId: args.communityId,
      state,
      codeVerifier,
      redirectUri,
      returnToPath,
      returnContextKind: resolveSourceIntegrationReturnContextKind(returnToPath) ?? undefined,
      createdAt: nowMs,
      expiresAt: nowMs + GITHUB_SOURCE_OAUTH_STATE_TTL_MS,
    });
    const authorizationUrl = new URL(GITHUB_OAUTH_AUTHORIZE_URL);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", GITHUB_SOURCE_SCOPES);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("allow_signup", "true");
    return {
      ok: true,
      provider: GITHUB_SOURCE_PROVIDER,
      authorize_url: authorizationUrl.toString(),
      redirect_uri: redirectUri,
    };
  },
});

export const completeGitHubSourceOAuthCallbackInternal = internalAction({
  args: {
    state: v.string(),
    code: v.optional(v.string()),
    oauthError: v.optional(v.string()),
    oauthErrorDescription: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const state = normalizeSourceIntegrationString(args.state, 500);
    const row = (await ctx.runQuery(
      (internal as any).communityResources.getGitHubSourceAuthStateByStateInternal,
      { state },
    )) as UserSourceIntegrationAuthStateRow | null;
    if (!row) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: "/discover",
          status: "error",
          provider: GITHUB_SOURCE_PROVIDER,
          message: "GitHub connection expired. Start again.",
        }),
      };
    }
    if (Date.now() > Number(row.expiresAt ?? 0)) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GITHUB_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message: "GitHub connection expired. Start again.",
        }),
      };
    }
    const oauthError = normalizeSourceIntegrationString(args.oauthError, 300);
    if (oauthError) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GITHUB_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message:
            normalizeSourceIntegrationString(args.oauthErrorDescription, 300) ||
            oauthError ||
            "GitHub authorization was denied.",
        }),
      };
    }
    const code = normalizeSourceIntegrationString(args.code, 4_000);
    if (!code) {
      return {
        redirect_url: buildSourceIntegrationRedirectUrl({
          returnToPath: row.returnToPath,
          status: "error",
          provider: GITHUB_SOURCE_PROVIDER,
          returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
          message: "GitHub callback did not include an authorization code.",
        }),
      };
    }
    const encryptedCode = await encryptSecret(code);
    const finalizeToken = randomBase64Url(32);
    await ctx.runMutation((internal as any).communityResources.patchGitHubSourceAuthStateCallbackInternal, {
      stateId: row._id,
      callbackCodeEncryptedHex: encryptedCode.encryptedSecretHex,
      callbackCodeIvHex: encryptedCode.secretIvHex,
      callbackCodeVersion: encryptedCode.secretVersion,
      finalizeTokenHash: await sha256HexText(finalizeToken),
      callbackReceivedAt: Date.now(),
    });
    return {
      redirect_url: buildSourceIntegrationRedirectUrl({
        returnToPath: row.returnToPath,
        status: "pending",
        provider: GITHUB_SOURCE_PROVIDER,
        returnContextKind: normalizeSourceIntegrationReturnContextKind(row.returnContextKind),
        state,
        finalizeToken,
      }),
    };
  },
});

export const finalizeGitHubSourceOAuth = action({
  args: {
    authSubject: v.optional(v.string()),
    state: v.string(),
    finalizeToken: v.string(),
  },
  handler: async (ctx, args): Promise<GitHubOAuthFinalizeResult> => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    const state = normalizeSourceIntegrationString(args.state, 500);
    const finalizeToken = normalizeSourceIntegrationString(args.finalizeToken, 500);
    const row = (await ctx.runQuery(
      (internal as any).communityResources.getGitHubSourceAuthStateByStateInternal,
      { state },
    )) as UserSourceIntegrationAuthStateRow | null;
    if (!row) {
      return {
        ok: false,
        provider: GITHUB_SOURCE_PROVIDER,
        error_message: "GitHub connection expired. Start again.",
      };
    }
    const sourceCommunityId = normalizeSourceIntegrationString(row.communityId, 200) || null;
    const sourceReturnContextKind = normalizeSourceIntegrationReturnContextKind(row.returnContextKind);
    if (String(row.userId) !== String(userId)) {
      return {
        ok: false,
        provider: GITHUB_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "GitHub must be finalized by the Polynet account that started it.",
      };
    }
    const expectedFinalizeTokenHash = normalizeSourceIntegrationString(row.finalizeTokenHash, 200);
    const actualFinalizeTokenHash = finalizeToken ? await sha256HexText(finalizeToken) : "";
    if (!expectedFinalizeTokenHash || expectedFinalizeTokenHash !== actualFinalizeTokenHash) {
      throw new Error("github_oauth_finalize_token_mismatch");
    }
    const claim = (await ctx.runMutation(
      (internal as any).communityResources.claimGitHubSourceOAuthFinalizeInternal,
      {
        state,
        userId,
        finalizeTokenHash: actualFinalizeTokenHash,
        nowMs: Date.now(),
      },
    )) as { status?: string; stateId?: unknown; result?: GitHubOAuthFinalizeResult } | null;
    if (claim?.status !== "claimed") {
      const result = claim?.result ?? {
        ok: false,
        provider: GITHUB_SOURCE_PROVIDER,
        error_message: "GitHub connection could not be finalized.",
      };
      return {
        ...result,
        community_id: result.community_id ?? sourceCommunityId,
        return_context_kind: result.return_context_kind ?? sourceReturnContextKind,
      };
    }
    if (!row.callbackCodeEncryptedHex || !row.callbackCodeIvHex) {
      return {
        ok: false,
        provider: GITHUB_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "GitHub callback has not completed yet.",
      };
    }
    const code = normalizeSourceIntegrationString(
      await decryptStoredSecret({
        encryptedSecretHex: row.callbackCodeEncryptedHex,
        secretIvHex: row.callbackCodeIvHex,
      }),
      4_000,
    );
    const clientId = normalizeSourceIntegrationString(readEnv("ARX_GITHUB_OAUTH_CLIENT_ID"), 500);
    const clientSecret = normalizeSourceIntegrationString(readEnv("ARX_GITHUB_OAUTH_CLIENT_SECRET"), 2_000);
    if (!clientId || !clientSecret) throw new Error("github_oauth_client_not_configured");
    let token: Pick<StoredGitHubAuthV1, "accessToken" | "tokenType" | "scope">;
    try {
      token = await exchangeGitHubCodeForToken({
        code,
        redirectUri: row.redirectUri,
        codeVerifier: row.codeVerifier,
        clientId,
        clientSecret,
      });
    } catch {
      const result = {
        ok: false,
        provider: GITHUB_SOURCE_PROVIDER,
        community_id: sourceCommunityId,
        return_context_kind: sourceReturnContextKind,
        error_message: "GitHub authorization could not be finalized. Start again.",
      } satisfies GitHubOAuthFinalizeResult;
      await ctx.runMutation((internal as any).communityResources.failGitHubSourceOAuthFinalizeInternal, {
        stateId: row._id,
        resultJson: stringifyGitHubOAuthFinalizeResult(result),
        errorMessage: result.error_message,
        nowMs: Date.now(),
      });
      return result;
    }
    const viewer = await fetchGitHubViewer({ accessToken: token.accessToken });
    const tokenBundle: StoredGitHubAuthV1 = {
      kind: "github_oauth_token_v1",
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      scope: token.scope,
      accountId: viewer.accountId,
      login: viewer.login,
      email: viewer.email,
    };
    const encrypted = await encryptSecret(encodeStoredGitHubAuth(tokenBundle));
    const nowMs = Date.now();
    await ctx.runMutation((internal as any).communityResources.upsertGitHubSourceConnectionInternal, {
      userId,
      ...encrypted,
      accountId: viewer.accountId ?? undefined,
      accountLogin: viewer.login ?? undefined,
      email: viewer.email ?? undefined,
      scope: token.scope ?? undefined,
      validatedAt: nowMs,
      nowMs,
    });
    const result = {
      ok: true,
      provider: GITHUB_SOURCE_PROVIDER,
      community_id: sourceCommunityId,
      return_context_kind: sourceReturnContextKind,
      login: viewer.login,
      email: viewer.email,
    } satisfies GitHubOAuthFinalizeResult;
    await ctx.runMutation((internal as any).communityResources.completeGitHubSourceOAuthFinalizeInternal, {
      stateId: row._id,
      resultJson: stringifyGitHubOAuthFinalizeResult(result),
      nowMs: Date.now(),
    });
    return result;
  },
});

export const listGitHubSourceRepositories = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const { accessToken, connection } = await resolveGitHubAccessToken(ctx, userId);
    const url = new URL(`${GITHUB_API_BASE_URL}/user/repos`);
    url.searchParams.set("per_page", String(GITHUB_SOURCE_REPO_LIST_PAGE_SIZE));
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");
    const payload = await fetchGitHubJson({ accessToken, url: url.toString() });
    const search = normalizeSourceIntegrationString(args.query, 120).toLowerCase();
    const repositories = (Array.isArray(payload) ? payload : [])
      .map(mapGitHubRepoCandidate)
      .filter((repo): repo is GitHubRepoCandidate => Boolean(repo))
      .filter((repo) =>
        !search ||
        repo.fullName.toLowerCase().includes(search) ||
        repo.name.toLowerCase().includes(search),
      )
      .slice(0, GITHUB_SOURCE_REPO_LIST_PAGE_SIZE)
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.fullName,
        owner: repo.owner,
        private: repo.private,
        web_url: repo.htmlUrl,
        default_branch: repo.defaultBranch,
        updated_at: repo.updatedAt,
        pushed_at: repo.pushedAt,
      }));
    return {
      ok: true,
      provider: GITHUB_SOURCE_PROVIDER,
      connection: toPublicGitHubConnection(connection),
      repositories,
    };
  },
});

export const listGitHubSourceFiles = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    repoFullName: v.string(),
    ref: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const split = splitGitHubRepoFullName(args.repoFullName);
    if (!split) throw new Error("github_repo_required");
    const { accessToken, connection } = await resolveGitHubAccessToken(ctx, userId);
    let ref = normalizeSourceIntegrationString(args.ref, 240);
    if (!ref) {
      const repoPayload = await fetchGitHubJson({
        accessToken,
        url: `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(split.owner)}/${encodeURIComponent(split.repo)}`,
      }) as Record<string, unknown>;
      ref = normalizeSourceIntegrationString(repoPayload.default_branch, 240) || "main";
    }
    const treeUrl = new URL(
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(split.owner)}/${encodeURIComponent(split.repo)}/git/trees/${encodeURIComponent(ref)}`,
    );
    treeUrl.searchParams.set("recursive", "1");
    const payload = await fetchGitHubJson({ accessToken, url: treeUrl.toString() }) as Record<string, unknown>;
    const search = normalizeSourceIntegrationString(args.query, 120).toLowerCase();
    const readableFiles = (Array.isArray(payload.tree) ? payload.tree : [])
      .map((entry) => mapGitHubFileCandidate(entry, {
        repoFullName: `${split.owner}/${split.repo}`,
        ref,
      }))
      .filter((file): file is GitHubFileCandidate => Boolean(file))
      .filter((file) => !search || file.path.toLowerCase().includes(search))
      .sort((left, right) => left.path.localeCompare(right.path));
    const files = readableFiles
      .slice(0, GITHUB_SOURCE_FILE_LIST_LIMIT)
      .map((file) => ({
        id: file.id,
        repo_full_name: file.repoFullName,
        path: file.path,
        name: file.name,
        ref: file.ref,
        sha: file.sha,
        size: file.size,
        web_url: file.htmlUrl,
      }));
    return {
      ok: true,
      provider: GITHUB_SOURCE_PROVIDER,
      connection: toPublicGitHubConnection(connection),
      repo_full_name: `${split.owner}/${split.repo}`,
      ref,
      truncated: payload.truncated === true || readableFiles.length > GITHUB_SOURCE_FILE_LIST_LIMIT,
      file_limit: GITHUB_SOURCE_FILE_LIST_LIMIT,
      files,
    };
  },
});

export const importGitHubSourceFiles = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    fileIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const fileIds = [...new Set(args.fileIds.map((id) => normalizeSourceIntegrationString(id, 1_000)).filter(Boolean))]
      .slice(0, GITHUB_SOURCE_MAX_FILES);
    if (fileIds.length === 0) throw new Error("github_file_ids_required");
    const { accessToken } = await resolveGitHubAccessToken(ctx, userId);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ id: string; name: string | null; message: string }> = [];
    const resources: unknown[] = [];
    for (const externalId of fileIds) {
      try {
        const parsed = parseGitHubFileExternalId(externalId);
        if (!parsed) {
          skipped += 1;
          continue;
        }
        const existing = (await ctx.runQuery(
          (internal as any).communityResources.getCommunitySourceByExternalIdInternal,
          {
            communityId: args.communityId,
            provider: GITHUB_SOURCE_PROVIDER,
            externalId,
          },
        )) as CommunityResourceLike | null;
        if (existing) {
          skipped += 1;
          continue;
        }
        const extracted = await fetchGitHubFileText({
          accessToken,
          repoFullName: parsed.repoFullName,
          owner: parsed.owner,
          repo: parsed.repo,
          ref: parsed.ref,
          path: parsed.path,
        });
        const resource = (await ctx.runMutation(
          (internal as any).communityResources.insertGitHubSourceResourceInternal,
          {
            communityId: args.communityId,
            userId,
            externalId,
            repoFullName: parsed.repoFullName,
            ref: parsed.ref,
            path: parsed.path,
            name: extracted.title || getFilenameFromPath(parsed.path),
            contentType: extracted.contentType,
            webUrl: extracted.htmlUrl,
          },
        )) as unknown;
        resources.push(resource);
        imported += 1;
      } catch (error) {
        failed += 1;
        const parsed = parseGitHubFileExternalId(externalId);
        failures.push({
          id: externalId,
          name: parsed?.path ?? null,
          message: error instanceof Error ? error.message : "github_file_import_failed",
        });
      }
    }
    return {
      ok: failed === 0,
      provider: GITHUB_SOURCE_PROVIDER,
      imported,
      skipped,
      failed,
      failures,
      resources,
    };
  },
});

export const getCommunitySourceByExternalIdInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    provider: v.union(v.literal("google_drive"), v.literal("github")),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    const externalId = normalizeSourceIntegrationString(args.externalId, 1_000);
    if (!externalId) return null;
    return ((await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_source_external", (q: any) =>
        q.eq("communityId", args.communityId)
          .eq("sourceExternalProvider", args.provider)
          .eq("sourceExternalId", externalId),
      )
      .first()) as CommunityResourceLike | null) ?? null;
  },
});

export const insertGoogleDriveSourceResourceInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    fileId: v.string(),
    name: v.string(),
    mimeType: v.string(),
    webUrl: v.optional(v.union(v.string(), v.null())),
    modifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: args.communityId,
      createdByUserId: args.userId,
      type: "link",
      role: "source",
      status: "review",
      title: normalizeName(args.name || "Google Drive source"),
      bodyMd: undefined,
      url: normalizeOptionalUrl(args.webUrl) ?? undefined,
      fileKey: undefined,
      sourceIngestionStatus: "queued",
      sourceIngestionKind: "google_drive",
      sourceExternalProvider: GOOGLE_DRIVE_SOURCE_PROVIDER,
      sourceExternalConnectionUserId: args.userId,
      sourceExternalId: normalizeSourceIntegrationString(args.fileId, 500),
      sourceExternalName: normalizeOptionalText(args.name, 300) ?? undefined,
      sourceExternalUrl: normalizeOptionalUrl(args.webUrl) ?? undefined,
      sourceExternalMimeType: normalizeOptionalText(args.mimeType, 300) ?? undefined,
      sourceExternalModifiedAt:
        typeof args.modifiedAt === "number" && Number.isFinite(args.modifiedAt)
          ? Math.floor(args.modifiedAt)
          : undefined,
      pinned: false,
      sortOrder: undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!row) throw new Error("community_google_drive_source_create_failed");
    return await mapCommunityResourceRow(ctx, row);
  },
});

export const insertGitHubSourceResourceInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    externalId: v.string(),
    repoFullName: v.string(),
    ref: v.string(),
    path: v.string(),
    name: v.string(),
    contentType: v.string(),
    webUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: args.communityId,
      createdByUserId: args.userId,
      type: "link",
      role: "source",
      status: "review",
      title: normalizeName(args.name || getFilenameFromPath(args.path) || "GitHub source"),
      bodyMd: undefined,
      url: normalizeOptionalUrl(args.webUrl) ?? undefined,
      fileKey: undefined,
      sourceIngestionStatus: "queued",
      sourceIngestionKind: "github",
      sourceExternalProvider: GITHUB_SOURCE_PROVIDER,
      sourceExternalConnectionUserId: args.userId,
      sourceExternalId: normalizeSourceIntegrationString(args.externalId, 1_000),
      sourceExternalName: normalizeOptionalText(`${args.repoFullName}/${args.path}`, 300) ?? undefined,
      sourceExternalUrl: normalizeOptionalUrl(args.webUrl) ?? undefined,
      sourceExternalMimeType: normalizeOptionalText(args.contentType, 300) ?? undefined,
      sourceExternalModifiedAt: undefined,
      pinned: false,
      sortOrder: undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!row) throw new Error("community_github_source_create_failed");
    return await mapCommunityResourceRow(ctx, row);
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

export const getCommunitySourceIngestionStateInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    retryFailed: v.optional(v.boolean()),
    sourceKind: v.optional(
      v.union(
        v.literal("any"),
        v.literal("url"),
        v.literal("file"),
        v.literal("google_drive"),
        v.literal("github"),
      ),
    ),
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
    const limit = Math.max(
      1,
      Math.min(
        COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES +
          GOOGLE_DRIVE_SOURCE_MAX_FILES +
          GITHUB_SOURCE_MAX_FILES,
        Math.floor(
          args.limit ??
            COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
              COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES +
              GOOGLE_DRIVE_SOURCE_MAX_FILES +
              GITHUB_SOURCE_MAX_FILES,
        ),
      ),
    );
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
    const sourceKind = args.sourceKind ?? "any";
    const ingestibleSources = sources.filter((row) => {
      const hasGoogleDriveSource =
        isGoogleDriveSourceResource(row) &&
        Boolean(normalizeSourceIntegrationString(row.sourceExternalId, 500));
      const hasGitHubSource =
        isGitHubSourceResource(row) &&
        Boolean(parseGitHubFileExternalId(row.sourceExternalId));
      if (sourceKind === "url") return isPlainUrlSource(row);
      if (sourceKind === "file") return isPlainFileSource(row);
      if (sourceKind === "google_drive") return hasGoogleDriveSource;
      if (sourceKind === "github") return hasGitHubSource;
      return isPlainUrlSource(row) || isPlainFileSource(row) || hasGoogleDriveSource || hasGitHubSource;
    });
    const candidates = ingestibleSources
      .filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        if (status === "ready") return false;
        if (status === "failed" && !args.retryFailed) return false;
        return true;
      })
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt)
      .slice(0, limit);
    return {
      ok: true,
      kind: "community_source_ingestion_state",
      total_sources: sources.length,
      ready_sources: readySources.length,
      url_sources: urlSources.length,
      file_sources: fileSources.length,
      google_drive_sources: googleDriveSources.length,
      github_sources: githubSources.length,
      failed_sources: sources.filter((row) => normalizeResourceSourceIngestionStatus(row) === "failed").length,
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
      candidates: candidates.map((row) => ({
        id: normalizeIdValue(row._id),
        title: String(row.title ?? ""),
        url: String(row.url ?? "").trim(),
        fileKey: String(row.fileKey ?? "").trim(),
        sourceExternalProvider: normalizeSourceIntegrationString(row.sourceExternalProvider, 80),
        sourceExternalConnectionUserId: normalizeIdValue(row.sourceExternalConnectionUserId ?? row.createdByUserId),
        sourceExternalId: normalizeSourceIntegrationString(row.sourceExternalId, 1_000),
        sourceExternalUrl: normalizeSourceIntegrationString(row.sourceExternalUrl, 2_000),
        sourceExternalMimeType: normalizeSourceIntegrationString(row.sourceExternalMimeType, 300),
        source_ingestion_kind: normalizeResourceSourceIngestionKind(row),
        source_ingestion_status: normalizeResourceSourceIngestionStatus(row),
        updated_at_ms: row.updatedAt,
      })),
    };
  },
});

export const patchCommunitySourceIngestionInternal = internalMutation({
  args: {
    resourceId: v.id("communityResources"),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    kind: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("url"),
        v.literal("file"),
        v.literal("google_drive"),
        v.literal("github"),
      ),
    ),
    bodyMd: v.optional(v.union(v.string(), v.null())),
    url: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    attemptedAt: v.optional(v.number()),
    ingestedAt: v.optional(v.number()),
    sourceOriginalFilename: v.optional(v.union(v.string(), v.null())),
    sourceOriginalMimeType: v.optional(v.union(v.string(), v.null())),
    sourceOriginalBytes: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!existing) return null;
    if (normalizeResourceRole(existing.role) !== "source") {
      throw new Error("community_source_resource_required");
    }
    const nowMs = Date.now();
    const patch: Record<string, unknown> = {
      sourceIngestionStatus: args.status,
      ...(args.kind ? { sourceIngestionKind: args.kind } : {}),
      ...(typeof args.attemptedAt === "number" ? { sourceIngestionAttemptedAt: args.attemptedAt } : {}),
      ...(typeof args.ingestedAt === "number" ? { sourceIngestedAt: args.ingestedAt } : {}),
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
    if (Object.prototype.hasOwnProperty.call(args, "bodyMd")) {
      const normalizedBodyMd = normalizeCommunityResourceBodyMd(
        args.bodyMd,
        COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      );
      patch.bodyChars = normalizedBodyMd ? normalizedBodyMd.trim().length : 0;
    }
    if (Object.prototype.hasOwnProperty.call(args, "url")) {
      patch.url = normalizeOptionalUrl(args.url);
    }
    await ctx.db.patch(existing._id as any, patch);
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) return null;
    if (Object.prototype.hasOwnProperty.call(args, "bodyMd")) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: updated.communityId,
        resourceId: updated._id,
        bodyMd: args.bodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    await upsertArchiveDocumentForResource(ctx, hydrated);
    return await mapCommunityResourceRow(ctx, hydrated);
  },
});

function countPendingSourceIngestion(
  state: any,
  sourceKind: "any" | "url" | "file" | "google_drive" | "github",
): number {
  const pendingUrlSources = Number(state?.pending_url_sources ?? 0);
  const pendingFileSources = Number(state?.pending_file_sources ?? 0);
  const pendingGoogleDriveSources = Number(state?.pending_google_drive_sources ?? 0);
  const pendingGitHubSources = Number(state?.pending_github_sources ?? 0);
  if (sourceKind === "url") return pendingUrlSources;
  if (sourceKind === "file") return pendingFileSources;
  if (sourceKind === "google_drive") return pendingGoogleDriveSources;
  if (sourceKind === "github") return pendingGitHubSources;
  return pendingUrlSources + pendingFileSources + pendingGoogleDriveSources + pendingGitHubSources;
}

async function runCommunitySourceIngestion(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
  limit?: number;
  retryFailed?: boolean;
  sourceKind: "any" | "url" | "file" | "google_drive" | "github";
  resultKind: string;
}): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const actingUserId = args.userId ?? await resolveAuthenticatedActionUserId(args.ctx, args.authSubject ?? null);
    const before = (await args.ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceIngestionStateInternal,
      {
        userId: actingUserId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
        limit:
          args.limit ??
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
            COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES +
            GOOGLE_DRIVE_SOURCE_MAX_FILES +
            GITHUB_SOURCE_MAX_FILES,
        retryFailed: args.retryFailed ?? true,
        sourceKind: args.sourceKind,
      },
    )) as any;
    const candidates = Array.isArray(before?.candidates) ? before.candidates : [];
    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ resource_id: string; title: string; url: string | null; message: string }> = [];

    for (const candidate of candidates) {
      const resourceId = String(candidate.id ?? "").trim();
      const url = String(candidate.url ?? "").trim();
      const fileKey = String(candidate.fileKey ?? "").trim();
      const title = String(candidate.title ?? "").trim();
      const externalProvider = String(candidate.sourceExternalProvider ?? "").trim();
      const externalConnectionUserId = String(candidate.sourceExternalConnectionUserId ?? "").trim();
      const externalId = String(candidate.sourceExternalId ?? "").trim();
      const externalUrl = String(candidate.sourceExternalUrl ?? "").trim();
      const externalMimeType = String(candidate.sourceExternalMimeType ?? "").trim();
      const ingestionKind = String(candidate.source_ingestion_kind ?? "").trim();
      const kind = ingestionKind === "google_drive" && externalProvider === GOOGLE_DRIVE_SOURCE_PROVIDER
        ? "google_drive"
        : ingestionKind === "github" && externalProvider === GITHUB_SOURCE_PROVIDER
          ? "github"
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
              : kind === "google_drive" && !externalId
                ? "google_drive_file_id_required"
                : kind === "github" && !parseGitHubFileExternalId(externalId)
                  ? "github_file_id_invalid"
                  : null;
      if (invalidMessage) {
        failed += 1;
        failures.push({
          resource_id: resourceId,
          title,
          url: url || externalUrl || null,
          message: invalidMessage,
        });
        if (resourceId) {
          await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
            resourceId,
            status: "failed",
            kind,
            error: invalidMessage,
            ingestedAt: Date.now(),
          });
        }
        continue;
      }
      await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
        resourceId,
        status: "processing",
        kind,
        attemptedAt: Date.now(),
        error: null,
      });
      try {
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
          await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
            resourceId,
            status: "ready",
            kind: "file",
            bodyMd,
            error: null,
            ingestedAt: Date.now(),
            sourceOriginalFilename: title || null,
            sourceOriginalMimeType: extracted.contentType || null,
            sourceOriginalBytes: extracted.bytes,
          });
        } else if (kind === "google_drive") {
          const extracted = await extractSourceTextFromGoogleDrive({
            ctx: args.ctx,
            userId: externalConnectionUserId || actingUserId,
            fileId: externalId,
            filename: title,
            mimeType: externalMimeType,
            webUrl: externalUrl || null,
          });
          const bodyMd = buildIngestedGoogleDriveSourceBody({
            title: extracted.title,
            fileId: externalId,
            webUrl: externalUrl || null,
            contentType: extracted.contentType,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("google_drive_file_no_readable_content");
          await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
            resourceId,
            status: "ready",
            kind: "google_drive",
            bodyMd,
            error: null,
            ingestedAt: Date.now(),
          });
        } else if (kind === "github") {
          const extracted = await extractSourceTextFromGitHub({
            ctx: args.ctx,
            userId: externalConnectionUserId || actingUserId,
            externalId,
          });
          const bodyMd = buildIngestedGitHubSourceBody({
            title: extracted.title,
            externalId,
            webUrl: extracted.htmlUrl || externalUrl || null,
            contentType: extracted.contentType,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("github_file_no_readable_content");
          await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
            resourceId,
            status: "ready",
            kind: "github",
            bodyMd,
            error: null,
            ingestedAt: Date.now(),
            sourceOriginalFilename: extracted.title || title || null,
            sourceOriginalMimeType: extracted.contentType || null,
            sourceOriginalBytes: extracted.size,
          });
        } else {
          const extracted = await extractSourceTextFromUrl(url);
          const bodyMd = buildIngestedSourceBody({
            title: extracted.title,
            url: extracted.finalUrl,
            text: extracted.text,
          });
          if (!bodyMd.trim()) throw new Error("community_source_url_no_readable_content");
          await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
            resourceId,
            status: "ready",
            kind: "url",
            bodyMd,
            url: extracted.finalUrl,
            error: null,
            ingestedAt: Date.now(),
          });
        }
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "community_source_ingestion_failed";
        failures.push({
          resource_id: resourceId,
          title,
          url: url || externalUrl || null,
          message,
        });
        await args.ctx.runMutation((internal as any).communityResources.patchCommunitySourceIngestionInternal, {
          resourceId,
          status: "failed",
          kind,
          error: message,
          ingestedAt: Date.now(),
        });
      }
    }

    const after = (await args.ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceIngestionStateInternal,
      {
        userId: actingUserId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
        limit:
          args.limit ??
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS +
            COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES +
            GOOGLE_DRIVE_SOURCE_MAX_FILES +
            GITHUB_SOURCE_MAX_FILES,
        retryFailed: args.retryFailed ?? true,
        sourceKind: args.sourceKind,
      },
    )) as any;
    const readySources = Number(after?.ready_sources ?? 0);
    const totalSources = Number(after?.total_sources ?? 0);
    const remainingPendingSources = countPendingSourceIngestion(after, args.sourceKind);
    const ok = readySources > 0 && failed === 0 && remainingPendingSources === 0;
    const code = ok
      ? null
      : failed > 0
        ? "source_ingestion_partial_failure"
        : remainingPendingSources > 0
          ? "source_ingestion_incomplete"
          : totalSources > 0
            ? "no_ready_sources"
            : "source_material_required";
    return {
      ok,
      kind: args.resultKind,
      processed: candidates.length,
      succeeded,
      failed,
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
      sourceKind: "any",
      resultKind: "community_source_ingestion",
    });
  },
});

export const ingestCommunitySourceLinks: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
      sourceKind: "url",
      resultKind: "community_source_link_ingestion",
    });
  },
});

export const ingestCommunitySourceFiles: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
      sourceKind: "file",
      resultKind: "community_source_file_ingestion",
    });
  },
});

export const ingestCommunitySourceGoogleDrive: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
      sourceKind: "google_drive",
      resultKind: "community_source_google_drive_ingestion",
    });
  },
});

export const ingestCommunitySourceGitHub: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
      sourceKind: "github",
      resultKind: "community_source_github_ingestion",
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
    provider: v.union(v.literal("simple"), v.literal("crawl4ai")),
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

export const saveCommunitySourceCrawlPagesInternal = internalMutation({
  args: {
    crawlJobId: v.string(),
    communityId: v.id("communities"),
    userId: v.id("users"),
    rootUrl: v.string(),
    provider: v.union(v.literal("simple"), v.literal("crawl4ai")),
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
        if (decision.source_id) sourceResourceIds.push(decision.source_id);
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
          await upsertArchiveDocumentForResource(ctx, hydrated);
        }
        sourceResourceIds.push(decision.source_id);
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
        await upsertArchiveDocumentForResource(ctx, hydrated);
      }
      sourceResourceIds.push(normalizeIdValue(id));
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
        maxPages: job.maxPages,
        maxDepth: job.maxDepth,
        provider: job.provider,
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

export const crawlWebRoot: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    rootUrl: v.string(),
    strategy: v.optional(v.union(v.literal("auto"), v.literal("simple"), v.literal("crawl"))),
    destination: v.optional(v.union(v.literal("context"), v.literal("active_community_sources"))),
    maxPages: v.optional(v.number()),
    maxDepth: v.optional(v.number()),
    maxChars: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = args.userId ?? await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
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
        maxPages,
        maxDepth,
        provider,
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
    try {
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: "crawling",
        startedAt: Date.now(),
      });
      const crawl = await crawlSourceRootWithConfiguredProvider({
        rootUrl,
        maxPages,
        maxDepth,
        provider,
      });
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: "saving_sources",
        pageCount: crawl.pages.length,
        readyPageCount: crawl.pages.filter((page) => page.status === "ready").length,
        failedPageCount: crawl.pages.filter((page) => page.status !== "ready").length,
      });
      const saved = await ctx.runMutation(
        (internal as any).communityResources.saveCommunitySourceCrawlPagesInternal,
        {
          crawlJobId,
          communityId: args.communityId,
          userId,
          rootUrl,
          provider: crawl.provider,
          pages: crawl.pages,
        },
      );
      const sourceResourceIds = Array.isArray(saved?.source_resource_ids)
        ? saved.source_resource_ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
        : [];
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: sourceResourceIds.length > 0 ? "ready" : "failed",
        pageCount: Number(saved?.page_count ?? crawl.pages.length),
        readyPageCount: Number(saved?.ready_page_count ?? 0),
        failedPageCount: Number(saved?.failed_page_count ?? 0),
        savedSourceCount: Number(saved?.saved_source_count ?? 0),
        skippedSourceCount: Number(saved?.skipped_source_count ?? 0),
        sourceResourceIds,
        error: sourceResourceIds.length > 0 ? null : "community_source_crawl_no_usable_sources",
        completedAt: Date.now(),
      });
      return {
        ok: sourceResourceIds.length > 0,
        kind: "web_crawl",
        destination,
        provider: crawl.provider,
        root_url: rootUrl,
        crawl_job_id: crawlJobId,
        page_count: Number(saved?.page_count ?? crawl.pages.length),
        ready_page_count: Number(saved?.ready_page_count ?? 0),
        failed_page_count: Number(saved?.failed_page_count ?? 0),
        saved_source_count: Number(saved?.saved_source_count ?? 0),
        skipped_source_count: Number(saved?.skipped_source_count ?? 0),
        source_resource_ids: sourceResourceIds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "web_crawl_failed";
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      throw error;
    }
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
      const nextBodyMd = bodyChanged ? normalizeCommunityResourceBodyMd(payload.body_md, 20_000) : null;
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
      const nextModuleId = await requireValidResourceModule({
        ctx,
        communityId: existing.communityId,
        moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
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
          maxChars: 20_000,
        });
      }
      const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
      await upsertArchiveDocumentForResource(ctx, hydrated);
      return await mapCommunityResourceRow(ctx, hydrated);
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
    const bodyMd = normalizeCommunityResourceBodyMd(payload.body_md, 20_000);
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
    const moduleId = await requireValidResourceModule({
      ctx,
      communityId: community._id,
      moduleId: normalizeOptionalModuleId(payload.module_id),
    });
    const nextSortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: community._id,
      moduleId,
    });

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
        maxChars: 20_000,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
    await upsertArchiveDocumentForResource(ctx, hydrated);
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
    return await mapCommunityResourceRow(ctx, hydrated);
  },
});

export const createCommunityResourcePageDraftFromSource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    sourceResourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const sourceResourceId = String(args.sourceResourceId ?? "").trim();
    if (!sourceResourceId) throw new Error("community_source_resource_id_required");
    const sourceRow = (await ctx.db.get(sourceResourceId as any)) as CommunityResourceLike | null;
    const source = await hydrateCommunityResourceBody(ctx, sourceRow) ?? sourceRow;
    if (!source) throw new Error("community_source_resource_not_found");
    await requireCommunityManager({
      ctx,
      communityId: source.communityId,
      userId: args.userId,
    });
    if (normalizeResourceRole(source.role) !== "source") {
      throw new Error("community_source_resource_required");
    }
    if (!communityResourceSourceHasReadyText(source)) {
      throw new Error("community_source_resource_not_ready");
    }

    const nowMs = Date.now();
    const sortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: source.communityId,
      moduleId: source.moduleId ?? null,
    });
    const id = await ctx.db.insert("communityResources" as any, {
      communityId: source.communityId,
      ...(source.moduleId ? { moduleId: source.moduleId } : {}),
      createdByUserId: args.userId,
      type: "post",
      role: "page",
      status: "draft",
      sourceResourceId: source._id,
      title: source.title,
      pinned: false,
      sortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await writeCommunityResourceBodyContent(ctx, {
      communityId: source.communityId,
      resourceId: created._id,
      bodyMd: buildPageDraftBodyFromSource(source),
      nowMs,
      maxChars: 20_000,
    });
    const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
    await upsertArchiveDocumentForResource(ctx, hydrated);
    return await mapCommunityResourceRow(ctx, hydrated);
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
    const scopedRows = rows.filter((row) => resourceModuleIdentity(row.moduleId) === targetModuleIdentity);
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
    await deleteCommunityResourceBodyContent(ctx, resource._id);
    await ctx.db.delete(resource._id as any);
    await deleteArchiveDocumentBySource(ctx, {
      communityId: resource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(resource._id),
    });
    return { ok: true };
  },
});
