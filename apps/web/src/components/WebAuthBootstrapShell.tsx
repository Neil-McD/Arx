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
                className="workspace-bootstrap-composer-shell"
                aria-busy="true"
                aria-live="polite"
              >
                <div className="workspace-bootstrap-composer">
                  <div className="workspace-bootstrap-label">Restoring workspace</div>
                  <div
                    className="workspace-bootstrap-progress web-skeleton-pill"
                    aria-hidden="true"
                  />
                  <div className="workspace-bootstrap-footer" aria-hidden="true">
                    <div className="workspace-bootstrap-chip web-skeleton-pill" />
                    <div className="workspace-bootstrap-actions">
                      <div className="workspace-bootstrap-action-ghost web-skeleton-pill" />
                      <div className="workspace-bootstrap-send web-skeleton-card" />
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
