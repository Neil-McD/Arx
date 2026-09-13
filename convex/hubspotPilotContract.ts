// Dashboard-verified schemas, 2026-09-11. Pure contract, not a live executor.
export const HUBSPOT_PILOT_VERSION = "20260826_00";
export const HUBSPOT_CONTACT_READ_SCOPE = "crm.objects.contacts.read";
// A required permission is not a ceiling: reject every additional data grant.
export function hubSpotPilotScopesAllowed(scopes: readonly string[]): boolean {
  return scopes.includes(HUBSPOT_CONTACT_READ_SCOPE) &&
    scopes.every(scope => scope === HUBSPOT_CONTACT_READ_SCOPE || scope === "oauth");
}
export const HUBSPOT_SCOPE_REQUEST = Object.freeze({
  tool: "HUBSPOT_LIST_GRANTED_SCOPES" as const,
  version: HUBSPOT_PILOT_VERSION,
  arguments: Object.freeze({ include_token: false as const }),
});
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function successfulData(raw: unknown): Record<string, unknown> | null {
  try {
    const serialized = JSON.stringify(raw);
    if (!serialized || serialized.length > 16_384 || !record(raw) ||
      raw.successful !== true || !record(raw.data) ||
      (raw.error !== undefined && raw.error !== "")) return null;
    return raw.data;
  } catch {
    return null;
  }
}

// Only portal identity and granted scopes cross this boundary; secrets are discarded.
// A future caller must admit/account for the scope tool call before executing it.
export function parseHubSpotConnectionMetadata(raw: unknown): { portalId: string; scopes: string[] } | null {
  const data = successfulData(raw);
  if (!data || !Array.isArray(data.scopes) || data.scopes.length > 256 ||
    !data.scopes.every(scope => typeof scope === "string" &&
      scope.length > 0 && scope.length <= 256 && scope.trim() === scope)) return null;
  const portalId = typeof data.hub_id === "number" && Number.isSafeInteger(data.hub_id)
    ? String(data.hub_id) : data.hub_id;
  if (typeof portalId !== "string" || !/^[1-9][0-9]{0,31}$/.test(portalId)) return null;
  return { portalId, scopes: [...new Set(data.scopes as string[])] };
}

export function parseHubSpotContact(raw: unknown, contactId: string):
  { id: string; properties: Record<string, string>; untrusted: true } | null {
  const data = successfulData(raw);
  if (!data || typeof data.id !== "string" || data.id !== contactId ||
    data.archived !== false || typeof data.createdAt !== "string" ||
    typeof data.updatedAt !== "string" || !record(data.properties)) return null;
  // The provider schema permits string/null values; omitted individual names are valid.
  if (!Object.values(data.properties).every(value => value === null || typeof value === "string"))
    return null;
  const properties: Record<string, string> = {};
  for (const key of ["firstname", "lastname"]) {
    const field = data.properties[key];
    if (typeof field === "string") properties[key] = field.slice(0, 256);
  }
  return { id: contactId, properties, untrusted: true };
}
