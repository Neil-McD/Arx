import type { ComponentProps, ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { CommunityAiFeedPanel } from "./CommunityAiFeedPanel";
import { WebCommunityAnalyticsSection } from "./WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import { WebCommunityMembersSection } from "./WebCommunityMembersSection";
import { WebCommunityResourceModal } from "./WebCommunityResourceModal";
import { WebCommunityResourcesSection } from "./WebCommunityResourcesSection";
import { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settingsSectionProps: ComponentProps<typeof WebCommunitySettingsSection>;
  bannerEditorModalProps: ComponentProps<typeof WebCommunityBannerEditorModal>;
  feedPanelProps: ComponentProps<typeof CommunityAiFeedPanel>;
  aiAgentSectionProps: ComponentProps<typeof WebCommunityAiAgentSection>;
  analyticsSectionProps: ComponentProps<typeof WebCommunityAnalyticsSection>;
  resourcesSectionProps: ComponentProps<typeof WebCommunityResourcesSection>;
  membersSectionProps: ComponentProps<typeof WebCommunityMembersSection>;
  resourceModalProps: ComponentProps<typeof WebCommunityResourceModal>;
};

function renderCenteredPane(children: ReactNode) {
  return (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">{children}</div>
    </div>
  );
}

export function WebCommunitySecondaryPanels(props: WebCommunitySecondaryPanelsProps) {
  const {
    communityTab,
    settingsSectionProps,
    bannerEditorModalProps,
    feedPanelProps,
    aiAgentSectionProps,
    analyticsSectionProps,
    resourcesSectionProps,
    membersSectionProps,
    resourceModalProps,
  } = props;

  return (
    <>
      {communityTab === "settings" &&
        renderCenteredPane(<WebCommunitySettingsSection {...settingsSectionProps} />)}
      <WebCommunityBannerEditorModal {...bannerEditorModalProps} />

      {communityTab === "feed" && <CommunityAiFeedPanel {...feedPanelProps} />}

      {communityTab === "ai_agent" &&
        renderCenteredPane(<WebCommunityAiAgentSection {...aiAgentSectionProps} />)}

      {communityTab === "analytics" &&
        renderCenteredPane(<WebCommunityAnalyticsSection {...analyticsSectionProps} />)}

      {communityTab === "resources" &&
        renderCenteredPane(<WebCommunityResourcesSection {...resourcesSectionProps} />)}

      {communityTab === "members" &&
        renderCenteredPane(<WebCommunityMembersSection {...membersSectionProps} />)}

      <WebCommunityResourceModal {...resourceModalProps} />
    </>
  );
}
