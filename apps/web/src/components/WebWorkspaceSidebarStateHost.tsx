import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildProjectThreadGroups,
  filterVisibleThreads,
  searchThreads,
} from "../../../../shared/threadSidebarSelectors";

type ThreadLike = {
  id: string;
  last_seq?: number | null;
};

type ProjectLike = {
  id: string;
  root_path: string;
};

type ProjectThreadGroup<TThread, TProject> = {
  project: TProject;
  threads: TThread[];
};

export type WorkspaceSidebarState<TThread, TProject> = {
  threadSearchQuery: string;
  normalizedThreadSearch: string;
  threadSearchResults: TThread[];
  projectThreadGroups: Array<ProjectThreadGroup<TThread, TProject>>;
  generalThreads: TThread[];
  projectExpandedById: Record<string, boolean>;
  visibleThreadsCount: number;
  setThreadSearchQuery: (value: string) => void;
  toggleProjectExpanded: (projectId: string) => void;
};

type WebWorkspaceSidebarStateHostProps<TThread extends ThreadLike, TProject extends ProjectLike> = {
  threads: TThread[];
  projects: TProject[];
  resolveThreadProjectId: (thread: TThread) => string | null;
  getThreadSearchText: (thread: TThread) => string;
  children: (state: WorkspaceSidebarState<TThread, TProject>) => ReactNode;
};

export function WebWorkspaceSidebarStateHost<TThread extends ThreadLike, TProject extends ProjectLike>(
  props: WebWorkspaceSidebarStateHostProps<TThread, TProject>,
) {
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [projectExpandedById, setProjectExpandedById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setProjectExpandedById((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const project of props.projects) {
        const previous = prev[project.id];
        next[project.id] = previous ?? true;
        if (previous === undefined) changed = true;
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [props.projects]);

  const visibleThreads = useMemo(() => filterVisibleThreads(props.threads), [props.threads]);
  const normalizedThreadSearch = useMemo(
    () => threadSearchQuery.trim().toLowerCase(),
    [threadSearchQuery],
  );

  const threadSearchResults = useMemo(
    () => searchThreads(visibleThreads, normalizedThreadSearch, props.getThreadSearchText),
    [normalizedThreadSearch, props.getThreadSearchText, visibleThreads],
  );

  const projectThreadGroups = useMemo(
    () => buildProjectThreadGroups(props.projects, visibleThreads, props.resolveThreadProjectId),
    [props.projects, props.resolveThreadProjectId, visibleThreads],
  );
  const generalThreads = useMemo(() => {
    return visibleThreads.filter((thread) => {
      const projectId = props.resolveThreadProjectId(thread);
      return !projectId;
    });
  }, [props.resolveThreadProjectId, visibleThreads]);

  const toggleProjectExpanded = useCallback(
    (projectId: string) => {
      setProjectExpandedById((prev) => ({
        ...prev,
        [projectId]: !(prev[projectId] ?? true),
      }));
    },
    [],
  );

  return props.children({
    threadSearchQuery,
    normalizedThreadSearch,
    threadSearchResults,
    projectThreadGroups,
    generalThreads,
    projectExpandedById,
    visibleThreadsCount: visibleThreads.length,
    setThreadSearchQuery,
    toggleProjectExpanded,
  });
}
