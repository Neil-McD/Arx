import { useEffect, useId, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Send, Sparkles, Square } from "lucide-react";
import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { renderMarkdown } from "../../../../shared/markdownUi";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type CommunityOnboardingOrientationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function WebCommunityOnboardingOrientationModal(props: {
  communityName: string;
  session: CommunityOnboardingSession;
  messages: CommunityOnboardingOrientationMessage[];
  input: string;
  isPreview: boolean;
  isPreparing: boolean;
  isWorking: boolean;
  streamedText: string;
  isPending: boolean;
  error: string | null;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const isPendingRef = useRef(props.isPending);
  const onDismissRef = useRef(props.onDismiss);
  isPendingRef.current = props.isPending;
  onDismissRef.current = props.onDismiss;

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      (props.isPreview ? continueButtonRef.current : composerRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isPendingRef.current) onDismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      if (!modalRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [props.isPreview]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.messages.length, props.streamedText]);

  const video = props.session.intro_video_url
    ? renderHeroMediaDefault("video", props.session.intro_video_url, {
        eager: true,
        playHint: "Watch the founder welcome",
      })
    : null;

  return createPortal(
    <div className="community-onboarding-orientation-overlay" role="presentation">
      <div
        ref={modalRef}
        className={`community-onboarding-orientation-modal${video ? " has-video" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={props.isPending}
        tabIndex={-1}
      >
        <div className="community-onboarding-orientation-topbar">
          <span>Member orientation</span>
          <span>1 of 3</span>
        </div>

        <div className="community-onboarding-orientation-scroll">
          {video ? <div className="community-onboarding-orientation-media">{video}</div> : null}

          <header className="community-onboarding-orientation-header">
            <div className="community-onboarding-orientation-eyebrow">Welcome to</div>
            <h1 id={titleId}>{props.communityName}</h1>
            <p id={descriptionId}>Your personal agent will help you get oriented before you enter.</p>
          </header>

          <section className="community-onboarding-orientation-agent" aria-label="Orientation with your personal agent">
            <div className="community-onboarding-orientation-agent-header">
              <span className="community-onboarding-orientation-agent-avatar" aria-hidden="true">
                <Sparkles />
              </span>
              <span>
                <strong>Your personal agent</strong>
                <small>{props.isPreview ? "Preview · no inference" : `${props.communityName} context`}</small>
              </span>
            </div>

            <div className="community-onboarding-orientation-transcript" ref={transcriptRef}>
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
                ref={composerRef}
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
                readOnly={props.isPreview}
                disabled={!props.isPreview && (props.isWorking || props.isPreparing)}
                placeholder={
                  props.isPreview
                    ? "Preview only — member messages are disabled"
                    : `Ask anything about ${props.communityName}`
                }
                aria-label="Ask your personal agent about this community"
              />
              {!props.isPreview && props.isWorking ? (
                <button type="button" onClick={props.onStop} aria-label="Stop" title="Stop">
                  <Square aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={props.isPreview || props.isPreparing || !props.input.trim()}
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
          <button type="button" className="secondary" onClick={props.onDismiss} disabled={props.isPending}>
            Skip onboarding
          </button>
          <button
            ref={continueButtonRef}
            type="button"
            className="primary"
            onClick={props.onContinue}
            disabled={props.isPending}
          >
            {props.isPending ? "Saving…" : "Continue to community chat"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
