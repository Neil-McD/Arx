import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createServer } = await import(webRequire.resolve("vite"));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const out = outputArg ? fileURLToPath(new URL(outputArg.slice(9) + "/", `file://${root}`)) : await mkdtemp(join(tmpdir(), "polynet-media-reading-"));
await mkdir(out, { recursive: true });
// Mock only the data boundary. The real host, focus policy, subscriptions' consumers,
// panel, reader and document event handlers all execute in the browser.
const gatewayFixture = `
import { conversation, messages } from "/@fs/${root}scripts/fixtures/mediaReadingData.ts";
export const createCloudDirectMessagesLiveClient = () => ({ close() {} });
export const listCloudDirectConversations = async () => [conversation];
export const listCloudNetworkPeople = async () => ({ people: [], source_community_count: 0 });
export const listCloudDirectMessagePeerPresence = async () => [];
export const subscribeCloudDirectConversations = ({ onUpdate }) => { onUpdate([conversation]); return () => {}; };
export const subscribeCloudDirectMessages = ({ onUpdate }) => { onUpdate(messages); return () => {}; };
export const subscribeCloudDirectTyping = ({ onUpdate }) => { onUpdate({ users: [], total_count: 0 }); return () => {}; };
export const markCloudDirectConversationRead = async () => {};
export const clearCloudDirectTyping = async () => {};
const forbidden = () => { throw new Error("Unexpected write in media fixture"); };
export const setCloudDirectTyping = forbidden;
export const ensureCloudDirectConversationFromCommunity = forbidden;
export const sendCloudDirectMessage = forbidden;
export const sendCloudDirectMessageToUser = forbidden;
export const blockCloudDirectMessageUser = forbidden;
export const unblockCloudDirectMessageUser = forbidden;
export const setCloudDirectConversationMuted = forbidden;
export const uploadCloudDirectMessageAttachmentFile = forbidden;
export const uploadCloudDirectMessageAttachmentFileForUser = forbidden;
`;
const server = await createServer({ configFile: join(root, "apps/web/vite.config.ts"), root: join(root, "apps/web"), server: { port: process.argv.includes("--serve") ? 5186 : 0, host: "127.0.0.1", strictPort: process.argv.includes("--serve") }, plugins: [{ name: "media-review-fixture", enforce: "pre", load(id) {
  if (id === join(root, "shared/cloudDirectMessagesGateway.ts")) return gatewayFixture;
}, configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (!req.url?.startsWith("/__media-review")) return next();
  res.setHeader("Content-Type", "text/html");
  res.end(await server.transformIndexHtml(req.url, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${root}scripts/fixtures/mediaReading.tsx"></script></body></html>`));
}); } }] });
await server.listen();
const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, "") + "/__media-review";
if (process.argv.includes("--serve")) {
  console.log("Media review fixture: http://127.0.0.1:5186/__media-review");
  await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  await server.close();
  process.exit(0);
}
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch (error) { await server.close(); throw error; }
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
let unavailableRecovered = false;
let stalledRequests = 0;
await page.route("https://media.example.test/**", async (route) => {
  const url = route.request().url();
  if (url.endsWith("unavailable.pdf") && !unavailableRecovered) return route.fulfill({ status: 403, body: "Unavailable" });
  if (url.endsWith("stalled.pdf") && ++stalledRequests === 1) return; // Remains pending until the reader cancels.
  if (url.endsWith(".pdf")) return route.fulfill({ contentType: "application/pdf", body: pdfFixture() });
  return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#445c61"/><text x="40" y="180" fill="white" font-size="40">Workshop ${url.match(/image-(\d)/)?.[1] || "0"}</text></svg>` });
});


await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "Video player fixture" }));

try {
  await page.goto(baseUrl);
  await page.locator(".deferred-youtube iframe").first().waitFor();
  assert.equal(await page.locator(".deferred-youtube").count(), 2);
  assert.equal(await page.locator(".chat-media-item").count(), 5);
  assert.equal(await page.locator("iframe").count(), 2);
  assert(!requested.some((url) => url.includes("/oembed")), "No custom title-fetching path");
  for (const src of await page.locator("iframe").evaluateAll((els) => els.map((el) => el.src))) assert(!src.includes("autoplay=1"));
  assert(!requested.some((url) => /PdfReader|pdfjs|pdf\.worker/.test(url)), "PDF implementation must not load before opening a document");
  const boxes = await page.locator(".deferred-youtube").evaluateAll((elements) => elements.map((e) => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })));
  assert.equal(boxes[0].y, boxes[1].y); assert(boxes[1].x > boxes[0].x);
  await page.screenshot({ path: join(out, "community-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Community welcome guide.pdf PDF document · Read" }).click();
  await page.getByText("Page 1 of 2", { exact: true }).waitFor();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "pdf-desktop.png") });
  await page.locator(".message-pdf-scroll").evaluate((element) => { element.scrollTop = 120; });
  assert(await page.locator(".message-pdf-scroll").evaluate((element) => element.scrollTop > 0));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator(".textLayer").getByText("Your first useful contribution", { exact: true }).waitFor();
  assert.equal(await page.locator(".message-pdf-scroll").evaluate((element) => element.scrollTop), 0, "New page starts at the top");
  await page.locator(".message-pdf-scroll").evaluate((element) => { element.scrollTop = 120; });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.locator(".textLayer").getByText("Your first useful contribution", { exact: true }).waitFor();
  assert.equal(await page.locator(".message-pdf-scroll").evaluate((element) => element.scrollTop), 120, "Zoom does not reset scroll");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  assert.equal((await downloadPromise).suggestedFilename(), "Community welcome guide.pdf");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.getByRole("button", { name: "unavailable.pdf PDF document · Read" }).click();
  await page.getByRole("alert").filter({ hasText: "cannot be previewed" }).waitFor();
  unavailableRecovered = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close document" }).click();
  await page.getByRole("button", { name: "stalled.pdf PDF document · Read" }).click();
  await page.getByRole("alert").filter({ hasText: "took too long to load" }).waitFor({ timeout: 35_000 });
  assert.equal(await page.getByRole("link", { name: "Open original", exact: true }).getAttribute("href"), "https://media.example.test/stalled.pdf");
  await page.screenshot({ path: join(out, "pdf-timeout.png") });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  assert.equal(stalledRequests, 2, "Explicit retry creates one fresh request");
  await page.getByRole("button", { name: "Close document" }).click();
  stalledRequests = 0;
  const pendingDocument = page.waitForRequest("https://media.example.test/stalled.pdf");
  await page.getByRole("button", { name: "stalled.pdf PDF document · Read" }).click();
  await pendingDocument;
  const cancelledDocument = page.waitForEvent("requestfailed", {
    predicate: (request) => request.url() === "https://media.example.test/stalled.pdf",
  });
  await page.getByRole("button", { name: "Close document" }).click();
  await cancelledDocument;
  await page.getByRole("button", { name: "stalled.pdf PDF document · Read" }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  assert.equal(stalledRequests, 2, "Reopening after cancellation starts a new request");
  await page.getByRole("button", { name: "Close document" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await page.locator(".deferred-youtube iframe").first().waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(out, "community-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Community welcome guide.pdf PDF document · Read" }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "pdf-mobile.png") });
  await page.keyboard.press("Escape");
  await page.goto(`${baseUrl}?mode=dm-mobile`);
  await page.locator(".message-pdf-card").first().waitFor();
  assert.equal(await page.locator(".message-pdf-card").count(), 2);
  await page.getByRole("button", { name: "guide.pdf PDF document · Read", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "dm-pdf-mobile.png") });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: join(out, "dm-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto(`${baseUrl}?mode=dm`);
  const dmCard = page.getByRole("button", { name: "guide.pdf PDF document · Read", exact: true });
  await dmCard.click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.equal(await page.locator(".community-dm-panel").count(), 1, "Reader controls must not close the real DM host");
  await page.locator(".textLayer").getByText("Your first useful contribution", { exact: true }).waitFor();
  // Next is now disabled on the final page. Browsers can move focus to body;
  // Escape must still belong to the open modal, regardless of its event target.
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".community-dm-panel").count(), 1, "Escape after last-page Next must not close the DM host");
  await dmCard.click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  const dmDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await dmDownload;
  await page.screenshot({ path: join(out, "dm-pdf-desktop.png") });
  assert.equal(await page.getByRole("link", { name: "Open original", exact: true }).evaluate((element) => getComputedStyle(element).color),
    await page.locator("dialog[open]").evaluate((element) => getComputedStyle(element).color), "Reader link uses its own surface contrast, not the message bubble's link color");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator(".community-dm-panel").count(), 1, "Escape must close only the reader");
  assert(await dmCard.evaluate((element) => element === document.activeElement), "Focus returns to document card");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".web-direct-messages-host").count(), 0, "Next Escape closes the DM host normally");
  await page.getByRole("button", { name: "Open conversation", exact: true }).click();
  await page.locator(".web-direct-messages-host").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Outside conversation", exact: true }).click();
  assert.equal(await page.locator(".web-direct-messages-host").count(), 0, "Outside click still dismisses the DM host");

  for (const width of [320, 390, 768, 1200]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}?theme=${theme}`);
      await page.locator(".deferred-youtube iframe").first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}/${theme}`);
      const frames = await page.locator(".deferred-youtube").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, y: r.y }; }));
      assert(frames.every((r) => r.width >= 200 && r.height >= 200), "YouTube minimum player dimensions");
      assert(await page.locator(".deferred-youtube").evaluateAll((els) => els.every((el) => { const style = getComputedStyle(el); return style.borderRadius === "12px" && style.overflow === "hidden"; })), "Native players have subtly rounded, clipped outer frames");
      const groupWidth = (await page.locator(".message-youtube-grid").boundingBox()).width;
      assert.equal(frames[0].y === frames[1].y, groupWidth >= 728, "Stack according to container width");
      await page.screenshot({ path: join(out, `community-${width}-${theme}.png`) });
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${baseUrl}?mode=dm-mobile`);
  await page.locator(".community-dm-panel-message.is-own .chat-media-grid").waitFor();
  const imageGrid = page.locator(".community-dm-panel-message.is-own .chat-media-grid");
  assert.equal(await imageGrid.locator(".chat-media-item").count(), 5);
  assert((await imageGrid.boundingBox()).width > 168, "Sent image group uses message width");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "DM does not overflow at 320");
  const dmFrames = await page.locator(".deferred-youtube:not(.is-too-narrow)").evaluateAll((els) => els.map((el) => ({ width: el.clientWidth, height: el.clientHeight })));
  assert(dmFrames.every((r) => r.width >= 200 && r.height >= 200), "Narrow DM preserves YouTube minimum size");
  assert(await page.locator(".deferred-youtube.is-too-narrow a").count() > 0, "Too-narrow DM offers native YouTube link");
  const panelBox = await page.locator(".community-dm-panel").boundingBox();
  assert(panelBox.x >= 0 && panelBox.x + panelBox.width <= 320, "Real mobile DM host fits screen");
  const gridBox = await imageGrid.boundingBox();
  assert(gridBox.x >= panelBox.x && gridBox.x + gridBox.width <= panelBox.x + panelBox.width, "Image grid is not clipped by host");
  await page.screenshot({ path: join(out, "dm-320.png") });
  await page.getByRole("button", { name: "guide.pdf PDF document · Read", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(await page.locator(".message-pdf-zoom-level").innerText(), "4×");
  assert(await page.getByRole("button", { name: "Zoom in", exact: true }).isDisabled());
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  assert(await page.locator(".message-pdf-page canvas").evaluate((el) => el.width * el.height <= 16_000_000));
  await page.screenshot({ path: join(out, "pdf-mobile-4x.png") });
  await page.getByRole("button", { name: "Fit width", exact: true }).click();
  assert.equal(await page.locator(".message-pdf-zoom-level").innerText(), "1×");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${baseUrl}?mode=performance`);
  await page.locator("iframe").first().waitFor();
  const initiallyMounted = await page.locator("iframe").count();
  assert(initiallyMounted < 6, "Long history must not eagerly create 20 players");
  await page.locator("iframe").first().evaluate((el) => { window.__firstPlayer = el; });
  await page.getByRole("button", { name: "Rerender 0", exact: true }).click();
  assert(await page.locator("iframe").first().evaluate((el) => window.__firstPlayer === el), "Rerender retains player");
  await page.locator("article").last().scrollIntoViewIfNeeded();
  await page.locator("article").last().locator("iframe").waitFor();
  assert(await page.locator("iframe").first().evaluate((el) => window.__firstPlayer === el), "Scrolling retains player");
  assert.equal(new URL(await page.locator("iframe").first().getAttribute("src")).searchParams.get("start"), "12");
  await page.screenshot({ path: join(out, "long-history.png") });
  await page.goto(`${baseUrl}?mode=surfaces`);
  await page.locator(".community-channel-pinned-root.has-rich-content").waitFor();
  await page.getByRole("button", { name: "Open pinned post", exact: true }).click();
  await page.getByRole("article", { name: "Opened pinned post" }).getByRole("button", { name: "guide.pdf PDF document · Read", exact: true }).click();
  await page.locator(".textLayer").getByText("Welcome to the community", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const resource = page.getByRole("article", { name: "Resource" });
  await resource.scrollIntoViewIfNeeded();
  await resource.locator("iframe").waitFor();
  assert.equal(new URL(await resource.locator("iframe").getAttribute("src")).searchParams.get("start"), "12");
  await page.screenshot({ path: join(out, "shared-surfaces.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ success: true, screenshots: out, checks: "desktop/mobile media grid, five images, native YouTube layout and deferred stable playback, lazy PDF loading, pages and scroll, zoom, selectable text, download, error/timeout retry, close cancellation and reopen, real DM host reader ownership, Escape, focus restoration and outside dismissal" }));
} catch (error) {
  console.error({ errors, body: (await page.locator("body").innerText()).slice(0, 3000), screenshots: out });
  await page.screenshot({ path: join(out, "failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); await server.close(); }
