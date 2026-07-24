import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidence = readFileSync(join(root, "convex/communityCompilerEvidence.ts"), "utf8");
const evidenceCore = readFileSync(join(root, "convex/communityCompilerEvidenceCore.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(
  packageJson,
  /"check:community-compiler-evidence-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_compiler_evidence_contract_proof\.ts"/,
  "package scripts should expose the community compiler evidence proof",
);

assert.match(evidence, /export const measureCommunityCompilerEvidenceInternal = internalQuery/);
assert.doesNotMatch(evidence, /export const .* = query\(|export const .* = mutation\(|export const .* = action\(/);
assert.match(evidence, /measureCommunityCompilerEvidenceForCommunity/);
assert.doesNotMatch(`${evidence}\n${evidenceCore}`, /userId|authSubject|userPrompt|prompt: v\.string|agentKey/);

assert.match(evidenceCore, /COMPILER_EVIDENCE_BATCH_THRESHOLD = 8/);
assert.match(evidenceCore, /COMPILER_EVIDENCE_STRONG_THRESHOLD = 5/);
assert.match(evidenceCore, /COMPILER_EVIDENCE_AGE_THRESHOLD_MS = 72 \* 60 \* 60 \* 1000/);
assert.match(
  evidenceCore,
  /COMPILER_EVIDENCE_PACKET_LIMIT = 8[\s\S]*COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT = 12[\s\S]*COMPILER_EVIDENCE_RUN_LIMIT =[\s\S]*COMPILER_EVIDENCE_PACKET_LIMIT \* COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT/,
);
assert.match(evidenceCore, /COMPILER_EVIDENCE_SCAN_LIMIT = 500/);
assert.match(
  evidenceCore,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES = \["admin", "community", "public"\] as const/,
  "compiler evidence should define the eligible visibility scopes explicitly",
);

assert.match(
  evidenceCore,
  /type EvidencePriority = "standard" \| "strong" \| "critical"/,
  "evidence should use three simple priority tiers",
);
assert.match(
  evidenceCore,
  /row\.sourceType === "outcome" \|\| row\.sourceType === "feedback"[\s\S]*return "critical"/,
  "outcome and feedback evidence should be critical",
);
assert.doesNotMatch(
  evidenceCore,
  /containsCriticalLanguage/,
  "member-authored keywords must not escalate the compiler",
);
assert.match(
  evidenceCore,
  /row\.sourceType === "ai_feed"[\s\S]*row\.sourceType === "workflow_run"[\s\S]*row\.sourceType === "agent_run"[\s\S]*row\.sourceType === "transcript"[\s\S]*return "strong"/,
  "trusted feed, workflow, agent-run, and transcript evidence should be strong",
);

assert.match(
  evidenceCore,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES\.map\(\(visibilityScope\)[\s\S]*\.withIndex\("by_community_compilerState_visibility_pendingSince"[\s\S]*\.eq\("communityId", args\.communityId\)[\s\S]*\.eq\("compilerState", "pending"\)[\s\S]*\.eq\("visibilityScope", visibilityScope\)[\s\S]*\.order\("asc"\)[\s\S]*\.take\(COMPILER_EVIDENCE_SCAN_LIMIT \+ 1\)/,
  "measurement should read explicit pending source traces oldest-first inside eligible visibility scopes",
);
assert.match(
  evidenceCore,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES\.map\(\(visibilityScope\)[\s\S]*\.withIndex\("by_community_visibility_createdAt"[\s\S]*\.eq\("communityId", args\.communityId\)\.eq\("visibilityScope", visibilityScope\)[\s\S]*legacyPendingRows = legacyRowsFetch\.filter\(\(row\) =>[\s\S]*row\.compilerState === undefined && isCommunityCompilerEvidenceTrace\(row\)/,
  "measurement should treat legacy eligible non-self-authored source traces without compiler state as pending until handled",
);
assert.match(
  evidenceCore,
  /fetchHasMorePending =[\s\S]*pendingRowsByVisibility\.some\(\(rows\) => rows\.length > COMPILER_EVIDENCE_SCAN_LIMIT\)[\s\S]*legacyRowsByVisibility\.some\(\(rows\) => rows\.length > COMPILER_EVIDENCE_SCAN_LIMIT\)[\s\S]*hasMorePending = fetchHasMorePending \|\| eligibleTraceRows\.length > COMPILER_EVIDENCE_SCAN_LIMIT/,
  "scan-cap lower-bound reporting should be conservative whenever the bounded fetch may hide more rows",
);
assert.match(
  evidenceCore,
  /function compilerPendingSince\(row: SourceTraceRow\)[\s\S]*row\.compilerPendingSince[\s\S]*return row\.createdAt/,
  "measurement should use compilerPendingSince for backlog age with createdAt as legacy fallback",
);
assert.doesNotMatch(
  evidenceCore,
  /30 \* 24 \* 60 \* 60 \* 1000|COMPILER_WINDOW|windowStartedAtMs|COMMUNITY_COMPILER_WINDOW/,
  "measurement must not use the 30-day compiler context window as an eligibility cutoff",
);
assert.doesNotMatch(
  `${evidence}\n${evidenceCore}`,
  /latestDigest|lastCompiledAt|last_compiled_at|windowEndedAt/,
  "measurement should not treat compiler digest window timestamps as consumed-evidence cursors",
);
assert.match(
  evidenceCore,
  /reason !== "no_trigger"[\s\S]*pending_trace_total[\s\S]*has_more_pending[\s\S]*selected_packet_count[\s\S]*selected_trace_ids[\s\S]*selected_evidence_units[\s\S]*thresholds/,
  "measurement should return trigger state, selected ids, evidence units, and thresholds",
);
assert.match(
  schema,
  /communitySourceTraces: defineTable\(\{[\s\S]*compilerState: v\.optional\([\s\S]*v\.literal\("pending"\)[\s\S]*v\.literal\("compiled"\)[\s\S]*v\.literal\("dismissed_low_signal"\)[\s\S]*v\.literal\("carried_forward"\)[\s\S]*v\.literal\("excluded_by_visibility"\)[\s\S]*v\.literal\("excluded_self_authored"\)[\s\S]*compilerPendingSince: v\.optional\(v\.number\(\)\)[\s\S]*compilerLastHandledAt: v\.optional\(v\.number\(\)\)[\s\S]*compilerLastDigestId: v\.optional\(v\.id\("communityCompilerDigests"\)\)/,
  "source trace schema should store explicit compiler lifecycle state",
);
assert.match(
  schema,
  /\.index\("by_community_compilerState_visibility_pendingSince", \[[\s\S]*"communityId",[\s\S]*"compilerState",[\s\S]*"visibilityScope",[\s\S]*"compilerPendingSince",[\s\S]*\]\)/,
  "source trace schema should support visibility-aware pending-backlog reads by compiler state",
);
assert.match(
  schema,
  /\.index\("by_community_visibility_createdAt", \["communityId", "visibilityScope", "createdAt"\]\)/,
  "source trace schema should support visibility-aware legacy fallback reads",
);
assert.match(
  directory,
  /sourceTraceMaterialChanged[\s\S]*shouldMarkSourceTracePending[\s\S]*nextSourceTracePendingSince/,
  "source trace upserts should distinguish idempotent writes from material updates",
);
assert.match(
  directory,
  /sourceTraceCompilerLifecyclePatch[\s\S]*compilerStateForSourceTraceLifecycle[\s\S]*compilerState: nextState[\s\S]*compilerPendingSince: undefined[\s\S]*compilerState: "pending" as const[\s\S]*compilerPendingSince: nextSourceTracePendingSince/,
  "source trace lifecycle should exclude private/self-authored traces and reopen eligible material updates as pending",
);
assert.match(
  directory,
  /ctx\.db\.insert\("communitySourceTraces"[\s\S]*\.\.\.compilerLifecyclePatch[\s\S]*createdAt: args\.nowMs/,
  "new source traces should enter the compiler lifecycle through the visibility-aware lifecycle patch",
);
assert.match(
  directory,
  /scheduleCommunityCompilerEvaluation[\s\S]*runCommunityCompilerDigestPassInternal[\s\S]*requireTrigger: true/,
  "source trace transitions should schedule the deterministic compiler evaluator",
);
assert.match(
  directory,
  /if \(compilerLifecyclePatch\.compilerState === "pending"\) \{[\s\S]*scheduleCommunityCompilerEvaluation\(args\.ctx, args\.communityId\)/,
  "only lifecycle transitions that materially enter pending should schedule evaluation",
);
assert.match(
  docs,
  /Eleventh Implementation Slice[\s\S]*Evidence Unit \+ Priority Tier \+ Pending Backlog[\s\S]*`communitySourceTraces` own compiler lifecycle state/,
  "docs should describe the simple evidence measurement model",
);
assert.match(docs, /Private source traces use `compilerState: excluded_by_visibility`/);
assert.match(docs, /Community-agent-authored source traces are not compiler evidence/);
assert.match(docs, /pending selector must use visibility-aware indexes/);
assert.match(docs, /New eligible source traces enter with `compilerState: pending`/);
assert.match(docs, /does not use the 30-day compiler window as an eligibility cutoff/);

console.log("community_compiler_evidence_contract_proof: ok");
