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
            <div className="workspace-body">
              <div className="chat-loading">
                <div className="loading-spinner" />
                <span>Loading workspace...</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
