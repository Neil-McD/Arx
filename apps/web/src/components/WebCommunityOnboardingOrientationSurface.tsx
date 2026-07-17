import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { buildCommunityOnboardingCopy } from "../../../../shared/communityOnboardingCopy";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";

export function WebCommunityOnboardingOrientationSurface(props: {
  communityName: string;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  session: CommunityOnboardingSession;
  isPending: boolean;
  isInline?: boolean;
  error: string | null;
  titleId?: string;
  descriptionId?: string;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const video = props.session.intro_video_url
    ? renderHeroMediaDefault("video", props.session.intro_video_url, {
        eager: true,
        playHint: "Watch the founder welcome",
      })
    : null;
  const controlsDisabled = Boolean(props.isInline) || props.isPending;
  const transcript = buildCommunityOnboardingCopy({
    cue: "orientation",
    communityName: props.communityName,
    hasVideo: Boolean(video),
  });

  return (
    <WebCommunityOnboardingConciergeSurface
      communityName={props.communityName}
      communityAvatarUrl={props.communityAvatarUrl}
      communityAvatarFocusX={props.communityAvatarFocusX}
      communityAvatarFocusY={props.communityAvatarFocusY}
      communityAvatarZoom={props.communityAvatarZoom}
      stepLabel="Step 1 of 4"
      transcript={transcript}
      titleId={props.titleId}
      descriptionId={props.descriptionId}
      isPending={props.isPending}
      controlsDisabled={controlsDisabled}
      error={props.error}
      primaryLabel="Continue"
      pendingPrimaryLabel="Saving…"
      secondaryLabel="Skip"
      pendingSecondaryLabel="Skipping…"
      onPrimary={props.onContinue}
      onSecondary={props.onDismiss}
    >
      {video ? <div className="community-onboarding-orientation-media">{video}</div> : null}
    </WebCommunityOnboardingConciergeSurface>
  );
}
