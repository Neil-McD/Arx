import { useEffect } from "react";

export function useWebUiPersistenceLifecycle(params: {
  communityAnalyticsRange: string;
}) {
  useEffect(() => {
    try {
      localStorage.setItem("polynet-community-analytics-range", params.communityAnalyticsRange);
    } catch {
      // ignore
    }
  }, [params.communityAnalyticsRange]);

}
