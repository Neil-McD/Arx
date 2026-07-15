import { useEffect, useRef } from "react";

export function WebCommunityOnboardingAgentGuide(props: {
  communityName: string;
  descriptionId: string;
  isComplete: boolean;
  isPending: boolean;
  error: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!props.isComplete) return;
    continueButtonRef.current?.focus({ preventScroll: true });
  }, [props.isComplete]);

  return (
    <>
      <div
        className="community-onboarding-first-post-overlay community-onboarding-agent-step-overlay"
        aria-hidden="true"
      />
      <aside
        className={`community-onboarding-first-post-guide community-onboarding-agent-step-guide${props.isComplete ? " is-complete" : ""}`}
        aria-label="Agent onboarding guidance"
        aria-live="polite"
      >
        <div className="community-onboarding-first-post-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3.5 13.7 8l4.8 1.7-4.8 1.7L12 16l-1.7-4.6-4.8-1.7L10.3 8 12 3.5Z" />
            <path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
          </svg>
        </div>
        <div className="community-onboarding-first-post-copy">
          <span>Step 3 of 4</span>
          <strong>
            {props.isComplete
              ? "Does your agent’s response make sense?"
              : "Ask your agent for your next move"}
          </strong>
          <p id={props.descriptionId}>
            {props.isComplete
              ? "You can keep chatting if you want. When you’re ready, continue to connect Polynet to your other AI tools."
              : `It already has ${props.communityName} context. Ask what to explore first or how you can contribute.`}
          </p>
          {props.error ? <small role="alert">{props.error}</small> : null}
        </div>
        <div className="community-onboarding-first-post-actions">
          {props.isComplete ? (
            <button
              ref={continueButtonRef}
              className="primary"
              type="button"
              onClick={props.onContinue}
              disabled={props.isPending}
            >
              {props.isPending ? "Saving…" : "Next"}
            </button>
          ) : null}
          <button type="button" onClick={props.onDismiss} disabled={props.isPending}>
            {props.isPending ? "Skipping…" : "Skip onboarding"}
          </button>
        </div>
      </aside>
    </>
  );
}
