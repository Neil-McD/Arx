import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixture = JSON.parse(
  readFileSync(join(root, "scripts/seeds/community-polynet-overview.example.json"), "utf8"),
);
const section = readFileSync(join(root, "apps/web/src/components/CommunityMemoryGraph.tsx"), "utf8");
const css = [
  readFileSync(join(root, "apps/web/src/base.css"), "utf8"),
  readFileSync(join(root, "apps/web/src/styles/community-and-content.css"), "utf8"),
].join("\n");

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
const resourceNodes = fixture.graph.nodes.filter((node: any) => node.kind === "resource_node");
const formingNodes = fixture.graph.nodes.filter((node: any) => node.kind === "forming_memory");
assert.equal(formingNodes.length, 0, "fixture should not project approval state as forming memory");
assert.ok(directoryNodes.length >= 5, "fixture should have enough real directory nodes to exercise the graph");
assert.equal(resourceNodes.length, 1, "fixture should include one canonical resource source node");
assert.deepEqual(
  new Set(directoryNodes.map((node: any) => node.type)),
  new Set(["playbook", "insight", "example", "warning_failure", "open_question"]),
  "fixture should exercise the primary member-facing directory categories",
);

const nodeIds = new Set(fixture.graph.nodes.map((node: any) => node.id));
for (const node of directoryNodes) {
  assert.match(node.id, /^directory_node:/, "directory graph node ids should be projected directory ids");
  assert.match(node.lineage_id, /^(change_request|directory_node):/, "directory nodes should expose stable lifecycle lineage");
  assert.ok(NODE_TYPES.has(node.type), `unexpected node type: ${node.type}`);
  assert.ok(ACCEPTED_STATUSES.has(node.status), `directory node should be accepted memory: ${node.status}`);
  assert.ok(!FORBIDDEN_STATUSES.has(node.status), `directory node should not expose airlock/dead status: ${node.status}`);
  assert.equal(typeof node.confidence, "number", "directory nodes should include confidence for selected-node detail");
  assert.equal(typeof node.evidence_strength, "string", "directory nodes should include evidence strength");
  assert.doesNotMatch(JSON.stringify(node), /body_md|source_trace_ids|outcome_observation_ids|raw_trace/i, "overview nodes should stay compact");
}

for (const node of resourceNodes) {
  assert.match(node.id, /^resource_node:/, "resource graph node ids should be stable projections");
  assert.match(node.lineage_id, /^resource:/, "resource nodes should expose canonical resource lineage");
  assert.equal(node.type, "resource", "resource nodes should retain their source ontology");
  assert.equal(node.status, "source", "resource nodes should not claim learned validation status");
  assert.equal(node.confidence, undefined, "resource nodes should not fabricate confidence");
  assert.equal(node.evidence_strength, undefined, "resource nodes should not fabricate evidence strength");
}

const memoryNodes = [...directoryNodes, ...resourceNodes];
assert.equal(fixture.memory.total_visible_nodes, memoryNodes.length, "visible memory count should include learned and source nodes");
assert.equal(fixture.memory.learned_node_count, directoryNodes.length, "learned count should match directory nodes");
assert.equal(fixture.memory.source_node_count, resourceNodes.length, "source count should match resource nodes");
const typeCountTotal = Object.values(fixture.memory.counts_by_type).reduce((sum: number, count: any) => sum + Number(count), 0);
const statusCountTotal = Object.values(fixture.memory.counts_by_status).reduce((sum: number, count: any) => sum + Number(count), 0);
assert.equal(typeCountTotal, memoryNodes.length, "type counts should match visible memory node count");
assert.equal(statusCountTotal, memoryNodes.length, "status counts should match visible memory node count");
assert.equal(fixture.graph.forming_node_limit, undefined, "fixture should not expose a forming approval-plane limit");
assert.equal(fixture.graph.has_more_forming_nodes, undefined, "fixture should not expose forming approval-plane truncation");
assert.equal(fixture.graph.edge_limit, 400, "fixture should expose the combined directory, derivation, and containment edge budget");
assert.deepEqual(
  Object.keys(fixture.agent.recent_actions_summary),
  ["applied"],
  "fixture should summarize only applied memory writes",
);

const directoryEdges = fixture.graph.edges.filter((edge: any) => edge.kind === "directory_edge");
const resourceEdges = fixture.graph.edges.filter((edge: any) => edge.kind === "resource_edge");
const resourceContainmentEdges = resourceEdges.filter((edge: any) => edge.type === "contains_resource");
const resourceDerivationEdges = resourceEdges.filter((edge: any) => edge.type === "derived_from");
assert.ok(directoryEdges.length >= 3, "fixture should have enough real directory edges to exercise the graph");
for (const edge of directoryEdges) {
  assert.equal(edge.kind, "directory_edge", "overview should expose only real directory edges");
  assert.ok(EDGE_TYPES.has(edge.type), `unexpected edge type: ${edge.type}`);
  assert.ok(nodeIds.has(edge.from), `edge.from should point to a projected graph node: ${edge.from}`);
  assert.ok(nodeIds.has(edge.to), `edge.to should point to a projected graph node: ${edge.to}`);
  assert.notEqual(edge.from, rootNodeId, "directory edge should not be invented from the synthetic root");
  assert.notEqual(edge.to, rootNodeId, "directory edge should not be invented to the synthetic root");
}
assert.equal(resourceContainmentEdges.length, 1, "fixture should connect its canonical resource to the community root once");
assert.equal(resourceContainmentEdges[0].from, rootNodeId, "resource projection edge should start at the community root");
assert.ok(nodeIds.has(resourceContainmentEdges[0].to), "resource projection edge should end at a visible resource node");
assert.equal(resourceDerivationEdges.length, 1, "fixture should project one truthful memory-to-resource provenance edge");
assert.match(resourceDerivationEdges[0].from, /^directory_node:/, "resource derivation should start at retained memory");
assert.match(resourceDerivationEdges[0].to, /^resource_node:/, "resource derivation should end at the canonical resource");
assert.ok(nodeIds.has(resourceDerivationEdges[0].from), "resource derivation should start at a visible node");
assert.ok(nodeIds.has(resourceDerivationEdges[0].to), "resource derivation should end at a visible node");
assert.doesNotMatch(JSON.stringify(resourceDerivationEdges[0]), /trace|source_trace/i, "resource derivation should not expose trace identity");

assert.doesNotMatch(
  JSON.stringify(fixture),
  /communityCompilerDigests|communitySourceTraces|communityIntelligenceChangeRequests|wakeEvidence|body_md|source_trace_ids/i,
  "seeded overview fixture should not expose compiler/raw trace/airlock internals",
);

assert.match(section, /function edgeClass/, "tab should classify edges by edge type");
assert.doesNotMatch(section, /statusClass\(edge\.type\)/, "tab should not classify typed edges as node statuses");
assert.match(css, /\.cp-edge\.supports/, "CSS should style support edges directly");
assert.match(css, /\.cp-edge\.contradicts/, "CSS should style contradiction edges directly");
assert.match(css, /\.cp-edge\.derived-from/, "CSS should distinguish resource provenance edges");
assert.doesNotMatch(css, /\.cp-forming-circle/, "CSS should not retain deleted forming-memory treatment");
assert.doesNotMatch(css, /\.community-polynet-meta\b|\.community-polynet-meta-error\b/, "old archive-panel CSS leftovers should be removed");

console.log("Community Polynet seeded overview fixture proof passed");
