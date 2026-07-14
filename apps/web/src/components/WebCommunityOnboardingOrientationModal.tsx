import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { renderHeroMediaDefault } from "./CommunityFunnelSurface";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function WebCommunityOnboardingOrientationModal(props: {
  communityName: string;
  session: CommunityOnboardingSession;
  isPending: boolean;
  error: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
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
    const focusFrame = window.requestAnimationFrame(() => continueButtonRef.current?.focus());

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
  }, []);

  const video = props.session.intro_video_url
    ? renderHeroMediaDefault("video", props.session.intro_video_url, {
        eager: true,
        playHint: "Watch the welcome",
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
        <div className="community-onboarding-orientation-scroll">
          <header className="community-onboarding-orientation-header">
            <div className="community-onboarding-orientation-eyebrow">Welcome to</div>
            <h1 id={titleId}>{props.communityName}</h1>
            <p id={descriptionId}>{props.session.welcome_message}</p>
          </header>

          {video ? <div className="community-onboarding-orientation-media">{video}</div> : null}

          <ol className="community-onboarding-orientation-path" aria-label="Your first steps">
            <li className="is-current">
              <span>1</span>
              <div><strong>Get oriented</strong><small>See what this community is here to do.</small></div>
            </li>
            <li>
              <span>2</span>
              <div><strong>Join the conversation</strong><small>Share one useful thing with the room.</small></div>
            </li>
            <li>
              <span>3</span>
              <div><strong>Meet your agent</strong><small>Get private help finding your next move.</small></div>
            </li>
          </ol>

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
            {props.isPending ? "Saving…" : "Continue to the community"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
