import {
  bootstrapConvexAuthenticatedClient,
  type ConvexClient,
} from "./convexAuthenticatedClient";

export function coerceGatewayRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

export function firstGatewayRow<TRow>(payload: unknown): TRow | null {
  const rows = coerceGatewayRows<TRow>(payload);
  return rows[0] ?? null;
}

export function firstGatewayObjectRow(payload: unknown): Record<string, unknown> | null {
  const row = firstGatewayRow<Record<string, unknown>>(payload);
  return row && typeof row === "object" && !Array.isArray(row) ? row : null;
}

export function parseGatewayNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function bootstrapGatewayAuthContext<SessionT>(
  sessionRaw: SessionT,
): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

export async function bootstrapGatewayAuthContextIfAvailable<SessionT>(
  sessionRaw: SessionT,
  unavailableErrorCode = "convex_url_required",
): Promise<{
  client: ConvexClient;
  authSubject: string;
} | null> {
  try {
    return await bootstrapGatewayAuthContext(sessionRaw);
  } catch (error) {
    const message = String(error ?? "");
    if (message.includes(unavailableErrorCode)) return null;
    throw error;
  }
}

export function normalizeGatewayNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readGatewayConvexIdMaybe(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  return null;
}
