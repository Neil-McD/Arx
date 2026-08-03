import type { WebAppMainSurfaceHostProps } from "./WebAppMainSurfaceHost";
import { WebCommunityInteractionBootstrap } from "./WebCommunityInteractionBootstrap";

export function WebAppMainSurfaceFallback(props: WebAppMainSurfaceHostProps) {
  const isCommunitySurface =
    !props.showPublicCommunityFunnel && props.activePage === "community";

  return (
    <main
      className={`workspace${
        props.showPublicCommunityFunnel || props.activePage !== "settings"
          ? " community-mode"
          : ""
      }`}
    >
      {isCommunitySurface ? (
        <div className="community-body">
          <div className="community-chat community-member-chat">
            <div className="workspace-body chat-feed">
              <div className="community-interaction-scroll">
                <WebCommunityInteractionBootstrap />
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
