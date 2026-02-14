import { useMemo } from "react";
import {
  buildProjectThreadGroups,
  filterThreadsByLane,
  filterThreadsWithoutProject,
  filterVisibleThreads,
  groupThreadsByDate,
  searchThreads,
} from "../../../shared/threadSidebarSelectors";

type ThreadLane = "chat" | "agent";

type ThreadSidebarThread = {
  id: string;
  workspace_path: string | null;
  updated_at: number;
  thread_lane: string | null;
  engine_id: string;
};

type ThreadSidebarProject = {
  id: string;
  name: string | null;
  root_path: string;
};

type UseDesktopThreadSidebarStateArgs<ThreadT extends ThreadSidebarThread, ProjectT extends ThreadSidebarProject> = {
  threads: ThreadT[];
  projects: ProjectT[];
  threadLaneFilter: ThreadLane;
  threadSearchQuery: string;
  projectById: Map<string, ProjectT>;
  resolveThreadProjectId: (thread: ThreadT) => string | null;
  getThreadDisplayTitle: (thread: ThreadT) => string;
};

export function useDesktopThreadSidebarState<
  ThreadT extends ThreadSidebarThread,
  ProjectT extends ThreadSidebarProject,
>(args: UseDesktopThreadSidebarStateArgs<ThreadT, ProjectT>) {
  const {
    threads,
    projects,
    threadLaneFilter,
    threadSearchQuery,
    projectById,
    resolveThreadProjectId,
    getThreadDisplayTitle,
  } = args;

  const normalizedThreadSearch = threadSearchQuery.trim().toLowerCase();

  const laneThreads = useMemo(
    () => filterThreadsByLane(filterVisibleThreads(threads), threadLaneFilter),
    [threadLaneFilter, threads],
  );

  const chatThreadGroups = useMemo(
    () => groupThreadsByDate(laneThreads),
    [laneThreads],
  );

  const threadSearchResults = useMemo(() => {
    return searchThreads(laneThreads, normalizedThreadSearch, (thread) => {
      const title = getThreadDisplayTitle(thread);
      const workspaceHint = (thread.workspace_path ?? "").trim();
      const workspaceLabel = workspaceHint ? (workspaceHint.split("/").pop() ?? workspaceHint) : "";
      const projectId = resolveThreadProjectId(thread);
      const projectName = projectId ? (projectById.get(projectId)?.name ?? "").trim() : "";
      return `${title} ${workspaceLabel} ${projectName}`;
    });
  }, [getThreadDisplayTitle, laneThreads, normalizedThreadSearch, projectById, resolveThreadProjectId]);

  const projectThreadGroups = useMemo(
    () => buildProjectThreadGroups(projects, laneThreads, resolveThreadProjectId),
    [laneThreads, projects, resolveThreadProjectId],
  );

  const generalThreads = useMemo(
    () => filterThreadsWithoutProject(laneThreads, resolveThreadProjectId),
    [laneThreads, resolveThreadProjectId],
  );

  return {
    normalizedThreadSearch,
    laneThreads,
    chatThreadGroups,
    threadSearchResults,
    projectThreadGroups,
    generalThreads,
  };
}
