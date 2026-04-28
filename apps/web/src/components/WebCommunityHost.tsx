import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import {
  WebCommunitySecondaryPanels,
  type WebCommunitySecondaryPanelsProps,
} from "./WebCommunitySecondaryPanels";

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
        <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
      )}
    </div>
  );
}
