import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseWebToastControllerArgs = {
  appToastTimeoutRef: MutableRefObject<number | null>;
  setAppToast: Dispatch<SetStateAction<string | null>>;
};

export function useWebToastController(args: UseWebToastControllerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const showAppToastMessage = useCallback((message: string) => {
    const current = argsRef.current;
    if (current.appToastTimeoutRef.current) {
      window.clearTimeout(current.appToastTimeoutRef.current);
      current.appToastTimeoutRef.current = null;
    }
    current.setAppToast(message);
    current.appToastTimeoutRef.current = window.setTimeout(() => {
      current.setAppToast(null);
      current.appToastTimeoutRef.current = null;
    }, 2400);
  }, []);

  return {
    showAppToastMessage,
  };
}
