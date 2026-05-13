import type { CSSProperties } from "react";
import type { AccountSetupStatus } from "../../../../shared/accountSetup";

type WebAccountSetupCardProps = {
  status: AccountSetupStatus;
  onContinueSetup: () => void;
};

function formatSetupCardDescription(status: AccountSetupStatus): string {
  if (status.completed) return "Account setup complete.";
  if (status.current_step === "identity") {
    const needsName = status.missing.includes("display_name");
    const needsHandle = status.missing.includes("handle");
    const needsAvatar = status.missing.includes("avatar");
    if (needsName && needsHandle && needsAvatar) return "Add your name, handle, and profile image.";
    if (needsName && needsHandle) return "Add your name and handle.";
    if (needsName && needsAvatar) return "Add your name and profile image.";
    if (needsHandle && needsAvatar) return "Choose your handle and add your profile image.";
    if (needsName) return "Add your name.";
    if (needsHandle) return "Choose your handle.";
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

  return (
    <div className="web-empty-thread-setup-card-wrap">
      <div className="web-empty-thread-setup-card">
        <div
          className="web-empty-thread-setup-progress"
          style={{ "--setup-progress": `${progress}%` } as CSSProperties}
          aria-hidden="true"
        >
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
