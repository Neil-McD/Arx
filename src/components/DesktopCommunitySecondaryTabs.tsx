import type { ComponentProps } from "react";
import { CommunityAnalyticsPanel } from "./CommunityAnalyticsPanel";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { CommunityMembersPanel } from "./CommunityMembersPanel";

type DesktopCommunitySecondaryTabsProps = {
  showAnalytics: boolean;
  showResources: boolean;
  showMembers: boolean;
  analyticsPanelProps: ComponentProps<typeof CommunityAnalyticsPanel>;
  resourcesPanelProps: ComponentProps<typeof CommunityResourcesPanel>;
  membersPanelProps: ComponentProps<typeof CommunityMembersPanel>;
};

export function DesktopCommunitySecondaryTabs(props: DesktopCommunitySecondaryTabsProps) {
  const {
    showAnalytics,
    showResources,
    showMembers,
    analyticsPanelProps,
    resourcesPanelProps,
    membersPanelProps,
  } = props;

  return (
    <>
      {showAnalytics && (
        <div className="settings-panel community-settings-panel">
          <CommunityAnalyticsPanel {...analyticsPanelProps} />
        </div>
      )}
      {showResources && (
        <CommunityResourcesPanel {...resourcesPanelProps} />
      )}
      {showMembers && (
        <CommunityMembersPanel {...membersPanelProps} />
      )}
    </>
  );
}
