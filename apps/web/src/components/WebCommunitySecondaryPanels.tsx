import { CommunityPageFrame } from "./CommunityPageHeader";
import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityInitials } from "../../../../shared/messageMetadataUi";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import type { WebCommunityAnalyticsSection as WebCommunityAnalyticsSectionType } from "./WebCommunityAnalyticsSection";
import type { WebCommunityAiAgentSection as WebCommunityAiAgentSectionType } from "./WebCommunityAiAgentSection";
import { WebCommunityAvatarEditorModal } from "./WebCommunityAvatarEditorModal";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import type { WebCommunityEventsSection as WebCommunityEventsSectionType } from "./WebCommunityEventsSection";
import type { WebCommunityPodsSectionProps } from "./WebCommunityPodsSection";
import type { WebCommunityDiscoverPageProps } from "./WebCommunityDiscoverPage";
import { WebDeleteResourceModuleModal } from "./WebDeleteResourceModuleModal";
import { WebCommunityResourceModuleModal } from "./WebCommunityResourceModuleModal";
import type { CommunityResourcesPanel as CommunityResourcesPanelType } from "./CommunityResourcesPanel";
import type { WebCommunityKnowledgePanel as WebCommunityKnowledgePanelType } from "./WebCommunityKnowledgePanel";
import type { WebCommunitySettingsSection as WebCommunitySettingsSectionType } from "./WebCommunitySettingsSection";

const WebCommunityAnalyticsSection = lazy(() =>
  import("./WebCommunityAnalyticsSection").then((module) => ({ default: module.WebCommunityAnalyticsSection })),
);
const WebCommunityEventsSection = lazy(() =>
  import("./WebCommunityEventsSection").then((module) => ({ default: module.WebCommunityEventsSection })),
);
const WebCommunityPodsSection = lazy(() =>
  import("./WebCommunityPodsSection").then((module) => ({ default: module.WebCommunityPodsSection })),
);
const WebCommunityDiscoverPage = lazy(() =>
  import("./WebCommunityDiscoverPage").then((module) => ({ default: module.WebCommunityDiscoverPage })),
);
const WebCommunityKnowledgePanel = lazy(() =>
  import("./WebCommunityKnowledgePanel").then((module) => ({ default: module.WebCommunityKnowledgePanel })),
);
const WebCommunitySettingsSection = lazy(() =>
  import("./WebCommunitySettingsSection").then((module) => ({ default: module.WebCommunitySettingsSection })),
);

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settings: Omit<
    ComponentProps<typeof WebCommunitySettingsSectionType>,
    "state" | "actions" | "aiAgentProps" | "externalWebsite"
  > & {
    state: ComponentProps<typeof WebCommunitySettingsSectionType>["state"];
    actions: Omit<
      ComponentProps<typeof WebCommunitySettingsSectionType>["actions"],
      | "openCommunityBannerFocusModal"
      | "closeCommunityBannerFocusModal"
      | "openCommunityAvatarFocusModal"
      | "closeCommunityAvatarFocusModal"
      | "communityInitials"
      | "slugifyCommunityName"
    >;
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
  aiAgent: ComponentProps<typeof WebCommunityAiAgentSectionType>;
  analytics: ComponentProps<typeof WebCommunityAnalyticsSectionType>;
  resources: ComponentProps<typeof CommunityResourcesPanelType>;
  knowledge: ComponentProps<typeof WebCommunityKnowledgePanelType>["context"];
  events: ComponentProps<typeof WebCommunityEventsSectionType>;
  pods: WebCommunityPodsSectionProps;
  discover: WebCommunityDiscoverPageProps;
  resourceModuleModal: ComponentProps<typeof WebCommunityResourceModuleModal>;
  resourceModuleDeleteModal: ComponentProps<typeof WebDeleteResourceModuleModal>;
};

function renderCenteredPane(children: ReactNode) {
  return <CommunityPageFrame><Suspense fallback={null}>{children}</Suspense></CommunityPageFrame>;
}

export function WebCommunitySecondaryPanels(props: WebCommunitySecondaryPanelsProps) {
  const settingsSectionProps: ComponentProps<typeof WebCommunitySettingsSectionType> = {
    ...props.settings,
    aiAgentProps: props.aiAgent,
    actions: {
      ...props.settings.actions,
      openCommunityAvatarFocusModal: () => props.settings.setIsCommunityAvatarFocusModalOpen(true),
      closeCommunityAvatarFocusModal: () => props.settings.setIsCommunityAvatarFocusModalOpen(false),
      openCommunityBannerFocusModal: () => props.settings.setIsCommunityBannerFocusModalOpen(true),
      closeCommunityBannerFocusModal: () => props.settings.setIsCommunityBannerFocusModalOpen(false),
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

      {props.communityTab === "analytics" &&
        renderCenteredPane(<WebCommunityAnalyticsSection {...props.analytics} />)}

      {props.communityTab === "resources" ? (
        <>
          {renderCenteredPane(<WebCommunityKnowledgePanel key={props.knowledge.communityId} context={props.knowledge} resources={props.resources} />)}
          <WebCommunityResourceModuleModal {...props.resourceModuleModal} />
          <WebDeleteResourceModuleModal {...props.resourceModuleDeleteModal} />
        </>
      ) : null}

      {props.communityTab === "events" &&
        renderCenteredPane(<WebCommunityEventsSection {...props.events} />)}

      {props.communityTab === "pods" &&
        renderCenteredPane(<WebCommunityPodsSection {...props.pods} />)}

      {props.communityTab === "discover" &&
        renderCenteredPane(<WebCommunityDiscoverPage {...props.discover} />)}

    </>
  );
}
