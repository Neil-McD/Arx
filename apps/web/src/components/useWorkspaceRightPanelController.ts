import { useCallback, useEffect, useState } from "react";

const WORKSPACE_RIGHT_PANEL_OPEN_STORAGE_KEY = "polynet-workspace-right-panel-open";
const LEGACY_WORKSPACE_RIGHT_PANEL_OPEN_STORAGE_KEY = "polynet-workspace-operator-data-panel-open";

export type WorkspaceRightPanelLayout = {
  open: boolean;
  width: number;
  gutter: number;
};

function readFirstLocalStorageValue(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function loadWorkspaceRightPanelOpen(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return (
      readFirstLocalStorageValue([
        WORKSPACE_RIGHT_PANEL_OPEN_STORAGE_KEY,
        LEGACY_WORKSPACE_RIGHT_PANEL_OPEN_STORAGE_KEY,
      ]) === "1"
    );
  } catch {
    return false;
  }
}

function storeWorkspaceRightPanelOpen(isOpen: boolean): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WORKSPACE_RIGHT_PANEL_OPEN_STORAGE_KEY, isOpen ? "1" : "0");
  } catch {
    // Workspace right panel visibility is a local preference only.
  }
}

export function resolveWorkspaceRightPanelShellState(params: {
  hasSession: boolean;
  isWorkspaceHome: boolean;
  isMobileAppShell: boolean;
  hasOperatorRightPanelAccess: boolean;
  isOpen: boolean;
}) {
  const showControl = Boolean(
    params.hasSession &&
    params.isWorkspaceHome &&
    !params.isMobileAppShell,
  );
  return {
    showControl,
    showOperatorTabs: Boolean(showControl && params.hasOperatorRightPanelAccess),
    isVisible: Boolean(showControl && params.isOpen),
  };
}

export function useWorkspaceRightPanelController() {
  const [workspaceRightPanelLayout, setWorkspaceRightPanelLayout] =
    useState<WorkspaceRightPanelLayout>({ open: false, width: 0, gutter: 0 });
  const [isWorkspaceRightPanelOpen, setIsWorkspaceRightPanelOpen] =
    useState(loadWorkspaceRightPanelOpen);

  const handleWorkspaceRightPanelLayoutChange = useCallback((layout: WorkspaceRightPanelLayout) => {
    setWorkspaceRightPanelLayout((current) =>
      current.open === layout.open &&
      current.width === layout.width &&
      current.gutter === layout.gutter
        ? current
        : layout,
    );
  }, []);

  const handleToggleWorkspaceRightPanel = useCallback(() => {
    setIsWorkspaceRightPanelOpen((value) => !value);
  }, []);

  const handleOpenWorkspaceRightPanel = useCallback(() => {
    setIsWorkspaceRightPanelOpen(true);
  }, []);

  useEffect(() => {
    storeWorkspaceRightPanelOpen(isWorkspaceRightPanelOpen);
  }, [isWorkspaceRightPanelOpen]);

  return {
    workspaceRightPanelLayout,
    isWorkspaceRightPanelOpen,
    handleWorkspaceRightPanelLayoutChange,
    handleToggleWorkspaceRightPanel,
    handleOpenWorkspaceRightPanel,
  };
}
