import { useEffect, useMemo, useState } from "react";
import type {
  CloudCommunityPolynetOverview,
  CloudCommunityPolynetOverviewNode,
} from "../../../../shared/cloudCommunityPolynetGateway";

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

type GraphPosition = {
  x: number;
  y: number;
};

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

function buildGraphPositions(nodes: CloudCommunityPolynetOverviewNode[], rootNodeId: string): Map<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  positions.set(rootNodeId, { x: 50, y: 50 });
  const directoryNodes = nodes.filter((node) => node.kind === "directory_node");
  const innerCount = Math.min(directoryNodes.length, directoryNodes.length > 18 ? 12 : directoryNodes.length);
  const outerCount = Math.max(0, directoryNodes.length - innerCount);

  directoryNodes.forEach((node, index) => {
    const isOuter = outerCount > 0 && index >= innerCount;
    const ringIndex = isOuter ? index - innerCount : index;
    const ringCount = isOuter ? outerCount : Math.max(1, innerCount);
    const radius = isOuter ? 43 : directoryNodes.length > 8 ? 31 : 35;
    const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;
    positions.set(node.id, {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
    });
  });

  return positions;
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

  const positions = useMemo(
    () => buildGraphPositions(overview?.graph.nodes ?? [], overview?.graph.root_node_id ?? "community:pending"),
    [overview],
  );
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
            <div className="community-polynet-graph">
              <svg className="community-polynet-graph-lines" viewBox="0 0 100 100" aria-hidden="true">
                {overview.graph.edges.map((edge) => {
                  const from = positions.get(edge.from);
                  const to = positions.get(edge.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      className={`community-polynet-edge ${edgeClass(edge.type)}`}
                    />
                  );
                })}
              </svg>
              {overview.graph.nodes.map((node) => {
                const position = positions.get(node.id) ?? { x: 50, y: 50 };
                const isRoot = node.kind === "community";
                const isSelected = selectedNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`community-polynet-node ${isRoot ? "root" : statusClass(node.status)}${isSelected ? " selected" : ""}`}
                    style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    onClick={() => setSelectedNodeId(node.id)}
                    title={node.label}
                  >
                    <span className="community-polynet-node-dot" aria-hidden="true" />
                    {isRoot ? (
                      <span className="community-polynet-root-label">{shortNodeLabel(node.label)}</span>
                    ) : null}
                  </button>
                );
              })}
              {directoryNodeCount === 0 ? (
                <div className="community-polynet-empty-graph">
                  Community memory starts as the agent promotes real patterns.
                </div>
              ) : null}
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
