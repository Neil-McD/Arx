import { lazy, Suspense, useEffect } from "react";
import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { CommunityAdmissionControl } from "./communityAdmissionTypes";
import type { WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";
import { SurfaceErrorBoundary } from "./SurfaceErrorBoundary";
import { resilientImport, scheduleIdlePrefetch } from "../lib/resilientLazy";
import {
  CourseCatalogSkeleton,
  EventListSkeleton,
  FormGroupsSkeleton,
  PanelBlockSkeleton,
  PodGridSkeleton,
  TableRowsSkeleton,
} from "./WebLoadingSkeleton";

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

const MEMBER_TAB_PREFETCH_LOADERS = [
  loadSecondaryPanels,
  loadMembersPage,
  () => import("./WebCommunityKnowledgePanel"),
  () => import("./WebCommunityEventsSection"),
  () => import("./WebCommunityPodsSection"),
  () => import("./WebCommunityDiscoverPage"),
];
const HOST_SETTINGS_PREFETCH_LOADERS = [
  () => import("./WebCommunitySettingsSection"),
];
const HOST_ANALYTICS_PREFETCH_LOADERS = [
  () => import("./WebCommunityAnalyticsSection"),
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
  const canManageCommunity = secondaryPanelsProps.aiAgent.canManageMembersActiveCommunity;
  const canViewAnalytics = secondaryPanelsProps.analytics.canViewActiveCommunityAnalytics;

  useEffect(() => scheduleIdlePrefetch(MEMBER_TAB_PREFETCH_LOADERS), []);
  useEffect(() => {
    if (!canManageCommunity) return;
    return scheduleIdlePrefetch(HOST_SETTINGS_PREFETCH_LOADERS);
  }, [canManageCommunity]);
  useEffect(() => {
    if (!canViewAnalytics) return;
    return scheduleIdlePrefetch(HOST_ANALYTICS_PREFETCH_LOADERS);
  }, [canViewAnalytics]);

  const communityKey = secondaryPanelsProps.knowledge.communityId ?? "";

  return (
    <div className="community-body">
      <SurfaceErrorBoundary resetKey={`${communityKey}:${communityTab}`}>
        {communityTab === "chat" ? (
          <WebCommunityChatPanel {...chatPanelProps} interactionProjection={chatPanelProps.interactionProjection
            ? { ...chatPanelProps.interactionProjection, admission: props.admission } : undefined} />
        ) : communityTab === "inbox" ? (
          // Inbox draws itself (WebDirectMessagesHost, as a page); nothing
          // loads underneath it.
          null
        ) : communityTab === "members" ? (
          <Suspense fallback={<div className="web-skeleton-route-fallback"><TableRowsSkeleton label="Loading members…" /></div>}>
            <WebCommunityMembersPage chatPanelProps={chatPanelProps} admission={props.admission} />
          </Suspense>
        ) : (
          <Suspense fallback={
            <div className="web-skeleton-route-fallback">
              {communityTab === "events" ? <EventListSkeleton />
                : communityTab === "pods" ? <PodGridSkeleton />
                : communityTab === "resources" ? <CourseCatalogSkeleton />
                : communityTab === "settings" ? <FormGroupsSkeleton />
                : <PanelBlockSkeleton label={null} />}
            </div>
          }>
            <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
          </Suspense>
        )}
      </SurfaceErrorBoundary>
    </div>
  );
}
