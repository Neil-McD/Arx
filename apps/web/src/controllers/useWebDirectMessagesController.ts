import { useCallback, useRef, useState } from "react";

import type {
  DirectMessageOpenConversationRequest,
  DirectMessageOpenRequest,
} from "../components/WebDirectMessagesHost";

// How Inbox reaches its address (/c/<slug>/inbox; design v1). App sets it once
// the shell can navigate. Without it (the classic layout, or no community to
// put in the address) Inbox opens in place, as before.
export type InboxNavigator = {
  // Go to Inbox's address. False when there is none to go to.
  open: () => boolean;
  // Leave Inbox's address. byUser: closed by its own button or Escape, so the
  // back button's way is the right one; otherwise another page is about to
  // open, and leaving must not race it.
  leave: (byUser: boolean) => void;
};

export function useWebDirectMessagesController() {
  // Open while the address is Inbox's (App follows the address with
  // followRoute); in place when there is no address to use.
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const navigatorRef = useRef<InboxNavigator | null>(null);
  const [openRequest, setOpenRequest] = useState<DirectMessageOpenRequest>(null);
  const [openConversationRequest, setOpenConversationRequest] =
    useState<DirectMessageOpenConversationRequest>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const nextRequestIdRef = useRef(0);

  const show = useCallback(() => {
    if (navigatorRef.current?.open()) return;
    setIsOpen(true);
  }, []);
  const hide = useCallback((byUser: boolean) => {
    if (navigatorRef.current) navigatorRef.current.leave(byUser);
    setIsOpen(false);
  }, []);

  const openConversationById = useCallback((conversationId: string) => {
    const normalizedConversationId = String(conversationId ?? "").trim();
    if (!normalizedConversationId) return;
    nextRequestIdRef.current += 1;
    setOpenRequest(null);
    setOpenConversationRequest({
      requestId: nextRequestIdRef.current,
      conversationId: normalizedConversationId,
    });
    show();
  }, [show]);

  const toggle = useCallback(() => {
    setOpenRequest(null);
    if (isOpenRef.current) hide(true);
    else show();
  }, [hide, show]);

  const open = useCallback(() => {
    setOpenRequest(null);
    show();
  }, [show]);

  // Another page is opening (a phone tab, the command palette).
  const close = useCallback(() => {
    setOpenRequest(null);
    hide(false);
  }, [hide]);

  // Inbox's own close button or Escape.
  const closeByUser = useCallback(() => {
    setOpenRequest(null);
    hide(true);
  }, [hide]);

  const openFromCommunity = useCallback((
    targetUserId: string,
    communityId: string,
  ) => {
    const normalizedTargetUserId = String(targetUserId ?? "").trim();
    const normalizedCommunityId = String(communityId ?? "").trim();
    if (!normalizedTargetUserId || !normalizedCommunityId) return;
    nextRequestIdRef.current += 1;
    setOpenRequest({
      requestId: nextRequestIdRef.current,
      targetUserId: normalizedTargetUserId,
      communityId: normalizedCommunityId,
    });
    show();
  }, [show]);

  // The address says Inbox (refresh, back, a link) or not (any other page).
  const followRoute = useCallback((inboxRoute: boolean) => {
    setIsOpen(inboxRoute);
  }, []);

  return {
    isOpen,
    openRequest,
    openConversationRequest,
    unreadCount,
    setUnreadCount,
    openConversationById,
    toggle,
    open,
    close,
    closeByUser,
    openFromCommunity,
    followRoute,
    navigatorRef,
  };
}
