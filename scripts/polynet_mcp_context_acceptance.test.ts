import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getPolynetMcpToolDefinitions } from "../shared/polynetMcp";
import { assertContextFlags, contextFingerprint, createContextBaseline, runContextAcceptance, runContextRevocation, validateContextBaseline, validateContextFixture, type ContextFixture, type ContextRequest } from "./polynet_mcp_context_acceptance";

const fixture: ContextFixture = {
  communitySlug: "context-fixture", deniedCommunitySlug: "control-only-fixture",
  publicDocumentPath: "/communities/context-fixture/resources/test/page.md",
  privateDocumentPath: "/communities/context-fixture/channels/private/interaction:root:rootId.md",
  publicCanary: "POLYNET_2A_PUBLIC_CANARY", privateCanary: "POLYNET_2A_PRIVATE_CANARY",
};
const root = "/communities/context-fixture/";
const runtimeSha = "a".repeat(40);
const memberBearerSha256 = contextFingerprint("synthetic-member-bearer");
const match = { fixture, runtimeSha, memberBearerSha256 };
async function positiveBaseline() {
  return createContextBaseline({ ...match, contextCases: await runContextAcceptance(fixture, mockReadCall().call) });
}
function mockReadCall(change?: (request: ContextRequest, value: Record<string, unknown>) => Record<string, unknown>) {
  const calls: ContextRequest[] = [];
  const call = async (request: ContextRequest) => {
    calls.push(request);
    const path = String(request.input.path);
    let value: Record<string, unknown>;
    if (request.expectedErrorCode) value = { error: "semantic_not_found" };
    else if (path === "/users/me/profile.md") value = { body: `- User ref: \`user:${request.actor}Id\`` };
    else if (request.name === "polynet_list") value = { authority: { lane: request.actor }, entries: [] };
    else if (path === root + "members/me/context.md") value = { body: `# Context\n${JSON.stringify({ user_id: request.actor + "Id", membership_id: "membershipId" })}` };
    else if (path.includes("builder/workflow-members/")) value = { context: { user_id: "memberId" }, body: "Private dossier" };
    else if (request.name === "polynet_search") {
      const privateQuery = request.input.query === fixture.privateCanary;
      value = { results: privateQuery && request.actor === "member" ? [] : [{ path: privateQuery ? fixture.privateDocumentPath : fixture.publicDocumentPath, snippet: request.input.query }] };
    } else value = { body: path === fixture.privateDocumentPath ? fixture.privateCanary : path === fixture.publicDocumentPath ? fixture.publicCanary : "Control-only community" };
    return change ? change(request, value) : value;
  };
  return { call, calls };
}

test("context proof exercises only observation operations with independent positive controls", async () => {
  const { call, calls } = mockReadCall();
  const result = await runContextAcceptance(fixture, call);
  expect(result.private_document_and_search_denial).toBe("passed");
  expect(new Set(calls.map(c => c.name))).toEqual(new Set(["polynet_list", "polynet_read", "polynet_search"]));
  for (const denied of calls.filter(c => c.expectedErrorCode)) {
    expect(calls.some(c => c.actor === "builder" && c.name === denied.name && c.input.path === denied.input.path && !c.expectedErrorCode)).toBe(true);
  }
  expect(JSON.stringify(result)).not.toContain("memberId");
  expect(JSON.stringify(result)).not.toContain(fixture.privateCanary);
});

test.each(["true", "1", "YES", "unexpected"])("context mode refuses the mutation switch %s", value => {
  expect(() => assertContextFlags({ POLYNET_MCP_WRITE_CHAT: value })).toThrow();
  expect(() => assertContextFlags({ POLYNET_MCP_EXERCISE_BUILDER: value })).toThrow();
});

test("context mode permits only explicitly disabled mutation switches", () => {
  expect(() => assertContextFlags({})).not.toThrow();
  expect(() => assertContextFlags({ POLYNET_MCP_WRITE_CHAT: "0", POLYNET_MCP_EXERCISE_BUILDER: "off" })).not.toThrow();
});

test.each(["/communities/other/resources/page.md", "/communities/context-fixture/resources/../page.md", "/communities/context-fixture/resources/%2e%2e/page.md"])("fixture selector cannot escape its scope: %s", publicDocumentPath => {
  expect(() => validateContextFixture({ ...fixture, publicDocumentPath })).toThrow();
});

test("different tokens for the same canonical actor cannot establish an independent control", async () => {
  const { call } = mockReadCall((r, value) => r.input.path === "/users/me/profile.md" ? { body: "- User ref: `user:sameId`" } : value);
  await expect(runContextAcceptance(fixture, call)).rejects.toThrow("different canonical user");
});

test.each(["self-subject", "missing-public-resource", "missing-private-control", "missing-private-search", "private-search-leak", "missing-denied-community"])("acceptance fails instead of weakening %s", failure => {
  const { call } = mockReadCall((r, value) => {
    if (failure === "self-subject" && r.input.path === root + "members/me/context.md") return { body: '# Context\n{"user_id":"otherId"}' };
    if (failure === "missing-public-resource" && r.name === "polynet_read" && r.input.path === fixture.publicDocumentPath) return { body: "empty" };
    if (failure === "missing-private-control" && r.actor === "builder" && r.input.path === fixture.privateDocumentPath) return { body: "empty" };
    if (failure === "missing-private-search" && r.actor === "builder" && r.name === "polynet_search" && r.input.query === fixture.privateCanary) return { results: [] };
    if (failure === "private-search-leak" && r.actor === "member" && r.name === "polynet_search" && r.input.query === fixture.privateCanary) return { results: [{ snippet: fixture.privateCanary }] };
    if (failure === "missing-denied-community" && r.actor === "builder" && r.input.path === "/communities/control-only-fixture/community.md") return {};
    return value;
  });
  return expect(runContextAcceptance(fixture, call)).rejects.toThrow();
});

test("revocation proof requires a working bearer and preserves an independent authorized control", async () => {
  const baseline = await positiveBaseline();
  const link = { baseline, runtimeSha, memberBearerSha256 };
  const { call, calls } = mockReadCall();
  const result = await runContextRevocation(fixture, call, link);
  expect(result.baseline_linkage).toBe("passed");
  expect(result.bearer_still_authenticated).toBe("passed");
  expect(calls[0].input.path).toBe("/users/me/profile.md");
  expect(calls.filter(c => c.expectedErrorCode)).toHaveLength(4);
  expect(calls.at(-1)?.actor).toBe("builder");
  const unhealthy = mockReadCall((r, value) => r.actor === "builder" && r.input.path === fixture.publicDocumentPath ? { body: "wrong control" } : value);
  await expect(runContextRevocation(fixture, unhealthy.call, link)).rejects.toThrow("remain healthy");
});

test.each([undefined, null, [], {}, { schema_version: 2 }, { ok: false }, { mode: "context-revoked" }, { fixture: {} }, { runtime_sha: "invalid" }, { member_bearer_sha256: "invalid" }, { context_cases: {} }])("missing, failed or malformed baseline cannot initiate revocation checks: %j", async patch => {
  const valid = await positiveBaseline();
  const baseline = patch === undefined || patch === null || Array.isArray(patch) ? patch : Object.keys(patch).length === 0 ? patch : { ...valid, ...patch };
  const { call, calls } = mockReadCall();
  await expect(runContextRevocation(fixture, call, { baseline, runtimeSha, memberBearerSha256 })).rejects.toThrow();
  expect(calls).toHaveLength(0);
});

test("every positive case must pass before its output is a usable baseline", async () => {
  const baseline = await positiveBaseline();
  for (const key of Object.keys(baseline.context_cases).filter(key => key !== "identity_fingerprints")) {
    expect(() => validateContextBaseline({ ...baseline, context_cases: { ...baseline.context_cases, [key]: "failed" } }, match)).toThrow("every positive baseline case");
  }
});

test.each(["runtime", "bearer", ...Object.keys(fixture)])("changed %s cannot reuse a positive baseline", async field => {
  const baseline = await positiveBaseline();
  const changed = { ...fixture };
  if (field === "communitySlug") {
    changed.communitySlug += "-different";
    changed.publicDocumentPath = changed.publicDocumentPath.replace(fixture.communitySlug, changed.communitySlug);
    changed.privateDocumentPath = changed.privateDocumentPath.replace(fixture.communitySlug, changed.communitySlug);
  } else if (field === "deniedCommunitySlug") changed.deniedCommunitySlug += "-different";
  else if (field === "publicDocumentPath" || field === "privateDocumentPath") changed[field] = changed[field].replace(".md", "-different.md");
  else if (field === "publicCanary" || field === "privateCanary") changed[field] += "_DIFFERENT";
  const { call, calls } = mockReadCall();
  await expect(runContextRevocation(changed, call, { baseline, runtimeSha: field === "runtime" ? "b".repeat(40) : runtimeSha,
    memberBearerSha256: field === "bearer" ? contextFingerprint("different-bearer") : memberBearerSha256 })).rejects.toThrow();
  expect(calls).toHaveLength(0);
});

test.each(["member", "builder"] as const)("a different canonical %s cannot pass even with matching supplied evidence", async actor => {
  const baseline = await positiveBaseline();
  const { call, calls } = mockReadCall((r, value) => r.actor === actor && r.input.path === "/users/me/profile.md" ? { body: "- User ref: `user:neverAMember`" } : value);
  await expect(runContextRevocation(fixture, call, { baseline, runtimeSha, memberBearerSha256 })).rejects.toThrow(`${actor} must match`);
  expect(calls.some(r => r.expectedErrorCode)).toBe(false);
});

test("malformed or same-user identity fingerprints cannot establish a baseline", async () => {
  const baseline = await positiveBaseline();
  for (const identity_fingerprints of [{ member: "invalid", builder: baseline.context_cases.identity_fingerprints.builder },
    { member: [baseline.context_cases.identity_fingerprints.member], builder: [baseline.context_cases.identity_fingerprints.member] },
    { member: baseline.context_cases.identity_fingerprints.member, builder: baseline.context_cases.identity_fingerprints.member }]) {
    expect(() => validateContextBaseline({ ...baseline, context_cases: { ...baseline.context_cases, identity_fingerprints } }, match)).toThrow();
  }
});

test("expired authentication cannot masquerade as successful membership revocation", async () => {
  const baseline = await positiveBaseline();
  let calls = 0;
  await expect(runContextRevocation(fixture, async () => { calls++; throw new Error("HTTP 401: expired bearer"); },
    { baseline, runtimeSha, memberBearerSha256 })).rejects.toThrow("expired bearer");
  expect(calls).toBe(1);
});

test("positive baseline round-trips as JSON without credentials, raw user IDs or arbitrary extra fields", async () => {
  const baseline = await positiveBaseline();
  expect(validateContextBaseline(JSON.parse(JSON.stringify(baseline)), match)).toEqual(baseline);
  const supported = validateContextBaseline({ ...baseline, access_token: "do-not-propagate" }, match);
  expect(JSON.stringify(supported)).not.toMatch(/synthetic-member-bearer|memberId|builderId|do-not-propagate|access_token/);
});

// Exercise the real CLI/file/HTTP adapter in a subprocess. Every fetch is
// intercepted; unknown requests throw, so these tests cannot reach staging.
function cliFixture() {
  const directory = mkdtempSync(join(tmpdir(), "polynet-context-link-test-"));
  const trace = join(directory, "fetch.jsonl");
  const baselinePath = join(directory, "baseline.json");
  const preload = join(directory, "fetch.mjs");
  writeFileSync(preload, `
    import { appendFileSync } from 'node:fs';
    const fixture = ${JSON.stringify(fixture)}, runtimeSha = ${JSON.stringify(runtimeSha)};
    const toolNames = ${JSON.stringify(getPolynetMcpToolDefinitions().map(t => t.name))};
    globalThis.fetch = async (url, init = {}) => {
      const rpc = init.body ? JSON.parse(init.body) : null;
      appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ url: String(url), method: rpc?.method, name: rpc?.params?.name }) + '\\n');
      const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
      if (String(url) === 'https://polynet-staging.vercel.app/version.json') return response({ buildId: runtimeSha });
      if (String(url) === 'https://polynet-staging.vercel.app/.well-known/oauth-protected-resource') return response({ resource: 'https://polynet-staging.vercel.app/runtime/mcp', authorization_servers: ['https://synthetic.invalid'], bearer_methods_supported: ['header'] });
      if (String(url) !== 'https://polynet-staging.vercel.app/runtime/mcp') throw Error('unexpected synthetic request');
      const token = new Headers(init.headers).get('authorization');
      if (!token) return response({}, 401, { 'www-authenticate': 'Bearer resource_metadata="https://polynet-staging.vercel.app/.well-known/oauth-protected-resource"' });
      const actor = token === 'Bearer synthetic-member-bearer' ? 'member' : 'builder';
      if (process.env.SYNTHETIC_FAULT === 'expired' && actor === 'member') return response({}, 401);
      if (rpc.method === 'tools/list') return response({ result: { tools: toolNames.map(name => ({ name })) } });
      if (rpc.method !== 'tools/call' || !['polynet_list', 'polynet_read', 'polynet_search'].includes(rpc.params.name)) throw Error('unexpected synthetic operation');
      const { name, arguments: args } = rpc.params, path = args.path;
      const root = '/communities/' + fixture.communitySlug + '/';
      const privateDirectory = fixture.privateDocumentPath.slice(0, fixture.privateDocumentPath.lastIndexOf('/') + 1);
      const denied = actor === 'member' && (path.startsWith('/communities/' + fixture.deniedCommunitySlug + '/') || path.includes('/builder/') || path.startsWith(privateDirectory) || (process.env.SYNTHETIC_REVOKED === '1' && path.startsWith(root)));
      if (denied) return response({ result: { isError: true, structuredContent: { error: process.env.SYNTHETIC_FAULT === 'wrong-denial' ? 'invalid_tool_args' : 'semantic_not_found' } } });
      let value;
      if (path === '/users/me/profile.md') value = { body: '- User ref: \x60user:' + (actor === 'member' && process.env.SYNTHETIC_FAULT === 'wrong-member' ? 'unrelatedId' : actor + 'Id') + '\x60' };
      else if (name === 'polynet_list') value = { authority: { lane: actor }, entries: [] };
      else if (path.endsWith('/members/me/context.md')) value = { body: '# Context\\n' + JSON.stringify({ user_id: actor + 'Id', membership_id: 'membershipId' }) };
      else if (path.includes('/builder/workflow-members/')) value = { context: { user_id: 'memberId' }, body: 'Synthetic dossier' };
      else if (name === 'polynet_search') value = { results: args.query === fixture.privateCanary && actor === 'member' ? [] : [{ path: args.query === fixture.privateCanary ? fixture.privateDocumentPath : fixture.publicDocumentPath, snippet: args.query }] };
      else value = { body: path === fixture.publicDocumentPath ? fixture.publicCanary : path === fixture.privateDocumentPath ? fixture.privateCanary : 'Synthetic control community' };
      return response({ result: { isError: false, structuredContent: value } });
    };
  `);
  function run(mode: "context" | "context-revoked", options: { baseline?: unknown; malformed?: boolean; fault?: string } = {}) {
    rmSync(trace, { force: true });
    if (options.baseline !== undefined || options.malformed) writeFileSync(baselinePath, options.malformed ? "not valid JSON" : JSON.stringify(options.baseline));
    return spawnSync(process.execPath, ["--import", "tsx", "--import", preload, "scripts/polynet_workspace_mcp_external_smoke.ts", `--mode=${mode}`, "--url=https://polynet-staging.vercel.app/runtime/mcp"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
      env: { ...process.env, POLYNET_MCP_BEARER_TOKEN: "synthetic-member-bearer", POLYNET_MCP_CONTROL_BEARER_TOKEN: "synthetic-builder-bearer",
        POLYNET_MCP_COMMUNITY_SLUG: fixture.communitySlug, POLYNET_MCP_DENIED_COMMUNITY_SLUG: fixture.deniedCommunitySlug,
        POLYNET_MCP_PUBLIC_DOCUMENT_PATH: fixture.publicDocumentPath, POLYNET_MCP_PRIVATE_DOCUMENT_PATH: fixture.privateDocumentPath,
        POLYNET_MCP_PUBLIC_CANARY: fixture.publicCanary, POLYNET_MCP_PRIVATE_CANARY: fixture.privateCanary,
        POLYNET_MCP_ACCEPTANCE_RUN_ID: runtimeSha, POLYNET_MCP_WRITE_CHAT: "0", POLYNET_MCP_EXERCISE_BUILDER: "0",
        POLYNET_MCP_CONTEXT_BASELINE_FILE: options.baseline !== undefined || options.malformed ? baselinePath : "",
        SYNTHETIC_REVOKED: mode === "context-revoked" ? "1" : "0", SYNTHETIC_FAULT: options.fault ?? "" },
    });
  }
  return { run, requests: () => existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [], cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test("CLI-generated positive JSON can be consumed by linked revocation through the actual transport adapter", () => {
  const cli = cliFixture();
  try {
    const positive = cli.run("context");
    expect(positive.status, positive.stderr).toBe(0);
    const baseline = JSON.parse(positive.stdout);
    expect(baseline.schema_version).toBe(1);
    expect(baseline.member_bearer_sha256).toBe(memberBearerSha256);
    expect(positive.stdout).not.toMatch(/synthetic-member-bearer|synthetic-builder-bearer|user:memberId/);
    const revoked = cli.run("context-revoked", { baseline });
    expect(revoked.status, revoked.stderr).toBe(0);
    expect(JSON.parse(revoked.stdout).context_cases.baseline_linkage).toBe("passed");
    expect(new Set(cli.requests().filter(r => r.name).map(r => r.name))).toEqual(new Set(["polynet_list", "polynet_read", "polynet_search"]));
  } finally { cli.cleanup(); }
});

test.each(["missing", "malformed", "failed", "changed-bearer"])("CLI rejects %s baseline before any fetch", async failure => {
  const cli = cliFixture();
  try {
    const baseline = await positiveBaseline();
    const options = failure === "missing" ? {} : failure === "malformed" ? { malformed: true } : { baseline: { ...baseline,
      ...(failure === "failed" ? { ok: false } : { member_bearer_sha256: contextFingerprint("other-bearer") }) } };
    const result = cli.run("context-revoked", options);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(cli.requests()).toEqual([]);
  } finally { cli.cleanup(); }
});

test.each(["expired", "wrong-member", "wrong-denial"])("CLI refuses %s as successful revocation", async fault => {
  const cli = cliFixture();
  try {
    const result = cli.run("context-revoked", { baseline: await positiveBaseline(), fault });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  } finally { cli.cleanup(); }
});
