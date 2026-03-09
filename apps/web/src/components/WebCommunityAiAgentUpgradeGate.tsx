import { DEFAULT_EMPTY_THREAD_LANDING } from "../../../../shared/communityAgentLanding";

type WebCommunityAiAgentUpgradeGateProps = {
  isActiveCommunityOwner: boolean;
  onUpgrade: () => void;
};

export function WebCommunityAiAgentUpgradeGate(props: WebCommunityAiAgentUpgradeGateProps) {
  const { isActiveCommunityOwner, onUpgrade } = props;
  const previewLanding = DEFAULT_EMPTY_THREAD_LANDING;
  const previewTab = previewLanding.tabs[0];
  const previewPrompts = previewTab?.prompts ?? [];

  return (
    <div className="premium-gate-shell">
      <div className="premium-gate-blur" aria-hidden="true">
        <div className="agent-editor-grid">
          <div className="settings-section">
            <div className="settings-section-title">Templates</div>
            <label className="create-community-field" style={{ marginTop: 10 }}>
              <span>Template</span>
              <select className="select-styled" disabled>
                <option>Template 1 (Live)</option>
                <option>Template 2</option>
                <option>Template 3</option>
              </select>
            </label>
            <div className="model-note" style={{ marginTop: 12 }}>
              Set your empty-thread landing prompts and a community system prompt.
            </div>
            <div className="model-list" style={{ marginTop: 12 }}>
              <label className="model-field">
                <span>System prompt</span>
                <textarea value={"You are the community assistant."} readOnly rows={3} />
              </label>
            </div>
          </div>

          <div className="agent-editor-preview">
            <div className="agent-preview-shell" aria-label="Preview">
              <div className="web-empty-thread-title">{previewLanding.title}</div>
              <div className="web-empty-thread-subtitle">{previewLanding.subtitle}</div>
              {previewLanding.tabs.length > 1 && (
                <div className="web-starter-tabs" role="tablist" aria-label="Preview tabs">
                  {previewLanding.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`web-starter-tab${tab.id === previewTab?.id ? " active" : ""}`}
                      aria-pressed={tab.id === previewTab?.id}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="web-starter-list" role="list">
                {previewPrompts.map((prompt) => (
                  <div key={prompt} className="web-starter-row is-preview" role="listitem">
                    <span className="web-starter-row-text">{prompt}</span>
                    <span className="web-starter-row-arrow" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="premium-gate-overlay">
        <div className="premium-gate-card">
          <div className="premium-gate-eyebrow">BUILDER</div>
          <div className="premium-gate-title">For Builder members only</div>
          <div className="model-note" style={{ marginTop: 8 }}>
            Upgrade to Builder ($60/mo) to customize the empty-thread landing page and a
            community system prompt.
          </div>
          {isActiveCommunityOwner ? (
            <div className="create-community-actions" style={{ marginTop: 12 }}>
              <button
                className="premium-gate-cta"
                type="button"
                onClick={onUpgrade}
              >
                Upgrade to Builder
              </button>
            </div>
          ) : (
            <div className="model-note" style={{ marginTop: 12 }}>
              Ask the community owner to upgrade to Builder.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
