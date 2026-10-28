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
  getVoiceLanguageHint,
  mergeVoiceTranscript,
} from "./voiceCapture";

export type VoiceSurface = "community" | "direct_message" | "member_agent";
export type VoiceUiState = "idle" | "recording" | "transcribing";

type VoiceInputIntent = {
  mode:
    | "sign_in"
    | "select_community"
    | "join_community"
    | "start_recording"
    | "stop_recording"
    | "transcribing"
    | "busy";
  title: string;
};

type BrowserSpeechRecognitionAlternative = {
  transcript?: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
};

type BrowserSpeechRecognitionResultList = {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult | undefined;
};

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex?: number;
  results?: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type UseWebVoiceInputControllerArgs<SessionT> = {
  session: SessionT | null;
  sessionRef: MutableRefObject<SessionT | null>;
  ensureSession?: (session: SessionT | null) => Promise<SessionT | null>;
  activeCommunity?: unknown | null;
  activeCommunityFunnelAction?: "checkout" | "request_access" | "join" | null;
  canPostMessagesActiveCommunity?: boolean;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  resolveCommunityTranscriptTarget?: () => {
    appendTranscript: (transcript: string) => void;
    focusInput?: () => void;
  } | null | undefined;
  setCommunityMessageInput?: Dispatch<SetStateAction<string>>;
  chatInputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  appendDirectMessageTranscript?: (transcript: string) => void;
  focusDirectMessageInput?: () => void;
  appendCommunityAgentTranscript?: (transcript: string) => void;
  focusCommunityAgentInput?: () => void;
};

function getBrowserSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  const ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor : null;
}

function normalizeSpeechTranscript(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function formatSpeechRecognitionError(error: BrowserSpeechRecognitionErrorEvent): string {
  const code = String(error.error ?? "").trim().toLowerCase();
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone permission is blocked.";
  }
  if (code === "audio-capture") return "No microphone was found.";
  if (code === "network") return "Voice input is not available in this browser right now.";
  if (code === "language-not-supported") return "Voice input is not available for this language.";
  if (code === "bad-grammar") return "Voice input failed.";
  const message = String(error.message ?? "").trim();
  return message || "Voice input failed.";
}

function logVoiceInputDiagnostic(
  level: "info" | "warn",
  event: string,
  payload: Record<string, unknown>,
): void {
  try {
    const logger = level === "warn" ? console.warn : console.info;
    logger(`[voice] ${event}`, payload);
  } catch {
    // ignore diagnostic logging failures
  }
}

export function useWebVoiceInputController<SessionT>(args: UseWebVoiceInputControllerArgs<SessionT>) {
  const [activeVoiceSurface, setActiveVoiceSurface] = useState<VoiceSurface | null>(null);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechFinalTranscriptRef = useRef("");
  const speechInterimTranscriptRef = useRef("");
  const speechManualStopRef = useRef(false);
  const speechStopResolveRef = useRef<((transcript: string) => void) | null>(null);
  const speechLastErrorMessageRef = useRef<string | null>(null);

  function resolveVoiceInputIntent(surface: VoiceSurface): VoiceInputIntent {
    if (!args.session) {
      return {
        mode: "sign_in",
        title:
          surface === "community"
            ? "Sign in to use voice input in community chat."
            : surface === "direct_message"
              ? "Sign in to use voice input in direct messages."
            : "Sign in to use voice input.",
      };
    }
    if (surface === "community") {
      if (!args.activeCommunity) {
        return {
          mode: "select_community",
          title: "Select a community first.",
        };
      }
      if (!args.canPostMessagesActiveCommunity) {
        const joinMessage =
          args.activeCommunityFunnelAction === "checkout"
            ? "Pick a plan to use voice input in this community."
            : args.activeCommunityFunnelAction === "request_access"
              ? "Join and wait for approval to use voice input in this community."
              : "Join this community to use voice input.";
        return {
          mode: "join_community",
          title: joinMessage,
        };
      }
    }
    if (isVoiceTranscribing) {
      return {
        mode: "transcribing",
        title: "Finishing voice input...",
      };
    }
    if (activeVoiceSurface && activeVoiceSurface !== surface) {
      return {
        mode: "busy",
        title: "Finish the current voice capture first.",
      };
    }
    if (activeVoiceSurface === surface) {
      return {
        mode: "stop_recording",
        title: "Stop voice input.",
      };
    }
    return {
      mode: "start_recording",
      title: "Start voice input.",
    };
  }

  function resolveVoiceUiState(surface: VoiceSurface): VoiceUiState {
    if (activeVoiceSurface !== surface) return "idle";
    return isVoiceTranscribing ? "transcribing" : "recording";
  }

  function readCurrentSpeechTranscript(): string {
    return normalizeSpeechTranscript(
      [speechFinalTranscriptRef.current, speechInterimTranscriptRef.current]
        .filter(Boolean)
        .join(" "),
    );
  }

  const releaseVoiceCaptureResources = useCallback(() => {
    speechManualStopRef.current = true;
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    speechStopResolveRef.current = null;
    speechFinalTranscriptRef.current = "";
    speechInterimTranscriptRef.current = "";
    speechLastErrorMessageRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // ignore cleanup race
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      releaseVoiceCaptureResources();
    };
  }, [releaseVoiceCaptureResources]);

  const cancelVoiceInput = useCallback(() => {
    releaseVoiceCaptureResources();
    setIsVoiceTranscribing(false);
    setActiveVoiceSurface(null);
  }, [releaseVoiceCaptureResources]);

  function applyVoiceTranscript(surface: VoiceSurface, transcript: string) {
    if (!transcript) return;
    if (surface === "direct_message") {
      args.appendDirectMessageTranscript?.(transcript);
      window.setTimeout(() => {
        args.focusDirectMessageInput?.();
      }, 0);
      return;
    }
    if (surface === "member_agent") {
      args.appendCommunityAgentTranscript?.(transcript);
      window.setTimeout(() => {
        args.focusCommunityAgentInput?.();
      }, 0);
      return;
    }
    const communityTarget = args.resolveCommunityTranscriptTarget?.() ?? null;
    if (communityTarget) {
      communityTarget.appendTranscript(transcript);
      window.setTimeout(() => {
        communityTarget.focusInput?.();
      }, 0);
      return;
    }
    args.setCommunityMessageInput?.((prev) => mergeVoiceTranscript(prev, transcript));
    window.setTimeout(() => {
      const input = args.chatInputRef?.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      input.focus();
    }, 0);
  }

  function recordSpeechRecognitionResult(event: BrowserSpeechRecognitionEvent): void {
    const results = event.results;
    if (!results) return;
    const startIndex = Math.max(0, Number(event.resultIndex ?? 0));
    let nextInterim = "";
    for (let index = startIndex; index < results.length; index += 1) {
      const result = results[index];
      const transcript = String(result?.[0]?.transcript ?? "").trim();
      if (!transcript) continue;
      if (result?.isFinal) {
        speechFinalTranscriptRef.current = normalizeSpeechTranscript(
          `${speechFinalTranscriptRef.current} ${transcript}`,
        );
      } else {
        nextInterim = normalizeSpeechTranscript(`${nextInterim} ${transcript}`);
      }
    }
    speechInterimTranscriptRef.current = nextInterim;
  }

  function finishManualSpeechStop(): void {
    const resolveStop = speechStopResolveRef.current;
    speechStopResolveRef.current = null;
    if (resolveStop) resolveStop(readCurrentSpeechTranscript());
  }

  function startRecognitionInstance(recognition: BrowserSpeechRecognition): boolean {
    try {
      recognition.start();
      return true;
    } catch (error) {
      logVoiceInputDiagnostic("warn", "start_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function startVoiceCapture(surface: VoiceSurface): Promise<void> {
    const SpeechRecognitionCtor = getBrowserSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      args.showAppToastMessage("Voice input is not available in this browser.");
      return;
    }
    releaseVoiceCaptureResources();
    speechManualStopRef.current = false;
    speechFinalTranscriptRef.current = "";
    speechInterimTranscriptRef.current = "";
    speechLastErrorMessageRef.current = null;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    const language = getVoiceLanguageHint();
    if (language) recognition.lang = language;
    recognition.onresult = recordSpeechRecognitionResult;
    recognition.onerror = (event) => {
      const code = String(event.error ?? "").trim().toLowerCase();
      if (code === "no-speech" || code === "aborted") return;
      speechLastErrorMessageRef.current = formatSpeechRecognitionError(event);
      logVoiceInputDiagnostic("warn", "recognition_error", {
        surface,
        code: code || null,
        message: speechLastErrorMessageRef.current,
      });
    };
    recognition.onend = () => {
      if (speechRecognitionRef.current !== recognition) return;
      if (speechManualStopRef.current) {
        finishManualSpeechStop();
        return;
      }
      if (speechLastErrorMessageRef.current) {
        const message = speechLastErrorMessageRef.current;
        releaseVoiceCaptureResources();
        setIsVoiceTranscribing(false);
        setActiveVoiceSurface(null);
        args.showAppToastMessage(message);
        return;
      }
      window.setTimeout(() => {
        if (
          speechRecognitionRef.current !== recognition ||
          speechManualStopRef.current ||
          speechLastErrorMessageRef.current
        ) {
          return;
        }
        if (!startRecognitionInstance(recognition)) {
          releaseVoiceCaptureResources();
          setIsVoiceTranscribing(false);
          setActiveVoiceSurface(null);
          args.showAppToastMessage("Voice input is not available in this browser right now.");
        }
      }, 120);
    };
    speechRecognitionRef.current = recognition;
    if (!startRecognitionInstance(recognition)) {
      releaseVoiceCaptureResources();
      args.showAppToastMessage("Voice input is not available in this browser.");
      return;
    }
    setActiveVoiceSurface(surface);
    args.showAppToastMessage("Listening... tap mic again when you're done.");
  }

  async function stopVoiceCaptureAndTranscribe(
    surface: VoiceSurface,
    applyTranscriptToComposer = true,
  ): Promise<string> {
    const recognition = speechRecognitionRef.current;
    if (!recognition || activeVoiceSurface !== surface) return "";
    speechManualStopRef.current = true;
    setIsVoiceTranscribing(true);
    try {
      const transcript = await new Promise<string>((resolve) => {
        let settled = false;
        const settle = (value: string) => {
          if (settled) return;
          settled = true;
          if (speechStopResolveRef.current === settle) {
            speechStopResolveRef.current = null;
          }
          resolve(value);
        };
        speechStopResolveRef.current = settle;
        window.setTimeout(() => settle(readCurrentSpeechTranscript()), 1200);
        try {
          recognition.stop();
        } catch {
          settle(readCurrentSpeechTranscript());
        }
      });
      if (!transcript) {
        args.showAppToastMessage("No speech detected.");
        return "";
      }
      if (applyTranscriptToComposer) {
        applyVoiceTranscript(surface, transcript);
        args.showAppToastMessage("Transcript inserted.");
      }
      return transcript;
    } finally {
      releaseVoiceCaptureResources();
      setIsVoiceTranscribing(false);
      setActiveVoiceSurface(null);
    }
  }

  async function finishVoiceInputForSubmit(surface: VoiceSurface): Promise<string> {
    return await stopVoiceCaptureAndTranscribe(surface, false);
  }

  async function handleVoiceInputClick(surface: VoiceSurface) {
    const intent = resolveVoiceInputIntent(surface);
    if (intent.mode === "sign_in") {
      args.requireSignIn();
      return;
    }
    if (intent.mode === "select_community" || intent.mode === "join_community" || intent.mode === "busy") {
      args.showAppToastMessage(intent.title);
      return;
    }
    if (intent.mode === "transcribing") {
      args.showAppToastMessage(intent.title);
      return;
    }
    if (intent.mode === "stop_recording") {
      await stopVoiceCaptureAndTranscribe(surface);
      return;
    }
    await startVoiceCapture(surface);
  }

  const communityVoiceIntent = resolveVoiceInputIntent("community");
  const directMessageVoiceIntent = resolveVoiceInputIntent("direct_message");
  const communityAgentVoiceIntent = resolveVoiceInputIntent("member_agent");
  const communityVoiceUiState = resolveVoiceUiState("community");
  const directMessageVoiceUiState = resolveVoiceUiState("direct_message");
  const communityAgentVoiceUiState = resolveVoiceUiState("member_agent");

  return {
    communityVoiceIntent,
    directMessageVoiceIntent,
    communityAgentVoiceIntent,
    communityVoiceUiState,
    directMessageVoiceUiState,
    communityAgentVoiceUiState,
    handleVoiceInputClick,
    finishVoiceInputForSubmit,
    cancelVoiceInput,
  };
}
