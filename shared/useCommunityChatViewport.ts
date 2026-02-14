import { useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type ScrollAnchor = { elementId: string; offset: number };

type UseCommunityChatViewportArgs = {
  isEnabled: boolean;
  communityMessages: readonly unknown[];
  communityChatListRef: MutableRefObject<HTMLDivElement | null>;
  isUserAtBottom: boolean;
  isUserAtBottomRef: MutableRefObject<boolean>;
  setIsUserAtBottom: Dispatch<SetStateAction<boolean>>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  loadMoreThresholdPx: number;
  canLoadOlder: boolean;
  onLoadOlder: () => void;
};

function captureCommunityChatScrollAnchor(container: HTMLElement): ScrollAnchor | null {
  const rect = container.getBoundingClientRect();
  const x = rect.left + Math.min(32, rect.width / 2);
  const yCandidates = [rect.top + 20, rect.top + 60, rect.top + 100];
  for (const y of yCandidates) {
    if (y >= rect.bottom) continue;
    const hit = document.elementFromPoint(x, y);
    const messageEl = hit?.closest?.(".chat-message[id^='msg-']") as HTMLElement | null;
    if (messageEl?.id) {
      return { elementId: messageEl.id, offset: messageEl.offsetTop - container.scrollTop };
    }
  }

  // Fallback for odd layouts (rare): scan message nodes.
  const scrollTop = container.scrollTop;
  const nodes = container.querySelectorAll<HTMLElement>(".chat-message[id^='msg-']");
  for (const node of nodes) {
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (bottom > scrollTop + 1) {
      return { elementId: node.id, offset: top - scrollTop };
    }
  }
  return null;
}

function restoreCommunityChatScrollAnchor(container: HTMLElement, anchor: ScrollAnchor): void {
  const el = document.getElementById(anchor.elementId) as HTMLElement | null;
  if (!el) return;
  container.scrollTop = el.offsetTop - anchor.offset;
}

export function useCommunityChatViewport(args: UseCommunityChatViewportArgs) {
  const pendingChatPrependScrollRef = useRef<ScrollAnchor | null>(null);
  const communityChatAnchorRef = useRef<ScrollAnchor | null>(null);

  const capturePrependAnchor = useCallback(() => {
    const container = args.communityChatListRef.current;
    if (!container) {
      pendingChatPrependScrollRef.current = null;
      return;
    }
    pendingChatPrependScrollRef.current = captureCommunityChatScrollAnchor(container);
  }, [args.communityChatListRef]);

  const clearPendingPrependAnchor = useCallback(() => {
    pendingChatPrependScrollRef.current = null;
  }, []);

  useEffect(() => {
    const container = args.communityChatListRef.current;
    if (!container || !args.isUserAtBottom) return;
    container.scrollTop = container.scrollHeight;
  }, [args.communityMessages, args.communityChatListRef, args.isUserAtBottom]);

  useLayoutEffect(() => {
    const pending = pendingChatPrependScrollRef.current;
    if (!pending) return;
    const container = args.communityChatListRef.current;
    if (!container) return;
    restoreCommunityChatScrollAnchor(container, pending);
    pendingChatPrependScrollRef.current = null;
  }, [args.communityMessages, args.communityChatListRef]);

  useEffect(() => {
    if (!args.isEnabled) return;
    const container = args.communityChatListRef.current;
    if (!container) return;
    let raf: number | null = null;
    const observer = new ResizeObserver(() => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = args.communityChatListRef.current;
        if (!el) return;
        if (args.isUserAtBottomRef.current) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        const anchor = communityChatAnchorRef.current;
        if (!anchor) return;
        restoreCommunityChatScrollAnchor(el, anchor);
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [args.communityChatListRef, args.isEnabled, args.isUserAtBottomRef]);

  const handleChatScroll = useCallback(() => {
    const container = args.communityChatListRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;

    if (atBottom !== args.isUserAtBottomRef.current) {
      args.setIsUserAtBottom(atBottom);
      args.isUserAtBottomRef.current = atBottom;
    }

    if (atBottom) args.setUnreadCount(0);

    if (atBottom) {
      communityChatAnchorRef.current = null;
    } else {
      communityChatAnchorRef.current = captureCommunityChatScrollAnchor(container);
    }

    const nearTop = scrollTop <= args.loadMoreThresholdPx;
    if (nearTop && !atBottom && args.canLoadOlder) {
      args.onLoadOlder();
    }
  }, [
    args.canLoadOlder,
    args.communityChatListRef,
    args.isUserAtBottomRef,
    args.loadMoreThresholdPx,
    args.onLoadOlder,
    args.setIsUserAtBottom,
    args.setUnreadCount,
  ]);

  return {
    handleChatScroll,
    capturePrependAnchor,
    clearPendingPrependAnchor,
  };
}
