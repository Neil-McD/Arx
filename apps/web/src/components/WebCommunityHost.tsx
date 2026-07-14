import { useCallback, useEffect, useRef } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { WebCommunityChatPanel, type WebCommunityChatPanelProps } from "./WebCommunityChatPanel";
import { WebCommunityOnboardingController } from "./WebCommunityOnboardingController";
import { WebCommunitySecondaryPanels, type WebCommunitySecondaryPanelsProps } from "./WebCommunitySecondaryPanels";

type WebCommunityHostProps = {
  communityTab: CommunityTab;
  chatPanelProps: WebCommunityChatPanelProps;
  secondaryPanelsProps: WebCommunitySecondaryPanelsProps;
  ensureSession?: (session: any) => Promise<any | null>;
  onSelectCommunityTab?: (tab: CommunityTab) => void;
};

export function WebCommunityHost(props: WebCommunityHostProps) {
  const { communityTab, chatPanelProps, secondaryPanelsProps } = props;
  const shouldFocusFirstPostComposerRef = useRef(false);

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

  const handleOrientationCompleted = useCallback(() => {
    shouldFocusFirstPostComposerRef.current = true;
    if (communityTab !== "chat") {
      props.onSelectCommunityTab?.("chat");
      return;
    }
    focusFirstPostComposer();
  }, [communityTab, focusFirstPostComposer, props.onSelectCommunityTab]);

  useEffect(() => {
    if (communityTab === "chat" && shouldFocusFirstPostComposerRef.current) {
      focusFirstPostComposer();
    }
  }, [
    chatPanelProps.canPostMessages,
    chatPanelProps.hasResolvedCommunityChat,
    chatPanelProps.isAuthRecoveringSignedIn,
    chatPanelProps.isProfileSetupComplete,
    communityTab,
    focusFirstPostComposer,
  ]);

  return (
    <div className="community-body">
      <WebCommunityOnboardingController
        session={chatPanelProps.session}
        ensureSession={props.ensureSession}
        communityId={chatPanelProps.activeCommunity?.id ?? null}
        communityName={chatPanelProps.activeCommunity?.name ?? null}
        isEnabled={chatPanelProps.hasAuthenticatedPresentation && chatPanelProps.hasSession}
        onOrientationCompleted={handleOrientationCompleted}
      >
        {communityTab === "chat" ? (
          <WebCommunityChatPanel {...chatPanelProps} />
        ) : (
          <WebCommunitySecondaryPanels {...secondaryPanelsProps} />
        )}
      </WebCommunityOnboardingController>
    </div>
  );
}
