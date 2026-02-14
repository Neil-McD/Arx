import type { ReactNode, RefObject } from "react";
import type { ThreadLane } from "../../shared/threadSidebarSelectors";

type ProjectLike = {
  id: string;
  name: string | null;
  root_path: string;
};

type ChatThreadGroup<TThread> = {
  label: string;
  threads: TThread[];
};

type ProjectThreadGroup<TProject, TThread> = {
  project: TProject;
  threads: TThread[];
};

type ThreadSidebarPanelProps<TThread, TProject extends ProjectLike> = {
  threadSearchQuery: string;
  onThreadSearchQueryChange: (value: string) => void;
  threadLaneFilter: ThreadLane;
  onSelectChatLane: () => void;
  onSelectAgentLane: () => void;
  onAddProject: () => void | Promise<void>;
  normalizedThreadSearch: string;
  threadSearchResults: TThread[];
  projectThreadGroups: Array<ProjectThreadGroup<TProject, TThread>>;
  projectExpandedById: Record<string, boolean>;
  onToggleProjectExpanded: (projectId: string) => void;
  onStartDraftInProject: (project: TProject) => void;
  onToggleProjectMenu: (projectId: string) => void;
  projectMenuProjectId: string | null;
  projectMenuRef: RefObject<HTMLDivElement>;
  onRenameProject: (project: TProject) => void | Promise<void>;
  onRemoveProject: (project: TProject) => void | Promise<void>;
  generalThreads: TThread[];
  laneThreadsCount: number;
  chatThreadGroups: Array<ChatThreadGroup<TThread>>;
  renderSessionItem: (thread: TThread, opts?: { showProjectHint?: boolean }) => ReactNode;
};

export function ThreadSidebarPanel<TThread, TProject extends ProjectLike>(
  props: ThreadSidebarPanelProps<TThread, TProject>,
) {
  const {
    threadSearchQuery,
    onThreadSearchQueryChange,
    threadLaneFilter,
    onSelectChatLane,
    onSelectAgentLane,
    onAddProject,
    normalizedThreadSearch,
    threadSearchResults,
    projectThreadGroups,
    projectExpandedById,
    onToggleProjectExpanded,
    onStartDraftInProject,
    onToggleProjectMenu,
    projectMenuProjectId,
    projectMenuRef,
    onRenameProject,
    onRemoveProject,
    generalThreads,
    laneThreadsCount,
    chatThreadGroups,
    renderSessionItem,
  } = props;

  return (
    <>
      <div className="session-search" role="search" aria-label="Search threads">
        <svg className="session-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          value={threadSearchQuery}
          onChange={(event) => onThreadSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onThreadSearchQueryChange("");
            }
          }}
          placeholder="Search threads…"
          aria-label="Search threads"
        />
        {threadSearchQuery.trim() && (
          <button
            type="button"
            className="session-search-clear"
            onClick={() => onThreadSearchQueryChange("")}
            aria-label="Clear search"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>
      <div
        className={`thread-lane-switch${threadLaneFilter === "agent" ? " agent" : ""}`}
        role="tablist"
        aria-label="Thread type"
      >
        <span className="thread-lane-switch-thumb" aria-hidden="true" />
        <button
          type="button"
          className={`thread-lane-switch-button${threadLaneFilter === "chat" ? " active" : ""}`}
          onClick={onSelectChatLane}
          aria-pressed={threadLaneFilter === "chat"}
        >
          Chat
        </button>
        <button
          type="button"
          className={`thread-lane-switch-button${threadLaneFilter === "agent" ? " active" : ""}`}
          onClick={onSelectAgentLane}
          aria-pressed={threadLaneFilter === "agent"}
        >
          Agent
        </button>
      </div>
      {threadLaneFilter === "agent" && (
        <div className="project-toolbar">
          <div className="project-toolbar-label">Projects</div>
          <button
            type="button"
            className="project-toolbar-add"
            onClick={() => void onAddProject()}
            title="Add project folder"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6M9 14h6" />
            </svg>
          </button>
        </div>
      )}
      <div className="session-list">
        {normalizedThreadSearch ? (
          threadSearchResults.length === 0 ? (
            <div className="empty-state">No matching threads.</div>
          ) : (
            threadSearchResults.map((thread) =>
              renderSessionItem(thread, { showProjectHint: threadLaneFilter === "chat" }),
            )
          )
        ) : threadLaneFilter === "agent" ? (
          <>
            {projectThreadGroups.map(({ project, threads }) => {
              const expanded = projectExpandedById[project.id] ?? true;
              const label = (project.name ?? "").trim() || (project.root_path.split("/").pop() ?? project.root_path);
              return (
                <div key={project.id} className="project-group">
                  <div className={`project-group-header${expanded ? " expanded" : ""}`}>
                    <button
                      type="button"
                      className="project-group-label"
                      onClick={() => onToggleProjectExpanded(project.id)}
                      aria-expanded={expanded}
                      title={expanded ? "Collapse project" : "Expand project"}
                    >
                      <span className="project-group-icon-wrap" aria-hidden="true">
                        <svg className="project-group-icon project-group-icon-folder" viewBox="0 0 24 24">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <svg className="project-group-icon project-group-icon-chevron" viewBox="0 0 24 24">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </span>
                      <span className="project-group-name">{label}</span>
                    </button>
                    <button
                      type="button"
                      className="project-group-new"
                      onClick={() => onStartDraftInProject(project)}
                      title="Start a new thread in this project"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="project-group-menu-trigger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleProjectMenu(project.id);
                      }}
                      aria-haspopup="menu"
                      aria-expanded={projectMenuProjectId === project.id}
                      title="Project options"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="6" cy="12" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="18" cy="12" r="1.5" />
                      </svg>
                    </button>
                    {projectMenuProjectId === project.id && (
                      <div className="project-group-menu" role="menu" ref={projectMenuRef}>
                        <button
                          type="button"
                          className="project-group-menu-item"
                          role="menuitem"
                          onClick={() => void onRenameProject(project)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="project-group-menu-item danger"
                          role="menuitem"
                          onClick={() => void onRemoveProject(project)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="project-group-threads">
                      {threads.length > 0 ? (
                        threads.map((thread) => renderSessionItem(thread))
                      ) : (
                        <div className="project-group-empty">No threads yet.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {generalThreads.length > 0 && (
              <div className="session-group">
                <div className="session-group-label">Unassigned</div>
                {generalThreads.map((thread) => renderSessionItem(thread))}
              </div>
            )}
            {laneThreadsCount === 0 && (
              <div className="empty-state">No agent threads yet. Pick a project and start one.</div>
            )}
          </>
        ) : (
          <>
            {chatThreadGroups.map((group) => (
              <div key={group.label} className="session-group">
                <div className="session-group-label">{group.label}</div>
                {group.threads.map((thread) => renderSessionItem(thread))}
              </div>
            ))}
            {laneThreadsCount === 0 && (
              <div className="empty-state">No chats yet. Send a message to start.</div>
            )}
          </>
        )}
      </div>
    </>
  );
}
