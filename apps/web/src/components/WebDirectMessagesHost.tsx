import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectMessage, DirectMessageConversation } from "../../../../shared/communityTypes";
import {
  createCloudDirectMessagesLiveClient,
  ensureCloudDirectConversationFromCommunity,
  listCloudDirectConversations,
  subscribeCloudDirectConversations,
  sendCloudDirectMessage,
  subscribeCloudDirectMessages,
} from "../../../../shared/cloudDirectMessagesGateway";
import { WebDirectMessageInboxPanel } from "./WebDirectMessageInboxPanel";
import { WebDirectMessagePanel } from "./WebDirectMessagePanel";

type DirectMessagePanelState = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  input: string;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
};

export type DirectMessageOpenRequest = {
  requestId: number;
  targetUserId: string;
  communityId: string;
} | null;

type WebDirectMessagesHostProps<SessionT> = {
  isOpen: boolean;
  openRequest: DirectMessageOpenRequest;
  session: SessionT | null;
  sessionUserId: string | null;
  getInitials: (value: string) => string;
  getAvatarColor: (seed: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onClose: () => void;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function WebDirectMessagesHost<SessionT>(props: WebDirectMessagesHostProps<SessionT>) {
  const {
    isOpen,
    openRequest,
    session,
    sessionUserId,
    getInitials,
    getAvatarColor,
    renderTextWithLinks,
    onClose,
  } = props;
  const [conversations, setConversations] = useState<DirectMessageConversation[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [directMessagePanel, setDirectMessagePanel] = useState<DirectMessagePanelState | null>(null);
  const inboxLoadRequestRef = useRef(0);
  const hasInboxLiveSubscriptionRef = useRef(false);
  const directMessageOpenRequestRef = useRef(0);

  const activeConversationId = directMessagePanel?.conversation.id ?? null;

  const loadInbox = useCallback(async () => {
    const requestId = inboxLoadRequestRef.current + 1;
    inboxLoadRequestRef.current = requestId;
    if (!session) {
      setConversations([]);
      setInboxError(null);
      setIsLoadingInbox(false);
      return;
    }
    setIsLoadingInbox(true);
    setInboxError(null);
    try {
      const rows = await listCloudDirectConversations({
        session,
        limit: 30,
      });
      if (inboxLoadRequestRef.current !== requestId) return;
      setConversations(rows);
    } catch (error) {
      if (inboxLoadRequestRef.current !== requestId) return;
      setInboxError(toErrorMessage(error, "Failed to load direct messages."));
    } finally {
      if (inboxLoadRequestRef.current !== requestId) return;
      setIsLoadingInbox(false);
    }
  }, [session]);

  useEffect(() => {
    hasInboxLiveSubscriptionRef.current = false;
    if (!isOpen || !session) {
      setIsLoadingInbox(false);
      return;
    }

    let isDisposed = false;
    let unsubscribe = () => {};
    let liveClient: ReturnType<typeof createCloudDirectMessagesLiveClient> | null = null;
    hasInboxLiveSubscriptionRef.current = true;
    setIsLoadingInbox(true);
    setInboxError(null);

    try {
      liveClient = createCloudDirectMessagesLiveClient({ session });
      unsubscribe = subscribeCloudDirectConversations<DirectMessageConversation>({
        liveClient,
        limit: 30,
        onUpdate: (rows) => {
          if (isDisposed) return;
          setConversations(rows);
          setIsLoadingInbox(false);
          setInboxError(null);
        },
        onError: (error) => {
          if (isDisposed) return;
          setIsLoadingInbox(false);
          setInboxError(toErrorMessage(error, "Failed to load direct messages."));
        },
      });
    } catch (error) {
      hasInboxLiveSubscriptionRef.current = false;
      setIsLoadingInbox(false);
      setInboxError(toErrorMessage(error, "Failed to load direct messages."));
      void loadInbox();
    }

    return () => {
      isDisposed = true;
      hasInboxLiveSubscriptionRef.current = false;
      unsubscribe();
      liveClient?.close();
    };
  }, [isOpen, loadInbox, session]);

  useEffect(() => {
    if (!isOpen || !openRequest) return;
    const requestId = openRequest.requestId;
    directMessageOpenRequestRef.current = requestId;

    const targetUserId = String(openRequest.targetUserId ?? "").trim();
    const communityId = String(openRequest.communityId ?? "").trim();
    if (!session || !targetUserId || !communityId) {
      setDirectMessagePanel(null);
      setInboxError("Failed to open direct message.");
      setIsLoadingInbox(false);
      return;
    }

    let isDisposed = false;
    setDirectMessagePanel(null);
    setInboxError(null);
    setIsLoadingInbox(true);

    void ensureCloudDirectConversationFromCommunity({
      session,
      targetUserId,
      communityId,
    })
      .then((conversation) => {
        if (isDisposed || directMessageOpenRequestRef.current !== requestId) return;
        setInboxError(null);
        setIsLoadingInbox(false);
        setDirectMessagePanel({
          conversation,
          messages: [],
          input: "",
          isLoading: true,
          isSending: false,
          error: null,
        });
      })
      .catch((error) => {
        if (isDisposed || directMessageOpenRequestRef.current !== requestId) return;
        setDirectMessagePanel(null);
        setInboxError(toErrorMessage(error, "Failed to open direct message."));
        setIsLoadingInbox(false);
      });

    return () => {
      isDisposed = true;
    };
  }, [isOpen, openRequest, session]);

  useEffect(() => {
    if (!isOpen) {
      setDirectMessagePanel(null);
      return;
    }
    if (activeConversationId) return;
    if (hasInboxLiveSubscriptionRef.current) return;
    void loadInbox();
  }, [activeConversationId, isOpen, loadInbox]);

  useEffect(() => {
    if (!isOpen || !activeConversationId || !session) return;

    let isDisposed = false;
    let unsubscribe = () => {};
    let liveClient: ReturnType<typeof createCloudDirectMessagesLiveClient> | null = null;

    try {
      liveClient = createCloudDirectMessagesLiveClient({ session });
      unsubscribe = subscribeCloudDirectMessages<DirectMessage>({
        liveClient,
        conversationId: activeConversationId,
        limit: 100,
        onUpdate: (messages) => {
          if (isDisposed) return;
          setDirectMessagePanel((previous) =>
            previous?.conversation.id === activeConversationId
              ? {
                  ...previous,
                  messages,
                  isLoading: false,
                  error: null,
                }
              : previous,
          );
        },
        onError: (error) => {
          if (isDisposed) return;
          setDirectMessagePanel((previous) =>
            previous?.conversation.id === activeConversationId
              ? {
                  ...previous,
                  isLoading: false,
                  error: toErrorMessage(error, "Failed to load direct messages."),
                }
              : previous,
          );
        },
      });
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === activeConversationId
          ? {
              ...previous,
              isLoading: false,
              error: toErrorMessage(error, "Failed to load direct messages."),
            }
          : previous,
      );
    }

    return () => {
      isDisposed = true;
      unsubscribe();
      liveClient?.close();
    };
  }, [activeConversationId, isOpen, session]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const host = document.querySelector(".web-direct-messages-host");
      if (host?.contains(target)) return;
      if (target instanceof Element && target.closest(".direct-messages-topbar-button")) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const openConversation = useCallback((conversation: DirectMessageConversation) => {
    setDirectMessagePanel({
      conversation,
      messages: [],
      input: "",
      isLoading: true,
      isSending: false,
      error: null,
    });
  }, []);

  const sendDirectMessage = useCallback(async () => {
    const current = directMessagePanel;
    const text = String(current?.input ?? "").trim();
    if (!current || !text || !session) return;
    setDirectMessagePanel((previous) =>
      previous?.conversation.id === current.conversation.id
        ? {
            ...previous,
            isSending: true,
            error: null,
          }
        : previous,
    );
    try {
      await sendCloudDirectMessage({
        session,
        conversationId: current.conversation.id,
        text,
      });
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              input: "",
              isSending: false,
              error: null,
            }
          : previous,
      );
    } catch (error) {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === current.conversation.id
          ? {
              ...previous,
              isSending: false,
              error: toErrorMessage(error, "Failed to send direct message."),
            }
          : previous,
      );
    }
  }, [directMessagePanel, session]);

  if (!isOpen) return null;

  return (
    <div className="web-direct-messages-host">
      {directMessagePanel ? (
        <WebDirectMessagePanel
          conversation={directMessagePanel.conversation}
          messages={directMessagePanel.messages}
          input={directMessagePanel.input}
          isLoading={directMessagePanel.isLoading}
          isSending={directMessagePanel.isSending}
          error={directMessagePanel.error}
          sessionUserId={sessionUserId}
          getInitials={getInitials}
          getAvatarColor={getAvatarColor}
          renderTextWithLinks={renderTextWithLinks}
          onInputChange={(value) => {
            setDirectMessagePanel((previous) =>
              previous
                ? {
                    ...previous,
                    input: value,
                  }
                : previous,
            );
          }}
          onSend={sendDirectMessage}
          onBackToInbox={() => {
            setDirectMessagePanel(null);
          }}
        />
      ) : (
        <WebDirectMessageInboxPanel
          conversations={conversations}
          isLoading={isLoadingInbox}
          error={inboxError}
          sessionUserId={sessionUserId}
          getInitials={getInitials}
          getAvatarColor={getAvatarColor}
          onSelectConversation={openConversation}
        />
      )}
    </div>
  );
}
