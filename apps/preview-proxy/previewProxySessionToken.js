const PREVIEW_PROXY_TOKEN_VERSION = 1;
const VALID_PREVIEW_PROXY_KINDS = new Set(["workspace_preview", "live_desktop"]);

function readPreviewProxySigningSecret() {
  return String(
    process.env.POLYNET_PREVIEW_PROXY_SIGNING_SECRET ??
      process.env.ARX_PREVIEW_PROXY_SIGNING_SECRET ??
      "",
  ).trim();
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlToBytes(value) {
  const normalized = String(value ?? "").trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

async function importSigningKey(secret, usages) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function mintPreviewProxySessionToken(params) {
  const secret = readPreviewProxySigningSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: "preview_proxy_misconfigured",
      message: "Preview proxy signing secret is not configured.",
    };
  }
  if (!VALID_PREVIEW_PROXY_KINDS.has(params.kind)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Preview proxy token kind is invalid.",
    };
  }
  let normalizedPreviewUrl = "";
  try {
    normalizedPreviewUrl = new URL(String(params.previewUrl ?? "").trim()).toString();
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Preview proxy URL is invalid.",
    };
  }
  const expiresAtMs = Math.floor(Number(params.expiresAtMs));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return {
      ok: false,
      status: 401,
      code: "preview_session_expired",
      message: "Preview session has expired.",
    };
  }
  const payload = {
    v: PREVIEW_PROXY_TOKEN_VERSION,
    kind: params.kind,
    u: normalizedPreviewUrl,
    t: typeof params.previewToken === "string" && params.previewToken.trim() ? params.previewToken.trim() : null,
    exp: expiresAtMs,
  };
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const signingKey = await importSigningKey(secret, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, encodedPayload));
  return {
    ok: true,
    token: `${encodeBase64Url(encodedPayload)}.${encodeBase64Url(signature)}`,
  };
}

export async function verifyPreviewProxySessionToken(rawToken) {
  const secret = readPreviewProxySigningSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: "preview_proxy_misconfigured",
      message: "Preview proxy signing secret is not configured.",
    };
  }
  const token = String(rawToken ?? "").trim();
  const separatorIndex = token.indexOf(".");
  if (!token || separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Invalid or missing preview session.",
    };
  }
  const encodedPayload = token.slice(0, separatorIndex);
  const encodedSignature = token.slice(separatorIndex + 1);
  let payloadBytes;
  let signatureBytes;
  try {
    payloadBytes = decodeBase64UrlToBytes(encodedPayload);
    signatureBytes = decodeBase64UrlToBytes(encodedSignature);
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Invalid or missing preview session.",
    };
  }
  const signingKey = await importSigningKey(secret, ["verify"]);
  const signatureValid = await crypto.subtle.verify("HMAC", signingKey, signatureBytes, payloadBytes);
  if (!signatureValid) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Invalid or missing preview session.",
    };
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Invalid or missing preview session.",
    };
  }
  if (
    payload?.v !== PREVIEW_PROXY_TOKEN_VERSION ||
    !VALID_PREVIEW_PROXY_KINDS.has(payload?.kind) ||
    typeof payload?.u !== "string" ||
    !payload.u.trim() ||
    (payload?.t !== null && typeof payload?.t !== "string") ||
    !Number.isFinite(Number(payload?.exp))
  ) {
    return {
      ok: false,
      status: 400,
      code: "invalid_preview_proxy_token",
      message: "Invalid or missing preview session.",
    };
  }
  const expiresAtMs = Math.floor(Number(payload.exp));
  if (expiresAtMs <= Date.now()) {
    return {
      ok: false,
      status: 401,
      code: "preview_session_expired",
      message: "Preview session has expired.",
    };
  }
  return {
    ok: true,
    payload: {
      kind: payload.kind,
      previewUrl: new URL(payload.u),
      previewToken: typeof payload.t === "string" && payload.t.trim() ? payload.t.trim() : null,
      expiresAtMs,
    },
  };
}
