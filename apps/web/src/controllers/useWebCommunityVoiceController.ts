import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  useWebVoiceInputController,
} from "../../../../shared/useWebVoiceInputController";
import type { AuthSession } from "../auth";
import type {
  WebCommunityVoiceButtonOwner,
  WebCommunityVoiceTranscriptTarget,
} from "../webAppContracts";

type UseWebCommunityVoiceControllerParams = {
  session: AuthSession | null;
  sessionRef: MutableRefObject<AuthSession | null>;
  ensureSession: (
    session: AuthSession | null,
  ) => Promise<AuthSession | null>;
  activeCommunity: unknown | null;
  activeCommunityFunnelAction:
    | "checkout"
    | "request_access"
    | "join"
    | null;
  canPostMessagesActiveCommunity: boolean;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  isProfileSetupResolved: boolean;
  isProfileSetupComplete: boolean;
  openProfileSetup: () => void;
  setCommunityMessageInput: Dispatch<SetStateAction<string>>;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  appendCommunityAgentTranscript: (transcript: string) => void;
  focusCommunityAgentInput: () => void;
};

export function useWebCommunityVoiceController(
  params: UseWebCommunityVoiceControllerParams,
) {
  const transcriptTargetRef =
    useRef<WebCommunityVoiceTranscriptTarget | null>(null);
  const [buttonOwner, setButtonOwner] =
    useState<WebCommunityVoiceButtonOwner | null>(null);

  const voice = useWebVoiceInputController<AuthSession>({
    session: params.session,
    sessionRef: params.sessionRef,
    ensureSession: params.ensureSession,
    activeCommunity: params.activeCommunity,
    activeCommunityFunnelAction: params.activeCommunityFunnelAction,
    canPostMessagesActiveCommunity: params.canPostMessagesActiveCommunity,
    requireSignIn: params.requireSignIn,
    showAppToastMessage: params.showAppToastMessage,
    resolveCommunityTranscriptTarget: () => transcriptTargetRef.current,
    setCommunityMessageInput: params.setCommunityMessageInput,
    chatInputRef: params.chatInputRef,
    appendCommunityAgentTranscript: params.appendCommunityAgentTranscript,
    focusCommunityAgentInput: params.focusCommunityAgentInput,
  });

  const handleCommunityVoiceInputClick = useCallback(
    (
      target: WebCommunityVoiceTranscriptTarget | null,
      owner: WebCommunityVoiceButtonOwner,
    ) => {
      if (!params.isProfileSetupResolved) {
        params.showAppToastMessage(
          "We are still verifying your account. Try again in a moment.",
        );
        return;
      }
      if (!params.isProfileSetupComplete) {
        params.openProfileSetup();
        return;
      }
      const activeOwner =
        voice.communityVoiceUiState === "idle"
          ? null
          : buttonOwner ?? "main";
      if (activeOwner !== null && activeOwner !== owner) {
        params.showAppToastMessage(
          "Finish the current voice capture first.",
        );
        return;
      }
      if (voice.communityVoiceUiState === "idle") {
        transcriptTargetRef.current = target;
        setButtonOwner(owner);
      }
      void voice.handleVoiceInputClick("community");
    },
    [
      buttonOwner,
      params.isProfileSetupResolved,
      params.isProfileSetupComplete,
      params.openProfileSetup,
      params.showAppToastMessage,
      voice.communityVoiceUiState,
      voice.handleVoiceInputClick,
    ],
  );

  useEffect(() => {
    if (voice.communityVoiceUiState !== "idle") return;
    transcriptTargetRef.current = null;
    setButtonOwner(null);
  }, [voice.communityVoiceUiState]);

  const activeButtonOwner: WebCommunityVoiceButtonOwner | null =
    voice.communityVoiceUiState === "idle"
      ? null
      : buttonOwner ?? "main";

  return {
    ...voice,
    handleCommunityVoiceInputClick,
    activeCommunityVoiceButtonOwner: activeButtonOwner,
    communityVoiceButtonTitle: params.isProfileSetupComplete
      ? voice.communityVoiceIntent.title
      : "Finish your profile to use voice input in community chat.",
    mainCommunityVoiceButtonState:
      activeButtonOwner === null || activeButtonOwner === "main"
        ? voice.communityVoiceUiState
        : "idle",
    drawerCommunityVoiceButtonState:
      activeButtonOwner === "drawer"
        ? voice.communityVoiceUiState
        : "idle",
  };
}
