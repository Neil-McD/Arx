import type { ComponentProps, ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { CommunityAiFeedPanel } from "./CommunityAiFeedPanel";
import { WebCommunityAnalyticsSection } from "./WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import { WebCommunityMembersSection } from "./WebCommunityMembersSection";
import { WebCommunityPolynetSection } from "./WebCommunityPolynetSection";
import { WebCommunityFunnelSection } from "./WebCommunityFunnelSection";
import { WebCommunityResourceModal } from "./WebCommunityResourceModal";
import { WebCommunityResourcesSection } from "./WebCommunityResourcesSection";
import { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settingsSectionProps: ComponentProps<typeof WebCommunitySettingsSection>;
  bannerEditorModalProps: ComponentProps<typeof WebCommunityBannerEditorModal>;
  feedPanelProps: ComponentProps<typeof CommunityAiFeedPanel>;
  polynetSectionProps: ComponentProps<typeof WebCommunityPolynetSection>;
  aiAgentSectionProps: ComponentProps<typeof WebCommunityAiAgentSection>;
  funnelSectionProps: ComponentProps<typeof WebCommunityFunnelSection>;
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
    polynetSectionProps,
    aiAgentSectionProps,
    funnelSectionProps,
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

      {communityTab === "ai_feed" && renderCenteredPane(<CommunityAiFeedPanel {...feedPanelProps} />)}

      {communityTab === "polynet" &&
        renderCenteredPane(<WebCommunityPolynetSection {...polynetSectionProps} />)}

      {communityTab === "ai_agent" &&
        renderCenteredPane(<WebCommunityAiAgentSection {...aiAgentSectionProps} />)}

      {communityTab === "funnel" &&
        renderCenteredPane(<WebCommunityFunnelSection {...funnelSectionProps} />)}

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
