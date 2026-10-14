import { expect, test } from "vitest";
import { assertContextFlags, runContextAcceptance, runContextRevocation, validateContextFixture, type ContextFixture, type ContextRequest } from "./polynet_mcp_context_acceptance";

const fixture: ContextFixture = {
  communitySlug: "context-fixture", deniedCommunitySlug: "control-only-fixture",
  publicDocumentPath: "/communities/context-fixture/resources/test/page.md",
  privateDocumentPath: "/communities/context-fixture/channels/private/interaction:root:rootId.md",
  publicCanary: "POLYNET_2A_PUBLIC_CANARY", privateCanary: "POLYNET_2A_PRIVATE_CANARY",
};
const root = "/communities/context-fixture/";
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
  const { call, calls } = mockReadCall();
  const result = await runContextRevocation(fixture, call);
  expect(result.bearer_still_authenticated).toBe("passed");
  expect(calls[0].input.path).toBe("/users/me/profile.md");
  expect(calls.filter(c => c.expectedErrorCode)).toHaveLength(4);
  expect(calls.at(-1)?.actor).toBe("builder");
  const unhealthy = mockReadCall((r, value) => r.actor === "builder" ? { body: "wrong control" } : value);
  await expect(runContextRevocation(fixture, unhealthy.call)).rejects.toThrow("remain healthy");
});
