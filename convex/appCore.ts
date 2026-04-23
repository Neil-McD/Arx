export type DeveloperAppAuthType = "api_key" | "bearer" | "none";
export type DeveloperAppStatus = "draft" | "valid" | "invalid";
export type AppConnectionStatus = "connected" | "error";
export type AppToolValidationStatus = "ok" | "error";

export type DeveloperAppRow = {
  _id: any;
  ownerUserId: any;
  catalogAppId?: string;
  name: string;
  slug: string;
  description?: string;
  endpointUrl: string;
  authType: DeveloperAppAuthType;
  status: DeveloperAppStatus;
  activeSnapshotId?: any;
  lastValidatedAt?: number;
  lastValidationError?: string;
  createdAt: number;
  updatedAt: number;
};

export type AppConnectionRow = {
  _id: any;
  developerAppId: any;
  connectionStatus: AppConnectionStatus;
  encryptedSecretHex?: string;
  secretIvHex?: string;
  secretVersion?: number;
  lastValidatedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type AppToolSnapshotRow = {
  _id: any;
  developerAppId: any;
  snapshotVersion: string;
  endpointUrl: string;
  validationStatus: AppToolValidationStatus;
  validationError?: string;
  toolsJson: unknown;
  fetchedAt: number;
  createdAt: number;
};

const MAX_APP_NAME_LENGTH = 120;
const MAX_APP_CATALOG_ID_LENGTH = 120;
const MAX_APP_SLUG_LENGTH = 80;
const MAX_APP_DESCRIPTION_LENGTH = 2_000;
const MAX_ENDPOINT_URL_LENGTH = 1_000;

function isPrivateOrSpecialIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  if (isPrivateOrSpecialIpv4(normalized)) return true;
  if (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.")
  ) {
    return true;
  }
  if (!normalized.includes(".")) return true;
  return false;
}

export function normalizeString(value: unknown, maxLength = 10_000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeDeveloperAppName(value: unknown): string {
  return normalizeString(value, MAX_APP_NAME_LENGTH);
}

export function normalizeDeveloperAppCatalogId(value: unknown): string {
  return normalizeString(value, MAX_APP_CATALOG_ID_LENGTH).toLowerCase();
}

export function normalizeDeveloperAppDescription(value: unknown): string {
  return normalizeString(value, MAX_APP_DESCRIPTION_LENGTH);
}

export function normalizeDeveloperAppSlug(value: unknown, fallback = ""): string {
  const base = normalizeString(value || fallback, MAX_APP_SLUG_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, MAX_APP_SLUG_LENGTH);
}

export function normalizeDeveloperAppEndpointUrl(value: unknown): string {
  const raw = normalizeString(value, MAX_ENDPOINT_URL_LENGTH);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (isLocalOrPrivateHostname(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isDeveloperAppAuthType(value: unknown): value is DeveloperAppAuthType {
  return value === "api_key" || value === "bearer" || value === "none";
}

export function buildDisconnectedConnectionReadModel(app: DeveloperAppRow) {
  return {
    connection_status: app.authType === "none" ? ("connected" as const) : ("disconnected" as const),
  };
}

export function mapAppConnectionReadModel(app: DeveloperAppRow, row: AppConnectionRow | null) {
  if (!row) return buildDisconnectedConnectionReadModel(app);
  return {
    connection_status: row.connectionStatus,
  };
}

export function mapDeveloperAppReadModel(app: DeveloperAppRow) {
  return {
    catalog_app_id: app.catalogAppId ?? null,
    name: app.name,
    slug: app.slug,
    endpoint_url: app.endpointUrl,
    auth_type: app.authType,
    status: app.status,
  };
}
