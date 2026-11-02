// Generates apps/web/src/styles/community-theme-map.css: every fixed text size
// and corner radius in Polynet's CSS, re-expressed through the community
// theme's tokens. Inside a themed community, one Look setting then moves all of
// them; outside a theme nothing changes. Run after changing app CSS:
//   node --experimental-strip-types scripts/generate_community_theme_map.ts
// Pass --check to fail when the committed file is out of date.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMUNITY_TYPE_ROLES } from "../shared/communityTheme.ts";

// fileURLToPath, not URL.pathname: on Windows the pathname reads "/C:/…".
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "apps/web/src");
const OUT = join(SRC, "styles/community-theme-map.css");
// Hand-written theme rules and this file's own output are not inputs.
const SKIP = new Set(["styles/community-theme-hooks.css", "styles/community-theme-map.css"]);
const SCOPE = "[data-community-theme]";
// Classes on elements that sit above the themed container.
const OUTER = /^(?:html|body|:root|\.app-root|\.app-shell|\.product-shell|\.mobile-shell|\.web-shell)/;

type Rule = { selectors: string[]; decls: string[] };
type Block = { at: string | null; rules: Rule[] };

// Paths relative to src with "/" on every OS, so Windows reads and orders the same files.
const srcPath = (path: string) => relative(SRC, path).split(sep).join("/");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") && !SKIP.has(srcPath(path)) ? [path] : [];
  }).sort((a, b) => (srcPath(a) < srcPath(b) ? -1 : srcPath(a) > srcPath(b) ? 1 : 0));
}

const roles = Object.entries(COMMUNITY_TYPE_ROLES).filter(([role]) => role !== "display")
  .sort((a, b) => a[1] - b[1]);

// The nearest role, rounding half up; anything at display size or above is display.
function roleFor(px: number): string {
  if (px >= COMMUNITY_TYPE_ROLES.display - 2) return "display";
  let best = roles[0];
  for (const role of roles) if (Math.abs(role[1] - px) <= Math.abs(best[1] - px)) best = role;
  return best[0];
}

function fontSize(value: string): string | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? `var(--pn-type-${roleFor(Number(match[1]))})` : null;
}

// Pills and circles stay round; everything else follows the theme's corners.
function radius(value: string): string | null {
  const parts = value.trim().split(/\s+/);
  if (!parts.every((part) => /^(?:0|\d+(?:\.\d+)?px)$/.test(part))) return null;
  if (parts.every((part) => part === "0") || parts.some((part) => Number.parseFloat(part) >= 100)) return null;
  return parts.map((part) => (part === "0" ? "0" : `calc(${part} * var(--pn-radius-scale, 1))`)).join(" ");
}

function scoped(selector: string): string | null {
  if (/::?(?:-webkit-|-moz-)/.test(selector) && /scrollbar|placeholder/.test(selector)) return null;
  const trimmed = selector.trim();
  if (!trimmed || trimmed.startsWith("@")) return null;
  const [first, ...rest] = trimmed.split(/\s+(?![^(]*\))/);
  if (OUTER.test(first)) return rest.length ? `${first} ${SCOPE} ${rest.join(" ")}` : null;
  return `${SCOPE} ${trimmed}`;
}

function splitSelectors(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (text[i] === "," && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// A small CSS reader: rules, and rules nested one level in @media/@supports/@container.
function parse(css: string, blocks: Map<string, Block>, at: string | null = null) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth > 0) { if (text[j] === "{") depth += 1; else if (text[j] === "}") depth -= 1; j += 1; }
    const body = text.slice(open + 1, j - 1);
    i = j;
    if (head.startsWith("@")) {
      if (/^@(?:media|supports|container)\b/.test(head)) parse(body, blocks, at ? `${at} ${head}` : head);
      continue;
    }
    if (body.includes("{")) continue;
    const decls: string[] = [];
    for (const decl of body.split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const property = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).replace(/!important/, "").trim();
      const mapped = property === "font-size" ? fontSize(value)
        : property === "border-radius" ? radius(value) : null;
      if (mapped) decls.push(`${property}: ${mapped};`);
    }
    if (!decls.length) continue;
    const selectors = splitSelectors(head).map(scoped).filter((s): s is string => Boolean(s));
    if (!selectors.length) continue;
    const key = at ?? "";
    if (!blocks.has(key)) blocks.set(key, { at, rules: [] });
    blocks.get(key)!.rules.push({ selectors, decls });
  }
}

const blocks = new Map<string, Block>();
for (const file of cssFiles(SRC)) parse(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), blocks);

const lines = [
  "/* Generated by scripts/generate_community_theme_map.ts; do not edit.",
  "   Polynet's fixed text sizes and corners, routed through the community theme",
  "   (--pn-type-*, --pn-radius-scale). Applies only inside data-community-theme. */",
  "",
];
for (const block of [...blocks.values()].sort((a, b) => (a.at === null ? -1 : b.at === null ? 1 : 0))) {
  const indent = block.at ? "  " : "";
  if (block.at) lines.push(`${block.at} {`);
  for (const rule of block.rules) {
    lines.push(`${indent}${rule.selectors.join(`,\n${indent}`)} {`);
    for (const decl of rule.decls) lines.push(`${indent}  ${decl}`);
    lines.push(`${indent}}`);
  }
  if (block.at) lines.push("}");
}
const output = `${lines.join("\n")}\n`;

if (process.argv.includes("--check")) {
  // A Windows checkout may hold the file with CRLF line ends; compare the text.
  const current = (() => { try { return readFileSync(OUT, "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } })();
  if (current !== output) {
    console.error("community-theme-map.css is out of date. Run: node --experimental-strip-types scripts/generate_community_theme_map.ts");
    process.exit(1);
  }
  console.log("community_theme_map: ok");
} else {
  writeFileSync(OUT, output);
  console.log(`community_theme_map: wrote ${relative(ROOT, OUT).split(sep).join("/")}`);
}
