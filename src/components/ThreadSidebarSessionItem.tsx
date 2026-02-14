type ThreadSidebarSessionItemProps = {
  title: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void | Promise<void>;
};

export function ThreadSidebarSessionItem(props: ThreadSidebarSessionItemProps) {
  const { title, isActive, onSelect, onDelete } = props;

  return (
    <div className={`session-item${isActive ? " active" : ""}`} onClick={onSelect}>
      <div className="session-content">
        <div className="session-title">{title}</div>
      </div>
      <div className="session-meta">
        <div className="session-actions">
          <button
            className="session-action"
            onClick={(event) => {
              event.stopPropagation();
              void onDelete();
            }}
            title="Delete thread"
          >
            <svg viewBox="0 0 24 24">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
