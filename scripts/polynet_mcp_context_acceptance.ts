import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export type ContextActor = "member" | "builder";
export type ContextRequest = {
  actor: ContextActor;
  name: "polynet_list" | "polynet_read" | "polynet_search";
  input: Record<string, unknown>;
  expectedErrorCode?: "semantic_not_found";
};
export type ContextFixture = {
  communitySlug: string;
  deniedCommunitySlug: string;
  publicDocumentPath: string;
  privateDocumentPath: string;
  publicCanary: string;
  privateCanary: string;
};

export function validateContextFixture(fixture: ContextFixture) {
  for (const slug of [fixture.communitySlug, fixture.deniedCommunitySlug]) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "context fixture slug must be canonical");
  }
  assert.notEqual(fixture.communitySlug, fixture.deniedCommunitySlug, "denied community must differ");
  const root = `/communities/${fixture.communitySlug}/`;
  for (const [path, prefix] of [[fixture.publicDocumentPath, "resources/"], [fixture.privateDocumentPath, "channels/"]]) {
    assert.ok(path.startsWith(root + prefix), "context document must belong to its fixture subtree");
    assert.ok(path.endsWith(".md"), "context fixture must select an exact document");
    assert.ok(!/[\\%\u0000-\u0020]/.test(path) && !path.includes("//") && !path.split("/").some(part => part === "." || part === ".."), "context document path must be canonical");
  }
  for (const canary of [fixture.publicCanary, fixture.privateCanary]) {
    assert.match(canary, /^POLYNET_2A_[A-Z0-9_]{8,80}$/, "context acceptance requires synthetic canaries");
  }
  assert.notEqual(fixture.publicCanary, fixture.privateCanary, "privacy control must be distinct");
}

export function assertContextFlags(env: Record<string, string | undefined>) {
  for (const name of ["POLYNET_MCP_WRITE_CHAT", "POLYNET_MCP_EXERCISE_BUILDER"]) {
    assert.ok([undefined, "", "0", "false", "no", "off"].includes(env[name]?.trim().toLowerCase()), "context acceptance forbids content mutation switches");
  }
}

type ReadCall = (request: ContextRequest) => Promise<Record<string, unknown>>;
const body = (value: Record<string, unknown>) => String(value.body ?? "");
const rows = (value: Record<string, unknown>) => Array.isArray(value.results) ? value.results as Array<Record<string, unknown>> : [];
const fingerprint = (id: string) => createHash("sha256").update(id).digest("hex");
function profileUserId(value: Record<string, unknown>) {
  const id = /- User ref: `user:([^`\s]+)`/.exec(body(value))?.[1];
  assert.ok(id, "self profile must identify the server-resolved canonical user");
  return id;
}
function selfContext(value: Record<string, unknown>) {
  try { return JSON.parse(body(value).trim().split("\n").at(-1)!) as Record<string, unknown>; }
  catch { throw new Error("self context must contain its canonical identity projection"); }
}

export async function runContextAcceptance(fixture: ContextFixture, call: ReadCall) {
  validateContextFixture(fixture);
  const root = `/communities/${fixture.communitySlug}/`;
  const deniedRoot = `/communities/${fixture.deniedCommunitySlug}/`;
  const read = (actor: ContextActor, path: string, denied = false) => call({ actor, name: "polynet_read", input: { path }, ...(denied ? { expectedErrorCode: "semantic_not_found" as const } : {}) });
  const list = (actor: ContextActor, path: string, denied = false) => call({ actor, name: "polynet_list", input: { path, limit: 20 }, ...(denied ? { expectedErrorCode: "semantic_not_found" as const } : {}) });
  const search = (actor: ContextActor, path: string, query: string) => call({ actor, name: "polynet_search", input: { path, query, limit: 10 } });
  const identities = {
    member: profileUserId(await read("member", "/users/me/profile.md")),
    builder: profileUserId(await read("builder", "/users/me/profile.md")),
  };
  assert.notEqual(identities.member, identities.builder, "control must be a different canonical user, not merely a different token");
  for (const actor of ["member", "builder"] as const) {
    const directory = await list(actor, root);
    assert.equal((directory.authority as { lane?: string } | undefined)?.lane, actor, "fixture authority must be server-derived and match the expected lane");
    const self = selfContext(await read(actor, root + "members/me/context.md"));
    assert.equal(self.user_id, identities[actor], "self context must stay bound to the current caller");
    assert.ok(!JSON.stringify(self).includes(fixture.privateCanary), "self context must exclude the private-channel canary");
    assert.ok(body(await read(actor, fixture.publicDocumentPath)).includes(fixture.publicCanary), "published resource must contain the known fixture evidence");
    const found = rows(await search(actor, root + "resources/", fixture.publicCanary));
    assert.ok(found.some(row => row.path === fixture.publicDocumentPath), "search must find the actual published resource");
    for (const row of found) {
      assert.equal(typeof row.path, "string", "search must return a follow-up path");
      assert.ok(String(row.path).startsWith(root + "resources/"), "resource search must remain scoped");
      assert.ok(body(await read(actor, String(row.path))).includes(fixture.publicCanary), "search evidence must round-trip into an authorized read");
    }
  }
  const memberSelf = selfContext(await read("member", root + "members/me/context.md"));
  assert.match(String(memberSelf.membership_id), /^[a-zA-Z0-9]+$/, "ordinary member must have one canonical membership");
  const dossierPath = root + `builder/workflow-members/${memberSelf.membership_id}.md`;
  const dossier = await read("builder", dossierPath);
  assert.equal((dossier.context as { user_id?: string } | undefined)?.user_id, identities.member, "builder dossier must resolve the actual fixture member");
  await read("member", dossierPath, true);
  assert.ok(body(await read("builder", fixture.privateDocumentPath)).includes(fixture.privateCanary), "control must prove the private document exists");
  await read("member", fixture.privateDocumentPath, true);
  // Community-wide chat search deliberately scans shared channels only, even
  // for managers. Prove private searchability through its exact channel scope.
  const privateChannelPath = fixture.privateDocumentPath.slice(0, fixture.privateDocumentPath.lastIndexOf("/") + 1);
  const privateControl = rows(await search("builder", privateChannelPath, fixture.privateCanary));
  assert.ok(privateControl.some(row => row.path === fixture.privateDocumentPath), "control must prove private canary searchability");
  assert.ok(JSON.stringify(privateControl).includes(fixture.privateCanary), "control search must expose the actual canary evidence");
  await call({ actor: "member", name: "polynet_search", input: { path: privateChannelPath, query: fixture.privateCanary, limit: 10 }, expectedErrorCode: "semantic_not_found" });
  const privateDenied = await search("member", root + "channels/", fixture.privateCanary);
  assert.equal(rows(privateDenied).length, 0, "private canary must not leak into member search results");
  assert.ok(!JSON.stringify(privateDenied).includes(fixture.privateCanary), "private canary must not leak into search metadata");
  await list("builder", deniedRoot);
  assert.ok(body(await read("builder", deniedRoot + "community.md")).length > 0, "control must prove the denied community exists");
  await list("member", deniedRoot, true);
  await read("member", deniedRoot + "community.md", true);
  return { identity_fingerprints: { member: fingerprint(identities.member), builder: fingerprint(identities.builder) }, distinct_canonical_users: "passed", server_derived_roles: "passed", caller_bound_self_context: "passed", published_resource_read_search_round_trip: "passed", builder_dossier_denial: "passed", private_document_and_search_denial: "passed", control_proven_cross_community_denial: "passed" };
}

export async function runContextRevocation(fixture: ContextFixture, call: ReadCall) {
  validateContextFixture(fixture);
  const root = `/communities/${fixture.communitySlug}/`;
  const memberId = profileUserId(await call({ actor: "member", name: "polynet_read", input: { path: "/users/me/profile.md" } }));
  for (const [name, path] of [["polynet_list", root], ["polynet_read", root + "members/me/context.md"], ["polynet_read", fixture.publicDocumentPath], ["polynet_search", root + "resources/"]] as const) {
    await call({ actor: "member", name, input: { path, ...(name === "polynet_search" ? { query: fixture.publicCanary, limit: 10 } : {}) }, expectedErrorCode: "semantic_not_found" });
  }
  const control = await call({ actor: "builder", name: "polynet_read", input: { path: fixture.publicDocumentPath } });
  assert.ok(body(control).includes(fixture.publicCanary), "builder control must remain healthy after member revocation");
  return { member_identity_fingerprint: fingerprint(memberId), bearer_still_authenticated: "passed", membership_revocation_next_request_denial: "passed", independent_control_still_authorized: "passed" };
}
