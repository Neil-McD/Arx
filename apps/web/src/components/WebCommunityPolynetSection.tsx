import { useEffect, useMemo, useRef, useState } from "react";
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

function formatDateTime(raw: string | null | undefined): string {
  if (!raw) return "Never";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

function activityLabel(raw: string | null | undefined): string {
  switch (String(raw ?? "").trim()) {
    case "running":
      return "Running";
    case "updated_directory":
      return "Updated memory";
    case "reviewed_candidates":
      return "Reviewed candidates";
    case "proposed_candidates":
      return "Proposed candidates";
    case "error":
      return "Needs attention";
    case "not_started":
      return "Not started";
    case "resting":
    default:
      return "Resting";
  }
}

function selectInitialNode(overview: CloudCommunityPolynetOverview | null): string | null {
  if (!overview) return null;
  const firstDirectoryNode = overview.graph.nodes.find((node) => node.kind === "directory_node");
  return firstDirectoryNode?.id ?? overview.graph.root_node_id;
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
  const svgRef = useRef<SVGSVGElement | null>(null);

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
    () => computePolynetLayout(overview?.graph.nodes ?? [], overview?.graph.root_node_id ?? "community:pending"),
    [overview],
  );
  const nodeIds = useMemo(
    () => new Set((overview?.graph.nodes ?? []).map((node) => node.id)),
    [overview],
  );
  const { transform, isPanning, draggingNodeId, worldPositionFor, handlers, actions: viewportActions } =
    useWebPolynetGraphViewport({ svgRef, onSelectNode: setSelectedNodeId });
  const showAllLabels = transform.scale > SHOW_ALL_LABELS_SCALE;
  const selectedNode = overview?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const directoryNodeCount = overview?.graph.nodes.filter((node) => node.kind === "directory_node").length ?? 0;
  const topTypeCounts = Object.entries(overview?.memory.counts_by_type ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const recentRuns = overview?.agent.recent_runs ?? [];

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

  return (
    <div className="settings-panel community-settings-panel community-polynet-panel">
      <div className="community-polynet-header">
        <div>
          <div className="community-polynet-kicker">Polynet</div>
          <div className="community-polynet-title">
            {activeCommunityName ?? overview?.community.name ?? "Community"} memory
          </div>
          <div className="community-polynet-subtitle">
            Read-only view of what the community has retained and how its agent is currently behaving.
          </div>
        </div>
        <button className="secondary" type="button" onClick={actions.refresh} disabled={state.isLoading}>
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
            <div className={`community-polynet-graph${isPanning ? " panning" : ""}${draggingNodeId ? " dragging" : ""}`}>
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
                    const layoutPos = layout.get(node.id) ?? { x: 0, y: 0 };
                    const pos = worldPositionFor(node.id, layoutPos);
                    const isRoot = node.kind === "community";
                    const isSelected = selectedNodeId === node.id;
                    const isHovered = hoveredNodeId === node.id;
                    const showLabel = isRoot || isSelected || isHovered || showAllLabels;
                    return (
                      <g
                        key={node.id}
                        className={`cp-node ${isRoot ? "root" : statusClass(node.status)}${isSelected ? " selected" : ""}`}
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
                        {isSelected ? <circle className="cp-node-ring" r={isRoot ? 36 : 18} /> : null}
                        <circle
                          className={isRoot ? "cp-root-circle" : `cp-node-circle ${statusClass(node.status)}`}
                          r={isRoot ? 26 : 11}
                          filter="url(#cp-node-glow)"
                        />
                        {showLabel ? (
                          <g transform={`scale(${1 / transform.scale})`}>
                            <text
                              className={`cp-node-label${isRoot ? " root" : ""}`}
                              x={0}
                              y={isRoot ? 50 : 28}
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
            </div>
            <div className="community-polynet-graph-footer">
              <span>{directoryNodeCount} memory nodes</span>
              <span>{overview.graph.edges.length} edges</span>
              {overview.graph.has_more_nodes || overview.graph.has_more_edges ? <span>Bounded view</span> : null}
            </div>
          </section>

          <aside className="community-polynet-side">
            <section className="community-polynet-agent">
              <div className="community-polynet-section-label">Community agent</div>
              <div className={`community-polynet-agent-state ${statusClass(overview.agent.activity_state)}`}>
                {activityLabel(overview.agent.activity_state)}
              </div>
              <div className="community-polynet-agent-meta">
                <span>Last run</span>
                <strong>{formatDateTime(overview.agent.last_run_at)}</strong>
              </div>
              <div className="community-polynet-agent-meta">
                <span>Wake reason</span>
                <strong>{formatLabel(overview.agent.last_wake_reason ?? "none")}</strong>
              </div>
              <div className="community-polynet-action-grid">
                <div>
                  <span>Proposed</span>
                  <strong>{overview.agent.recent_actions_summary.proposed}</strong>
                </div>
                <div>
                  <span>Accepted</span>
                  <strong>{overview.agent.recent_actions_summary.accepted}</strong>
                </div>
                <div>
                  <span>Applied</span>
                  <strong>{overview.agent.recent_actions_summary.applied}</strong>
                </div>
              </div>
            </section>

            <section className="community-polynet-detail">
              <div className="community-polynet-section-label">Selected node</div>
              {!selectedNode ? (
                <div className="community-polynet-muted">Select a node to inspect it.</div>
              ) : selectedNode.kind === "community" ? (
                <>
                  <h3>{selectedNode.label}</h3>
                  <dl>
                    <div>
                      <dt>Visible memory</dt>
                      <dd>{overview.memory.total_visible_nodes}</dd>
                    </div>
                    <div>
                      <dt>Contested</dt>
                      <dd>{overview.memory.contested_count}</dd>
                    </div>
                    <div>
                      <dt>Stale</dt>
                      <dd>{overview.memory.stale_count}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <h3>{selectedNode.title ?? selectedNode.label}</h3>
                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd>{formatLabel(selectedNode.type)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{formatLabel(selectedNode.status)}</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{formatPercent(selectedNode.confidence)}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{formatLabel(selectedNode.evidence_strength)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDateTime(selectedNode.updated_at)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section className="community-polynet-memory">
              <div className="community-polynet-section-label">Memory mix</div>
              {topTypeCounts.length ? (
                <div className="community-polynet-type-list">
                  {topTypeCounts.map(([type, count]) => (
                    <div key={type}>
                      <span>{formatLabel(type)}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="community-polynet-muted">No promoted memory nodes yet.</div>
              )}
            </section>

            {recentRuns.length ? (
              <section className="community-polynet-runs">
                <div className="community-polynet-section-label">Recent runs</div>
                {recentRuns.slice(0, 3).map((run) => (
                  <div key={run.id} className="community-polynet-run-row">
                    <span>{activityLabel(run.activity_state)}</span>
                    <strong>{formatDateTime(run.started_at)}</strong>
                  </div>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
