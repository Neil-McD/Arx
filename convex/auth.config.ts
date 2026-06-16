import type { AuthConfig } from "convex/server";

function readEnv(name: string): string {
  const value = String((globalThis as any)?.process?.env?.[name] ?? "").trim();
  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const issuer = readEnv("ARX_AUTH_JWT_ISSUER");

const explicitJwks = readEnv("ARX_AUTH_JWT_JWKS_URL");
const jwks = explicitJwks || (issuer ? `${trimTrailingSlash(issuer)}/.well-known/jwks.json` : "");

const primaryApplicationID =
  readEnv("ARX_AUTH_JWT_AUDIENCE") || readEnv("ARX_AUTH_JWT_APPLICATION_ID") || readEnv("ARX_AUTH_CLIENT_ID");
const mcpApplicationID = readEnv("ARX_MCP_AUTH_JWT_AUDIENCE");
const applicationIDs = Array.from(
  new Set([
    primaryApplicationID,
    mcpApplicationID,
  ].filter(Boolean)),
);
const workOsClientId = readEnv("ARX_AUTH_CLIENT_ID") || primaryApplicationID;
const algorithmRaw = readEnv("ARX_AUTH_JWT_ALGORITHM").toUpperCase();
const algorithm: "RS256" | "ES256" = algorithmRaw === "ES256" ? "ES256" : "RS256";

if (issuer && jwks && applicationIDs.length === 0) {
  throw new Error("ARX_AUTH_JWT_AUDIENCE or ARX_AUTH_CLIENT_ID is required for JWT audience binding.");
}

if (issuer && jwks && !mcpApplicationID) {
  throw new Error("ARX_MCP_AUTH_JWT_AUDIENCE is required for hosted MCP JWT audience binding.");
}

const providers: AuthConfig["providers"] = [];

if (issuer && jwks) {
  for (const applicationID of applicationIDs) {
    providers.push({
      type: "customJwt",
      issuer,
      jwks,
      algorithm,
      applicationID,
    });
  }
}

if (workOsClientId) {
  const workOsJwks = `https://api.workos.com/sso/jwks/${workOsClientId}`;
  providers.push({
    type: "customJwt",
    issuer: "https://api.workos.com/",
    algorithm: "RS256",
    applicationID: workOsClientId,
    jwks: workOsJwks,
  });
  providers.push({
    type: "customJwt",
    issuer: `https://api.workos.com/user_management/${workOsClientId}`,
    algorithm: "RS256",
    // WorkOS user-management access tokens are client-specific by issuer and
    // client_id, but do not carry aud; Convex applicationID validates aud.
    jwks: workOsJwks,
  });
}

export default {
  providers,
} satisfies AuthConfig;
