import { useCallback, useRef, useState } from "react";

export function useWebToastController() {
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const showAppToastMessage = useCallback((message: string) => {
    if (appToastTimeoutRef.current) {
      window.clearTimeout(appToastTimeoutRef.current);
      appToastTimeoutRef.current = null;
    }
    setAppToast(message);
    appToastTimeoutRef.current = window.setTimeout(() => {
      setAppToast(null);
      appToastTimeoutRef.current = null;
    }, 2400);
  }, []);

  return {
    appToast,
    showAppToastMessage,
  };
}
