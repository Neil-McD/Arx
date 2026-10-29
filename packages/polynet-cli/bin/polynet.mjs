#!/usr/bin/env node
// polynet create [dir] --community <slug>     a site folder set up for your AI agent (add --staging for Polynet's staging)
// polynet check [dir]                          the checks a site passes before going live
// polynet deploy [dir] [--community <slug>]   check, then put a site live at <slug>.polynet.page
// polynet push [dir] [--dry-run] [--wait]     stage courses and lessons for the owner to apply
// polynet init [dir] --template <name>        start a community design from a template
// polynet pull [dir]                           copy the community's draft theme into theme.json
// polynet dev [dir]                            save theme.json to the draft on every edit; open the preview
// polynet publish [dir]                        make the draft theme live for members
// polynet review [dir]                         screenshot the draft at phone and desktop width and audit the UI
// polynet skills [dir]                         add or update Polynet's skills for AI agents
// polynet login | logout                       sign in with Polynet (browser), or forget it
//
// --json prints one JSON result for CI and agents. POLYNET_TOKEN, when set, is
// used as the access token instead of a browser sign-in.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  CALLBACK_PORT, REDIRECT_URI, apiUrlFor, buildManifest, collectFiles, formatBytes, installGuide, installSkills, isDirectory, pkce,
  privateAddress, readCheckedFiles, siteAddress, siteConfigPaths, uploadBuckets,
} from "../lib.mjs";
import { checkSite, formatProblems } from "../checks.mjs";
import { checkBrand, checkCourses, checkLayout, checkTheme, checkThemeAgainstBrand, describeOperation, lessonEmbeds, planContentPush, readCourses, resolveCourses, stageChangeset } from "../content.mjs";
import { designFiles, draftPreviewUrl, initFromTemplate, listTemplates, publishFolderDraft, pullDesign, saveFolderDraft, watchDesign } from "../design.mjs";
import { createMcpClient, PolynetToolError } from "../mcp.mjs";
import { readProject, siteFiles } from "../project.mjs";
import { formatReview, latestReview, reviewCommunity } from "../review.mjs";

const STAGING_FLAG = process.argv.includes("--staging");
// Set again by deploy once it has read the folder's polynet.json.
let API_URL = apiUrlFor({ env: process.env, staging: STAGING_FLAG });
const AUTH_FILE = join(homedir(), ".polynet", "auth.json");
const APP_URL = (process.env.POLYNET_APP_URL || "https://www.polynet.ai").replace(/\/+$/, "");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function saveAuth(entry) {
  const all = (await readJson(AUTH_FILE)) ?? {};
  if (entry) all[API_URL] = entry;
  else delete all[API_URL];
  await mkdir(join(homedir(), ".polynet"), { recursive: true, mode: 0o700 });
  await writeFile(AUTH_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`${url} answered ${res.status}`);
  return body;
}

// Polynet's sign-in is the same OAuth the Polynet MCP uses: discover it, register
// this tool once, then sign in through the browser with PKCE.
async function discover() {
  const resource = await getJson(`${API_URL}/.well-known/oauth-protected-resource`);
  const issuer = resource.authorization_servers?.[0];
  if (!issuer) throw new Error("Polynet didn't name a sign-in server.");
  const server = await getJson(`${issuer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`);
  return { resource: resource.resource, server };
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The URL is printed too.
  }
}

function waitForCallback(state) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") return void res.writeHead(404).end();
      const done = (ok, text) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" })
          .end(`<!doctype html><title>Polynet</title><p style="font-family:system-ui">${text}</p>`);
        server.close();
      };
      if (url.searchParams.get("state") !== state) return done(false, "Sign-in didn't match. Run the command again.");
      const code = url.searchParams.get("code");
      if (!code) {
        done(false, "Sign-in was cancelled.");
        return reject(new Error(url.searchParams.get("error_description") || "Sign-in was cancelled."));
      }
      done(true, "Signed in to Polynet. You can close this tab.");
      resolvePromise(code);
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1");
    setTimeout(() => { server.close(); reject(new Error("Sign-in timed out.")); }, 5 * 60_000).unref();
  });
}

async function tokenRequest(server, params) {
  const res = await fetch(server.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `Sign-in failed (${res.status}).`);
  return body;
}

function stored(tokens, clientId, previous) {
  return {
    client_id: clientId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? previous?.refresh_token ?? null,
    expires_at: Date.now() + (Number(tokens.expires_in) || 300) * 1000,
  };
}

async function login() {
  const { resource, server } = await discover();
  let clientId = (await readJson(AUTH_FILE))?.[API_URL]?.client_id;
  if (!clientId) {
    if (!server.registration_endpoint) throw new Error("Polynet's sign-in server doesn't allow new tools.");
    const registered = await getJson(server.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Polynet CLI", redirect_uris: [REDIRECT_URI], grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"], token_endpoint_auth_method: "none",
      }),
    });
    clientId = registered.client_id;
  }
  const { verifier, challenge, state } = pkce();
  const authorize = new URL(server.authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT_URI, code_challenge: challenge,
    code_challenge_method: "S256", state, scope: "openid profile email offline_access", resource,
  })) authorize.searchParams.set(key, value);
  const callback = waitForCallback(state);
  console.log(`Sign in with Polynet in your browser:\n  ${authorize}\n`);
  openBrowser(authorize.toString());
  const code = await callback;
  const tokens = await tokenRequest(server, {
    grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier, resource,
  });
  const entry = stored(tokens, clientId, null);
  await saveAuth(entry);
  console.log("✓ Signed in.");
  return entry;
}

async function accessToken() {
  if (process.env.POLYNET_TOKEN) return process.env.POLYNET_TOKEN;
  const entry = (await readJson(AUTH_FILE))?.[API_URL];
  if (entry?.access_token && entry.expires_at > Date.now() + 30_000) return entry.access_token;
  if (entry?.refresh_token) {
    try {
      const { resource, server } = await discover();
      const tokens = await tokenRequest(server, {
        grant_type: "refresh_token", refresh_token: entry.refresh_token, client_id: entry.client_id, resource,
      });
      const next = stored(tokens, entry.client_id, entry);
      await saveAuth(next);
      return next.access_token;
    } catch {
      // Fall through to a fresh sign-in.
    }
  }
  return (await login()).access_token;
}

async function callPolynet(path, token, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await saveAuth(null);
    fail("Your sign-in expired. Run the command again to sign in.");
  }
  if (!res.ok || !payload.ok) fail(payload.message || `Polynet answered ${res.status}.`);
  return payload;
}

// polynet create [folder] --community <slug>: a folder ready for an AI agent to design and
// build the site in: polynet.json, AGENTS.md, CLAUDE.md and Polynet's skills. No template:
// every community's site starts from its own concept.
async function create(args) {
  const flag = args.indexOf("--community");
  const community = (flag >= 0 ? args[flag + 1] : "")?.trim().toLowerCase();
  if (!community) fail("Which community is this site for? Run: polynet create [folder] --community <slug>");
  const folderArg = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--community");
  const dir = resolve(folderArg ?? community + "-site");
  const existing = await readdir(dir).catch(() => null);
  if (existing && existing.length) fail(dir + " isn't empty. Choose a new folder.");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "polynet.json"), JSON.stringify(STAGING_FLAG ? { community, staging: true } : { community }, null, 2) + "\n");
  await installGuide(dir);
  console.log([
    "✓ Set up " + dir + " for " + community + "'s site",
    "",
    "Next: open the folder with your AI agent (Claude Code, Codex, Cursor…) and say:",
    "  \"Design our community's site.\"",
    "It reads AGENTS.md and Polynet's skills: it will ask about your community, show you",
    "three different directions live, then build the one you pick at",
    siteAddress(community, STAGING_FLAG),
  ].join("\n"));
}

function siteDir(args) {
  const dirArg = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--community");
  return resolve(dirArg ?? ".");
}

// Prints the problems; returns false when an error must be fixed first.
async function runChecks(files) {
  const result = checkSite(await readCheckedFiles(files));
  for (const line of formatProblems(result)) console.log(line);
  if (result.errors.length) {
    console.log(`\n${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} to fix before the site can go live.` +
      " The polynet-build-site and polynet-accessibility skills explain them.");
    return false;
  }
  return true;
}

// Everything the project folder holds, checked the way Polynet will: the site,
// the courses (with the server's own lesson and embed validators) and the theme.
async function checkProject(project) {
  const problems = [];
  const files = await siteFiles(project);
  let courses = [];
  if (project.courses) {
    const read = await readCourses(project.courses);
    problems.push(...read.problems);
    courses = resolveCourses(read.courses, project.siteOrigin || "https://example.polynet.page");
    problems.push(...checkCourses(courses, files.length ? new Set(files.map((file) => file.path)) : null));
  }
  if (files.some((file) => file.path === "/index.html")) {
    const result = checkSite(await readCheckedFiles(files), { embeds: lessonEmbeds(courses) });
    for (const [level, list] of [["error", result.errors], ["warning", result.warnings]]) {
      for (const item of list) problems.push({ level, path: item.path, message: item.message });
    }
  }
  const records = {};
  for (const [kind, file] of [["brand", project.brand], ["theme", project.theme], ["layout", project.layout]]) {
    if (!file) continue;
    const where = file.slice(project.root.length + 1) || `${kind}.json`;
    try {
      records[kind] = JSON.parse(await readFile(file, "utf8"));
      problems.push(...DESIGN_CHECKS[kind](records[kind], where));
    } catch (error) {
      problems.push({ level: "error", path: where, message: `Not valid JSON (${error.message}).` });
    }
  }
  if (records.theme && records.brand) problems.push(...checkThemeAgainstBrand(records.theme, records.brand));
  const theme = records.theme ?? null;
  return { problems: problems.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1)), files, courses, theme };
}

function printProblems(problems) {
  for (const problem of problems) console.log(`${problem.level === "error" ? "✗" : "!"} ${problem.path}: ${problem.message}`);
}

const JSON_OUTPUT = process.argv.includes("--json");
const say = (...lines) => { if (!JSON_OUTPUT) console.log(lines.join("\n")); };

async function check(args) {
  const project = await readProject(siteDir(args));
  if (!(await isDirectory(project.root))) fail(`${project.root} isn't a folder.`);
  const { problems, files, courses } = await checkProject(project);
  const errors = problems.filter((problem) => problem.level === "error").length;
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ok: errors === 0, problems, site_files: files.length, courses: courses.length,
      lessons: courses.reduce((n, course) => n + course.lessons.length, 0) }, null, 2));
  } else {
    printProblems(problems);
    const lessons = courses.reduce((n, course) => n + course.lessons.length, 0);
    console.log(errors
      ? `\n${errors} problem${errors === 1 ? "" : "s"} to fix first.`
      : `✓ Checked ${files.length} site files${courses.length ? `, ${courses.length} courses and ${lessons} lessons` : ""}${[project.brand && "the brand", project.theme && "the theme", project.layout && "the layout"].filter(Boolean).map((part) => ` and ${part}`).join("")}.`);
  }
  if (errors) process.exit(1);
}

async function skills(args) {
  const dir = siteDir(args);
  if (!(await isDirectory(dir))) fail(`${dir} isn't a folder.`);
  for (const line of await installGuide(dir)) console.log(`✓ ${line}`);
}

async function deploy(args) {
  const dir = siteDir(args);
  if (!(await isDirectory(dir))) fail(`${dir} isn't a folder.`);
  const paths = siteConfigPaths(dir);
  let config = {};
  for (const path of paths.read) {
    const found = await readJson(path);
    if (found) { config = found; break; }
  }
  const flag = args.indexOf("--community");
  const community = (flag >= 0 ? args[flag + 1] : config.community)?.trim().toLowerCase();
  if (!community) fail("Which community is this site for? Run: polynet deploy --community <slug>");
  const staging = STAGING_FLAG || config.staging === true;
  API_URL = apiUrlFor({ env: process.env, staging });

  const files = await siteFiles(await readProject(dir, { community }));
  if (!files.some((file) => file.path === "/index.html")) fail(`${dir} has no index.html yet. Ask your AI agent to design the site first.`);
  if (!(await runChecks(files))) process.exit(1);
  const site = await buildManifest(files);
  console.log(`Deploying ${site.files} files (${formatBytes(site.bytes)}) to ${community}…`);

  const token = await accessToken();
  const started = await callPolynet("/runtime/sites/deploy/start", token, { community, manifest: site.manifest });
  const missing = started.upload.buckets.reduce((count, bucket) => count + bucket.length, 0);
  if (missing) console.log(`Uploading ${missing} changed file${missing === 1 ? "" : "s"}…`);
  const completion = await uploadBuckets({ upload: started.upload, byHash: site.byHash });
  const published = await callPolynet("/runtime/sites/deploy/publish", token, {
    community, completion_jwt: completion, files: site.files, bytes: site.bytes,
  });
  const saved = (await readJson(paths.save)) ?? {};
  if (saved.community !== community || (staging && saved.staging !== true)) {
    await writeFile(paths.save, JSON.stringify({ ...config, ...saved, community, ...(staging ? { staging: true } : {}) }, null, 2) + "\n");
  }
  console.log(`✓ Live: ${published.url}`);
  // Its private twin: members' own pages, in this site's frame with none of its scripts.
  const mine = published.url === siteAddress(community, staging) ? privateAddress(community, staging) : null;
  if (mine) console.log(`  Members' own pages (their communities, messages, settings): ${mine}`);
}

// polynet push [folder] [--dry-run] [--wait]: courses and lessons become Polynet
// resources through the builder's reviewed changesets, staged with the Polynet
// MCP. The owner applies each one in Polynet; new pages arrive as drafts. A
// community has one changeset waiting at a time, so a big push takes several
// rounds: --wait stays until each is applied (or rejected) and stages the next.
async function push(args) {
  const flag = args.indexOf("--community");
  const project = await readProject(siteDir(args), { community: flag >= 0 ? args[flag + 1] : undefined });
  if (!project.community) fail("Which community? Add \"community\" to polynet.json or pass --community <slug>.");
  if (!project.courses) fail(`No courses folder in ${project.root}. Put courses in courses/ (or set "courses" in polynet.json).`);
  const { problems, courses } = await checkProject(project);
  const errors = problems.filter((problem) => problem.level === "error");
  if (errors.length) {
    if (JSON_OUTPUT) console.log(JSON.stringify({ ok: false, problems }, null, 2));
    else printProblems(errors);
    fail(`${errors.length} problem${errors.length === 1 ? "" : "s"} to fix before pushing. Run polynet check for details.`);
  }
  const dryRun = args.includes("--dry-run");
  const wait = args.includes("--wait");
  const mcp = createMcpClient({ url: `${API_URL}/runtime/mcp`, token: await accessToken() });
  const staged = [];
  for (let round = 0; round < 100; round += 1) {
    const plan = await planContentPush({ community: project.community, courses, call: mcp.call });
    if (round === 0) {
      for (const item of plan.unverified) say(`! ${item}: too long for Polynet to send back, so only its length was compared.`);
      for (const page of plan.untracked) say(`! ${page.course} has "${page.title}", which isn't in the folder. Push never deletes; remove it in Polynet if it should go.`);
    }
    if (!plan.changesets.length) {
      if (JSON_OUTPUT) console.log(JSON.stringify({ ok: true, status: "up_to_date", staged, untracked: plan.untracked }, null, 2));
      else say(staged.length ? "✓ Everything is applied." : "✓ Polynet already has these courses and lessons.");
      return;
    }
    const next = plan.changesets[0];
    const total = plan.changesets.reduce((n, changeset) => n + changeset.operations.length, 0);
    if (dryRun) {
      if (JSON_OUTPUT) console.log(JSON.stringify({ ok: true, status: "dry_run", changesets: plan.changesets, untracked: plan.untracked }, null, 2));
      else {
        for (const changeset of plan.changesets) {
          say(`\n${changeset.summary} (${changeset.operations.length} change${changeset.operations.length === 1 ? "" : "s"})`);
          for (const operation of changeset.operations) say(`  ${describeOperation(operation)}`);
        }
        say(`\n${total} change${total === 1 ? "" : "s"} in ${plan.changesets.length} round${plan.changesets.length === 1 ? "" : "s"}. Nothing was sent (--dry-run).`);
      }
      return;
    }
    let result;
    try {
      result = await stageChangeset({ community: project.community, changeset: next, call: mcp.call });
    } catch (error) {
      if (!(error instanceof PolynetToolError) || !/already_pending/.test(error.message)) throw error;
      result = { result: { status: "other_pending" } };
    }
    const status = result?.result?.status ?? "staged";
    if (status === "rejected" || status === "expired" || status === "failed") {
      fail(`The changeset "${next.summary}" was ${status} in Polynet. Change the files (or wait a day) and push again.`);
    }
    if (status !== "other_pending" && !staged.includes(result?.ref)) {
      staged.push(result?.ref);
      say(`✓ Staged ${next.operations.length} change${next.operations.length === 1 ? "" : "s"}: ${next.summary}`,
        "  Apply it in Polynet: open the community's Agent page and press Apply on the card.");
      if (plan.changesets.length > 1 || total > next.operations.length) say(`  ${total - next.operations.length} more change${total - next.operations.length === 1 ? "" : "s"} follow once it's applied.`);
    } else if (status === "other_pending" && round === 0) {
      say("! Another changeset is waiting in Polynet. Apply or reject it first.");
    }
    if (!wait) {
      if (JSON_OUTPUT) console.log(JSON.stringify({ ok: true, status, staged, remaining: total - next.operations.length }, null, 2));
      else if (total > next.operations.length || status === "other_pending") say("  Run polynet push again after applying, or use --wait.");
      return;
    }
    await new Promise((done) => setTimeout(done, 10_000));
  }
  fail("Stopped waiting. Run polynet push again to continue.");
}

// ---------------------------------------------------------------- design
// A community's look, edited like a website: init or pull, dev, publish.

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function designDir(args) {
  const valued = ["--community", "--template", "--url", "--login-url", "--storage-state", "--screens", "--out"];
  const dirArg = args.find((arg, index) => !arg.startsWith("--") && !valued.includes(args[index - 1]));
  return resolve(dirArg ?? ".");
}

async function designProject(args) {
  const project = await readProject(designDir(args), { community: flagValue(args, "--community") });
  if (!project.community) fail("Which community? Add \"community\" to polynet.json or pass --community <slug>.");
  return { project, files: designFiles(project.root, project.config) };
}

async function init(args) {
  const template = flagValue(args, "--template");
  if (!template) {
    const templates = await listTemplates();
    if (JSON_OUTPUT) return console.log(JSON.stringify({ ok: true, templates }, null, 2));
    say("Templates:", ...templates.map((entry) => `  ${entry.name.padEnd(14)} ${entry.description ?? ""}`), "", "Start one: polynet init [folder] --template <name>");
    return;
  }
  const root = designDir(args);
  const community = flagValue(args, "--community");
  // With a community, the template starts from its brand and keeps its theme where the template says so.
  const call = community
    ? createMcpClient({ url: `${API_URL}/runtime/mcp`, token: await accessToken() }).call
    : undefined;
  const chosen = await initFromTemplate({ root, template, community, call });
  if (community) await writeFile(join(root, "polynet.json"), `${JSON.stringify({ community }, null, 2)}\n`);
  // The design skills travel with the folder, so the founder's agent designs with them.
  await installSkills(root);
  if (JSON_OUTPUT) return console.log(JSON.stringify({ ok: true, template: chosen }, null, 2));
  const kept = { kept: "  Kept this folder's theme.json.", community: `  Kept ${community}'s own theme in theme.json.`,
    brand: "  Made theme.json from your brand's colours and fonts on the template's look." }[chosen.theme];
  say(`✓ Started from ${chosen.label ?? template} in ${root}.`, ...(kept ? [kept] : []), "  Edit theme.json (or ask your agent to: Polynet's design skills are in .claude/skills and .agents/skills),", "  then run polynet dev to see it on your community.");
}

async function pull(args) {
  const { project, files } = await designProject(args);
  const mcp = createMcpClient({ url: `${API_URL}/runtime/mcp`, token: await accessToken() });
  const pulled = await pullDesign({ root: project.root, files, community: project.community, call: mcp.call });
  if (JSON_OUTPUT) return console.log(JSON.stringify({ ok: true, ...Object.fromEntries(Object.entries(pulled).map(([kind, record]) =>
    [kind, { draft_revision: record.draft_revision, has_unpublished_changes: record.has_unpublished_changes }])) }, null, 2));
  for (const [kind, record] of Object.entries(pulled)) {
    say(`✓ Wrote ${project.community}'s draft ${kind} to ${files[kind]}.`,
      record.has_unpublished_changes ? "  The draft has changes members don't see yet." : "  The draft matches what members see.");
  }
}

const DESIGN_CHECKS = { brand: checkBrand, theme: checkTheme, layout: checkLayout };

async function saveDraftOnce({ project, files, call }) {
  const result = await saveFolderDraft({ root: project.root, files, community: project.community, call,
    check: (kind, record, file) => DESIGN_CHECKS[kind](record, file.slice(project.root.length + 1) || `${kind}.json`) });
  if (!result.ok) {
    printProblems(result.problems);
    say("  Not saved. Fix the problems and save the file again.");
    return null;
  }
  return result.saved;
}

function openInBrowser(url) {
  const opener = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    // No browser here; the link is printed.
  }
}

async function dev(args) {
  const { project, files } = await designProject(args);
  const mcp = createMcpClient({ url: `${API_URL}/runtime/mcp`, token: await accessToken() });
  const call = mcp.call;
  const save = async () => {
    try {
      const saved = await saveDraftOnce({ project, files, call });
      if (saved) say(`✓ ${new Date().toLocaleTimeString()} Draft saved (${Object.entries(saved).map(([kind, record]) => `${kind} revision ${record.draft_revision}`).join(", ")}). The preview updates in a moment.`);
    } catch (error) {
      say(`✗ ${error instanceof Error ? error.message : error}`);
      if (/_revision_conflict/.test(String(error))) say("  Someone else changed the draft. Run polynet pull to start from theirs.");
    }
  };
  await save();
  const url = draftPreviewUrl(APP_URL, project.community);
  say(`  Preview (only managers see the draft): ${url}`, `  Watching ${Object.values(files).map((file) => basename(file)).join(" and ")}. Press Ctrl+C to stop; run polynet publish when it's ready.`);
  if (!args.includes("--no-open")) openInBrowser(url);
  const stop = watchDesign({ files, onChange: save });
  await new Promise((done) => process.on("SIGINT", () => { stop(); done(); }));
}

async function review(args) {
  const { project, files } = await designProject(args);
  const screens = flagValue(args, "--screens")?.split(",").map((screen) => screen.trim()).filter(Boolean);
  const report = await reviewCommunity({
    root: project.root, files, community: project.community, appOrigin: flagValue(args, "--url") ?? APP_URL,
    loginUrl: flagValue(args, "--login-url"), storageState: flagValue(args, "--storage-state"), screens,
    outDir: flagValue(args, "--out"),
  });
  if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(formatReview(report).split("\n").filter((line) => !line.startsWith("Screenshot:")).join("\n").trim());
    say("", `${report.ok ? "✓" : "✗"} Screenshots and report: ${report.out_dir}`,
      "  Next: have a fresh reviewer judge the screenshots (polynet-ui-design references/reviewer.md).");
  }
  if (!report.ok) process.exit(1);
}

async function publish(args) {
  const { project, files } = await designProject(args);
  // The gate the UI design skill relies on: nothing goes live without a
  // passing review of exactly these files.
  if (!args.includes("--skip-review")) {
    const review = await latestReview(project.root, Object.values(files));
    if (!review) fail("Run polynet review first: no review of the current theme.json and layout.json yet (or pass --skip-review).");
    if (!review.ok) fail(`The last review found ${review.errors} errors (${review.out_dir}/report.md). Fix them and run polynet review again, or pass --skip-review.`);
  }
  const mcp = createMcpClient({ url: `${API_URL}/runtime/mcp`, token: await accessToken() });
  // Publish exactly what the folder has: save it first, so a draft can't be a stale one.
  const saved = await saveDraftOnce({ project, files, call: mcp.call });
  if (!saved) fail("Nothing was published.");
  const published = await publishFolderDraft({ root: project.root, community: project.community, call: mcp.call });
  if (JSON_OUTPUT) return console.log(JSON.stringify({ ok: true, published }, null, 2));
  say(`✓ ${project.community} now has this ${Object.keys(published).join(" and ")} for everyone. Polynet keeps the earlier one until you change it again.`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "deploy") await deploy(rest);
  else if (command === "create") await create(rest);
  else if (command === "check") await check(rest);
  else if (command === "push") await push(rest);
  else if (command === "init") await init(rest);
  else if (command === "pull") await pull(rest);
  else if (command === "dev") await dev(rest);
  else if (command === "publish") await publish(rest);
  else if (command === "skills") await skills(rest);
  else if (command === "review") await review(rest);
  else if (command === "login") await login();
  else if (command === "logout") { await saveAuth(null); console.log("✓ Signed out."); }
  else {
    console.log([
      "Usage:",
      "  polynet create [folder] --community <slug>",
      "      Set up a folder for your AI agent to design and build the site in:",
      "      AGENTS.md, CLAUDE.md and Polynet's skills. No template.",
      "  polynet check [folder]",
      "      Check the site: Polynet's blocks (channels, chat, members), accessibility",
      "      basics, the courses (lesson front matter, embeds, images, Polynet's limits),",
      "      theme.json and layout.json. Errors block deploys.",
      "  polynet deploy [folder] [--community <slug>]",
      "      Check, then put the folder (default: this one) live at https://<slug>.polynet.page.",
      "      You must be the community's owner or an admin. The community is saved in",
      "      polynet.json (in this folder when you deploy a build folder like dist);",
      "      dotfiles, node_modules, AGENTS.md and CLAUDE.md aren't uploaded.",
      "  polynet push [folder] [--dry-run] [--wait]",
      "      Stage the courses folder (course.json + lesson .md files) as resources.",
      "      The owner applies it in Polynet (the Apply card on the Agent page); new",
      "      pages arrive as drafts. --dry-run shows the changes and sends nothing;",
      "      --wait stays until each round is applied and stages the next.",
      "  polynet init [folder] --template <name> [--community <slug>]",
      "      Start a community design from a template (theme.json, layout.json, no content).",
      "      Without --template, lists the templates.",
      "  polynet pull [folder]",
      "      Copy the community's draft theme (and layout, if it has one) into the folder.",
      "  polynet dev [folder] [--no-open]",
      "      Save theme.json and layout.json to the community's drafts on every edit and open the",
      "      draft preview in the real app. Members keep the published look.",
      "  polynet publish [folder] [--skip-review]",
      "      Save theme.json and layout.json, then make them what members see. Needs a",
      "      passing polynet review of the current files.",
      "  polynet review [folder] [--url <app>] [--login-url <url>] [--storage-state <file>] [--screens a,b]",
      "      Open the community's draft in the real app at 390, 1280 and 1440px, screenshot every",
      "      page and audit it (overflow, contrast, off-theme colours, drift, tap targets, clutter).",
      "      Errors fail it; publish needs a passing review. Report in .polynet/review/.",
      "  polynet skills [folder]",
      "      Add or update Polynet's skills for AI agents (.agents/skills, .claude/skills).",
      "  polynet login     Sign in with Polynet in the browser.",
      "  polynet logout    Forget the sign-in (kept in ~/.polynet/auth.json).",
      "",
      "  --staging         Use Polynet's staging (sites at https://<slug>-staging.polynet.page).",
      "                    A folder created or deployed with it remembers it in polynet.json.",
      "  --json prints one JSON result (for CI and agents). POLYNET_TOKEN sets the",
      "  access token instead of a browser sign-in.",
      "",
      "Guide: https://polynet.page/llms.txt",
    ].join("\n"));
    process.exit(command && !["help", "--help", "-h"].includes(command) ? 1 : 0);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
