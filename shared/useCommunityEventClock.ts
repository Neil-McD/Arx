import { useEffect, useState } from "react";
import { nextCommunityEventBoundary, type TimedCommunityEvent } from "./communityEventLifecycle";

/** One boundary-driven clock for the mounted Events surface, not one per row. */
export function useCommunityEventClock(events: TimedCommunityEvent[], paused = false): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(update, Math.min(2147483647, Math.max(1, nextCommunityEventBoundary(events, current) - current)));
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, [events, paused]);
  return now;
}
