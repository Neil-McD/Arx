import type { CloudCommunityArchiveHealthRow } from "../../../../shared/cloudCommunityAdminGateway";

type WebCommunityPolynetSectionProps = {
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  hasSession: boolean;
  canManagePolynet: boolean;
  onRequireSignIn: () => void;
  state: {
    health: CloudCommunityArchiveHealthRow | null;
    isLoading: boolean;
    error: string | null;
    isBackfilling: boolean;
    isProcessingPending: boolean;
    isRetrying: boolean;
  };
  actions: {
    refresh: () => void;
    backfill: () => void;
    processPending: () => void;
    retryFailed: () => void;
  };
};

function formatPolynetNote(raw: string | null): string | null {
  const message = String(raw ?? "").trim();
  if (!message) return null;
  if (message.includes("Could not find public function")) {
    return "Polynet backend changes are not live in Convex yet.";
  }
  return message;
}

export function WebCommunityPolynetSection(props: WebCommunityPolynetSectionProps) {
  const {
    hasActiveCommunity,
    activeCommunityName,
    hasSession,
    canManagePolynet,
    onRequireSignIn,
    state,
    actions,
  } = props;

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

  if (!canManagePolynet) {
    return (
      <div className="settings-panel community-settings-panel">
        <div className="chat-empty">Only owners and admins can manage Polynet.</div>
      </div>
    );
  }

  const health = state.health;
  const polynetNote = formatPolynetNote(state.error);

  return (
    <div className="settings-panel community-settings-panel community-polynet-panel">
      <div className="community-polynet-header">
        <div className="community-polynet-kicker">
          Polynet
        </div>
        <div className="community-polynet-title">
          Community archive and retrieval health for {activeCommunityName ?? "this community"}.
        </div>
        <div className="community-polynet-subtitle">
          Backfill and process pending documents here to make archive memory searchable.
        </div>
      </div>

      <div className="community-polynet-actions">
        <button className="secondary" type="button" onClick={actions.refresh} disabled={state.isLoading}>
          {state.isLoading ? "Refreshing…" : "Refresh"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={actions.backfill}
          disabled={state.isBackfilling || state.isProcessingPending || state.isRetrying}
        >
          {state.isBackfilling ? "Backfilling…" : "Backfill archive"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={actions.processPending}
          disabled={state.isProcessingPending || state.isBackfilling || state.isRetrying}
        >
          {state.isProcessingPending ? "Processing…" : "Process pending"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={actions.retryFailed}
          disabled={state.isRetrying || state.isBackfilling || state.isProcessingPending}
        >
          {state.isRetrying ? "Retrying…" : "Retry failed"}
        </button>
      </div>

      {polynetNote ? (
        <div className="community-polynet-note">{polynetNote}</div>
      ) : null}

      {!health && state.isLoading ? (
        <div className="chat-empty">Loading Polynet health…</div>
      ) : !health ? (
        <div className="chat-empty">No archive health is available yet. Run a backfill to start indexing this community.</div>
      ) : (
        <>
          <div className="community-polynet-stat-grid">
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Total docs</div>
              <div className="community-polynet-stat-value community-polynet-stat-value-lg">{health.total_documents}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Pending</div>
              <div className="community-polynet-stat-value community-polynet-stat-value-lg">{health.status_counts.pending}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Embedded</div>
              <div className="community-polynet-stat-value community-polynet-stat-value-lg">{health.status_counts.embedded}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Failed</div>
              <div className="community-polynet-stat-value community-polynet-stat-value-lg">{health.status_counts.failed}</div>
            </div>
          </div>

          <div className="community-polynet-stat-grid community-polynet-stat-grid-secondary">
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Chat docs</div>
              <div className="community-polynet-stat-value">{health.source_counts.chat}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">AI Feed docs</div>
              <div className="community-polynet-stat-value">{health.source_counts.ai_feed}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">Resource docs</div>
              <div className="community-polynet-stat-value">{health.source_counts.resource}</div>
            </div>
            <div className="community-polynet-stat-card">
              <div className="community-polynet-stat-label">PDF docs</div>
              <div className="community-polynet-stat-value">{health.pdf_counts.pdf_documents}</div>
            </div>
          </div>

          <div className="community-polynet-meta">
            <div>
              Last embedded: {health.last_embedding_updated_at ? health.last_embedding_updated_at : "Never"}
            </div>
            {health.latest_failure_message ? (
              <div className="community-polynet-meta-error">
                Latest failure: {health.latest_failure_message}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
