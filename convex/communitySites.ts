// Community sites on <slug><host suffix>.<sites domain>: the rules for a deploy and its record.
// Production uses no suffix (<slug>.polynet.page); staging uses "-staging".
// The HTTP routes and the Cloudflare calls live in httpCommunitySites.ts.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeCommunityAppOrigin } from "../shared/communityAppSession";

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

// Names ending in the staging suffix stay free for staging's addresses on the
// shared domain, so no production community can claim one.
const RESERVED_SITE_SUFFIX = "-staging";

export function siteHostname(communitySlug: string, sitesDomain: string, hostSuffix = ""): string | null {
  const slug = communitySlug.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) return null;
  if (RESERVED_SITE_NAMES.has(slug) && !RESERVED_EXCEPTIONS.has(slug)) return null;
  if (slug.endsWith(RESERVED_SITE_SUFFIX)) return null;
  return `${slug}${hostSuffix}.${sitesDomain}`;
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

// Publishing makes the site's origin the community's (sign-in may return there)
// and records the deploy. An origin owned by another community is refused.
export const recordCommunitySiteDeployInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    hostname: v.string(),
    fileCount: v.number(),
    totalBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const origin = normalizeCommunityAppOrigin(`https://${args.hostname}`);
    if (!origin) throw new Error("community_site_hostname_invalid");
    const existing = await ctx.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", origin)).first();
    if (existing && existing.communityId !== args.communityId) throw new Error("community_domain_taken");
    const now = Date.now();
    if (!existing) await ctx.db.insert("communityDomains", { communityId: args.communityId, origin, createdAt: now });
    await ctx.db.insert("communitySiteDeploys", {
      communityId: args.communityId,
      userId: args.userId,
      hostname: args.hostname,
      fileCount: Math.max(0, Math.floor(args.fileCount)),
      totalBytes: Math.max(0, Math.floor(args.totalBytes)),
      createdAt: now,
    });
    return { origin };
  },
});
