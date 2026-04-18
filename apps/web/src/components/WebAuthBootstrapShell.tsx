type WebAuthBootstrapShellProps = {
  showCommunityChatBootstrapShell: boolean;
  isCommunityMode: boolean;
};

export function WebAuthBootstrapShell(props: WebAuthBootstrapShellProps) {
  return (
    <div className="app-root auth-bootstrap-shell">
      <div className="app-shell no-left no-right">
        <main className={`workspace${props.isCommunityMode ? " community-mode" : ""}`}>
          {props.showCommunityChatBootstrapShell ? (
            <div className="community-body">
              <div className="community-chat community-chat-bootstrap">
                <div className="workspace-body chat-feed">
                  <div
                    className="community-chat-page-loading-shell"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <div className="community-chat-page-loading-card">
                      <div className="community-chat-page-loading-title">
                        Opening community…
                      </div>
                      <div className="community-chat-page-loading-copy">
                        Restoring your session and preparing community chat.
                      </div>
                      <div
                        className="community-chat-page-loading-progress web-skeleton-pill"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="workspace-body workspace-bootstrap-body">
              <div
                className="workspace-bootstrap-thread"
                aria-busy="true"
                aria-live="polite"
              >
                <div className="workspace-bootstrap-status">
                  <span className="workspace-bootstrap-status-dot" aria-hidden="true" />
                  <span>Restoring workspace</span>
                </div>
                <div className="web-thread-loading-shell" aria-hidden="true">
                  <div className="web-thread-loading-message">
                    <div className="web-thread-loading-avatar web-skeleton-card" />
                    <div className="web-thread-loading-stack">
                      <div className="web-thread-loading-meta web-skeleton-pill" />
                      <div className="web-thread-loading-bubble web-skeleton-card" />
                      <div className="web-thread-loading-row web-skeleton-row web-thread-loading-row-medium" />
                    </div>
                  </div>
                  <div className="web-thread-loading-message">
                    <div className="web-thread-loading-avatar web-skeleton-card" />
                    <div className="web-thread-loading-stack">
                      <div className="web-thread-loading-meta web-thread-loading-meta-wide web-skeleton-pill" />
                      <div className="web-thread-loading-bubble web-thread-loading-bubble-tall web-skeleton-card" />
                      <div className="web-thread-loading-row web-skeleton-row web-thread-loading-row-short" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="workspace-bootstrap-composer-shell" aria-hidden="true">
                <div className="workspace-bootstrap-composer">
                  <div className="workspace-bootstrap-composer-input web-skeleton-row" />
                  <div className="workspace-bootstrap-composer-footer">
                    <div className="workspace-bootstrap-composer-pill web-skeleton-pill" />
                    <div className="workspace-bootstrap-composer-actions">
                      <div className="workspace-bootstrap-composer-pill workspace-bootstrap-composer-pill-small web-skeleton-pill" />
                      <div className="workspace-bootstrap-composer-send web-skeleton-card" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
