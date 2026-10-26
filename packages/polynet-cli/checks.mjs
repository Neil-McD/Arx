// The checks a community site passes before it goes live, shared by
// `polynet check`, `polynet deploy` and the MCP's community.site.deploy.
// Errors block the deploy; warnings are printed. They read the files as text
// (no browser), so they catch what is certain from the source and leave the
// rest to the polynet-accessibility skill. Plain JavaScript with no imports,
// so it runs in Node and in Polynet's backend alike.

const TEXT_FILE = /\.(html?|css|m?js)$/i;

export function isCheckedFile(path) {
  return TEXT_FILE.test(path);
}

function attr(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function hasName(tag, inner) {
  const text = inner.replace(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["'][^>]*>/gi, " $1 ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
  return Boolean(text.trim() || attr(tag, "aria-label")?.trim() || attr(tag, "aria-labelledby")?.trim() || attr(tag, "title")?.trim());
}

function checkPage(path, html, problem) {
  const source = html.replace(/<!--[\s\S]*?-->/g, "");
  // A fragment (a verification file, a partial) isn't a page; index.html always is.
  if (path !== "/index.html" && !/<(html|head|body|title)\b/i.test(source)) return;
  const htmlTag = /<html\b[^>]*>/i.exec(source)?.[0];
  if (!htmlTag || !attr(htmlTag, "lang")?.trim()) problem("error", path, 'The page has no language. Use <html lang="en"> (or the site\'s language).');
  if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(source)) problem("error", path, "The page has no <title>.");
  const viewport = [...source.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((tag) => attr(tag, "name")?.toLowerCase() === "viewport");
  if (!viewport) {
    problem("error", path, 'The page has no viewport. Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  } else {
    const content = (attr(viewport, "content") ?? "").toLowerCase();
    const maxScale = /maximum-scale\s*=\s*([\d.]+)/.exec(content);
    if (/user-scalable\s*=\s*(no|0)\b/.test(content) || (maxScale && Number(maxScale[1]) < 2)) {
      problem("error", path, "The viewport blocks zooming. Remove user-scalable=no and maximum-scale.");
    }
  }
  for (const m of source.matchAll(/<img\b[^>]*>/gi)) {
    if (attr(m[0], "alt") === null) problem("error", path, `An image has no alt text: ${m[0].slice(0, 80)}. Describe it, or use alt="" if it's decorative.`);
  }
  for (const m of source.matchAll(/<(button)\b([^>]*)>([\s\S]*?)<\/button>|<(a)\b([^>]*\bhref\b[^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<${m[1] ?? m[4]} ${m[2] ?? m[5]}>`;
    if (!hasName(tag, m[3] ?? m[6])) problem("error", path, `A ${m[1] ? "button" : "link"} has no name: ${m[0].slice(0, 80)}. Give it text or an aria-label.`);
  }
  for (const m of source.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const type = (attr(m[0], "type") ?? "").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    const id = attr(m[0], "id");
    const before = source.slice(0, m.index);
    const insideLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label");
    const labelled = insideLabel || attr(m[0], "aria-label") || attr(m[0], "aria-labelledby") || attr(m[0], "title") ||
      (id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']?${id.replace(/[^\w-]/g, "")}["'\\s>]`, "i").test(source));
    if (!labelled) problem("warning", path, `A form field may have no label: ${m[0].slice(0, 80)}.`);
  }
}

// files: [{ path: "/index.html", text }] (other files may be passed; they're ignored).
export function checkSite(files) {
  const errors = [];
  const warnings = [];
  const problem = (level, path, message) => (level === "error" ? errors : warnings).push({ path, message });
  const checked = files.filter((file) => isCheckedFile(file.path) && typeof file.text === "string");
  const css = checked.filter((file) => /\.css$/i.test(file.path));
  const scripts = checked.filter((file) => /\.m?js$/i.test(file.path));
  const pages = checked.filter((file) => /\.html?$/i.test(file.path));

  // The shell isn't checked: the edge adds /__polynet/ui.js to every page, and
  // ui.js shows <polynet-account> on any page that doesn't place one.
  for (const page of pages) checkPage(page.path, page.text, problem);

  const allCss = css.map((file) => file.text).join("\n") + pages.map((file) => file.text).join("\n");
  for (const file of [...css, ...pages]) {
    if (/outline\s*:\s*(none|0)\b/i.test(file.text) && !/:focus-visible/.test(allCss)) {
      problem("warning", file.path, "Focus outlines are removed and no :focus-visible style replaces them.");
    }
  }
  if (/@keyframes|\banimation\s*:|\btransition\s*:/i.test(allCss) && !/prefers-reduced-motion/.test(allCss)) {
    problem("warning", "/", "The site animates but never checks prefers-reduced-motion.");
  }
  for (const file of [...pages, ...scripts]) {
    if (/tabindex\s*[:=]\s*["']?[1-9]/i.test(file.text)) problem("warning", file.path, "A positive tabindex changes the keyboard order. Use 0 or -1.");
    if (/\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(/.test(file.text)) {
      problem("warning", file.path, "Uses innerHTML: make sure no Polynet text (posts, names, replies) goes through it.");
    }
    if (/\.convex\.(cloud|site)\b/i.test(file.text)) problem("warning", file.path, "Calls Polynet's servers directly. Use the SDK at /__polynet/sdk.js.");
  }
  return { errors, warnings };
}

export function formatProblems({ errors, warnings }) {
  return [
    ...errors.map((p) => `✗ ${p.path === "/" ? "site" : p.path.slice(1)}: ${p.message}`),
    ...warnings.map((p) => `! ${p.path === "/" ? "site" : p.path.slice(1)}: ${p.message}`),
  ];
}
