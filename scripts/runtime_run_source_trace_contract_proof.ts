import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const threads = readFileSync(join(root, "convex/threads.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function functionBlock(source: string, functionName: string): string {
  const startToken = `function ${functionName}`;
  const asyncStartToken = `async function ${functionName}`;
  let start = source.indexOf(startToken);
  if (start === -1) start = source.indexOf(asyncStartToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + functionName.length);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + functionName.length);
  const nextExport = source.indexOf("\nexport const ", start + functionName.length);
  const nextCandidates = [nextFunction, nextAsyncFunction, nextExport].filter((value) => value !== -1);
  const end = nextCandidates.length > 0 ? Math.min(...nextCandidates) : source.length;
  return source.slice(start, end);
}

assert.match(
  packageJson,
  /"check:runtime-run-source-trace-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_run_source_trace_contract_proof\.ts"/,
  "package scripts should expose the runtime run source trace proof",
);
assert.match(
  directory,
  /export async function recordTrustedCommunitySourceTraceCore/,
  "directory should expose a reusable trusted source-trace core for backend product bridges",
);
assert.match(
  directory,
  /recordTrustedCommunitySourceTraceCore[\s\S]*community_source_trace_trusted_source_type_required[\s\S]*community_source_trace_actor_user_required[\s\S]*requireOutcomeIdsBelongToCommunity[\s\S]*allowExistingUpdate: true/,
  "trusted source-trace core should preserve source type, human provenance, outcome, and idempotence guards",
);
assert.match(
  threads,
  /import \{ recordTrustedCommunitySourceTraceCore \} from "\.\/communityIntelligenceDirectory";/,
  "runtime finalization should use the trusted source-trace core, not the public source trace mutation",
);
assert.match(
  threads,
  /async function resolveRuntimeRunCanonicalCommunityLens[\s\S]*const threadCommunityId = normalizeIdValue\(args\.thread\.communityId\)[\s\S]*requestedCommunityId !== threadCommunityId[\s\S]*runtime_run_community_lens_mismatch[\s\S]*validateThreadCommunityLensAccess/,
  "runtime runs should derive community scope from the server-validated thread lens, not caller input",
);
assert.match(
  threads,
  /resolveRuntimeRunCanonicalCommunityLens[\s\S]*runtime_run_community_context_version_conflict/,
  "runtime runs should reject stale community lens context versions",
);
assert.match(
  threads,
  /const runId = normalizeRunId\(args\.runId\)[\s\S]*const existing = await getRuntimeRunByOwnerRunId\([\s\S]*if \(existing\) \{[\s\S]*assertRuntimeRunMatchesRequestedCommunityLens\([\s\S]*return existing;[\s\S]*const runtimeCommunityLens = await resolveRuntimeRunCanonicalCommunityLens\([\s\S]*requestedCommunityId: args\.communityId[\s\S]*requestedContextVersion: args\.communityContextVersion/,
  "existing runtime runs should keep their started lens while new runs treat caller community arguments as start-time consistency assertions",
);
assert.match(
  threads,
  /function assertRuntimeRunMatchesRequestedCommunityLens[\s\S]*requestedCommunityId !== runCommunityId[\s\S]*runtime_run_community_lens_mismatch[\s\S]*runtime_run_community_context_version_conflict/,
  "existing runtime runs should validate caller assertions against the stored run lens, not the mutable thread lens",
);
assert.match(
  threads,
  /const communityId = runtimeCommunityLens\.communityId[\s\S]*const communityContextVersion = runtimeCommunityLens\.communityContextVersion/,
  "runtime run rows should store only the canonical thread community lens",
);
assert.doesNotMatch(
  threads,
  /const communityId = args\.communityId;/,
  "runtime run rows must not store a caller-provided community id directly",
);

const traceSummaryBlock = functionBlock(threads, "buildRuntimeRunSourceTraceSummary");
assert.match(
  traceSummaryBlock,
  /Runtime agent run finished with status/,
  "runtime source trace summary should describe terminal execution status",
);
assert.match(
  traceSummaryBlock,
  /Message content, tool arguments, raw error details, and raw runtime transcript are intentionally excluded/,
  "runtime source traces should not include raw prompts, messages, tool args, or transcripts",
);
assert.doesNotMatch(
  traceSummaryBlock,
  /Error message:/,
  "runtime source traces should not include raw provider/runtime error messages",
);

const traceWriterBlock = functionBlock(threads, "recordRuntimeRunCommunitySourceTraceBestEffort");
assert.match(
  traceWriterBlock,
  /const runCommunityId = normalizeIdValue\(args\.run\.communityId\)[\s\S]*if \(!runCommunityId\) return;[\s\S]*communityId: runCommunityId/,
  "runtime run evidence should write to the immutable run community lens captured at run start",
);
assert.doesNotMatch(
  traceWriterBlock,
  /args\.thread\.communityId|runCommunityId !== threadCommunityId|validateThreadCommunityLensAccess/,
  "runtime run evidence should not reconsult the mutable current thread lens during finalization",
);
assert.match(
  traceWriterBlock,
  /recordTrustedCommunitySourceTraceCore\([\s\S]*sourceType: "agent_run"[\s\S]*sourceId: `runtime_run:\$\{normalizeRunId\(args\.run\.runId\)\}`/,
  "runtime run evidence should use stable agent_run source ids",
);
assert.match(
  traceWriterBlock,
  /visibilityScope: "admin"[\s\S]*sourceVisibility: "redacted"/,
  "runtime run evidence should default to restricted/redacted visibility",
);
assert.match(
  traceWriterBlock,
  /actorType: "agent"[\s\S]*actorUserId: args\.ownerId[\s\S]*actorAgentKey: "runtime_run_finalizer"/,
  "runtime run evidence should preserve user-owned agent provenance",
);
assert.match(
  traceWriterBlock,
  /try \{[\s\S]*recordTrustedCommunitySourceTraceCore[\s\S]*\} catch \{/,
  "runtime source trace capture should be best-effort so memory evidence cannot break run finalization",
);

const finalizerBlock = functionBlock(threads, "finalizeRuntimeRunRecord");
assert.match(
  finalizerBlock,
  /const updated = \(await args\.ctx\.db\.get\(run\._id\)\)[\s\S]*recordRuntimeRunCommunitySourceTraceBestEffort\([\s\S]*run: updated[\s\S]*return updated/,
  "runtime finalization should write evidence after terminal runtime state is authoritative",
);
assert.doesNotMatch(
  threads,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.insert\("communityIntelligenceEdges"|ctx\.db\.patch\([^)]*communityIntelligenceNodes|ctx\.db\.patch\([^)]*communityIntelligenceEdges/,
  "runtime finalization should not mutate directory truth directly",
);
assert.match(
  docs,
  /Eighth Implementation Slice[\s\S]*Runtime run finalization[\s\S]*trusted `agent_run` source trace[\s\S]*execution evidence, not directory truth[\s\S]*server-validated thread community lens[\s\S]*single-community evidence[\s\S]*redaction controls source exposure, not compiler perception/,
  "docs should describe runtime run source traces as single-community execution evidence and redacted compiler input",
);
assert.match(
  docs,
  /community memory is single-community only; cross-community memory\/intelligence is out of scope and must not be reachable from this system/,
  "docs should forbid cross-community memory in the community cognition system",
);
assert.doesNotMatch(
  docs,
  /cross-community learning must be anonymized and explicitly allowed|automatic cross-community learning/,
  "docs should not preserve an allowed cross-community learning path",
);

console.log("runtime_run_source_trace_contract_proof: ok");
