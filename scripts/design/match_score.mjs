// Match score: how closely a page matches the hi-fi mock, in pixels.
//
//   node scripts/design/match_score.mjs <mock-url> <page-url> <out-prefix> [width] [height]
//
// Opens both in headless Chrome at the same size, screenshots them, and
// compares them inside the browser (canvas), so it needs nothing installed.
// A pixel matches when no colour channel differs by more than 8 of 255.
// Writes <out-prefix>-mock.png, -page.png, -diff.png (changed pixels in red
// over a dimmed page) and -side.png (mock left, page right), and prints the
// score as JSON.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [mockUrl, pageUrl, outPrefix, w = "1440", h = "900"] = process.argv.slice(2);
if (!mockUrl || !pageUrl || !outPrefix) {
  console.error("usage: match_score.mjs <mock-url> <page-url> <out-prefix> [width] [height]");
  process.exit(2);
}
const width = Number(w);
const height = Number(h);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const port = 9400 + (process.pid % 3000);
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "match-score-"))}`,
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
  }
  if (!target) throw new Error("headless Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Runtime.enable");

  const shoot = async (url) => {
    await send("Page.navigate", { url });
    await sleep(4000); // fonts, the banner, and the arrival animation
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return shot.data;
  };
  const mock = await shoot(mockUrl);
  const page = await shoot(pageUrl);
  writeFileSync(`${outPrefix}-mock.png`, Buffer.from(mock, "base64"));
  writeFileSync(`${outPrefix}-page.png`, Buffer.from(page, "base64"));

  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  const compare = `(async () => {
    const load = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + b64; });
    const [a, b] = await Promise.all([load(${JSON.stringify(mock)}), load(${JSON.stringify(page)})]);
    const W = ${width}, H = ${height};
    const canvas = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
    const ca = canvas(W, H), cb = canvas(W, H);
    ca.getContext("2d").drawImage(a, 0, 0); cb.getContext("2d").drawImage(b, 0, 0);
    const da = ca.getContext("2d").getImageData(0, 0, W, H).data;
    const db = cb.getContext("2d").getImageData(0, 0, W, H).data;
    const cd = canvas(W, H), xd = cd.getContext("2d"), out = xd.createImageData(W, H), o = out.data;
    // The mock's columns: left 264px, right 328px, the middle between.
    const leftEdge = 264, rightEdge = W - 328;
    const zones = { left: [0, 0], middle: [0, 0], right: [0, 0] };
    let same = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]));
      const ok = d <= 8;
      const zone = x < leftEdge ? "left" : x >= rightEdge ? "right" : "middle";
      zones[zone][1]++; if (ok) { zones[zone][0]++; same++; }
      if (ok) { o[p] = db[p] * 0.35; o[p + 1] = db[p + 1] * 0.35; o[p + 2] = db[p + 2] * 0.35; }
      else { o[p] = 255; o[p + 1] = 40; o[p + 2] = 40; }
      o[p + 3] = 255;
    }
    xd.putImageData(out, 0, 0);
    const cs = canvas(W * 2 + 16, H), xs = cs.getContext("2d");
    xs.fillStyle = "#888"; xs.fillRect(0, 0, cs.width, H); xs.drawImage(a, 0, 0); xs.drawImage(b, W + 16, 0);
    const pct = (pair) => Math.round((pair[0] / pair[1]) * 1000) / 10;
    return JSON.stringify({
      score: Math.round((same / (W * H)) * 1000) / 10,
      left: pct(zones.left), middle: pct(zones.middle), right: pct(zones.right),
      diff: cd.toDataURL("image/png").split(",")[1],
      side: cs.toDataURL("image/png").split(",")[1],
    });
  })()`;
  const result = await send("Runtime.evaluate", { expression: compare, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  const { diff, side, ...score } = JSON.parse(result.result.value);
  writeFileSync(`${outPrefix}-diff.png`, Buffer.from(diff, "base64"));
  writeFileSync(`${outPrefix}-side.png`, Buffer.from(side, "base64"));
  console.log(JSON.stringify({ width, height, ...score }));
  ws.close();
} finally {
  chrome.kill();
}
