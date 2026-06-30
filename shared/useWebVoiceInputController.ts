import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { blobToBase64 } from "./imageTransforms";
import {
  transcribeVoice,
  VoiceTranscriptionRequestError,
} from "./authCore";
import { normalizePaidUsageFailureCode, type PaidUsageBillingMode } from "./paidUsageBilling";
import { resolveUsableSession } from "./ensureUsableSession";
import type { PaidToolKind } from "./workspaceCredits";
import {
  createWavBlobFromInt16Chunks,
  floatToInt16Pcm,
  getVoiceAudioContextConstructor,
  getVoiceLanguageHint,
  getVoiceUserMedia,
  mergeVoiceTranscript,
  normalizeVoiceTranscriptionMimeType,
  selectVoiceCaptureMimeType,
  VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  VOICE_TRANSCRIPTION_MAX_DURATION_MS,
} from "./voiceCapture";

export type VoiceSurface = "workspace" | "community" | "direct_message";
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

export type VoiceToolBalanceDetails = {
  toolKind?: PaidToolKind | null;
  requiredCredits?: number | null;
  paidUsageBillingMode?: PaidUsageBillingMode | null;
};

type UseWebVoiceInputControllerArgs<SessionT> = {
  session: SessionT | null;
  sessionRef: MutableRefObject<SessionT | null>;
  ensureSession?: (session: SessionT | null) => Promise<SessionT | null>;
  activeCommunity?: unknown | null;
  activeCommunityFunnelAction?: "checkout" | "request_access" | "join" | null;
  canPostMessagesActiveCommunity?: boolean;
  requireSignIn: () => void;
  showAppToastMessage: (message: string) => void;
  onToolBalanceRequired?: (
    surface: VoiceSurface,
    message: string,
    details?: VoiceToolBalanceDetails,
  ) => void;
  appendWorkspaceTranscript?: (transcript: string) => void;
  focusWorkspaceInput?: () => void;
  resolveCommunityTranscriptTarget?: () => {
    appendTranscript: (transcript: string) => void;
    focusInput?: () => void;
  } | null | undefined;
  setCommunityMessageInput?: Dispatch<SetStateAction<string>>;
  chatInputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  appendDirectMessageTranscript?: (transcript: string) => void;
  focusDirectMessageInput?: () => void;
};

function isToolBalanceError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("credits_exhausted") ||
    normalized.includes("credits_unavailable") ||
    normalized.includes("workspace_credits_exhausted") ||
    normalized.includes("workspace_credits_unavailable") ||
    normalized.includes("add balance to use voice input") ||
    normalized.includes("tool balance is unavailable")
  );
}

function isVoiceToolBalanceError(error: unknown, message: string): boolean {
  if (error instanceof VoiceTranscriptionRequestError) {
    const code = normalizePaidUsageFailureCode(error.code);
    if (code) return true;
  }
  return isToolBalanceError(message);
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

function readRoundedMegabytes(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1_000_000));
}

export function useWebVoiceInputController<SessionT>(args: UseWebVoiceInputControllerArgs<SessionT>) {
  const [activeVoiceSurface, setActiveVoiceSurface] = useState<VoiceSurface | null>(null);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStopCaptureRef = useRef<(() => Promise<Blob>) | null>(null);
  const voiceCaptureCleanupRef = useRef<(() => void) | null>(null);
  const voiceCaptureStartedAtRef = useRef<number | null>(null);

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
        title: "Transcribing voice input...",
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
        title: "Stop recording and transcribe.",
      };
    }
    return {
      mode: "start_recording",
      title: "Start voice input (uses tool balance).",
    };
  }

  function resolveVoiceUiState(surface: VoiceSurface): VoiceUiState {
    if (activeVoiceSurface !== surface) return "idle";
    return isVoiceTranscribing ? "transcribing" : "recording";
  }

  const releaseVoiceCaptureResources = useCallback(() => {
    const cleanupCapture = voiceCaptureCleanupRef.current;
    if (cleanupCapture) {
      try {
        cleanupCapture();
      } catch {
        // ignore cleanup race
      }
    }
    voiceCaptureCleanupRef.current = null;
    voiceStopCaptureRef.current = null;
    const stream = voiceStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    voiceStreamRef.current = null;
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceCaptureStartedAtRef.current = null;
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
    if (surface === "workspace") {
      args.appendWorkspaceTranscript?.(transcript);
      window.setTimeout(() => {
        args.focusWorkspaceInput?.();
      }, 0);
      return;
    }
    if (surface === "direct_message") {
      args.appendDirectMessageTranscript?.(transcript);
      window.setTimeout(() => {
        args.focusDirectMessageInput?.();
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

  async function transcribeVoiceBlob(
    surface: VoiceSurface,
    blob: Blob,
    durationMs: number | null,
  ): Promise<string> {
    const mimeType = normalizeVoiceTranscriptionMimeType(blob.type || "audio/webm");
    if (!mimeType) {
      logVoiceInputDiagnostic("warn", "unsupported_audio_format", {
        surface,
        mime_type: blob.type || null,
        audio_bytes: blob.size,
        duration_ms: durationMs,
      });
      throw new VoiceTranscriptionRequestError({
        message: "This browser recorded an unsupported audio format.",
        status: 400,
        code: "unsupported_audio_format",
      });
    }
    if (blob.size > VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
      logVoiceInputDiagnostic("warn", "audio_too_large", {
        surface,
        mime_type: mimeType,
        audio_bytes: blob.size,
        max_audio_bytes: VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
        duration_ms: durationMs,
      });
      throw new VoiceTranscriptionRequestError({
        message: `Voice clip is too large. Keep it under ${readRoundedMegabytes(
          VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
        )} MB and try again.`,
        status: 413,
        code: "audio_too_large",
      });
    }
    if (
      typeof durationMs === "number" &&
      Number.isFinite(durationMs) &&
      durationMs > VOICE_TRANSCRIPTION_MAX_DURATION_MS
    ) {
      logVoiceInputDiagnostic("warn", "audio_too_long", {
        surface,
        mime_type: mimeType,
        audio_bytes: blob.size,
        duration_ms: durationMs,
        max_duration_ms: VOICE_TRANSCRIPTION_MAX_DURATION_MS,
      });
      throw new VoiceTranscriptionRequestError({
        message: "Voice clip is too long. Try a shorter recording.",
        status: 413,
        code: "audio_too_long",
      });
    }
    logVoiceInputDiagnostic("info", "upload_start", {
      surface,
      mime_type: mimeType,
      audio_bytes: blob.size,
      duration_ms: durationMs,
    });
    const session = await resolveUsableSession(args.sessionRef.current ?? args.session, args.ensureSession);
    if (!session) throw new Error("Sign in to use voice input.");
    return await transcribeVoice({
      session: session as unknown as { access_token: string },
      audioBase64: await blobToBase64(blob),
      mimeType,
      language: getVoiceLanguageHint(),
      surface,
      preferPrimary: false,
      durationMs,
    });
  }

  async function startVoiceCapture(surface: VoiceSurface): Promise<void> {
    const requestUserMedia = getVoiceUserMedia();
    if (!requestUserMedia) {
      args.showAppToastMessage("Voice input is not supported on this device.");
      return;
    }
    try {
      const stream = await requestUserMedia({ audio: true });
      if (typeof MediaRecorder === "undefined") {
        const AudioContextCtor = getVoiceAudioContextConstructor();
        if (!AudioContextCtor) throw new Error("voice_unsupported");
        const audioContext = new AudioContextCtor();
        await audioContext.resume().catch(() => undefined);
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const silentSink = audioContext.createGain();
        silentSink.gain.value = 0;
        const pcmChunks: Int16Array[] = [];
        let cleanedUp = false;
        const cleanupCapture = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          processor.onaudioprocess = null;
          try {
            source.disconnect();
          } catch {
            // ignore disconnect race
          }
          try {
            processor.disconnect();
          } catch {
            // ignore disconnect race
          }
          try {
            silentSink.disconnect();
          } catch {
            // ignore disconnect race
          }
          void audioContext.close().catch(() => undefined);
        };
        processor.onaudioprocess = (event) => {
          const samples = event.inputBuffer.getChannelData(0);
          if (!samples || samples.length === 0) return;
          pcmChunks.push(floatToInt16Pcm(samples));
        };
        source.connect(processor);
        processor.connect(silentSink);
        silentSink.connect(audioContext.destination);
        voiceCaptureCleanupRef.current = cleanupCapture;
        voiceStopCaptureRef.current = async () => {
          cleanupCapture();
          return createWavBlobFromInt16Chunks(pcmChunks, audioContext.sampleRate);
        };
        voiceStreamRef.current = stream;
        voiceRecorderRef.current = null;
        voiceChunksRef.current = [];
        voiceCaptureStartedAtRef.current = Date.now();
        setActiveVoiceSurface(surface);
        args.showAppToastMessage("Listening... tap mic again to stop.");
        return;
      }
      const mimeType = selectVoiceCaptureMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        releaseVoiceCaptureResources();
        setActiveVoiceSurface(null);
        setIsVoiceTranscribing(false);
        args.showAppToastMessage("Microphone recording failed.");
      };
      voiceCaptureCleanupRef.current = () => {
        try {
          recorder.ondataavailable = null;
          recorder.onerror = null;
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // ignore cleanup race
        }
      };
      voiceStopCaptureRef.current = () =>
        new Promise<Blob>((resolve, reject) => {
          const handleStop = () => {
            recorder.removeEventListener("stop", handleStop);
            recorder.removeEventListener("error", handleError);
            const blob = new Blob(voiceChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });
            resolve(blob);
          };
          const handleError = () => {
            recorder.removeEventListener("stop", handleStop);
            recorder.removeEventListener("error", handleError);
            reject(new Error("recording_failed"));
          };
          recorder.addEventListener("stop", handleStop, { once: true });
          recorder.addEventListener("error", handleError, { once: true });
          if (recorder.state === "inactive") {
            handleStop();
            return;
          }
          recorder.stop();
        });
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceCaptureStartedAtRef.current = Date.now();
      setActiveVoiceSurface(surface);
      recorder.start(250);
      args.showAppToastMessage("Listening... tap mic again to stop.");
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone was found."
            : error instanceof Error && error.message === "voice_unsupported"
              ? "Voice input is not supported on this device."
              : "Could not start microphone capture.";
      args.showAppToastMessage(message);
      releaseVoiceCaptureResources();
      setActiveVoiceSurface(null);
      setIsVoiceTranscribing(false);
    }
  }

  async function stopVoiceCaptureAndTranscribe(surface: VoiceSurface): Promise<void> {
    const stopCapture = voiceStopCaptureRef.current;
    if (!stopCapture || activeVoiceSurface !== surface) return;
    setIsVoiceTranscribing(true);
    try {
      const durationMs =
        voiceCaptureStartedAtRef.current === null
          ? null
          : Math.max(0, Date.now() - voiceCaptureStartedAtRef.current);
      const audioBlob = await stopCapture();
      releaseVoiceCaptureResources();
      if (audioBlob.size === 0) {
        args.showAppToastMessage("No audio captured.");
        return;
      }
      const transcript = await transcribeVoiceBlob(surface, audioBlob, durationMs);
      if (!transcript) {
        args.showAppToastMessage("No speech detected.");
        return;
      }
      applyVoiceTranscript(surface, transcript);
      args.showAppToastMessage("Transcript inserted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isVoiceToolBalanceError(error, message)) {
        const details =
          error instanceof VoiceTranscriptionRequestError
            ? {
                toolKind: error.toolKind ?? "voice_input",
                requiredCredits: error.requiredCredits,
                paidUsageBillingMode: error.paidUsageBillingMode,
              }
            : {
                toolKind: "voice_input" as const,
                requiredCredits: null,
                paidUsageBillingMode: null,
              };
        args.onToolBalanceRequired?.(surface, message, details);
        if (!args.onToolBalanceRequired) {
          args.showAppToastMessage("Add balance to use voice input.");
        }
        return;
      }
      args.showAppToastMessage(message || "Voice transcription failed.");
    } finally {
      releaseVoiceCaptureResources();
      setIsVoiceTranscribing(false);
      setActiveVoiceSurface(null);
    }
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

  const workspaceVoiceIntent = resolveVoiceInputIntent("workspace");
  const communityVoiceIntent = resolveVoiceInputIntent("community");
  const directMessageVoiceIntent = resolveVoiceInputIntent("direct_message");
  const workspaceVoiceUiState = resolveVoiceUiState("workspace");
  const communityVoiceUiState = resolveVoiceUiState("community");
  const directMessageVoiceUiState = resolveVoiceUiState("direct_message");

  return {
    workspaceVoiceIntent,
    communityVoiceIntent,
    directMessageVoiceIntent,
    workspaceVoiceUiState,
    communityVoiceUiState,
    directMessageVoiceUiState,
    handleVoiceInputClick,
    cancelVoiceInput,
  };
}
