import type { ComponentProps, MutableRefObject, ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityInitials } from "../../../../shared/messageMetadataUi";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import { WebCommunityAnalyticsSection } from "./WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityAvatarEditorModal } from "./WebCommunityAvatarEditorModal";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import { WebCommunityFunnelSection } from "./WebCommunityFunnelSection";
import { WebCommunityEventsSection } from "./WebCommunityEventsSection";
import { WebDeleteResourceModuleModal } from "./WebDeleteResourceModuleModal";
import { WebCommunityResourceModal } from "./WebCommunityResourceModal";
import { WebCommunityResourceModuleModal } from "./WebCommunityResourceModuleModal";
import { WebCommunityResourcesSection } from "./WebCommunityResourcesSection";
import { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settings: Omit<
    ComponentProps<typeof WebCommunitySettingsSection>,
    "state" | "actions" | "aiAgentProps"
  > & {
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
  aiAgent: ComponentProps<typeof WebCommunityAiAgentSection>;
  funnel: ComponentProps<typeof WebCommunityFunnelSection>;
  analytics: ComponentProps<typeof WebCommunityAnalyticsSection>;
  resources: ComponentProps<typeof WebCommunityResourcesSection>;
  events: ComponentProps<typeof WebCommunityEventsSection>;
  resourceModuleModal: ComponentProps<typeof WebCommunityResourceModuleModal>;
  resourceModuleDeleteModal: ComponentProps<typeof WebDeleteResourceModuleModal>;
  resourceModal: ComponentProps<typeof WebCommunityResourceModal>;
};

function renderCenteredPane(children: ReactNode) {
  return (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">
        {children}
      </div>
    </div>
  );
}

function renderWorkspacePane(children: ReactNode) {
  return (
    <div className="community-tab-workspace">
      <div className="web-community-centered-pane web-community-centered-pane-workspace">
        {children}
      </div>
    </div>
  );
}

export function WebCommunitySecondaryPanels(props: WebCommunitySecondaryPanelsProps) {
  const settingsSectionProps: ComponentProps<typeof WebCommunitySettingsSection> = {
    ...props.settings,
    aiAgentProps: props.aiAgent,
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

  return (
    <>
      {props.communityTab === "settings" ? (
        <>
          {renderCenteredPane(<WebCommunitySettingsSection {...settingsSectionProps} />)}
          <WebCommunityAvatarEditorModal {...avatarEditorModalProps} />
          <WebCommunityBannerEditorModal {...bannerEditorModalProps} />
        </>
      ) : null}

      {props.communityTab === "funnel" &&
        renderWorkspacePane(<WebCommunityFunnelSection {...props.funnel} />)}

      {props.communityTab === "analytics" &&
        renderCenteredPane(<WebCommunityAnalyticsSection {...props.analytics} />)}

      {props.communityTab === "resources" ? (
        <>
          {renderCenteredPane(<WebCommunityResourcesSection {...props.resources} />)}
          <WebCommunityResourceModuleModal {...props.resourceModuleModal} />
          <WebDeleteResourceModuleModal {...props.resourceModuleDeleteModal} />
          <WebCommunityResourceModal {...props.resourceModal} />
        </>
      ) : null}

      {props.communityTab === "events" &&
        renderCenteredPane(<WebCommunityEventsSection {...props.events} />)}

    </>
  );
}
