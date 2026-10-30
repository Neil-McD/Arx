// The checks a community site passes before it goes live, shared by
// `polynet check`, `polynet deploy` and the MCP's community.site.deploy.
// Errors block the deploy; warnings are printed. Every site has a frame
// (/frame.html: its header, navigation and footer around one <polynet-page>),
// so Polynet's standard pages (/chat, /people, /events, /learn, /knowledge,
// /ask, /discover) appear inside the site's own world on every site; a site that
// ships its own version of one must place that page's blocks. They read the
// files as text (no browser), so they catch
// what is certain from the source and leave the rest to the
// polynet-accessibility skill. Plain JavaScript with no imports, so it runs in
// Node, in Polynet's backend and in the community edge alike.

// A handle as Polynet makes them (any case: the profile lowercases it). No dots,
// so a site's own file under /people/ (photo.jpg) is never taken for a member.
export const MEMBER_HANDLE = /^[A-Za-z0-9_-]{1,32}$/;
// One event on the calendar: <event id>~<start in ms>, Polynet's event ref
// (event:<id>:<ms>) with a URL-safe separator. Each occurrence of a recurring
// event has its own start, so its own address.
export const EVENT_ID = /^[A-Za-z0-9_-]{1,180}~[0-9]{1,16}$/;
// A course or a lesson: <its name, as Polynet slugs it>~<its id>, the name in
// Polynet's own path (/resources/<course>/<lesson>.md). The id decides; the
// name only reads well. No dots, so no site file is taken for one.
export const LEARN_SEGMENT = /^[a-z0-9-]{1,120}~[A-Za-z0-9_-]{1,180}$/;

// The standard community pages every site has from its first deploy: the edge
// serves the site's frame at each path the site doesn't serve itself, and
// <polynet-page> fills it with these blocks. The one route table: the edge,
// <polynet-page>, the shell's menu ("In this club", in this order) and these
// checks all read it. below: the addresses under the page, one pattern per
// level (/learn/<course>/<lesson>: either depth). network: a Polynet-wide page,
// not this club's own (the menu lists it apart from "In this club"). /manage
// comes later; the member's own pages (PERSONAL_PAGES) live on the private twin.
export const STANDARD_PAGES = [
  { path: "/chat", name: "chat", title: "Chat", blocks: ["polynet-channels", "polynet-chat"], below: [] },
  // members: /people/<handle> is the same page with that member's profile open.
  { path: "/people", name: "people", title: "People", blocks: ["polynet-members"], members: true, below: [["handle", MEMBER_HANDLE]] },
  { path: "/events", name: "events", title: "Events", blocks: ["polynet-events"], below: [["event", EVENT_ID]] },
  { path: "/learn", name: "learn", title: "Learn", blocks: ["polynet-learn"], below: [["course", LEARN_SEGMENT], ["lesson", LEARN_SEGMENT]] },
  { path: "/knowledge", name: "knowledge", title: "Knowledge", blocks: ["polynet-knowledge"], below: [] },
  { path: "/ask", name: "ask", title: "Ask", blocks: ["polynet-ask"], below: [] },
  // Public: every published community, signed in or not, in this site's style.
  { path: "/discover", name: "discover", title: "Discover", blocks: ["polynet-discover"], network: true, below: [] },
];

// The member's own pages. They never run on the community's site: each site
// <slug><suffix>.<sites domain> has a private twin, <slug>--me<suffix>.<sites
// domain>, where the edge draws the site's frame with every script removed and
// only Polynet's code runs, so the site's code can never read a member's
// messages, settings or other communities. ready: built; the rest say "coming
// soon" until their slice lands. signIn: only for a signed-in member (Join is
// for someone who isn't one yet). below: the addresses under the page, as on
// STANDARD_PAGES (/messages/<conversation>, and /messages/new?to=<handle>).
export const CONVERSATION_SEGMENT = /^(?:new|[A-Za-z0-9]{20,40})$/;
export const PERSONAL_PAGES = [
  { path: "/communities", name: "communities", title: "Your communities", ready: true, signIn: true, below: [] },
  { path: "/messages", name: "messages", title: "Messages", ready: true, signIn: true, below: [["conversation", CONVERSATION_SEGMENT]] },
  { path: "/settings", name: "settings", title: "Settings", ready: true, signIn: true, below: [] },
  { path: "/join", name: "join", title: "Join", ready: true, signIn: false, below: [] },
  // Moderation (owners, admins, moderators): removing one post, and join requests.
  { path: "/moderate", name: "moderate", title: "Remove a post", ready: true, signIn: true, below: [] },
  { path: "/requests", name: "requests", title: "Join requests", ready: true, signIn: true, below: [] },
];

// Which personal page a path is (exactly, or an address under it, with or
// without one trailing slash), or null.
export function personalPage(pathname) {
  const path = String(pathname || "");
  const bare = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  for (const page of PERSONAL_PAGES) {
    if (bare === page.path) return page;
    if (!page.below.length || !bare.startsWith(page.path + "/")) continue;
    const below = bare.slice(page.path.length + 1).split("/");
    if (below.length <= page.below.length && below.every((segment, i) => page.below[i][1].test(segment))) return page;
  }
  return null;
}

// The shape of a community slug that can have a site on the sites domain. A
// slug never ends in "-staging" (staging's addresses share the domain) or in
// the twin's mark "--me", so no site address is ever another site's twin.
// (Community slugs may contain "--", so the mark is reserved as an ending.)
const SITE_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
export const PRIVATE_TWIN_MARK = "--me";
const RESERVED_SLUG_ENDINGS = ["-staging", PRIVATE_TWIN_MARK];
export function siteSlugShapeOk(slug) {
  return typeof slug === "string" && SITE_SLUG.test(slug) && !RESERVED_SLUG_ENDINGS.some((end) => slug.endsWith(end));
}

const DOMAIN_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const SUFFIX_SHAPE = /^(|-[a-z0-9-]{1,20})$/;

// The one mapping between a site's host and its private twin's, used by the
// edge, the backend (which registers both origins for sign-in) and the CLI.
// Either returns null for anything that isn't exactly that shape.
//   sunrise-climbing-club-staging.polynet.page <-> sunrise-climbing-club--me-staging.polynet.page
export function privateTwinHost(siteHost, sitesDomain, hostSuffix = "") {
  const slug = siteSlugOf(siteHost, sitesDomain, hostSuffix);
  return slug ? `${slug}${PRIVATE_TWIN_MARK}${hostSuffix}.${sitesDomain}` : null;
}

export function siteHostOfTwin(twinHost, sitesDomain, hostSuffix = "") {
  const host = String(twinHost || "").toLowerCase();
  const ending = `${PRIVATE_TWIN_MARK}${hostSuffix}.${sitesDomain}`;
  if (!DOMAIN_SHAPE.test(String(sitesDomain || "")) || !SUFFIX_SHAPE.test(String(hostSuffix ?? "")) || !host.endsWith(ending)) return null;
  const slug = host.slice(0, -ending.length);
  return siteSlugShapeOk(slug) ? `${slug}${hostSuffix}.${sitesDomain}` : null;
}

function siteSlugOf(siteHost, sitesDomain, hostSuffix) {
  const host = String(siteHost || "").toLowerCase();
  const ending = `${hostSuffix}.${sitesDomain}`;
  if (!DOMAIN_SHAPE.test(String(sitesDomain || "")) || !SUFFIX_SHAPE.test(String(hostSuffix ?? "")) || !host.endsWith(ending)) return null;
  const slug = host.slice(0, -ending.length);
  return siteSlugShapeOk(slug) ? slug : null;
}

// Which standard page a path is: { page, below, handle, slash } or null.
// below: the segments under the page (["sam"], ["intro~k1", "welcome~k2"]);
// handle: the member on /people/<handle>. slash: it ended in "/" (the edge
// sends /chat/ to /chat when it serves the frame).
export function standardPage(pathname) {
  const path = String(pathname || "");
  const slash = path.length > 1 && path.endsWith("/");
  const bare = slash ? path.slice(0, -1) : path;
  for (const page of STANDARD_PAGES) {
    if (bare === page.path) return { page, below: [], handle: null, slash };
    if (!page.below.length || !bare.startsWith(page.path + "/")) continue;
    const below = bare.slice(page.path.length + 1).split("/");
    if (below.length > page.below.length || !below.every((segment, i) => page.below[i][1].test(segment))) continue;
    return { page, below, handle: page.members ? below[0] : null, slash };
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

// Lesson widgets (pages under /embeds/, or named by a lesson's polynet-embed
// block) run in a sandboxed frame inside Polynet, not as site pages: they load
// /__polynet/embed.js instead of the shell, and Polynet's page around them
// carries the account menu.
export function isEmbedPage(path, embeds) {
  return path.startsWith("/embeds/") || Boolean(embeds?.has(path));
}

function checkPage(path, html, problem, embed = false) {
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
  if (embed) {
    const scripts = [...source.matchAll(/<script\b[^>]*>/gi)].map((m) => attr(m[0], "src") ?? "");
    if (!scripts.some((src) => /^\/__polynet\/embed\.js(\?.*)?$/.test(src))) {
      problem("warning", path, 'The widget doesn\'t load /__polynet/embed.js, so it can\'t resize to fit or keep a member\'s answers. Add <script src="/__polynet/embed.js"></script>.');
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

// The frame is shown at /chat, /people/<handle>, /learn/<course>/<lesson>
// and the rest, so a relative path in it ("styles.css") points somewhere else
// on most of them.
const URL_TAG = /<(a|link|script|img|source|iframe|video|audio)\b[^>]*>/gi;
const FRAME_PATHS = STANDARD_PAGES.flatMap((page) =>
  [page.path, ...page.below.map((_, depth) => [page.path, ...page.below.slice(0, depth + 1).map(([name]) => `<${name}>`)].join("/"))]).join(", ");
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
  // Members' own pages show the frame with every script removed, so a header or
  // nav that a script fills in comes out empty there. A guess from the markup:
  // the frame runs its own scripts and has a header or nav with no links or text.
  const ownScripts = [...markup.matchAll(/<script\b[^>]*>/gi)].filter((m) => !SHELL_SCRIPT.test(attr(m[0], "src") ?? ""));
  const emptyChrome = [...markup.matchAll(/<(header|nav)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    .some((m) => !/<a\b/i.test(m[2]) && m[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length < 2);
  if (ownScripts.length && emptyChrome) {
    problem("warning", frame.path, "frame.html seems to build its header or navigation with a script. Members' own pages " +
      "(Your communities, Messages, Settings) show the frame with every script removed, so they'd have an empty header. " +
      "Write the header, nav and footer into frame.html as HTML and CSS; scripts may add to them, not draw them.");
  }
}
const SHELL_SCRIPT = /^\/__polynet\/ui\.js(\?.*)?$/;

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
// options.embeds: extra paths that are lesson widgets (see isEmbedPage).
export function checkSite(files, options = {}) {
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
  for (const page of pages) checkPage(page.path, page.text, problem, isEmbedPage(page.path, options.embeds));
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

  // A member's own pages live on the private twin, where only Polynet's code
  // runs; a site's file at one of those addresses hides it there.
  for (const page of pages) {
    const personal = personalPage(servedPath(page.path) ?? "");
    if (!personal) continue;
    problem("warning", page.path, `${page.path.slice(1)} sits at ${personal.path}, a member's own page (${personal.title}). ` +
      "Polynet serves it on this site's private twin, in your frame; delete this file so the address goes there.");
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
