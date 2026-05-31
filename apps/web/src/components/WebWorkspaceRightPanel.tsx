import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type { OperatorCommunityRecord } from "../../../../shared/operatorTypes";
import {
  CommunityPanelContent,
  WorkspacePanelContent,
  type WorkspaceUserDataPanelDataProps,
} from "./WebWorkspaceUserDataPanel";
import {
  isOperatorInsightTab,
  type WorkspaceRightPanelTab,
  type WorkspaceRightPanelTabItem,
} from "./workspaceRightPanelModel";
import { OperatorBusinessPanelView } from "./OperatorBusinessPanelView";
import { OperatorCommunitiesPanelView } from "./OperatorCommunitiesPanelView";
import { OperatorPlatformPanelView } from "./OperatorPlatformPanelView";
import {
  WebBuilderPartnerProgramPanel,
  type WebBuilderPartnerProgramPanelProps,
} from "./WebBuilderPartnerProgramPanel";
import type { OperatorDashboardState } from "./useOperatorDashboardData";
import type { PartnerPayoutCycleActions } from "./workspaceRightPanelOperatorShared";

export const WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH = 560;
export const WORKSPACE_RIGHT_PANEL_MIN_WIDTH = 380;
export const WORKSPACE_RIGHT_PANEL_MAX_WIDTH = 860;
export const WORKSPACE_RIGHT_PANEL_GUTTER = 28;
export const WORKSPACE_RIGHT_PANEL_KEYBOARD_STEP = 32;

export function clampWorkspaceRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(WORKSPACE_RIGHT_PANEL_MAX_WIDTH, Math.max(WORKSPACE_RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

export function WebWorkspaceRightPanel(props: {
  workspaceUserDataPanel: WorkspaceUserDataPanelDataProps;
  workspaceFilesResetNonce: number;
  isCommunityRecentSignalsExpanded: boolean;
  insightTabs: WorkspaceRightPanelTabItem[];
  state: OperatorDashboardState;
  topCommunities: OperatorCommunityRecord[];
  partnerPayoutCycleActions: PartnerPayoutCycleActions;
  builderPartnerProgramPanel: WebBuilderPartnerProgramPanelProps | null;
  isLoading: boolean;
  error: string | null;
  activeInsightTab: WorkspaceRightPanelTab;
  onActiveInsightTabChange: (tab: WorkspaceRightPanelTab) => void;
  onCommunityRecentSignalsExpandedChange: (expanded: boolean) => void;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const activeInsightTab = props.activeInsightTab;
  const activeInsightTabIndex = Math.max(0, props.insightTabs.findIndex((tab) => tab.id === activeInsightTab));
  const insightTabSwitcherStyle = buildPlatformSwitcherStyle(props.insightTabs.length, activeInsightTabIndex);
  const isOperatorTabActive = isOperatorInsightTab(activeInsightTab);

  return (
    <>
      <div
        className="workspace-right-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace right panel"
        tabIndex={0}
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onDoubleClick={props.onResizeDoubleClick}
        onKeyDown={props.onResizeKeyDown}
      />
      <div
        className="platform-switcher platform-switcher-compact workspace-right-panel__tabs workspace-right-panel__tabs--instant"
        role="tablist"
        aria-label="Workspace data tabs"
        style={insightTabSwitcherStyle as CSSProperties}
      >
        {props.insightTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`platform-switcher-btn${activeInsightTab === tab.id ? " is-active" : ""}`}
            aria-selected={activeInsightTab === tab.id}
            onClick={() => props.onActiveInsightTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="workspace-right-panel__content">
        {isOperatorTabActive && props.error ? <div className="workspace-right-panel__notice">{props.error}</div> : null}
        {isOperatorTabActive && props.isLoading ? (
          <div className="workspace-right-panel__notice">Loading operator data...</div>
        ) : null}
        {activeInsightTab === "workspace" ? (
          <WorkspacePanelContent
            {...props.workspaceUserDataPanel}
            filesResetNonce={props.workspaceFilesResetNonce}
          />
        ) : activeInsightTab === "community" ? (
          <CommunityPanelContent
            {...props.workspaceUserDataPanel}
            isRecentSignalsExpanded={props.isCommunityRecentSignalsExpanded}
            onRecentSignalsExpandedChange={props.onCommunityRecentSignalsExpandedChange}
          />
        ) : activeInsightTab === "partner" && props.builderPartnerProgramPanel ? (
          <WebBuilderPartnerProgramPanel
            {...props.builderPartnerProgramPanel}
            showProgramOverview={false}
          />
        ) : activeInsightTab === "platform" ? (
          <OperatorPlatformPanelView
            webDeploy={props.state.webDeploy}
            authAccess={props.state.authAccess}
            securityAudit={props.state.securityAudit}
            runtimeTools={props.state.runtimeTools}
            frontendErrors={props.state.frontendErrors}
          />
        ) : activeInsightTab === "business" ? (
          <OperatorBusinessPanelView
            overview={props.state.overview}
            monetization={props.state.monetization}
            emailAuth={props.state.emailAuth}
            accountSetup={props.state.accountSetup}
            toolEconomics={props.state.toolEconomics}
            partnerPerformance={props.state.partnerPerformance}
            partnerPayoutCycles={props.state.partnerPayoutCycles}
            partnerPayoutCycleActions={props.partnerPayoutCycleActions}
            risks={props.state.risks}
            events={props.state.events}
          />
        ) : (
          <OperatorCommunitiesPanelView overview={props.state.overview} communities={props.topCommunities} />
        )}
      </div>
    </>
  );
}
