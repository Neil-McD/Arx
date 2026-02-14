import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseWebWorkspaceUiActionsControllerArgs = {
  copyTextToClipboard: (value: string) => Promise<void>;
  setCopiedMessageId: Dispatch<SetStateAction<string | null>>;
  memoryToastTimeoutRef: MutableRefObject<number | null>;
  setMemoryToast: Dispatch<SetStateAction<string | null>>;
  appToastTimeoutRef: MutableRefObject<number | null>;
  setAppToast: Dispatch<SetStateAction<string | null>>;
};

export function useWebWorkspaceUiActionsController(args: UseWebWorkspaceUiActionsControllerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    const current = argsRef.current;
    await current.copyTextToClipboard(text);
    current.setCopiedMessageId(messageId);
    window.setTimeout(() => current.setCopiedMessageId((prev) => (prev === messageId ? null : prev)), 2000);
  }, []);

  const showMemoryToastMessage = useCallback((message: string) => {
    const current = argsRef.current;
    if (current.memoryToastTimeoutRef.current) {
      window.clearTimeout(current.memoryToastTimeoutRef.current);
      current.memoryToastTimeoutRef.current = null;
    }
    current.setMemoryToast(message);
    current.memoryToastTimeoutRef.current = window.setTimeout(() => {
      current.setMemoryToast(null);
      current.memoryToastTimeoutRef.current = null;
    }, 2400);
  }, []);

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

  const scrollToCommunityMessage = useCallback((messageId: string) => {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return {
    handleCopyMessage,
    showMemoryToastMessage,
    showAppToastMessage,
    scrollToCommunityMessage,
  };
}
