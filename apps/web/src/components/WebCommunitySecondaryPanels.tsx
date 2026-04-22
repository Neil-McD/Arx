import type { ComponentProps, MutableRefObject, ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityInitials } from "../../../../shared/messageMetadataUi";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import { CommunityAiFeedPanel } from "./CommunityAiFeedPanel";
import { WebCommunityAnalyticsSection } from "./WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityAvatarEditorModal } from "./WebCommunityAvatarEditorModal";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import { WebCommunityMembersSection } from "./WebCommunityMembersSection";
import { WebCommunityPolynetSection } from "./WebCommunityPolynetSection";
import { WebCommunityFunnelSection } from "./WebCommunityFunnelSection";
import { WebCommunityResourceModal } from "./WebCommunityResourceModal";
import { WebCommunityResourcesSection } from "./WebCommunityResourcesSection";
import { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settings: Omit<ComponentProps<typeof WebCommunitySettingsSection>, "state" | "actions"> & {
    state: ComponentProps<typeof WebCommunitySettingsSection>["state"];
    actions: Omit<
      ComponentProps<typeof WebCommunitySettingsSection>["actions"],
      | "openCommunityBannerFocusModal"
      | "closeCommunityBannerFocusModal"
      | "openCommunityAvatarFocusModal"
      | "closeCommunityAvatarFocusModal"
      | "setCommunityPricingDirty"
      | "communityInitials"
      | "slugifyCommunityName"
    > & {
      communityPricingDirtyRef: MutableRefObject<boolean>;
    };
    setIsCommunityAvatarFocusModalOpen: (value: boolean) => void;
    setIsCommunityBannerFocusModalOpen: (value: boolean) => void;
  };
  avatarEditor: Omit<ComponentProps<typeof WebCommunityAvatarEditorModal>, "isOpen" | "onDirty" | "onClose"> & {
    isSettingsTabActive: boolean;
    isCommunityAvatarFocusModalOpen: boolean;
    markCommunitySettingsDirty: () => void;
    setIsCommunityAvatarFocusModalOpen: (value: boolean) => void;
  };
  bannerEditor: Omit<ComponentProps<typeof WebCommunityBannerEditorModal>, "isOpen" | "onDirty" | "onClose"> & {
    isSettingsTabActive: boolean;
    isCommunityBannerFocusModalOpen: boolean;
    markCommunitySettingsDirty: () => void;
    setIsCommunityBannerFocusModalOpen: (value: boolean) => void;
  };
  feed: ComponentProps<typeof CommunityAiFeedPanel>;
  polynet: ComponentProps<typeof WebCommunityPolynetSection>;
  aiAgent: ComponentProps<typeof WebCommunityAiAgentSection>;
  funnel: ComponentProps<typeof WebCommunityFunnelSection>;
  analytics: ComponentProps<typeof WebCommunityAnalyticsSection>;
  resources: ComponentProps<typeof WebCommunityResourcesSection>;
  members: Omit<ComponentProps<typeof WebCommunityMembersSection>, "actions"> & {
    actions: Omit<ComponentProps<typeof WebCommunityMembersSection>["actions"], "communityInitials">;
  };
  resourceModal: ComponentProps<typeof WebCommunityResourceModal>;
};

function renderCenteredPane(children: ReactNode) {
  return (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">{children}</div>
    </div>
  );
}

export function WebCommunitySecondaryPanels(props: WebCommunitySecondaryPanelsProps) {
  const settingsSectionProps: ComponentProps<typeof WebCommunitySettingsSection> = {
    ...props.settings,
    actions: {
      ...props.settings.actions,
      openCommunityAvatarFocusModal: () => props.settings.setIsCommunityAvatarFocusModalOpen(true),
      closeCommunityAvatarFocusModal: () => props.settings.setIsCommunityAvatarFocusModalOpen(false),
      openCommunityBannerFocusModal: () => props.settings.setIsCommunityBannerFocusModalOpen(true),
      closeCommunityBannerFocusModal: () => props.settings.setIsCommunityBannerFocusModalOpen(false),
      setCommunityPricingDirty: () => {
        props.settings.actions.communityPricingDirtyRef.current = true;
      },
      communityInitials,
      slugifyCommunityName,
    },
  };

  const avatarEditorModalProps: ComponentProps<typeof WebCommunityAvatarEditorModal> = {
    ...props.avatarEditor,
    isOpen: props.avatarEditor.isSettingsTabActive && props.avatarEditor.isCommunityAvatarFocusModalOpen,
    onDirty: props.avatarEditor.markCommunitySettingsDirty,
    onClose: () => props.avatarEditor.setIsCommunityAvatarFocusModalOpen(false),
  };

  const bannerEditorModalProps: ComponentProps<typeof WebCommunityBannerEditorModal> = {
    ...props.bannerEditor,
    isOpen: props.bannerEditor.isSettingsTabActive && props.bannerEditor.isCommunityBannerFocusModalOpen,
    onDirty: props.bannerEditor.markCommunitySettingsDirty,
    onClose: () => props.bannerEditor.setIsCommunityBannerFocusModalOpen(false),
  };

  const membersSectionProps: ComponentProps<typeof WebCommunityMembersSection> = {
    ...props.members,
    actions: {
      ...props.members.actions,
      communityInitials,
    },
  };

  return (
    <>
      {props.communityTab === "settings" &&
        renderCenteredPane(<WebCommunitySettingsSection {...settingsSectionProps} />)}
      <WebCommunityAvatarEditorModal {...avatarEditorModalProps} />
      <WebCommunityBannerEditorModal {...bannerEditorModalProps} />

      {props.communityTab === "ai_feed" && renderCenteredPane(<CommunityAiFeedPanel {...props.feed} />)}

      {props.communityTab === "polynet" &&
        renderCenteredPane(<WebCommunityPolynetSection {...props.polynet} />)}

      {props.communityTab === "ai_agent" &&
        renderCenteredPane(<WebCommunityAiAgentSection {...props.aiAgent} />)}

      {props.communityTab === "funnel" &&
        renderCenteredPane(<WebCommunityFunnelSection {...props.funnel} />)}

      {props.communityTab === "analytics" &&
        renderCenteredPane(<WebCommunityAnalyticsSection {...props.analytics} />)}

      {props.communityTab === "resources" &&
        renderCenteredPane(<WebCommunityResourcesSection {...props.resources} />)}

      {props.communityTab === "members" &&
        renderCenteredPane(<WebCommunityMembersSection {...membersSectionProps} />)}

      <WebCommunityResourceModal {...props.resourceModal} />
    </>
  );
}
