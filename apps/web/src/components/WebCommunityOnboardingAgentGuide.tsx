export function WebCommunityOnboardingAgentGuide(props: {
  communityName: string;
  descriptionId: string;
  isPending: boolean;
  error: string | null;
  onDismiss: () => void;
}) {
  return (
    <aside className="community-onboarding-agent-guide" aria-label="Agent onboarding guidance">
      <div className="community-onboarding-agent-guide-copy">
        <span>Final step</span>
        <strong>Ask your agent for your next move</strong>
        <p id={props.descriptionId}>
          It already has {props.communityName} context. Ask what to explore first or how you can contribute.
        </p>
        {props.error ? <small role="alert">{props.error}</small> : null}
      </div>
      <button type="button" onClick={props.onDismiss} disabled={props.isPending}>
        {props.isPending ? "Skipping…" : "Skip onboarding"}
      </button>
    </aside>
  );
}
