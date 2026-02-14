type VoiceUiState = "idle" | "recording" | "transcribing";

type VoiceInputButtonProps = {
  state: VoiceUiState;
  title: string;
  onClick: () => void;
};

export function VoiceInputButton({ state, title, onClick }: VoiceInputButtonProps) {
  return (
    <button
      className={`ask-icon-btn ask-mic ${state}`}
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-pressed={state === "recording"}
      aria-busy={state === "transcribing"}
      title={title}
    >
      <span className="ask-mic-ripple" aria-hidden="true" />
      {state === "transcribing" ? (
        <span className="ask-mic-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <svg className="ask-mic-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3z" />
          <path d="M19 11a7 7 0 0 1-14 0" />
          <path d="M12 18v4" />
          <path d="M8 22h8" />
        </svg>
      )}
    </button>
  );
}
