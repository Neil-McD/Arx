// The checks `polynet review` runs inside each screenshot's page. Each finding
// names a check from the UI design skill's mistake ledger
// (guide/skills/polynet-ui-design/references/mistakes.md), so an agent can look
// up why it matters and how to fix it.
//
// auditPage runs in the browser through page.evaluate, so it must stay
// self-contained: no imports, no closures over this module.

/**
 * @param {{ scope?: string, main?: string, palette?: string[], avoid?: string[], displayFonts?: string[], viewportWidth: number }} options
 * @returns {{ errors: Finding[], warnings: Finding[], stats: Record<string, number> }}
 * @typedef {{ check: string, message: string, where?: string[] }} Finding
 */
export function auditPage(options) {
  const errors = [];
  const warnings = [];
  const root = (options.scope && document.querySelector(options.scope)) || document.body;
  const vw = options.viewportWidth;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  // items are elements, or [element, measured value] pairs; the report shows both.
  const add = (list, check, message, items = []) => {
    const where = [...new Set(items.map((item) => Array.isArray(item) ? `${describe(item[0])} (${item[1]})` : describe(item)))].slice(0, 6);
    list.push(where.length ? { check, message, where } : { check, message });
  };
  const px = (n) => `${Math.round(n)}px`;
  // Off-screen helpers (a file input behind its button, screen-reader text) aren't design.
  const visuallyHidden = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width <= 2 || r.height <= 2 || /rect\(0/.test(s.clip) || s.clipPath === "inset(50%)" || Number(s.opacity) <= 0.05;
  };

  // Colour helpers -----------------------------------------------------------
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value || "");
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const hex = (value) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  };
  const lum = ({ r, g, b }) => {
    const c = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const saturation = ({ r, g, b }) => { const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; };
  const distance = (a, b) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  const key = ({ r, g, b }) => `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
  const backgroundOf = (el) => {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== "none") return null; // gradient or photo: judged by eye
      const c = parse(s.backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const all = [...root.querySelectorAll("*")].filter(visible);

  // 1. Nothing scrolls sideways on a phone.
  const page = document.scrollingElement || document.documentElement;
  if (page.scrollWidth > vw + 1) {
    const culprits = all.filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter((el) => ![...el.children].some((child) => visible(child) && child.getBoundingClientRect().right > vw + 1))
      .map((el) => [el, `right edge at ${px(el.getBoundingClientRect().right)}`]);
    add(errors, "overflow", `The page is ${page.scrollWidth}px wide at a ${vw}px viewport: something sticks out sideways.`, culprits);
  }

  // 2. Text cut off without an ellipsis or line clamp.
  const clipped = all.filter((el) => {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(el);
    if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp !== "" && s.webkitLineClamp !== undefined) return false;
    const hides = /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY);
    return hides && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2);
  });
  if (clipped.length) add(warnings, "clipped-text", "Text is cut off with no ellipsis or line clamp.", clipped);

  // 3. Contrast of every visible piece of text.
  const lowContrast = [];
  const greyOnDark = [];
  for (const el of all) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    const bg = backgroundOf(el);
    if (!fg || !bg || fg.a < 0.5) continue;
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const r = ratio(fg, bg);
    if (r < (large ? 3 : 4.5)) lowContrast.push([el, `${r.toFixed(1)}:1, ${key(fg)} on ${key(bg)}, ${px(size)}`]);
    // AA still reads as grey on a near-black surface; dark pages want 9:1 for small text.
    else if (!large && lum(bg) < 0.05 && r < 9) greyOnDark.push([el, `${r.toFixed(1)}:1, ${key(fg)} on ${key(bg)}, ${px(size)}`]);
  }
  if (lowContrast.length) add(errors, "contrast", "Text below WCAG AA contrast (4.5:1, or 3:1 for large text).", lowContrast);
  if (greyOnDark.length) add(warnings, "grey-on-dark", "Small text on a dark surface under 9:1 reads as grey on black.", greyOnDark);

  // 4. Every colour comes from the community's theme (or brand), or a mix of
  // two of its colours (tints, hovers, borders). Anything else is a colour
  // some component brought with it.
  const palette = (options.palette || []).map(hex).filter(Boolean);
  const nearMix = (c) => {
    if (palette.some((p) => distance(p, c) < 18)) return true;
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const a = palette[i], b = palette[j];
        const ab = { r: b.r - a.r, g: b.g - a.g, b: b.b - a.b };
        const len = ab.r ** 2 + ab.g ** 2 + ab.b ** 2;
        if (!len) continue;
        const t = Math.max(0, Math.min(1, ((c.r - a.r) * ab.r + (c.g - a.g) * ab.g + (c.b - a.b) * ab.b) / len));
        if (distance({ r: a.r + ab.r * t, g: a.g + ab.g * t, b: a.b + ab.b * t }, c) < 18) return true;
      }
    }
    return false;
  };
  if (palette.length) {
    const offPalette = new Map();
    for (const el of all) {
      const s = getComputedStyle(el);
      const isSvg = el instanceof SVGElement && el.tagName.toLowerCase() !== "svg";
      for (const prop of isSvg ? ["fill", "stroke"] : ["color", "backgroundColor", "borderTopColor"]) {
        if (prop === "borderTopColor" && (parseFloat(s.borderTopWidth) === 0 || s.borderTopStyle === "none")) continue;
        if (prop === "color" && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const c = parse(s[prop]);
        if (!c || c.a < 0.5 || nearMix(c)) continue;
        const k = key(c);
        if (!offPalette.has(k)) offPalette.set(k, []);
        offPalette.get(k).push([el, prop.replace(/([A-Z])/g, " $1").toLowerCase()]);
      }
    }
    for (const [k, els] of [...offPalette].sort((a, b) => b[1].length - a[1].length)) {
      add(warnings, "off-palette", `rgb(${k}) isn't one of the community's colours or a mix of two of them.`, els);
    }
  }

  // Colours the community's brand says to avoid.
  const avoid = (options.avoid || []).map(hex).filter(Boolean);
  if (avoid.length) {
    const used = all.filter((el) => { const s = getComputedStyle(el); return ["color", "backgroundColor", "borderTopColor"].some((prop) => { const c = parse(s[prop]); return c && c.a >= 0.5 && avoid.some((a) => distance(a, c) < 18); }); });
    if (used.length) add(errors, "brand-avoid", "A colour the community's brand says to avoid is on the page.", used);
  }

  // 5. Drift: too many near-identical values is what makes UI look unclean.
  const distinct = (fn) => new Set(all.map(fn).filter((v) => v !== null && v !== undefined && v !== ""));
  const sizes = distinct((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null);
  const weights = distinct((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) ? getComputedStyle(el).fontWeight : null);
  const radii = distinct((el) => { const r = parseFloat(getComputedStyle(el).borderTopLeftRadius); return r > 0 && r < 999 ? Math.round(r) : null; });
  const borders = distinct((el) => { const s = getComputedStyle(el); return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" ? s.borderTopColor : null; });
  const shadows = distinct((el) => { const s = getComputedStyle(el).boxShadow; return s && s !== "none" ? s : null; });
  const stats = { font_sizes: sizes.size, font_weights: weights.size, radii: radii.size, border_colours: borders.size, shadows: shadows.size };
  const values = { font_sizes: [...sizes].sort((a, b) => a - b).map(px), font_weights: [...weights].sort(), radii: [...radii].sort((a, b) => a - b).map(px), border_colours: [...borders], shadows: [...shadows] };
  const limits = { font_sizes: 7, font_weights: 4, radii: 5, border_colours: 4, shadows: 3 };
  const over = Object.entries(limits).filter(([name, limit]) => stats[name] > limit)
    .map(([name, limit]) => `${stats[name]} ${name.replace("_", " ")} (aim for ${limit}): ${values[name].join(", ")}`);
  if (over.length) add(warnings, "drift", `Too many near-identical values on one screen. ${over.join("; ")}.`);

  // 6. Tap targets.
  const controls = all.filter((el) => el.matches("a[href], button, [role=button], input:not([type=hidden]), select, textarea, summary") && !visuallyHidden(el));
  const sized = (el) => { const r = el.getBoundingClientRect(); return [el, `${px(r.width)} × ${px(r.height)}`]; };
  const tiny = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; })
    .filter((el) => !(el.matches("a") && getComputedStyle(el).display === "inline"));
  if (tiny.length) add(errors, "tap-target", "Controls smaller than 24px are hard to hit.", tiny.map(sized));
  if (vw <= 480) {
    const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 40 && r.height >= 24; })
      .filter((el) => !(el.matches("a") && getComputedStyle(el).display === "inline"));
    if (small.length) add(warnings, "tap-target", "Controls under 40px tall on a phone.", small.map(sized));
  }
  // Icon-only buttons size to their icon; buttons with words and text fields should match.
  const heights = new Set(all.filter((el) => (el.matches("button, [role=button]") && (el.innerText || "").trim().length > 1) ||
      el.matches("input[type=text], input[type=search], input[type=email], input[type=url], select"))
    .filter((el) => !visuallyHidden(el)).map((el) => Math.round(el.getBoundingClientRect().height)));
  stats.control_heights = heights.size;
  if (heights.size > 3) add(warnings, "control-family", `Buttons and inputs come in ${heights.size} heights (${[...heights].sort((a, b) => a - b).map(px).join(", ")}); controls should look like one family.`);

  // 7. Emoji in the interface itself (members' own posts are theirs).
  const emoji = /\p{Extended_Pictographic}/u;
  const chrome = all.filter((el) => el.matches("button, [role=button], [role=tab], nav a, h1, h2, h3, label, [class*=chip], [class*=badge], [class*=pill]"))
    .filter((el) => emoji.test(el.innerText || ""))
    // A button that is just one emoji is a reaction, and reactions are emoji by nature.
    .filter((el) => !(el.matches("button, [role=button]") && /^\p{Extended_Pictographic}\uFE0F?$/u.test((el.innerText || "").trim())));
  if (chrome.length) add(warnings, "emoji-chrome", "Emoji used as interface labels or icons.", chrome);

  // 8. Broken images.
  const broken = [...root.querySelectorAll("img")].filter((img) => img.complete && img.naturalWidth === 0 && visible(img));
  if (broken.length) add(errors, "broken-image", "Images that failed to load.", broken);

  // 9. Placeholder or test copy.
  const filler = /lorem ipsum|untitled|test (post|course|lesson)|placeholder|asdf|\bTODO\b/i;
  const fillerEls = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && filler.test(n.textContent)));
  if (fillerEls.length) add(warnings, "filler-copy", "Placeholder or test copy is showing.", fillerEls);

  // 10. Repeated items: cards that appear 3 or more times side by side.
  const repeated = [];
  for (const parent of new Set(all.map((el) => el.parentElement).filter(Boolean))) {
    const kids = [...parent.children].filter(visible);
    const groups = new Map();
    for (const kid of kids) {
      const sig = `${kid.tagName}.${typeof kid.className === "string" ? kid.className.trim() : ""}`;
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(kid);
    }
    for (const group of groups.values()) {
      if (group.length >= 3 && group[0].getBoundingClientRect().height >= 48) repeated.push(group);
    }
  }
  const textEls = (card) => [...card.querySelectorAll("*")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const displayFonts = (options.displayFonts || []).map((f) => f.toLowerCase());
  const heavy = [], tooManyLevels = [], blocksInPreview = [], displayOnItems = [];
  for (const group of repeated) {
    const card = group[0];
    const s = getComputedStyle(card);
    // A hard shadow: offset 2px or more with little blur, like a sticker.
    const shadow = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(s.boxShadow);
    const hardShadow = s.boxShadow !== "none" && !/inset/.test(s.boxShadow) && shadow &&
      Math.max(Math.abs(Number(shadow[1])), Math.abs(Number(shadow[2]))) >= 2 && Number(shadow[3]) <= 2;
    if (parseFloat(s.borderTopWidth) > 1 || hardShadow) heavy.push([card, `border ${s.borderTopWidth}, shadow ${s.boxShadow}`]);
    const levels = new Set(textEls(card).map((el) => { const t = getComputedStyle(el); return `${t.fontSize}|${t.fontWeight}|${t.color}`; }));
    if (levels.size > 3) tooManyLevels.push([card, `${levels.size} text styles`]);
    if (card.querySelector("h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table") && card.querySelectorAll("h1, h2, h3, h4, h5, h6").length > 1) blocksInPreview.push(card);
    if (displayFonts.length && textEls(card).some((el) => displayFonts.some((f) => getComputedStyle(el).fontFamily.toLowerCase().includes(f)))) displayOnItems.push(card);
  }
  stats.repeated_groups = repeated.length;
  if (heavy.length) add(warnings, "heavy-cards", "Repeated cards carry thick borders or offset shadows; lists read calmer flat, with a hairline.", heavy);
  if (tooManyLevels.length) add(warnings, "text-levels", "A repeated card uses more than three text styles (title, body, meta).", tooManyLevels);
  if (blocksInPreview.length) add(warnings, "unclamped-preview", "Card previews render headings or lists; previews should be two lines of plain text.", blocksInPreview);
  if (displayOnItems.length) add(warnings, "display-font-on-items", "A display face is used inside repeated items; keep display faces for page headings.", displayOnItems);

  // 11. Inputs fill their container.
  const narrow = all.filter((el) => el.matches("textarea")).filter((el) => {
    const parent = el.parentElement;
    if (!parent) return false;
    const ps = getComputedStyle(parent);
    const inner = parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
    return inner > 300 && el.getBoundingClientRect().width < inner * 0.9;
  });
  if (narrow.length) add(warnings, "narrow-input", "A text box is much narrower than the space it sits in.", narrow);

  // 12. The main column never gets squeezed on desktop.
  if (vw >= 1024) {
    const main = root.querySelector(options.main || "main, [role=main]");
    if (main && visible(main) && main.getBoundingClientRect().width < 480) {
      add(errors, "squeezed-main", `The main column is ${Math.round(main.getBoundingClientRect().width)}px wide on a ${vw}px screen (keep it at 480px or more).`, [main]);
    }
    // 13. A grid of cards that collapsed into one column on a wide screen.
    const singleColumn = all.filter((el) => getComputedStyle(el).display === "grid" && el.getBoundingClientRect().width > 700)
      .filter((el) => {
        const kids = [...el.children].filter(visible);
        if (kids.length < 2 || new Set(kids.map((k) => `${k.tagName}.${k.className}`)).size !== 1) return false;
        const card = getComputedStyle(kids[0]);
        const cardLike = parseFloat(card.borderTopWidth) > 0 || (parse(card.backgroundColor)?.a ?? 0) > 0.5;
        return cardLike && new Set(kids.map((k) => Math.round(k.getBoundingClientRect().left))).size === 1 && kids[0].getBoundingClientRect().width > 600;
      });
    if (singleColumn.length) add(warnings, "single-column-grid", "Cards sit one per row on a wide screen; a page view should use the width.", singleColumn);
  }

  // 14. Internal or placeholder labels (a lowercase single word in a mono face).
  const internal = all.filter((el) => el.matches("h1, h2, h3, h4, header *, [role=dialog] *, label, button"))
    .filter((el) => { const t = (el.innerText || "").trim(); return /^[a-z_]+$/.test(t) && /mono/i.test(getComputedStyle(el).fontFamily); });
  if (internal.length) add(warnings, "internal-label", "An interface label looks like an internal name.", internal);

  // 15b. Content cut off at the screen's right edge. The page may not scroll
  // sideways when a container clips it, but members still lose the content.
  if (page.scrollWidth <= vw + 1) {
    const cut = all.filter((el) => el.getBoundingClientRect().right > vw + 1 && el.getBoundingClientRect().left < vw)
      .filter((el) => ![...el.children].some((child) => visible(child) && child.getBoundingClientRect().right > vw + 1))
      .filter((el) => (el.innerText || "").trim() || el.matches("input, textarea, select, button, img"));
    if (cut.length) add(errors, "cut-off", "Content runs past the right edge of the screen and is cut off.", cut.map((el) => [el, `right edge at ${px(el.getBoundingClientRect().right)}`]));
  }

  // 15c. Controls on top of other controls, however they're positioned.
  const hits = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 4 && y > 4) hits.push(controls[i], controls[j]);
    }
  }
  if (hits.length) add(errors, "control-collision", "Two controls sit on top of each other.", hits);

  // 15. Boxes that overlap their neighbours.
  const overlaps = [];
  for (const parent of new Set(all.map((el) => el.parentElement).filter(Boolean))) {
    const kids = [...parent.children].filter((k) => visible(k) && !/absolute|fixed|sticky/.test(getComputedStyle(k).position) && (k.innerText || "").trim());
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 4 && y > 4) overlaps.push(kids[i], kids[j]);
      }
    }
  }
  if (overlaps.length) add(errors, "overlap", "Elements overlap each other.", overlaps);

  // 16. An error message showing where content should be.
  const failing = /^(error|failed( to load)?\.?|something went wrong\.?|couldn't load.*|could not load.*)$/i;
  const errorText = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && failing.test(n.textContent.trim())));
  if (errorText.length) add(errors, "error-state", "An error message is showing in place of content.", errorText);

  return { errors, warnings, stats };
}
