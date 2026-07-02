import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const evidenceCore = read("convex/communityCompilerEvidenceCore.ts");
const directory = read("convex/communityIntelligenceDirectory.ts");
const digest = read("convex/communityCompilerDigest.ts");
const heartbeat = read("convex/communityAgentHeartbeat.ts");
const windowSource = read("convex/communityCompilerWindow.ts");
const inputs = read("convex/communityCompilerInputs.ts");

assert.match(
  packageJson,
  /"check:community-compiler-evidence-diet-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_compiler_evidence_diet_contract_proof\.ts"/,
  "package.json must expose the compiler evidence diet proof",
);

assert.match(
  schema,
  /compilerState: v\.optional\([\s\S]*v\.literal\("excluded_self_authored"\)/,
  "source trace compiler state must include a dedicated self-authored terminal state",
);

assert.match(
  evidenceCore,
  /COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY = "community_agent"/,
  "the self-authored boundary must be the canonical in-community agent key only",
);

assert.match(
  evidenceCore,
  /isCommunityAgentSelfAuthoredTrace[\s\S]*actorAgentKey[\s\S]*COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY/,
  "self-authored detection must key off actorAgentKey, not broad actorType",
);

assert.doesNotMatch(
  evidenceCore,
  /actorType\s*===\s*"agent"/,
  "compiler evidence diet must not exclude all agent-authored traces; personal agents can be member evidence",
);

assert.match(
  evidenceCore,
  /compilerStateForSourceTraceLifecycle[\s\S]*isCommunityAgentSelfAuthoredTrace\(args\)[\s\S]*return "excluded_self_authored"[\s\S]*compilerStateForSourceTraceVisibility/,
  "self-authored traces must be born terminal before visibility-derived pending classification",
);

assert.match(
  directory,
  /sourceTraceCompilerLifecyclePatch[\s\S]*compilerStateForSourceTraceLifecycle\(\{[\s\S]*actorAgentKey[\s\S]*nextState === "excluded_by_visibility" \|\| nextState === "excluded_self_authored"[\s\S]*compilerPendingSince: undefined/,
  "source trace upserts must use lifecycle classification and keep self-authored traces out of pending",
);

assert.match(
  evidenceCore,
  /legacyPendingRows = legacyRowsFetch\.filter\(\(row\) =>[\s\S]*row\.compilerState === undefined && isCommunityCompilerEvidenceTrace\(row\)/,
  "legacy rows must only count as pending when they are compiler evidence traces",
);

assert.match(
  evidenceCore,
  /\.filter\(\(row\) => compilerState\(row\) === "pending"\)[\s\S]*\.filter\(\(row\) => isCommunityCompilerEvidenceTrace\(row\)\)[\s\S]*const pending = traceRows\.map/,
  "measurement must exclude self-authored traces before priority classification, trigger counts, and selection",
);

assert.match(
  evidenceCore,
  /decideTrigger\(\{[\s\S]*totalCount: pending\.length/,
  "trigger computation must use the filtered pending evidence count",
);

assert.match(
  evidenceCore,
  /drainSelfAuthoredPendingSourceTracesForCommunity[\s\S]*compilerState", "pending"[\s\S]*isCommunityAgentSelfAuthoredTrace\(row\)[\s\S]*compilerState: "excluded_self_authored" as const[\s\S]*compilerPendingSince: undefined/,
  "digest-time drain must self-heal any existing pending community-agent traces",
);

assert.match(
  digest,
  /drainSelfAuthoredPendingSourceTracesForCommunity\(\{[\s\S]*communityId: args\.communityId[\s\S]*nowMs[\s\S]*\}\)[\s\S]*measureCommunityCompilerEvidenceForCommunity/,
  "digest pass must drain self-authored pending traces before measuring evidence",
);

assert.match(
  heartbeat,
  /drainSelfAuthoredPendingSourceTracesInternal[\s\S]*measureCommunityCompilerEvidenceInternal/,
  "heartbeat trigger measurement must drain self-authored pending traces before deciding whether to wake",
);

assert.match(
  windowSource,
  /isCommunityCompilerEvidenceTrace[\s\S]*sourceTraces = traceCandidateRows[\s\S]*\.filter\(\(row\) => isCommunityCompilerEvidenceTrace\(row\)\)/,
  "community compiler window must not present self-authored source traces as compiler input",
);

assert.match(
  inputs,
  /isCommunityCompilerEvidenceTrace[\s\S]*traceRows = traceCandidateRows[\s\S]*\.filter\(\(row\) => isCommunityCompilerEvidenceTrace\(row\)\)/,
  "manager compiler inputs must use the same source trace evidence diet",
);

console.log("community_compiler_evidence_diet_contract_proof: ok");
