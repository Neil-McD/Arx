// A community's design as a folder, edited like a website: pull it, change the
// files, watch the draft preview, publish. Everything goes through the same
// MCP tools any agent uses, and through the same draft the app's editor saves,
// so the app, an agent and this CLI never disagree about what is live.
// Contract: docs/community-design-contract.md.

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCommunityBrand, themeFromCommunityBrand } from "./contracts/brand.mjs";
import { normalizeCommunityTheme } from "./contracts/theme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = join(HERE, "templates");

// .polynet/design.json remembers which draft each record was last in step with,
// so a save or publish never overwrites someone else's newer change.
const STATE_FILE = join(".polynet", "design.json");

// The design records a folder holds, each with its own draft and revision on
// Polynet, so publishing a layout never resets the theme or the other way round.
// The brand (shared/communityBrand.ts) is what the community should feel like:
// members never see it, so it is saved but never published.
export const DESIGN_RECORDS = ["brand", "theme", "layout"];
const UNPUBLISHED_RECORDS = new Set(["brand"]);

const recordPath = (community, kind) => `/communities/${community}/builder/${kind}.json`;
const capability = (community, operation) => `/communities/${community}/capabilities/${operation}.json`;

function parseDocument(document) {
  if (!document || typeof document.body !== "string") return null;
  try {
    return JSON.parse(document.body);
  } catch {
    return null;
  }
}

/** One design record: draft, published, and the draft revision to build on. */
export async function readDesignRecord({ community, kind, call }) {
  const record = parseDocument(await call("polynet_read", { path: recordPath(community, kind) }));
  if (!record) throw new Error(`Polynet didn't return this community's ${kind}.`);
  return record;
}

export const readTheme = ({ community, call }) => readDesignRecord({ community, kind: "theme", call });

function idempotencyKey(community, operation, payload) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  return `design:${community}:${operation}:${hash}`;
}

async function callDesign({ community, call, operation, input }) {
  const value = await call("polynet_call", {
    operation,
    version: 1,
    target: capability(community, operation),
    input,
    idempotency_key: idempotencyKey(community, operation, input),
  });
  return value?.result ?? value;
}

/** Saves a record as the draft only managers see. Refuses if the draft moved past `expectedRevision`. */
export async function saveDesignDraft({ community, kind, record, expectedRevision, call }) {
  return await callDesign({ community, call, operation: UNPUBLISHED_RECORDS.has(kind) ? `community.${kind}.save` : `community.${kind}.save_draft`,
    input: { [kind]: record, expected_draft_revision: expectedRevision } });
}

/** Makes a record's draft live for members, if it is still the one at `expectedRevision`. */
export async function publishDesignDraft({ community, kind, expectedRevision, call }) {
  return await callDesign({ community, call, operation: `community.${kind}.publish`,
    input: { expected_draft_revision: expectedRevision } });
}

export const saveThemeDraft = ({ community, theme, expectedRevision, call }) =>
  saveDesignDraft({ community, kind: "theme", record: theme, expectedRevision, call });
export const publishTheme = ({ community, expectedRevision, call }) =>
  publishDesignDraft({ community, kind: "theme", expectedRevision, call });

// State: { community, revisions: { theme, layout } }, the draft each record was last in step with.
async function readState(root, community) {
  try {
    const state = JSON.parse(await readFile(join(root, STATE_FILE), "utf8"));
    return state?.community === community ? state.revisions ?? {} : {};
  } catch {
    return {};
  }
}

async function writeRevision(root, community, kind, revision) {
  const revisions = { ...(await readState(root, community)), [kind]: revision };
  await mkdir(join(root, ".polynet"), { recursive: true });
  await writeFile(join(root, STATE_FILE), `${JSON.stringify({ community, revisions }, null, 2)}\n`);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** The folder's design files: brand.json, theme.json and layout.json unless polynet.json says otherwise. */
export const designFiles = (root, config = {}) => ({
  brand: resolve(root, config.brand ?? "brand.json"),
  theme: resolve(root, config.theme ?? "theme.json"),
  layout: resolve(root, config.layout ?? "layout.json"),
});

/**
 * Writes the community's current drafts into the folder. The brand and layout
 * are written when the community has one of its own or the folder already has
 * the file, so a theme-only folder stays theme-only.
 */
export async function pullDesign({ root, files, community, call, kinds = DESIGN_RECORDS }) {
  const pulled = {};
  for (const kind of kinds) {
    const record = await readDesignRecord({ community, kind, call });
    const own = kind === "theme" || record.published || record.draft_revision > 0 || existsSync(files[kind]);
    if (!own) continue;
    await mkdir(dirname(files[kind]), { recursive: true });
    await writeFile(files[kind], json(record.draft));
    await writeRevision(root, community, kind, record.draft_revision);
    pulled[kind] = record;
  }
  return pulled;
}

export async function listTemplates({ templatesDir = TEMPLATES_DIR } = {}) {
  if (!existsSync(templatesDir)) return [];
  const names = (await readdir(templatesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const templates = [];
  for (const name of names.sort()) {
    try {
      templates.push({ name, ...JSON.parse(await readFile(join(templatesDir, name, "template.json"), "utf8")) });
    } catch {
      // A folder without template.json isn't a template.
    }
  }
  return templates;
}

/** The folder's brand, when it says anything a theme can use. */
async function readBrandFile(file) {
  if (!existsSync(file)) return null;
  try {
    const result = normalizeCommunityBrand(JSON.parse(await readFile(file, "utf8")));
    if (!result.ok) return null;
    return result.brand.colours?.length || result.brand.fonts?.length ? result.brand : null;
  } catch {
    return null;
  }
}

/**
 * Starts a design folder from a template: its theme, layout and anything else
 * it ships, never content. A template's `apply` says what it may overwrite:
 * `"theme": "keep_existing"` keeps the founder's own colours and fonts (the
 * folder's theme.json, or the community's theme when `community` and `call`
 * are given) and uses the template's theme only when there is none. Theme and
 * layout are separate records, so taking one never resets the other.
 */
export async function initFromTemplate({ root, template, community, call, templatesDir = TEMPLATES_DIR }) {
  const source = join(templatesDir, template);
  if (!existsSync(join(source, "template.json"))) {
    const names = (await listTemplates({ templatesDir })).map((entry) => entry.name);
    throw new Error(`No template named "${template}".${names.length ? ` Templates: ${names.join(", ")}.` : ""}`);
  }
  const chosen = JSON.parse(await readFile(join(source, "template.json"), "utf8"));
  const keepTheme = chosen.apply?.theme === "keep_existing";
  const files = designFiles(root);
  let theme = "template";
  if (existsSync(files.theme)) {
    if (!keepTheme) throw new Error("This folder already has a theme.json. Start a template in an empty folder.");
    theme = "kept";
  } else if (keepTheme && community && call) {
    const current = await readTheme({ community, call });
    if (current.published) {
      await pullDesign({ root, files, community, call, kinds: ["theme"] });
      theme = "community";
    }
  }
  // The community's brand, if it has one: a template's look then starts from
  // the founder's own colours and fonts instead of the template's.
  if (!existsSync(files.brand) && community && call) await pullDesign({ root, files, community, call, kinds: ["brand"] });
  const brand = await readBrandFile(files.brand);
  await mkdir(root, { recursive: true });
  for (const entry of await readdir(source)) {
    if (entry === "template.json" || (entry === "theme.json" && theme !== "template")) continue;
    if (entry === "theme.json" && brand) {
      const base = normalizeCommunityTheme(JSON.parse(await readFile(join(source, entry), "utf8")));
      if (base.ok) {
        const schemes = base.theme.schemes.light && base.theme.schemes.dark ? "both" : base.theme.schemes.dark ? "dark" : "light";
        await writeFile(files.theme, json(themeFromCommunityBrand(brand, base.theme, schemes)));
        theme = "brand";
        continue;
      }
    }
    await cp(join(source, entry), join(root, entry), { recursive: true });
  }
  return { ...chosen, theme };
}

/**
 * Saves each design file the folder has (brand.json, theme.json, layout.json) as its
 * record's draft. `check(kind, record, file)` returns problems (the CLI passes
 * its contract checks); any error stops every save before Polynet sees one.
 */
export async function saveFolderDraft({ root, files, community, call, check }) {
  const records = {};
  const problems = [];
  for (const kind of DESIGN_RECORDS) {
    if (!existsSync(files[kind])) continue;
    try {
      records[kind] = JSON.parse(await readFile(files[kind], "utf8"));
    } catch (error) {
      problems.push({ level: "error", path: basename(files[kind]), message: `Not valid JSON: ${error instanceof Error ? error.message : error}` });
      continue;
    }
    if (check) problems.push(...check(kind, records[kind], files[kind]));
  }
  if (problems.some((problem) => problem.level === "error")) return { ok: false, problems };
  if (!Object.keys(records).length) return { ok: false, problems: [{ level: "error", path: "theme.json", message: "This folder has no theme.json or layout.json to save." }] };
  const revisions = await readState(root, community);
  const saved = {};
  for (const [kind, record] of Object.entries(records)) {
    const revision = revisions[kind] ?? (await readDesignRecord({ community, kind, call })).draft_revision;
    saved[kind] = await saveDesignDraft({ community, kind, record, expectedRevision: revision, call });
    await writeRevision(root, community, kind, saved[kind].draft_revision);
  }
  return { ok: true, problems, saved };
}

/** Publishes each draft the folder last saved. */
export async function publishFolderDraft({ root, community, call }) {
  const revisions = await readState(root, community);
  const kinds = DESIGN_RECORDS.filter((kind) => revisions[kind] !== undefined && !UNPUBLISHED_RECORDS.has(kind));
  if (!kinds.length) throw new Error("Nothing saved from this folder yet. Run polynet dev first.");
  const published = {};
  for (const kind of kinds) published[kind] = await publishDesignDraft({ community, kind, expectedRevision: revisions[kind], call });
  return published;
}

/** Calls `onChange` (debounced) whenever one of the design files changes. Returns a function that stops watching. */
export function watchDesign({ files, onChange, delayMs = 300 }) {
  const paths = Object.values(files);
  const names = new Set(paths.map((path) => basename(path)));
  let timer = null;
  let last = null;
  const watchers = [...new Set(paths.map((path) => dirname(path)))].map((dir) => watch(dir, (_event, file) => {
    if (!names.has(file)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const stamps = await Promise.all(paths.map((path) => stat(path).then((info) => info.mtimeMs, () => 0)));
      const stamp = stamps.join(",");
      if (stamp === last) return;
      last = stamp;
      onChange();
    }, delayMs);
  }));
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}

/** The owner's draft preview of the community in the real app. */
export function draftPreviewUrl(appOrigin, community) {
  return `${appOrigin.replace(/\/$/, "")}/c/${community}?design=draft`;
}
