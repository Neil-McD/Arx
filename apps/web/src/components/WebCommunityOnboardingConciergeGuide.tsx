import { useEffect, useMemo, useState } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REVEAL_INTERVAL_MS = 90;
const MAX_REVEAL_CHUNKS = 6;

function buildRevealChunks(text: string): string[] {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunkSize = Math.max(1, Math.ceil(words.length / MAX_REVEAL_CHUNKS));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += chunkSize) {
    const chunk = words.slice(index, index + chunkSize).join(" ");
    chunks.push(`${index === 0 ? "" : " "}${chunk}`);
  }
  return chunks;
}

function useReducedMotionPreference(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const applyPreference = (matches: boolean) => setReducedMotion(matches);
    applyPreference(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => applyPreference(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return reducedMotion;
}

function useDeterministicConciergeTranscript(text: string): {
  displayText: string;
  isComplete: boolean;
} {
  const reducedMotion = useReducedMotionPreference();
  const chunks = useMemo(() => buildRevealChunks(text), [text]);
  const [revealedChunkCount, setRevealedChunkCount] = useState(() =>
    reducedMotion ? chunks.length : 0,
  );

  useEffect(() => {
    if (reducedMotion || chunks.length === 0) {
      setRevealedChunkCount(chunks.length);
      return;
    }

    setRevealedChunkCount(0);
    let nextChunkCount = 0;
    let timerId: number | null = null;
    const revealNextChunk = () => {
      nextChunkCount += 1;
      setRevealedChunkCount(nextChunkCount);
      if (nextChunkCount < chunks.length) {
        timerId = window.setTimeout(revealNextChunk, REVEAL_INTERVAL_MS);
      }
    };
    timerId = window.setTimeout(revealNextChunk, REVEAL_INTERVAL_MS);
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [chunks, reducedMotion]);

  return {
    displayText: chunks.slice(0, revealedChunkCount).join(""),
    isComplete: revealedChunkCount >= chunks.length,
  };
}

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
  const { displayText, isComplete: transcriptIsComplete } =
    useDeterministicConciergeTranscript(transcript);
  const showContinue = props.isComplete && transcriptIsComplete;

  return (
    <>
      <div className="community-onboarding-concierge-overlay" aria-hidden="true" />
      <aside
        className={`community-onboarding-concierge-guide${props.isComplete ? " is-complete" : ""}`}
        aria-label={`${props.communityName} community concierge`}
      >
        <CommunityAvatar
          name={props.communityName}
          imageUrl={props.communityAvatarUrl}
          focusX={props.communityAvatarFocusX}
          focusY={props.communityAvatarFocusY}
          zoom={props.communityAvatarZoom}
          className={`community-onboarding-concierge-avatar${transcriptIsComplete ? "" : " is-speaking"}`}
          aria-hidden={true}
        />

        <div className="community-onboarding-concierge-copy">
          <div className="community-onboarding-concierge-meta">
            <strong>{props.communityName}</strong>
            <span>Community concierge</span>
            <span>Step 2 of 4</span>
          </div>
          <p
            id={props.descriptionId}
            className={`community-onboarding-concierge-transcript${transcriptIsComplete ? "" : " is-speaking"}`}
          >
            <span aria-hidden="true">{displayText}</span>
            <span className="community-onboarding-concierge-sr-only" role="status" aria-live="polite" aria-atomic="true">
              {transcript}
            </span>
          </p>
          {props.error ? <small role="alert">{props.error}</small> : null}
        </div>

        <div className="community-onboarding-concierge-actions">
          <div className="community-onboarding-concierge-primary-slot">
            {showContinue ? (
              <button className="primary" type="button" onClick={props.onContinue} disabled={props.isPending}>
                {props.isPending ? "Saving…" : "Next"}
              </button>
            ) : null}
          </div>
          <button type="button" onClick={props.onDismiss} disabled={props.isPending}>
            {props.isPending ? "Skipping…" : "Skip"}
          </button>
        </div>
      </aside>
    </>
  );
}
