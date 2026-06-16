import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixture = JSON.parse(
  readFileSync(join(root, "scripts/seeds/community-polynet-overview.example.json"), "utf8"),
);
const section = readFileSync(join(root, "apps/web/src/components/WebCommunityPolynetSection.tsx"), "utf8");
const css = readFileSync(join(root, "apps/web/src/base.css"), "utf8");

const ACCEPTED_STATUSES = new Set(["promising", "validated", "canonical", "contested", "stale"]);
const FORBIDDEN_STATUSES = new Set(["draft", "candidate", "archived", "deprecated"]);
const NODE_TYPES = new Set([
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
]);
const EDGE_TYPES = new Set(["supports", "contradicts", "has_example", "applies_to_workflow"]);

assert.equal(typeof fixture.community?.id, "string", "fixture should define one community id");
assert.equal(typeof fixture.community?.name, "string", "fixture should define one community name");
assert.equal(fixture.agent?.key, "community_agent", "fixture should model the canonical community agent only");
assert.ok(Array.isArray(fixture.agent?.recent_runs), "fixture should include recent community-agent runs");
assert.ok(fixture.agent.recent_runs.length >= 2, "fixture should include enough run history to exercise the activity panel");
for (const run of fixture.agent.recent_runs) {
  assert.equal(run.trigger_type, "heartbeat", "seeded runs should model heartbeat-driven community-agent activity");
}

const rootNodeId = fixture.graph?.root_node_id;
assert.equal(rootNodeId, `community:${fixture.community.id}`, "graph root should be a synthetic node for exactly this community");
assert.ok(Array.isArray(fixture.graph?.nodes), "fixture should include graph nodes");
assert.ok(Array.isArray(fixture.graph?.edges), "fixture should include graph edges");

const rootNodes = fixture.graph.nodes.filter((node: any) => node.kind === "community");
assert.equal(rootNodes.length, 1, "graph should have exactly one synthetic community root");
assert.equal(rootNodes[0].id, rootNodeId, "synthetic root node should match root_node_id");
assert.equal(rootNodes[0].community_id, fixture.community.id, "synthetic root should stay inside the fixture community");

const directoryNodes = fixture.graph.nodes.filter((node: any) => node.kind === "directory_node");
assert.ok(directoryNodes.length >= 5, "fixture should have enough real directory nodes to exercise the graph");
assert.deepEqual(
  new Set(directoryNodes.map((node: any) => node.type)),
  new Set(["playbook", "insight", "example", "warning_failure", "open_question"]),
  "fixture should exercise the primary member-facing directory categories",
);

const nodeIds = new Set(fixture.graph.nodes.map((node: any) => node.id));
for (const node of directoryNodes) {
  assert.match(node.id, /^directory_node:/, "directory graph node ids should be projected directory ids");
  assert.ok(NODE_TYPES.has(node.type), `unexpected node type: ${node.type}`);
  assert.ok(ACCEPTED_STATUSES.has(node.status), `directory node should be accepted memory: ${node.status}`);
  assert.ok(!FORBIDDEN_STATUSES.has(node.status), `directory node should not expose airlock/dead status: ${node.status}`);
  assert.equal(typeof node.confidence, "number", "directory nodes should include confidence for selected-node detail");
  assert.equal(typeof node.evidence_strength, "string", "directory nodes should include evidence strength");
  assert.doesNotMatch(JSON.stringify(node), /body_md|source_trace_ids|outcome_observation_ids|raw_trace/i, "overview nodes should stay compact");
}

assert.equal(fixture.memory.total_visible_nodes, directoryNodes.length, "visible memory count should match directory nodes");
const typeCountTotal = Object.values(fixture.memory.counts_by_type).reduce((sum: number, count: any) => sum + Number(count), 0);
const statusCountTotal = Object.values(fixture.memory.counts_by_status).reduce((sum: number, count: any) => sum + Number(count), 0);
assert.equal(typeCountTotal, directoryNodes.length, "type counts should match directory node count");
assert.equal(statusCountTotal, directoryNodes.length, "status counts should match directory node count");

assert.ok(fixture.graph.edges.length >= 3, "fixture should have enough real edges to exercise the graph");
for (const edge of fixture.graph.edges) {
  assert.equal(edge.kind, "directory_edge", "overview should expose only real directory edges");
  assert.ok(EDGE_TYPES.has(edge.type), `unexpected edge type: ${edge.type}`);
  assert.ok(nodeIds.has(edge.from), `edge.from should point to a projected graph node: ${edge.from}`);
  assert.ok(nodeIds.has(edge.to), `edge.to should point to a projected graph node: ${edge.to}`);
  assert.notEqual(edge.from, rootNodeId, "directory edge should not be invented from the synthetic root");
  assert.notEqual(edge.to, rootNodeId, "directory edge should not be invented to the synthetic root");
}

assert.doesNotMatch(
  JSON.stringify(fixture),
  /communityCompilerDigests|communitySourceTraces|communityIntelligenceChangeRequests|wakeEvidence|body_md|source_trace_ids/i,
  "seeded overview fixture should not expose compiler/raw trace/airlock internals",
);

assert.match(section, /function edgeClass/, "tab should classify edges by edge type");
assert.doesNotMatch(section, /statusClass\(edge\.type\)/, "tab should not classify typed edges as node statuses");
assert.match(css, /\.community-polynet-edge\.supports/, "CSS should style support edges directly");
assert.match(css, /\.community-polynet-edge\.contradicts/, "CSS should style contradiction edges directly");
assert.doesNotMatch(css, /\.community-polynet-meta\b|\.community-polynet-meta-error\b/, "old archive-panel CSS leftovers should be removed");

console.log("Community PolyNet seeded overview fixture proof passed");
