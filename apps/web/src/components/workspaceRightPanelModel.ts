export type OperatorInsightTab = "platform" | "business" | "communities";
export type WorkspaceRightPanelTab = "workspace" | "community" | "partner" | OperatorInsightTab;
export type WorkspaceRightPanelMode = "user" | "operator";

export type WorkspaceRightPanelTabItem = {
  id: WorkspaceRightPanelTab;
  label: string;
};

export type WorkspaceRightPanelModeItem = {
  id: WorkspaceRightPanelMode;
  label: string;
};

export const WORKSPACE_RIGHT_PANEL_MODES: WorkspaceRightPanelModeItem[] = [
  { id: "user", label: "User" },
  { id: "operator", label: "Operator" },
];

const OPERATOR_INSIGHT_TABS: WorkspaceRightPanelTabItem[] = [
  { id: "platform", label: "Platform" },
  { id: "business", label: "Business" },
  { id: "communities", label: "Communities" },
];

export function parseWorkspaceRightPanelTab(value: string | null): WorkspaceRightPanelTab | null {
  return value === "workspace" ||
    value === "community" ||
    value === "partner" ||
    value === "platform" ||
    value === "business" ||
    value === "communities"
    ? value
    : null;
}

export function parseWorkspaceRightPanelMode(value: string | null): WorkspaceRightPanelMode | null {
  return value === "user" || value === "operator" ? value : null;
}

export function defaultWorkspaceRightPanelTabForMode(mode: WorkspaceRightPanelMode): WorkspaceRightPanelTab {
  return mode === "operator" ? "platform" : "workspace";
}

export function getWorkspaceRightPanelTabMode(tab: WorkspaceRightPanelTab): WorkspaceRightPanelMode {
  return isOperatorInsightTab(tab) ? "operator" : "user";
}

export function resolveWorkspaceRightPanelMode(
  requestedMode: WorkspaceRightPanelMode,
  showOperatorTabs: boolean,
): WorkspaceRightPanelMode {
  return requestedMode === "operator" && showOperatorTabs ? "operator" : "user";
}

export function buildWorkspaceRightPanelTabs(params: {
  showPartnerTab: boolean;
  showOperatorTabs: boolean;
  communityLabel: string;
  mode: WorkspaceRightPanelMode;
}): WorkspaceRightPanelTabItem[] {
  const mode = resolveWorkspaceRightPanelMode(params.mode, params.showOperatorTabs);
  if (mode === "operator") return OPERATOR_INSIGHT_TABS;

  const communityLabel = params.communityLabel.trim() || "Polynet";
  return [
    { id: "workspace", label: "Workspace" },
    { id: "community", label: communityLabel },
    ...(params.showPartnerTab ? [{ id: "partner" as const, label: "Partner" }] : []),
  ];
}

export function resolveWorkspaceRightPanelTab(
  requestedTab: WorkspaceRightPanelTab,
  availableTabs: readonly WorkspaceRightPanelTabItem[],
): WorkspaceRightPanelTab {
  return availableTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : availableTabs[0]?.id ?? "workspace";
}

export function isOperatorInsightTab(tab: WorkspaceRightPanelTab): tab is OperatorInsightTab {
  return tab === "platform" || tab === "business" || tab === "communities";
}
