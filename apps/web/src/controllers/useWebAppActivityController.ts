import { useEffect, useRef, useState } from "react";

import {
  advanceWebAppActivity,
  createWebAppActivityState,
} from "../../../../shared/webAppActivity";

function readIsWebAppActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function useWebAppActivityController(): { resumeEpoch: number } {
  const activityRef = useRef(createWebAppActivityState(readIsWebAppActive()));
  const [resumeEpoch, setResumeEpoch] = useState(0);

  useEffect(() => {
    const syncActivity = (forceResume = false) => {
      const isActive = readIsWebAppActive();
      const previous = activityRef.current;
      const next = advanceWebAppActivity(previous, {
        isActive,
        forceResume: forceResume && isActive,
      });
      if (next === previous) return;
      activityRef.current = next;
      if (next.resumeEpoch !== previous.resumeEpoch) {
        setResumeEpoch(next.resumeEpoch);
      }
    };
    const handleFocus = () => syncActivity();
    const handleBlur = () => syncActivity();
    const handleVisibilityChange = () => syncActivity();
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) syncActivity(true);
    };
    const handleOnline = () => syncActivity(true);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return { resumeEpoch };
}
