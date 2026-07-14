import { useMemo } from "react";
import type { CloudCommunityPolynetOverview } from "../../../../shared/cloudCommunityPolynetGateway";
import {
  computeFitTransform,
  computePolynetBounds,
  computePolynetLayout,
} from "../../../../shared/communityPolynetGraphLayout";

// A static, non-interactive miniature of the community memory graph — the same
// force-clustered layout and type/status encoding as the full Polynet page, fit
// into the rail's Memory slot as a live constellation. Display only; the wrapping
// control handles opening the full graph.

const VIEW_W = 256;
const VIEW_H = 132;

function typeClass(raw: string | null | undefined): string {
  switch (String(raw ?? "").trim().toLowerCase()) {
    case "playbook": return "playbook";
    case "insight": return "insight";
    case "example": return "example";
    case "warning_failure": return "warning";
    case "decision_judgment": return "decision";
    case "open_question": return "question";
    default: return "default";
  }
}

function statusClass(raw: string | null | undefined): string {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === "canonical" || status === "validated") return "validated";
  if (status === "promising") return "promising";
  if (status === "contested") return "contested";
  if (status === "stale") return "stale";
  return "default";
}

function agentActivityClass(raw: string | null | undefined): string {
  const activity = String(raw ?? "").trim().toLowerCase();
  if (activity === "running") return "running";
  if (activity === "proposed_candidates" || activity === "reviewed_candidates") return "considering";
  if (activity === "updated_directory") return "updated-directory";
  if (activity === "error") return "error";
  return "resting";
}

function edgeClass(raw: string | null | undefined): string {
  const edgeType = String(raw ?? "").trim().toLowerCase();
  if (edgeType === "supports") return "supports";
  if (edgeType === "contradicts") return "contradicts";
  if (edgeType === "has_example") return "has-example";
  if (edgeType === "applies_to_workflow") return "applies-to-workflow";
  return "default";
}

function nodeRadius(confidence: unknown): number {
  const value = Number(confidence);
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.4;
  return 3.4 + clamped * 2.6;
}

export function CommunityMemoryGraphPreview(props: { overview: CloudCommunityPolynetOverview }) {
  const { overview } = props;

  const { layout, fit, nodeIds } = useMemo(() => {
    const nodes = overview.graph.nodes;
    const layoutMap = computePolynetLayout(nodes, overview.graph.root_node_id, overview.graph.edges);
    const bounds = computePolynetBounds(layoutMap);
    const fitTransform = computeFitTransform(bounds, { width: VIEW_W, height: VIEW_H }, {
      padding: 22,
      minScale: 0.04,
      maxScale: 1,
    });
    return { layout: layoutMap, fit: fitTransform, nodeIds: new Set(nodes.map((n) => n.id)) };
  }, [overview]);

  const project = (id: string) => {
    const pos = layout.get(id) ?? { x: 0, y: 0 };
    return { x: fit.tx + pos.x * fit.scale, y: fit.ty + pos.y * fit.scale };
  };

  return (
    <svg
      className="community-context-memory-graph"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Community memory graph preview"
    >
      {overview.graph.edges.map((edge) => {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return null;
        const from = project(edge.from);
        const to = project(edge.to);
        return (
          <line
            key={edge.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className={`cp-edge ${edgeClass(edge.type)}`}
          />
        );
      })}
      {overview.graph.nodes.map((node) => {
        const pos = project(node.id);
        const isRoot = node.kind === "community";
        const isForming = node.kind === "forming_memory";
        return (
          <circle
            key={node.id}
            cx={pos.x}
            cy={pos.y}
            r={isRoot ? 7 : isForming ? 3.2 : nodeRadius(node.confidence)}
            className={isRoot
              ? `cp-root-circle activity-${agentActivityClass(overview.agent.activity_state)}`
              : isForming
                ? "cp-forming-circle"
                : `cp-node-circle type-${typeClass(node.type)} status-${statusClass(node.status)}`}
          />
        );
      })}
    </svg>
  );
}
