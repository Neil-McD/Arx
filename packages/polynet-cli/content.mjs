// polynet check / polynet push for courses: a folder of courses and lessons
// becomes Polynet resources. Kept free of process and terminal concerns so it
// tests cleanly, and so the same planner can run behind the CLI, CI or an agent.
//
//   courses/
//     01-get-set-up/
//       course.json        { "title", "description", "status": "draft" | "live" }
//       01-overview.md     front matter (title, stage, order, minutes, gate, ...) + body
//
// Nothing here writes to Polynet directly. `planContentPush` compares the folder
// with the builder's resource directory and returns builder changesets: the same
// reviewed path the community's builder agent uses. The owner applies each one
// in Polynet (the Apply card on the Agent page); pages arrive as drafts.
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseCommunityLessonMarkdown } from "./contracts/lesson.mjs";
import { parseCommunityEmbedBlock, COMMUNITY_EMBED_LANGUAGE } from "./contracts/embed.mjs";
import { normalizeCommunityTheme } from "./contracts/theme.mjs";
import { normalizeCommunityLayout } from "./contracts/layout.mjs";
import { checkCommunityResourceBody } from "./contracts/sections.mjs";
import { normalizeCommunityBrand, themeDriftsFromBrand } from "./contracts/brand.mjs";

// The server's limits (convex/communityResources.ts). A lesson body's limits
// (sections of up to 20,000 characters) come from contracts/sections.mjs.
export const LIMITS = {
  titleChars: 120,
  descriptionChars: 1_200,
  changesetOperations: 25,
  changesetBodyChars: 250_000,
  summaryChars: 1_000,
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function titleFromFile(name) {
  const words = basename(name).replace(/\.[^.]+$/, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : basename(name);
}

// Relative image paths in a lesson ("media/x.png", "../media/x.png") are files
// on the community site. Polynet stores the body as written, so they become
// absolute site URLs; polynet-embed blocks stay site paths (the app resolves them).
const IMAGE_MD = /(!\[[^\]]*\]\()([^)\s]+)/g;
const IMAGE_HTML = /(<img\b[^>]*\ssrc=")([^"]+)/gi;

export function sitePathOf(reference) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(reference)) return null;
  return reference.replace(/^(?:\.\.?\/)+/, "");
}

export function lessonImages(body) {
  return [...body.matchAll(IMAGE_MD), ...body.matchAll(IMAGE_HTML)].map((match) => match[2]);
}

export function resolveLessonBody(body, siteOrigin) {
  const absolute = (whole, prefix, reference) => {
    const path = sitePathOf(reference);
    return path === null ? whole : `${prefix}${siteOrigin.replace(/\/+$/, "")}/${path}`;
  };
  return body.replace(IMAGE_MD, absolute).replace(IMAGE_HTML, absolute);
}

export function embedBlocks(body) {
  const blocks = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const inner = [];
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith(open[1])) inner.push(lines[j++]);
    if (open[2] === COMMUNITY_EMBED_LANGUAGE) blocks.push({ line: i + 1, raw: inner.join("\n") });
    i = j;
  }
  return blocks;
}

/**
 * Reads the courses folder. Problems found while reading (bad front matter, a
 * broken course.json) are returned, not thrown, so `check` can list them all.
 */
export async function readCourses(coursesDir) {
  const problems = [];
  const courses = [];
  const entries = await readdir(coursesDir, { withFileTypes: true });
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(coursesDir, entry.name);
    if (!(await exists(join(dir, "course.json")))) continue;
    const where = `${entry.name}/course.json`;
    let meta = {};
    try {
      meta = JSON.parse(await readFile(join(dir, "course.json"), "utf8"));
    } catch (error) {
      problems.push({ level: "error", path: where, message: `course.json isn't valid JSON (${error.message}).` });
    }
    const status = meta.status ?? "draft";
    if (status !== "draft" && status !== "live") {
      problems.push({ level: "error", path: where, message: 'status is "draft" or "live".' });
    }
    const lessons = [];
    for (const name of (await readdir(dir)).filter((n) => n.endsWith(".md")).sort()) {
      const path = `${entry.name}/${name}`;
      const source = await readFile(join(dir, name), "utf8");
      try {
        const parsed = parseCommunityLessonMarkdown(source);
        if (!parsed.title) {
          problems.push({ level: "warning", path, message: `No title in the front matter; using "${titleFromFile(name)}".` });
        }
        lessons.push({ path, title: parsed.title ?? titleFromFile(name), lesson: parsed.lesson, source_md: parsed.body_md });
      } catch (error) {
        const field = /^community_lesson_(.+)_invalid$/.exec(error.message)?.[1];
        problems.push({
          level: "error",
          path,
          message: field ? `The "${field}" front matter value isn't valid.` : error.message,
        });
      }
    }
    courses.push({
      key: entry.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80),
      folder: entry.name,
      name: String(meta.title ?? titleFromFile(entry.name)).trim().replace(/\s+/g, " "),
      description: String(meta.description ?? "").trim(),
      status,
      lessons,
    });
  }
  return { courses, problems };
}

/** Adds each lesson's stored body: the source with site images made absolute. */
export function resolveCourses(courses, siteOrigin) {
  return courses.map((course) => ({
    ...course,
    lessons: course.lessons.map((lesson) => ({ ...lesson, body_md: resolveLessonBody(lesson.source_md, siteOrigin) })),
  }));
}

/**
 * The checks courses pass before they're pushed. `siteFiles` is the set of
 * paths the site deploys ("/embeds/x.html"); without it, file checks are skipped.
 */
export function checkCourses(courses, siteFiles) {
  const problems = [];
  const names = new Map();
  for (const course of courses) {
    const where = `${course.folder}/course.json`;
    const key = course.name.toLowerCase();
    if (names.has(key)) {
      problems.push({ level: "error", path: where, message: `Two courses are called "${course.name}" (also ${names.get(key)}). Course names must differ.` });
    }
    names.set(key, course.folder);
    if (course.name.length > LIMITS.titleChars) {
      problems.push({ level: "error", path: where, message: `The title is ${course.name.length} characters; Polynet keeps ${LIMITS.titleChars}.` });
    }
    if (course.description.length > LIMITS.descriptionChars) {
      problems.push({ level: "error", path: where, message: `The description is ${course.description.length} characters; Polynet keeps ${LIMITS.descriptionChars}.` });
    }
    const titles = new Map();
    for (const lesson of course.lessons) {
      const titleKey = lesson.title.toLowerCase();
      if (titles.has(titleKey)) {
        problems.push({ level: "error", path: lesson.path, message: `Two lessons in this course are called "${lesson.title}" (also ${titles.get(titleKey)}). A lesson's title is how push finds it again.` });
      }
      titles.set(titleKey, lesson.path);
      if (lesson.title.length > LIMITS.titleChars) {
        problems.push({ level: "error", path: lesson.path, message: `The title is ${lesson.title.length} characters; Polynet keeps ${LIMITS.titleChars}.` });
      }
      for (const problem of checkCommunityResourceBody(lesson.body_md ?? lesson.source_md)) {
        problems.push({ level: "error", path: lesson.path, message: problem.message });
      }
      for (const block of embedBlocks(lesson.source_md)) {
        const parsed = parseCommunityEmbedBlock(block.raw);
        if (!parsed.ok) {
          problems.push({ level: "error", path: `${lesson.path}:${block.line}`, message: parsed.message });
          continue;
        }
        if (siteFiles && !siteFiles.has(`/${parsed.block.src}`)) {
          problems.push({ level: "error", path: `${lesson.path}:${block.line}`, message: `The widget ${parsed.block.src} isn't in the site folder, so the lesson would show an empty frame.` });
        }
        if (siteFiles && parsed.block.fallback && !siteFiles.has(`/${parsed.block.fallback}`)) {
          problems.push({ level: "warning", path: `${lesson.path}:${block.line}`, message: `The fallback image ${parsed.block.fallback} isn't in the site folder.` });
        }
      }
      if (siteFiles) {
        for (const reference of lessonImages(lesson.source_md)) {
          const path = sitePathOf(reference);
          if (path !== null && !siteFiles.has(`/${path}`)) {
            problems.push({ level: "error", path: lesson.path, message: `The image ${reference} isn't in the site folder (looked for ${path}).` });
          }
        }
      }
    }
  }
  return problems;
}

export function checkTheme(raw, path = "theme.json") {
  const result = normalizeCommunityTheme(raw);
  if (result.ok) return [];
  return result.problems.map((problem) => ({
    level: "error",
    path: problem.path ? `${path} → ${problem.path}` : path,
    message: problem.suggestion ? `${problem.message} Try ${problem.suggestion}.` : problem.message,
  }));
}

export function checkLayout(raw, path = "layout.json") {
  const result = normalizeCommunityLayout(raw);
  if (result.ok) return [];
  return result.problems.map((problem) => ({
    level: "error",
    path: problem.path ? `${path} → ${problem.path}` : path,
    message: problem.message,
  }));
}

export function checkBrand(raw, path = "brand.json") {
  const result = normalizeCommunityBrand(raw);
  if (result.ok) return [];
  return result.problems.map((problem) => ({
    level: "error",
    path: problem.path ? `${path} → ${problem.path}` : path,
    message: problem.message,
  }));
}

/** Warnings, never errors: where a theme strays from the brand it should carry. */
export function checkThemeAgainstBrand(theme, brand, path = "theme.json") {
  const checkedTheme = normalizeCommunityTheme(theme);
  const checkedBrand = normalizeCommunityBrand(brand);
  if (!checkedTheme.ok || !checkedBrand.ok) return [];
  return themeDriftsFromBrand(checkedTheme.theme, checkedBrand.brand).map((message) => ({ level: "warning", path, message }));
}

// ------------------------------------------------------------------- planning

const sameText = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Lesson fields compared as stored: the server drops empty values.
function canonicalLesson(lesson) {
  if (!lesson) return "{}";
  const entries = Object.entries(lesson).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return JSON.stringify(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))));
}

function parseBody(document) {
  if (!document || typeof document.body !== "string") return null;
  if (document.truncated) return { truncated: true };
  try {
    return JSON.parse(document.body);
  } catch {
    return null;
  }
}

function changeId(community, operations) {
  return "polynet-cli:" + createHash("sha256").update(JSON.stringify({ community, operations })).digest("hex").slice(0, 48);
}

/**
 * Compares the courses with the community and returns what push would stage.
 * `call(tool, input)` runs one canonical Polynet tool (polynet_list,
 * polynet_read) and returns its value; the CLI passes the MCP, tests pass the
 * executor itself.
 *
 * Courses match modules by name and lessons match pages by title within their
 * course. Nothing is deleted: pages Polynet has that the folder doesn't are
 * reported as `untracked`.
 */
export async function planContentPush({ community, courses, call }) {
  const root = `/communities/${community}/builder/resources/`;
  const byId = new Map();
  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const directory = await call("polynet_list", { path: root, limit: 50, ...(cursor ? { cursor } : null) });
    for (const row of Array.isArray(directory?.entries) ? directory.entries : []) byId.set(row.id, row);
    cursor = directory?.next_cursor ?? null;
    if (!cursor) break;
  }
  const rows = [...byId.values()];
  const modules = rows.filter((row) => row.module_status !== undefined && row.resource_role === undefined);
  const pages = rows.filter((row) => row.resource_role === "page");

  const courseChanges = [];
  const untracked = [];
  const unverified = [];
  for (const course of courses) {
    const module = modules.find((row) => String(row.name).toLowerCase() === course.name.toLowerCase());
    const operations = [];
    if (!module) {
      operations.push({
        op: "create_module",
        module_key: course.key,
        name: course.name,
        description_md: course.description || null,
        module_status: course.status,
      });
      for (const lesson of course.lessons) {
        operations.push({
          op: "create_page",
          module_key: course.key,
          title: lesson.title,
          type: "post",
          body_md: lesson.body_md,
          ...(lesson.lesson ? { lesson: lesson.lesson } : null),
        });
      }
      courseChanges.push({ course: course.name, created: true, operations });
      continue;
    }
    const moduleEdit = {};
    if (!sameText(module.description_md, course.description)) moduleEdit.description_md = course.description || null;
    if (module.module_status !== course.status) moduleEdit.module_status = course.status;
    if (Object.keys(moduleEdit).length) {
      operations.push({ op: "edit_module", module_id: module.id, expected_updated_at: Date.parse(module.updated_at), ...moduleEdit });
    }
    const inCourse = pages.filter((row) => row.module_id === module.id);
    for (const lesson of course.lessons) {
      const page = inCourse.find((row) => String(row.title).toLowerCase() === lesson.title.toLowerCase());
      if (!page) {
        operations.push({
          op: "create_page",
          module_id: module.id,
          title: lesson.title,
          type: "post",
          body_md: lesson.body_md,
          ...(lesson.lesson ? { lesson: lesson.lesson } : null),
        });
        continue;
      }
      const read = parseBody(await call("polynet_read", { path: `${root}${page.id}.json` }));
      const current = read?.resource;
      const edit = {};
      if (read?.truncated || !current) {
        // Polynet returns at most 24,000 characters of a read; a long lesson can't
        // be compared, only its length.
        if (page.body_chars !== lesson.body_md.length) edit.body_md = lesson.body_md;
        else unverified.push(lesson.path);
      } else {
        if (!sameText(current.body_md, lesson.body_md)) edit.body_md = lesson.body_md;
        if (canonicalLesson(current.lesson) !== canonicalLesson(lesson.lesson)) edit.lesson = lesson.lesson ?? {};
        if (current.title !== lesson.title) edit.title = lesson.title;
      }
      if (Object.keys(edit).length) {
        operations.push({
          op: "edit_page",
          resource_id: page.id,
          expected_updated_at: Date.parse(current?.updated_at ?? page.updated_at),
          ...edit,
        });
      }
    }
    for (const page of inCourse) {
      if (!course.lessons.some((lesson) => lesson.title.toLowerCase() === String(page.title).toLowerCase())) {
        untracked.push({ course: course.name, title: page.title, id: page.id });
      }
    }
    if (operations.length) courseChanges.push({ course: course.name, created: false, operations });
  }
  return { changesets: packChangesets(community, courseChanges), courseChanges, untracked, unverified };
}

const bodyChars = (operation) => String(operation.body_md ?? "").length;

/**
 * Packs course changes into changesets of at most 25 operations whose lesson
 * bodies fit one changeset's budget. A new course's pages name it by
 * module_key, so they must share its changeset: the lessons that don't fit
 * wait for the next push (once the course exists).
 */
export function packChangesets(community, courseChanges) {
  const max = LIMITS.changesetOperations;
  const budget = LIMITS.changesetBodyChars;
  const changesets = [];
  let current = { courses: [], operations: [], chars: 0 };
  const flush = () => {
    if (!current.operations.length) return;
    const summary = `polynet push: ${current.courses.join(", ")}`.slice(0, LIMITS.summaryChars);
    changesets.push({ summary, operations: current.operations, idempotency_key: changeId(community, current.operations), courses: current.courses });
    current = { courses: [], operations: [], chars: 0 };
  };
  const fits = (operation) => current.operations.length < max && current.chars + bodyChars(operation) <= budget;
  for (const change of courseChanges) {
    let operations = change.operations;
    if (change.created) {
      let count = 0;
      let chars = 0;
      while (count < Math.min(max, operations.length) && chars + bodyChars(operations[count]) <= budget) chars += bodyChars(operations[count++]);
      operations = operations.slice(0, count);
      if (current.operations.length + operations.length > max || current.chars + chars > budget) flush();
    }
    for (const operation of operations) {
      if (!fits(operation)) flush();
      if (!current.courses.includes(change.course)) current.courses.push(change.course);
      current.operations.push(operation);
      current.chars += bodyChars(operation);
    }
  }
  flush();
  return changesets;
}

/** Stages one changeset through polynet_write. */
export async function stageChangeset({ community, changeset, call }) {
  return await call("polynet_write", {
    path: `/communities/${community}/builder/resources/`,
    mode: "create",
    content: { summary: changeset.summary, operations: changeset.operations },
    idempotency_key: changeset.idempotency_key,
  });
}

export function describeOperation(operation) {
  if (operation.op === "create_module") return `+ course  ${operation.name} (${operation.module_status})`;
  if (operation.op === "edit_module") return `~ course  ${operation.module_id}: ${Object.keys(operation).filter((k) => !["op", "module_id", "expected_updated_at"].includes(k)).join(", ")}`;
  if (operation.op === "create_page") return `+ lesson  ${operation.title}`;
  if (operation.op === "edit_page") {
    const fields = Object.keys(operation).filter((k) => !["op", "resource_id", "expected_updated_at"].includes(k));
    return `~ lesson  ${operation.resource_id}: ${fields.map((field) => (field === "body_md" ? "body" : field)).join(", ")}`;
  }
  return `${operation.op}`;
}

/** The site paths ("/embeds/x.html") that lessons show as widgets. */
export function lessonEmbeds(courses) {
  const paths = new Set();
  for (const course of courses) {
    for (const lesson of course.lessons) {
      for (const block of embedBlocks(lesson.source_md)) {
        const parsed = parseCommunityEmbedBlock(block.raw);
        if (parsed.ok) paths.add(`/${parsed.block.src}`);
      }
    }
  }
  return paths;
}
