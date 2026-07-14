import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";

export function WebCommunityOnboardingPreviewBar(props: {
  session: CommunityOnboardingSession | null;
  configuredEnabled: boolean | null;
  isLoading: boolean;
  error: string | null;
  onAdvance: () => void;
  onExit: () => void;
}) {
  const phase = props.session?.phase ?? null;
  const actionLabel =
    phase === "first_agent_dock_turn" ? "Finish preview" : null;

  return (
    <div className="community-onboarding-preview-bar">
      <div
        className="community-onboarding-preview-bar-copy"
        role="status"
        aria-live="polite"
      >
        <strong>Onboarding preview</strong>
        <span>
          {props.error
            ? props.error
            : props.isLoading
              ? "Loading the saved workflow…"
              : props.configuredEnabled === false
                ? "Currently off · Preview actions are simulated"
                : "Community posts are simulated · Concierge messages stay private"}
        </span>
      </div>
      <div className="community-onboarding-preview-bar-actions">
        {actionLabel ? (
          <button
            type="button"
            onClick={props.onAdvance}
            disabled={props.isLoading || Boolean(props.error)}
          >
            {actionLabel}
          </button>
        ) : null}
        <button type="button" className="secondary" onClick={props.onExit}>
          Exit preview
        </button>
      </div>
    </div>
  );
}
