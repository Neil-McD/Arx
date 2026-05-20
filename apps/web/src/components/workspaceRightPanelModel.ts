export type OperatorInsightTab = "platform" | "business" | "communities";
export type WorkspaceRightPanelTab = "workspace" | "community" | "partner" | OperatorInsightTab;

export type WorkspaceRightPanelTabItem = {
  id: WorkspaceRightPanelTab;
  label: string;
};

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

export function buildWorkspaceRightPanelTabs(params: {
  showPartnerTab: boolean;
  showOperatorTabs: boolean;
  communityLabel: string;
}): WorkspaceRightPanelTabItem[] {
  const communityLabel = params.communityLabel.trim() || "Polynet";
  return [
    { id: "workspace", label: "Workspace" },
    { id: "community", label: communityLabel },
    ...(params.showPartnerTab ? [{ id: "partner" as const, label: "Partner" }] : []),
    ...(params.showOperatorTabs ? OPERATOR_INSIGHT_TABS : []),
  ];
}

export function resolveWorkspaceRightPanelTab(
  requestedTab: WorkspaceRightPanelTab,
  availableTabs: readonly WorkspaceRightPanelTabItem[],
): WorkspaceRightPanelTab {
  return availableTabs.some((tab) => tab.id === requestedTab) ? requestedTab : "workspace";
}

export function isOperatorInsightTab(tab: WorkspaceRightPanelTab): tab is OperatorInsightTab {
  return tab === "platform" || tab === "business" || tab === "communities";
}
