export function WebCommunityOnboardingFirstPostGuide(props: {
  communityName: string;
  descriptionId: string;
  isPending: boolean;
  error: string | null;
  onDismiss: () => void;
}) {
  return (
    <aside className="community-onboarding-first-post-guide" aria-label="First post guidance">
      <div className="community-onboarding-first-post-copy">
        <span>Your first step</span>
        <strong>Introduce yourself to {props.communityName}</strong>
        <p id={props.descriptionId}>
          Share what you’re working on, why you joined, and what would be useful from the room.
        </p>
        {props.error ? <small role="alert">{props.error}</small> : null}
      </div>
      <button type="button" onClick={props.onDismiss} disabled={props.isPending}>
        {props.isPending ? "Skipping…" : "Skip onboarding"}
      </button>
    </aside>
  );
}
