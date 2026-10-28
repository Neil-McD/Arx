// The checks a community site passes before it goes live, shared by
// `polynet check`, `polynet deploy` and the MCP's community.site.deploy.
// Errors block the deploy; warnings are printed. Every site has a frame
// (/frame.html: its header, navigation and footer around one <polynet-page>),
// so Polynet's standard pages (/chat, /people) appear inside the site's own
// world on every site; a site that ships its own version of one must place
// that page's blocks. They read the files as text (no browser), so they catch
// what is certain from the source and leave the rest to the
// polynet-accessibility skill. Plain JavaScript with no imports, so it runs in
// Node, in Polynet's backend and in the community edge alike.

// The standard community pages every site has from its first deploy: the edge
// serves the site's frame at each path the site doesn't serve itself, and
// <polynet-page> fills it with these blocks. The one route table: the edge,
// <polynet-page>, the shell's menu and these checks all read it. Later slices
// add /events, /learn, /knowledge, /ask, /discover, /messages, /settings,
// /manage, /communities and /join.
export const STANDARD_PAGES = [
  { path: "/chat", name: "chat", title: "Chat", blocks: ["polynet-channels", "polynet-chat"] },
  // members: /people/<handle> is the same page with that member's profile open.
  { path: "/people", name: "people", title: "People", blocks: ["polynet-members"], members: true },
];
// A handle as Polynet makes them (any case: the profile lowercases it). No dots,
// so a site's own file under /people/ (photo.jpg) is never taken for a member.
export const MEMBER_HANDLE = /^[A-Za-z0-9_-]{1,32}$/;

// Which standard page a path is: { page, handle, slash } or null. slash: it
// ended in "/" (the edge sends /chat/ to /chat when it serves the frame).
export function standardPage(pathname) {
  const path = String(pathname || "");
  const slash = path.length > 1 && path.endsWith("/");
  const bare = slash ? path.slice(0, -1) : path;
  for (const page of STANDARD_PAGES) {
    if (bare === page.path) return { page, handle: null, slash };
    if (page.members && bare.startsWith(page.path + "/")) {
      const handle = bare.slice(page.path.length + 1);
      if (MEMBER_HANDLE.test(handle)) return { page, handle, slash };
    }
  }
  return null;
}

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

// The frame and every standard page's own version are judged on their markup
// alone: no comments, no script bodies (a tag in a string isn't on the page).
function markupOnly(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, "$1$2");
}

// The frame is shown at /chat, /people and /people/<handle>, so a relative
// path in it ("styles.css") points somewhere else on all but the first.
const URL_TAG = /<(a|link|script|img|source|iframe|video|audio)\b[^>]*>/gi;
const FRAME_PATHS = STANDARD_PAGES.flatMap((page) => (page.members ? [page.path, `${page.path}/<handle>`] : [page.path])).join(", ");
const FROM_ROOT = /^(\/|#|\?|[a-z][a-z0-9+.-]*:|$)/i;
function checkFrame(files, problem) {
  const frame = files.find((file) => file.path === "/frame.html");
  if (!frame) {
    problem("error", "/", "The site has no frame.html at its root. Polynet shows its standard pages (" +
      STANDARD_PAGES.map((page) => page.path).join(", ") + ") inside it, so they look like the rest of the site: " +
      "frame.html is your header, navigation and footer with one <polynet-page></polynet-page> where the page goes. " +
      "Add it beside index.html (for a framework build, to its output folder, like dist).");
    return;
  }
  const markup = markupOnly(frame.text);
  const count = (markup.match(/<polynet-page[\s>/]/gi) ?? []).length;
  if (count === 0) {
    problem("error", frame.path, "frame.html has no <polynet-page></polynet-page>. Put exactly one where each page's content goes (usually inside <main>).");
  } else if (count > 1) {
    problem("error", frame.path, `frame.html has ${count} <polynet-page> tags. Keep exactly one, where each page's content goes.`);
  }
  const relative = new Set();
  for (const m of markup.matchAll(URL_TAG)) {
    for (const name of ["href", "src"]) {
      const value = attr(m[0], name)?.trim();
      if (value && !FROM_ROOT.test(value)) relative.add(value);
    }
  }
  if (relative.size) {
    const list = [...relative].slice(0, 3);
    problem("error", frame.path, `frame.html uses ${relative.size === 1 ? "a relative path" : "relative paths"} (${list.join(", ")}${relative.size > 3 ? ", …" : ""}). ` +
      `The frame is shown at ${FRAME_PATHS}, where those point somewhere else. ` +
      `Start them from the site's root: /${list[0].replace(/^(\.{1,2}\/)+/, "")}.`);
  }
}

// Where a page file is served: /chat.html and /chat/index.html are /chat.
function servedPath(path) {
  return /\.html$/i.test(path) ? path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "") : null;
}

// JavaScript without its comments, so a commented-out block doesn't count.
// Strings, template literals and regex literals are kept whole ("https://…"
// and /[/*]/ aren't comments). A slash is read as a regex where one can start
// (after an operator, a bracket or a keyword like return). Unusual syntax may
// be misread; then a block can go uncounted and the check asks for it.
const REGEX_AFTER = /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new))$/;
function stripScriptComments(code) {
  const out = [];
  let tail = ""; // the last few characters kept, to tell a regex from a division
  const keep = (text) => { out.push(text); tail = (tail + text).slice(-12); };
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    const next = code[i + 1];
    if (char === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 2;
      keep(" ");
      continue;
    }
    let end = i + 1;
    if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== char && (char === "`" || code[j] !== "\n")) j += code[j] === "\\" ? 2 : 1;
      end = j + 1;
    } else if (char === "/" && REGEX_AFTER.test(tail.trimEnd())) {
      let inClass = false;
      for (let j = i + 1; j < code.length && code[j] !== "\n"; j += 1) {
        if (code[j] === "\\") j += 1;
        else if (code[j] === "[") inClass = true;
        else if (code[j] === "]") inClass = false;
        else if (code[j] === "/" && !inClass) { end = j + 1; break; }
      }
    } else if (char === "\\") {
      end = i + 2;
    } else {
      // Plain code up to the next character that could start something.
      while (end < code.length && !"/\"'`\\".includes(code[end])) end += 1;
    }
    keep(code.slice(i, end));
    i = end;
  }
  return out.join("");
}

// A page's markup without HTML comments, and its inline scripts without
// JavaScript comments.
const SCRIPT_TYPE = /^(|module|(text|application)\/(java|ecma)script)$/i;
function pageSource(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (whole, open, code, close) =>
    SCRIPT_TYPE.test((attr(open, "type") ?? "").trim()) ? open + stripScriptComments(code) + close : whole);
}

// A block counts when a page has its tag, or when a script names it: a framework
// build (Vite, React, Lit) creates it from a bundle, never from the HTML.
function placesBlock(name, pages, scripts) {
  const tag = new RegExp(`<${name}[\\s>/]|["'\`]${name}["'\`]`, "i");
  const named = new RegExp(`(^|[^\\w-])${name}(?![\\w-])`);
  return pages.some((file) => tag.test(pageSource(file.text))) || scripts.some((file) => named.test(stripScriptComments(file.text)));
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

  if (!files.some((file) => file.path === "/index.html")) {
    problem("error", "/", "The site has no index.html at its root: it's the page everyone lands on. " +
      "Add index.html to the folder you check and deploy (for a framework build, its output folder, like dist).");
  }
  // The shell isn't checked: the edge adds /__polynet/ui.js to every page, and
  // ui.js shows <polynet-account> on any page that doesn't place one.
  for (const page of pages) checkPage(page.path, page.text, problem);
  checkFrame(pages, problem);
  // A site's own version of a standard page wins over Polynet's, so it must
  // carry the same blocks (a framework build may create them from a script).
  for (const page of pages) {
    const standard = standardPage(servedPath(page.path) ?? "");
    if (!standard) continue;
    const missing = standard.page.blocks.filter((name) => !placesBlock(name, [page], scripts));
    if (!missing.length) continue;
    const tags = (names) => names.map((name) => `<${name}>`).join(" and ");
    problem("error", page.path, `${page.path.slice(1)} is this site's own ${standard.page.title} page (${standard.page.path}), so it must place ${tags(standard.page.blocks)}. ` +
      `Add ${missing.map((name) => `<${name}></${name}>`).join(" ")}, or delete the file: Polynet then shows its ${standard.page.title} page inside frame.html.`);
  }

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
  const allScript = scripts.map((file) => file.text).join("\n") + pages.map((file) => file.text).join("\n");
  // A CSS display rule beats the hidden attribute, so members-only sections show to visitors.
  const togglesHidden = /\.hidden\s*=|\shidden[\s>]/i.test(allScript);
  if (togglesHidden && /\bdisplay\s*:/i.test(allCss) && !/\[hidden\]/.test(allCss)) {
    problem("warning", "/", "Sections are shown and hidden with the hidden attribute, but a CSS display rule can override it. Add [hidden] { display: none !important; }.");
  }
  // A public question to the agent is answered in that post's thread, which
  // <polynet-chat> shows; a custom feed has to read threads itself.
  if (/askAgent\s*:/.test(allScript) && !/\.thread\s*\(/.test(allScript) && !placesBlock("polynet-chat", pages, scripts)) {
    problem("warning", "/", "Posts can ask the agent (post(..., { askAgent })) but the site never reads threads, so the agent's answers won't appear. Show replies with polynet.thread().");
  }
  return { errors, warnings };
}

export function formatProblems({ errors, warnings }) {
  return [
    ...errors.map((p) => `✗ ${p.path === "/" ? "site" : p.path.slice(1)}: ${p.message}`),
    ...warnings.map((p) => `! ${p.path === "/" ? "site" : p.path.slice(1)}: ${p.message}`),
  ];
}
