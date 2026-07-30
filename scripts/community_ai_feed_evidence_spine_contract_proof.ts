import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCommunityAiFeedEvidenceRef,
  deriveCommunityAiFeedLineageEnvelope,
  parseCommunityAiFeedEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import { resolveCommunityAiFeedEvidenceSource } from "../convex/communityAiFeedEvidenceCore.ts";
import {
  getToolDefinition,
  normalizeToolArguments,
} from "../shared/toolRegistry.ts";
import { getPolynetMcpToolDefinition } from "../shared/polynetMcp.ts";
import { restrictToolNamesForInvocationSurface } from "../shared/runtimeInvocationSurface.ts";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertIncludes(source: string, expected: string, label: string) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`);
}

function proveEvidenceReferenceAndLineage() {
  const ref = buildCommunityAiFeedEvidenceRef("post-live");
  assert.equal(ref, "ai_feed:post-live");
  assert.equal(parseCommunityAiFeedEvidenceRef(ref), "post-live");
  assert.equal(parseCommunityAiFeedEvidenceRef("interaction:root:nope"), null);

  const attributed = deriveCommunityAiFeedLineageEnvelope({
    communityId: "community-1",
    postId: "post-live",
    agentKey: "community_steward",
    recordedByUserId: "moderator-1",
  });
  assert.deepEqual(attributed.actor, {
    type: "community_agent",
    agent_key: "community_steward",
  });
  assert.deepEqual(attributed.authority, {
    type: "community",
    community_id: "community-1",
  });
  assert.deepEqual(attributed.recorded_by, {
    type: "user",
    user_id: "moderator-1",
  });
  assert.deepEqual(attributed.credit, {
    type: "agent",
    agent_key: "community_steward",
  });
  assert.equal(attributed.attribution_mode, "autonomous");

  const unattributed = deriveCommunityAiFeedLineageEnvelope({
    communityId: "community-1",
    postId: "post-missing-agent",
    recordedByUserId: "moderator-1",
  });
  assert.equal(unattributed.actor.agent_key, null);
  assert.equal(unattributed.credit, null);
  assert.equal(unattributed.attribution_mode, "unattributed");
  assert.equal(unattributed.profile_projection, "none");
  console.log("PASS: AI Feed refs and lineage never infer agent credit from the recorder");
}

async function proveCanonicalResolverFailsClosed() {
  const rows = new Map<string, Record<string, unknown>>([
    ["post-live", { _id: "post-live", communityId: "community-1", status: "live" }],
    ["post-hidden", { _id: "post-hidden", communityId: "community-1", status: "hidden" }],
    ["post-foreign", { _id: "post-foreign", communityId: "community-2", status: "live" }],
  ]);
  const ctx = {
    db: {
      normalizeId(tableName: string, id: string) {
        return tableName === "communityAiFeedPosts" && id.startsWith("post-")
          ? id
          : null;
      },
      async get(id: string) {
        return rows.get(id) ?? null;
      },
    },
  };
  assert.equal(
    (await resolveCommunityAiFeedEvidenceSource({
      ctx,
      communityId: "community-1",
      postId: "post-live",
    }))?._id,
    "post-live",
  );
  assert.equal(
    await resolveCommunityAiFeedEvidenceSource({
      ctx,
      communityId: "community-1",
      postId: "post-hidden",
    }),
    null,
  );
  assert.equal(
    await resolveCommunityAiFeedEvidenceSource({
      ctx,
      communityId: "community-1",
      postId: "post-foreign",
    }),
    null,
  );
  assert.equal(
    await resolveCommunityAiFeedEvidenceSource({
      ctx,
      communityId: "community-1",
      postId: "resource-1",
    }),
    null,
  );
  console.log("PASS: canonical AI Feed resolver rejects hidden, foreign, stale, and wrong-table evidence");
}

function proveToolSurfaces() {
  assert.equal(getToolDefinition("community_ai_feed_search").name, "community_ai_feed_search");
  assert.equal(getToolDefinition("community_ai_feed_read").name, "community_ai_feed_read");
  assert.deepEqual(
    normalizeToolArguments("community_ai_feed_search", { query: " pricing ", limit: 50 }),
    { query: "pricing", limit: 20 },
  );
  assert.deepEqual(
    normalizeToolArguments("community_ai_feed_read", { ref: "ai_feed:post-live" }),
    { ref: "ai_feed:post-live" },
  );
  assert.throws(() =>
    normalizeToolArguments("community_ai_feed_read", { ref: "resource:post-live" }),
  );
  const conciergeTools = read("shared/communityAgentConciergeTools.ts");
  assertIncludes(conciergeTools, '"polynet_search"', "Concierge canonical search");
  assertIncludes(conciergeTools, '"polynet_read"', "Concierge canonical read");
  assertIncludes(conciergeTools, '"polynet_write"', "Concierge canonical write");
  const memberTools = restrictToolNamesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    toolNames: [
      "polynet_search",
      "polynet_read",
      "polynet_write",
      "community_ai_feed_search",
    ],
  });
  assert.deepEqual(memberTools, [
    "polynet_search",
    "polynet_read",
    "polynet_write",
  ]);
  assert.equal(getPolynetMcpToolDefinition("polynet_workspace_ai_feed_search"), null);
  assert.equal(getPolynetMcpToolDefinition("polynet_workspace_ai_feed_read"), null);
  assert.equal(getPolynetMcpToolDefinition("polynet_search")?.name, "polynet_search");
  assert.equal(getPolynetMcpToolDefinition("polynet_read")?.name, "polynet_read");
  assert.equal(getPolynetMcpToolDefinition("polynet_write")?.name, "polynet_write");
  console.log("PASS: native and MCP surfaces route AI Feed evidence through the canonical five");
}

function proveImplementationBoundaries() {
  const evidence = read("convex/communityAiFeedEvidence.ts");
  const aiFeed = read("convex/communityAiFeed.ts");
  const audit = read("convex/communityEvidenceAudit.ts");
  const schema = read("convex/schema.ts");
  const runtime = read("convex/runtimeAgentLoop.ts");
  const mcp = read("convex/httpMcp.ts");
  const executor = read("convex/polynetCanonicalExecutor.ts");
  const directory = read("convex/communityIntelligenceDirectory.ts");
  const compilerDigest = read("convex/communityCompilerDigest.ts");
  const contract = read("docs/community-lineage-ontology-contract-v0.md");

  assertIncludes(evidence, 'query("communityAiFeedPosts" as any)', "recent canonical scan");
  assertIncludes(evidence, "const matches = recent.matches", "canonical lexical result set");
  assertIncludes(evidence, 'strategy: "bounded_lexical"', "canonical lexical diagnostics");
  assert.ok(!/vectorSearch|embedGemini|archiveAvailable|archiveError/.test(evidence), "AI Feed retrieval must not execute an embedding archive fallback");
  assertIncludes(evidence, "readCommunityAiFeedEvidenceItemsInternal", "archive canonical revalidation");
  assertIncludes(evidence, "retrieval_score", "retrieval relevance field");
  assertIncludes(evidence, "signal_score", "reaction signal field");
  assertIncludes(evidence, 'capability: "community_ai_feed_search"', "search audit");
  assertIncludes(evidence, 'capability: "community_ai_feed_read"', "read audit");
  assert.ok(!audit.includes("query: v.string()"), "retrieval audit must not accept raw query text");
  assertIncludes(schema, 'v.literal("community_ai_feed_search")', "AI Feed search audit capability");
  assertIncludes(schema, 'v.literal("community_ai_feed_read")', "AI Feed read audit capability");
  assertIncludes(aiFeed, "actorAgentKey: post.agentKey", "persisted agent identity only");
  assertIncludes(aiFeed, "Redaction changes readability, not source authorship", "redaction attribution boundary");
  assert.ok(
    !aiFeed.includes('post.agentKey ?? "community_agent"'),
    "AI Feed source trace must not fabricate community_agent",
  );
  assertIncludes(runtime, "executePolynetCanonicalTool", "native canonical dispatch");
  assertIncludes(mcp, "executePolynetCanonicalTool", "MCP canonical dispatch");
  assertIncludes(
    executor,
    "searchCommunityAiFeedEvidenceInternal",
    "canonical AI Feed search domain owner",
  );
  assertIncludes(
    executor,
    "readCommunityAiFeedEvidenceForToolInternal",
    "canonical AI Feed read domain owner",
  );
  assertIncludes(
    executor,
    "publishCanonicalPolynetAiFeedPostInternal",
    "canonical AI Feed write domain owner",
  );
  assert.ok(!mcp.includes("polynet_workspace_ai_feed_"));
  assertIncludes(directory, "upsertCommunitySourceTrace", "canonical source trace ledger");
  assertIncludes(compilerDigest, "selectedSourceTraceRows", "digest consumes canonical source traces once");
  assertIncludes(contract, "at most once", "lineage compiler invariant");
  console.log("PASS: canonical retrieval, metadata-only audit, attribution, and compiler dedupe are wired");
}

proveEvidenceReferenceAndLineage();
await proveCanonicalResolverFailsClosed();
proveToolSurfaces();
proveImplementationBoundaries();
console.log("community_ai_feed_evidence_spine_contract_proof: ok");
