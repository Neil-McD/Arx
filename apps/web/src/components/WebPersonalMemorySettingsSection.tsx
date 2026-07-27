type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type PersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type WebPersonalMemorySettingsSectionProps = {
  session: SessionLike;
  error: string | null;
  isLoading: boolean;
  items: PersonalMemoryItem[];
  query: string;
  setQuery: (value: string) => void;
  loadItems: () => Promise<void> | void;
  formatRelativeTime: (value: string) => string;
  togglePinned: (item: PersonalMemoryItem) => Promise<void> | void;
  deleteItem: (id: string) => Promise<void> | void;
  newContent: string;
  setNewContent: (value: string) => void;
  createItem: () => Promise<void> | void;
};

export function WebPersonalMemorySettingsSection(
  props: WebPersonalMemorySettingsSectionProps,
) {
  const {
    session,
    error,
    isLoading,
    items,
    query,
    setQuery,
    loadItems,
    formatRelativeTime,
    togglePinned,
    deleteItem,
    newContent,
    setNewContent,
    createItem,
  } = props;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        Personal memory
      </div>
      <div className="settings-section-desc">
        Review and control private context available to your personal agent.
      </div>
      {error ? <div className="memory-error">{error}</div> : null}
      {!session ? (
        <div className="model-note">
          Sign in to review personal memory.
        </div>
      ) : (
        <>
          <div className="memory-editor">
            <div className="memory-editor-header">
              <div className="memory-editor-title">Saved memory</div>
              <div className="memory-editor-meta">
                {isLoading
                  ? "loading…"
                  : `${items.length} item${items.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memory…"
            />
            <div className="memory-editor-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setQuery("");
                  void loadItems();
                }}
                disabled={isLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="memory-block-group">
            {items.length === 0 ? (
              <div className="memory-block-empty">
                No personal memory items yet.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="memory-block">
                  <div className="memory-block-header">
                    <div className="memory-block-label">{item.content}</div>
                    <div className="memory-block-actions">
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void togglePinned(item)}
                        disabled={isLoading}
                      >
                        {item.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void deleteItem(item.id)}
                        disabled={isLoading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="memory-block-meta">
                    {item.scope === "workspace"
                      ? "Legacy context"
                      : "Personal"}
                    {" · "}
                    updated {formatRelativeTime(item.updated_at)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="memory-editor">
            <div className="memory-editor-header">
              <div className="memory-editor-title">Add memory</div>
            </div>
            <textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="Write a durable preference or fact…"
            />
            <div className="memory-editor-actions">
              <button
                className="platform-save-button"
                type="button"
                onClick={() => void createItem()}
                disabled={!newContent.trim()}
              >
                Save memory
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setNewContent("");
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
