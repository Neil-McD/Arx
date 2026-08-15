import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { WebCommunityMembersPanel } from "./WebCommunityMembersPanel";
import { WebCommunitySecondaryPanels, type WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

type WebCommunityHostProps = {
  activeView: AppView;
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { activeView, communityTab, chatPanelProps, secondaryPanelsProps } = props;
  return (
    <div className="community-body">
      {activeView === "community_members" ? (
        <WebCommunityMembersPanel chatPanelProps={chatPanelProps} />
      ) : communityTab === "chat" ? (
        <WebCommunityChatPanel {...chatPanelProps} />
      ) : (
        <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
      )}
    </div>
  );
}
