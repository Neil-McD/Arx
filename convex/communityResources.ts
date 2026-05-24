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
  communityResourceSourceHasReadyText,
  communityResourceIsPublishedKnowledge,
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
  normalizeResourceSourceIngestionKind,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  normalizeResourceType,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireResourceSourceIngestionKindForWrite,
  requireResourceSourceIngestionStatusForWrite,
  requireResourceStatusForWrite,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import {
  COMMUNITY_RESOURCE_SOURCE_INBOX_SEGMENT,
  COMMUNITY_RESOURCE_UNSORTED_MODULE_SEGMENT,
  buildCommunityResourceDirectoryFields,
  buildCommunityResourceModuleDirectoryFields,
  parseCommunityResourceDirectoryUri,
} from "../shared/communityResourceDirectory";
import {
  COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES,
  COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES,
  COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES,
  getCommunityResourceBuilderScaffoldPageKey,
} from "../shared/communityResourceBuilder";

const COMMUNITY_RESOURCE_DIRECTORY_TOOL_DEFAULT_LIMIT = 50;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MAX_LIMIT = 100;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT = 5000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_MODULE_SCAN_LIMIT = 500;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_DEFAULT_CHARS = 12_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_READ_MAX_CHARS = 20_000;
const COMMUNITY_RESOURCE_DIRECTORY_TOOL_SNIPPET_CHARS = 420;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS = 240;
const COMMUNITY_RESOURCE_BUILDER_HEALTH_STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES = 750_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS = 20_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS = 12_000;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_REDIRECTS = 3;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_LINKS = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_FILES = 10;
const COMMUNITY_RESOURCE_SOURCE_INGESTION_USER_AGENT =
  "PolyNet Community Source Ingestion/1.0";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_ENDPOINT_ENV = "ARX_SOURCE_URL_FETCHER_ENDPOINT";
const COMMUNITY_RESOURCE_SOURCE_URL_FETCHER_SECRET_ENV = "ARX_SOURCE_URL_FETCHER_SECRET";
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

type SourceIntegrationProvider = typeof GOOGLE_DRIVE_SOURCE_PROVIDER | typeof GITHUB_SOURCE_PROVIDER;
type SourceIntegrationReturnContextKind = "community_launch_knowledge" | null;

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

async function readResponseTextBounded(response: Response): Promise<string> {
  const contentLength = getHeaderNumber(response.headers, "content-length");
  if (contentLength !== null && contentLength > COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES) {
    throw new Error("community_source_url_too_large");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES) {
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
    if (totalBytes > COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BYTES) {
      throw new Error("community_source_url_too_large");
    }
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMUNITY_RESOURCE_SOURCE_INGESTION_TIMEOUT_MS);
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
    ? "Use this page as the member-facing version of the source. Tighten the summary, remove private notes, and publish when the content is accurate."
    : "Review the source, add the member-facing takeaway, and publish only after the page is accurate.";
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

function normalizeBuilderHealthTitle(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isBuilderScaffoldPageTitle(raw: unknown): boolean {
  return COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_TITLES.some(
    (title) => normalizeBuilderHealthTitle(title) === normalizeBuilderHealthTitle(raw),
  );
}

function isBuilderDefaultModuleName(raw: unknown): boolean {
  return COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES.some(
    (moduleName) => normalizeBuilderHealthTitle(moduleName) === normalizeBuilderHealthTitle(raw),
  );
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
  if (next === "published" && !args.confirmPublish) {
    throw new Error("community_resource_publish_confirmation_required");
  }
  if (args.publishing && next !== "published") {
    throw new Error("community_resource_publish_status_required");
  }
  return next;
}

function isCommunityResourceRow(row: unknown): row is CommunityResourceLike {
  return Boolean(
    row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      (row as CommunityResourceLike).communityId !== undefined &&
      (row as CommunityResourceLike).createdByUserId !== undefined &&
      typeof (row as CommunityResourceLike).title === "string" &&
      typeof (row as CommunityResourceLike).pinned === "boolean" &&
      typeof (row as CommunityResourceLike).createdAt === "number" &&
      typeof (row as CommunityResourceLike).updatedAt === "number",
  );
}

async function requireCommunityResourceDirectoryToolAccess(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<void> {
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

async function listResourceDirectoryPublishedResources(
  ctx: any,
  communityId: any,
): Promise<CommunityResourceLike[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(COMMUNITY_RESOURCE_DIRECTORY_TOOL_SCAN_LIMIT)) as CommunityResourceLike[];
  return rows.filter(communityResourceIsPublishedKnowledge).sort(compareCommunityResources);
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
  const url = String(row.url ?? "").trim();
  if (url) return `External resource: ${url.slice(0, 180)}`;
  if (row.fileKey) return "Uploaded resource without parsed text.";
  return null;
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
    summary: "Published source materials for this module.",
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
  const body = String(row.bodyMd ?? "").trim();
  if (body) return null;
  if (row.fileKey && row.url) return "external_or_uploaded_content_not_parsed";
  if (row.fileKey) return "uploaded_file_not_parsed";
  if (row.url) return "external_url_metadata_only";
  return "resource_has_no_readable_content";
}

async function resolveResourceById(args: {
  ctx: any;
  communityId: any;
  resourceId: string;
}): Promise<CommunityResourceLike | null> {
  let row: unknown;
  try {
    row = await args.ctx.db.get(args.resourceId as any);
  } catch {
    return null;
  }
  if (!isCommunityResourceRow(row)) return null;
  if (normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) return null;
  if (!communityResourceIsPublishedKnowledge(row)) return null;
  return row;
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
    const byUri = await resolveResourceById({
      ctx: args.ctx,
      communityId: args.communityId,
      resourceId: parsed.resourceId,
    });
    if (!byUri) throw new Error("community_resource_not_found");
    return { ok: true, resource: byUri };
  }

  const byId = await resolveResourceById({
    ctx: args.ctx,
    communityId: args.communityId,
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
  moduleNameMap: Map<string, string>;
}) {
  const source = await resolveResourceById({
    ctx: args.ctx,
    communityId: args.communityId,
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
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const resources = await listResourceDirectoryPublishedResources(ctx, args.communityId);
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
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const resources = await listResourceDirectoryPublishedResources(ctx, args.communityId);
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

    const row = resolved.resource;
    const body = String(row.bodyMd ?? "");
    const offset = boundedReadOffset(args.offset);
    const limit = boundedReadLimit(args.limit);
    const bodySlice = body ? body.slice(offset, offset + limit) : null;
    const source = row.sourceResourceId
      ? await buildSourceResourceMetadata({
          ctx,
          communityId: args.communityId,
          sourceResourceId: row.sourceResourceId,
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
    const modules = await listResourceDirectoryModules(ctx, args.communityId);
    const moduleNameMap = buildModuleNameMap(modules);
    const terms = normalizeSearchQueryTerms(query);
    const matches = (await listResourceDirectoryPublishedResources(ctx, args.communityId))
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
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 1000)));
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
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    return {
      ok: true,
      kind: "community_resource_builder_directory",
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
          .map((row) => mapCommunityResourceRow(ctx, row, userIdCache, moduleNameCache)),
      ),
    };
  },
});

export const readCommunityResourceBuilderResource = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
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
    if (args.resourceId) {
      const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
      if (!resource || String(resource.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_not_found");
      }
      return {
        ok: true,
        kind: "community_resource_builder_read",
        resource: await mapCommunityResourceRow(ctx, resource),
      };
    }
    if (args.moduleId) {
      const module = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
      if (!module || String(module.communityId) !== String(args.communityId)) {
        throw new Error("community_resource_module_not_found");
      }
      return {
        ok: true,
        kind: "community_resource_builder_read",
        module: await mapCommunityResourceModuleRow(ctx, module),
      };
    }
    throw new Error("community_resource_builder_read_ref_required");
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
    const bodyMd = normalizeOptionalText(payload.body_md, 20_000);
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
      bodyMd,
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
    await upsertArchiveDocumentForResource(ctx, created);
    return {
      ok: true,
      kind: "community_resource_builder_write",
      resource: await mapCommunityResourceRow(ctx, created),
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
      await ctx.db.patch(existing._id as any, {
        ...(Object.prototype.hasOwnProperty.call(payload, "name")
          ? { name: normalizeName(payload.name) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "description_md")
          ? { descriptionMd: normalizeOptionalText(payload.description_md, 1200) }
          : {}),
        updatedAt: nowMs,
      });
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
    const nextBodyMd = bodyChanged ? normalizeOptionalText(payload.body_md, 20_000) : existing.bodyMd;
    const nextUrl = urlChanged ? normalizeOptionalUrl(payload.url) : existing.url;
    const nextFileKey = fileChanged ? normalizeOptionalFileKey(payload.file_key) : existing.fileKey;
    const sourceIngestionPatch =
      normalizeResourceRole(existing.role) === "source"
        ? {
            sourceIngestionStatus: bodyChanged && nextBodyMd
              ? "ready"
              : urlChanged || fileChanged
                ? "queued"
                : normalizeResourceSourceIngestionStatus({
                    ...existing,
                    bodyMd: nextBodyMd ?? undefined,
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
      ...(bodyChanged ? { bodyMd: nextBodyMd } : {}),
      ...(urlChanged ? { url: nextUrl } : {}),
      ...(fileChanged ? { fileKey: nextFileKey } : {}),
      ...sourceIngestionPatch,
      ...(Object.prototype.hasOwnProperty.call(payload, "pinned") ? { pinned: Boolean(payload.pinned) } : {}),
      ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) throw new Error("community_resource_not_found");
    await upsertArchiveDocumentForResource(ctx, updated);
    return {
      ok: true,
      kind: "community_resource_builder_edit",
      resource: await mapCommunityResourceRow(ctx, updated),
    };
  },
});

export const getCommunityResourceBuilderHealth = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
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
    return await buildCommunityResourceBuilderHealthReport({
      ctx,
      communityId: args.communityId,
      nowMs: Number.isFinite(args.nowMs) ? Number(args.nowMs) : Date.now(),
    });
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
  const pages = resources.filter((row) => normalizeResourceRole(row.role) === "page");
  const sources = resources.filter((row) => normalizeResourceRole(row.role) === "source");
  const existingModuleNames = new Set(modules.map((module) => normalizeBuilderHealthTitle(module.name)));
  const missingDefaultModules = COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES.filter(
    (moduleName) => !existingModuleNames.has(normalizeBuilderHealthTitle(moduleName)),
  );
  const moduleNameById = new Map(
    modules.map((module) => [normalizeIdValue(module._id), String(module.name ?? "")]),
  );
  const existingScaffoldPageKeys = new Set(
    pages.map((page) =>
      getCommunityResourceBuilderScaffoldPageKey({
        moduleName: moduleNameById.get(normalizeIdValue(page.moduleId ?? "")) ?? "",
        title: page.title,
      }),
    ),
  );
  const missingScaffoldPages = COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES.filter(
    (page) =>
      !existingScaffoldPageKeys.has(
        getCommunityResourceBuilderScaffoldPageKey({
          moduleName: page.moduleName,
          title: page.title,
        }),
      ),
  ).map((page) => `${page.moduleName}/${page.title}`);
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
  const issues = {
    emptyModules: modules
      .filter(
        (module) =>
          (modulePageCounts.get(normalizeIdValue(module._id)) ?? 0) === 0 &&
          !isBuilderDefaultModuleName(module.name),
      )
      .map((module) => ({
        module_id: normalizeIdValue(module._id),
        name: module.name,
      })),
    sparsePages: pages
      .filter(
        (page) =>
          !isBuilderScaffoldPageTitle(page.title) &&
          String(page.bodyMd ?? "").trim().length < COMMUNITY_RESOURCE_BUILDER_HEALTH_SPARSE_BODY_CHARS,
      )
      .map((page) => ({
        resource_id: normalizeIdValue(page._id),
        title: page.title,
        status: normalizeResourceStatus(page.status),
        body_chars: String(page.bodyMd ?? "").trim().length,
      })),
    pagesWithoutSourceLineage: pages
      .filter((page) => !normalizeIdValue(page.sourceResourceId ?? "") && !isBuilderScaffoldPageTitle(page.title))
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
  return {
    ok: true,
    kind: "community_resource_builder_health",
    checked_at: toIsoString(args.nowMs),
    summary: {
      modules: modules.length,
      resources: resources.length,
      pages: pages.length,
      sources: sources.length,
      published_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "published").length,
      draft_pages: pages.filter((page) => normalizeResourceStatus(page.status) === "draft").length,
      source_inbox_items: sources.length,
      missing_default_modules: missingDefaultModules,
      missing_scaffold_pages: missingScaffoldPages,
      issue_count:
        issues.emptyModules.length +
        issues.sparsePages.length +
        issues.pagesWithoutSourceLineage.length +
        issues.unreferencedSources.length +
        issues.staleDrafts.length,
    },
    issues,
  };
}

export const ensureCommunityResourceWikiScaffold = mutation({
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

    const nowMs = Date.now();
    const modules = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    const moduleByName = new Map(modules.map((module) => [normalizeBuilderHealthTitle(module.name), module]));
    const modulesCreated: string[] = [];
    const existingModules: string[] = [];
    let nextModuleSortOrder = modules.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;

    for (const moduleName of COMMUNITY_RESOURCE_BUILDER_DEFAULT_MODULES) {
      const key = normalizeBuilderHealthTitle(moduleName);
      if (moduleByName.has(key)) {
        existingModules.push(moduleName);
        continue;
      }
      const id = await ctx.db.insert("communityResourceModules" as any, {
        communityId: args.communityId,
        createdByUserId: userId,
        name: moduleName,
        descriptionMd: null,
        sortOrder: nextModuleSortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      nextModuleSortOrder += 1000;
      const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
      if (!created) throw new Error("community_resource_module_create_failed");
      moduleByName.set(key, created);
      modulesCreated.push(moduleName);
    }

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const pagesByModuleAndTitle = new Set(
      resources
        .filter((row) => normalizeResourceRole(row.role) === "page")
        .map((row) => `${normalizeIdValue(row.moduleId ?? "")}:${normalizeBuilderHealthTitle(row.title)}`),
    );
    const pagesCreated: string[] = [];
    const existingPages: string[] = [];

    for (const page of COMMUNITY_RESOURCE_BUILDER_SCAFFOLD_PAGES) {
      const module = moduleByName.get(normalizeBuilderHealthTitle(page.moduleName));
      if (!module) throw new Error("community_resource_scaffold_module_missing");
      const pageKey = `${normalizeIdValue(module._id)}:${normalizeBuilderHealthTitle(page.title)}`;
      if (pagesByModuleAndTitle.has(pageKey)) {
        existingPages.push(`${page.moduleName}/${page.title}`);
        continue;
      }
      const sortOrder = await getNextResourceSortOrder({
        ctx,
        communityId: args.communityId,
        moduleId: module._id,
      });
      const id = await ctx.db.insert("communityResources" as any, {
        communityId: args.communityId,
        moduleId: module._id,
        createdByUserId: userId,
        type: "post",
        role: "page",
        status: "draft",
        title: page.title,
        bodyMd: normalizeOptionalText(page.bodyMd, 20_000),
        pinned: false,
        sortOrder,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
      if (!created) throw new Error("community_resource_create_failed");
      await upsertArchiveDocumentForResource(ctx, created);
      pagesByModuleAndTitle.add(pageKey);
      pagesCreated.push(`${page.moduleName}/${page.title}`);
    }

    return {
      ok: true,
      kind: "community_resource_wiki_scaffold",
      summary: {
        modules_created: modulesCreated,
        modules_existing: existingModules,
        pages_created: pagesCreated,
        pages_existing: existingPages,
      },
      health: await buildCommunityResourceBuilderHealthReport({
        ctx,
        communityId: args.communityId,
        nowMs: Date.now(),
      }),
    };
  },
});

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
      await ctx.db.patch(existing._id as any, {
        name: normalizeName(nextNameRaw),
        descriptionMd: normalizeOptionalText(nextDescriptionRaw, 1200),
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
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .filter((row) => canManageResources || communityResourceIsPublishedKnowledge(row))
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityResourceRow(ctx, row, userIdCache, moduleNameCache)),
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
    const resources: unknown[] = [];
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
        const resource = (await ctx.runMutation(
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
        )) as unknown;
        resources.push(resource);
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
      resources,
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
    const files = (Array.isArray(payload.tree) ? payload.tree : [])
      .map((entry) => mapGitHubFileCandidate(entry, {
        repoFullName: `${split.owner}/${split.repo}`,
        ref,
      }))
      .filter((file): file is GitHubFileCandidate => Boolean(file))
      .filter((file) => !search || file.path.toLowerCase().includes(search))
      .sort((left, right) => left.path.localeCompare(right.path))
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
      truncated: payload.truncated === true,
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
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
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
      patch.bodyMd = normalizeOptionalText(args.bodyMd, COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS) ?? undefined;
    }
    if (Object.prototype.hasOwnProperty.call(args, "url")) {
      patch.url = normalizeOptionalUrl(args.url);
    }
    await ctx.db.patch(existing._id as any, patch);
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) return null;
    await upsertArchiveDocumentForResource(ctx, updated);
    return await mapCommunityResourceRow(ctx, updated);
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
      const nextBodyRaw = Object.prototype.hasOwnProperty.call(payload, "body_md") ? payload.body_md : existing.bodyMd;
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
      const nextBodyMd = normalizeOptionalText(nextBodyRaw, 20_000);
      const nextUrl = normalizeOptionalUrl(nextUrlRaw);
      const nextFileKey = normalizeOptionalFileKey(nextFileKeyRaw);
      const bodyChanged = Object.prototype.hasOwnProperty.call(payload, "body_md");
      const urlChanged = Object.prototype.hasOwnProperty.call(payload, "url") &&
        String(nextUrl ?? "") !== String(existing.url ?? "");
      const fileChanged = Object.prototype.hasOwnProperty.call(payload, "file_key") &&
        String(nextFileKey ?? "") !== String(existing.fileKey ?? "");
      const nextSourceIngestionStatus = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
        ? requireResourceSourceIngestionStatusForWrite(nextSourceIngestionStatusRaw)
        : nextRole !== "source"
          ? "not_required"
          : bodyChanged && nextBodyMd
          ? "ready"
          : urlChanged || fileChanged
            ? "queued"
            : normalizeResourceSourceIngestionStatus({
                ...existing,
                role: nextRole,
                bodyMd: nextBodyMd ?? undefined,
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
        bodyMd: nextBodyMd,
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
      await upsertArchiveDocumentForResource(ctx, updated);
      return await mapCommunityResourceRow(ctx, updated);
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
        : "published";
    const title = normalizeName(payload.title);
    const bodyMd = normalizeOptionalText(payload.body_md, 20_000);
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
      bodyMd,
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
    await upsertArchiveDocumentForResource(ctx, created);
    if (status === "published") {
      await recordCommunityActivityEventBestEffort({
        ctx,
        communityId: community._id,
        type: "resource_added",
        actorUserId: args.userId,
        targetType: "resource",
        targetId: created._id,
        targetTitle: created.title,
        dedupeKey: `resource_added:${normalizeIdValue(created._id)}`,
        nowMs,
      });
    }
    return await mapCommunityResourceRow(ctx, created);
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
    const source = (await ctx.db.get(sourceResourceId as any)) as CommunityResourceLike | null;
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
      bodyMd: normalizeOptionalText(buildPageDraftBodyFromSource(source), 20_000),
      pinned: false,
      sortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await upsertArchiveDocumentForResource(ctx, created);
    return await mapCommunityResourceRow(ctx, created);
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
    await ctx.db.delete(resource._id as any);
    await deleteArchiveDocumentBySource(ctx, {
      communityId: resource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(resource._id),
    });
    return { ok: true };
  },
});
