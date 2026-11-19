import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetMcpAccessTokenKeysForTest, verifyMcpAccessToken, type McpAccessTokenConfig } from "../shared/mcpAccessToken.ts";

// The MCP door checks an outside AI's token itself (shared/mcpAccessToken.ts),
// and the backend's general sign-in never accepts one (convex/auth.config.ts).

const MCP = "https://www.polynet.ai/runtime/mcp";
const ISSUER = "https://auth.example.test";
const JWKS = `${ISSUER}/oauth2/jwks`;
const config: McpAccessTokenConfig = { issuer: ISSUER, jwksUrl: JWKS, audience: MCP, algorithm: "RS256" };
const NOW = 1_800_000_000_000;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function keyPair() {
  return await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

async function sign(privateKey: CryptoKey, header: Record<string, unknown>, claims: Record<string, unknown>) {
  const head = `${b64json(header)}.${b64json(claims)}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(head)));
  return `${head}.${b64url(signature)}`;
}

let provider: CryptoKeyPair;
let stranger: CryptoKeyPair;
let fetches = 0;
const fetcher = (async (url: string) => {
  fetches += 1;
  if (url !== JWKS) return new Response("no", { status: 404 });
  const jwk = await crypto.subtle.exportKey("jwk", provider.publicKey);
  return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] });
}) as unknown as typeof fetch;

const good = { iss: ISSUER, sub: "user_1", aud: MCP, exp: NOW / 1000 + 3600, iat: NOW / 1000, email: "a@example.test" };
const check = (token: string, overrides: Partial<McpAccessTokenConfig> = {}) =>
  verifyMcpAccessToken(token, { ...config, ...overrides }, { fetcher, nowMs: NOW });

beforeEach(async () => {
  resetMcpAccessTokenKeysForTest();
  fetches = 0;
  provider ??= await keyPair();
  stranger ??= await keyPair();
});
afterEach(() => vi.unstubAllEnvs());

test("an outside AI's token works at the MCP door when the provider signed it for this door and it is in date", async () => {
  expect(await check(await sign(provider.privateKey, { alg: "RS256", kid: "k1" }, good))).toMatchObject({ ok: true, claims: { sub: "user_1", email: "a@example.test" } });
  // Among other audiences, and with a trailing slash on the issuer, too.
  expect(await check(await sign(provider.privateKey, { alg: "RS256", kid: "k1" }, { ...good, aud: ["other", MCP], iss: `${ISSUER}/` }))).toMatchObject({ ok: true });
  // Keys are fetched once and reused.
  await check(await sign(provider.privateKey, { alg: "RS256", kid: "k1" }, good));
  expect(fetches).toBe(1);
});

test("the door refuses everything else", async () => {
  const head = { alg: "RS256", kid: "k1" };
  const refused = async (token: string, reason: string, overrides?: Partial<McpAccessTokenConfig>) =>
    expect(await check(token, overrides)).toEqual({ ok: false, reason });
  // A Studio browser token (no aud) or another app's token.
  await refused(await sign(provider.privateKey, head, { ...good, aud: undefined }), "wrong_audience");
  await refused(await sign(provider.privateKey, head, { ...good, aud: "studio-client" }), "wrong_audience");
  // Someone else's issuer, an old token, one not valid yet, one with no person.
  await refused(await sign(provider.privateKey, head, { ...good, iss: "https://evil.example.test" }), "wrong_issuer");
  await refused(await sign(provider.privateKey, head, { ...good, exp: NOW / 1000 - 120 }), "expired");
  await refused(await sign(provider.privateKey, head, { ...good, exp: undefined }), "expired");
  await refused(await sign(provider.privateKey, head, { ...good, nbf: NOW / 1000 + 600 }), "not_yet_valid");
  await refused(await sign(provider.privateKey, head, { ...good, sub: "" }), "no_subject");
  // Forged: signed by another key under the provider's key id, or edited after signing.
  await refused(await sign(stranger.privateKey, head, good), "bad_signature");
  const real = await sign(provider.privateKey, head, good);
  const [h, , sig] = real.split(".");
  await refused(`${h}.${b64json({ ...good, sub: "user_2" })}.${sig}`, "bad_signature");
  // Unsigned or another algorithm, an unknown key, junk.
  await refused(`${b64json({ alg: "none", kid: "k1" })}.${b64json(good)}.x`, "wrong_algorithm");
  await refused(await sign(provider.privateKey, { alg: "HS256", kid: "k1" }, good), "wrong_algorithm");
  await refused(await sign(provider.privateKey, { alg: "RS256", kid: "k9" }, good), "unknown_key");
  await refused(await sign(provider.privateKey, { alg: "RS256" }, good), "no_key_id");
  await refused("not-a-jwt", "malformed");
  await refused("", "malformed");
  // Unconfigured: fail closed.
  await refused(real, "not_configured", { audience: "" });
  await refused(real, "not_configured", { issuer: "" });
});

test("the backend's general sign-in does not accept the MCP audience", async () => {
  vi.stubEnv("ARX_AUTH_JWT_ISSUER", ISSUER);
  vi.stubEnv("ARX_AUTH_JWT_JWKS_URL", JWKS);
  vi.stubEnv("ARX_AUTH_JWT_AUDIENCE", "client_studio");
  vi.stubEnv("ARX_AUTH_CLIENT_ID", "client_studio");
  vi.stubEnv("ARX_MCP_AUTH_JWT_AUDIENCE", MCP);
  vi.resetModules();
  const { default: authConfig } = await import("./auth.config.ts");
  const audiences = authConfig.providers.map((provider: any) => provider.applicationID);
  expect(audiences).toContain("client_studio");
  expect(audiences).not.toContain(MCP);
  // Still required: the MCP door needs it.
  vi.stubEnv("ARX_MCP_AUTH_JWT_AUDIENCE", "");
  vi.resetModules();
  await expect(import("./auth.config.ts")).rejects.toThrow("ARX_MCP_AUTH_JWT_AUDIENCE is required");
});
