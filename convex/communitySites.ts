// Community sites on <slug><host suffix>.<sites domain>: the rules for a deploy and its record.
// Production uses no suffix (<slug>.polynet.page); staging uses "-staging".
// The HTTP routes and the Cloudflare calls live in httpCommunitySites.ts.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeCommunityAppOrigin } from "../shared/communityAppSession";
import { communityIsActive } from "../shared/communityLifecycle";
import { privateTwinHost, siteSlugShapeOk } from "../packages/polynet-cli/checks.mjs";

// Hostnames that never belong to a community, even if a slug matches.
const RESERVED_SITE_NAMES = new Set([
  "www", "api", "app", "admin", "auth", "mail", "email", "docs", "help", "status", "staging",
  "dev", "studio", "polynet", "cdn", "static", "assets", "support", "billing", "login",
]);
// The Polynet community itself is the exception to the reserved "polynet" name.
const RESERVED_EXCEPTIONS = new Set(["polynet"]);

export const SITE_MAX_FILES = 2_000;
export const SITE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SITE_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export type SiteManifest = Record<string, { hash: string; size: number }>;

// The slug's shape is shared with the edge and the CLI (checks.mjs): names
// ending in the staging suffix stay free for staging's addresses on the shared
// domain, and names ending in the private twin's mark ("--me") are never a
// site, so no site address is ever another community's private twin.
export function siteHostname(communitySlug: string, sitesDomain: string, hostSuffix = ""): string | null {
  const slug = communitySlug.trim().toLowerCase();
  if (!siteSlugShapeOk(slug)) return null;
  if (RESERVED_SITE_NAMES.has(slug) && !RESERVED_EXCEPTIONS.has(slug)) return null;
  return `${slug}${hostSuffix}.${sitesDomain}`;
}

// The community's own site on this environment's sites domain, when it has one
// (that origin is registered to it); else null, and links go to Studio. The same
// shapes the deploy accepts; anything else means no site links. Shared by
// Discover and the member's communities.
export function sitesDomainOk(sitesDomain: string, hostSuffix: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(sitesDomain)
    && (hostSuffix === "" || /^-[a-z0-9-]{1,20}$/.test(hostSuffix));
}

export async function registeredSiteOrigin(
  ctx: any, community: { _id: any; slug?: unknown }, sitesDomain: string, hostSuffix: string,
): Promise<string | null> {
  const host = sitesDomainOk(sitesDomain, hostSuffix) ? siteHostname(String(community.slug ?? ""), sitesDomain, hostSuffix) : null;
  const origin = host ? `https://${host}` : null;
  if (!origin) return null;
  const registered = await ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", origin)).first();
  return registered && String(registered.communityId) === String(community._id) ? origin : null;
}

const SITE_MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript",
  json: "application/json", txt: "text/plain", md: "text/markdown", xml: "application/xml", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", pdf: "application/pdf", webmanifest: "application/manifest+json",
};

export function siteFileMimeType(path: string): string {
  return SITE_MIME[/\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function siteScriptName(communitySlug: string): string {
  return `site-${communitySlug}`;
}

// A manifest of static files: "/path" -> { 32-hex hash, size }. Paths are
// normalized and bounded; server code (a _worker.js) is never accepted.
export function validateSiteManifest(raw: unknown):
  | { ok: true; manifest: SiteManifest; fileCount: number; totalBytes: number }
  | { ok: false; code: string; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "manifest_invalid", message: "Send a manifest of files." };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, code: "site_empty", message: "The site has no files." };
  if (entries.length > SITE_MAX_FILES) {
    return { ok: false, code: "site_too_many_files", message: `A site can have at most ${SITE_MAX_FILES} files.` };
  }
  const manifest: SiteManifest = {};
  let totalBytes = 0;
  for (const [path, value] of entries) {
    const entry = value as { hash?: unknown; size?: unknown } | null;
    const hash = typeof entry?.hash === "string" ? entry.hash : "";
    const size = typeof entry?.size === "number" ? entry.size : -1;
    const segments = path.split("/").slice(1);
    const pathOk = path.startsWith("/") && path.length <= 512 && !path.includes("\\")
      && segments.length > 0 && segments.every((segment) => segment && segment !== "." && segment !== "..");
    if (!pathOk) return { ok: false, code: "manifest_path_invalid", message: `Invalid file path: ${path.slice(0, 80)}` };
    if (/^\/_worker\.js|^\/_routes\.json$/.test(path)) {
      return { ok: false, code: "site_server_code", message: "Sites are static files; server code isn't deployed." };
    }
    if (!/^[a-f0-9]{32}$/.test(hash) || !Number.isInteger(size) || size < 0) {
      return { ok: false, code: "manifest_entry_invalid", message: `Invalid entry for ${path.slice(0, 80)}` };
    }
    if (size > SITE_MAX_FILE_BYTES) {
      return { ok: false, code: "site_file_too_large", message: `${path.slice(0, 80)} is larger than 25 MB.` };
    }
    totalBytes += size;
    manifest[path] = { hash, size };
  }
  if (totalBytes > SITE_MAX_TOTAL_BYTES) {
    return { ok: false, code: "site_too_large", message: "A site can be at most 50 MB." };
  }
  return { ok: true, manifest, fileCount: entries.length, totalBytes };
}

// The site's origin and its private twin's, both registered to the community
// for sign-in. The twin's sessions are "private" (members' own pages); the
// site's are "site". An origin owned by another community is refused.
async function registerSiteOrigins(ctx: any, communityId: any, hostname: string, sitesDomain: string, hostSuffix: string) {
  const origin = normalizeCommunityAppOrigin(`https://${hostname}`);
  if (!origin) throw new Error("community_site_hostname_invalid");
  const twinHost = privateTwinHost(hostname, sitesDomain, hostSuffix);
  const privateOrigin = twinHost ? normalizeCommunityAppOrigin(`https://${twinHost}`) : null;
  const rows: Array<[string, "site" | "private"]> = [[origin, "site"]];
  if (privateOrigin) rows.push([privateOrigin, "private"]);
  const now = Date.now();
  for (const [address] of rows) {
    const existing = await ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", address)).first();
    if (existing && existing.communityId !== communityId) throw new Error("community_domain_taken");
  }
  const added: string[] = [];
  for (const [address, kind] of rows) {
    const existing = await ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", address)).first();
    if (!existing) {
      await ctx.db.insert("communityDomains", { communityId, origin: address, createdAt: now, ...(kind === "private" ? { kind } : {}) });
      added.push(address);
    } else if (kind === "private" && existing.kind !== "private") {
      await ctx.db.patch(existing._id, { kind });
      added.push(address);
    }
  }
  return { origin, privateOrigin, added };
}

// This environment's sites domain and staging suffix, or null where sites
// aren't set up (local dev without them).
function sitesEnv(): { domain: string; suffix: string } | null {
  const domain = (process.env.POLYNET_SITES_DOMAIN ?? "").trim().toLowerCase();
  const suffix = (process.env.POLYNET_SITES_HOST_SUFFIX ?? "").trim().toLowerCase();
  return domain && sitesDomainOk(domain, suffix) ? { domain, suffix } : null;
}

// The community's own site on this environment (its registered address), for
// Studio's links and the /c/<slug> hand-off; null where it has none.
export async function communitySiteUrl(ctx: any, community: { _id: any; slug?: unknown }): Promise<string | null> {
  const sites = sitesEnv();
  return sites ? await registeredSiteOrigin(ctx, community, sites.domain, sites.suffix) : null;
}

// Every community is on its own site from the start: its site address and
// private twin are registered when it's created, and Polynet's default site
// serves them until the founder deploys their own. A slug with no valid site
// address, or an address already taken, just leaves the community without one;
// it never stops the community being created.
export async function registerCommunitySiteAddresses(ctx: any, community: { _id: any; slug?: unknown }) {
  const sites = sitesEnv();
  const host = sites ? siteHostname(String(community.slug ?? ""), sites.domain, sites.suffix) : null;
  if (!sites || !host) return null;
  try {
    return await registerSiteOrigins(ctx, community._id, host, sites.domain, sites.suffix);
  } catch {
    return null;
  }
}

// A new slug moves the community's site addresses with it: the old site and
// twin addresses are released (another community may take that slug next)
// and the new ones registered. A site the founder has deployed lives at the
// old address, so its slug stays put until a deploy can move with it; and a
// new address another community already holds refuses the rename. Runs before
// the slug is saved, so a refusal changes nothing.
export async function moveCommunitySiteAddresses(ctx: any, community: { _id: any; slug?: unknown }, nextSlug: string) {
  const previous = String(community.slug ?? "");
  const sites = sitesEnv();
  if (!sites || previous === nextSlug) return;
  const origins = (slug: string) => {
    const host = siteHostname(slug, sites.domain, sites.suffix);
    const twin = host ? privateTwinHost(host, sites.domain, sites.suffix) : null;
    return [host, twin].filter(Boolean).map((name) => `https://${name}`);
  };
  const byOrigin = (origin: string) => ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", origin)).first();
  const held = [];
  for (const origin of origins(previous)) {
    const row = await byOrigin(origin);
    if (row && String(row.communityId) === String(community._id)) held.push(row);
  }
  if (held.length && await ctx.db.query("communitySiteDeploys").withIndex("by_community_createdAt", (q: any) => q.eq("communityId", community._id)).first()) {
    throw new Error("community_slug_locked_by_site");
  }
  for (const origin of origins(nextSlug)) {
    const row = await byOrigin(origin);
    if (row && String(row.communityId) !== String(community._id)) throw new Error("community_slug_taken");
  }
  for (const row of held) await ctx.db.delete(row._id);
  await registerCommunitySiteAddresses(ctx, { _id: community._id, slug: nextSlug });
}

// Communities created before every community had a site: register theirs, a
// page at a time, until done:
//   npx convex run communitySites:registerCommunitySiteAddressesInternal '{"dryRun":true}'
export const registerCommunitySiteAddressesInternal = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const sites = sitesEnv();
    if (!sites) return { registered: [], skipped: 0, continueCursor: null, isDone: true, sitesConfigured: false };
    const page = await ctx.db.query("communities").paginate({ cursor: args.cursor ?? null, numItems: 50 });
    const registered: string[] = [];
    let skipped = 0;
    for (const community of page.page) {
      const host = communityIsActive(community as any) ? siteHostname(String(community.slug ?? ""), sites.domain, sites.suffix) : null;
      if (!host) { skipped += 1; continue; }
      if (args.dryRun) {
        const taken = await ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", `https://${host}`)).first();
        if (!taken) registered.push(`https://${host}`);
        continue;
      }
      const result = await registerCommunitySiteAddresses(ctx, community);
      if (result) registered.push(...result.added); else skipped += 1;
    }
    return { registered, skipped, continueCursor: page.continueCursor, isDone: page.isDone, sitesConfigured: true };
  },
});

// Publishing makes the site's origin (and its private twin's) the community's,
// so sign-in may return there, and records the deploy.
export const recordCommunitySiteDeployInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    hostname: v.string(),
    sitesDomain: v.optional(v.string()),
    hostSuffix: v.optional(v.string()),
    fileCount: v.number(),
    totalBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const { origin, privateOrigin } = await registerSiteOrigins(ctx, args.communityId, args.hostname, args.sitesDomain ?? "", args.hostSuffix ?? "");
    await ctx.db.insert("communitySiteDeploys", {
      communityId: args.communityId,
      userId: args.userId,
      hostname: args.hostname,
      fileCount: Math.max(0, Math.floor(args.fileCount)),
      totalBytes: Math.max(0, Math.floor(args.totalBytes)),
      createdAt: Date.now(),
    });
    return { origin, privateOrigin };
  },
});

// Sites deployed before private twins existed: register each one's twin origin.
// Run once per environment with its sites domain and host suffix, a page at a
// time, until done:
//   npx convex run communitySites:registerSitePrivateTwinsInternal '{"sitesDomain":"polynet.page","hostSuffix":"-staging"}'
// Only origins that are exactly this environment's site addresses get a twin.
export const registerSitePrivateTwinsInternal = internalMutation({
  args: { sitesDomain: v.string(), hostSuffix: v.string(), cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityDomains").paginate({ cursor: args.cursor ?? null, numItems: 100 });
    const registered: string[] = [];
    const refused: string[] = [];
    for (const row of page.page) {
      if (row.kind === "private") continue;
      const host = (() => { try { return new URL(row.origin).hostname; } catch { return ""; } })();
      const twin = row.origin === `https://${host}` ? privateTwinHost(host, args.sitesDomain, args.hostSuffix) : null;
      if (!twin) continue;
      if (args.dryRun) { registered.push(`https://${twin}`); continue; }
      try {
        const { added } = await registerSiteOrigins(ctx, row.communityId, host, args.sitesDomain, args.hostSuffix);
        registered.push(...added);
      } catch {
        refused.push(`https://${twin}`);
      }
    }
    return { registered, refused, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
