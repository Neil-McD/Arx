import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";

export function WebCommunityOnboardingPreviewBar(props: {
  session: CommunityOnboardingSession | null;
  configuredEnabled: boolean | null;
  isLoading: boolean;
  error: string | null;
  onExit: () => void;
}) {
  const phase = props.session?.phase ?? null;

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
              : phase === "complete"
                ? "Preview complete · No community post was created"
              : props.configuredEnabled === false
                ? "Currently off · Community posts are simulated"
                : "Community posts are simulated · Your personal agent uses your account"}
        </span>
      </div>
      <div className="community-onboarding-preview-bar-actions">
        <button type="button" className="secondary" onClick={props.onExit}>
          Exit preview
        </button>
      </div>
    </div>
  );
}
