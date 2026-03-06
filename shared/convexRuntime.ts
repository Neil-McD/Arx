import { ConvexHttpClient } from "convex/browser";

function readRuntimeWindowValue(key: string): string {
  try {
    const runtime = (globalThis as { __ARX_RUNTIME__?: Record<string, unknown> }).__ARX_RUNTIME__;
    const value = runtime?.[key];
    return String(value ?? "").trim();
  } catch {
    return "";
  }
}

function readFirstNonEmpty(values: readonly string[]): string | null {
  const value = values.find((candidate) => candidate.trim().length > 0) ?? "";
  return value.trim().length > 0 ? value.trim() : null;
}

function readLocalDevRuntimeOrigin(): string | null {
  try {
    if (!import.meta.env.DEV) return null;
    if (typeof window === "undefined") return null;
    const origin = String(window.location.origin ?? "").trim();
    if (!origin) return null;
    const parsed = new URL(origin);
    const host = (parsed.hostname ?? "").trim().toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1") return null;
    return origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function deriveConvexSiteUrlFromCloud(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".convex.cloud")) return null;
    parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function readConvexUrl(): string | null {
  return readFirstNonEmpty([
    String(import.meta.env.VITE_CONVEX_URL ?? "").trim(),
    String((import.meta as { env?: Record<string, unknown> }).env?.VITE_PUBLIC_CONVEX_URL ?? "").trim(),
    String((import.meta as { env?: Record<string, unknown> }).env?.PUBLIC_CONVEX_URL ?? "").trim(),
    readRuntimeWindowValue("VITE_CONVEX_URL"),
    readRuntimeWindowValue("CONVEX_URL"),
  ]);
}

export function readConvexSiteUrl(): string | null {
  return readFirstNonEmpty([
    String(import.meta.env.VITE_CONVEX_SITE_URL ?? "").trim(),
    String((import.meta as { env?: Record<string, unknown> }).env?.VITE_PUBLIC_CONVEX_SITE_URL ?? "").trim(),
    String((import.meta as { env?: Record<string, unknown> }).env?.PUBLIC_CONVEX_SITE_URL ?? "").trim(),
    readRuntimeWindowValue("VITE_CONVEX_SITE_URL"),
    readRuntimeWindowValue("CONVEX_SITE_URL"),
  ]);
}

export function readConvexRuntimeUrl(): string | null {
  const localDevOrigin = readLocalDevRuntimeOrigin();
  if (localDevOrigin) return localDevOrigin;
  const explicitSiteUrl = readConvexSiteUrl();
  if (explicitSiteUrl) return explicitSiteUrl;
  const cloudUrl = readConvexUrl();
  if (!cloudUrl) return null;
  return deriveConvexSiteUrlFromCloud(cloudUrl) ?? cloudUrl;
}

let bootProbePromise: Promise<void> | null = null;

export function bootConvexProbe(): void {
  if (bootProbePromise) return;
  const convexUrl = readConvexUrl();
  if (!convexUrl) {
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  bootProbePromise = client
    .query("probe:health" as any, {})
    .then((result) => {
      console.info("[convex] probe:health ok", result);
    })
    .catch((error) => {
      console.warn("[convex] probe:health failed", error);
      bootProbePromise = null;
    });
}
