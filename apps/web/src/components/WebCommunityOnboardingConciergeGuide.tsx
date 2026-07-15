import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";

export function WebCommunityOnboardingConciergeGuide(props: {
  communityName: string;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  descriptionId: string;
  isComplete: boolean;
  isPending: boolean;
  error: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const transcript = props.isComplete
    ? "You’re in. Your introduction is live. Next, let’s meet your personal agent."
    : `Let’s introduce you to ${props.communityName}. I started the message below — finish it in your own words, then send it.`;

  return (
    <>
      <div className="community-onboarding-concierge-overlay" aria-hidden="true" />
      <aside
        className={`community-onboarding-concierge-guide${props.isComplete ? " is-complete" : ""}`}
        aria-label={`${props.communityName} community concierge`}
      >
        <WebCommunityOnboardingConciergeSurface
          communityName={props.communityName}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          stepLabel="Step 2 of 4"
          transcript={transcript}
          descriptionId={props.descriptionId}
          isPending={props.isPending}
          error={props.error}
          primaryLabel="Next"
          pendingPrimaryLabel="Saving…"
          showPrimary={props.isComplete}
          pendingSecondaryLabel="Skipping…"
          onPrimary={props.onContinue}
          onSecondary={props.onDismiss}
        />
      </aside>
    </>
  );
}
