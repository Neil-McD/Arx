// Renders every Polynet icon from one mark definition.
// Usage: node scripts/generate_brand_icons.mjs [path-to-chrome]
// Needs a local Chrome/Chromium for rasterising; the SVGs need nothing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INK = "#08090A";
const WHITE = "#F7F8F8";
const PUBLIC = "apps/web/public";
const OPENAI = "plugins/openai/polynet/assets";
const chrome =
  process.argv[2] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// The Polynet network: one hub (the community's AI) and five members, linked
// to it and to each other. The shape never changes: every size is measured
// from the hub (connected member 0.65, member 0.55, line 0.42 of its width).
const MARK = {
  nodes: { a: [133, 148], hub: [258, 205], c: [382, 98], d: [440, 268], e: [304, 378], f: [72, 295] },
  links: [["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"]],
  radius: { hub: 62, d: 40 },
  member: 34,
  line: 26,
};
// The mark's own box, and the 488-unit tile it is centred in.
const BOX = { cx: 259, cy: 238, width: 442 };
const TILE = { x: 12, y: -2, size: 488, cx: 256, cy: 242 };

// Light through stone: the mark is cut into the stone and lit violet from
// inside. Violet is the community's AI everywhere in the product.
const STONES = {
  graphite: {
    base: "#15161A", flat: "#B9A2FF", grain: [0.8, 0.82, 0.9, 0.3, -0.1], vein: null,
    sheen: [0.07, "#000000", 0.3], inner: ["#05020F", 0.85], lip: 0.2, bloom: 0.6,
  },
  travertine: {
    base: "#E7DDCB", flat: "#6D4AE8", grain: [0.42, 0.34, 0.24, 0.55, -0.14],
    vein: [[0.66, 0.58, 0.45], "0.005 0.034", 1.7, -0.8, 0.5],
    sheen: [0.22, "#3B2F1C", 0.18], inner: ["#14072F", 0.78], lip: 0.6, bloom: 0.42,
  },
};
const GLOW =
  '<stop offset="0" stop-color="#F4EDFF"/><stop offset=".22" stop-color="#C2A9FF"/>' +
  '<stop offset=".6" stop-color="#7C5CF0"/><stop offset="1" stop-color="#4A2CA8"/>';

function markShapes(paint, attrs = "") {
  const lines = MARK.links
    .map(([from, to]) => {
      const [x1, y1] = MARK.nodes[from];
      const [x2, y2] = MARK.nodes[to];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    })
    .join("");
  const dots = Object.entries(MARK.nodes)
    .map(([id, [cx, cy]]) => `<circle cx="${cx}" cy="${cy}" r="${MARK.radius[id] ?? MARK.member}"/>`)
    .join("");
  return `<g ${attrs}><g fill="none" stroke="${paint}" stroke-width="${MARK.line}" stroke-linecap="round">${lines}</g>` +
    `<g fill="${paint}">${dots}</g></g>`;
}

function cutFilter(stone, soft) {
  const [inner, innerOpacity] = stone.inner;
  const k = soft ? 0.7 : 1;
  return `<filter id="cut" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>` +
    `<feGaussianBlur in="inv" stdDeviation="${soft ? 4 : 5}" result="invb"/><feOffset in="invb" dy="${soft ? 5 : 7}" result="invo"/>` +
    `<feComposite in="invo" in2="SourceAlpha" operator="in" result="innerA"/>` +
    `<feFlood flood-color="${inner}" flood-opacity="${(innerOpacity * k).toFixed(2)}" result="dark"/>` +
    `<feComposite in="dark" in2="innerA" operator="in" result="inner"/>` +
    `<feOffset in="SourceAlpha" dy="${soft ? 2.5 : 3}" result="lipo"/><feComposite in="lipo" in2="SourceAlpha" operator="out" result="lipA"/>` +
    `<feFlood flood-color="#FFFFFF" flood-opacity="${(stone.lip * k).toFixed(2)}" result="white"/>` +
    `<feComposite in="white" in2="lipA" operator="in" result="lip"/>` +
    `<feMerge><feMergeNode in="lip"/><feMergeNode in="SourceGraphic"/><feMergeNode in="inner"/></feMerge></filter>`;
}

// A square icon. `fill` is how much of the tile's width the mark takes (the
// only thing that changes by size); `cut` is how much stone survives:
//   "hero" (256px and up): grain, veins, the cut edge, the glow
//   "icon" (48 to 255px):  one flat stone colour, the cut and the glow
//   "flat" (under 48px):   flat stone, flat violet
// `radius` is the corner as a share of the tile; 0 for the full-bleed squares
// an operating system masks itself.
function iconSvg({ size = 512, fill = 80, cut = "hero", radius = 0.22, stone = "graphite" }) {
  const s = STONES[stone];
  const scale = ((fill / 100) * TILE.size) / BOX.width;
  const place = `transform="translate(${TILE.cx} ${TILE.cy}) scale(${scale.toFixed(4)}) translate(${-BOX.cx} ${-BOX.cy})"`;
  const rect = `<rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}"`;
  let defs = `<clipPath id="tile">${rect} rx="${(radius * TILE.size).toFixed(1)}"/></clipPath>`;
  let body = `${rect} fill="${s.base}"/>`;
  if (cut === "flat") {
    body += markShapes(s.flat, place);
  } else {
    const [top, low, lowOpacity] = s.sheen;
    defs += `<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="258" cy="205" r="300">${GLOW}</radialGradient>` +
      `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${top}"/>` +
      `<stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="${low}" stop-opacity="${lowOpacity}"/></linearGradient>` +
      `<filter id="bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>` +
      cutFilter(s, cut === "icon");
    if (cut === "hero" && s.vein) {
      const [[r, g, b], frequency, gain, offset, opacity] = s.vein;
      defs += `<filter id="vein" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="4" seed="11"/>` +
        `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${gain} 0 0 0 ${offset}"/><feComposite operator="in" in2="SourceGraphic"/></filter>`;
      body += `${rect} fill="#000" filter="url(#vein)" opacity="${opacity}"/>`;
    }
    if (cut === "hero" && s.grain) {
      const [r, g, b, alpha, offset] = s.grain;
      defs += `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.88" numOctaves="3" seed="5"/>` +
        `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${alpha} ${offset}"/><feComposite operator="in" in2="SourceGraphic"/></filter>`;
      body += `${rect} fill="#000" filter="url(#grain)"/>`;
    }
    body += `${rect} fill="url(#sheen)"/>` +
      markShapes("#8B6CF6", `${place} filter="url(#bloom)" opacity="${s.bloom}"`) +
      markShapes("url(#glow)", `${place} filter="url(#cut)"`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${TILE.x} ${TILE.y} ${TILE.size} ${TILE.size}" width="${size}" height="${size}">` +
    `<defs>${defs}</defs><g clip-path="url(#tile)">${body}</g></svg>`;
}

const work = mkdtempSync(join(tmpdir(), "polynet-icons-"));
function renderPage(html, width, height, out) {
  const page = join(work, `page-${width}x${height}.html`);
  writeFileSync(page, html);
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${width},${height}`, "--default-background-color=00000000",
    "--allow-file-access-from-files", "--virtual-time-budget=2000",
    `--screenshot=${out}`, `file://${page}`,
  ], { stdio: "ignore" });
}

function renderPng(svg, size, out) {
  renderPage(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`, size, size, out);
}

// Link-preview card (Open Graph / X): the mark and the line, 1200x630.
function renderShareCard(out) {
  const geist = resolve("apps/web/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2");
  const mark = iconSvg({ size: 264, fill: 72 });
  renderPage(`<!doctype html><style>
    @font-face{font-family:Geist;src:url(file://${geist}) format("woff2");font-weight:100 900}
    html,body{margin:0;width:1200px;height:630px;background:${INK};color:${WHITE};font-family:Geist,sans-serif}
    .card{display:flex;align-items:center;gap:72px;height:100%;padding:0 104px;box-sizing:border-box}
    h1{margin:0;font-size:84px;font-weight:300;line-height:1.02;letter-spacing:-0.045em}
    p{margin:28px 0 0;color:#9A9FA8;font-size:30px;letter-spacing:-0.01em}
  </style><div class="card">${mark}<div><h1>Communities<br>that think.</h1><p>polynet.ai</p></div></div>`, 1200, 630, out);
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

// Vector sources: the dark tile the app uses, and the light one for light backgrounds and print.
writeFileSync(`${PUBLIC}/brand/polynet-app-icon.svg`, `${iconSvg({ size: 512 })}\n`);
writeFileSync(`${PUBLIC}/brand/polynet-app-icon-light.svg`, `${iconSvg({ size: 512, stone: "travertine" })}\n`);
writeFileSync(`${PUBLIC}/favicon.svg`, `${iconSvg({ size: 512, fill: 92, cut: "flat" })}\n`);

// Browser tabs: flat, the mark filling the tile.
renderPng(iconSvg({ size: 16, fill: 92, cut: "flat" }), 16, `${PUBLIC}/favicon-16x16.png`);
renderPng(iconSvg({ size: 32, fill: 92, cut: "flat" }), 32, `${PUBLIC}/favicon-32x32.png`);
renderPng(iconSvg({ size: 48, fill: 88, cut: "flat" }), 48, join(work, "favicon-48.png"));
writeIco(
  [[16, `${PUBLIC}/favicon-16x16.png`], [32, `${PUBLIC}/favicon-32x32.png`], [48, join(work, "favicon-48.png")]],
  `${PUBLIC}/favicon.ico`,
);

// Rounded stone tiles: emails and the landing logo.
renderPng(iconSvg({ size: 512 }), 512, `${PUBLIC}/favicon.png`);
renderPng(iconSvg({ size: 1254, fill: 72 }), 1254, `${PUBLIC}/landing-polynet/logo.png`);

// Full-bleed squares: the OS applies its own mask, so the mark stays
// inside the maskable safe zone.
renderPng(iconSvg({ size: 180, radius: 0, fill: 72, cut: "icon" }), 180, `${PUBLIC}/apple-touch-icon.png`);
renderPng(iconSvg({ size: 192, radius: 0, fill: 62, cut: "icon" }), 192, `${PUBLIC}/icon-192.png`);
renderPng(iconSvg({ size: 512, radius: 0, fill: 62 }), 512, `${PUBLIC}/icon-512.png`);
renderPng(iconSvg({ size: 512, radius: 0, fill: 62 }), 512, `${OPENAI}/logo.png`);
renderPng(iconSvg({ size: 512, radius: 0, fill: 62 }), 512, `${OPENAI}/icon.png`);

renderShareCard(`${PUBLIC}/og-image.png`);

console.log("brand icons written");
