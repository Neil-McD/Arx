import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createServer } = await import(webRequire.resolve("vite"));
const out = await mkdtemp(join(tmpdir(), "polynet-media-reading-"));
const server = await createServer({ configFile: join(root, "apps/web/vite.config.ts"), root: join(root, "apps/web"), server: { port: 5186, host: "127.0.0.1", strictPort: true }, plugins: [{ name: "media-review-fixture", configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (!req.url?.startsWith("/__media-review")) return next();
  res.setHeader("Content-Type", "text/html");
  res.end(await server.transformIndexHtml(req.url, `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${root}scripts/fixtures/mediaReading.tsx"></script></body></html>`));
}); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const requested = [];
page.on("request", (request) => requested.push(request.url()));

// Two-page, valid PDF fixture. No external/private documents are downloaded.
function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const title of ["Welcome to the community", "Your first useful contribution"]) {
    const stream = `BT /F1 24 Tf 50 710 Td (${title}) Tj /F1 14 Tf 0 -45 Td (Read, discuss, and build something together.) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let result = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(result.length); result += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(result + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
await page.route("https://media.example.test/**", async (route) => {
  const url = route.request().url();
  if (url.endsWith("unavailable.pdf")) return route.fulfill({ status: 403, body: "Unavailable" });
  if (url.endsWith(".pdf")) return route.fulfill({ contentType: "application/pdf", body: pdfFixture() });
  return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#445c61"/><text x="40" y="180" fill="white" font-size="40">Workshop ${url.match(/image-(\d)/)?.[1] || "0"}</text></svg>` });
});
if (!process.argv.includes("--live-metadata")) await page.route("https://www.youtube.com/oembed?*", (route) => route.fulfill({ json: { title: route.request().url().includes("jNQX") ? "Me at the zoo" : "Getting started with the community", author_name: "Community builder" } }));
await page.route("https://i.ytimg.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#425253"/><circle cx="320" cy="180" r="90" fill="#708376"/></svg>' }));
await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "Video player fixture" }));

try {
  await page.goto("http://127.0.0.1:5186/__media-review");
  await page.getByText("Me at the zoo", { exact: true }).waitFor();
  assert.equal(await page.locator(".message-video-card").count(), 2);
  assert.equal(await page.locator(".chat-media-item").count(), 5);
  assert.equal(await page.locator("iframe").count(), 0);
  assert(!requested.some((url) => /PdfReader|pdfjs|pdf\.worker/.test(url)), "PDF implementation must not load before opening a document");
  const boxes = await page.locator(".message-video-card").evaluateAll((elements) => elements.map((e) => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })));
  assert.equal(boxes[0].y, boxes[1].y); assert(boxes[1].x > boxes[0].x);
  await page.screenshot({ path: join(out, "community-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Play Me at the zoo" }).click();
  assert.equal(await page.locator("iframe").count(), 1);
  await page.getByRole("button", { name: "Community welcome guide.pdf PDF document · Read" }).click();
  await page.getByText("Page 1 of 2", { exact: true }).waitFor();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "pdf-desktop.png") });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator(".textLayer").getByText("Your first useful contribution", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.locator(".textLayer").getByText("Your first useful contribution", { exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  assert.equal((await downloadPromise).suggestedFilename(), "Community welcome guide.pdf");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.getByRole("button", { name: "unavailable.pdf PDF document · Read" }).click();
  await page.getByRole("alert").filter({ hasText: "cannot be previewed" }).waitFor();
  await page.getByRole("button", { name: "Close document" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5186/__media-review");
  await page.getByText("Me at the zoo", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(out, "community-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Community welcome guide.pdf PDF document · Read" }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "pdf-mobile.png") });
  await page.keyboard.press("Escape");
  await page.goto("http://127.0.0.1:5186/__media-review?mode=dm");
  await page.locator(".message-pdf-card").first().waitFor();
  assert.equal(await page.locator(".message-pdf-card").count(), 2);
  await page.getByRole("button", { name: "guide.pdf PDF document · Read", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: join(out, "dm-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ success: true, screenshots: out, checks: "desktop/mobile media grid, five images, YouTube titles and click playback, lazy PDF loading, pages, zoom, selectable text, download, Escape, failed PDF fallback, real DM component" }));
} catch (error) {
  console.error({ errors, body: (await page.locator("body").innerText()).slice(0, 3000), screenshots: out });
  await page.screenshot({ path: join(out, "failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); await server.close(); }
