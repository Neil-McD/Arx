import type { ReactNode } from "react";

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
        <div className="community-chat-page-loading-shell">
          <div
            className={`community-chat-page-loading-card${
              props.quiet ? " is-quiet" : ""
            }`}
          >
            {!props.quiet ? (
              <>
                <div className="community-chat-page-loading-title">Opening community…</div>
                <div className="community-chat-page-loading-copy">
                  Resolving the selected community and preparing chat.
                </div>
              </>
            ) : null}
            <div
              className="community-chat-page-loading-progress web-skeleton-pill"
              aria-hidden="true"
            />
          </div>
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
