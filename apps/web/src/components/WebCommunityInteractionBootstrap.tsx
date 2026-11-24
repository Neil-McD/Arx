import type { ReactNode } from "react";
import { ChannelFeedSkeleton } from "./WebLoadingSkeleton";

export function WebCommunityInteractionBootstrap(props: {
  mainComposer?: ReactNode;
  quiet?: boolean;
}) {
  return (
    <div
      className="community-interaction-projection community-interaction-bootstrap"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="community-interaction-main">
        <div className="community-interaction-feed-scroll">
          {!props.quiet ? (
            <span className="web-loading-sr">Opening community…</span>
          ) : null}
          <ChannelFeedSkeleton label={null} quiet={props.quiet} />
        </div>
        <div className="community-interaction-main-composer">
          {props.mainComposer ?? (
            <div
              className="community-interaction-bootstrap-composer web-skeleton-block"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}
