import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseWorkspaceAutoScrollArgs = {
  workspaceMessageListRef: MutableRefObject<HTMLDivElement | null>;
  isLoadingThreadRef: MutableRefObject<boolean>;
  autoScrollEnabledRef: MutableRefObject<boolean>;
  lastWorkspaceScrollTopRef: MutableRefObject<number>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  autoScrollDependencies: readonly unknown[];
  scrollBehavior: ScrollBehavior;
};

export function useWorkspaceAutoScroll(args: UseWorkspaceAutoScrollArgs): {
  handleWorkspaceScroll: () => void;
} {
  useEffect(() => {
    const isThreadLoad = args.isLoadingThreadRef.current;
    if (!args.autoScrollEnabledRef.current && !isThreadLoad) return;

    const raf = window.requestAnimationFrame(() => {
      const el = args.workspaceMessageListRef.current;
      if (!el) return;
      if (!args.autoScrollEnabledRef.current && !args.isLoadingThreadRef.current) return;

      el.scrollTo({
        top: el.scrollHeight,
        behavior: args.scrollBehavior,
      });

      if (args.isLoadingThreadRef.current) {
        args.lastWorkspaceScrollTopRef.current = el.scrollTop;
        args.isLoadingThreadRef.current = false;
        args.setIsWorkspaceAtBottom(true);
        args.autoScrollEnabledRef.current = true;
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [
    args.workspaceMessageListRef,
    args.isLoadingThreadRef,
    args.autoScrollEnabledRef,
    args.lastWorkspaceScrollTopRef,
    args.setIsWorkspaceAtBottom,
    args.scrollBehavior,
    ...args.autoScrollDependencies,
  ]);

  const handleWorkspaceScroll = useCallback(() => {
    const el = args.workspaceMessageListRef.current;
    if (!el) return;
    if (args.isLoadingThreadRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const hasScrollableContent = scrollHeight > clientHeight + 1;

    if (!hasScrollableContent) {
      args.setIsWorkspaceAtBottom(true);
      args.autoScrollEnabledRef.current = true;
      return;
    }

    const atBottom = scrollHeight - scrollTop <= clientHeight + 24;

    const prevScrollTop = args.lastWorkspaceScrollTopRef.current;
    args.lastWorkspaceScrollTopRef.current = scrollTop;
    const scrolledUp = scrollTop < prevScrollTop - 2;

    if (scrolledUp) {
      args.autoScrollEnabledRef.current = false;
      args.setIsWorkspaceAtBottom(false);
      return;
    }

    args.setIsWorkspaceAtBottom(atBottom);
    args.autoScrollEnabledRef.current = atBottom;
  }, [
    args.workspaceMessageListRef,
    args.isLoadingThreadRef,
    args.setIsWorkspaceAtBottom,
    args.autoScrollEnabledRef,
    args.lastWorkspaceScrollTopRef,
  ]);

  return { handleWorkspaceScroll };
}
