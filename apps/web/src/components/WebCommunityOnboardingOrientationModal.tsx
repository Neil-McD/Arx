import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { CommunityOnboardingSession } from "../../../../shared/communityOnboarding";
import { WebCommunityOnboardingOrientationSurface } from "./WebCommunityOnboardingOrientationSurface";

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
  communityOneLiner?: string | null;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  session: CommunityOnboardingSession;
  isPreparing: boolean;
  isPending: boolean;
  error: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);
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
      modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
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
  }, []);

  return createPortal(
    <div className="community-onboarding-orientation-overlay" role="presentation">
      <div
        ref={modalRef}
        className={`community-onboarding-orientation-modal${props.session.intro_video_url ? " has-video" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={props.isPending}
        tabIndex={-1}
      >
        <WebCommunityOnboardingOrientationSurface
          {...props}
          titleId={titleId}
          descriptionId={descriptionId}
        />
      </div>
    </div>,
    document.body,
  );
}
