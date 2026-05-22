import type { DeveloperAppAuthType } from "./communityAppMountTypes.ts";
import { normalizeCommunityWorkflowImportCandidateKey } from "./communityWorkflowImportCandidateIds.ts";
import {
  COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY,
  type CommunityWorkflowImportMcpRegistryEntry,
  type CommunityWorkflowImportMcpRegistryStatus,
} from "./communityWorkflowImportMcpRegistry.ts";
import {
  DISCOVER_APP_CATALOG,
  type DiscoverAppCatalogEntry,
} from "./discoverCatalog.ts";

export type CommunityWorkflowImportMcpMatchSource =
  | "catalog_id"
  | "registry_id"
  | "endpoint_host"
  | "package"
  | "command"
  | "identity";

export type CommunityWorkflowImportCatalogMatch = {
  app: DiscoverAppCatalogEntry | null;
  catalogAppId: string | null;
  registryId: string | null;
  appName: string | null;
  endpointUrl: string | null;
  authType: DeveloperAppAuthType | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  reviewLogoUrl: string | null;
  connectable: boolean;
  status: CommunityWorkflowImportMcpRegistryStatus;
  matchedBy: CommunityWorkflowImportMcpMatchSource | null;
  sourceTransport: string | null;
  remoteTransport: string | null;
  requiredSecretNames: string[];
  requiredConfigParams: string[];
  portabilityClassification: string | null;
  reason: string | null;
};

const DISCOVER_APP_BY_ID = new Map<string, DiscoverAppCatalogEntry>();
const DISCOVER_APP_BY_KEY = new Map<string, DiscoverAppCatalogEntry>();
const DISCOVER_APP_BY_ENDPOINT_HOST = new Map<
  string,
  DiscoverAppCatalogEntry
>();
const REGISTRY_BY_ID = new Map<
  string,
  CommunityWorkflowImportMcpRegistryEntry
>();
const REGISTRY_BY_CATALOG_ID = new Map<
  string,
  CommunityWorkflowImportMcpRegistryEntry
>();
const REGISTRY_BY_ENDPOINT_HOST = new Map<
  string,
  CommunityWorkflowImportMcpRegistryEntry
>();
const REGISTRY_BY_KEY = new Map<
  string,
  CommunityWorkflowImportMcpRegistryEntry
>();

type WorkflowImportCatalogCandidateKind =
  | "catalog_id"
  | "registry_id"
  | "identity"
  | "package"
  | "command"
  | "endpoint";

type WorkflowImportCatalogCandidate = {
  value: string;
  kind: WorkflowImportCatalogCandidateKind;
};

type WorkflowImportCatalogAppMatch = {
  app: DiscoverAppCatalogEntry;
  matchedBy: CommunityWorkflowImportMcpMatchSource;
};

for (const app of DISCOVER_APP_CATALOG) {
  DISCOVER_APP_BY_ID.set(app.id, app);
  addDiscoverAppKey(app.id, app);
  addDiscoverAppKey(app.name, app);
  if (
    app.personalConnect.connectionKind === "known" &&
    app.personalConnect.endpointUrl
  ) {
    addDiscoverAppEndpointHost(app.personalConnect.endpointUrl, app);
  }
}

function normalizeEndpointHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function looksLikeEndpointHostInput(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed);
}

function readEndpointHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || !looksLikeEndpointHostInput(trimmed))
    return null;
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

function addRegistryKey(
  key: string,
  entry: CommunityWorkflowImportMcpRegistryEntry,
) {
  const normalizedKey = normalizeCommunityWorkflowImportCandidateKey(key);
  if (!normalizedKey) return;
  REGISTRY_BY_KEY.set(normalizedKey, entry);
}

function addRegistryEndpointHost(
  value: string,
  entry: CommunityWorkflowImportMcpRegistryEntry,
) {
  const host = readEndpointHost(value);
  if (!host) return;
  REGISTRY_BY_ENDPOINT_HOST.set(host, entry);
}

function addDiscoverAppKey(key: string, app: DiscoverAppCatalogEntry) {
  const normalizedKey = normalizeCommunityWorkflowImportCandidateKey(key);
  if (!normalizedKey) return;
  DISCOVER_APP_BY_KEY.set(normalizedKey, app);
}

function addDiscoverAppEndpointHost(
  value: string,
  app: DiscoverAppCatalogEntry,
) {
  const host = readEndpointHost(value);
  if (!host) return;
  DISCOVER_APP_BY_ENDPOINT_HOST.set(host, app);
}

for (const entry of COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY) {
  REGISTRY_BY_ID.set(entry.id, entry);
  addRegistryKey(entry.id, entry);
  addRegistryKey(entry.name, entry);
  if (entry.catalogAppId) {
    REGISTRY_BY_CATALOG_ID.set(entry.catalogAppId, entry);
    addRegistryKey(entry.catalogAppId, entry);
  }
  for (const alias of entry.aliases) addRegistryKey(alias, entry);
  for (const packageName of entry.packageNames)
    addRegistryKey(packageName, entry);
  for (const commandToken of entry.commandTokens)
    addRegistryKey(commandToken, entry);
  for (const endpointHost of entry.endpointHosts)
    addRegistryEndpointHost(endpointHost, entry);
  for (const docsUrl of entry.docsUrls) addRegistryKey(docsUrl, entry);
  for (const sourceUrl of entry.sourceUrls) addRegistryKey(sourceUrl, entry);
}

function getReviewCatalogLogoUrl(app: DiscoverAppCatalogEntry): string | null {
  return app.logoUrlDark ?? app.logoUrl ?? null;
}

function getReviewRegistryLogoUrl(
  entry: CommunityWorkflowImportMcpRegistryEntry,
): string | null {
  return entry.reviewLogoUrl ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readRecordString(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
  }
  return "";
}

function readNestedRecord(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record[key];
    if (isPlainObject(value)) return value;
  }
  return null;
}

function readNestedRecordString(
  record: Record<string, unknown>,
  parentKeys: string[],
  keys: string[],
): string {
  const parent = readNestedRecord(record, parentKeys);
  return parent ? readRecordString(parent, keys) : "";
}

function readNestedStringArray(
  record: Record<string, unknown>,
  parentKeys: string[],
  keys: string[],
): string[] {
  const parent = readNestedRecord(record, parentKeys);
  if (!parent) return [];
  for (const key of keys) {
    const value = parent[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string" && item.trim()) return item.trim();
          if (typeof item === "number" || typeof item === "boolean")
            return String(item);
          return "";
        })
        .filter(Boolean);
    }
  }
  return [];
}

function readRecordStringArray(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string" && item.trim()) return item.trim();
          if (typeof item === "number" || typeof item === "boolean")
            return String(item);
          return "";
        })
        .filter(Boolean);
    }
  }
  return [];
}

function cleanCommandToken(value: string): string {
  return value.trim().replace(/^['"`]+|['"`,]+$/g, "");
}

function commandTokens(value: string): string[] {
  return value.split(/\s+/).map(cleanCommandToken).filter(Boolean);
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
    readRecordString(record, [
      "polynetRegistryId",
      "polynet_registry_id",
      "registryId",
      "registry_id",
    ]),
    "registry_id",
  );
  pushCandidate(
    candidates,
    readRecordString(record, [
      "catalog_app_id",
      "catalogAppId",
      "app_id",
      "appId",
    ]),
    "catalog_id",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["officialConnection", "official_connection"],
      ["remoteEndpoint", "remote_endpoint"],
    ),
    "endpoint",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["sourceHarness", "source_harness"],
      ["url", "endpoint", "server"],
    ),
    "endpoint",
  );
  pushCandidate(
    candidates,
    readRecordString(record, [
      "endpoint_url",
      "endpointUrl",
      "endpoint",
      "url",
      "server",
    ]),
    "endpoint",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["officialIdentity", "official_identity"],
      ["packageName", "package_name"],
    ),
    "package",
  );
  pushCandidate(
    candidates,
    readRecordString(record, ["package", "packageName", "package_name"]),
    "package",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["officialIdentity", "official_identity"],
      [
        "sourceUrl",
        "source_url",
        "packageUrl",
        "package_url",
        "docsUrl",
        "docs_url",
      ],
    ),
    "endpoint",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["sourceHarness", "source_harness"],
      ["command"],
    ),
    "command",
  );
  pushCandidate(candidates, readRecordString(record, ["command"]), "command");
  pushCandidate(candidates, name, "identity");
  pushCandidate(candidates, readRecordString(record, ["id"]), "identity");
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["sourceHarness", "source_harness"],
      ["serverName", "server_name"],
    ),
    "identity",
  );
  pushCandidate(
    candidates,
    readNestedRecordString(
      record,
      ["officialIdentity", "official_identity"],
      [
        "providerName",
        "provider_name",
        "officialName",
        "official_name",
        "domain",
      ],
    ),
    "identity",
  );
  pushCandidate(
    candidates,
    readRecordString(record, [
      "officialName",
      "official_name",
      "providerName",
      "provider_name",
      "host",
    ]),
    "identity",
  );

  const expandedCandidates = [...candidates];
  for (const candidate of candidates) {
    if (candidate.kind === "command" || candidate.kind === "package") {
      for (const token of commandTokens(candidate.value)) {
        pushCandidate(expandedCandidates, token, candidate.kind);
      }
    }
  }
  return expandedCandidates;
}

function readSourceTransport(record: Record<string, unknown>): string | null {
  return (
    readNestedRecordString(
      record,
      ["sourceHarness", "source_harness"],
      ["transport"],
    ) ||
    readRecordString(record, [
      "transport",
      "sourceTransport",
      "source_transport",
    ]) ||
    (readNestedRecordString(
      record,
      ["sourceHarness", "source_harness"],
      ["command"],
    ) || readRecordString(record, ["command"])
      ? "stdio"
      : "") ||
    null
  );
}

function readRemoteTransport(
  record: Record<string, unknown>,
  entry: CommunityWorkflowImportMcpRegistryEntry | null,
): string | null {
  return (
    readNestedRecordString(
      record,
      ["officialConnection", "official_connection"],
      ["remoteTransport", "remote_transport"],
    ) ||
    readRecordString(record, ["remoteTransport", "remote_transport"]) ||
    entry?.supportedTransports[0] ||
    null
  );
}

function normalizeAuthType(value: string): DeveloperAppAuthType | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "none" ||
    normalized === "api_key" ||
    normalized === "bearer" ||
    normalized === "oauth"
  )
    return normalized;
  if (
    normalized === "api key" ||
    normalized === "apikey" ||
    normalized === "token"
  )
    return "api_key";
  if (normalized === "bearer_token" || normalized === "bearer token")
    return "bearer";
  return null;
}

function readRequiredSecretNames(
  record: Record<string, unknown>,
  entry: CommunityWorkflowImportMcpRegistryEntry | null,
): string[] {
  const fromOfficialConnection = readNestedStringArray(
    record,
    ["officialConnection", "official_connection"],
    ["requiredSecretNames", "required_secret_names"],
  );
  const fromFlat = readRecordStringArray(record, [
    "requiredSecretNames",
    "required_secret_names",
    "requiredEnvVars",
    "required_env_vars",
    "envVarNames",
    "env_var_names",
  ]);
  return [
    ...new Set([
      ...fromOfficialConnection,
      ...fromFlat,
      ...(entry?.requiredSecretNames ?? []),
    ]),
  ];
}

function readRequiredConfigParams(
  record: Record<string, unknown>,
  entry: CommunityWorkflowImportMcpRegistryEntry | null,
): string[] {
  const fromOfficialConnection = readNestedStringArray(
    record,
    ["officialConnection", "official_connection"],
    ["requiredConfigParams", "required_config_params"],
  );
  const fromFlat = readRecordStringArray(record, [
    "requiredConfigParams",
    "required_config_params",
  ]);
  return [
    ...new Set([
      ...fromOfficialConnection,
      ...fromFlat,
      ...(entry?.requiredConfigParams ?? []),
    ]),
  ];
}

function readPortabilityClassification(
  record: Record<string, unknown>,
  entry: CommunityWorkflowImportMcpRegistryEntry | null,
): string | null {
  return (
    readNestedRecordString(
      record,
      ["portability"],
      [
        "classification",
        "portabilityClassification",
        "portability_classification",
      ],
    ) ||
    entry?.status ||
    null
  );
}

function findRegistryEntryForCandidate(
  candidate: WorkflowImportCatalogCandidate,
): {
  entry: CommunityWorkflowImportMcpRegistryEntry;
  matchedBy: CommunityWorkflowImportMcpMatchSource;
} | null {
  if (candidate.kind === "registry_id") {
    const directId = candidate.value.trim().toLowerCase();
    const directEntry = REGISTRY_BY_ID.get(directId);
    if (directEntry) return { entry: directEntry, matchedBy: "registry_id" };
  }
  if (candidate.kind === "catalog_id") {
    const directId = candidate.value.trim().toLowerCase();
    const directEntry = REGISTRY_BY_CATALOG_ID.get(directId);
    if (directEntry) return { entry: directEntry, matchedBy: "catalog_id" };
  }
  if (candidate.kind === "endpoint") {
    const host = readEndpointHost(candidate.value);
    if (host) {
      const endpointEntry = REGISTRY_BY_ENDPOINT_HOST.get(host);
      if (endpointEntry)
        return { entry: endpointEntry, matchedBy: "endpoint_host" };
    }
  }

  const key = normalizeCommunityWorkflowImportCandidateKey(candidate.value);
  if (!key) return null;
  const keyEntry = REGISTRY_BY_KEY.get(key);
  if (!keyEntry) return null;
  if (candidate.kind === "package")
    return { entry: keyEntry, matchedBy: "package" };
  if (candidate.kind === "command")
    return { entry: keyEntry, matchedBy: "command" };
  return { entry: keyEntry, matchedBy: "identity" };
}

function findRegistryMatch(candidates: WorkflowImportCatalogCandidate[]): {
  entry: CommunityWorkflowImportMcpRegistryEntry;
  matchedBy: CommunityWorkflowImportMcpMatchSource;
} | null {
  const orderedKinds: WorkflowImportCatalogCandidateKind[] = [
    "registry_id",
    "catalog_id",
    "endpoint",
    "package",
    "command",
    "identity",
  ];
  for (const kind of orderedKinds) {
    for (const candidate of candidates) {
      if (candidate.kind !== kind) continue;
      const match = findRegistryEntryForCandidate(candidate);
      if (match) return match;
    }
  }
  return null;
}

function findCatalogAppForCandidate(
  candidate: WorkflowImportCatalogCandidate,
): WorkflowImportCatalogAppMatch | null {
  if (candidate.kind === "catalog_id") {
    const app = DISCOVER_APP_BY_ID.get(candidate.value.trim().toLowerCase());
    return app ? { app, matchedBy: "catalog_id" } : null;
  }
  if (candidate.kind === "endpoint") {
    const host = readEndpointHost(candidate.value);
    if (host) {
      const endpointApp = DISCOVER_APP_BY_ENDPOINT_HOST.get(host);
      if (endpointApp) return { app: endpointApp, matchedBy: "endpoint_host" };
    }
  }
  if (candidate.kind === "identity") {
    const key = normalizeCommunityWorkflowImportCandidateKey(candidate.value);
    if (!key) return null;
    const app = DISCOVER_APP_BY_KEY.get(key);
    return app ? { app, matchedBy: "identity" } : null;
  }
  return null;
}

function resolveCatalogApp(args: {
  candidates: WorkflowImportCatalogCandidate[];
  registryMatch: {
    entry: CommunityWorkflowImportMcpRegistryEntry;
    matchedBy: CommunityWorkflowImportMcpMatchSource;
  } | null;
}): WorkflowImportCatalogAppMatch | null {
  if (args.registryMatch?.entry.catalogAppId) {
    const app = DISCOVER_APP_BY_ID.get(args.registryMatch.entry.catalogAppId);
    return app ? { app, matchedBy: args.registryMatch.matchedBy } : null;
  }
  return (
    args.candidates
      .map(findCatalogAppForCandidate)
      .find(
        (candidate): candidate is WorkflowImportCatalogAppMatch =>
          Boolean(candidate),
      ) ?? null
  );
}

export function resolveCommunityWorkflowImportMcpCatalogMatch(args: {
  record: Record<string, unknown>;
  name: string;
}): CommunityWorkflowImportCatalogMatch {
  const candidates = catalogCandidatesFromRecord(args.record, args.name);
  const registryMatch = findRegistryMatch(candidates);
  const registryEntry = registryMatch?.entry ?? null;
  const catalogAppMatch = resolveCatalogApp({ candidates, registryMatch });
  const app = catalogAppMatch?.app ?? null;
  const matchedBy = registryMatch?.matchedBy ?? catalogAppMatch?.matchedBy ?? null;
  const sourceTransport = readSourceTransport(args.record);
  const remoteTransport = readRemoteTransport(args.record, registryEntry);
  const requiredSecretNames = readRequiredSecretNames(
    args.record,
    registryEntry,
  );
  const requiredConfigParams = readRequiredConfigParams(
    args.record,
    registryEntry,
  );
  const portabilityClassification = readPortabilityClassification(
    args.record,
    registryEntry,
  );
  const registryLogoUrl = registryEntry
    ? getReviewRegistryLogoUrl(registryEntry)
    : null;

  if (!app) {
    return {
      app: null,
      catalogAppId: registryEntry?.catalogAppId ?? null,
      registryId: registryEntry?.id ?? null,
      appName: registryEntry?.name ?? null,
      endpointUrl:
        readNestedRecordString(
          args.record,
          ["officialConnection", "official_connection"],
          ["remoteEndpoint", "remote_endpoint"],
        ) ||
        readRecordString(args.record, [
          "endpoint_url",
          "endpointUrl",
          "endpoint",
          "url",
        ]) ||
        null,
      authType:
        normalizeAuthType(
          readNestedRecordString(
            args.record,
            ["officialConnection", "official_connection"],
            ["authMode", "auth_mode"],
          ),
        ) ??
        normalizeAuthType(
          readRecordString(args.record, [
            "auth_type",
            "authType",
            "authMode",
            "auth_mode",
          ]),
        ) ??
        null,
      logoUrl: null,
      logoUrlDark: null,
      reviewLogoUrl: registryLogoUrl,
      connectable: false,
      status: registryEntry?.status ?? "unknown",
      matchedBy,
      sourceTransport,
      remoteTransport,
      requiredSecretNames,
      requiredConfigParams,
      portabilityClassification,
      reason:
        registryEntry?.reason ??
        "No vetted PolyNet catalog app matched this MCP candidate.",
    };
  }

  const reviewLogoUrl = getReviewCatalogLogoUrl(app);
  const catalogEndpointUrl =
    app.personalConnect.connectionKind === "known"
      ? (app.personalConnect.endpointUrl ?? null)
      : null;
  const catalogAuthType =
    app.personalConnect.connectionKind === "known"
      ? (app.personalConnect.authType ?? null)
      : null;

  if (
    app.personalConnect.connectionKind !== "known" ||
    app.personalConnect.availability !== "ready"
  ) {
    return {
      app,
      catalogAppId: app.id,
      registryId: registryEntry?.id ?? null,
      appName: app.name,
      endpointUrl: catalogEndpointUrl,
      authType: catalogAuthType,
      logoUrl: app.logoUrl ?? null,
      logoUrlDark: app.logoUrlDark ?? null,
      reviewLogoUrl,
      connectable: false,
      status: registryEntry?.status ?? "needs_config",
      matchedBy,
      sourceTransport,
      remoteTransport,
      requiredSecretNames,
      requiredConfigParams,
      portabilityClassification,
      reason:
        registryEntry?.reason ||
        `${app.name} is recognized, but its catalog connection is not ready for automatic community mounting.`,
    };
  }

  const endpointUrl = catalogEndpointUrl;
  const authType = catalogAuthType;
  const connectable = Boolean(endpointUrl && authType);
  return {
    app,
    catalogAppId: app.id,
    registryId: registryEntry?.id ?? null,
    appName: app.name,
    endpointUrl,
    authType,
    logoUrl: app.logoUrl ?? null,
    logoUrlDark: app.logoUrlDark ?? null,
    reviewLogoUrl,
    connectable,
    status: connectable ? "ready" : (registryEntry?.status ?? "needs_config"),
    matchedBy,
    sourceTransport,
    remoteTransport,
    requiredSecretNames,
    requiredConfigParams,
    portabilityClassification,
    reason: connectable
      ? "Matched a vetted PolyNet catalog app with a ready connection profile."
      : `${app.name} is recognized, but its catalog endpoint or auth type is incomplete.`,
  };
}
