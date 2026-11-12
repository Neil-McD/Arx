import { useEffect, type MutableRefObject } from "react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { ASK_GUIDE_EVENT, OPEN_GUIDE_EVENT, isGuideSearchShortcut, openGuideFromSearch, type AskGuideRequest } from "../components/guideSearch";

// Design system v1: ⌘K opens the command palette (or, where there is none,
// your guide on Home with the cursor in its box). The palette's "Ask your
// guide" opens Home and sends the question.
export function useGuideSearchShortcut(
  selectTab: (tab: "agent") => void,
  dockRef: MutableRefObject<{
    focusInput: () => void;
    ask?: (question: string, communityId: string) => "sent" | "not_ready" | "other_community";
    draft?: (question: string, communityId: string) => boolean;
  } | null>,
): void {
  useEffect(() => {
    if (!isDesignV1Active()) return;
    // Home draws a moment after the switch, so each step is tried for up to
    // three seconds until Home is ready.
    // One pending attempt at a time; a new one, or leaving, cancels it.
    let pending: number | null = null;
    const cancel = () => { if (pending !== null) window.clearTimeout(pending); pending = null; };
    const whenReady = (attempt: () => boolean, giveUp?: () => void) => {
      cancel();
      let tries = 0;
      const step = () => {
        pending = null;
        if (attempt()) return;
        if (tries++ < 36) pending = window.setTimeout(step, 80);
        else giveUp?.();
      };
      pending = window.setTimeout(step, 40);
    };
    const openGuide = () => {
      selectTab("agent");
      whenReady(() => {
        dockRef.current?.focusInput();
        const active = document.activeElement;
        return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      });
    };
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<AskGuideRequest>).detail;
      const question = String(detail?.question ?? "").trim();
      const communityId = String(detail?.communityId ?? "").trim();
      if (!question || !communityId) return;
      selectTab("agent");
      // Sent only to the guide of the community it was asked in; if the page
      // moves to another community first, the question is dropped.
      // A guide still busy after three seconds keeps the question in Home's
      // box, ready to send, rather than losing it.
      whenReady(() => {
        const result = dockRef.current?.ask?.(question, communityId) ?? "not_ready";
        return result !== "not_ready";
      }, () => { dockRef.current?.draft?.(question, communityId); });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isGuideSearchShortcut(event)) return;
      event.preventDefault();
      openGuideFromSearch();
    };
    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    window.addEventListener(ASK_GUIDE_EVENT, onAsk);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancel();
      window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
      window.removeEventListener(ASK_GUIDE_EVENT, onAsk);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectTab, dockRef]);
}
