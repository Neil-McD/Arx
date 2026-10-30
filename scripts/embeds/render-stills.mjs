// Renders each extracted embed the way Polynet frames it (sandboxed, opaque
// origin) and saves a still for its `fallback`; optionally dumps the page's
// widget data so a lesson can also carry it as plain text.
//
//   node render-stills.mjs <config.json> <embedsDir> <stillsDir> [data.json]
//
// Needs a Chromium: Playwright's, or an installed Chrome (CHROME_PATH).
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";

const [configPath, embedsDir, stillsDir, dataOut] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const widgetsDir = resolve(embedsDir);
mkdirSync(stillsDir, { recursive: true });

let chromium;
for (const name of ["playwright", "playwright-core"]) {
  try { ({ chromium } = await import(name)); break; } catch { /* try the next */ }
}
if (!chromium) throw new Error("Install playwright-core (npm i -D playwright-core) or playwright.");
const launch = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : { channel: "chrome" };

const server = createServer((req, res) => {
  const file = resolve(widgetsDir, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(widgetsDir) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader("Content-Type", extname(file) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream");
  res.end(readFileSync(file));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(launch);
for (const w of cfg.widgets) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(`<body style="margin:0"><iframe id=f sandbox="allow-scripts" src="${base}/${w.id}.html" style="border:0;width:900px;height:2600px"></iframe></body>`);
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f) => f.url().includes(`${w.id}.html`));
  const height = await frame.evaluate(() => Math.ceil(document.querySelector("#main").getBoundingClientRect().bottom));
  await page.setViewportSize({ width: 900, height: Math.min(height, 2600) });
  await page.screenshot({ path: resolve(stillsDir, `${w.id}.png`), clip: { x: 0, y: 0, width: 900, height: Math.min(height, 2600) } });
  console.log(w.id, `${height}px`, errors.length ? `ERRORS: ${errors.join(" / ")}` : "ok");
  await page.close();
}

if (dataOut && (cfg.dump || cfg.dumpLessons)) {
  const page = await browser.newPage();
  await page.goto(`${base}/${cfg.widgets[0].id}.html`);
  await page.waitForTimeout(800);
  const data = {};
  for (const [name, expr] of Object.entries(cfg.dump ?? {})) data[name] = await page.evaluate(expr);
  for (const d of cfg.dumpLessons ?? []) {
    await page.evaluate(`${cfg.bootCall}(${JSON.stringify(d.lesson)})`);
    await page.waitForTimeout(200);
    data[d.name] = await page.evaluate(d.expr);
  }
  writeFileSync(dataOut, JSON.stringify(data, null, 1));
  console.log("data:", Object.keys(data).join(" "));
}
await browser.close();
server.close();
