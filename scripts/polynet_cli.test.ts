import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
// @ts-expect-error plain ES module without types
import { apiUrlFor, buildManifest, collectFiles, hashFile, installGuide, mimeType, pkce, readCheckedFiles, siteAddress, siteConfigPaths, uploadBuckets } from "../packages/polynet-cli/lib.mjs";
import { checkSite } from "../packages/polynet-cli/checks.mjs";

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

test("the published package is exactly the command, its library and checks, README, and the agent guide (no site template)", () => {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: join(__dirname, "../packages/polynet-cli"), encoding: "utf8" }))[0];
  expect(packed.name).toBe("@polynet/cli");
  expect(packed.files.map((file: { path: string }) => file.path).sort()).toEqual([
    "LICENSE", "README.md", "bin/polynet.mjs", "checks.mjs",
    "guide/AGENTS.md", "guide/CLAUDE.md",
    ...["accessibility", "build-site", "deploy-verify", "design", "sdk"].map((name) => `guide/skills/polynet-${name}/SKILL.md`),
    "lib.mjs", "package.json",
  ]);
});

const problems = (html: string, extra: Array<{ path: string; text: string }> = []) => {
  const result = checkSite([{ path: "/index.html", text: html }, ...extra]);
  return { errors: result.errors.map((p: any) => p.message).join("\n"), warnings: result.warnings.map((p: any) => p.message).join("\n") };
};
const BLOCKS = "<polynet-channels></polynet-channels><polynet-chat></polynet-chat><polynet-members></polynet-members>";
const GOOD = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
  `<title>Run club</title><script type="module" src="/__polynet/ui.js"></script></head><body><polynet-account></polynet-account>${BLOCKS}</body></html>`;

test("a page's files are read for the checks; others are skipped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polynet-check-"));
  writeFileSync(join(dir, "index.html"), GOOD);
  writeFileSync(join(dir, "logo.png"), "png");
  const files = await readCheckedFiles(await collectFiles(dir));
  expect(files.map((file: any) => file.path)).toEqual(["/index.html"]);
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
  expect(checkSite([{ path: "/google123.html", text: "google-site-verification: google123.html" }, { path: "/index.html", text: GOOD }]).errors).toEqual([]);
});

test("every site places Polynet's channels, chat and members blocks", () => {
  // Each missing block is its own error, naming the tag to add.
  const bare = problems(GOOD.replace(BLOCKS, ""));
  for (const name of ["polynet-channels", "polynet-chat", "polynet-members"]) {
    expect(bare.errors).toContain(`No page has <${name}>, and every site needs it`);
    expect(bare.errors).toContain(`Add <${name}></${name}>`);
  }
  expect(bare.errors.match(/No page has/g)).toHaveLength(3);
  expect(problems(GOOD.replace("<polynet-members></polynet-members>", "")).errors).toBe(
    "No page has <polynet-members>, and every site needs it: everyone in the community, online first, each opening their profile. " +
    "Add <polynet-members></polynet-members> in a people page or section. The polynet-build-site skill shows how.");
  // Any page counts: the room on one page, the people on another.
  const room = GOOD.replace(BLOCKS, '<polynet-channels></polynet-channels><polynet-chat channel="routes"><p slot="empty">Quiet.</p></polynet-chat>');
  expect(problems(room, [{ path: "/people/index.html", text: GOOD.replace(BLOCKS, "<polynet-members>\n</polynet-members>") }]).errors).toBe("");
  // A framework build creates them from its bundle: the names in a script count.
  const shell = GOOD.replace(BLOCKS, '<div id="app"></div>');
  const bundle = 'const r=document.createElement("polynet-chat");x.innerHTML;jsx("polynet-channels",{});html`<polynet-members slot=a>`';
  expect(problems(shell, [{ path: "/assets/index-abc.js", text: bundle }]).errors).toBe("");
  expect(problems(shell.replace('<div id="app"></div>', '<script type="module">document.body.append(document.createElement("polynet-chat"))</script>' +
    "<polynet-channels></polynet-channels><polynet-members></polynet-members>")).errors).toBe("");
  // Styling or mentioning a block isn't placing it; neither is a commented-out tag or a longer name.
  const styledOnly = shell.replace("</head>", "<style>polynet-chat { height: 70vh }</style></head>")
    .replace('<div id="app"></div>', "<!-- <polynet-chat></polynet-chat> --><polynet-chat-room></polynet-chat-room><polynet-channels></polynet-channels><polynet-members></polynet-members>");
  expect(problems(styledOnly, [{ path: "/app.css", text: "polynet-chat::part(message) { color: red }" }, { path: "/x.js", text: 'el.tagName === "polynet-chat-room"' }]).errors)
    .toContain("No page has <polynet-chat>");
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
  expect(written).toEqual(["CLAUDE.md", ".agents/skills/ (5 skills)", ".claude/skills/ (5 skills)"]);
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# mine");
  for (const skills of [".agents/skills", ".claude/skills"]) {
    expect(readdirSync(join(dir, skills)).sort()).toEqual(["polynet-accessibility", "polynet-build-site", "polynet-deploy-verify", "polynet-design", "polynet-sdk"]);
    for (const skill of readdirSync(join(dir, skills))) {
      const text = readFileSync(join(dir, skills, skill, "SKILL.md"), "utf8");
      expect(text).toMatch(new RegExp(`^---\nname: ${skill}\ndescription: .{40,}\n---\n`));
    }
  }
  // Running it again replaces older skills; a stale file inside a skill goes away.
  writeFileSync(join(dir, ".claude/skills/polynet-sdk/old.md"), "stale");
  await installGuide(dir);
  expect(existsSync(join(dir, ".claude/skills/polynet-sdk/old.md"))).toBe(false);
});
