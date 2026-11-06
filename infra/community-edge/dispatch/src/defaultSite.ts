// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// Polynet's default site: what a community's address serves until its founder
// deploys their own. It stands where a founder's site would (the edge asks it
// for files exactly as it asks a user Worker). Its front door is the
// community's doorstep: / goes to Join, the one page that sells it and lets
// people in. A frame at /frame is what Join, the member's other own pages on
// the twin and the standard pages are drawn inside, plus its stylesheet and one
// small script as files (the twin's policy runs no inline style or script).
// Members of a community on Polynet's app use the app, so the frame carries no
// member-page menu: the name, and Join or Sign in. Every word comes from the
// community's public identity and is escaped.

export type DefaultSiteIdentity = {
  slug?: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  member_count: number;
  avatar_url?: string | null;
  banner_url?: string | null;
  // false: unlisted (link-only), so search engines are asked not to index it.
  listed?: boolean;
};

// One strong colour per community until it chooses its own: the same slug always gets the same one.
const ACCENTS = ["#e8622c", "#2f7d6d", "#3d5bd9", "#c2410c", "#8a3ffc", "#0f7b9e", "#b5367a", "#5b7f1f"];

export function accentFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Only https images, and only as an attribute (never inside CSS).
function imageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const STYLE = `
:root {
  --ground: #f6f5f2; --ink: #17171a; --soft: #5f5e66; --line: #dcdad4; --card: #ffffff;
  --on-accent: #ffffff;
  --display: "Avenir Next Condensed", "Helvetica Neue", "Arial Narrow", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --polynet-accent: var(--accent); --polynet-on-accent: var(--on-accent); --polynet-text: var(--ink);
  --polynet-muted: var(--soft); --polynet-border: var(--line); --polynet-surface: var(--card); --polynet-radius: 12px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --ground: #121216; --ink: #efeef2; --soft: #a3a2ad; --line: #2b2b33; --card: #1a1a20; }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--ground); color: var(--ink); font: 16px/1.55 var(--body); min-height: 100vh; display: flex; flex-direction: column; }
img { max-width: 100%; }
.wrap { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.inner { max-width: 1120px; margin: 0 auto; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.top { position: relative; z-index: 2; padding-block: 14px; }
.top .inner { display: flex; align-items: center; gap: 18px; }
.mark { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; font: 800 18px/1.1 var(--display); letter-spacing: .02em; text-transform: uppercase; min-width: 0; }
.mark span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emblem { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); font: 800 17px/1 var(--display); flex: none; overflow: hidden; }
.emblem { position: relative; }
.emblem img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
polynet-account { flex: none; margin-left: auto; }
.foot { margin-top: auto; border-top: 1px solid var(--line); padding-block: 20px; color: var(--soft); font-size: 14px; }
.foot .inner { display: flex; flex-wrap: wrap; gap: 8px 22px; justify-content: space-between; }
.foot a { color: inherit; }
`;

const FRAME_STYLE = `
.framed .top { border-bottom: 1px solid var(--line); }
.framed main { padding-block: 28px 56px; flex: 1; }
`;

export function defaultStylesheet(identity: DefaultSiteIdentity): string {
  return `:root { --accent: ${accentFor(identity.slug || identity.name)}; }${STYLE}${FRAME_STYLE}`;
}

// The frame's one script: an avatar that doesn't load goes, so the
// community's colour and initial show instead of a broken picture.
export const DEFAULT_SITE_SCRIPT = `for (const img of document.querySelectorAll(".emblem img")) {
  if (img.complete && !img.naturalWidth) img.remove();
  else img.addEventListener("error", () => img.remove(), { once: true });
}
`;

// avatarHost: in the frame, which the twin draws under a policy that loads
// images only from Polynet's own storage, the avatar shows only when it's
// stored there; anywhere else the initial stands in.
function header(identity: DefaultSiteIdentity, avatarHost: string | null = null): string {
  const name = escapeHtml(identity.name);
  const candidate = imageUrl(identity.avatar_url);
  const avatar = candidate && (avatarHost === null || new URL(candidate).host === avatarHost) ? candidate : null;
  // The initial always sits under the avatar, so a missing picture still shows something.
  const emblem = escapeHtml((identity.name.trim()[0] ?? "P").toUpperCase())
    + (avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : "");
  return `<header class="top wrap"><div class="inner">
  <a class="mark" href="/"><span class="emblem">${emblem}</span><span>${name}</span></a>
  <polynet-account></polynet-account>
</div></header>`;
}

function footer(identity: DefaultSiteIdentity): string {
  return `<footer class="foot wrap"><div class="inner"><span>${escapeHtml(identity.name)}</span><span><a href="/discover">Discover other communities</a> · Hosted on Polynet</span></div></footer>`;
}

function head(identity: DefaultSiteIdentity, title: string, description: string | null): string {
  const image = imageUrl(identity.banner_url) ?? imageUrl(identity.avatar_url);
  const meta = [
    `<meta property="og:title" content="${escapeHtml(identity.name)}">`,
    `<meta property="og:type" content="website">`,
    description ? `<meta name="description" content="${escapeHtml(description)}"><meta property="og:description" content="${escapeHtml(description)}">` : "",
    image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image">` : "",
  ].join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>${identity.listed === false ? '<meta name="robots" content="noindex">' : ""}${meta}
<link rel="stylesheet" href="/site.css"></head>`;
}

export function defaultFrame(identity: DefaultSiteIdentity, avatarHost = ""): string {
  // site.js only tidies a picture that doesn't load; the twin strips it, as it strips every script.
  return `${head(identity, identity.name, identity.one_liner)}
<body class="framed">
${header(identity, avatarHost)}
<main class="wrap"><div class="inner"><polynet-page></polynet-page></div></main>
${footer(identity)}
<script type="module" src="/site.js"></script>
</body></html>`;
}

// The front door is the doorstep.
const FRONT_DOOR = new Set(["/", "/index.html"]);

const FILES: Record<string, { type: string; body: (identity: DefaultSiteIdentity, avatarHost: string) => string }> = {
  "/frame": { type: "text/html", body: defaultFrame },
  "/frame.html": { type: "text/html", body: defaultFrame },
  "/site.css": { type: "text/css", body: defaultStylesheet },
  "/site.js": { type: "text/javascript", body: () => DEFAULT_SITE_SCRIPT },
};

// Answers the edge as a founder's site Worker would: the front door (to
// Join), the frame, its stylesheet and script, and nothing else.
export function defaultSiteWorker(identity: () => Promise<DefaultSiteIdentity | null>, avatarHost = ""): Fetcher {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      const read = request.method === "GET" || request.method === "HEAD";
      const file = FILES[path];
      if ((!file && !FRONT_DOOR.has(path)) || !read) return notFound();
      const found = await identity();
      if (!found) return notFound();
      if (FRONT_DOOR.has(path)) return new Response(null, { status: 302, headers: { Location: "/join", "Cache-Control": "no-store" } });
      const headers: Record<string, string> = { "Content-Type": `${file.type}; charset=utf-8`, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" };
      if (found.listed === false) headers["X-Robots-Tag"] = "noindex";
      return new Response(request.method === "HEAD" ? null : file.body(found, avatarHost), { headers });
    },
    connect() { throw new Error("not supported"); },
  } as unknown as Fetcher;
}
