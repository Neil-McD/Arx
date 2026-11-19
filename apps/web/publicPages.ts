// Polynet's public pages (/ai, /privacy, /terms) as plain HTML files, written
// at build time from their Markdown sources. They read without JavaScript and
// load none of the app, so a person, a search engine or an AI directory's
// reviewer sees the whole page on the first request. vercel.json sends each
// path (and its /m/ phone twin) to its file; the dev server serves the same.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import MarkdownIt from "markdown-it";
import type { Plugin } from "vite";
import {
  PRIVACY_AI_DATA_POLICY_DOCUMENT,
  TERMS_OF_SERVICE_DOCUMENT,
  type LegalDocument,
} from "../../shared/legalDocuments";

export const PUBLIC_SITE_ORIGIN = "https://www.polynet.ai";
export const SUPPORT_EMAIL = "support@polynet.ai";

export type PublicPage = {
  /** The address people use, e.g. "/privacy". */
  path: string;
  /** The built file vercel.json routes the address to, e.g. "privacy.html". */
  fileName: string;
  /** Repository-relative Markdown source. */
  sourcePath: string;
  title: string;
  description: string;
};

function legalPage(document: LegalDocument, path: string, description: string): PublicPage {
  return {
    path,
    fileName: `${path.slice(1)}.html`,
    sourcePath: document.sourcePath,
    title: document.title,
    description,
  };
}

export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/ai",
    fileName: "ai.html",
    sourcePath: "docs/public-pages/ai.md",
    title: "Use Polynet from your AI app",
    description:
      "Connect Claude, ChatGPT, Claude Code, Codex or Cursor to your Polynet communities: what it can see, what it can do, what waits for your yes, and how to disconnect.",
  },
  legalPage(PRIVACY_AI_DATA_POLICY_DOCUMENT, "/privacy", "How Polynet collects, uses, shares and protects information, including AI features and outside AI apps."),
  legalPage(TERMS_OF_SERVICE_DOCUMENT, "/terms", "The terms for using Polynet."),
];

export function stripFrontmatter(source: string): string {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return text.trimStart();
  const end = text.indexOf("\n---\n", 4);
  return end < 0 ? text.trimStart() : text.slice(end + 5).trimStart();
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Linear-style: near-black, small sans, one indigo accent; light when the
// device asks for it.
const PAGE_STYLES = `
:root{color-scheme:dark light;--bg:#08090a;--text:#f7f8f8;--muted:#8a8f98;--line:#23252a;--code:#141516;--accent:#7c86ff}
@media (prefers-color-scheme:light){:root{--bg:#ffffff;--text:#16171a;--muted:#62666d;--line:#e6e6e9;--code:#f4f4f6;--accent:#4f5bd5}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.page{max-width:720px;margin:0 auto;padding:40px 16px 96px}
.home{display:inline-flex;align-items:center;gap:8px;color:var(--text);font-weight:600;text-decoration:none;margin-bottom:40px}
.home img{display:block}
h1{font-size:28px;line-height:1.25;letter-spacing:-.01em;margin:0 0 16px}
h2{font-size:18px;line-height:1.35;margin:40px 0 8px}
h3{font-size:15px;margin:24px 0 4px}
p,ul,ol{margin:0 0 14px}
ul,ol{padding-left:22px}
li{margin:4px 0}
a{color:var(--accent)}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);border-radius:4px;padding:1px 5px}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto;margin:0 0 14px}
pre code{background:none;padding:0}
blockquote{margin:0 0 14px;padding:2px 14px;border-left:2px solid var(--line);color:var(--muted)}
footer{margin-top:64px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:6px 16px}
footer a{color:var(--muted)}
`.trim();

export function renderPublicPage(page: PublicPage, source: string): string {
  const body = markdown.render(stripFrontmatter(source));
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const url = `${PUBLIC_SITE_ORIGIN}${page.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Polynet</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#08090A">
<meta property="og:site_name" content="Polynet">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${PUBLIC_SITE_ORIGIN}/og-image.png">
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="page">
<a class="home" href="/"><img src="/favicon.svg" alt="" width="20" height="20">Polynet</a>
<main>
${body}</main>
<footer><a href="/ai">AI apps</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
</div>
</body>
</html>
`;
}

function readPage(repoRoot: string, page: PublicPage): string {
  return renderPublicPage(page, readFileSync(resolve(repoRoot, page.sourcePath), "utf8"));
}

/** The page an address shows, for the dev server: "/privacy", "/privacy/", "/m/privacy". */
export function publicPageForPath(pathname: string): PublicPage | null {
  const path = pathname.split("?")[0]!.replace(/^\/m(?=\/)/, "").replace(/\/+$/, "") || "/";
  return PUBLIC_PAGES.find((page) => page.path === path) ?? null;
}

export function publicPagesPlugin(repoRoot: string): Plugin {
  return {
    name: "polynet-public-pages",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const page = publicPageForPath(req.url ?? "/");
        if (!page) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readPage(repoRoot, page));
      });
    },
    generateBundle() {
      for (const page of PUBLIC_PAGES) {
        this.emitFile({ type: "asset", fileName: page.fileName, source: readPage(repoRoot, page) });
      }
    },
  };
}
