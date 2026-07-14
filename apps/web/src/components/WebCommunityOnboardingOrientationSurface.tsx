import type { FormEvent, Ref } from "react";
import { LoaderCircle, Send, Sparkles, Square } from "lucide-react";
import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";

export type CommunityOnboardingOrientationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function WebCommunityOnboardingOrientationSurface(props: {
  communityName: string;
  session: CommunityOnboardingSession;
  messages: CommunityOnboardingOrientationMessage[];
  input: string;
  isPreview: boolean;
  isPreparing: boolean;
  isWorking: boolean;
  streamedText: string;
  isPending: boolean;
  isInline?: boolean;
  error: string | null;
  titleId?: string;
  descriptionId?: string;
  composerRef?: Ref<HTMLTextAreaElement>;
  transcriptRef?: Ref<HTMLDivElement>;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop?: () => void;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const video = props.session.intro_video_url
    ? renderHeroMediaDefault("video", props.session.intro_video_url, {
        eager: true,
        playHint: "Watch the founder welcome",
      })
    : null;
  const controlsDisabled =
    Boolean(props.isInline) || props.isPending || props.isPreparing || props.isWorking;
  const isAgentInteractive = !props.isInline;

  return (
    <>
      <div className="community-onboarding-orientation-topbar">
        <span>Member orientation</span>
        <span>1 of 3</span>
      </div>

      <div className="community-onboarding-orientation-scroll">
        {video ? <div className="community-onboarding-orientation-media">{video}</div> : null}

        <header className="community-onboarding-orientation-header">
          <div className="community-onboarding-orientation-eyebrow">Welcome to</div>
          <h1 id={props.titleId}>{props.communityName}</h1>
          <p id={props.descriptionId}>The community Concierge will help you get oriented before you enter.</p>
        </header>

        <section className="community-onboarding-orientation-agent" aria-label="Orientation with the community Concierge">
          <div className="community-onboarding-orientation-agent-header">
            <span className="community-onboarding-orientation-agent-avatar" aria-hidden="true">
              <Sparkles />
            </span>
            <span>
              <strong>{props.session.concierge_display_name}</strong>
              <small>
                {props.isInline
                  ? "Preview · no inference"
                  : props.isPreview
                    ? "Builder preview · community Concierge"
                    : `${props.communityName} Concierge`}
              </small>
            </span>
          </div>

          {props.isPreview && !props.isInline ? (
            <div className="community-onboarding-orientation-agent-disclosure" role="status">
              Messages use your connected provider and limits. They stay in your private Concierge history.
            </div>
          ) : null}

          <div className="community-onboarding-orientation-transcript" ref={props.transcriptRef}>
            {props.messages.map((message) => (
              <article
                key={message.id}
                className={`community-onboarding-orientation-message is-${message.role}`}
              >
                {message.role === "assistant" ? renderMarkdown(message.text) : <p>{message.text}</p>}
              </article>
            ))}
            {props.isPreparing ? (
              <div className="community-onboarding-orientation-status">
                <LoaderCircle aria-hidden="true" /> Opening the community Concierge
              </div>
            ) : null}
            {props.streamedText ? (
              <article className="community-onboarding-orientation-message is-assistant is-streaming">
                {renderMarkdown(props.streamedText)}
              </article>
            ) : props.isWorking ? (
              <div className="community-onboarding-orientation-status">
                <LoaderCircle aria-hidden="true" /> Thinking in {props.communityName}
              </div>
            ) : null}
          </div>

          <form className="community-onboarding-orientation-composer" onSubmit={props.onSubmit}>
            <textarea
              ref={props.composerRef}
              value={props.input}
              onChange={(event) => props.onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={8000}
              readOnly={!isAgentInteractive}
              tabIndex={props.isInline ? -1 : undefined}
              disabled={isAgentInteractive && (props.isWorking || props.isPreparing)}
              placeholder={
                !isAgentInteractive
                    ? "Preview only — member messages are disabled"
                    : `Reply to ${props.session.concierge_display_name}`
              }
              aria-label="Reply to the community Concierge"
            />
            {isAgentInteractive && props.isWorking && props.onStop ? (
              <button type="button" onClick={props.onStop} aria-label="Stop" title="Stop">
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isAgentInteractive || props.isPreparing || props.isWorking || !props.input.trim()}
                aria-label="Send"
                title="Send"
              >
                <Send aria-hidden="true" />
              </button>
            )}
          </form>
        </section>

        {props.error ? (
          <div className="community-onboarding-orientation-error" role="alert">{props.error}</div>
        ) : null}
      </div>

      <footer className="community-onboarding-orientation-actions">
        <button type="button" className="secondary" onClick={props.onDismiss} disabled={controlsDisabled}>
          Skip onboarding
        </button>
        <button
          type="button"
          className="primary"
          onClick={props.onContinue}
          disabled={controlsDisabled}
        >
          {props.isPending ? "Saving…" : "Continue to community chat"}
        </button>
      </footer>
    </>
  );
}
