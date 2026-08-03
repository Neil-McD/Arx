import type { ReactNode } from "react";

export function WebCommunityInteractionBootstrap(props: {
  mainComposer?: ReactNode;
}) {
  return (
    <div
      className="community-interaction-projection has-context-panel community-interaction-bootstrap"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="community-interaction-main">
        <div className="community-chat-page-loading-shell">
          <div className="community-chat-page-loading-card">
            <div className="community-chat-page-loading-title">Opening community…</div>
            <div className="community-chat-page-loading-copy">
              Resolving the selected community and preparing chat.
            </div>
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
      <aside className="community-context-panel" aria-label="Community">
        <div className="community-context-rail">
          <div className="community-context-rail-head">
            <div className="community-chat-page-loading-title">Community</div>
          </div>
          <div className="community-interaction-bootstrap-context" aria-hidden="true">
            <div className="web-skeleton-pill" />
            <div className="web-skeleton-pill" />
            <div className="web-skeleton-pill" />
          </div>
        </div>
      </aside>
    </div>
  );
}
