import type { CSSProperties } from "react";
import type {
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../../shared/communityLaunchSetup";

type WebCommunityLaunchSetupCardProps = {
  status: CommunityLaunchSetupStatus;
  communityName: string;
  onContinueSetup: () => void;
};

const STEP_DESCRIPTIONS: Record<CommunityLaunchSetupStep, string> = {
  profile: "Add the public profile pieces.",
  about: "Add the about section.",
  agent: "Configure the community agent.",
  workflows: "Connect a skill, app, or workflow.",
  access: "Choose the access model.",
  knowledge: "Prepare resources and source systems.",
  publish: "Publish when ready.",
};

function formatSetupCardDescription(status: CommunityLaunchSetupStatus): string {
  if (status.completed) return "Launch setup complete.";
  if (status.current_step === "complete") return "Launch setup complete.";
  return STEP_DESCRIPTIONS[status.current_step];
}

export function WebCommunityLaunchSetupCard(
  props: WebCommunityLaunchSetupCardProps,
) {
  const { status, communityName, onContinueSetup } = props;
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
          <div className="web-empty-thread-setup-title">Community launch</div>
          <div className="web-empty-thread-setup-description">
            {progress}% complete · {formatSetupCardDescription(status)}
          </div>
        </div>
        <div className="web-empty-thread-setup-actions">
          <button
            className="platform-save-button platform-save-button--compact"
            type="button"
            onClick={onContinueSetup}
            aria-label={`Continue ${communityName} launch setup`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
