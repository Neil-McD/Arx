// The sign-in settings Polynet's MCP address publishes for AI apps
// (/.well-known/oauth-authorization-server). WorkOS AuthKit is the sign-in
// server; its own live settings are passed on as they are, so AI apps see
// everything it supports (the newer client registration, the issuer check,
// and whatever it adds later). If they can't be read, or don't name the same
// issuer, Polynet's own basic copy is used instead.
export type AuthServerMetadata = Record<string, unknown> & { issuer: string };

const trim = (value: string): string => value.replace(/\/+$/, "");

export function authServerMetadataUrl(issuer: string): string {
  return `${trim(issuer)}/.well-known/oauth-authorization-server`;
}

// The live settings, if they are a plain object for the same issuer with the
// endpoints a client needs; otherwise null (use the fallback).
export function acceptLiveAuthServerMetadata(live: unknown, issuer: string): AuthServerMetadata | null {
  if (!live || typeof live !== "object" || Array.isArray(live)) return null;
  const record = live as Record<string, unknown>;
  if (typeof record.issuer !== "string" || trim(record.issuer) !== trim(issuer)) return null;
  if (typeof record.authorization_endpoint !== "string" || typeof record.token_endpoint !== "string") return null;
  return record as AuthServerMetadata;
}
