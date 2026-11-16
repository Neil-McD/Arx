import { useCallback, useRef, useState } from "react";

import type {
  DirectMessageOpenConversationRequest,
  DirectMessageOpenRequest,
} from "../components/WebDirectMessagesHost";

// Inbox's address (/c/<slug>/inbox; design v1). App sets it once the shell
// can navigate. Inbox is open exactly while the address is Inbox's; without
// an address (the classic layout, or no community to put in it) Inbox opens
// in place, as before.
export type InboxAddress = {
  // The address is Inbox's now.
  isOpen: () => boolean;
  // Go to Inbox's address. False when there is none to go to.
  open: () => boolean;
  // Inbox's own close button or Escape: back to the page it was opened from.
  close: () => void;
};

export function useWebDirectMessagesController() {
  // Open in place (no address to use). With an address, App reads "open"
  // from the address instead.
  const [isOpenInPlace, setIsOpenInPlace] = useState(false);
  const isOpenInPlaceRef = useRef(isOpenInPlace);
  isOpenInPlaceRef.current = isOpenInPlace;
  const addressRef = useRef<InboxAddress | null>(null);
  const [openRequest, setOpenRequest] = useState<DirectMessageOpenRequest>(null);
  const [openConversationRequest, setOpenConversationRequest] =
    useState<DirectMessageOpenConversationRequest>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const nextRequestIdRef = useRef(0);

  const show = useCallback(() => {
    if (addressRef.current?.open()) return;
    setIsOpenInPlace(true);
  }, []);
  const hide = useCallback((byUser: boolean) => {
    // Closed by another page opening: that page's address closes Inbox.
    if (byUser && addressRef.current?.isOpen()) addressRef.current.close();
    setIsOpenInPlace(false);
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
    if (addressRef.current?.isOpen() || isOpenInPlaceRef.current) hide(true);
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

  return {
    isOpenInPlace,
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
    addressRef,
  };
}
