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
  isAgentTest?: boolean;
  isStartingAgentTest?: boolean;
  isPreparing: boolean;
  isWorking: boolean;
  streamedText: string;
  isPending: boolean;
  isInline?: boolean;
  error: string | null;
  titleId?: string;
  descriptionId?: string;
  composerRef?: Ref<HTMLTextAreaElement>;
  continueButtonRef?: Ref<HTMLButtonElement>;
  transcriptRef?: Ref<HTMLDivElement>;
  onInputChange: (value: string) => void;
  onStartAgentTest?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
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
  const isAgentInteractive = !props.isPreview || Boolean(props.isAgentTest);

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
          <p id={props.descriptionId}>Your personal agent will help you get oriented before you enter.</p>
        </header>

        <section className="community-onboarding-orientation-agent" aria-label="Orientation with your personal agent">
          <div className="community-onboarding-orientation-agent-header">
            <span className="community-onboarding-orientation-agent-avatar" aria-hidden="true">
              <Sparkles />
            </span>
            <span>
              <strong>Your personal agent</strong>
              <small>
                {props.isAgentTest
                  ? "Builder test · uses your agent limits"
                  : props.isPreview
                    ? "Preview · no inference"
                    : `${props.communityName} context`}
              </small>
            </span>
            {props.isPreview && !props.isInline && !props.isAgentTest && props.onStartAgentTest ? (
              <button
                type="button"
                className="community-onboarding-orientation-agent-test"
                onClick={props.onStartAgentTest}
                disabled={props.isStartingAgentTest}
              >
                {props.isStartingAgentTest ? "Opening your agent…" : "Test with my agent"}
              </button>
            ) : null}
          </div>

          {props.isAgentTest ? (
            <div className="community-onboarding-orientation-agent-disclosure" role="status">
              Uses your connected provider and rate limits. Messages stay in your private agent history.
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
                <LoaderCircle aria-hidden="true" /> Opening your private agent
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
              disabled={isAgentInteractive && (props.isWorking || props.isPreparing || props.isStartingAgentTest)}
              placeholder={
                !isAgentInteractive
                  ? "Preview only — member messages are disabled"
                  : props.isAgentTest
                    ? `Test your onboarding agent in ${props.communityName}`
                  : `Ask anything about ${props.communityName}`
              }
              aria-label="Ask your personal agent about this community"
            />
            {isAgentInteractive && props.isWorking ? (
              <button type="button" onClick={props.onStop} aria-label="Stop" title="Stop">
                <Square aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isAgentInteractive || props.isPreparing || props.isStartingAgentTest || !props.input.trim()}
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
          ref={props.continueButtonRef}
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
