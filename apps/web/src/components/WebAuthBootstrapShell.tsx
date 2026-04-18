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
                className="workspace-composer-shell workspace-bootstrap-composer-shell"
                aria-busy="true"
                aria-live="polite"
              >
                <div className="workspace-composer-lane">
                  <div className="ask-bar ask-bar-v2 workspace-bootstrap-ask-bar">
                    <textarea
                      className="ask-input ask-input-v2 workspace-bootstrap-input"
                      placeholder="Restoring workspace..."
                      value=""
                      readOnly
                      disabled
                      rows={1}
                    />
                    <div className="ask-footer" aria-hidden="true">
                      <div className="ask-footer-left">
                        <button className="ask-icon-btn ask-plus" type="button" disabled>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                        <button className="ask-model-btn workspace-bootstrap-model-btn" type="button" disabled>
                          <span className="ask-model-label">GPT 5.4</span>
                          <svg className="ask-model-chevron" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="m4 6 4 4 4-4" />
                          </svg>
                        </button>
                      </div>
                      <div className="ask-actions">
                        <button className="ask-icon-btn ask-mic" type="button" disabled>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" />
                            <path d="M7 12a5 5 0 1 0 10 0" />
                            <path d="M12 17v3" />
                          </svg>
                        </button>
                        <button className="chat-send ask-send-btn ask-send-btn-v2" type="button" disabled>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
                          </svg>
                        </button>
                      </div>
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
