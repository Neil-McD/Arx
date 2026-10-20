// polynet deploy: the pieces, kept free of process and terminal concerns so they test cleanly.
import { createHash, randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, relative, sep } from "node:path";
import { isCheckedFile } from "./checks.mjs";

// Until the production release, the only Polynet with site hosting is staging.
export const DEFAULT_API_URL = "https://quick-porcupine-949.convex.site";
export const CALLBACK_PORT = 51789;
export const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

const MIME = {
  ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".map": "application/json", ".txt": "text/plain", ".md": "text/markdown", ".xml": "application/xml",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".pdf": "application/pdf", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json",
};

export function mimeType(path) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

// Files that guide the site's AI agent or configure the CLI: never served.
const NOT_SERVED = new Set(["polynet.json", "AGENTS.md", "CLAUDE.md"]);

// Every file a site serves: no dotfiles (except .well-known), no node_modules,
// not polynet.json or the agent guides.
export async function collectFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (entry.name === "node_modules" || (entry.name.startsWith(".") && entry.name !== ".well-known")) continue;
      if (NOT_SERVED.has(rel)) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push({ path: "/" + rel.split(sep).join("/"), full });
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Content hash: the bytes (base64) plus the extension, so identical bytes served
// as different types stay distinct. 32 hex characters, as Cloudflare expects.
export function hashFile(bytes, path) {
  return createHash("sha256").update(Buffer.from(bytes).toString("base64") + extname(path).slice(1)).digest("hex").slice(0, 32);
}

export async function buildManifest(files) {
  const manifest = {};
  const byHash = new Map();
  let bytes = 0;
  for (const file of files) {
    const content = await readFile(file.full);
    const hash = hashFile(content, file.path);
    manifest[file.path] = { hash, size: content.length };
    byHash.set(hash, { content, path: file.path });
    bytes += content.length;
  }
  return { manifest, byHash, files: files.length, bytes };
}

// Upload the files Cloudflare doesn't already have, one bucket per request.
// Returns the completion token (the session token itself when nothing was missing).
export async function uploadBuckets({ upload, byHash, fetchImpl = fetch }) {
  let token = upload.jwt;
  for (const bucket of upload.buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const file = byHash.get(hash);
      if (!file) throw new Error(`Cloudflare asked for a file this site doesn't have (${hash}).`);
      form.append(hash, new Blob([file.content.toString("base64")], { type: mimeType(file.path) }), hash);
    }
    const res = await fetchImpl(upload.url, { method: "POST", headers: { Authorization: `Bearer ${upload.jwt}` }, body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new Error(`Upload failed (${res.status}).`);
    if (body.result?.jwt) token = body.result.jwt;
  }
  return token;
}

// The site's checkable files (HTML, CSS, JavaScript) as text, for checks.mjs.
export async function readCheckedFiles(files) {
  return Promise.all(files.filter((file) => isCheckedFile(file.path))
    .map(async (file) => ({ path: file.path, text: await readFile(file.full, "utf8") })));
}

const GUIDE = fileURLToPath(new URL("./guide/", import.meta.url));
// Claude Code reads .claude/skills; Codex and other agents read .agents/skills.
export const SKILL_DIRS = [".agents/skills", ".claude/skills"];

// Put Polynet's skills in a site folder (replacing older copies), and the agent
// guides (AGENTS.md, CLAUDE.md) when the folder has none. Returns what it wrote.
export async function installGuide(dir) {
  const written = [];
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    if (await stat(join(dir, name)).catch(() => null)) continue;
    await cp(join(GUIDE, name), join(dir, name));
    written.push(name);
  }
  const skills = (await readdir(join(GUIDE, "skills"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const skillDir of SKILL_DIRS) {
    for (const skill of skills) {
      const target = join(dir, skillDir, skill);
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      await cp(join(GUIDE, "skills", skill), target, { recursive: true });
    }
    written.push(`${skillDir}/ (${skills.length} skills)`);
  }
  return written;
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(16).toString("base64url") };
}

export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
