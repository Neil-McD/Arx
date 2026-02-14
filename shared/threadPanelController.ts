import type { ThreadLane } from "./threadSidebarSelectors";

type ProjectExpandedById = Record<string, boolean>;

type ThreadPanelControllerParams<TProject extends { id: string }> = {
  getActiveProjectId: () => string | null;
  setActiveProject: (project: TProject) => void;
  persistActiveProject?: (projectId: string) => void | Promise<void>;
  setThreadLaneFilter: (lane: ThreadLane) => void;
  enterDraftThread: () => void;
  setProjectMenuProjectId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setProjectExpandedById: (updater: (prev: ProjectExpandedById) => ProjectExpandedById) => void;
};

export function createThreadPanelController<TProject extends { id: string }>(
  params: ThreadPanelControllerParams<TProject>,
): {
  setChatLane: () => void;
  setAgentLane: () => void;
  closeProjectMenu: () => void;
  toggleProjectMenu: (projectId: string) => void;
  toggleProjectExpanded: (projectId: string) => void;
  startDraftInProject: (project: TProject) => void;
} {
  const setChatLane = () => {
    params.setThreadLaneFilter("chat");
  };

  const setAgentLane = () => {
    params.setThreadLaneFilter("agent");
  };

  const closeProjectMenu = () => {
    params.setProjectMenuProjectId(null);
  };

  const toggleProjectMenu = (projectId: string) => {
    params.setProjectMenuProjectId((prev) => (prev === projectId ? null : projectId));
  };

  const toggleProjectExpanded = (projectId: string) => {
    params.setProjectExpandedById((prev) => ({
      ...prev,
      [projectId]: !(prev[projectId] ?? true),
    }));
  };

  const startDraftInProject = (project: TProject) => {
    closeProjectMenu();
    if ((params.getActiveProjectId() ?? "") !== project.id) {
      params.setActiveProject(project);
      void params.persistActiveProject?.(project.id);
    }
    setAgentLane();
    params.enterDraftThread();
  };

  return {
    setChatLane,
    setAgentLane,
    closeProjectMenu,
    toggleProjectMenu,
    toggleProjectExpanded,
    startDraftInProject,
  };
}
