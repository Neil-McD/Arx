import { useEffect } from "react";

export function useWebMobileChromeReadingModeLifecycle(params: {
  autoHideEnabled: boolean;
  overlayOpen: boolean;
  setReadingMode: (value: false) => void;
}) {
  useEffect(() => {
    if (params.autoHideEnabled && !params.overlayOpen) return;
    params.setReadingMode(false);
  }, [
    params.autoHideEnabled,
    params.overlayOpen,
    params.setReadingMode,
  ]);
}
