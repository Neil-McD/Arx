// A Polynet project folder: what polynet.json says lives where.
//
//   {
//     "community": "the-2-hour-club",
//     "site": ".",            the community site, deployed to <slug>.polynet.page (default: this folder)
//     "courses": "courses",   courses and lessons, pushed as resources (default: courses/, if present)
//     "theme": "theme.json",  the community theme (default: theme.json, if present)
//     "site_origin": "https://the-2-hour-club.polynet.page"   where lesson images are served from
//   }
//
// Courses and the theme are never uploaded with the site, even when they sit
// inside the site folder: lessons can be paid content.
import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { collectFiles } from "./lib.mjs";

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function readProject(dir, { community: communityFlag } = {}) {
  const root = resolve(dir);
  let config = {};
  try {
    config = JSON.parse(await readFile(join(root, "polynet.json"), "utf8"));
  } catch {
    config = {};
  }
  const community = (communityFlag ?? config.community ?? "").trim().toLowerCase() || null;
  const site = resolve(root, config.site ?? ".");
  const coursesPath = resolve(root, config.courses ?? "courses");
  const themePath = resolve(root, config.theme ?? "theme.json");
  const courses = (await isDir(coursesPath)) ? coursesPath : null;
  const theme = (await isFile(themePath)) ? themePath : null;
  const layoutPath = resolve(root, config.layout ?? "layout.json");
  const layout = (await isFile(layoutPath)) ? layoutPath : null;
  const brandPath = resolve(root, config.brand ?? "brand.json");
  const brand = (await isFile(brandPath)) ? brandPath : null;
  const siteOrigin = (process.env.POLYNET_SITE_ORIGIN || config.site_origin || (community ? `https://${community}.polynet.page` : "")).replace(/\/+$/, "");
  return { root, config, community, site, courses, theme, layout, brand, siteOrigin };
}

/** The files the site serves: never the courses folder or the design files. */
export async function siteFiles(project) {
  if (!(await isDir(project.site))) return [];
  const inside = (path) => {
    const rel = relative(project.site, path);
    return rel && !rel.startsWith("..") ? "/" + rel.split(sep).join("/") : null;
  };
  const hiddenDir = project.courses ? inside(project.courses) : null;
  const hiddenFiles = [project.theme, project.layout, project.brand].filter(Boolean).map(inside);
  return (await collectFiles(project.site)).filter(
    (file) => !hiddenFiles.includes(file.path) && !(hiddenDir && (file.path === hiddenDir || file.path.startsWith(hiddenDir + "/"))),
  );
}
