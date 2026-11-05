// Renders every Polynet icon from one mark definition.
// Usage: node scripts/generate_brand_icons.mjs [path-to-chrome]
// Needs a local Chrome/Chromium for rasterising; the SVGs need nothing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INK = "#08090A";
const WHITE = "#F7F8F8";
const PUBLIC = "apps/web/public";
const chrome =
  process.argv[2] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// The original Polynet network: one agent hub, five members linked to it
// and to each other. Hub is 1.8x a member; links are medium weight.
const FULL = {
  nodes: { a: [133, 148], hub: [258, 205], c: [382, 98], d: [440, 268], e: [304, 378], f: [72, 295] },
  links: [["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"]],
  member: 34,
  hub: 61,
  line: 18,
};
// 16px tabs: hub plus three members, heavier, so it stays a shape.
const SIMPLE = {
  nodes: { hub: [258, 205], c: [382, 98], e: [304, 378], f: [72, 295] },
  links: [["f", "hub"], ["hub", "c"], ["hub", "e"]],
  member: 46,
  hub: 73,
  line: 27,
};
const BOX = { x: 36, y: 64, width: 440, height: 352 };

function markShapes(mark, fill) {
  const lines = mark.links
    .map(([from, to]) => {
      const [x1, y1] = mark.nodes[from];
      const [x2, y2] = mark.nodes[to];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${mark.line}" stroke-linecap="round"/>`;
    })
    .join("");
  const dots = Object.entries(mark.nodes)
    .map(([id, [cx, cy]]) => `<circle cx="${cx}" cy="${cy}" r="${id === "hub" ? mark.hub : mark.member}" fill="${fill}"/>`)
    .join("");
  return lines + dots;
}

// A square icon: background plus the mark scaled to `markWidth` and centred.
function iconSvg({ mark = FULL, size = 512, radius = 112, markWidth = 360, background = INK, fill = WHITE }) {
  const scale = markWidth / BOX.width;
  const tx = (512 - markWidth) / 2 - BOX.x * scale;
  const ty = (512 - BOX.height * scale) / 2 - BOX.y * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">` +
    `<rect width="512" height="512" rx="${radius}" fill="${background}"/>` +
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${markShapes(mark, fill)}</g></svg>`;
}

const work = mkdtempSync(join(tmpdir(), "polynet-icons-"));
function renderPng(svg, size, out) {
  const page = join(work, `icon-${size}.html`);
  writeFileSync(page, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${size},${size}`, "--default-background-color=00000000",
    `--screenshot=${out}`, `file://${page}`,
  ], { stdio: "ignore" });
}

function writeIco(pngPaths, out) {
  const images = pngPaths.map(([size, path]) => [size, readFileSync(path)]);
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, data], i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  writeFileSync(out, Buffer.concat([header, ...images.map(([, data]) => data)]));
}

// Vector sources.
writeFileSync(
  `${PUBLIC}/brand/polynet-mark.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 46 472 384">${markShapes(FULL, "currentColor")}</svg>\n`,
);
writeFileSync(`${PUBLIC}/favicon.svg`, `${iconSvg({ size: 512 })}\n`);

// Rounded tiles: tabs, emails, the landing logo.
renderPng(iconSvg({ mark: SIMPLE, size: 16, markWidth: 380 }), 16, `${PUBLIC}/favicon-16x16.png`);
renderPng(iconSvg({ size: 32, markWidth: 380 }), 32, `${PUBLIC}/favicon-32x32.png`);
renderPng(iconSvg({ size: 48, markWidth: 380 }), 48, join(work, "favicon-48.png"));
renderPng(iconSvg({ size: 512 }), 512, `${PUBLIC}/favicon.png`);
renderPng(iconSvg({ size: 1254 }), 1254, `${PUBLIC}/landing-polynet/logo.png`);
writeIco(
  [[16, `${PUBLIC}/favicon-16x16.png`], [32, `${PUBLIC}/favicon-32x32.png`], [48, join(work, "favicon-48.png")]],
  `${PUBLIC}/favicon.ico`,
);

// Full-bleed squares: the OS applies its own mask, so the mark stays
// inside the maskable safe zone.
renderPng(iconSvg({ size: 180, radius: 0, markWidth: 340 }), 180, `${PUBLIC}/apple-touch-icon.png`);
renderPng(iconSvg({ size: 192, radius: 0, markWidth: 300 }), 192, `${PUBLIC}/icon-192.png`);
renderPng(iconSvg({ size: 512, radius: 0, markWidth: 300 }), 512, `${PUBLIC}/icon-512.png`);

console.log("brand icons written");
