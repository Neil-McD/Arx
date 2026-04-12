function resolvePreviewOrigin(): string {
  const configured = String(import.meta.env.VITE_DAYTONA_PREVIEW_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined" && typeof window.location?.origin === "string" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  throw new Error("Daytona preview origin is unavailable.");
}

function resolveLiveDesktopProxyOrigin(): string {
  const configured = String(import.meta.env.VITE_DAYTONA_LIVE_DESKTOP_PROXY_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return resolvePreviewOrigin();
}

function normalizePreviewPath(path: string | null | undefined): string {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

function defaultPortForProtocol(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

function shouldUseSecureDesktopTransport(upstream: URL): boolean {
  if (upstream.protocol === "https:") return true;
  if (typeof window !== "undefined" && window.location.protocol === "https:") return true;
  try {
    return new URL(resolvePreviewOrigin()).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildDaytonaPreviewProxyUrl(params: {
  previewProxyToken: string;
  previewPath?: string | null;
  searchParams?: Record<string, string | number | boolean | null | undefined>;
}): string {
  const token = String(params.previewProxyToken ?? "").trim();
  if (!token) {
    throw new Error("Preview proxy token is required for Daytona preview transport.");
  }
  const pathSuffix = normalizePreviewPath(params.previewPath);
  const previewOrigin = resolvePreviewOrigin();
  const baseUrl = pathSuffix
    ? `${previewOrigin}/_preview/start/${token}/${pathSuffix}`
    : `${previewOrigin}/_preview/start/${token}/`;
  const url = new URL(baseUrl);
  for (const [key, rawValue] of Object.entries(params.searchParams ?? {})) {
    if (rawValue === null || rawValue === undefined) continue;
    url.searchParams.set(key, String(rawValue));
  }
  return url.toString();
}

export function buildDaytonaEmbeddedLiveDesktopUrl(params: {
  previewProxyToken: string;
}): string {
  return buildDaytonaLiveDesktopUrl({
    previewProxyToken: params.previewProxyToken,
    viewOnly: true,
  });
}

export function buildDaytonaRawLiveDesktopUrl(params: {
  previewProxyToken: string;
  viewOnly?: boolean;
}): string {
  return buildDaytonaLiveDesktopUrl({
    previewProxyToken: params.previewProxyToken,
    viewOnly: params.viewOnly !== false,
  });
}

function buildDaytonaLiveDesktopUrl(params: {
  previewProxyToken: string;
  viewOnly: boolean;
}): string {
  const token = String(params.previewProxyToken ?? "").trim();
  if (!token) {
    throw new Error("Preview proxy token is required for live desktop transport.");
  }
  const proxyOrigin = new URL(resolveLiveDesktopProxyOrigin());
  const secureTransport = shouldUseSecureDesktopTransport(proxyOrigin);
  const baseUrl = new URL(
    `/_preview/start/${encodeURIComponent(token)}/vnc.html`,
    proxyOrigin,
  );
  baseUrl.search = new URLSearchParams({
    autoconnect: "true",
    resize: "scale",
    view_only: params.viewOnly ? "true" : "false",
    host: proxyOrigin.hostname,
    port: secureTransport ? "443" : proxyOrigin.port || defaultPortForProtocol(proxyOrigin.protocol),
    encrypt: secureTransport ? "true" : "false",
    path: `_preview/start/${token}/websockify`,
    reconnect: "true",
    reconnect_delay: "750",
  }).toString();
  return baseUrl.toString();
}
