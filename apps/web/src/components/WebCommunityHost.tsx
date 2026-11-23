import { lazy, Suspense } from "react";
import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { CommunityAdmissionControl } from "./CommunityAutoJoinControl";
import type { WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

const WebCommunitySecondaryPanels = lazy(() =>
  import("./WebCommunitySecondaryPanels").then((module) => ({
    default: module.WebCommunitySecondaryPanels,
  })),
);
const WebCommunityMembersPage = lazy(() =>
  import("./WebCommunityMembersPage").then((module) => ({
    default: module.WebCommunityMembersPage,
  })),
);

type WebCommunityHostProps = {
  admission?: CommunityAdmissionControl;
  activeView: AppView;
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { communityTab, chatPanelProps, secondaryPanelsProps } = props;
  return (
    <div className="community-body">
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
    </div>
  );
}
