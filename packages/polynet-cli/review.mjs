// `polynet review`: open a community's draft in the real app at phone and
// desktop width, screenshot every page, and run the UI audit (ui-audit.mjs) on
// each. The report is the gate the polynet-ui-design skill asks for: a design
// isn't done, presented or published until it passes and a fresh reviewer has
// looked at the screenshots.
//
// Playwright isn't a dependency of the CLI (it ships with none). review loads
// it from the folder being reviewed or from wherever Node finds it.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COMMUNITY_THEME_FONTS, DEFAULT_COMMUNITY_THEME } from "./contracts/theme.mjs";
import { auditPage } from "./ui-audit.mjs";

export const REVIEW_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];
// Every community page a design reaches. Without a layout.json the community
// has Polynet's classic tabs (members and about are layout pages). The owner
// pages (settings, analytics) take the community's theme too, so they're
// reviewed with it.
const OWNER_SCREENS = ["settings", "analytics"];
export const REVIEW_SCREENS = ["chat", "resources", "events", "agent", ...OWNER_SCREENS];
const SCOPE = "[data-community-theme], .community-theme-scope";

async function loadPlaywright(root) {
  for (const base of [join(resolve(root), "package.json"), join(process.cwd(), "package.json")]) {
    try {
      const path = createRequire(base).resolve("playwright");
      // Playwright is CommonJS: imported by file URL, its exports sit on `default`.
      const mod = await import(pathToFileURL(path).href);
      return mod.chromium ? mod : mod.default;
    } catch {}
  }
  try { const mod = await import("playwright"); return mod.chromium ? mod : mod.default; } catch {}
  throw new Error("polynet review needs Playwright: run `npm i -D playwright && npx playwright install chromium` in this folder.");
}

const readJsonIfThere = async (path) => JSON.parse(await readFile(path, "utf8").catch(() => "null"));

// The colours a community's page may use: its theme (falling back to
// Polynet's own for unset colours), plus its brand. Brand colours marked
// "avoid" are reported if they appear.
export function reviewPalette({ theme, brand }) {
  const schemes = theme?.schemes && Object.keys(theme.schemes).length ? theme.schemes : DEFAULT_COMMUNITY_THEME.schemes;
  const palette = new Set();
  for (const [name, colours] of Object.entries(schemes)) {
    for (const value of Object.values({ ...DEFAULT_COMMUNITY_THEME.schemes[name], ...colours })) {
      if (typeof value === "string") palette.add(value.toUpperCase());
    }
  }
  const avoid = [];
  for (const colour of brand?.colours ?? []) {
    if (typeof colour?.hex !== "string") continue;
    if (colour.role === "avoid") avoid.push(colour.hex.toUpperCase());
    else palette.add(colour.hex.toUpperCase());
  }
  return { palette: [...palette], avoid };
}

// Which screens to visit: the layout's visible tabs, in order, then the owner pages.
export function reviewScreens(layout, only) {
  if (only?.length) return only;
  const tabs = layout?.navigation?.tabs?.filter((tab) => !tab.hidden).map((tab) => tab.tab);
  return tabs?.length ? [...new Set([...tabs, ...OWNER_SCREENS])] : REVIEW_SCREENS;
}

export function screenUrl(appOrigin, community, screen) {
  return `${appOrigin.replace(/\/$/, "")}/c/${encodeURIComponent(community)}/${screen}?design=draft`;
}

/**
 * @param {{ root: string, community: string, appOrigin: string, loginUrl?: string, storageState?: string,
 *   screens?: string[], viewports?: typeof REVIEW_VIEWPORTS, outDir?: string, settleMs?: number }} args
 */
export async function reviewCommunity(args) {
  const root = resolve(args.root);
  const files = args.files ?? { theme: join(root, "theme.json"), layout: join(root, "layout.json") };
  const theme = await readJsonIfThere(files.theme);
  const layout = await readJsonIfThere(files.layout);
  const brand = await readJsonIfThere(join(root, "brand.json"));
  const { palette, avoid } = reviewPalette({ theme, brand });
  const displayFonts = Object.entries(COMMUNITY_THEME_FONTS).filter(([, font]) => font.role === "display").map(([name]) => name);
  const screens = reviewScreens(layout, args.screens);
  const viewports = args.viewports ?? REVIEW_VIEWPORTS;
  const outDir = resolve(args.outDir ?? join(root, ".polynet", "review", new Date().toISOString().replace(/[:.]/g, "-")));
  await mkdir(outDir, { recursive: true });

  const { chromium } = await loadPlaywright(root);
  // POLYNET_CHROMIUM points at a Chromium of your own when Playwright's isn't installed.
  const browser = await chromium.launch(process.env.POLYNET_CHROMIUM ? { executablePath: process.env.POLYNET_CHROMIUM } : {});
  const results = [];
  try {
    const context = await browser.newContext(args.storageState ? { storageState: args.storageState } : {});
    if (args.loginUrl) {
      const login = await context.newPage();
      await login.goto(args.loginUrl, { waitUntil: "networkidle" });
      await login.close();
    }
    for (const viewport of viewports) {
      const page = await context.newPage();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const screen of screens) {
        const consoleErrors = [];
        const onConsole = (message) => { if (message.type() === "error") consoleErrors.push(message.text()); };
        const onError = (error) => consoleErrors.push(error.message);
        page.on("console", onConsole);
        page.on("pageerror", onError);
        const url = screenUrl(args.appOrigin, args.community, screen);
        const result = { screen, viewport: viewport.name, width: viewport.width, url, errors: [], warnings: [], stats: {} };
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
          await page.waitForSelector(SCOPE, { timeout: 15_000 });
          await page.waitForTimeout(args.settleMs ?? 600);
          const audit = await page.evaluate(auditPage, { scope: SCOPE, palette, avoid, displayFonts, viewportWidth: viewport.width });
          Object.assign(result, audit);
          if (!page.url().includes(`/${screen}`)) result.warnings.push({ check: "redirected", message: `Opened ${page.url()} instead; the layout may hide this page.` });
        } catch (error) {
          result.errors.push({ check: "load", message: `The page didn't load: ${error.message.split("\n")[0]}` });
        }
        for (const text of consoleErrors) result.errors.push({ check: "console-error", message: text.slice(0, 300) });
        result.screenshot = join(outDir, `${viewport.name}-${screen}.png`);
        await page.screenshot({ path: result.screenshot, fullPage: true }).catch(() => { result.screenshot = null; });
        page.off("console", onConsole);
        page.off("pageerror", onError);
        results.push(result);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = results.reduce((n, r) => n + r.warnings.length, 0);
  const report = { ok: errorCount === 0, community: args.community, reviewed: await fingerprint(Object.values(files)), errors: errorCount, warnings: warningCount, out_dir: outDir, results };
  await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, "report.md"), formatReview(report));
  return report;
}

// What a review looked at: the design files' contents, so publish can tell
// whether the files changed since.
async function fingerprint(paths) {
  const hash = createHash("sha256");
  for (const path of paths) hash.update(`${path}\0${await readFile(path, "utf8").catch(() => "")}\0`);
  return hash.digest("hex");
}

// The newest review of exactly these files, or null.
export async function latestReview(root, paths) {
  const dir = join(resolve(root), ".polynet", "review");
  const runs = (await readdir(dir).catch(() => [])).sort().reverse();
  const current = await fingerprint(paths);
  for (const run of runs) {
    const report = await readJsonIfThere(join(dir, run, "report.json"));
    if (report) return report.reviewed === current ? report : null;
  }
  return null;
}

export function formatReview(report) {
  const lines = [
    `# UI review: ${report.community}`,
    "",
    `${report.ok ? "Passed" : "Failed"}: ${report.errors} errors, ${report.warnings} warnings.`,
    "Each finding names a check in the polynet-ui-design skill's mistake ledger (references/mistakes.md).",
    "A pass here is necessary, not sufficient: a fresh reviewer still judges the screenshots (references/reviewer.md).",
    "",
  ];
  // The same finding on many screens is one fix: list it once, with where it shows.
  const grouped = new Map();
  for (const r of report.results) {
    for (const [level, list] of [["Error", r.errors], ["Warning", r.warnings]]) {
      for (const f of list) {
        const id = `${level}|${f.check}|${f.message}|${(f.where ?? []).join(";")}`;
        if (!grouped.has(id)) grouped.set(id, { level, finding: f, screens: [] });
        grouped.get(id).screens.push(`${r.screen} ${r.width}`);
      }
    }
  }
  if (grouped.size) {
    lines.push(`## Summary: ${grouped.size} distinct findings`, "");
    for (const { level, finding, screens } of [...grouped.values()].sort((a, b) => (a.level === b.level ? b.screens.length - a.screens.length : a.level === "Error" ? -1 : 1))) {
      lines.push(`- **${level} · ${finding.check}** (${screens.length}×: ${screens.join(", ")}): ${finding.message}${finding.where?.length ? `\n  ${finding.where.map((w) => `\`${w}\``).join(", ")}` : ""}`);
    }
    lines.push("", "## By screen", "");
  }
  for (const r of report.results) {
    lines.push(`### ${r.screen} at ${r.width}px`, "", r.screenshot ? `Screenshot: ${r.screenshot}` : "No screenshot.", "");
    if (!r.errors.length && !r.warnings.length) lines.push("No findings.", "");
    for (const [label, list] of [["Error", r.errors], ["Warning", r.warnings]]) {
      for (const f of list) lines.push(`- **${label} · ${f.check}**: ${f.message}${f.where?.length ? `\n  ${f.where.map((w) => `\`${w}\``).join(", ")}` : ""}`);
    }
    if (r.errors.length || r.warnings.length) lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
