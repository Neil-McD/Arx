import type {
  HistoryUsedItem,
  MemorySuggestion,
  MemoryUsedItem,
} from "../../../../shared/messageMetadataUi";
import type { MessageContextModalPayload } from "../../../../shared/messageContextUi";
import { formatCommunityEvidenceTypeLabel } from "../../../../shared/communityEvidenceUi";

type WebMessageContextModalProps = {
  contextModal: MessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion> | null;
  hasSession: boolean;
  onClose: () => void;
  onSaveSuggestion: (item: MemorySuggestion) => Promise<void> | void;
};

export function WebMessageContextModal(props: WebMessageContextModalProps) {
  const {
    contextModal,
    hasSession,
    onClose,
    onSaveSuggestion,
  } = props;

  if (!contextModal) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Memory &amp; context</div>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {contextModal.memory_used.length === 0 &&
          contextModal.history_used.length === 0 &&
          contextModal.memory_suggestions.length === 0 &&
          contextModal.memory_added.length === 0 &&
          !contextModal.community_evidence ? (
            <div className="memory-block-empty">No memory or context is attached to this message.</div>
          ) : (
            <div className="memory-blocks">
              {contextModal.memory_added.length > 0 && (
                <>
                  <div className="memory-block-group-title">Memory updated</div>
                  <div className="memory-block-group">
                    {contextModal.memory_added.map((item) => (
                      <div key={item.id} className="memory-block read-only">
                        <div className="memory-block-header">
                          <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                        </div>
                        <div className="memory-block-desc">{item.content}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {contextModal.memory_used.length > 0 && (
                <>
                  <div className="memory-block-group-title">Memory used</div>
                  <div className="memory-block-group">
                    {contextModal.memory_used.map((item) => {
                      const updatedLabel = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "unknown";
                      return (
                        <div key={item.id} className="memory-block read-only">
                          <div className="memory-block-header">
                            <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                          </div>
                          <div className="memory-block-desc">{item.content}</div>
                          <div className="memory-block-meta">
                            {item.scope}
                            {item.scope_id ? `:${item.scope_id}` : ""}
                            {item.pinned ? " • pinned" : ""}
                            {item.updated_at ? ` • updated ${updatedLabel}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {contextModal.history_used.length > 0 && (
                <>
                  <div className="memory-block-group-title">Relevant history</div>
                  <div className="memory-block-group">
                    {contextModal.history_used.map((item) => (
                      <div key={item.message_id} className="memory-block read-only">
                        <div className="memory-block-header">
                          <div className="memory-block-label">Previous chat</div>
                        </div>
                        <div className="memory-block-desc">{item.snippet}</div>
                        {item.created_at && (
                          <div className="memory-block-meta">
                            {new Date(item.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {contextModal.community_evidence && (
                <>
                  <div className="memory-block-group-title">Community evidence</div>
                  <div className="memory-block-group">
                    {contextModal.community_evidence.items.map((item) => (
                      <div
                        key={`${item.source_type}:${item.source_id}:${item.rank}`}
                        className="memory-block read-only"
                      >
                        <div className="memory-block-header">
                          <div className="memory-block-label">
                            {formatCommunityEvidenceTypeLabel(item.source_type)}
                          </div>
                        </div>
                        <div className="memory-block-desc">
                          {item.title}
                          {item.snippet ? `: ${item.snippet}` : ""}
                        </div>
                        <div className="memory-block-meta">
                          {item.url ? ` • ${item.url}` : ""}
                          {typeof item.score === "number" ? ` • score ${item.score.toFixed(3)}` : ""}
                          {` • rank ${item.rank}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {contextModal.memory_suggestions.length > 0 && (
                <>
                  <div className="memory-block-group-title">Suggested memory</div>
                  <div className="memory-block-group">
                    {contextModal.memory_suggestions.map((item, idx) => (
                      <div key={`${item.content}-${idx}`} className="memory-block">
                        <div className="memory-block-header">
                          <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                          <div className="memory-block-actions">
                            <button
                              className="platform-save-button platform-save-button--compact"
                              type="button"
                              disabled={!hasSession}
                              onClick={() => void onSaveSuggestion(item)}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        <div className="memory-block-desc">{item.content}</div>
                        <div className="memory-block-meta">
                          {item.pinned ? "Pinned" : "Not pinned"}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
