import { useCallback, useEffect, useRef } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { WebCommunitySecondaryPanels, type WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

type WebCommunityHostProps = {
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
  onSelectCommunityTab?: (tab: CommunityTab) => void;
  firstPostFocusRequest?: number;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { communityTab, chatPanelProps, secondaryPanelsProps } = props;
  const shouldFocusFirstPostComposerRef = useRef(false);
  const handledFirstPostFocusRequestRef = useRef(0);

  const focusFirstPostComposer = useCallback(() => {
    const input = chatPanelProps.chatInputRef.current;
    if (!input || input.disabled) return false;
    shouldFocusFirstPostComposerRef.current = false;
    window.requestAnimationFrame(() => {
      if (document.contains(input) && !input.disabled) {
        input.focus({ preventScroll: true });
      }
    });
    return true;
  }, [chatPanelProps.chatInputRef]);

  useEffect(() => {
    const request = Math.max(0, Math.floor(props.firstPostFocusRequest ?? 0));
    if (request <= handledFirstPostFocusRequestRef.current) return;
    handledFirstPostFocusRequestRef.current = request;
    shouldFocusFirstPostComposerRef.current = true;
    if (communityTab !== "chat") {
      props.onSelectCommunityTab?.("chat");
      return;
    }
    focusFirstPostComposer();
  }, [
    communityTab,
    focusFirstPostComposer,
    props.firstPostFocusRequest,
    props.onSelectCommunityTab,
  ]);

  useEffect(() => {
    if (communityTab === "chat" && shouldFocusFirstPostComposerRef.current) {
      focusFirstPostComposer();
    }
  }, [
    chatPanelProps.canPostMessages,
    chatPanelProps.isAuthRecoveringSignedIn,
    chatPanelProps.isProfileSetupComplete,
    communityTab,
    focusFirstPostComposer,
  ]);

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
