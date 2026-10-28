// The private twin: where a member's own pages (Your communities, Messages,
// Settings, Join) live, at <slug>--me<suffix>.<sites domain> beside each site.
// It looks like the site because the edge draws the site's own frame.html, but
// with everything executable removed, so only Polynet's code runs there and
// the site's code can never read a member's personal data. Personal pages are
// top-level pages on their own origin, so this works in every browser,
// including Safari, and keeps working once polynet.page is a public suffix.
//
// This file holds what the twin page is made of: the frame stripper (a
// Cloudflare HTMLRewriter pass), the security headers, and Polynet's plain page
// for a site with no frame. index.ts routes to it.
import { personalPage } from "../../../../packages/polynet-cli/checks.mjs";

// Cloudflare's streaming HTML rewriter, as far as the stripper uses it.
type StripText = { text: string; lastInTextNode: boolean };
type StripElement = {
  tagName: string;
  attributes: IterableIterator<[string, string]>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): unknown;
  removeAttribute(name: string): unknown;
  setInnerContent(content: string, options?: { html?: boolean }): unknown;
  remove(): unknown;
  removeAndKeepContent(): unknown;
};
interface StripRewriter {
  on(selector: string, handlers: { element?(element: StripElement): void; text?(text: StripText): void }): StripRewriter;
  onDocument(handlers: { comments?(comment: { remove(): unknown }): void }): StripRewriter;
  transform(response: Response): Response;
}
export type StripRewriterClass = { new (): StripRewriter };

// Elements removed with everything inside them: anything that runs code, loads
// another document, changes where the page's URLs point, or refreshes it away
// (noscript, xmp, noembed, noframes and plaintext too: parsers disagree about them).
const REMOVED = [
  "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "portal", "fencedframe",
  "xmp", "noembed", "noframes", "plaintext", "meta[http-equiv]",
  // SVG animation can set an href to javascript: after load.
  "set", "animate", "animatemotion", "animatetransform", "discard",
].join(", ");

// The <link> kinds a frame may keep: its look, never something that fetches a
// script or another page.
const LINK_RELS = new Set(["stylesheet", "icon", "shortcut", "apple-touch-icon", "mask-icon", "preconnect", "dns-prefetch"]);

// Attributes that are never kept, on any element.
const DROPPED_ATTRIBUTES = new Set(["srcdoc", "action", "formaction", "formmethod", "formtarget", "formenctype", "ping", "nonce",
  "background", "lowsrc", "dynsrc", "codebase", "archive", "classid", "longdesc", "manifest"]);
// Attributes that hold a URL, kept only once rewritten to a safe one.
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src", "poster", "cite", "data"]);
const SRCSET_ATTRIBUTES = new Set(["srcset", "imagesrcset"]);

export type FrameContext = { siteOrigin: string; twinOrigin: string };

// The rewriter hands attribute values over as written, character references
// and all; a browser decodes them before it reads the URL. Decode the ones that
// could spell a scheme (numeric references, and the named ones for punctuation
// and whitespace) so "java&#x09;script:" is judged as the browser would read it.
const NAMED_REFERENCES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", colon: ":", tab: "\t", newline: "\n", sol: "/", bsol: "\\",
  lpar: "(", rpar: ")", num: "#", period: ".", comma: ",", excl: "!", quest: "?", equals: "=", semi: ";", nbsp: "\u00a0",
};
export function decodeReferences(value: string): string {
  return value.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));?/gi, (whole, hex: string, dec: string, name: string) => {
    if (name) return Object.hasOwn(NAMED_REFERENCES, name.toLowerCase()) ? NAMED_REFERENCES[name.toLowerCase()] : whole;
    const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "\ufffd";
  });
}

// Written back as markup: the URL serializer never leaves a quote or angle
// bracket in a URL, and an ampersand is escaped so nothing decodes it again.
function attributeText(url: string): string {
  return url.replace(/&/g, "&amp;");
}

// A URL in the frame, made safe for the twin (as attribute text), or null to
// drop it. Links to the site (from its root, or absolute) go to the site's own
// origin; links to a personal page and Polynet's own paths stay here. Only
// http(s) (and, for links, mailto: and tel:) survive: javascript:, data:,
// vbscript: and the rest never do, however they're spelled.
export function frameUrl(value: string, kind: "link" | "resource", context: FrameContext): string | null {
  const raw = decodeReferences(String(value ?? "")).trim();
  let url: URL;
  try {
    url = new URL(raw, `${context.siteOrigin}/`);
  } catch {
    return null;
  }
  // A link within the page stays one (serialized, so no quote survives in it).
  if (kind === "link" && raw.startsWith("#")) return attributeText(url.hash || "#");
  const schemes = kind === "link" ? ["http:", "https:", "mailto:", "tel:"] : ["http:", "https:"];
  if (!schemes.includes(url.protocol)) return null;
  if (url.origin !== context.siteOrigin && url.origin !== context.twinOrigin) return attributeText(url.toString());
  const rest = url.pathname + url.search + url.hash;
  if (url.pathname.startsWith("/__polynet/")) return attributeText(rest);
  if (kind === "link" && personalPage(url.pathname)) return attributeText(rest);
  return attributeText(context.siteOrigin + rest);
}

// srcset: image candidates, each a URL (which may hold commas) and its
// descriptors, separated by commas. A candidate whose URL isn't safe is dropped.
function frameSrcset(value: string, context: FrameContext): string | null {
  const text = decodeReferences(String(value ?? ""));
  const kept: string[] = [];
  let at = 0;
  while (at < text.length) {
    while (at < text.length && /[\s,]/.test(text[at])) at += 1;
    let end = at;
    while (end < text.length && !/\s/.test(text[end])) end += 1;
    let address = text.slice(at, end);
    let descriptors = "";
    at = end;
    if (address.endsWith(",")) {
      address = address.replace(/,+$/, "");
    } else {
      let close = at;
      let depth = 0;
      while (close < text.length && (text[close] !== "," || depth > 0)) {
        if (text[close] === "(") depth += 1;
        if (text[close] === ")") depth = Math.max(0, depth - 1);
        close += 1;
      }
      descriptors = text.slice(at, close).trim();
      at = close + 1;
    }
    if (!address) continue;
    const url = frameUrl(address, "resource", context);
    if (url && /^[\w.\s-]*$/.test(descriptors)) kept.push(descriptors ? `${url} ${descriptors}` : url);
  }
  return kept.length ? kept.join(", ") : null;
}

function cleanAttributes(element: StripElement, context: FrameContext, styles: string[]): void {
  const tag = element.tagName.toLowerCase();
  const link = tag === "a" || tag === "area";
  for (const [name, value] of Array.from(element.attributes)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || DROPPED_ATTRIBUTES.has(lower)) {
      element.removeAttribute(name);
    } else if (URL_ATTRIBUTES.has(lower)) {
      const safe = frameUrl(value, link && (lower === "href" || lower === "xlink:href") ? "link" : "resource", context);
      if (safe === null) element.removeAttribute(name);
      else if (safe !== value) element.setAttribute(name, safe);
    } else if (SRCSET_ATTRIBUTES.has(lower)) {
      const safe = frameSrcset(value, context);
      if (safe === null) element.removeAttribute(name);
      else if (safe !== value) element.setAttribute(name, safe);
    } else if (lower === "name" && tag === "img") {
      // A named image overrides document properties (document.body) for Polynet's code.
      element.removeAttribute(name);
    } else if (lower === "style") {
      // The browser hashes the decoded value (font-family: &quot;Inter&quot;).
      styles.push(decodeReferences(value), value);
    }
  }
}

export type StrippedFrame = { html: string; styleHashes: string[]; attributeHashes: string[] };

// The site's frame with nothing of the site's left to run: its markup, classes,
// stylesheets, inline styles and fonts stay, so it looks like the site. The
// title becomes the page's. Inline <style> blocks and style attributes are
// allowed by hash in the page's policy, so no other inline style can apply.
export async function stripFrame(frame: Response, Rewriter: StripRewriterClass, context: FrameContext & { title: string | null }): Promise<StrippedFrame> {
  const styleBlocks: string[] = [];
  const styleAttributes: string[] = [];
  let styleText = "";
  const rewriter = new Rewriter()
    .on(REMOVED, { element(element) { element.remove(); } })
    .on("link", { element(element) {
      const rels = String(element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!rels.length || !rels.every((rel) => LINK_RELS.has(rel))) element.remove();
    } })
    // A form would post wherever its action says; its fields stay as plain markup.
    .on("form", { element(element) { element.removeAndKeepContent(); } })
    .on("*", { element(element) { cleanAttributes(element, context, styleAttributes); } })
    .on("style", { text(text) {
      styleText += text.text;
      if (text.lastInTextNode) { styleBlocks.push(styleText); styleText = ""; }
    } })
    .onDocument({ comments(comment) { comment.remove(); } });
  if (context.title) rewriter.on("head > title", { element(element) { element.setInnerContent(context.title as string); } });
  const html = await rewriter.transform(frame).text();
  return { html, styleHashes: await hashes(styleBlocks), attributeHashes: await hashes(styleAttributes) };
}

async function hashes(texts: string[]): Promise<string[]> {
  const unique = Array.from(new Set(texts));
  return Promise.all(unique.map(async (text) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    let binary = "";
    for (const byte of digest) binary += String.fromCharCode(byte);
    return `'sha256-${btoa(binary)}'`;
  }));
}

// What a twin page may load: scripts only from the twin itself (Polynet's), the
// site's stylesheets, fonts, images and media, Google Fonts, and avatars from
// Polynet's storage. Nothing frames it, nothing posts away from it, no <base>.
export function twinPolicy(args: { siteOrigin: string; storageOrigin: string | null; styleHashes?: string[]; attributeHashes?: string[] }): string {
  const styleHashes = [...(args.styleHashes ?? []), ...(args.attributeHashes ?? [])];
  const style = ["'self'", args.siteOrigin, "https://fonts.googleapis.com", ...styleHashes];
  if (args.attributeHashes?.length) style.push("'unsafe-hashes'");
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src ${style.join(" ")}`,
    `font-src ${args.siteOrigin} https://fonts.gstatic.com data:`,
    `img-src 'self' data: ${args.siteOrigin}${args.storageOrigin ? ` ${args.storageOrigin}` : ""}`,
    `media-src ${args.siteOrigin}`,
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

// On every twin response: nothing outside this origin may embed or read it,
// and it asks for its own agent cluster (no document.domain games with a
// sibling site, which shares its registrable domain until polynet.page is a
// public suffix).
export const TWIN_HEADERS: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "X-Content-Type-Options": "nosniff",
};

// Twin pages also can't be framed or cached, send their address only to
// themselves, and keep no handle on (or from) another site's window.
export function twinPageHeaders(policy: string): Headers {
  return new Headers({
    ...TWIN_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": policy,
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
}

export function withTwinHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(TWIN_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// A site with no frame (or none the edge can draw): Polynet's own quiet page,
// with the way back to the site. The member's page still renders in it.
export const PLAIN_STYLE = [
  ":root { color-scheme: light dark; --bg: #fbfaf7; --text: #1c1b19; --line: #e6e2da; }",
  "@media (prefers-color-scheme: dark) { :root { --bg: #131312; --text: #f1efe9; --line: #2c2a27; } }",
  "body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 system-ui, sans-serif; }",
  ".pn-twin-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px clamp(16px, 4vw, 40px); border-bottom: 1px solid var(--line); }",
  ".pn-twin-bar a { color: inherit; }",
  "main { max-width: 56rem; margin: 0 auto; padding: 32px clamp(16px, 4vw, 40px) 64px; }",
].join("\n");

export function plainTwinPage(args: { title: string; communityName: string | null; siteOrigin: string }): string {
  const here = args.communityName ? escapeHtml(args.communityName) : "the community";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(args.title)}</title>
<link rel="stylesheet" href="/__polynet/ui.css">
<style>${PLAIN_STYLE}</style>
</head>
<body>
<header class="pn-twin-bar"><a href="${escapeHtml(args.siteOrigin)}/">Back to ${here}</a><polynet-account></polynet-account></header>
<main><polynet-page></polynet-page></main>
<script type="module" src="/__polynet/ui.js"></script>
</body></html>
`;
}

export async function plainStyleHash(): Promise<string> {
  return (await hashes([PLAIN_STYLE]))[0];
}
