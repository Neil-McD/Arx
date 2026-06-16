import { useEffect, useState, type ReactNode } from "react";
import type {
  ProjectLike,
  ThreadSidebarPanelActions,
  ThreadSidebarPanelState,
} from "./threadSidebarContracts";
import { normalizeComputerDisplayName } from "../../../../shared/projectNaming";

const PROJECT_THREAD_PREVIEW_LIMIT = 7;

type WebThreadSidebarPanelProps<TThread, TProject extends ProjectLike> = {
  state: ThreadSidebarPanelState<TThread, TProject>;
  actions: ThreadSidebarPanelActions<TThread, TProject>;
  showThreadLaneSwitch?: boolean;
  projectToolbarAction?: ReactNode;
  showWorkspaceToolbar?: boolean;
};

export function WebThreadSidebarPanel<TThread, TProject extends ProjectLike>(
  props: WebThreadSidebarPanelProps<TThread, TProject>,
) {
  const {
    state,
    actions,
    showThreadLaneSwitch = true,
    projectToolbarAction,
    showWorkspaceToolbar = true,
  } = props;
  const {
    threadLaneFilter,
    threadSearchQuery,
    normalizedThreadSearch,
    threadSearchResults,
    projectThreadGroups,
    projectExpandedById,
    generalThreads,
    agentThreadsCount,
    chatThreadsCount,
    showChatSignInPrompt,
  } = state;
  const hasProjectToolbar = Boolean(projectToolbarAction) || projectThreadGroups.length > 0;
  const [showAllThreadsByProjectId, setShowAllThreadsByProjectId] = useState<Record<string, true>>(
    {},
  );
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);

  useEffect(() => {
    const projectIds = new Set(projectThreadGroups.map(({ project }) => project.id));
    setShowAllThreadsByProjectId((prev) => {
      let changed = false;
      const next: Record<string, true> = {};
      for (const projectId of Object.keys(prev)) {
        if (projectIds.has(projectId)) {
          next[projectId] = true;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projectThreadGroups]);

  useEffect(() => {
    if (!openProjectMenuId) return;
    const handlePointerDown = () => setOpenProjectMenuId(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenProjectMenuId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openProjectMenuId]);

  return (
    <>
      {showThreadLaneSwitch && (
        <div className={`thread-lane-switch${threadLaneFilter === "agent" ? " agent" : ""}`}>
          <div className="thread-lane-switch-thumb" />
          <button
            type="button"
            className={`thread-lane-switch-button${threadLaneFilter === "chat" ? " active" : ""}`}
            onClick={() => actions.onThreadLaneFilterChange("chat")}
            title="Cloud threads"
          >
            Cloud
          </button>
          <button
            type="button"
            className={`thread-lane-switch-button${threadLaneFilter === "agent" ? " active" : ""}`}
            onClick={() => actions.onThreadLaneFilterChange("agent")}
            title="Local threads"
          >
            Local
          </button>
        </div>
      )}
      <div className="session-search-row">
        <div className="session-search" role="search" aria-label="Search threads">
          <svg className="session-search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={threadSearchQuery}
            onChange={(event) => actions.onThreadSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                actions.onThreadSearchQueryChange("");
              }
            }}
            placeholder="Search threads…"
            aria-label="Search threads"
          />
          {threadSearchQuery.trim() && (
            <button
              type="button"
              className="session-search-clear"
              onClick={() => actions.onThreadSearchQueryChange("")}
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {showWorkspaceToolbar &&
        hasProjectToolbar &&
        (threadLaneFilter === "agent" || (threadLaneFilter === "chat" && !showChatSignInPrompt)) && (
          <div className="project-toolbar">
            <div className="project-toolbar-label">Projects</div>
            {projectToolbarAction ? (
              <div className="project-toolbar-actions">{projectToolbarAction}</div>
            ) : null}
          </div>
        )}
      <div className="session-list">
        {normalizedThreadSearch ? (
          threadSearchResults.length === 0 ? (
            <div className="empty-state">No matching threads.</div>
          ) : (
            threadSearchResults.map((thread) => actions.renderSessionItem(thread))
          )
        ) : (
          <>
            {threadLaneFilter === "chat" && showChatSignInPrompt ? (
              <div className="empty-state">
                <div>Sign in to sync cloud chat threads.</div>
                {actions.onSignInForChat && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="google-sign-in"
                      type="button"
                      onClick={() => void actions.onSignInForChat?.()}
                    >
                      Continue to sign in
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {projectThreadGroups.map(({ project, threads }) => {
                  const expanded = projectExpandedById[project.id] ?? true;
                  const label = normalizeComputerDisplayName(
                    (project.name ?? "").trim() ||
                      (project.root_path.split("/").pop() ?? project.root_path),
                  );
                  const showAllThreads = showAllThreadsByProjectId[project.id] === true;
                  const visibleThreads = showAllThreads
                    ? threads
                    : threads.slice(0, PROJECT_THREAD_PREVIEW_LIMIT);
                  const hiddenThreadCount = Math.max(0, threads.length - visibleThreads.length);
                  return (
                    <div key={project.id} className="project-group">
                      <div className={`project-group-header${expanded ? " expanded" : ""}`}>
                        <button
                          type="button"
                          className="project-group-label"
                          onClick={() => actions.onToggleProjectExpanded(project.id)}
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
                        {actions.onEditProject || actions.onDeleteProject ? (
                          <div
                            style={{ position: "relative" }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="project-group-menu-trigger"
                              aria-expanded={openProjectMenuId === project.id}
                              title="Project options"
                              onClick={() =>
                                setOpenProjectMenuId((current) =>
                                  current === project.id ? null : project.id,
                                )
                              }
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="5" cy="12" r="1.8" />
                                <circle cx="12" cy="12" r="1.8" />
                                <circle cx="19" cy="12" r="1.8" />
                              </svg>
                            </button>
                            {openProjectMenuId === project.id ? (
                              <div className="project-group-menu" role="menu" aria-label={`${label} options`}>
                                {actions.onEditProject ? (
                                  <button
                                    type="button"
                                    className="project-group-menu-item"
                                    onClick={() => {
                                      setOpenProjectMenuId(null);
                                      void actions.onEditProject?.(project);
                                    }}
                                  >
                                    Edit project
                                  </button>
                                ) : null}
                                {actions.onDeleteProject ? (
                                  <button
                                    type="button"
                                    className="project-group-menu-item danger"
                                    onClick={() => {
                                      setOpenProjectMenuId(null);
                                      void actions.onDeleteProject?.(project);
                                    }}
                                  >
                                    Delete project
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="project-group-new"
                          onClick={() => actions.onStartDraftInProject(project)}
                          title="New thread in this project"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>
                      {expanded && (
                        <div className="project-group-threads">
                          {threads.length > 0 ? (
                            <>
                              {visibleThreads.map((thread) => actions.renderSessionItem(thread))}
                              {hiddenThreadCount > 0 && (
                                <button
                                  type="button"
                                  className="project-group-show-more"
                                  onClick={() =>
                                    setShowAllThreadsByProjectId((prev) => ({
                                      ...prev,
                                      [project.id]: true,
                                    }))
                                  }
                                >
                                  Show more ({hiddenThreadCount})
                                </button>
                              )}
                              {hiddenThreadCount === 0 &&
                                showAllThreads &&
                                threads.length > PROJECT_THREAD_PREVIEW_LIMIT && (
                                  <button
                                    type="button"
                                    className="project-group-show-more"
                                    onClick={() =>
                                      setShowAllThreadsByProjectId((prev) => {
                                        if (!(project.id in prev)) return prev;
                                        const next = { ...prev };
                                        delete next[project.id];
                                        return next;
                                      })
                                    }
                                  >
                                    Show less
                                  </button>
                                )}
                            </>
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
                    <div className="session-group-label">Chats</div>
                    {generalThreads.map((thread) => actions.renderSessionItem(thread))}
                  </div>
                )}
                {threadLaneFilter === "agent"
                  ? agentThreadsCount === 0 && (
                      <div className="empty-state">
                        {projectThreadGroups.length > 0
                          ? "No local threads yet. Pick a project and start one."
                          : "No local threads yet. Start one after your workspace is ready."}
                      </div>
                    )
                  : chatThreadsCount === 0 && (
                      <div className="empty-state">
                        {projectThreadGroups.length > 0
                          ? "No cloud chats yet. Pick a project and start one."
                          : "No cloud chats yet. Start one."}
                      </div>
                    )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
