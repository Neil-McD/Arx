// The one deploy path for a community site, shared by polynet deploy (the CLI
// uploads files straight to Cloudflare) and the community.site.deploy capability
// (a builder's agent hands the files over; Polynet uploads them).
import { internal } from "./_generated/api";
import type { SiteManifest } from "./communitySites";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
// Each site's only code: assets are served first; anything else is not found.
const SITE_MODULE = `export default { async fetch() { return new Response("Not found", { status: 404 }); } };\n`;

// hostSuffix is "" in production and "-staging" on staging (<slug>-staging.polynet.page).
export type SitesConfig = { token: string; accountId: string; namespace: string; routesKvId: string; domain: string; hostSuffix: string };
export type SiteTarget = { communityId: string; communitySlug: string; userId: any; hostname: string; script: string };
export type SiteUpload = { url: string; jwt: string; buckets: string[][] };

export function readSitesConfig(env: Record<string, string | undefined> = process.env): SitesConfig | null {
  const config = {
    token: env.CLOUDFLARE_API_TOKEN ?? "",
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    namespace: env.POLYNET_SITES_NAMESPACE ?? "",
    routesKvId: env.POLYNET_SITES_ROUTES_KV_ID ?? "",
    domain: env.POLYNET_SITES_DOMAIN ?? "",
  };
  if (!Object.values(config).every(Boolean)) return null;
  const hostSuffix = (env.POLYNET_SITES_HOST_SUFFIX ?? "").trim().toLowerCase();
  if (hostSuffix && !/^-[a-z0-9-]{1,20}$/.test(hostSuffix)) return null;
  return { ...config, hostSuffix };
}

async function cloudflare(config: SitesConfig, path: string, init: RequestInit): Promise<{ ok: boolean; result: any }> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.token}`, ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: unknown } | null;
  return { ok: response.ok && body?.success !== false, result: body?.result ?? null };
}

// The same content hash the CLI uses: sha256 of the base64 bytes plus the extension, 32 hex.
export async function hashSiteFile(bytes: Uint8Array, path: string): Promise<string> {
  const extension = /\.([^./]+)$/.exec(path)?.[1] ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(toBase64(bytes) + extension));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

// A Cloudflare upload pass for the files it doesn't already have.
export async function startSiteUpload(config: SitesConfig, script: string, manifest: SiteManifest): Promise<SiteUpload | null> {
  const session = await cloudflare(config,
    `/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts/${script}/assets-upload-session`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }) });
  if (!session.ok || typeof session.result?.jwt !== "string") return null;
  return {
    url: `${CLOUDFLARE_API}/accounts/${config.accountId}/workers/assets/upload?base64=true`,
    jwt: session.result.jwt,
    buckets: Array.isArray(session.result.buckets) ? session.result.buckets : [],
  };
}

// Upload the missing files ourselves (the capability path). Returns the completion token.
export async function uploadSiteFiles(
  upload: SiteUpload,
  files: Map<string, { bytes: Uint8Array; mime: string }>,
): Promise<string | null> {
  let token = upload.jwt;
  for (const bucket of upload.buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const file = files.get(hash);
      if (!file) return null;
      form.append(hash, new Blob([toBase64(file.bytes)], { type: file.mime }), hash);
    }
    const response = await fetch(upload.url, { method: "POST", headers: { Authorization: `Bearer ${upload.jwt}` }, body: form });
    const body = (await response.json().catch(() => null)) as { success?: boolean; result?: { jwt?: string } } | null;
    if (!response.ok || body?.success === false) return null;
    if (body?.result?.jwt) token = body.result.jwt;
  }
  return token;
}

// Put the uploaded files live: the site's script, its address, its origin for sign-in, a record.
export async function publishSite(args: {
  ctx: any; config: SitesConfig; site: SiteTarget; completionJwt: string; files: number; bytes: number;
}): Promise<{ ok: true; url: string } | { ok: false; code: string; message: string }> {
  const { config, site } = args;
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({
    main_module: "index.js",
    compatibility_date: "2026-09-30",
    assets: {
      jwt: args.completionJwt,
      config: { html_handling: "auto-trailing-slash", not_found_handling: "single-page-application" },
    },
  })], { type: "application/json" }));
  form.append("index.js", new Blob([SITE_MODULE], { type: "application/javascript+module" }), "index.js");
  const deployed = await cloudflare(config,
    `/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts/${site.script}`,
    { method: "PUT", body: form });
  if (!deployed.ok) return { ok: false, code: "publish_failed", message: "Couldn't publish the site. Deploy again." };

  const mapped = await cloudflare(config,
    `/accounts/${config.accountId}/storage/kv/namespaces/${config.routesKvId}/values/${encodeURIComponent(`host:${site.hostname}`)}`,
    { method: "PUT", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ script: site.script, community: site.communitySlug }) });
  if (!mapped.ok) return { ok: false, code: "route_failed", message: "Published, but the address isn't connected yet. Deploy again." };

  try {
    await args.ctx.runMutation((internal as any).communitySites.recordCommunitySiteDeployInternal, {
      communityId: site.communityId, userId: site.userId, hostname: site.hostname,
      fileCount: args.files, totalBytes: args.bytes,
    });
  } catch (error) {
    const taken = error instanceof Error && error.message.includes("community_domain_taken");
    return taken
      ? { ok: false, code: "site_address_taken", message: "That address belongs to another community." }
      : { ok: false, code: "record_failed", message: "Published, but couldn't finish setup. Deploy again." };
  }
  return { ok: true, url: `https://${site.hostname}` };
}
