import { useMemo } from "react";
import {
  buildProjectThreadGroups,
  filterThreadsByLane,
  filterThreadsWithoutProject,
  filterVisibleThreads,
  groupThreadsByDate,
  searchThreads,
} from "../../../shared/threadSidebarSelectors";

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
    threadSearchQuery,
    projectById,
    resolveThreadProjectId,
    getThreadDisplayTitle,
  } = args;

  const normalizedThreadSearch = threadSearchQuery.trim().toLowerCase();

  const visibleThreads = useMemo(
    () => filterVisibleThreads(threads),
    [threads],
  );

  const chatThreads = useMemo(
    () => filterThreadsByLane(visibleThreads, "chat"),
    [visibleThreads],
  );

  const agentThreads = useMemo(
    () => filterThreadsByLane(visibleThreads, "agent"),
    [visibleThreads],
  );

  const chatThreadGroups = useMemo(
    () => groupThreadsByDate(chatThreads),
    [chatThreads],
  );

  const threadSearchResults = useMemo(() => {
    return searchThreads(visibleThreads, normalizedThreadSearch, (thread) => {
      const title = getThreadDisplayTitle(thread);
      const workspaceHint = (thread.workspace_path ?? "").trim();
      const workspaceLabel = workspaceHint ? (workspaceHint.split("/").pop() ?? workspaceHint) : "";
      const projectId = resolveThreadProjectId(thread);
      const projectName = projectId ? (projectById.get(projectId)?.name ?? "").trim() : "";
      return `${title} ${workspaceLabel} ${projectName}`;
    });
  }, [getThreadDisplayTitle, normalizedThreadSearch, projectById, resolveThreadProjectId, visibleThreads]);

  const projectThreadGroups = useMemo(
    () => buildProjectThreadGroups(projects, agentThreads, resolveThreadProjectId),
    [agentThreads, projects, resolveThreadProjectId],
  );

  const generalThreads = useMemo(
    () => filterThreadsWithoutProject(agentThreads, resolveThreadProjectId),
    [agentThreads, resolveThreadProjectId],
  );

  return {
    normalizedThreadSearch,
    chatThreads,
    agentThreads,
    chatThreadGroups,
    threadSearchResults,
    projectThreadGroups,
    generalThreads,
  };
}
