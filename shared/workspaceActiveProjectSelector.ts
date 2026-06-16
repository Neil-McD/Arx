export type WorkspaceActiveProjectSource =
  | "active_thread"
  | "draft_selection"
  | "pending_thread"
  | "none";

type WorkspaceProjectLike = {
  id: string;
  name?: string | null;
};

type WorkspaceThreadProjectLike = {
  project_id?: string | null;
};

export type WorkspaceActiveProjectSelection<TProject extends WorkspaceProjectLike> = {
  currentProjectId: string | null;
  currentProject: TProject | null;
  currentProjectName: string;
  source: WorkspaceActiveProjectSource;
  activeThreadProjectId: string | null;
  isPendingThreadProject: boolean;
  isFromActiveThread: boolean;
};

export function resolveWorkspaceActiveProject<
  TThread extends WorkspaceThreadProjectLike,
  TProject extends WorkspaceProjectLike,
>(params: {
  activeThread: TThread | null;
  activeThreadId: string | null;
  workspaceWantsNewChat: boolean;
  resolvedActiveProjectId: string | null;
  resolvedActiveProjectName: string;
  projectById: ReadonlyMap<string, TProject>;
  resolveThreadProjectId: (thread: TThread) => string | null;
  pendingThreadProjectName?: string;
}): WorkspaceActiveProjectSelection<TProject> {
  const hasActiveThread = Boolean(params.activeThread) && !params.workspaceWantsNewChat;
  const activeThreadProjectId =
    hasActiveThread && params.activeThread
      ? params.resolveThreadProjectId(params.activeThread)
      : null;
  const isPendingThreadProject =
    Boolean(params.activeThreadId) &&
    !params.workspaceWantsNewChat &&
    !params.activeThread;
  const currentProjectId = isPendingThreadProject
    ? null
    : hasActiveThread
      ? activeThreadProjectId
      : params.resolvedActiveProjectId;
  const currentProject = currentProjectId
    ? params.projectById.get(currentProjectId) ?? null
    : null;
  const isFromActiveThread =
    Boolean(activeThreadProjectId) &&
    currentProjectId === activeThreadProjectId &&
    !params.workspaceWantsNewChat;
  const currentProjectName = currentProjectId
    ? String(currentProject?.name ?? "").trim() ||
      (isFromActiveThread
        ? String(params.pendingThreadProjectName ?? "Loading project").trim() ||
          "Loading project"
        : params.resolvedActiveProjectName)
    : "";
  const source: WorkspaceActiveProjectSource = isPendingThreadProject
    ? "pending_thread"
    : isFromActiveThread
      ? "active_thread"
      : currentProjectId
        ? "draft_selection"
        : "none";

  return {
    currentProjectId,
    currentProject,
    currentProjectName,
    source,
    activeThreadProjectId,
    isPendingThreadProject,
    isFromActiveThread,
  };
}
