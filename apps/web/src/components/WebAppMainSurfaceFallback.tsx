import type { WebAppMainSurfaceHostProps } from "./WebAppMainSurfaceHost";
import { WebCommunityInteractionBootstrap } from "./WebCommunityInteractionBootstrap";

export function WebAppMainSurfaceFallback(
  props: WebAppMainSurfaceHostProps & { quiet?: boolean },
) {
  const isCommunitySurface =
    !props.showPublicCommunityFunnel && props.activePage === "community";

  // A channel's skeleton (posts and a message box) is only right for a channel.
  const isChannel = props.communityHostProps.communityTab === "chat"
    && props.communityHostProps.activeView === "home";

  return (
    <main
      className={`workspace${
        props.showPublicCommunityFunnel || props.activePage !== "settings"
          ? " community-mode"
          : ""
      }`}
    >
      {isCommunitySurface && !isChannel ? (
        // Any page but a channel: an empty page in the page's own colour, not
        // a channel's skeleton that the real page then replaces.
        <div className="community-body community-loading-neutral" aria-busy="true" />
      ) : isCommunitySurface ? (
        <div className="community-body">
          <div className="community-chat community-member-chat">
            <div className="workspace-body chat-feed">
              <div className="community-interaction-scroll">
                <WebCommunityInteractionBootstrap quiet={props.quiet} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="landing-auth-hold" aria-hidden="true" />
      )}
    </main>
  );
}
