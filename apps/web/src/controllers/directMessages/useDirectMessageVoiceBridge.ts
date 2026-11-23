import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useWebVoiceInputController } from "../../../../../shared/useWebVoiceInputController";
import { mergeVoiceTranscript } from "../../../../../shared/voiceCapture";
import type { DirectMessagePanelState, EnsureDirectMessageSession } from "./directMessageHostHelpers";

export function useDirectMessageVoiceBridge<SessionT>(params: {
  isOpen: boolean;
  activeConversationId: string | null;
  session: SessionT | null;
  sessionRef: MutableRefObject<SessionT | null>;
  ensureSession?: EnsureDirectMessageSession<SessionT>;
  requireSignIn?: () => void;
  showAppToastMessage?: (message: string) => void;
  setDirectMessagePanel: Dispatch<SetStateAction<DirectMessagePanelState | null>>;
  focusDirectMessageInput: (options?: { force?: boolean }) => boolean;
}) {
  const {
    isOpen,
    activeConversationId,
    session,
    sessionRef,
    ensureSession,
    requireSignIn,
    showAppToastMessage,
    setDirectMessagePanel,
    focusDirectMessageInput,
  } = params;

  const voiceConversationIdRef = useRef<string | null>(null);
  const pendingVoiceTranscriptConversationIdRef = useRef<string | null>(null);

  const showDirectVoiceMessage = useCallback(
    (message: string) => {
      const normalized = message.trim() || "Voice transcription failed.";
      if (showAppToastMessage) {
        showAppToastMessage(normalized);
        return;
      }
      setDirectMessagePanel((previous) =>
        previous
          ? {
              ...previous,
              error: normalized,
            }
          : previous,
      );
    },
    [setDirectMessagePanel, showAppToastMessage],
  );

  const appendDirectMessageTranscript = useCallback(
    (transcript: string) => {
      const normalized = transcript.trim();
      if (!normalized) return;
      const targetConversationId = pendingVoiceTranscriptConversationIdRef.current;
      if (!targetConversationId) return;
      pendingVoiceTranscriptConversationIdRef.current = null;
      setDirectMessagePanel((previous) => {
        if (!previous) return previous;
        if (previous.conversation.id !== targetConversationId) return previous;
        const input = mergeVoiceTranscript(previous.input, normalized);
        return {
          ...previous,
          input,
          error: null,
        };
      });
    },
    [setDirectMessagePanel],
  );

  const {
    directMessageVoiceIntent,
    directMessageVoiceUiState,
    handleVoiceInputClick: handleDirectMessageVoiceInputClick,
    cancelVoiceInput: cancelDirectMessageVoiceInput,
  } = useWebVoiceInputController<SessionT>({
    session,
    sessionRef,
    ensureSession: ensureSession
      ? (currentSession) => ensureSession(currentSession, "direct_messages_voice")
      : undefined,
    activeCommunity: null,
    activeCommunityFunnelAction: null,
    canPostMessagesActiveCommunity: true,
    requireSignIn: () => {
      if (requireSignIn) {
        requireSignIn();
        return;
      }
      showDirectVoiceMessage("Sign in to use voice input in direct messages.");
    },
    showAppToastMessage: showDirectVoiceMessage,
    appendDirectMessageTranscript,
    focusDirectMessageInput,
  });

  useEffect(() => {
    const previousConversationId = voiceConversationIdRef.current;
    voiceConversationIdRef.current = activeConversationId;
    if (!isOpen || !activeConversationId) {
      pendingVoiceTranscriptConversationIdRef.current = null;
      cancelDirectMessageVoiceInput();
      return;
    }
    if (previousConversationId && previousConversationId !== activeConversationId) {
      pendingVoiceTranscriptConversationIdRef.current = null;
      cancelDirectMessageVoiceInput();
    }
  }, [activeConversationId, cancelDirectMessageVoiceInput, isOpen]);

  return {
    directMessageVoiceIntent,
    directMessageVoiceUiState,
    handleDirectMessageVoiceInputClick,
    showDirectVoiceMessage,
    pendingVoiceTranscriptConversationIdRef,
  };
}
