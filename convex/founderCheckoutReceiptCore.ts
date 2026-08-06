const FOUNDER_CHECKOUT_CLAIM_HASH_PREFIX = "polynet_founder_checkout_claim_v1:";
const FOUNDER_CHECKOUT_ATTEMPT_HASH_PREFIX = "polynet_founder_checkout_attempt_v1:";
export const FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION = "hmac_sha256_v1";

function readFounderCheckoutRecoverySecret(): string {
  const value = String(
    (globalThis as any)?.process?.env?.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET ?? "",
  ).trim();
  if (value.length < 32) {
    throw new Error("founder_checkout_recovery_secret_missing");
  }
  return value;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function requireFounderCheckoutRecoverySecret(): void {
  readFounderCheckoutRecoverySecret();
}

export function normalizeFounderCheckoutRecoveryEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("founder_checkout_recovery_email_invalid");
  }
  return email;
}

export async function hashFounderCheckoutRecoveryEmail(raw: unknown): Promise<string> {
  const email = normalizeFounderCheckoutRecoveryEmail(raw);
  return await hmacSha256(
    readFounderCheckoutRecoverySecret(),
    `${FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION}:${email}`,
  );
}

function normalizeOpaqueBrowserValue(
  raw: unknown,
  errorCode: string,
  maxLength: number,
): string {
  const value = String(raw ?? "").trim();
  if (value.length < 20 || value.length > maxLength || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(errorCode);
  }
  return value;
}

export function normalizeFounderCheckoutClaimToken(raw: unknown): string {
  return normalizeOpaqueBrowserValue(raw, "founder_checkout_claim_token_invalid", 300);
}

export function normalizeFounderCheckoutAttemptId(raw: unknown): string {
  return normalizeOpaqueBrowserValue(raw, "founder_checkout_attempt_id_invalid", 200);
}

export async function hashFounderCheckoutClaimToken(raw: unknown): Promise<string> {
  const token = normalizeFounderCheckoutClaimToken(raw);
  return await sha256(`${FOUNDER_CHECKOUT_CLAIM_HASH_PREFIX}${token}`);
}

export async function hashFounderCheckoutAttemptId(raw: unknown): Promise<string> {
  const attemptId = normalizeFounderCheckoutAttemptId(raw);
  return await sha256(`${FOUNDER_CHECKOUT_ATTEMPT_HASH_PREFIX}${attemptId}`);
}
