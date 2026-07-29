import { useEffect, useRef } from "react";

import { readAuthResumeState } from "../../../../shared/authResumeState";

export function useWebAuthErrorToastLifecycle(params: {
  authError: string | null;
  showToast: (message: string) => void;
}) {
  const lastShownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.authError) {
      lastShownErrorRef.current = null;
      return;
    }
    if (
      readAuthResumeState()?.intent?.reason === "open_workspace_draft"
    ) {
      return;
    }
    if (lastShownErrorRef.current === params.authError) return;
    lastShownErrorRef.current = params.authError;
    params.showToast(params.authError);
  }, [params.authError, params.showToast]);
}
