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

type CloudProjectLike = { id: string };

export function resolveDefaultWorkspaceProjectId<TProject extends CloudProjectLike>(
  projects: readonly TProject[],
): string | null {
  return projects[0]?.id ?? null;
}

export function resolvePreferredCloudProjectId<TProject extends CloudProjectLike>(
  projects: readonly TProject[],
  preferredProjectId: string | null | undefined,
): string | null {
  const preferred = String(preferredProjectId ?? "").trim();
  if (preferred && projects.some((project) => project.id === preferred)) {
    return preferred;
  }
  const workspaceId = resolveDefaultWorkspaceProjectId(projects);
  if (workspaceId) return workspaceId;
  return projects[0]?.id ?? null;
}

export function resolveExistingCloudProjectId<TProject extends CloudProjectLike>(
  projects: readonly TProject[],
  preferredProjectId: string | null | undefined,
): string | null {
  const preferred = String(preferredProjectId ?? "").trim();
  if (preferred && projects.some((project) => project.id === preferred)) {
    return preferred;
  }
  return null;
}

export function resolveCloudThreadProjectId<
  TThread extends { project_id?: string | null },
  TProject extends CloudProjectLike,
>(
  thread: TThread,
  _projectById: Map<string, TProject>,
  _defaultWorkspaceProjectId: string | null,
): string | null {
  const direct = String(thread.project_id ?? "").trim();
  if (direct) return direct;
  return null;
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
