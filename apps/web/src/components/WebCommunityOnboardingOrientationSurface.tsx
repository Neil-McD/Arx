import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";
import { WebCommunityOnboardingConciergeSurface } from "./WebCommunityOnboardingConciergeSurface";

function finishSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

export function buildCommunityOnboardingOrientationTranscript(params: {
  communityName: string;
  communityOneLiner?: string | null;
  welcomeMessage: string;
  hasVideo: boolean;
}): string {
  const paragraphs: string[] = [];
  const appendUnique = (value: string | null | undefined) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return;
    const normalized = trimmed.toLocaleLowerCase().replace(/\s+/g, " ");
    if (paragraphs.some((entry) => entry.toLocaleLowerCase().replace(/\s+/g, " ") === normalized)) return;
    paragraphs.push(trimmed);
  };

  appendUnique(`Welcome to ${params.communityName}.`);
  appendUnique(params.communityOneLiner ? finishSentence(params.communityOneLiner) : null);
  appendUnique(params.welcomeMessage);
  appendUnique(params.hasVideo
    ? "The founder recorded a short welcome for you. Watch it below, then I’ll help you introduce yourself."
    : "I’ll help you make your first introduction, then introduce you to your personal agent.");

  return paragraphs.join("\n\n");
}

export function WebCommunityOnboardingOrientationSurface(props: {
  communityName: string;
  communityOneLiner?: string | null;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  session: CommunityOnboardingSession;
  isPreparing: boolean;
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
  const controlsDisabled = Boolean(props.isInline) || props.isPending || props.isPreparing;
  const transcript = buildCommunityOnboardingOrientationTranscript({
    communityName: props.communityName,
    communityOneLiner: props.communityOneLiner,
    welcomeMessage: props.session.welcome_message,
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
      isPreparing={props.isPreparing}
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
