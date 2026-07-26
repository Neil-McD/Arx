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
