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

const applicationID =
  readEnv("ARX_AUTH_JWT_AUDIENCE") || readEnv("ARX_AUTH_JWT_APPLICATION_ID") || readEnv("ARX_AUTH_CLIENT_ID");
const workOsClientId = readEnv("ARX_AUTH_CLIENT_ID") || applicationID;
const algorithmRaw = readEnv("ARX_AUTH_JWT_ALGORITHM").toUpperCase();
const algorithm: "RS256" | "ES256" = algorithmRaw === "ES256" ? "ES256" : "RS256";

if (issuer && jwks && !applicationID) {
  throw new Error("ARX_AUTH_JWT_AUDIENCE or ARX_AUTH_CLIENT_ID is required for JWT audience binding.");
}

const providers: AuthConfig["providers"] = [];

if (issuer && jwks) {
  providers.push({
    type: "customJwt",
    issuer,
    jwks,
    algorithm,
    applicationID,
  });
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
