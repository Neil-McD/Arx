import { lazy, Suspense, useEffect } from "react";
import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { CommunityAdmissionControl } from "./CommunityAutoJoinControl";
import type { WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";
import { SurfaceErrorBoundary } from "./SurfaceErrorBoundary";
import { resilientImport, scheduleIdlePrefetch } from "../lib/resilientLazy";

const loadSecondaryPanels = () => import("./WebCommunitySecondaryPanels");
const loadMembersPage = () => import("./WebCommunityMembersPage");

const WebCommunitySecondaryPanels = lazy(() =>
  resilientImport(loadSecondaryPanels).then((module) => ({
    default: module.WebCommunitySecondaryPanels,
  })),
);
const WebCommunityMembersPage = lazy(() =>
  resilientImport(loadMembersPage).then((module) => ({
    default: module.WebCommunityMembersPage,
  })),
);

const COMMUNITY_TAB_PREFETCH_LOADERS = [
  loadSecondaryPanels,
  loadMembersPage,
  () => import("./WebCommunityKnowledgePanel"),
  () => import("./WebCommunityEventsSection"),
  () => import("./WebCommunityPodsSection"),
  () => import("./WebCommunitySettingsSection"),
  () => import("./WebCommunityAnalyticsSection"),
  () => import("./WebCommunityDiscoverPage"),
];

type WebCommunityHostProps = {
  admission?: CommunityAdmissionControl;
  activeView: AppView;
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { communityTab, chatPanelProps, secondaryPanelsProps } = props;

  useEffect(() => scheduleIdlePrefetch(COMMUNITY_TAB_PREFETCH_LOADERS), []);

  return (
    <div className="community-body">
      <SurfaceErrorBoundary resetKey={communityTab}>
        {communityTab === "chat" ? (
          <WebCommunityChatPanel {...chatPanelProps} interactionProjection={chatPanelProps.interactionProjection
            ? { ...chatPanelProps.interactionProjection, admission: props.admission } : undefined} />
        ) : communityTab === "inbox" ? (
          // Inbox draws itself (WebDirectMessagesHost, as a page); nothing
          // loads underneath it.
          null
        ) : communityTab === "members" ? (
          <Suspense fallback={null}>
            <WebCommunityMembersPage chatPanelProps={chatPanelProps} admission={props.admission} />
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
          </Suspense>
        )}
      </SurfaceErrorBoundary>
    </div>
  );
}
