import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import type { CommunityAdmissionControl } from "./CommunityAutoJoinControl";
import { WebCommunitySecondaryPanels, type WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";
import { WebCommunityMembersPage } from "./WebCommunityMembersPage";

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
      ) : communityTab === "members" ? (
        <WebCommunityMembersPage chatPanelProps={chatPanelProps} admission={props.admission} />
      ) : (
        <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
      )}
    </div>
  );
}
