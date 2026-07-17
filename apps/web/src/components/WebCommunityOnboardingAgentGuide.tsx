import { buildCommunityOnboardingCopy } from "../../../../shared/communityOnboardingCopy";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";

export function WebCommunityOnboardingAgentGuide(props: {
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
  const transcript = buildCommunityOnboardingCopy({
    cue: props.isComplete ? "personal_agent_review" : "personal_agent_intro",
    communityName: props.communityName,
    hasVideo: false,
  });

  return (
    <>
      <div
        className="community-onboarding-concierge-overlay community-onboarding-agent-step-overlay"
        aria-hidden="true"
      />
      <aside
        className={`community-onboarding-concierge-guide community-onboarding-agent-step-guide${props.isComplete ? " is-complete" : ""}`}
        aria-label={`${props.communityName} community concierge`}
      >
        <WebCommunityOnboardingConciergeSurface
          communityName={props.communityName}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          stepLabel="Step 3 of 4"
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
