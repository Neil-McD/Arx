import { useEffect, type MutableRefObject } from "react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { OPEN_GUIDE_EVENT, isGuideSearchShortcut } from "../components/guideSearch";

// Design system v1: "Search or ask" (the mock's top bar) and ⌘K open your
// guide on Home with the cursor in its box. There is no search yet.
export function useGuideSearchShortcut(
  selectTab: (tab: "agent") => void,
  dockRef: MutableRefObject<{ focusInput: () => void } | null>,
): void {
  useEffect(() => {
    if (!isDesignV1Active()) return;
    const openGuide = () => {
      selectTab("agent");
      window.setTimeout(() => dockRef.current?.focusInput(), 60);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isGuideSearchShortcut(event)) return;
      event.preventDefault();
      openGuide();
    };
    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectTab, dockRef]);
}
