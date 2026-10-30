import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
// @ts-ignore plain JavaScript module
import { auditPage } from "../packages/polynet-cli/ui-audit.mjs";
// @ts-ignore plain JavaScript module
import { latestReview, reviewCommunity, reviewPalette, reviewScreens, screenUrl } from "../packages/polynet-cli/review.mjs";

const THEME = { version: 1, schemes: { light: {
  background: "#F7F7F5", surface: "#FFFFFF", text: "#16181D", muted: "#5B606B", border: "#E4E5E8",
  accent: "#2B863A", on_accent: "#FFFFFF", button: "#2B863A", on_button: "#FFFFFF",
} } };
const { palette } = reviewPalette({ theme: THEME, brand: null });

const page = (body: string, css = "") => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  * { box-sizing: border-box; } body { margin: 0; font: 16px/1.5 sans-serif; background: #F7F7F5; color: #16181D; }
  main { display: block; padding: 24px; } .card { background: #FFF; border: 1px solid #E4E5E8; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; } .card p { margin: 0; color: #5B606B; font-size: 15px; }
  .meta { font-size: 13px; color: #5B606B; } button { height: 40px; padding: 0 16px; border: 0; border-radius: 12px; background: #2B863A; color: #FFF; font: inherit; }
  ${css}</style></head><body><div data-community-theme="custom"><main>${body}</main></div></body></html>`;

const CLEAN = page(`<h1 style="font-size:32px;margin:0 0 24px">Classroom</h1><button>New post</button>
  ${[1, 2, 3].map((n) => `<article class="card"><h3>Lesson ${n}: Map the business</h3><p>Two lines of preview that read as plain text.</p><div class="meta">Alex Rivera · 2h · Strategy</div></article>`).join("")}`);

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(process.env.POLYNET_CHROMIUM ? { executablePath: process.env.POLYNET_CHROMIUM } : {}); });
afterAll(async () => { await browser?.close(); });

async function audit(html: string, options: Record<string, unknown> = {}, width = 1440) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  await p.setContent(html);
  const result = await p.evaluate(auditPage, { scope: "[data-community-theme]", palette, viewportWidth: width, displayFonts: ["Excalifont"], ...options });
  await p.close();
  return result as { errors: Array<{ check: string }>; warnings: Array<{ check: string }>; stats: Record<string, number> };
}
const checks = (list: Array<{ check: string }>) => [...new Set(list.map((f) => f.check))].sort();

test("a clean, on-brand page passes the audit at desktop and phone width", async () => {
  for (const width of [1440, 390]) {
    const result = await audit(CLEAN, {}, width);
    expect(result.errors).toEqual([]);
    expect(checks(result.warnings)).toEqual([]);
  }
});

test("the audit catches the mistakes in the ledger", async () => {
  const messy = page(`
    <h1>untitled</h1>
    <div style="width:900px">Too wide for a phone</div>
    <p style="color:#B0B0B0">Grey on grey that nobody can read</p>
    <div style="background:#2F55FF;color:#fff;padding:24px">A template blue box</div>
    <button style="height:18px">x</button>
    <button>🔥 Hot</button>
    ${[1, 2, 3].map(() => `<article class="card heavy"><h3>Lorem ipsum</h3><h4>Heading in a preview</h4><h4>Another</h4><ul><li>list</li></ul></article>`).join("")}
    <div style="width:720px;padding:0"><textarea style="width:187px"></textarea></div>
  `, `.heavy { border: 2px solid #16181D; box-shadow: 4px 4px 0 #16181D; }`);
  const phone = await audit(messy, { avoid: ["#2F55FF"] }, 390);
  expect(checks(phone.errors)).toEqual(expect.arrayContaining(["brand-avoid", "contrast", "overflow", "tap-target"]));
  expect(checks(phone.warnings)).toEqual(expect.arrayContaining(["emoji-chrome", "filler-copy", "heavy-cards", "off-palette", "unclamped-preview"]));
  const desktop = await audit(messy, {}, 1440);
  expect(checks(desktop.warnings)).toEqual(expect.arrayContaining(["narrow-input"]));
});

test("a squeezed main column, overlapping boxes and a one-column grid are caught on desktop", async () => {
  const html = page(`<div style="display:flex"><main style="width:260px">Feed</main><aside style="width:900px">Drawer</aside></div>
    <div style="display:flex"><span style="width:200px">Title that collides</span><span style="width:200px;margin-left:-60px">Switcher</span></div>
    <div style="display:grid;grid-template-columns:1fr;width:1200px">${[1, 2].map(() => `<div class="card" style="width:1200px;height:80px">Member</div>`).join("")}</div>`)
    .replace("<main>", "<div>").replace("</main></div></body>", "</div></div></body>");
  const result = await audit(html, { main: "main" }, 1440);
  expect(checks(result.errors)).toEqual(expect.arrayContaining(["overlap", "squeezed-main"]));
  expect(checks(result.warnings)).toEqual(expect.arrayContaining(["single-column-grid"]));
});

test("the palette is the theme (with Polynet's colours for unset ones) plus the brand; avoid colours stay out", () => {
  const { palette: colours, avoid } = reviewPalette({ theme: THEME, brand: { colours: [{ hex: "#0b3d2e", role: "primary" }, { hex: "#FF7700", role: "avoid" }] } });
  expect(colours).toEqual(expect.arrayContaining(["#2B863A", "#F7F7F5", "#0B3D2E"]));
  expect(colours).not.toContain("#FF7700");
  expect(avoid).toEqual(["#FF7700"]);
  expect(reviewPalette({ theme: null, brand: null }).palette).toEqual(expect.arrayContaining(["#2F55FF", "#1A1A1A"]));
});

test("screens follow the layout's visible tabs, then the owner pages", () => {
  expect(reviewScreens({ navigation: { tabs: [{ tab: "chat" }, { tab: "resources" }, { tab: "agent", hidden: true }] } })).toEqual(["chat", "resources", "settings", "analytics"]);
  expect(reviewScreens(null)).toEqual(["chat", "resources", "events", "agent", "settings", "analytics"]);
  expect(reviewScreens(null, ["about"])).toEqual(["about"]);
  expect(screenUrl("http://localhost:5174/", "skool-style-demo", "chat")).toBe("http://localhost:5174/c/skool-style-demo/chat?design=draft");
});

test("review screenshots every screen at each width, writes the report, and publish can tell when files changed", async () => {
  const server: Server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(req.url?.includes("/resources") ? page(`<div style="width:900px">Wide</div>`) : CLEAN);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as any).port;
  const root = mkdtempSync(join(tmpdir(), "polynet-review-"));
  writeFileSync(join(root, "theme.json"), JSON.stringify(THEME));
  try {
    const report = await reviewCommunity({ root, community: "demo", appOrigin: `http://127.0.0.1:${port}`, screens: ["chat", "resources"],
      viewports: [{ name: "phone", width: 390, height: 844 }], settleMs: 0 });
    expect(report.results.map((r: any) => `${r.viewport}-${r.screen}`)).toEqual(["phone-chat", "phone-resources"]);
    expect(report.ok).toBe(false);
    expect(report.results[1].errors.map((f: any) => f.check)).toContain("overflow");
    expect(report.results.every((r: any) => r.screenshot?.endsWith(".png"))).toBe(true);
    const files = [join(root, "theme.json"), join(root, "layout.json")];
    expect(await latestReview(root, files)).toMatchObject({ ok: false, errors: report.errors });
    writeFileSync(join(root, "theme.json"), JSON.stringify({ ...THEME, radius: 4 }));
    expect(await latestReview(root, files)).toBeNull();
  } finally {
    server.close();
  }
}, 60_000);

test("tuned on the 2-Hour Club run: real findings carry numbers, Polynet's own non-issues stay quiet", async () => {
  const html = page(`
    <input type="file" style="position:absolute;width:1px;height:1px;opacity:0">
    <button style="height:40px">👍</button>
    <div style="display:grid;width:1200px">${[1, 2, 3].map(() => `<div style="width:1200px;height:60px">A chat message</div>`).join("")}</div>
    <p class="meta">Error</p>
    <svg width="40" height="40"><circle cx="20" cy="20" r="10" fill="#22B8F0"></circle></svg>
    <span style="color:#2B863A;background:#151513;font-size:13px">Alex Rivera</span>
  `);
  const result = await audit(html, {}, 1440);
  expect(checks(result.errors)).toEqual(["contrast", "error-state"]);
  const contrast = result.errors.find((f) => f.check === "contrast") as any;
  expect(contrast.where[0]).toMatch(/Alex Rivera.*\(4\.\d:1, 43,134,58 on 21,21,19, 13px\)/);
  expect(checks(result.warnings)).toEqual(["off-palette"]);
  expect((result.warnings[0] as any).where[0]).toContain("(fill)");
});

test("tuned on the fresh review: clipped cards and colliding buttons are caught even when the page doesn't scroll", async () => {
  const html = page(`<div style="overflow:hidden"><div style="width:520px" class="card">A course card that runs off the phone</div></div>
    <div style="position:relative;height:48px"><button>New event</button><button style="position:absolute;left:30px;top:0">Chat</button></div>`);
  const result = await audit(html, {}, 390);
  expect(checks(result.errors)).toEqual(expect.arrayContaining(["control-collision", "cut-off"]));
  expect(checks(result.errors)).not.toContain("overflow");
});
