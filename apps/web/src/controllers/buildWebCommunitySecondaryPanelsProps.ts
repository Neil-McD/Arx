import type { MutableRefObject } from "react";
import type { ComponentProps } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityInitials } from "../../../../shared/messageMetadataUi";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import type { WebCommunitySecondaryPanelsProps } from "../components/WebCommunitySecondaryPanels";
import { CommunityAiFeedPanel } from "../components/CommunityAiFeedPanel";
import { WebCommunityAiAgentSection } from "../components/WebCommunityAiAgentSection";
import { WebCommunityAnalyticsSection } from "../components/WebCommunityAnalyticsSection";
import { WebCommunityBannerEditorModal } from "../components/WebCommunityBannerEditorModal";
import { WebCommunityFunnelSection } from "../components/WebCommunityFunnelSection";
import { WebCommunityMembersSection } from "../components/WebCommunityMembersSection";
import { WebCommunityPolynetSection } from "../components/WebCommunityPolynetSection";
import { WebCommunityResourceModal } from "../components/WebCommunityResourceModal";
import { WebCommunityResourcesSection } from "../components/WebCommunityResourcesSection";
import { WebCommunitySettingsSection } from "../components/WebCommunitySettingsSection";

type SettingsSectionProps = ComponentProps<typeof WebCommunitySettingsSection>;
type BannerEditorModalProps = ComponentProps<typeof WebCommunityBannerEditorModal>;
type FeedPanelProps = ComponentProps<typeof CommunityAiFeedPanel>;
type PolynetSectionProps = ComponentProps<typeof WebCommunityPolynetSection>;
type AiAgentSectionProps = ComponentProps<typeof WebCommunityAiAgentSection>;
type FunnelSectionProps = ComponentProps<typeof WebCommunityFunnelSection>;
type AnalyticsSectionProps = ComponentProps<typeof WebCommunityAnalyticsSection>;
type ResourcesSectionProps = ComponentProps<typeof WebCommunityResourcesSection>;
type MembersSectionProps = ComponentProps<typeof WebCommunityMembersSection>;
type ResourceModalProps = ComponentProps<typeof WebCommunityResourceModal>;

type BuildWebCommunitySecondaryPanelsPropsArgs = {
  communityTab: CommunityTab;
  settings: Omit<SettingsSectionProps, "state" | "actions"> & {
    state: SettingsSectionProps["state"];
    actions: Omit<
      SettingsSectionProps["actions"],
      "openCommunityBannerFocusModal" | "closeCommunityBannerFocusModal" | "setCommunityPricingDirty" |
      "communityInitials" | "slugifyCommunityName"
    > & {
      communityPricingDirtyRef: MutableRefObject<boolean>;
    };
    setIsCommunityBannerFocusModalOpen: (value: boolean) => void;
  };
  bannerEditor: Omit<BannerEditorModalProps, "isOpen" | "onDirty" | "onClose"> & {
    isSettingsTabActive: boolean;
    isCommunityBannerFocusModalOpen: boolean;
    markCommunitySettingsDirty: () => void;
    setIsCommunityBannerFocusModalOpen: (value: boolean) => void;
  };
  feed: FeedPanelProps;
  polynet: PolynetSectionProps;
  aiAgent: AiAgentSectionProps;
  funnel: FunnelSectionProps;
  analytics: AnalyticsSectionProps;
  resources: ResourcesSectionProps;
  members: MembersSectionProps;
  resourceModal: ResourceModalProps;
};

export function buildWebCommunitySecondaryPanelsProps(
  args: BuildWebCommunitySecondaryPanelsPropsArgs,
): WebCommunitySecondaryPanelsProps {
  const settingsSectionProps: SettingsSectionProps = {
    ...args.settings,
    actions: {
      ...args.settings.actions,
      openCommunityBannerFocusModal: () => args.settings.setIsCommunityBannerFocusModalOpen(true),
      closeCommunityBannerFocusModal: () => args.settings.setIsCommunityBannerFocusModalOpen(false),
      setCommunityPricingDirty: () => {
        args.settings.actions.communityPricingDirtyRef.current = true;
      },
      communityInitials,
      slugifyCommunityName,
    },
  };

  const bannerEditorModalProps: BannerEditorModalProps = {
    ...args.bannerEditor,
    isOpen: args.bannerEditor.isSettingsTabActive && args.bannerEditor.isCommunityBannerFocusModalOpen,
    onDirty: args.bannerEditor.markCommunitySettingsDirty,
    onClose: () => args.bannerEditor.setIsCommunityBannerFocusModalOpen(false),
  };

  const membersSectionProps: MembersSectionProps = {
    ...args.members,
    actions: {
      ...args.members.actions,
      communityInitials,
    },
  };

  return {
    communityTab: args.communityTab,
    settingsSectionProps,
    bannerEditorModalProps,
    feedPanelProps: args.feed,
    polynetSectionProps: args.polynet,
    aiAgentSectionProps: args.aiAgent,
    funnelSectionProps: args.funnel,
    analyticsSectionProps: args.analytics,
    resourcesSectionProps: args.resources,
    membersSectionProps,
    resourceModalProps: args.resourceModal,
  };
}
