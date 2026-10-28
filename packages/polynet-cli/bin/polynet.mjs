#!/usr/bin/env node
// polynet create [dir] --community <slug>     a site folder set up for your AI agent (add --staging for Polynet's staging)
// polynet check [dir]                          the checks a site passes before going live
// polynet deploy [dir] [--community <slug>]   check, then put a site live at <slug>.polynet.page
// polynet skills [dir]                         add or update Polynet's skills for AI agents
// polynet login | logout                       sign in with Polynet (browser), or forget it
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  CALLBACK_PORT, REDIRECT_URI, apiUrlFor, buildManifest, collectFiles, formatBytes, installGuide, isDirectory, pkce,
  privateAddress, readCheckedFiles, siteAddress, siteConfigPaths, uploadBuckets,
} from "../lib.mjs";
import { checkSite, formatProblems } from "../checks.mjs";

const STAGING_FLAG = process.argv.includes("--staging");
// Set again by deploy once it has read the folder's polynet.json.
let API_URL = apiUrlFor({ env: process.env, staging: STAGING_FLAG });
const AUTH_FILE = join(homedir(), ".polynet", "auth.json");

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

async function check(args) {
  const dir = siteDir(args);
  if (!(await isDirectory(dir))) fail(`${dir} isn't a folder.`);
  const files = await collectFiles(dir);
  if (!(await runChecks(files))) process.exit(1);
  console.log(`✓ Checked ${files.length} files.`);
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

  const files = await collectFiles(dir);
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

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "deploy") await deploy(rest);
  else if (command === "create") await create(rest);
  else if (command === "check") await check(rest);
  else if (command === "skills") await skills(rest);
  else if (command === "login") await login();
  else if (command === "logout") { await saveAuth(null); console.log("✓ Signed out."); }
  else {
    console.log([
      "Usage:",
      "  polynet create [folder] --community <slug>",
      "      Set up a folder for your AI agent to design and build the site in:",
      "      AGENTS.md, CLAUDE.md and Polynet's skills. No template.",
      "  polynet check [folder]",
      "      Check the site: Polynet's blocks (channels, chat, members) and accessibility",
      "      basics. Errors block deploys.",
      "  polynet deploy [folder] [--community <slug>]",
      "      Check, then put the folder (default: this one) live at https://<slug>.polynet.page.",
      "      You must be the community's owner or an admin. The community is saved in",
      "      polynet.json (in this folder when you deploy a build folder like dist);",
      "      dotfiles, node_modules, AGENTS.md and CLAUDE.md aren't uploaded.",
      "  polynet skills [folder]",
      "      Add or update Polynet's skills for AI agents (.agents/skills, .claude/skills).",
      "  polynet login     Sign in with Polynet in the browser.",
      "  polynet logout    Forget the sign-in (kept in ~/.polynet/auth.json).",
      "",
      "  --staging         Use Polynet's staging (sites at https://<slug>-staging.polynet.page).",
      "                    A folder created or deployed with it remembers it in polynet.json.",
      "",
      "Guide: https://polynet.page/llms.txt",
    ].join("\n"));
    process.exit(command && !["help", "--help", "-h"].includes(command) ? 1 : 0);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
