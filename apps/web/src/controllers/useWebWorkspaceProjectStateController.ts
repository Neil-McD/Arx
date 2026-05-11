import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  buildProjectByIdMap,
  resolveCloudThreadProjectId as resolveCloudThreadProjectIdShared,
  resolveDefaultWorkspaceProjectId,
  resolvePreferredCloudProjectId,
} from "../../../../shared/threadSidebarSelectors";
import { fetchMappedDaytonaCloudProjects } from "../../../../shared/daytonaCloudProjects";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { formatWorkspaceRestoreErrorMessage } from "../../../../shared/appErrorMappings";
import type { WebCloudProjectRecord } from "./useWebProjectUiController";

type ThreadLike = {
  id: string;
  project_id: string | null;
};

type UseWebWorkspaceProjectStateControllerParams<SessionT, ThreadT extends ThreadLike> = {
  ensureSession: (session: SessionT) => Promise<SessionT | null>;
  activeThreadId: string | null;
  threads: ThreadT[];
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setWorkspaceWantsNewChatMode: (next: SetStateAction<boolean>) => void;
};

export function useWebWorkspaceProjectStateController<SessionT, ThreadT extends ThreadLike>(
  params: UseWebWorkspaceProjectStateControllerParams<SessionT, ThreadT>,
) {
  const [projects, setProjects] = useState<WebCloudProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const hasObservedInitialProjectSelectionRef = useRef(false);

  const resolvedActiveProjectId = useMemo(
    () => resolvePreferredCloudProjectId(projects, activeProjectId),
    [activeProjectId, projects],
  );

  const projectById = useMemo(() => buildProjectByIdMap(projects), [projects]);
  const defaultProjectId = useMemo(() => resolveDefaultWorkspaceProjectId(projects), [projects]);

  const resolvedActiveProjectName = useMemo(() => {
    const activeName = resolvedActiveProjectId
      ? String(projectById.get(resolvedActiveProjectId)?.name ?? "").trim()
      : "";
    if (activeName) return activeName;
    if (!defaultProjectId) return "";
    return String(projectById.get(defaultProjectId)?.name ?? "").trim();
  }, [defaultProjectId, projectById, resolvedActiveProjectId]);

  const resolveThreadProjectId = useCallback(
    (thread: ThreadT): string | null =>
      resolveCloudThreadProjectIdShared(thread, projectById, defaultProjectId),
    [defaultProjectId, projectById],
  );

  const loadProjects = useCallback(
    async (session: SessionT): Promise<void> => {
      const usableSession = await params.ensureSession(session);
      if (!usableSession) {
        emitWorkspaceEvent({
          scope: "project",
          name: "projects_load",
          status: "skip",
          detail: {
            reason: "session_unavailable",
          },
        });
        return;
      }
      emitWorkspaceEvent({
        scope: "project",
        name: "projects_load",
        status: "start",
        projectId: resolvedActiveProjectId,
        detail: {
          projectCountBefore: projects.length,
        },
      });
      try {
        const next = (await fetchMappedDaytonaCloudProjects({
          session: usableSession,
        })).map((project) => project satisfies WebCloudProjectRecord);
        const nextActiveProjectId = resolvePreferredCloudProjectId(next, activeProjectId);
        setProjects(next);
        setActiveProjectId(nextActiveProjectId);
        emitWorkspaceEvent({
          scope: "project",
          name: "projects_load",
          status: "success",
          projectId: nextActiveProjectId,
          detail: {
            projectCount: next.length,
          },
        });
      } catch (error) {
        console.warn("Failed to load cloud projects:", error);
        emitWorkspaceEvent({
          scope: "project",
          name: "projects_load",
          status: "failure",
          error: formatWorkspaceInstrumentationError(
            formatWorkspaceRestoreErrorMessage(error, "Couldn't load your computers right now."),
          ),
        });
      }
    },
    [activeProjectId, params, projects.length, resolvedActiveProjectId],
  );

  const handleProjectCreated = useCallback((project: WebCloudProjectRecord): void => {
    const nextCount = projects.some((entry) => entry.id === project.id) ? projects.length : projects.length + 1;
    setProjects((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry.id !== project.id);
      return [...withoutDuplicate, project].sort((a, b) => a.created_at - b.created_at);
    });
    setActiveProjectId(project.id);
    emitWorkspaceEvent({
      scope: "project",
      name: "project_created",
      status: "success",
      projectId: project.id,
      detail: {
        projectCount: nextCount,
      },
    });
  }, [projects]);

  const handleProjectUpdated = useCallback((updated: WebCloudProjectRecord): void => {
    setProjects((prev) =>
      prev
        .map((project) =>
          project.id === updated.id
            ? {
                ...project,
                name: updated.name,
                description: updated.description,
                slug: updated.slug,
                status: updated.status,
                updated_at: updated.updated_at,
                root_path: updated.root_path,
              }
            : project,
        )
        .sort((a, b) => a.created_at - b.created_at),
    );
    emitWorkspaceEvent({
      scope: "project",
      name: "project_updated",
      status: "success",
      projectId: updated.id,
      detail: {
        status: updated.status,
      },
    });
  }, []);

  const handleProjectDeleted = useCallback(
    (project: WebCloudProjectRecord): void => {
      const nextProjects = projects.filter((entry) => entry.id !== project.id);
      const activeThread = params.threads.find((thread) => thread.id === params.activeThreadId) ?? null;
      const activeThreadCleared = activeThread?.project_id === project.id;
      const nextActiveProjectId = resolvePreferredCloudProjectId(
        nextProjects,
        activeProjectId === project.id ? null : activeProjectId,
      );
      setProjects((prev) => {
        setActiveProjectId((current) =>
          resolvePreferredCloudProjectId(nextProjects, current === project.id ? null : current),
        );
        return nextProjects;
      });
      params.setThreads((prev) => prev.filter((thread) => thread.project_id !== project.id));
      if (activeThreadCleared) {
        params.setActiveThreadId(null);
        params.setWorkspaceWantsNewChatMode(true);
      }
      emitWorkspaceEvent({
        scope: "project",
        name: "project_deleted",
        status: "success",
        projectId: project.id,
        detail: {
          projectCount: nextProjects.length,
          nextActiveProjectId,
          activeThreadCleared,
          workspaceWantsNewChatSet: activeThreadCleared,
        },
      });
    },
    [activeProjectId, params, projects],
  );

  useEffect(() => {
    if (!hasObservedInitialProjectSelectionRef.current) {
      hasObservedInitialProjectSelectionRef.current = true;
      return;
    }
    emitWorkspaceEvent({
      scope: "project",
      name: "active_project_changed",
      status: "success",
      projectId: resolvedActiveProjectId,
      detail: {
        rawActiveProjectId: activeProjectId,
        projectCount: projects.length,
      },
    });
  }, [activeProjectId, projects.length, resolvedActiveProjectId]);

  return {
    state: {
      projects,
      activeProjectId,
    },
    derived: {
      resolvedActiveProjectId,
      projectById,
      defaultProjectId,
      resolvedActiveProjectName,
      resolveThreadProjectId,
    },
    actions: {
      setProjects,
      setActiveProjectId,
      loadProjects,
      handleProjectCreated,
      handleProjectUpdated,
      handleProjectDeleted,
    },
  };
}
