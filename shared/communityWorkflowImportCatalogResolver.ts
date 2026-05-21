import type { DeveloperAppAuthType } from "./communityAppMountTypes.ts";
import { normalizeCommunityWorkflowImportCandidateKey } from "./communityWorkflowImportCandidateIds.ts";
import { DISCOVER_APP_CATALOG, type DiscoverAppCatalogEntry } from "./discoverCatalog.ts";

export type CommunityWorkflowImportCatalogMatch = {
  app: DiscoverAppCatalogEntry | null;
  catalogAppId: string | null;
  appName: string | null;
  endpointUrl: string | null;
  authType: DeveloperAppAuthType | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  reviewLogoUrl: string | null;
  connectable: boolean;
  reason: string | null;
};

const DISCOVER_APP_ALIASES: Record<string, string[]> = {
  github: [
    "github-mcp",
    "github-mcp-server",
    "githubcopilot",
    "github-copilot",
    "api.githubcopilot.com",
    "modelcontextprotocol-server-github",
    "@modelcontextprotocol/server-github",
  ],
  supabase: [
    "supabase-mcp",
    "supabase-mcp-server",
    "mcp.supabase.com",
    "@supabase/mcp-server-supabase",
  ],
  vercel: [
    "vercel-mcp",
    "vercel-mcp-server",
    "mcp.vercel.com",
  ],
};

const REVIEW_ONLY_LOGO_ALIASES: Record<string, string[]> = {
  "/app-logos/context7.svg": [
    "context7",
    "context7-mcp",
    "context7-mcp-server",
    "upstash-context7",
    "@upstash/context7-mcp",
    "mcp.context7.com",
  ],
  "/app-logos/fly-light.svg": [
    "fly",
    "fly.io",
    "flydotio",
    "fly-mcp",
    "fly-mcp-server",
    "flyctl",
  ],
};

const DISCOVER_APP_ID_BY_KEY = new Map<string, string>();
const DISCOVER_APP_ID_BY_ENDPOINT_HOST = new Map<string, string>();
const REVIEW_ONLY_LOGO_BY_KEY = new Map<string, string>();
const REVIEW_ONLY_LOGO_BY_ENDPOINT_HOST = new Map<string, string>();

type WorkflowImportCatalogCandidateKind =
  | "catalog_id"
  | "identity"
  | "package"
  | "command"
  | "endpoint";

type WorkflowImportCatalogCandidate = {
  value: string;
  kind: WorkflowImportCatalogCandidateKind;
};

function getReviewCatalogLogoUrl(app: DiscoverAppCatalogEntry): string | null {
  return app.logoUrlDark ?? app.logoUrl ?? null;
}

function normalizeEndpointHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function looksLikeEndpointHostInput(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed);
}

function readEndpointHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || !looksLikeEndpointHostInput(trimmed)) return null;
  const candidates = [trimmed, `https://${trimmed}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const host = normalizeEndpointHost(url.hostname);
      if (host) return host;
    } catch {
      // Try the next form.
    }
  }
  return null;
}

function addEndpointHostKey(value: string, appId: string) {
  const host = readEndpointHost(value);
  if (!host) return;
  DISCOVER_APP_ID_BY_ENDPOINT_HOST.set(host, appId);
}

function addDiscoverAppKey(key: string, appId: string) {
  const normalizedKey = normalizeCommunityWorkflowImportCandidateKey(key);
  if (!normalizedKey) return;
  DISCOVER_APP_ID_BY_KEY.set(normalizedKey, appId);
  addEndpointHostKey(key, appId);
}

for (const app of DISCOVER_APP_CATALOG) {
  const keys = [
    app.id,
    app.name,
    ...(DISCOVER_APP_ALIASES[app.id] ?? []),
  ];
  for (const key of keys) addDiscoverAppKey(key, app.id);
  if (app.personalConnect.connectionKind === "known" && app.personalConnect.endpointUrl) {
    addEndpointHostKey(app.personalConnect.endpointUrl, app.id);
  }
}

for (const [logoUrl, aliases] of Object.entries(REVIEW_ONLY_LOGO_ALIASES)) {
  for (const alias of aliases) {
    const key = normalizeCommunityWorkflowImportCandidateKey(alias);
    if (key) REVIEW_ONLY_LOGO_BY_KEY.set(key, logoUrl);
    const host = readEndpointHost(alias);
    if (host) REVIEW_ONLY_LOGO_BY_ENDPOINT_HOST.set(host, logoUrl);
  }
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function cleanCommandToken(value: string): string {
  return value.trim().replace(/^['"`]+|['"`,]+$/g, "");
}

function commandTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map(cleanCommandToken)
    .filter(Boolean);
}

function pushCandidate(
  candidates: WorkflowImportCatalogCandidate[],
  value: string,
  kind: WorkflowImportCatalogCandidateKind,
) {
  const trimmed = value.trim();
  if (trimmed) candidates.push({ value: trimmed, kind });
}

function catalogCandidatesFromRecord(
  record: Record<string, unknown>,
  name: string,
): WorkflowImportCatalogCandidate[] {
  const candidates: WorkflowImportCatalogCandidate[] = [];
  pushCandidate(
    candidates,
    readRecordString(record, ["catalog_app_id", "catalogAppId", "app_id", "appId"]),
    "catalog_id",
  );
  pushCandidate(candidates, name, "identity");
  pushCandidate(candidates, readRecordString(record, ["id"]), "identity");
  pushCandidate(candidates, readRecordString(record, ["officialName", "official_name"]), "identity");
  pushCandidate(candidates, readRecordString(record, ["providerName", "provider_name"]), "identity");
  pushCandidate(candidates, readRecordString(record, ["host"]), "endpoint");

  const packageValue = readRecordString(record, ["package", "packageName", "package_name"]);
  pushCandidate(candidates, packageValue, "package");
  for (const token of commandTokens(packageValue)) pushCandidate(candidates, token, "package");

  const commandValue = readRecordString(record, ["command"]);
  pushCandidate(candidates, commandValue, "command");
  for (const token of commandTokens(commandValue)) pushCandidate(candidates, token, "command");

  pushCandidate(
    candidates,
    readRecordString(record, ["endpoint_url", "endpointUrl", "endpoint", "url", "server"]),
    "endpoint",
  );
  return candidates;
}

function reviewLogoCandidatesFromRecord(
  record: Record<string, unknown>,
  name: string,
): WorkflowImportCatalogCandidate[] {
  const candidates = catalogCandidatesFromRecord(record, name);
  for (const key of ["docsUrl", "docs_url", "packageUrl", "package_url", "sourceUrl", "source_url"]) {
    pushCandidate(candidates, readRecordString(record, [key]), "endpoint");
  }
  return candidates;
}

function findCatalogAppForCandidate(candidate: WorkflowImportCatalogCandidate): DiscoverAppCatalogEntry | null {
  if (candidate.kind === "catalog_id") {
    const directId = candidate.value.trim().toLowerCase();
    return DISCOVER_APP_CATALOG.find((app) => app.id === directId) ?? null;
  }

  if (candidate.kind === "endpoint") {
    const host = readEndpointHost(candidate.value);
    if (host) {
      const appId = DISCOVER_APP_ID_BY_ENDPOINT_HOST.get(host);
      if (appId) return DISCOVER_APP_CATALOG.find((app) => app.id === appId) ?? null;
    }
  }

  const key = normalizeCommunityWorkflowImportCandidateKey(candidate.value);
  if (!key) return null;
  const appId = DISCOVER_APP_ID_BY_KEY.get(key);
  if (appId) return DISCOVER_APP_CATALOG.find((app) => app.id === appId) ?? null;
  return null;
}

function findReviewOnlyLogo(candidates: WorkflowImportCatalogCandidate[]): string | null {
  for (const candidate of candidates) {
    const host = readEndpointHost(candidate.value);
    if (host) {
      const endpointLogo = REVIEW_ONLY_LOGO_BY_ENDPOINT_HOST.get(host);
      if (endpointLogo) return endpointLogo;
    }
    const key = normalizeCommunityWorkflowImportCandidateKey(candidate.value);
    const direct = REVIEW_ONLY_LOGO_BY_KEY.get(key);
    if (direct) return direct;
  }
  return null;
}

export function resolveCommunityWorkflowImportMcpCatalogMatch(args: {
  record: Record<string, unknown>;
  name: string;
}): CommunityWorkflowImportCatalogMatch {
  const catalogCandidates = catalogCandidatesFromRecord(args.record, args.name);
  const reviewLogoCandidates = reviewLogoCandidatesFromRecord(args.record, args.name);
  const app = catalogCandidates
    .map(findCatalogAppForCandidate)
    .find((candidate): candidate is DiscoverAppCatalogEntry => Boolean(candidate)) ?? null;
  if (!app) {
    return {
      app: null,
      catalogAppId: null,
      appName: null,
      endpointUrl: null,
      authType: null,
      logoUrl: null,
      logoUrlDark: null,
      reviewLogoUrl: findReviewOnlyLogo(reviewLogoCandidates),
      connectable: false,
      reason: "No vetted PolyNet catalog app matched this MCP candidate.",
    };
  }

  const reviewLogoUrl = getReviewCatalogLogoUrl(app);
  if (
    app.personalConnect.connectionKind !== "known" ||
    app.personalConnect.availability !== "ready"
  ) {
    return {
      app,
      catalogAppId: app.id,
      appName: app.name,
      endpointUrl:
        app.personalConnect.connectionKind === "known"
          ? app.personalConnect.endpointUrl ?? null
          : null,
      authType:
        app.personalConnect.connectionKind === "known"
          ? app.personalConnect.authType ?? null
          : null,
      logoUrl: app.logoUrl ?? null,
      logoUrlDark: app.logoUrlDark ?? null,
      reviewLogoUrl,
      connectable: false,
      reason: `${app.name} is recognized, but its catalog connection is not ready for automatic community mounting.`,
    };
  }

  const endpointUrl = app.personalConnect.endpointUrl ?? null;
  const authType = app.personalConnect.authType ?? null;
  const connectable = Boolean(endpointUrl && authType);
  return {
    app,
    catalogAppId: app.id,
    appName: app.name,
    endpointUrl,
    authType,
    logoUrl: app.logoUrl ?? null,
    logoUrlDark: app.logoUrlDark ?? null,
    reviewLogoUrl,
    connectable,
    reason: connectable
      ? "Matched a vetted PolyNet catalog app with a ready connection profile."
      : `${app.name} is recognized, but its catalog endpoint or auth type is incomplete.`,
  };
}
