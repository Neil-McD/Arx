import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const health = readFileSync(join(root, "convex/communityMemoryHealth.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

const probe = exportedFunctionBlock(health, "getCommunityMemoryHealthProbe");

assert.match(
  packageJson,
  /"check:community-memory-health-probe-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_memory_health_probe_contract_proof\.ts"/,
  "package scripts should expose the community memory health probe proof",
);

assert.match(probe, /export const getCommunityMemoryHealthProbe = query/, "probe should be a read-only Convex query");
assert.match(probe, /communityId: v\.id\("communities"\)/, "probe should be scoped to one explicit community");
assert.match(probe, /resolveUserIdForAuthenticatedRequest/, "probe should resolve the authenticated viewer");
assert.match(probe, /requireCommunityManager/, "probe should be manager-only");
assert.match(
  health,
  /import \{ measureCommunityCompilerEvidenceForCommunity \} from "\.\/communityCompilerEvidenceCore"/,
  "probe should reuse the compiler evidence gate measurement instead of inventing a parallel wake check",
);
assert.doesNotMatch(
  probe,
  /requireCommunityChatAccess|viewerCanManageCommunity/,
  "probe should not be available to ordinary members as a Polynet graph view",
);

for (const table of [
  "communityAgentConfigs",
  "userProviderConnections",
  "communitySourceTraces",
  "communityCompilerDigests",
  "communityAgentRuns",
  "communityIntelligenceChangeRequests",
  "communityIntelligenceNodes",
  "communityIntelligenceRetrievalLogs",
  "communityOutcomeObservations",
  "communityMemoryMetabolizerRuns",
]) {
  assert.match(health, new RegExp(`query\\("${table}"`), `probe should read ${table}`);
}

assert.match(
  probe,
  /query\("userProviderConnections"[\s\S]*withIndex\("by_user_provider"[\s\S]*eq\("userId", community\.ownerId\)\.eq\("provider", "chatgpt"\)/,
  "probe should mirror the owner-funded heartbeat's current ChatGPT connection gate without decrypting secrets",
);
assert.match(
  probe,
  /owner_chatgpt_connection_present: Boolean\(ownerChatgptConnection\?\.encryptedSecretHex\)/,
  "probe should expose only boolean owner connection presence",
);

assert.match(
  probe,
  /communitySourceTraces[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)/,
  "probe should read latest source trace through a bounded same-community index",
);
assert.match(
  probe,
  /communityCompilerDigests[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)/,
  "probe should read latest compiler digest through a bounded same-community index",
);
assert.match(
  probe,
  /measureCommunityCompilerEvidenceForCommunity\(\{[\s\S]*ctx,[\s\S]*communityId: args\.communityId,[\s\S]*nowMs,[\s\S]*\}\)/,
  "probe should report the same eligible pending evidence measurement used by the heartbeat gate",
);
assert.match(
  probe,
  /evidence: compilerEvidenceMeasurement/,
  "probe should include the compiler evidence measurement in the compiler section",
);
assert.match(
  health,
  /selected_trace_count: Array\.isArray\(raw\.selected_trace_ids\) \? raw\.selected_trace_ids\.length : 0/,
  "probe should expose selected trace count without leaking full selected trace evidence",
);
assert.match(
  probe,
  /communityAgentRuns[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(RECENT_RUN_LIMIT \* 2\)/,
  "probe should read recent agent runs through a bounded same-community index",
);
assert.match(
  health,
  /communityIntelligenceChangeRequests[\s\S]*withIndex\("by_community_status"[\s\S]*\.take\(CHANGE_REQUEST_COUNT_LIMIT\)/,
  "probe should count airlock rows using bounded same-community status reads",
);
assert.match(
  health,
  /communityIntelligenceNodes[\s\S]*withIndex\("by_community_status_updatedAt"[\s\S]*\.take\(DIRECTORY_COUNT_LIMIT\)/,
  "probe should count directory nodes using bounded same-community status reads",
);
assert.match(
  probe,
  /communityIntelligenceRetrievalLogs[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(RETRIEVAL_LOG_LIMIT\)/,
  "probe should read retrieval logs through a bounded same-community index",
);
assert.match(
  probe,
  /communityOutcomeObservations[\s\S]*withIndex\("by_community_observedAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(OUTCOME_LIMIT\)/,
  "probe should read outcomes through a bounded same-community index",
);
assert.match(
  probe,
  /communityMemoryMetabolizerRuns[\s\S]*withIndex\("by_community_finishedAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(METABOLIZER_RUN_LIMIT\)/,
  "probe should read metabolizer runs through a bounded same-community index",
);

assert.doesNotMatch(
  probe,
  /\.collect\(\)|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete|internalAction|mutation\(|runAction|runMutation|openai|generateText|modelId|prompt: v\.string/,
  "health probe v0 should be read-only, bounded, and should not call models or write state",
);

for (const flag of [
  "agent_disabled",
  "owner_chatgpt_connection_missing",
  "no_source_traces",
  "no_eligible_compiler_evidence",
  "compiler_evidence_below_threshold",
  "compiler_evidence_counts_lower_bound",
  "no_compiler_digest",
  "no_agent_run",
  "last_agent_run_failed",
  "pending_airlock_backlog",
  "no_directory_nodes",
  "directory_count_lower_bound",
  "no_retrieval_logs",
  "no_outcome_observations",
  "no_metabolizer_run",
  "last_metabolizer_failed",
]) {
  assert.match(probe, new RegExp(`"${flag}"`), `probe should emit ${flag}`);
}

assert.match(probe, /counts_are_lower_bound/, "probe should report when bounded counts are lower bounds");
assert.match(probe, /read_limits/, "probe should return its read limits for operator interpretation");

console.log("community_memory_health_probe_contract_proof: ok");
