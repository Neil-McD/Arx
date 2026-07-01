import { useEffect, useMemo, useState } from "react";
import type {
  CloudCommunityPolynetOverview,
} from "../../../../shared/cloudCommunityPolynetGateway";
import { computePolynetLayout } from "../../../../shared/communityPolynetGraphLayout";
import { useWebPolynetGraphViewport } from "../controllers/useWebPolynetGraphViewport";

type WebCommunityPolynetSectionProps = {
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  hasSession: boolean;
  canViewPolynet: boolean;
  onRequireSignIn: () => void;
  onBackToChat?: () => void;
  state: {
    overview: CloudCommunityPolynetOverview | null;
    isLoading: boolean;
    error: string | null;
  };
  actions: {
    refresh: () => void;
  };
};

// Labels stay readable regardless of zoom once the viewport passes this scale.
const SHOW_ALL_LABELS_SCALE = 1.4;

function formatLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Untitled";
  return value.replace(/_/g, " ");
}

function formatPercent(raw: unknown): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function shortNodeLabel(raw: string | null | undefined): string {
  const value = formatLabel(raw);
  return value.length > 34 ? `${value.slice(0, 31).trim()}...` : value;
}

function statusClass(raw: string | null | undefined): string {
  const status = String(raw ?? "").trim().toLowerCase();
  if (status === "canonical" || status === "validated") return "validated";
  if (status === "promising") return "promising";
  if (status === "contested") return "contested";
  if (status === "stale") return "stale";
  return "default";
}

function edgeClass(raw: string | null | undefined): string {
  const edgeType = String(raw ?? "").trim().toLowerCase();
  if (edgeType === "supports") return "supports";
  if (edgeType === "contradicts") return "contradicts";
  if (edgeType === "has_example") return "has-example";
  if (edgeType === "applies_to_workflow") return "applies-to-workflow";
  return "default";
}

// Node color family by memory type (the primary categorical encoding).
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

// Node radius scales with confidence so stronger memory reads as heavier.
function nodeRadius(confidence: unknown): number {
  const value = Number(confidence);
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.4;
  return 9 + clamped * 7;
}

function selectInitialNode(overview: CloudCommunityPolynetOverview | null): string | null {
  if (!overview) return null;
  // Prefer a real memory node; never auto-select the seed, so it stays a bare dot.
  const firstDirectoryNode = overview.graph.nodes.find((node) => node.kind === "directory_node");
  return firstDirectoryNode?.id ?? null;
}

export function WebCommunityPolynetSection(props: WebCommunityPolynetSectionProps) {
  const {
    hasActiveCommunity,
    activeCommunityName,
    hasSession,
    canViewPolynet,
    onRequireSignIn,
    state,
    actions,
  } = props;
  const overview = state.overview;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!overview) {
      setSelectedNodeId(null);
      return;
    }
    const nodeExists = selectedNodeId
      ? overview.graph.nodes.some((node) => node.id === selectedNodeId)
      : false;
    if (!nodeExists) setSelectedNodeId(selectInitialNode(overview));
  }, [overview, selectedNodeId]);

  const layout = useMemo(
    () => computePolynetLayout(
      overview?.graph.nodes ?? [],
      overview?.graph.root_node_id ?? "community:pending",
      overview?.graph.edges ?? [],
    ),
    [overview],
  );
  const nodeIds = useMemo(
    () => new Set((overview?.graph.nodes ?? []).map((node) => node.id)),
    [overview],
  );
  // Adjacency for the Obsidian-style hover highlight: hovering a node lights it and
  // its direct neighbors and fades the rest.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of overview?.graph.edges ?? []) {
      if (!map.has(edge.from)) map.set(edge.from, new Set());
      if (!map.has(edge.to)) map.set(edge.to, new Set());
      map.get(edge.from)!.add(edge.to);
      map.get(edge.to)!.add(edge.from);
    }
    return map;
  }, [overview]);
  const { containerRef, svgRef, transform, isPanning, draggingNodeId, worldPositionFor, handlers, actions: viewportActions } =
    useWebPolynetGraphViewport({ layout, onSelectNode: setSelectedNodeId });
  const showAllLabels = transform.scale > SHOW_ALL_LABELS_SCALE;
  const selectedNode = overview?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const directoryNodeCount = overview?.graph.nodes.filter((node) => node.kind === "directory_node").length ?? 0;
  const focusNeighbors = hoveredNodeId ? adjacency.get(hoveredNodeId) ?? null : null;
  // Only dim when the hovered node actually has neighbors to focus. Hovering the
  // community root (which has no edges) or an orphan node should not fade the graph.
  const hasFocus = Boolean(hoveredNodeId && focusNeighbors && focusNeighbors.size > 0);

  if (!hasActiveCommunity) {
    return <div className="settings-panel community-settings-panel"><div className="chat-empty">Select a community to open Polynet.</div></div>;
  }

  if (!hasSession) {
    return (
      <div className="settings-panel community-settings-panel">
        <div className="chat-empty">
          <div>Sign in to access Polynet.</div>
          <button className="secondary" type="button" onClick={onRequireSignIn} style={{ marginTop: 12 }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (!canViewPolynet) {
    return (
      <div className="settings-panel community-settings-panel">
        <div className="chat-empty">You do not have access to this community memory.</div>
      </div>
    );
  }

  const hasBackToChat = Boolean(props.onBackToChat);

  return (
    <div className="settings-panel community-settings-panel community-polynet-panel">
      <div className={`community-polynet-header${hasBackToChat ? " has-back" : ""}`}>
        {hasBackToChat ? (
          <button
            className="community-polynet-back"
            type="button"
            aria-label="Back to community chat"
            title="Back to chat"
            onClick={props.onBackToChat}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : null}
        <div className="community-polynet-heading">
          <div className="community-polynet-kicker">Polynet</div>
          <div className="community-polynet-title">
            {activeCommunityName ?? overview?.community.name ?? "Community"} memory
          </div>
          <div className="community-polynet-subtitle">
            Read-only view of what the community has retained and how its agent is currently behaving.
          </div>
        </div>
        <button className="secondary community-polynet-refresh" type="button" onClick={actions.refresh} disabled={state.isLoading}>
          {state.isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {state.error ? (
        <div className="community-polynet-note">{state.error}</div>
      ) : null}

      {!overview && state.isLoading ? (
        <div className="chat-empty">Loading Polynet memory...</div>
      ) : !overview ? (
        <div className="chat-empty">No Polynet overview is available yet.</div>
      ) : (
        <div className="community-polynet-layout">
          <section className="community-polynet-graph-shell" aria-label="Community memory graph">
            <div
              ref={containerRef}
              className={`community-polynet-graph${isPanning ? " panning" : ""}${draggingNodeId ? " dragging" : ""}`}
            >
              <svg
                ref={svgRef}
                className="community-polynet-graph-canvas"
                role="application"
                aria-label="Community memory graph canvas"
                onPointerDown={handlers.onBackgroundPointerDown}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
              >
                <defs>
                  <filter id="cp-node-glow" x="-120%" y="-120%" width="340%" height="340%">
                    <feGaussianBlur stdDeviation="3.4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.scale})`}>
                  {overview.graph.edges.map((edge) => {
                    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return null;
                    const from = worldPositionFor(edge.from, layout.get(edge.from));
                    const to = worldPositionFor(edge.to, layout.get(edge.to));
                    const touchesFocus = hasFocus
                      ? edge.from === hoveredNodeId || edge.to === hoveredNodeId
                      : false;
                    const dimmed = hasFocus ? !touchesFocus : false;
                    return (
                      <line
                        key={edge.id}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        className={`cp-edge ${edgeClass(edge.type)}${touchesFocus ? " active" : ""}${dimmed ? " dimmed" : ""}`}
                      />
                    );
                  })}
                  {overview.graph.nodes.map((node) => {
                    const layoutPos = layout.get(node.id) ?? { x: 0, y: 0 };
                    const pos = worldPositionFor(node.id, layoutPos);
                    const isRoot = node.kind === "community";
                    const isSelected = selectedNodeId === node.id;
                    const isHovered = hoveredNodeId === node.id;
                    const isNeighbor = focusNeighbors ? focusNeighbors.has(node.id) : false;
                    const dimmed = hasFocus ? !(isHovered || isNeighbor) : false;
                    const showLabel = isRoot || isSelected || isHovered || isNeighbor || showAllLabels;
                    const radius = isRoot ? 26 : nodeRadius(node.confidence);
                    return (
                      <g
                        key={node.id}
                        className={`cp-node ${isRoot ? "root" : statusClass(node.status)}${isSelected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                        transform={`translate(${pos.x} ${pos.y})`}
                        role="button"
                        tabIndex={0}
                        aria-label={node.label}
                        onPointerDown={handlers.makeNodePointerDownHandler(node.id, layoutPos)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedNodeId(node.id);
                          }
                        }}
                      >
                        {isSelected && !isRoot ? <circle className="cp-node-ring" r={radius + 7} /> : null}
                        <circle
                          className={isRoot ? "cp-root-circle" : `cp-node-circle type-${typeClass(node.type)} status-${statusClass(node.status)}`}
                          r={radius}
                          filter="url(#cp-node-glow)"
                        />
                        {showLabel ? (
                          <g transform={`scale(${1 / transform.scale})`}>
                            <text
                              className={`cp-node-label${isRoot ? " root" : ""}`}
                              x={0}
                              y={isRoot ? 50 : radius + 16}
                              textAnchor="middle"
                            >
                              {isRoot ? node.label : shortNodeLabel(node.label)}
                            </text>
                          </g>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              </svg>
              {directoryNodeCount === 0 ? (
                <div className="community-polynet-empty-graph">
                  Community memory starts as the agent promotes real patterns.
                </div>
              ) : null}
              <div className="community-polynet-graph-controls">
                <button type="button" onClick={viewportActions.zoomOut} aria-label="Zoom out">&minus;</button>
                <button type="button" onClick={viewportActions.resetView} aria-label="Reset view">Reset</button>
                <button type="button" onClick={viewportActions.zoomIn} aria-label="Zoom in">+</button>
              </div>
              {selectedNode && selectedNode.kind !== "community" ? (
                <div className="community-polynet-detail">
                  <div className="community-polynet-detail-title">{selectedNode.title ?? selectedNode.label}</div>
                  <div className="community-polynet-detail-meta">
                    <span>{formatLabel(selectedNode.type)}</span>
                    <span>{formatLabel(selectedNode.status)}</span>
                    <span>{formatPercent(selectedNode.confidence)} confidence</span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
