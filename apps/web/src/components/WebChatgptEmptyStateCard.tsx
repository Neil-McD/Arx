type WebChatgptEmptyStateCardProps = {
  chatgptButtonLabel: string;
  isChatgptDisabled: boolean;
  onConnectChatgpt: () => void;
  onAddOpenAiKey: () => void;
};

export function WebChatgptEmptyStateCard(props: WebChatgptEmptyStateCardProps) {
  const {
    chatgptButtonLabel,
    isChatgptDisabled,
    onAddOpenAiKey,
    onConnectChatgpt,
  } = props;

  return (
    <div className="web-empty-thread-chatgpt-card-wrap">
      <div className="web-empty-thread-chatgpt-card">
        <div className="web-empty-thread-chatgpt-copy">
          <div className="web-empty-thread-chatgpt-text">
            <div className="web-empty-thread-chatgpt-title">Connect an inference provider</div>
            <div className="web-empty-thread-chatgpt-description">
              Use ChatGPT Plus / Pro rate limits with no extra Polynet inference charge, or add an OpenAI API key billed directly through OpenAI.
            </div>
          </div>
        </div>
        <div className="web-empty-thread-chatgpt-actions">
          <button
            className="platform-save-button platform-save-button--compact"
            type="button"
            onClick={onConnectChatgpt}
            disabled={isChatgptDisabled}
          >
            {chatgptButtonLabel}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={onAddOpenAiKey}
          >
            Add OpenAI key
          </button>
        </div>
      </div>
    </div>
  );
}
