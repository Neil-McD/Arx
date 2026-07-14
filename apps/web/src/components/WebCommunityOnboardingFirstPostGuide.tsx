export function WebCommunityOnboardingFirstPostGuide(props: {
  communityName: string;
  descriptionId: string;
  isComplete: boolean;
  isPending: boolean;
  isPreview: boolean;
  error: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div className="community-onboarding-first-post-overlay" aria-hidden="true" />
      <aside
        className={`community-onboarding-first-post-guide${props.isComplete ? " is-complete" : ""}`}
        aria-label="Introduction guidance"
        aria-live="polite"
      >
        <div className="community-onboarding-first-post-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3.5 13.7 8l4.8 1.7-4.8 1.7L12 16l-1.7-4.6-4.8-1.7L10.3 8 12 3.5Z" />
            <path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
          </svg>
        </div>
        <div className="community-onboarding-first-post-copy">
          <span>Step 2 of 3</span>
          <strong>
            {props.isComplete
              ? props.isPreview
                ? "That’s a strong introduction."
                : "Nice — your introduction is live."
              : `Introduce yourself to ${props.communityName}`}
          </strong>
          <p id={props.descriptionId}>
            {props.isComplete
              ? "You’ve taken your first community action. Next, use your personal agent in this community."
              : "The composer is ready for you. Finish or edit the introduction in your own words, then send it to the community."}
          </p>
          {props.isPreview && !props.isComplete ? (
            <small>Preview sends are simulated and will not post to the community.</small>
          ) : null}
          {props.error ? <small role="alert">{props.error}</small> : null}
        </div>
        <div className="community-onboarding-first-post-actions">
          {props.isComplete ? (
            <button className="primary" type="button" onClick={props.onContinue}>
              Meet my personal agent
            </button>
          ) : null}
          <button type="button" onClick={props.onDismiss} disabled={props.isPending}>
            {props.isPending ? "Skipping…" : "Skip onboarding"}
          </button>
        </div>
      </aside>
    </>
  );
}
