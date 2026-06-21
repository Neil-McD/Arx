const PREVIEW_PROXY_TOKEN_VERSION = 1;
const VALID_PREVIEW_PROXY_KINDS = new Set<PreviewProxySessionKind>([
  "workspace_preview",
  "live_desktop",
]);

export type PreviewProxySessionKind = "workspace_preview" | "live_desktop";

type PreviewProxySessionPayload = {
  v: number;
  kind: PreviewProxySessionKind;
  u: string;
  t: string | null;
  exp: number;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore env access failures
  }
  return "";
}

function encodeBase64Url(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor) {
    return bufferCtor
      .from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  const btoaFn = (globalThis as any).btoa;
  if (typeof btoaFn !== "function") {
    throw new Error("preview_proxy_base64_unavailable");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoaFn(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function mintPreviewProxySessionToken(params: {
  kind: PreviewProxySessionKind;
  previewUrl: string;
  previewToken: string | null;
  expiresAtMs: number;
}): Promise<
  | { ok: true; token: string }
  | {
      ok: false;
      code: "preview_proxy_misconfigured" | "invalid_preview_proxy_payload";
      message: string;
    }
> {
  const secret =
    readEnv("POLYNET_PREVIEW_PROXY_SIGNING_SECRET") ||
    readEnv("ARX_PREVIEW_PROXY_SIGNING_SECRET");
  if (!secret) {
    return {
      ok: false,
      code: "preview_proxy_misconfigured",
      message: "Preview proxy signing secret is not configured.",
    };
  }
  if (!VALID_PREVIEW_PROXY_KINDS.has(params.kind)) {
    return {
      ok: false,
      code: "invalid_preview_proxy_payload",
      message: "Preview proxy token kind is invalid.",
    };
  }
  let normalizedPreviewUrl = "";
  try {
    normalizedPreviewUrl = new URL(String(params.previewUrl ?? "").trim()).toString();
  } catch {
    return {
      ok: false,
      code: "invalid_preview_proxy_payload",
      message: "Preview proxy URL is invalid.",
    };
  }
  const expiresAtMs = Math.floor(Number(params.expiresAtMs));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return {
      ok: false,
      code: "invalid_preview_proxy_payload",
      message: "Preview proxy token expiration is invalid.",
    };
  }
  const payload: PreviewProxySessionPayload = {
    v: PREVIEW_PROXY_TOKEN_VERSION,
    kind: params.kind,
    u: normalizedPreviewUrl,
    t: typeof params.previewToken === "string" && params.previewToken.trim() ? params.previewToken.trim() : null,
    exp: expiresAtMs,
  };
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const signingKey = await importSigningKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, encodedPayload));
  return {
    ok: true,
    token: `${encodeBase64Url(encodedPayload)}.${encodeBase64Url(signature)}`,
  };
}
