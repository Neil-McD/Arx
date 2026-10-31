// SPDX-License-Identifier: MIT (see LICENSING.md and ../LICENSE-MIT)
// Polynet's default site: what a community's address serves until its founder
// deploys their own. It stands where a founder's site would (the edge asks it
// for files exactly as it asks a user Worker): a front door at / and a frame at
// /frame that the standard pages (chat, events, learn, knowledge, ask, people,
// discover) and the member's own pages on the twin are drawn inside, plus its
// stylesheet and the front door's one script as files (the twin's policy runs
// no inline style or script). Every word comes from the community's public
// identity and is escaped; the frame has no script, so the twin draws it whole.

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
  // How someone gets in: "join", "request_access" (approval) or "checkout".
  join_gate?: string;
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

const NAV: Array<[string, string]> = [
  ["/chat", "Chat"], ["/events", "Events"], ["/learn", "Courses"], ["/knowledge", "Knowledge"], ["/ask", "Ask"], ["/people", "People"],
];

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
.nav { display: flex; gap: 18px; margin-left: auto; font-size: 14px; font-weight: 500; }
.nav a { color: inherit; text-decoration: none; opacity: .82; }
.nav a:hover { opacity: 1; text-decoration: underline; text-underline-offset: 5px; text-decoration-thickness: 2px; text-decoration-color: var(--accent); }
polynet-account { flex: none; }
@media (max-width: 860px) {
  .top .inner { flex-wrap: wrap; row-gap: 10px; }
  polynet-account { margin-left: auto; }
  .nav { order: 3; flex: 1 0 100%; margin: 0; overflow-x: auto; scrollbar-width: none; gap: 20px; padding-block: 2px; }
  .nav::-webkit-scrollbar { display: none; }
  .nav a { white-space: nowrap; }
}
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 999px; font: 600 15px/1 var(--body); text-decoration: none; }
.btn.go { background: var(--accent); color: var(--on-accent); }
.btn.ghost { color: inherit; box-shadow: inset 0 0 0 1.5px currentColor; }
.foot { margin-top: auto; border-top: 1px solid var(--line); padding-block: 20px; color: var(--soft); font-size: 14px; }
.foot .inner { display: flex; flex-wrap: wrap; gap: 8px 22px; justify-content: space-between; }
.foot a { color: inherit; }
`;

const HOME_STYLE = `
.poster { position: relative; color: #fff; overflow: hidden; isolation: isolate; background: #0c0c10; }
.poster .art { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; }
.poster .field { position: absolute; inset: 0; z-index: -2;
  background: radial-gradient(80% 90% at 85% 15%, color-mix(in srgb, var(--accent) 85%, #fff 15%) 0%, transparent 60%),
    radial-gradient(70% 80% at 10% 100%, color-mix(in srgb, var(--accent) 60%, #000 40%) 0%, transparent 70%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 55%, #0c0c10 45%), #0c0c10); }
.poster .field span { position: absolute; right: -2vw; bottom: -9vw; font: 900 min(62vw, 720px)/1 var(--display); color: rgba(255,255,255,.07); text-transform: uppercase; }
.poster::after { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(10,10,14,.55) 0%, rgba(10,10,14,.15) 38%, rgba(10,10,14,.8) 100%); }
.hero { padding-block: clamp(56px, 11vw, 132px) clamp(36px, 6vw, 64px); }
.hero .inner { display: grid; gap: 22px; }
.kicker { font: 500 12px/1.4 var(--mono); letter-spacing: .14em; text-transform: uppercase; opacity: .86; display: flex; flex-wrap: wrap; gap: 6px 14px; }
.kicker span::before { content: "\\25CF  "; color: var(--accent); }
.name { margin: 0; font: 900 clamp(52px, 12vw, 168px)/.88 var(--display); text-transform: uppercase; letter-spacing: -.01em; text-wrap: balance; max-width: 14ch; overflow-wrap: anywhere; }
.name.long { font-size: clamp(42px, 8.5vw, 118px); max-width: 17ch; }
.tagline { margin: 0; font-size: clamp(18px, 2.1vw, 23px); line-height: 1.4; max-width: 34ch; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 6px; }
.below { padding-block: clamp(40px, 6vw, 72px); }
.below .inner { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: clamp(28px, 5vw, 72px); align-items: start; }
@media (max-width: 860px) { .below .inner { grid-template-columns: minmax(0, 1fr); } }
h2 { margin: 0 0 14px; font: 800 15px/1.2 var(--display); letter-spacing: .12em; text-transform: uppercase; color: var(--soft); }
.rooms { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.rooms li { display: grid; grid-template-columns: 9.5em minmax(0, 1fr); gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.rooms a { font: 800 22px/1.1 var(--display); text-transform: uppercase; color: inherit; text-decoration: none; }
.rooms span { color: var(--soft); }
@media (max-width: 480px) { .rooms li { grid-template-columns: minmax(0, 1fr); gap: 4px; } }
.about { margin: 0; font-size: 18px; line-height: 1.6; max-width: 62ch; white-space: pre-line; overflow-wrap: anywhere; }
`;

const FRAME_STYLE = `
.framed .top { border-bottom: 1px solid var(--line); }
.framed main { padding-block: 28px 56px; flex: 1; }
`;

export function defaultStylesheet(identity: DefaultSiteIdentity): string {
  return `:root { --accent: ${accentFor(identity.slug || identity.name)}; }${STYLE}${HOME_STYLE}${FRAME_STYLE}`;
}

// The front door's one script. An image that doesn't load goes, so the
// community's colour and initial show instead of a broken picture; a member
// already signed in goes straight in.
export const DEFAULT_SITE_SCRIPT = `import polynet from "/__polynet/sdk.js";
for (const img of document.querySelectorAll("img.art, .emblem img")) {
  if (img.complete && !img.naturalWidth) img.remove();
  else img.addEventListener("error", () => img.remove(), { once: true });
}
polynet.session().then((session) => {
  const actions = document.getElementById("actions");
  if (!actions || !session.signed_in || !session.member) return;
  const go = document.createElement("a");
  go.className = "btn go"; go.href = "/chat"; go.textContent = "Open the community";
  actions.replaceChildren(go);
}).catch(() => {});
`;

const ROOMS: Array<[string, string, string]> = [
  ["/chat", "Chat", "Channels for everything the community talks about, live."],
  ["/events", "Events", "What's coming up, in your time zone."],
  ["/learn", "Courses", "Lessons and guides the community has put together."],
  ["/knowledge", "Knowledge", "What the community has learned, kept as memory you can search."],
  ["/ask", "Ask", "The community's own agent, answering from what the community knows."],
];

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
  const nav = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
  return `<header class="top wrap"><div class="inner">
  <a class="mark" href="/"><span class="emblem">${emblem}</span><span>${name}</span></a>
  <nav class="nav" aria-label="${name}">${nav}</nav>
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

export function defaultHome(identity: DefaultSiteIdentity): string {
  const name = escapeHtml(identity.name);
  const banner = imageUrl(identity.banner_url);
  // The community's colour field is always there; a banner, when it loads, covers it.
  const art = `<div class="field" aria-hidden="true"><span>${escapeHtml((identity.name.trim()[0] ?? "").toUpperCase())}</span></div>`
    + (banner ? `<img class="art" src="${escapeHtml(banner)}" alt="">` : "");
  const count = identity.member_count === 1 ? "1 member" : `${identity.member_count.toLocaleString("en-US")} members`;
  const long = identity.name.length > 18 ? " long" : "";
  const tagline = identity.one_liner ? `<p class="tagline">${escapeHtml(identity.one_liner)}</p>` : "";
  const about = identity.about ? `<div><h2>About</h2><p class="about">${escapeHtml(identity.about)}</p></div>` : "";
  const rooms = ROOMS.map(([href, label, text]) => `<li><a href="${href}">${label}</a><span>${text}</span></li>`).join("");
  return `${head(identity, identity.name, identity.one_liner)}
<body>
<div class="poster">${art}
${header(identity)}
<div class="hero wrap"><div class="inner">
  <div class="kicker"><span>On Polynet</span><span>${count}</span></div>
  <h1 class="name${long}">${name}</h1>
  ${tagline}
  <div class="actions" id="actions"><a class="btn go" href="/join">${identity.join_gate === "request_access" ? "Ask to join" : "Join the community"}</a><a class="btn ghost" href="/__polynet/auth/start?return=%2Fchat">I'm a member</a></div>
</div></div>
</div>
<div class="below wrap"><div class="inner">
  <div><h2>Inside</h2><ul class="rooms">${rooms}</ul></div>
  ${about}
</div></div>
${footer(identity)}
<script type="module" src="/site.js"></script>
</body></html>`;
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

const FILES: Record<string, { type: string; body: (identity: DefaultSiteIdentity, avatarHost: string) => string }> = {
  "/": { type: "text/html", body: defaultHome },
  "/index.html": { type: "text/html", body: defaultHome },
  "/frame": { type: "text/html", body: defaultFrame },
  "/frame.html": { type: "text/html", body: defaultFrame },
  "/site.css": { type: "text/css", body: defaultStylesheet },
  "/site.js": { type: "text/javascript", body: () => DEFAULT_SITE_SCRIPT },
};

// Answers the edge as a founder's site Worker would: the front door, the
// frame, their stylesheet and script, and nothing else.
export function defaultSiteWorker(identity: () => Promise<DefaultSiteIdentity | null>, avatarHost = ""): Fetcher {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      const file = FILES[path];
      if (!file || (request.method !== "GET" && request.method !== "HEAD")) return notFound();
      const found = await identity();
      if (!found) return notFound();
      const headers: Record<string, string> = { "Content-Type": `${file.type}; charset=utf-8`, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" };
      if (found.listed === false) headers["X-Robots-Tag"] = "noindex";
      return new Response(request.method === "HEAD" ? null : file.body(found, avatarHost), { headers });
    },
    connect() { throw new Error("not supported"); },
  } as unknown as Fetcher;
}
