export type ThreadLane = "chat" | "agent";
export type ThreadStorageMode = "cloud" | "local";

export function storageModeForThreadLane(lane: ThreadLane): ThreadStorageMode {
  return lane === "agent" ? "local" : "cloud";
}

export function normalizeThreadLane(value: unknown, engineId?: string | null): ThreadLane {
  if (value === "chat" || value === "agent") return value;
  if ((engineId ?? "").trim() === "community_chat") return "chat";
  return "agent";
}

export function normalizeThreadStorageMode(
  value: unknown,
  threadLane: unknown,
  engineId?: string | null,
): ThreadStorageMode {
  if (value === "cloud" || value === "local") return value;
  return storageModeForThreadLane(normalizeThreadLane(threadLane, engineId));
}

export function filterVisibleThreads<T extends { last_seq?: number | null }>(threads: T[]): T[] {
  return threads.filter((thread) => (thread.last_seq ?? 0) > 0);
}

export function groupThreadsByDate<T extends { updated_at: number }>(
  threads: T[],
): { label: string; threads: T[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; threads: T[] }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "This Week", threads: [] },
    { label: "Older", threads: [] },
  ];

  for (const thread of threads) {
    const date = new Date(thread.updated_at * 1000);
    if (date >= today) {
      groups[0].threads.push(thread);
    } else if (date >= yesterday) {
      groups[1].threads.push(thread);
    } else if (date >= weekAgo) {
      groups[2].threads.push(thread);
    } else {
      groups[3].threads.push(thread);
    }
  }

  return groups.filter((group) => group.threads.length > 0);
}

export function buildProjectByIdMap<TProject extends { id: string }>(
  projects: TProject[],
): Map<string, TProject> {
  const map = new Map<string, TProject>();
  for (const project of projects) map.set(project.id, project);
  return map;
}

export function sortProjectsByRootPathLengthDesc<TProject extends { root_path: string }>(
  projects: TProject[],
): TProject[] {
  return [...projects].sort((a, b) => (b.root_path?.length ?? 0) - (a.root_path?.length ?? 0));
}

export function resolveThreadProjectId<
  TThread extends { project_id?: string | null; workspace_path?: string | null },
  TProject extends { id: string; root_path: string },
>(
  thread: TThread,
  projectById: Map<string, TProject>,
  sortedProjectsByRootDesc: TProject[],
): string | null {
  const direct = (thread.project_id ?? "").trim();
  if (direct && projectById.has(direct)) return direct;
  const workspacePath = (thread.workspace_path ?? "").trim();
  if (!workspacePath) return null;
  for (const project of sortedProjectsByRootDesc) {
    const root = (project.root_path ?? "").trim();
    if (!root) continue;
    if (workspacePath === root || workspacePath.startsWith(`${root}/`)) {
      return project.id;
    }
  }
  return null;
}

export function filterThreadsByLane<
  TThread extends { thread_lane?: unknown; engine_id?: string | null },
>(threads: TThread[], lane: ThreadLane): TThread[] {
  return threads.filter((thread) => normalizeThreadLane(thread.thread_lane, thread.engine_id) === lane);
}

export function searchThreads<TThread>(
  threads: TThread[],
  normalizedQuery: string,
  buildHaystack: (thread: TThread) => string,
): TThread[] {
  if (!normalizedQuery) return threads;
  return threads.filter((thread) => buildHaystack(thread).toLowerCase().includes(normalizedQuery));
}

export function buildProjectThreadGroups<
  TProject extends { id: string },
  TThread,
>(
  projects: TProject[],
  threads: TThread[],
  resolveProjectId: (thread: TThread) => string | null,
): { project: TProject; threads: TThread[] }[] {
  return projects.map((project) => ({
    project,
    threads: threads.filter((thread) => resolveProjectId(thread) === project.id),
  }));
}

export function filterThreadsWithoutProject<TThread>(
  threads: TThread[],
  resolveProjectId: (thread: TThread) => string | null,
): TThread[] {
  return threads.filter((thread) => !resolveProjectId(thread));
}
