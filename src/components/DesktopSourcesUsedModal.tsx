import { formatCommunityEvidenceTypeLabel } from "../../shared/communityEvidenceUi";
import type { SourcesUsedState } from "../controllers/desktop/useDesktopSourcesUsed";

type DesktopSourcesUsedModalProps = {
  sourcesUsed: SourcesUsedState;
  onClose: () => void;
};

function formatCommunitySourceStatus(ok: boolean | null, usedCount: number): string {
  if (ok === null) return "Unavailable";
  if (!ok) return "Failed";
  const count = Math.max(0, usedCount);
  return `OK (${count} item${count === 1 ? "" : "s"})`;
}

export function DesktopSourcesUsedModal(props: DesktopSourcesUsedModalProps) {
  const { sourcesUsed, onClose } = props;

  if (!sourcesUsed.open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Sources used</div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {sourcesUsed.isLoading && <div className="chat-loading"><div className="loading-spinner" /><span>Loading…</span></div>}
          {!sourcesUsed.isLoading && sourcesUsed.error && (
            <div className="auth-error">{sourcesUsed.error}</div>
          )}
          {!sourcesUsed.isLoading && !sourcesUsed.error && (
            <>
              {sourcesUsed.workspacePath && (
                <div className="resource-meta">
                  <span>Workspace</span>
                  <span>{sourcesUsed.workspacePath}</span>
                </div>
              )}
              {sourcesUsed.threadContext && (
                <>
                  <div className="panel-title">Thread context</div>
                  <div className="resource-meta">
                    <span>Lane</span>
                    <span>{sourcesUsed.threadContext.threadLane ?? "unknown"}</span>
                  </div>
                  <div className="resource-meta">
                    <span>Project</span>
                    <span>{sourcesUsed.threadContext.projectId ?? "none"}</span>
                  </div>
                  <div className="resource-meta">
                    <span>Community lens</span>
                    <span>{sourcesUsed.threadContext.communityId ?? "none"}</span>
                  </div>
                  <div className="resource-meta">
                    <span>Context version</span>
                    <span>
                      {typeof sourcesUsed.threadContext.contextVersion === "number"
                        ? sourcesUsed.threadContext.contextVersion
                        : "unknown"}
                    </span>
                  </div>
                </>
              )}
              {(sourcesUsed.communityContext || sourcesUsed.threadContext?.communityId) && (
                <>
                  <div className="panel-title">Community retrieval</div>
                  <div className="resource-meta">
                    <span>Community</span>
                    <span>
                      {sourcesUsed.communityContext?.communityId ??
                        sourcesUsed.threadContext?.communityId ??
                        "none"}
                    </span>
                  </div>
                  <div className="resource-meta">
                    <span>Injected into prompt</span>
                    <span>{sourcesUsed.communityContext?.injected ? "Yes" : "No"}</span>
                  </div>
                  <div className="resource-meta">
                    <span>Attempted retrieval</span>
                    <span>{sourcesUsed.communityContext?.attempted ? "Yes" : "No"}</span>
                  </div>
                  {sourcesUsed.communityContext?.failureClass && (
                    <div className="resource-meta">
                      <span>Failure class</span>
                      <span>{sourcesUsed.communityContext.failureClass}</span>
                    </div>
                  )}
                  {sourcesUsed.communityContext?.attempted && (
                    <>
                      <div className="resource-meta">
                        <span>Compiled source</span>
                        <span>
                          {formatCommunitySourceStatus(
                            sourcesUsed.communityContext.compiledFetchOk,
                            sourcesUsed.communityContext.compiledItemsUsed,
                          )}
                        </span>
                      </div>
                      <div className="resource-meta">
                        <span>Compile version</span>
                        <span>
                          {typeof sourcesUsed.communityContext.compileVersion === "number"
                            ? sourcesUsed.communityContext.compileVersion
                            : "unknown"}
                        </span>
                      </div>
                      <div className="resource-meta">
                        <span>Fallback used</span>
                        <span>
                          {sourcesUsed.communityContext.fallbackUsed === null
                            ? "Unknown"
                            : sourcesUsed.communityContext.fallbackUsed
                              ? "Yes"
                              : "No"}
                        </span>
                      </div>
                      <div className="resource-meta">
                        <span>Quality</span>
                        <span>
                          {sourcesUsed.communityContext.qualityBand
                            ? `${sourcesUsed.communityContext.qualityBand}${
                                typeof sourcesUsed.communityContext.qualityScore === "number"
                                  ? ` (${Math.round(sourcesUsed.communityContext.qualityScore)})`
                                  : ""
                              }`
                            : "Unknown"}
                        </span>
                      </div>
                      <div className="resource-meta">
                        <span>Latency</span>
                        <span>
                          {typeof sourcesUsed.communityContext.retrievalLatencyMs === "number"
                            ? `${Math.max(0, Math.round(sourcesUsed.communityContext.retrievalLatencyMs))} ms`
                            : "Unknown"}
                        </span>
                      </div>
                      {sourcesUsed.communityContext.contractId && (
                        <div className="resource-meta">
                          <span>Observability contract</span>
                          <span>{sourcesUsed.communityContext.contractId}</span>
                        </div>
                      )}
                      <div className="resource-meta">
                        <span>Chat source</span>
                        <span>
                          {formatCommunitySourceStatus(
                            sourcesUsed.communityContext.chatFetchOk,
                            sourcesUsed.communityContext.chatItemsUsed,
                          )}
                        </span>
                      </div>
                      <div className="resource-meta">
                        <span>Resource source</span>
                        <span>
                          {formatCommunitySourceStatus(
                            sourcesUsed.communityContext.resourceFetchOk,
                            sourcesUsed.communityContext.resourceItemsUsed,
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
              {sourcesUsed.communityEvidence && sourcesUsed.communityEvidence.items.length > 0 && (
                <>
                  <div className="panel-title">Community evidence</div>
                  {sourcesUsed.communityEvidence.items.map((item) => (
                    <div
                      key={`${item.source_type}:${item.source_id}:${item.rank}`}
                      className="resource-meta"
                    >
                      <span>{formatCommunityEvidenceTypeLabel(item.source_type)}</span>
                      <span>
                        {item.title}
                        {item.snippet ? `: ${item.snippet}` : ""}
                        {item.url ? ` (${item.url})` : ""}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <div className="panel-title">Personal memory</div>
              {sourcesUsed.personalMemory.length === 0 ? (
                <div className="chat-empty">No personal memory injected for this turn.</div>
              ) : (
                <div className="model-list">
                  {sourcesUsed.personalMemory.map((item) => (
                    <div key={item.id} className="model-toggle">
                      <span>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
