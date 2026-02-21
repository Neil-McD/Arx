import type { ComponentProps } from "react";
import { CommunityAnalyticsPanel } from "./CommunityAnalyticsPanel";
import { CommunityLibraryPanel } from "./CommunityLibraryPanel";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { CommunityMembersPanel } from "./CommunityMembersPanel";

type DesktopCommunitySecondaryTabsProps = {
  showAnalytics: boolean;
  showLibrary: boolean;
  showResources: boolean;
  showMembers: boolean;
  analyticsPanelProps: ComponentProps<typeof CommunityAnalyticsPanel>;
  libraryPanelProps: ComponentProps<typeof CommunityLibraryPanel>;
  resourcesPanelProps: ComponentProps<typeof CommunityResourcesPanel>;
  membersPanelProps: ComponentProps<typeof CommunityMembersPanel>;
};

export function DesktopCommunitySecondaryTabs(props: DesktopCommunitySecondaryTabsProps) {
  const {
    showAnalytics,
    showLibrary,
    showResources,
    showMembers,
    analyticsPanelProps,
    libraryPanelProps,
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
      {showLibrary && (
        <CommunityLibraryPanel {...libraryPanelProps} />
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
