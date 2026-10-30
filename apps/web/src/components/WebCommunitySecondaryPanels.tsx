import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { communityInitials } from "../../../../shared/messageMetadataUi";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import { WebCommunityAboutPage } from "./WebCommunityAboutPage";
import type { WebCommunityAnalyticsSection } from "./WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./WebCommunityAiAgentSection";
import { WebCommunityAvatarEditorModal } from "./WebCommunityAvatarEditorModal";
import { WebCommunityBannerEditorModal } from "./WebCommunityBannerEditorModal";
import { WebCommunityEventsSection } from "./WebCommunityEventsSection";
import { WebDeleteResourceModuleModal } from "./WebDeleteResourceModuleModal";
import { WebCommunityResourceModuleModal } from "./WebCommunityResourceModuleModal";
import { CommunityResourcesPanel } from "./CommunityResourcesPanel";
import { WebCommunityKnowledgePanel } from "./WebCommunityKnowledgePanel";
import { WebCommunitySettingsSection } from "./WebCommunitySettingsSection";
import type { WebCommunityWorkflowsSection } from "./WebCommunityWorkflowsSection";
import { WebCommunityPageBack } from "./WebCommunityPageBack";

// Workflows, People and Analytics are for the owner and their team only, so
// they load on demand and never reach members (scripts/web_bundle_budget_check.mjs).
const LazyWorkflowsSection = lazy(() =>
  import("./WebCommunityWorkflowsSection").then((module) => ({ default: module.WebCommunityWorkflowsSection })));
const LazyMembers = lazy(() =>
  import("./WebCommunityMembers").then((module) => ({ default: module.WebCommunityMembers })));
const LazyAnalyticsSection = lazy(() =>
  import("./WebCommunityAnalyticsSection").then((module) => ({ default: module.WebCommunityAnalyticsSection })));

export type WebCommunitySecondaryPanelsProps = {
  communityTab: CommunityTab;
  settings: Omit<
    ComponentProps<typeof WebCommunitySettingsSection>,
    "state" | "actions" | "aiAgentProps" | "externalWebsite" | "funnel"
  > & {
    state: ComponentProps<typeof WebCommunitySettingsSection>["state"];
    actions: Omit<
      ComponentProps<typeof WebCommunitySettingsSection>["actions"],
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
  aiAgent: ComponentProps<typeof WebCommunityAiAgentSection>;
  workflows: ComponentProps<typeof WebCommunityWorkflowsSection>;
  analytics: ComponentProps<typeof WebCommunityAnalyticsSection>;
  resources: ComponentProps<typeof CommunityResourcesPanel>;
  knowledge: ComponentProps<typeof WebCommunityKnowledgePanel>["context"];
  events: ComponentProps<typeof WebCommunityEventsSection>;
  resourceModuleModal: ComponentProps<typeof WebCommunityResourceModuleModal>;
  resourceModuleDeleteModal: ComponentProps<typeof WebDeleteResourceModuleModal>;
};

function renderCenteredPane(children: ReactNode) {
  return (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
}

function renderWorkspacePane(children: ReactNode) {
  return (
    <div className="community-tab-workspace">
      <div className="web-community-centered-pane web-community-centered-pane-workspace">
        <Suspense fallback={null}>{children}</Suspense>
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

      {props.communityTab === "workflows" &&
        renderWorkspacePane(<LazyWorkflowsSection {...props.workflows} />)}

      {props.communityTab === "people" &&
        renderWorkspacePane(props.workflows.access
          ? <div className="pn-page-with-back"><WebCommunityPageBack /><LazyMembers key={props.workflows.access.scopeKey} gateway={props.workflows.access} /></div>
          : <p role="status">Only the community's owner and admins can see members.</p>)}

      {props.communityTab === "analytics" &&
        renderCenteredPane(<div className="pn-page-with-back"><WebCommunityPageBack /><LazyAnalyticsSection {...props.analytics} /></div>)}

      {props.communityTab === "resources" ? (
        <>
          {renderCenteredPane(<WebCommunityKnowledgePanel key={props.knowledge.communityId} context={props.knowledge} resources={props.resources} />)}
          <WebCommunityResourceModuleModal {...props.resourceModuleModal} />
          <WebDeleteResourceModuleModal {...props.resourceModuleDeleteModal} />
        </>
      ) : null}

      {props.communityTab === "events" &&
        renderCenteredPane(<WebCommunityEventsSection {...props.events} />)}

      {props.communityTab === "about" && <WebCommunityAboutPage />}

    </>
  );
}
