import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseWorkspaceAutoScrollArgs = {
  workspaceMessageListRef: MutableRefObject<HTMLDivElement | null>;
  workspaceMessageListContentRef: MutableRefObject<HTMLDivElement | null>;
  isLoadingThreadRef: MutableRefObject<boolean>;
  workspacePinnedToBottomRef: MutableRefObject<boolean>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  scrollBehavior: ScrollBehavior;
};

export function useWorkspaceAutoScroll(args: UseWorkspaceAutoScrollArgs): {
  handleWorkspaceScroll: () => void;
} {
  const syncPinnedState = useCallback(() => {
    const el = args.workspaceMessageListRef.current;
    if (!el) return;
    if (args.isLoadingThreadRef.current) return;

    const hasScrollableContent = el.scrollHeight > el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isPinnedToBottom = !hasScrollableContent || distanceFromBottom <= 48;

    args.workspacePinnedToBottomRef.current = isPinnedToBottom;
    args.setIsWorkspaceAtBottom(isPinnedToBottom);
  }, [
    args.workspaceMessageListRef,
    args.isLoadingThreadRef,
    args.workspacePinnedToBottomRef,
    args.setIsWorkspaceAtBottom,
  ]);

  useEffect(() => {
    const contentEl =
      args.workspaceMessageListContentRef.current ??
      (args.workspaceMessageListRef.current?.firstElementChild instanceof HTMLDivElement
        ? args.workspaceMessageListRef.current.firstElementChild
        : null);
    if (!contentEl) return;

    let raf = 0;
    const scheduleFollow = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const el = args.workspaceMessageListRef.current;
        if (!el) return;
        if (!args.workspacePinnedToBottomRef.current && !args.isLoadingThreadRef.current) return;

        el.scrollTo({
          top: el.scrollHeight,
          behavior: args.scrollBehavior,
        });

        if (args.isLoadingThreadRef.current) {
          args.isLoadingThreadRef.current = false;
        }
        args.workspacePinnedToBottomRef.current = true;
        args.setIsWorkspaceAtBottom(true);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleFollow();
    });
    resizeObserver.observe(contentEl);

    const mutationObserver = new MutationObserver(() => {
      scheduleFollow();
    });
    mutationObserver.observe(contentEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleFollow();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [
    args.workspaceMessageListRef,
    args.workspaceMessageListContentRef,
    args.isLoadingThreadRef,
    args.workspacePinnedToBottomRef,
    args.setIsWorkspaceAtBottom,
    args.scrollBehavior,
  ]);

  const handleWorkspaceScroll = useCallback(() => {
    syncPinnedState();
  }, [syncPinnedState]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const el = args.workspaceMessageListRef.current;
      if (!el) return;
      syncPinnedState();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [
    args.workspaceMessageListRef,
    syncPinnedState,
  ]);

  return { handleWorkspaceScroll };
}
