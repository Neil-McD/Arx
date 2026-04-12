import { Suspense, lazy } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

const WebCommunitySecondaryPanels = lazy(() =>
  import("./WebCommunitySecondaryPanels").then((module) => ({
    default: module.WebCommunitySecondaryPanels,
  })),
);

type WebCommunityHostProps = {
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { communityTab, chatPanelProps, secondaryPanelsProps } = props;

  return (
    <div className="community-body">
      {communityTab === "chat" ? (
        <WebCommunityChatPanel {...chatPanelProps} />
      ) : (
        <Suspense fallback={null}>
          <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
        </Suspense>
      )}
    </div>
  );
}
