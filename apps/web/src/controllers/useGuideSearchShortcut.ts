import { useEffect, type MutableRefObject } from "react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { ASK_GUIDE_EVENT, OPEN_GUIDE_EVENT, isGuideSearchShortcut, openGuideFromSearch } from "../components/guideSearch";

// Design system v1: ⌘K opens the command palette (or, where there is none,
// your guide on Home with the cursor in its box). The palette's "Ask your
// guide" opens Home and sends the question.
export function useGuideSearchShortcut(
  selectTab: (tab: "agent") => void,
  dockRef: MutableRefObject<{ focusInput: () => void; ask?: (question: string) => boolean } | null>,
): void {
  useEffect(() => {
    if (!isDesignV1Active()) return;
    // Home draws a moment after the switch, so each step is tried for up to
    // three seconds until Home is ready.
    const whenReady = (attempt: () => boolean) => {
      let tries = 0;
      const step = () => {
        if (!attempt() && tries++ < 36) window.setTimeout(step, 80);
      };
      window.setTimeout(step, 40);
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
      const question = String((event as CustomEvent<string>).detail ?? "").trim();
      if (!question) return;
      selectTab("agent");
      whenReady(() => Boolean(dockRef.current?.ask?.(question)));
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
      window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
      window.removeEventListener(ASK_GUIDE_EVENT, onAsk);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectTab, dockRef]);
}
