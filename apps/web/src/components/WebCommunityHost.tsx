import { Suspense, lazy } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

const WebCommunitySecondaryPanels = lazy(async () => {
  const module = await import("./WebCommunitySecondaryPanels");
  return { default: module.WebCommunitySecondaryPanels };
});

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
        <Suspense fallback={<CommunitySecondaryPanelsFallback />}>
          <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
        </Suspense>
      )}
    </div>
  );
}

function CommunitySecondaryPanelsFallback() {
  return (
    <div className="community-tab-scroll">
      <div className="web-community-centered-pane">
        <div className="chat-loading">Loading...</div>
      </div>
    </div>
  );
}
