import { LoaderCircle } from "lucide-react";
import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";

export function WebCommunityOnboardingOrientationSurface(props: {
  communityName: string;
  session: CommunityOnboardingSession;
  isPreview: boolean;
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

  return (
    <>
      <div className="community-onboarding-orientation-topbar">
        <span>Member orientation</span>
        <span>1 of 4</span>
      </div>

      <div className="community-onboarding-orientation-scroll">
        {video ? <div className="community-onboarding-orientation-media">{video}</div> : null}

        <header className="community-onboarding-orientation-header">
          <div className="community-onboarding-orientation-eyebrow">Welcome to</div>
          <h1 id={props.titleId}>{props.communityName}</h1>
          <p id={props.descriptionId}>
            {video
              ? "Start with the founder’s welcome, then enter the community."
              : "Here’s what to know before you enter the community."}
          </p>
        </header>

        <section className="community-onboarding-orientation-welcome" aria-label="Community welcome">
          {props.isPreparing ? (
            <div className="community-onboarding-orientation-status" role="status">
              <LoaderCircle aria-hidden="true" /> Loading orientation
            </div>
          ) : (
            renderMarkdown(props.session.welcome_message)
          )}
        </section>

        {props.isPreview && !props.isInline ? (
          <p className="community-onboarding-orientation-preview-note">
            Previewing the exact saved member experience. No inference is used.
          </p>
        ) : null}

        {props.error ? (
          <div className="community-onboarding-orientation-error" role="alert">{props.error}</div>
        ) : null}
      </div>

      <footer className="community-onboarding-orientation-actions">
        <button type="button" className="secondary" onClick={props.onDismiss} disabled={controlsDisabled}>
          Skip onboarding
        </button>
        <button type="button" className="primary" onClick={props.onContinue} disabled={controlsDisabled}>
          {props.isPending ? "Saving…" : "Continue to community chat"}
        </button>
      </footer>
    </>
  );
}
