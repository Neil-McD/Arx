function resolvePreviewOrigin(): string {
  const configured = String(import.meta.env.VITE_WORKSPACE_PREVIEW_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string" &&
    window.location.origin
  ) {
    const hostname = String(window.location.hostname ?? "").trim().toLowerCase();
    const isLocalDevelopmentHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost");
    if (!isLocalDevelopmentHost) {
      throw new Error("VITE_WORKSPACE_PREVIEW_ORIGIN is required for hosted workspace previews.");
    }
    return window.location.origin.replace(/\/+$/, "");
  }
  throw new Error("Workspace preview origin is unavailable.");
}

function resolveLiveDesktopProxyOrigin(): string {
  const configured = String(import.meta.env.VITE_WORKSPACE_LIVE_DESKTOP_PROXY_ORIGIN ?? "").trim();
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

export function buildWorkspacePreviewProxyUrl(params: {
  previewProxyToken: string;
  previewPath?: string | null;
  searchParams?: Record<string, string | number | boolean | null | undefined>;
}): string {
  const token = String(params.previewProxyToken ?? "").trim();
  if (!token) {
    throw new Error("Preview proxy token is required for workspace preview transport.");
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

export function buildWorkspaceEmbeddedLiveDesktopUrl(params: {
  previewProxyToken: string;
}): string {
  return buildWorkspaceLiveDesktopUrl({
    previewProxyToken: params.previewProxyToken,
    viewOnly: true,
  });
}

export function buildWorkspaceRawLiveDesktopUrl(params: {
  previewProxyToken: string;
  viewOnly?: boolean;
}): string {
  return buildWorkspaceLiveDesktopUrl({
    previewProxyToken: params.previewProxyToken,
    viewOnly: params.viewOnly !== false,
  });
}

function buildWorkspaceLiveDesktopUrl(params: {
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
