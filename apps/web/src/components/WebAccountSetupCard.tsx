import type { AccountSetupStatus } from "../../../../shared/accountSetup";

type WebAccountSetupCardProps = {
  status: AccountSetupStatus;
  onContinueSetup: () => void;
};

function formatSetupCardDescription(status: AccountSetupStatus): string {
  if (status.completed) return "Account setup complete.";
  if (status.current_step === "identity") {
    const needsName = status.missing.includes("display_name");
    const needsAvatar = status.missing.includes("avatar");
    if (needsName && needsAvatar) return "Add your name and profile image.";
    if (needsName) return "Add your name.";
    if (needsAvatar) return "Add your profile image.";
    return "Finish your profile.";
  }
  if (status.current_step === "inference") return "Connect ChatGPT or add an OpenAI API key.";
  if (status.current_step === "agent") return "Name your agent.";
  return "Choose where you want to start.";
}

export function WebAccountSetupCard(props: WebAccountSetupCardProps) {
  const { status, onContinueSetup } = props;
  const progress = Math.max(0, Math.min(100, status.percent));
  const circumference = 2 * Math.PI * 17;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="web-empty-thread-setup-card-wrap">
      <div className="web-empty-thread-setup-card">
        <div className="web-empty-thread-setup-progress" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <circle className="track" cx="20" cy="20" r="17" />
            <circle
              className="value"
              cx="20"
              cy="20"
              r="17"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span>{progress}%</span>
        </div>
        <div className="web-empty-thread-setup-copy">
          <div className="web-empty-thread-setup-title">Finish account setup</div>
          <div className="web-empty-thread-setup-description">
            {progress}% complete · {formatSetupCardDescription(status)}
          </div>
        </div>
        <div className="web-empty-thread-setup-actions">
          <button
            className="platform-save-button platform-save-button--compact"
            type="button"
            onClick={onContinueSetup}
          >
            Finish
          </button>
        </div>
      </div>
    </div>
  );
}
