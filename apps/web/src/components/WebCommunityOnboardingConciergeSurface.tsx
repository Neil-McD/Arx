import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { renderMarkdown } from "../../../../shared/markdownUi";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REVEAL_INTERVAL_MS = 90;
const MAX_REVEAL_CHUNKS = 6;

function buildRevealChunks(text: string): string[] {
  const tokens = String(text ?? "").trim().match(/\S+\s*/g) ?? [];
  if (!tokens.length) return [];
  const chunkSize = Math.max(1, Math.ceil(tokens.length / MAX_REVEAL_CHUNKS));
  const chunks: string[] = [];
  for (let index = 0; index < tokens.length; index += chunkSize) {
    chunks.push(tokens.slice(index, index + chunkSize).join(""));
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

export function useDeterministicConciergeTranscript(text: string): {
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

export function WebCommunityOnboardingConciergeSurface(props: {
  communityName: string;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  stepLabel: string;
  transcript: string;
  titleId?: string;
  descriptionId?: string;
  isPreparing?: boolean;
  isPending: boolean;
  controlsDisabled?: boolean;
  error: string | null;
  primaryLabel: string;
  pendingPrimaryLabel?: string;
  showPrimary?: boolean;
  secondaryLabel?: string;
  pendingSecondaryLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
  children?: ReactNode;
}) {
  const transcript = props.isPreparing ? "Loading your community welcome…" : props.transcript;
  const { displayText, isComplete: transcriptIsComplete } =
    useDeterministicConciergeTranscript(transcript);
  const controlsDisabled = Boolean(props.controlsDisabled) || props.isPending || Boolean(props.isPreparing);
  const showPrimary = (props.showPrimary ?? true) && transcriptIsComplete && !props.isPreparing;
  const showContent = transcriptIsComplete && !props.isPreparing && Boolean(props.children);

  return (
    <>
      <header className="community-onboarding-concierge-header">
        <CommunityAvatar
          name={props.communityName}
          imageUrl={props.communityAvatarUrl}
          focusX={props.communityAvatarFocusX}
          focusY={props.communityAvatarFocusY}
          zoom={props.communityAvatarZoom}
          className={`community-onboarding-concierge-avatar${transcriptIsComplete ? "" : " is-speaking"}`}
          aria-hidden={true}
        />
        <div className="community-onboarding-concierge-meta">
          <strong id={props.titleId}>{props.communityName}</strong>
          <span>Community concierge</span>
          <span>{props.stepLabel}</span>
        </div>
      </header>

      <div className="community-onboarding-concierge-body">
        <div className="community-onboarding-concierge-copy">
          <div
            id={props.descriptionId}
            className={`community-onboarding-concierge-transcript${transcriptIsComplete ? "" : " is-speaking"}`}
          >
            <div aria-hidden="true">{renderMarkdown(displayText)}</div>
            <span className="community-onboarding-concierge-sr-only" role="status" aria-live="polite" aria-atomic="true">
              {transcript}
            </span>
          </div>
          {props.error ? <small role="alert">{props.error}</small> : null}
        </div>

        {showContent ? (
          <div className="community-onboarding-concierge-content">
            {props.children}
          </div>
        ) : null}
      </div>

      <div className="community-onboarding-concierge-actions">
        <button type="button" onClick={props.onSecondary} disabled={controlsDisabled}>
          {props.isPending && props.pendingSecondaryLabel
            ? props.pendingSecondaryLabel
            : props.secondaryLabel ?? "Skip"}
        </button>
        <div className="community-onboarding-concierge-primary-slot">
          {showPrimary ? (
            <button className="primary" type="button" onClick={props.onPrimary} disabled={controlsDisabled}>
              {props.isPending && props.pendingPrimaryLabel
                ? props.pendingPrimaryLabel
                : props.primaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
