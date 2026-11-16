import { useCallback, useEffect, useRef, useState } from "react";

import { readPlaceParam, writeOpenPlace } from "../../../../shared/placeParams";

import type {
  DirectMessageOpenConversationRequest,
  DirectMessageOpenRequest,
} from "../components/WebDirectMessagesHost";

export function useWebDirectMessagesController() {
  // Inbox rides on the address (?open=inbox), so a refresh comes back to it.
  const [isOpen, setIsOpen] = useState(() => readPlaceParam("open") === "inbox");
  useEffect(() => { writeOpenPlace("inbox", isOpen); }, [isOpen]);
  const [openRequest, setOpenRequest] = useState<DirectMessageOpenRequest>(null);
  const [openConversationRequest, setOpenConversationRequest] =
    useState<DirectMessageOpenConversationRequest>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const nextRequestIdRef = useRef(0);

  const openConversationById = useCallback((conversationId: string) => {
    const normalizedConversationId = String(conversationId ?? "").trim();
    if (!normalizedConversationId) return;
    nextRequestIdRef.current += 1;
    setOpenRequest(null);
    setOpenConversationRequest({
      requestId: nextRequestIdRef.current,
      conversationId: normalizedConversationId,
    });
    setIsOpen(true);
  }, []);

  const toggle = useCallback(() => {
    setOpenRequest(null);
    setIsOpen((current) => !current);
  }, []);

  const open = useCallback(() => {
    setOpenRequest(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpenRequest(null);
    setIsOpen(false);
  }, []);

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
    setIsOpen(true);
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
    openFromCommunity,
  };
}
