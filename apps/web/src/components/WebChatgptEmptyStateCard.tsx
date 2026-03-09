type WebChatgptEmptyStateCardProps = {
  buttonLabel: string;
  disabled: boolean;
  onConnect: () => void;
};

export function WebChatgptEmptyStateCard(props: WebChatgptEmptyStateCardProps) {
  const { buttonLabel, disabled, onConnect } = props;

  return (
    <div className="web-empty-thread-chatgpt-card-wrap">
      <div className="web-empty-thread-chatgpt-card">
        <div className="web-empty-thread-chatgpt-copy">
          <div className="web-empty-thread-chatgpt-text">
            <div className="web-empty-thread-chatgpt-title">ChatGPT Plus / Pro</div>
            <div className="web-empty-thread-chatgpt-description">
              Authenticate to use your ChatGPT Plus / Pro account rate limits.
            </div>
          </div>
        </div>
        <div className="web-empty-thread-chatgpt-actions">
          <button
            className="platform-save-button platform-save-button--compact"
            type="button"
            onClick={onConnect}
            disabled={disabled}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
