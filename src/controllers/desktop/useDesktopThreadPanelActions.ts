import { useEffect, useMemo } from "react";
import { createThreadPanelController } from "../../../shared/threadPanelController";

type ProjectExpandedById = Record<string, boolean>;

type UseDesktopThreadPanelActionsArgs<TProject extends { id: string }> = {
  activeProjectId: string | null;
  setActiveProject: (project: TProject) => void;
  persistActiveProject?: (projectId: string) => void | Promise<void>;
  enterDraftThread: () => void;
  projectMenuProjectId: string | null;
  setProjectMenuProjectId: (value: string | null | ((prev: string | null) => string | null)) => void;
  setProjectExpandedById: (updater: (prev: ProjectExpandedById) => ProjectExpandedById) => void;
  projectMenuRef: { current: HTMLElement | null };
};

export function useDesktopThreadPanelActions<TProject extends { id: string }>(
  args: UseDesktopThreadPanelActionsArgs<TProject>,
) {
  const {
    activeProjectId,
    setActiveProject,
    persistActiveProject,
    enterDraftThread,
    projectMenuProjectId,
    setProjectMenuProjectId,
    setProjectExpandedById,
    projectMenuRef,
  } = args;

  useEffect(() => {
    if (!projectMenuProjectId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const root = projectMenuRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!root.contains(target)) {
        setProjectMenuProjectId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectMenuProjectId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [projectMenuProjectId, projectMenuRef, setProjectMenuProjectId]);

  return useMemo(
    () =>
      createThreadPanelController<TProject>({
        getActiveProjectId: () => activeProjectId,
        setActiveProject,
        persistActiveProject,
        enterDraftThread,
        setProjectMenuProjectId,
        setProjectExpandedById,
      }),
    [
      activeProjectId,
      setActiveProject,
      persistActiveProject,
      enterDraftThread,
      setProjectMenuProjectId,
      setProjectExpandedById,
    ],
  );
}
