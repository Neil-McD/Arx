import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
// @ts-expect-error plain ES module without types
import { apiUrlFor, buildManifest, collectFiles, hashFile, installGuide, installSkills, mimeType, pkce, privateAddress, readCheckedFiles, siteAddress, siteConfigPaths, uploadBuckets } from "../packages/polynet-cli/lib.mjs";
import { STANDARD_PAGES, checkSite, standardPage } from "../packages/polynet-cli/checks.mjs";
// @ts-expect-error plain ES module without types
import { checkCourses, checkTheme, packChangesets, readCourses, resolveCourses, resolveLessonBody } from "../packages/polynet-cli/content.mjs";
// @ts-expect-error plain ES module without types
import { readProject, siteFiles } from "../packages/polynet-cli/project.mjs";
// @ts-expect-error plain ES module without types
import { buildContract, CONTRACTS } from "../packages/polynet-cli/tools/build-contracts.mjs";
import { buildDesignGuide, DESIGN_GUIDE_TARGET } from "../packages/polynet-cli/tools/build-design-guide.mjs";
import { checkCommunityResourceBody } from "../shared/communityLessonSections";

function site() {
  const root = mkdtempSync(join(tmpdir(), "polynet-site-"));
  const put = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put("index.html", "<h1>Run club</h1>");
  put("css/app.css", "h1{}");
  put("copy.txt", "<h1>Run club</h1>");
  put(".env", "SECRET=1");
  put(".well-known/security.txt", "contact");
  put("node_modules/x/index.js", "x");
  put("polynet.json", '{"community":"run-club"}');
  put("AGENTS.md", "# guide");
  put("CLAUDE.md", "@AGENTS.md");
  return root;
}

test("a site is its served files: no dotfiles, node_modules, polynet.json or agent guides", async () => {
  const files = await collectFiles(site());
  expect(files.map((file: any) => file.path)).toEqual(["/.well-known/security.txt", "/copy.txt", "/css/app.css", "/index.html"]);
});

test("the manifest hashes content plus extension, 32 hex characters", async () => {
  const built = await buildManifest(await collectFiles(site()));
  expect(built.files).toBe(4);
  expect(built.manifest["/index.html"]).toEqual({ hash: expect.stringMatching(/^[a-f0-9]{32}$/), size: 17 });
  // Same bytes, different type: different hashes.
  expect(built.manifest["/copy.txt"].hash).not.toBe(built.manifest["/index.html"].hash);
  expect(hashFile(Buffer.from("a"), "/a.css")).toBe(hashFile(Buffer.from("a"), "/b.css"));
  expect(mimeType("/x.WOFF2")).toBe("font/woff2");
  expect(mimeType("/x.unknown")).toBe("application/octet-stream");
});

test("only the files Cloudflare asks for are uploaded, with the upload pass", async () => {
  const built = await buildManifest(await collectFiles(site()));
  const css = built.manifest["/css/app.css"].hash;
  const calls: Array<{ url: string; auth: string; fields: Record<string, string> }> = [];
  const fakeFetch = async (url: string, init: any) => {
    const fields: Record<string, string> = {};
    for (const [key, value] of (init.body as FormData).entries()) fields[key] = `${(value as Blob).type}:${await (value as Blob).text()}`;
    calls.push({ url, auth: init.headers.Authorization, fields });
    return Response.json({ success: true, result: { jwt: "completion" } }, { status: 201 });
  };
  const token = await uploadBuckets({ upload: { url: "https://cf/upload?base64=true", jwt: "pass", buckets: [[css]] }, byHash: built.byHash, fetchImpl: fakeFetch });
  expect(token).toBe("completion");
  expect(calls).toEqual([{ url: "https://cf/upload?base64=true", auth: "Bearer pass", fields: { [css]: `text/css:${Buffer.from("h1{}").toString("base64")}` } }]);
  // Nothing missing: the pass itself completes the upload.
  expect(await uploadBuckets({ upload: { url: "u", jwt: "pass", buckets: [] }, byHash: built.byHash, fetchImpl: fakeFetch })).toBe("pass");
  await expect(uploadBuckets({ upload: { url: "u", jwt: "pass", buckets: [["f".repeat(32)]] }, byHash: built.byHash, fetchImpl: fakeFetch })).rejects.toThrow(/doesn't have/);
});

test("deploying a build folder keeps polynet.json in the project, where builds don't wipe it", () => {
  const project = "/work/club-site";
  expect(siteConfigPaths(project, project)).toEqual({ read: [`${project}/polynet.json`], save: `${project}/polynet.json` });
  // polynet deploy dist: the project's polynet.json wins, so a stale dist/polynet.json (from an older
  // deploy) never redirects a deploy to another community; it's read only when the project has none.
  expect(siteConfigPaths(`${project}/dist`, project)).toEqual({
    read: [`${project}/polynet.json`, `${project}/dist/polynet.json`], save: `${project}/polynet.json`,
  });
  // A folder outside the current one keeps its own polynet.json and never borrows this one.
  expect(siteConfigPaths("/elsewhere/site", project)).toEqual({ read: ["/elsewhere/site/polynet.json"], save: "/elsewhere/site/polynet.json" });
  expect(siteConfigPaths("/work/club-site-2", project)).toEqual({ read: ["/work/club-site-2/polynet.json"], save: "/work/club-site-2/polynet.json" });
});

test("production is the default; --staging or an explicit API URL choose otherwise", () => {
  expect(apiUrlFor({})).toBe("https://wry-hawk-715.convex.site");
  expect(apiUrlFor({ staging: true })).toBe("https://quick-porcupine-949.convex.site");
  expect(apiUrlFor({ env: { POLYNET_API_URL: "https://example.convex.site/" }, staging: true })).toBe("https://example.convex.site");
  expect(siteAddress("run-club")).toBe("https://run-club.polynet.page");
  expect(siteAddress("run-club", true)).toBe("https://run-club-staging.polynet.page");
  // Each site's private twin (members' own pages), from the one shared mapping.
  expect(privateAddress("run-club")).toBe("https://run-club--me.polynet.page");
  expect(privateAddress("run-club", true)).toBe("https://run-club--me-staging.polynet.page");
  expect(privateAddress("club--me")).toBeNull();
});

test("create --staging remembers staging in polynet.json", () => {
  const parent = mkdtempSync(join(tmpdir(), "polynet-create-"));
  const out = execFileSync("node", [join(process.cwd(), "packages/polynet-cli/bin/polynet.mjs"), "create", "club-site", "--community", "run-club", "--staging"],
    { cwd: parent, encoding: "utf8" });
  expect(out).toContain("https://run-club-staging.polynet.page");
  expect(JSON.parse(readFileSync(join(parent, "club-site", "polynet.json"), "utf8"))).toEqual({ community: "run-club", staging: true });
});

test("sign-in uses PKCE", () => {
  const first = pkce();
  expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(first.challenge).not.toBe(first.verifier);
  expect(pkce().state).not.toBe(first.state);
});

test("the published package is exactly the command, its library and checks, README, and the agent guide, and the design templates (no site template)", () => {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: join(__dirname, "../packages/polynet-cli"), encoding: "utf8" }))[0];
  expect(packed.name).toBe("@polynet/cli");
  expect(packed.files.map((file: { path: string }) => file.path).sort()).toEqual([
    "LICENSE", "README.md", "bin/polynet.mjs", "checks.mjs", "content.mjs",
    "contracts/brand.mjs", "contracts/embed.mjs", "contracts/layout.mjs", "contracts/lesson.mjs", "contracts/sections.mjs", "contracts/theme.mjs", "design.mjs",
    "guide/AGENTS.md", "guide/CLAUDE.md", "guide/agents/polynet-ui-reviewer.md",
    ...["accessibility", "build-site", "deploy-verify", "design", "sdk", "ui-design"].map((name) => `guide/skills/polynet-${name}/SKILL.md`),
    ...["in-the-app", "mistakes", "owner-screens", "reviewer"].map((name) => `guide/skills/polynet-ui-design/references/${name}.md`),
    "lib.mjs", "mcp.mjs", "package.json", "project.mjs", "review.mjs",
    "templates/classroom/layout.json", "templates/classroom/template.json", "templates/classroom/theme.json",
    "templates/stopwatch/template.json", "templates/stopwatch/theme.json", "ui-audit.mjs",
  ]);
});

const FRAME = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Run club</title><link rel="stylesheet" href="/styles.css"></head><body><header><a href="/">Run club</a> <a href="/chat#top">Talk</a>' +
  '<img src="https://cdn.test/logo.png" alt="Run club"></header><main><polynet-page></polynet-page></main></body></html>';
// The site's files: index.html, plus the frame unless a test passes its own.
const problems = (html: string, extra: Array<{ path: string; text: string }> = []) => {
  const frame = extra.some((file) => file.path === "/frame.html") ? [] : [{ path: "/frame.html", text: FRAME }];
  const result = checkSite([{ path: "/index.html", text: html }, ...frame, ...extra]);
  return { errors: result.errors.map((p: any) => p.message).join("\n"), warnings: result.warnings.map((p: any) => p.message).join("\n") };
};
const BLOCKS = "<polynet-channels></polynet-channels><polynet-chat></polynet-chat><polynet-members></polynet-members>";
const GOOD = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
  `<title>Run club</title><script type="module" src="/__polynet/ui.js"></script></head><body><polynet-account></polynet-account>${BLOCKS}</body></html>`;

test("a page's files are read for the checks; others are skipped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polynet-check-"));
  writeFileSync(join(dir, "index.html"), GOOD);
  writeFileSync(join(dir, "frame.html"), FRAME);
  writeFileSync(join(dir, "logo.png"), "png");
  const files = await readCheckedFiles(await collectFiles(dir));
  expect(files.map((file: any) => file.path)).toEqual(["/frame.html", "/index.html"]);
  expect(checkSite(files)).toEqual({ errors: [], warnings: [] });
});

test("site checks block what is certain from the source", () => {
  expect(problems(GOOD)).toEqual({ errors: "", warnings: "" });
  const bad = problems('<html><head><meta name="viewport" content="width=device-width, maximum-scale=1"></head>' +
    '<body><img src="/a.png"><button><svg></svg></button><a href="/x"></a><button aria-label="Close"><svg></svg></button>' +
    '<a href="/"><img src="/logo.svg" alt="Run club"></a></body></html>');
  expect(bad.errors).toContain("no language");
  expect(bad.errors).toContain("no <title>");
  expect(bad.errors).toContain("blocks zooming");
  expect(bad.errors).toContain("image has no alt");
  expect(bad.errors.match(/has no name/g)).toHaveLength(2); // the labelled button and the logo link are fine
  expect(problems(GOOD.replace("initial-scale=1", "user-scalable=no")).errors).toContain("blocks zooming");
  // The shell isn't the site's to prove: the edge adds ui.js, and ui.js adds a missing
  // <polynet-account>. So a bundled page (Vite moved ui.js into its own module) passes.
  const bundled = GOOD.replace('<script type="module" src="/__polynet/ui.js"></script>', '<script type="module" src="/assets/index-abc.js"></script>')
    .replace("<polynet-account></polynet-account>", "");
  expect(problems(bundled, [{ path: "/assets/index-abc.js", text: 'import "/__polynet/ui.js";' }])).toEqual({ errors: "", warnings: "" });
  // A fragment that isn't a page isn't held to page rules.
  expect(checkSite([{ path: "/google123.html", text: "google-site-verification: google123.html" }, { path: "/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }]).errors).toEqual([]);
});

test("the standard pages: one route table for the edge, <polynet-page> and these checks", () => {
  expect(standardPage("/chat")).toMatchObject({ page: { path: "/chat", blocks: ["polynet-channels", "polynet-chat"] }, handle: null, slash: false });
  expect(standardPage("/chat/")).toMatchObject({ page: { path: "/chat" }, slash: true });
  expect(standardPage("/people")).toMatchObject({ page: { path: "/people", blocks: ["polynet-members"] }, handle: null });
  expect(standardPage("/people/Sam_R-2/")).toMatchObject({ page: { path: "/people" }, handle: "Sam_R-2", slash: true });
  // In the shell's menu in this order (Discover apart: it's Polynet-wide); each address under a page is that page.
  expect(STANDARD_PAGES.map((page: any) => page.title)).toEqual(["Chat", "People", "Events", "Learn", "Knowledge", "Ask", "Discover"]);
  expect(STANDARD_PAGES.filter((page: any) => page.network).map((page: any) => page.path)).toEqual(["/discover"]);
  expect(standardPage("/events/k97abc_D-1~1793570400000")).toMatchObject({ page: { path: "/events", blocks: ["polynet-events"] }, below: ["k97abc_D-1~1793570400000"], handle: null });
  expect(standardPage("/learn")).toMatchObject({ page: { path: "/learn", blocks: ["polynet-learn"] }, below: [] });
  expect(standardPage("/learn/start-here~k1/")).toMatchObject({ page: { path: "/learn" }, below: ["start-here~k1"], slash: true });
  expect(standardPage("/learn/start-here~k1/first-steps~k2")).toMatchObject({ page: { path: "/learn" }, below: ["start-here~k1", "first-steps~k2"] });
  expect(standardPage("/knowledge")).toMatchObject({ page: { blocks: ["polynet-knowledge"] } });
  expect(standardPage("/ask")).toMatchObject({ page: { blocks: ["polynet-ask"] } });
  expect(standardPage("/discover/")).toMatchObject({ page: { path: "/discover", blocks: ["polynet-discover"] }, slash: true });
  for (const path of ["/", "/chats", "/Chat", "/chat/x", "/people/a.b", "/people/x/y", `/people/${"a".repeat(33)}`, "/people/%20", "/__polynet/ui.js", "/frame",
    "/events/123", "/events/k1~", "/events/k1~12x", "/events/k.1~1", "/events/k1~1/x", "/learn/intro", "/learn/Intro~k1", "/learn/a~k1/b~k2/c~k3",
    "/learn/a~k1/b.md", "/knowledge/x", "/ask/x", "/Ask", "/discover/trail-club", "/discovery"]) {
    expect(standardPage(path), path).toBeNull();
  }
});

test("every site has a frame: frame.html with exactly one <polynet-page>, linking from the site's root", () => {
  // The blocks need not be placed anywhere: Polynet's /chat and /people carry them.
  expect(problems(GOOD.replace(BLOCKS, ""))).toEqual({ errors: "", warnings: "" });
  const none = checkSite([{ path: "/index.html", text: GOOD }]);
  expect(none.errors).toEqual([{ path: "/", message:
    "The site has no frame.html at its root. Polynet shows its standard pages (/chat, /people, /events, /learn, /knowledge, /ask, /discover) inside it, so they look like the rest of the site: " +
    "frame.html is your header, navigation and footer with one <polynet-page></polynet-page> where the page goes. " +
    "Add it beside index.html (for a framework build, to its output folder, like dist)." }]);
  // Not at the root, it isn't the frame.
  expect(checkSite([{ path: "/index.html", text: GOOD }, { path: "/site/frame.html", text: FRAME }]).errors.map((p: any) => p.message).join("\n")).toContain("no frame.html");
  const frame = (text: string) => problems(GOOD, [{ path: "/frame.html", text }]).errors;
  expect(frame(FRAME.replace("<polynet-page></polynet-page>", ""))).toBe(
    "frame.html has no <polynet-page></polynet-page>. Put exactly one where each page's content goes (usually inside <main>).");
  // Commented out, or only in a script, it isn't placed.
  expect(frame(FRAME.replace("<polynet-page></polynet-page>", '<!-- <polynet-page></polynet-page> --><script>document.body.append(document.createElement("polynet-page"))</script>')))
    .toContain("has no <polynet-page>");
  expect(frame(FRAME.replace("<polynet-page></polynet-page>", "<polynet-page></polynet-page><aside><polynet-page/></aside>"))).toBe(
    "frame.html has 2 <polynet-page> tags. Keep exactly one, where each page's content goes.");
  expect(frame(FRAME.replace("<polynet-page></polynet-page>", "<polynet-page class=x>\n</polynet-page>"))).toBe("");
  // The frame is a page like any other.
  expect(frame(FRAME.replace(' lang="en"', ""))).toContain("no language");
  // It's shown at /chat, /people and /people/<handle>: a relative path breaks under /people/.
  expect(frame(FRAME.replace('href="/styles.css"', 'href="styles.css"').replace('href="/chat#top"', 'href="./people.html"').replace('<img src="https://cdn.test/logo.png"', '<img src="../img/logo.png"'))).toBe(
    "frame.html uses relative paths (styles.css, ./people.html, ../img/logo.png). " +
    "The frame is shown at /chat, /people, /people/<handle>, /events, /events/<event>, /learn, /learn/<course>, /learn/<course>/<lesson>, /knowledge, /ask, /discover, " +
    "where those point somewhere else. Start them from the site's root: /styles.css.");
  expect(frame(FRAME.replace('href="/chat#top"', 'href="#main"').replace("</main>", '</main><a href="mailto:hi@run.club">Mail</a><a href="?x=1">Again</a>'))).toBe("");
});

test("a frame whose header or nav a script draws is warned: members' own pages show it with no scripts", () => {
  const warnings = (text: string) => problems(GOOD, [{ path: "/frame.html", text }]).warnings;
  const drawn = FRAME.replace(/<header>[\s\S]*<\/header>/, '<header id="top"></header><nav> </nav>').replace("</body>", '<script type="module" src="/app.js"></script></body>');
  expect(warnings(drawn)).toContain("frame.html seems to build its header or navigation with a script.");
  expect(warnings(drawn)).toContain("Members' own pages (Your communities, Messages, Settings) show the frame with every script removed");
  // Polynet's own ui.js isn't the site's script; a header written in HTML is fine, scripts or not.
  expect(warnings(drawn.replace('src="/app.js"', 'src="/__polynet/ui.js"'))).toBe("");
  expect(warnings(FRAME.replace("</body>", '<script type="module" src="/app.js"></script></body>'))).toBe("");
  expect(warnings(drawn.replace('<header id="top"></header>', '<header id="top"><a href="/">Run club</a></header>').replace("<nav> </nav>", ""))).toBe("");
});

test("a site's file at a member's own page (Messages, Settings, Your communities, Join) is warned: those live on the private twin", () => {
  const page = (path: string) => ({ path, text: GOOD });
  const warned = (...files: Array<{ path: string; text: string }>) => checkSite([{ path: "/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }, ...files]).warnings
    .filter((p: any) => /a member's own page/.test(p.message));
  expect(warned(page("/messages.html"))).toEqual([{ path: "/messages.html", message:
    "messages.html sits at /messages, a member's own page (Messages). Polynet serves it on this site's private twin, in your frame; delete this file so the address goes there." }]);
  expect(warned(page("/settings/index.html"), page("/communities.html"), page("/join.html")).map((p: any) => p.path))
    .toEqual(["/settings/index.html", "/communities.html", "/join.html"]);
  // Pages near those names are the site's own.
  expect(warned(page("/join-us.html"), page("/messages-board.html"), page("/about.html"))).toEqual([]);
});

test("a site's own version of a standard page must place that page's blocks", () => {
  const page = (path: string, body: string) => ({ path, text: GOOD.replace(BLOCKS, body) });
  const errors = (...files: Array<{ path: string; text: string }>) => checkSite([{ path: "/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }, ...files]).errors;
  expect(errors(page("/chat.html", "<polynet-chat></polynet-chat>"))).toEqual([{ path: "/chat.html", message:
    "chat.html is this site's own Chat page (/chat), so it must place <polynet-channels> and <polynet-chat>. " +
    "Add <polynet-channels></polynet-channels>, or delete the file: Polynet then shows its Chat page inside frame.html." }]);
  expect(errors(page("/chat/index.html", "<h1>Talk</h1>"))[0].message).toContain("Add <polynet-channels></polynet-channels> <polynet-chat></polynet-chat>,");
  expect(errors(page("/people.html", ""))[0].message).toContain("people.html is this site's own People page (/people), so it must place <polynet-members>.");
  expect(errors(page("/people/index.html", ""), page("/people/sam.html", "<polynet-members></polynet-members>"), page("/people/ana/index.html", ""))
    .map((p: any) => p.path)).toEqual(["/people/index.html", "/people/ana/index.html"]);
  // With the blocks, any version is the site's to design; other pages need none.
  expect(errors(
    page("/chat.html", '<polynet-channels></polynet-channels><polynet-chat channel="routes"><p slot="empty">Quiet.</p></polynet-chat>'),
    page("/people/index.html", "<polynet-members>\n</polynet-members>"),
    page("/about.html", "<h1>About</h1>"), page("/people/photos.htm", ""), page("/chats.html", ""),
  )).toEqual([]);
  // A framework build creates them from its bundle: the names in a script count.
  const shell = page("/chat/index.html", '<div id="app"></div>');
  expect(errors(shell, { path: "/assets/index-abc.js", text: 'jsx("polynet-channels",{});document.createElement("polynet-chat")' })).toEqual([]);
  // The same for /events, /learn, /knowledge and /ask.
  expect(errors(page("/events.html", "<h1>What's on</h1>"), page("/learn/index.html", "<polynet-learn></polynet-learn>"), page("/knowledge.html", ""),
    page("/ask/index.html", "<polynet-ask></polynet-ask>")).map((p: any) => p.message)).toEqual([
    "events.html is this site's own Events page (/events), so it must place <polynet-events>. Add <polynet-events></polynet-events>, or delete the file: Polynet then shows its Events page inside frame.html.",
    "knowledge.html is this site's own Knowledge page (/knowledge), so it must place <polynet-knowledge>. Add <polynet-knowledge></polynet-knowledge>, or delete the file: Polynet then shows its Knowledge page inside frame.html.",
  ]);
  // And /discover, which is public.
  expect(errors(page("/discover.html", "<h1>Neighbours</h1>"), page("/discover/index.html", '<polynet-discover limit="4"></polynet-discover>')).map((p: any) => p.message)).toEqual([
    "discover.html is this site's own Discover page (/discover), so it must place <polynet-discover>. Add <polynet-discover></polynet-discover>, or delete the file: Polynet then shows its Discover page inside frame.html.",
  ]);
  // Styling or mentioning a block isn't placing it; neither is a commented-out tag or a longer name.
  const styledOnly = page("/chat.html", "<style>polynet-chat { height: 70vh }</style><!-- <polynet-chat></polynet-chat> --><polynet-chat-room></polynet-chat-room><polynet-channels></polynet-channels>");
  expect(errors(styledOnly, { path: "/app.css", text: "polynet-chat::part(message) { color: red }" }, { path: "/x.js", text: 'el.tagName === "polynet-chat-room"' })
    .map((p: any) => p.message).join("\n")).toContain("Add <polynet-chat></polynet-chat>, or delete the file");
});

test("a block named only in a JavaScript comment isn't placed; one in code beside URLs and regexes is", () => {
  const shell = GOOD.replace(BLOCKS, '<div id="app"></div>');
  // The site's own /chat and /people, built by a framework: which blocks are still missing.
  const missing = (extra: Array<{ path: string; text: string }>, html = shell) =>
    (checkSite([{ path: "/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }, { path: "/chat.html", text: html },
      { path: "/people.html", text: html }, ...extra]).errors.map((p: any) => p.message).join("\n").match(/Add (<polynet-[a-z]+><\/polynet-[a-z]+> ?)+/g) ?? []).sort();
  // Line and block comments, in a bundle, a module and an inline script.
  expect(missing([
    { path: "/assets/app.js", text: '// TODO: document.createElement("polynet-chat")\nmount();' },
    { path: "/lib/people.mjs", text: '/* customElements: "polynet-members"\n   placed later */ export {};' },
  ], shell.replace('<div id="app"></div>', '<script type="module">// <polynet-channels></polynet-channels>\n/* "polynet-chat" */ go();</script>'))).toEqual([
    "Add <polynet-channels></polynet-channels> <polynet-chat></polynet-chat>", "Add <polynet-members></polynet-members>",
  ]);
  // Strings with // in them, regex literals with /* in them, and a comment beside real code.
  const bundle = 'const u="https://polynet.page//x",r=/[/*]/g,s=/https?:\\/\\//;\n' +
    'h(`<polynet-members>`);/* chat */ document.createElement("polynet-chat"); // done\n' +
    "x = a / b / c; jsx('polynet-channels', {});";
  expect(missing([{ path: "/assets/index-abc.js", text: bundle }])).toEqual([]);
  // Non-JavaScript scripts (a template, JSON) aren't treated as code.
  expect(missing([], shell.replace('<div id="app"></div>',
    '<script type="text/template"><a href=//x.test><polynet-chat></polynet-chat></a></script><polynet-channels></polynet-channels><polynet-members></polynet-members>'))).toEqual([]);
});

test("a site without a root index.html can't go live", () => {
  const result = checkSite([{ path: "/home.html", text: GOOD }, { path: "/people/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }]);
  expect(result.errors.map((p: any) => p.message)).toEqual([
    "The site has no index.html at its root: it's the page everyone lands on. " +
    "Add index.html to the folder you check and deploy (for a framework build, its output folder, like dist).",
  ]);
  expect(checkSite([]).errors.map((p: any) => p.message).join("\n")).toContain("no index.html at its root");
});

test("site checks warn about what needs a person's judgment", () => {
  const warned = problems(GOOD.replace("<polynet-account>", '<label>Name <input></label><input id="q"><label for="q">Search</label><input type="email"><polynet-account>'), [
    { path: "/app.css", text: "button:focus { outline: none } .x { animation: spin 1s }" },
    { path: "/app.js", text: 'list.innerHTML = post.text; el.tabIndex; x.setAttribute("tabindex", "2"); fetch("https://a.convex.cloud")' },
  ]);
  expect(warned.errors).toBe("");
  expect(warned.warnings.match(/may have no label/g)).toHaveLength(1); // only the unlabelled email field
  expect(warned.warnings).toContain(":focus-visible");
  expect(warned.warnings).toContain("prefers-reduced-motion");
  expect(warned.warnings).toContain("innerHTML");
  expect(warned.warnings).toContain("Calls Polynet's servers directly");
});

test("site checks warn when hidden sections can show and when the agent's public answers can't", () => {
  const page = (body: string) => ({ path: "/index.html", text: `<!doctype html><html lang="en"><head><title>x</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>` });
  const toggled = [page('<main id="members" hidden></main>'), { path: "/app.js", text: 'members.hidden = false; await polynet.post(s, t, { askAgent: true });' },
    { path: "/styles.css", text: ".members { display: grid; }" }];
  const warnings = checkSite(toggled).warnings.map((w: { message: string }) => w.message).join("\n");
  expect(warnings).toContain("[hidden] { display: none !important; }");
  expect(warnings).toContain("Show replies with polynet.thread()");
  const fixed = [toggled[0], { path: "/app.js", text: 'members.hidden = false; await polynet.post(s, t, { askAgent: true }); await polynet.thread(s, p.ref);' },
    { path: "/styles.css", text: "[hidden] { display: none !important; } .members { display: grid; }" }];
  expect(checkSite(fixed).warnings).toEqual([]);
  // <polynet-chat> shows threads, so asking the agent from a custom composer beside it is fine.
  const withChat = [page("<polynet-chat></polynet-chat>"), { path: "/app.js", text: "await polynet.post(s, t, { askAgent: true });" }];
  expect(checkSite(withChat).warnings.map((w: { message: string }) => w.message).join("\n")).not.toContain("polynet.thread()");
});

test("skills install into both agent folders without overwriting the founder's guides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polynet-guide-"));
  writeFileSync(join(dir, "AGENTS.md"), "# mine");
  const written = await installGuide(dir);
  expect(written).toEqual(["CLAUDE.md", ".agents/skills/ (6 skills)", ".claude/skills/ (6 skills)", ".claude/agents/ (1 agent)"]);
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# mine");
  for (const skills of [".agents/skills", ".claude/skills"]) {
    expect(readdirSync(join(dir, skills)).sort()).toEqual(["polynet-accessibility", "polynet-build-site", "polynet-deploy-verify", "polynet-design", "polynet-sdk", "polynet-ui-design"]);
    for (const skill of readdirSync(join(dir, skills))) {
      const text = readFileSync(join(dir, skills, skill, "SKILL.md"), "utf8");
      expect(text).toMatch(new RegExp(`^---\nname: ${skill}\ndescription: .{40,}\n---\n`));
    }
  }
  // Running it again replaces older skills; a stale file inside a skill goes away.
  writeFileSync(join(dir, ".claude/skills/polynet-sdk/old.md"), "stale");
  await installGuide(dir);
  expect(existsSync(join(dir, ".claude/skills/polynet-sdk/old.md"))).toBe(false);
  expect(existsSync(join(dir, ".claude/skills/polynet-ui-design/references/in-the-app.md"))).toBe(true);
});

test("a community design folder gets the skills but not the site guides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polynet-design-skills-"));
  expect(await installSkills(dir)).toEqual([".agents/skills/ (6 skills)", ".claude/skills/ (6 skills)", ".claude/agents/ (1 agent)"]);
  expect(readFileSync(join(dir, ".claude/agents/polynet-ui-reviewer.md"), "utf8")).toMatch(/^---\nname: polynet-ui-reviewer\n/);
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  expect(existsSync(join(dir, ".agents/skills/polynet-ui-design/SKILL.md"))).toBe(true);
});

test("the MCP's design guide matches the polynet-ui-design skill", async () => {
  expect(readFileSync(join(__dirname, "..", DESIGN_GUIDE_TARGET), "utf8"), "run node packages/polynet-cli/tools/build-design-guide.mjs")
    .toBe(await buildDesignGuide());
});

test("the CLI's copies of Polynet's lesson, embed, theme and layout contracts match shared/", async () => {
  for (const [file, source] of Object.entries(CONTRACTS as Record<string, string>)) {
    expect(readFileSync(join(__dirname, "../packages/polynet-cli/contracts", file), "utf8"), `${file}: run node packages/polynet-cli/tools/build-contracts.mjs`)
      .toBe(await buildContract(source));
  }
});

function project() {
  const root = mkdtempSync(join(tmpdir(), "polynet-project-"));
  const put = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put("polynet.json", '{"community":"run-club"}');
  put("index.html", GOOD);
  put("frame.html", FRAME);
  put("embeds/pace.html", '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pace</title><script src="/__polynet/embed.js"></script></head><body></body></html>');
  put("media/route.png", "png");
  put("theme.json", JSON.stringify({ version: 1, font_heading: "Barlow Condensed", radius: 3 }));
  put("courses/01-start/course.json", '{"title":"Start here","description":"Your first week.","status":"live"}');
  put("courses/01-start/01-welcome.md", "---\ntitle: Welcome\nstage: Week 1\norder: 1\nminutes: 4\n---\nHello ![Route](../media/route.png)\n\n```polynet-embed\nsrc: embeds/pace.html\nheight: 700\n```\n");
  put("courses/01-start/02-plan.md", "---\ntitle: Plan\n---\nPlan it.");
  return root;
}

test("a project folder: courses and the theme are never served with the site", async () => {
  const p = await readProject(project());
  expect(p).toMatchObject({ community: "run-club", siteOrigin: "https://run-club.polynet.page" });
  expect((await siteFiles(p)).map((file: any) => file.path)).toEqual(["/embeds/pace.html", "/frame.html", "/index.html", "/media/route.png"]);
});

test("courses are read with Polynet's own lesson parser, and lesson images point at the site", async () => {
  const p = await readProject(project());
  const read = await readCourses(p.courses);
  expect(read.problems).toEqual([]);
  const [course] = resolveCourses(read.courses, p.siteOrigin);
  expect(course).toMatchObject({ key: "01-start", name: "Start here", status: "live" });
  expect(course.lessons[0]).toMatchObject({ title: "Welcome", lesson: { stage: "Week 1", order: 1, minutes: 4 } });
  expect(course.lessons[0].body_md).toContain("![Route](https://run-club.polynet.page/media/route.png)");
  expect(course.lessons[0].body_md).toContain("src: embeds/pace.html");
  expect(resolveLessonBody('![a](https://x.test/a.png) <img src="./media/b.png">', "https://s")).toBe('![a](https://x.test/a.png) <img src="https://s/media/b.png">');
  const files = new Set((await siteFiles(p)).map((file: any) => file.path));
  expect(checkCourses([course], files)).toEqual([]);
});

test("course checks catch what Polynet would refuse or silently cut", async () => {
  const lesson = (title: string, source_md: string) => ({ path: `c/${title}.md`, title, lesson: null, source_md, body_md: source_md });
  const course = { key: "c", folder: "c", name: "Course", description: "", status: "draft", lessons: [
    lesson("Long", "x".repeat(20_001)),
    lesson("Widget", "```polynet-embed\nsrc: embeds/missing.html\nfallback: media/missing.png\n```"),
    lesson("Bad widget", "```polynet-embed\nsrc: https://evil.test/x.html\n```"),
    lesson("Image", "![a](media/nope.png)"),
    lesson("long", "dup"),
  ] };
  const found = checkCourses([course, { ...course, folder: "d", lessons: [] }], new Set(["/index.html"]));
  const text = found.map((p: any) => `${p.level} ${p.path} ${p.message}`).join("\n");
  expect(text).toContain("error c/Long.md The text before the first ## heading is 20,001 characters; a section can hold up to 20,000. Add a ## heading inside it");
  expect(text).toContain("The widget embeds/missing.html isn't in the site folder");
  expect(text).toContain("warning c/Widget.md:1 The fallback image media/missing.png");
  expect(text).toContain("src must be an .html file on your community site");
  expect(text).toContain("The image media/nope.png isn't in the site folder");
  expect(text).toContain('Two lessons in this course are called "long"');
  expect(text).toContain('Two courses are called "Course"');
  expect(checkTheme({ version: 1, font_heading: "Comic Sans" })[0].path).toBe("theme.json → font_heading");
});

test("bad front matter is reported per file instead of stopping the read", async () => {
  const root = project();
  writeFileSync(join(root, "courses/01-start/03-bad.md"), "---\ntitle: Bad\nvideo: http://insecure.test/v\n---\nx");
  const read = await readCourses(join(root, "courses"));
  expect(read.problems).toEqual([{ level: "error", path: "01-start/03-bad.md", message: "The \"video_url\" front matter value isn't valid." }]);
  expect(read.courses[0].lessons).toHaveLength(2);
});

test("lesson widgets are checked as widgets: embed.js, not the site shell", () => {
  const widget = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>W</title></head><body></body></html>';
  const result = checkSite([{ path: "/index.html", text: GOOD }, { path: "/frame.html", text: FRAME }, { path: "/embeds/w.html", text: widget }, { path: "/quiz.html", text: widget }], { embeds: new Set(["/quiz.html"]) });
  expect(result.errors).toEqual([]);
  expect(result.warnings.map((p: any) => p.path)).toEqual(["/embeds/w.html", "/quiz.html"]);
  expect(result.warnings[0].message).toContain("/__polynet/embed.js");
});

test("changesets hold at most 25 changes, and a new course's lessons stay with it", () => {
  const page = (i: number) => ({ op: "create_page", module_key: "big", title: `L${i}`, body_md: "x" });
  const edit = (i: number) => ({ op: "edit_page", resource_id: `r${i}`, expected_updated_at: 1, body_md: "y" });
  const packed = packChangesets("run-club", [
    { course: "Edits", created: false, operations: Array.from({ length: 10 }, (_, i) => edit(i)) },
    { course: "Big", created: true, operations: [{ op: "create_module", module_key: "big", name: "Big" }, ...Array.from({ length: 30 }, (_, i) => page(i))] },
  ]);
  expect(packed.map((c: any) => c.operations.length)).toEqual([10, 25]);
  expect(packed[1].operations[0].op).toBe("create_module");
  expect(packed[1].summary).toBe("polynet push: Big");
  expect(packed[0].idempotency_key).toMatch(/^polynet-cli:[a-f0-9]{48}$/);
  // The same changes always get the same key, so pushing twice before Apply stages once.
  expect(packChangesets("run-club", [{ course: "Edits", created: false, operations: Array.from({ length: 10 }, (_, i) => edit(i)) }])[0].idempotency_key)
    .toBe(packed[0].idempotency_key);
});

test("polynet check runs headless: --json and a failing exit code for CI", () => {
  const root = project();
  const cli = join(__dirname, "../packages/polynet-cli/bin/polynet.mjs");
  const ok = JSON.parse(execFileSync(process.execPath, [cli, "check", root, "--json"], { encoding: "utf8" }));
  expect(ok).toMatchObject({ ok: true, courses: 1, lessons: 2, site_files: 4 });
  writeFileSync(join(root, "courses/01-start/02-plan.md"), "---\ntitle: Plan\n---\n![x](media/gone.png)");
  let failed: any = null;
  try {
    execFileSync(process.execPath, [cli, "check", root, "--json"], { encoding: "utf8" });
  } catch (error) {
    failed = error;
  }
  expect(failed?.status).toBe(1);
  expect(JSON.parse(failed.stdout).problems[0].message).toContain("media/gone.png");
});

test("a long lesson in sections passes check and packs into changesets that fit the server's budget", () => {
  const section = (n: number) => `## Part ${n}\n\n${"x".repeat(19_000)}\n`;
  const long = Array.from({ length: 6 }, (_, i) => section(i + 1)).join("\n");
  expect(long.length).toBeGreaterThan(100_000);
  expect(checkCommunityResourceBody(long)).toEqual([]);
  const page = (title: string) => ({ op: "create_page", title, body_md: long });
  const changesets = packChangesets("c", [{ course: "Big", created: false, operations: [page("a"), page("b"), page("c")] }]);
  expect(changesets.map((changeset: any) => changeset.operations.length)).toEqual([2, 1]);
  for (const changeset of changesets as any[]) {
    expect(changeset.operations.reduce((n: number, op: any) => n + op.body_md.length, 0)).toBeLessThanOrEqual(250_000);
  }
});
