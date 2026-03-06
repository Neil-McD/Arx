import { useEffect, useRef, useState } from "react";
import type { DesktopShellClient } from "../../runtime/shell/client";
import type { VoiceSurface, VoiceUiState } from "../../features/harness/runPhase";
import { blobToBase64 } from "../../../shared/imageTransforms";
import {
  createWavBlobFromInt16Chunks,
  floatToInt16Pcm,
  getVoiceAudioContextConstructor,
  getVoiceLanguageHint,
  getVoiceUserMedia,
  mergeVoiceTranscript,
  selectVoiceCaptureMimeType,
} from "../../../shared/voiceCapture";
import { transcribeVoice as transcribeCloudVoice, type AuthSession as CloudSession } from "../../../shared/authSessionCore";

type VoiceSupportState = {
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasAudioContext: boolean;
  isSecureContext: boolean;
  canRecord: boolean;
};

const VOICE_CAPTURE_SAMPLE_RATE = 16_000;
const VOICE_CAPTURE_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    sampleRate: VOICE_CAPTURE_SAMPLE_RATE,
    sampleSize: 16,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
};

function getVoiceSupportState(): VoiceSupportState {
  const hasGetUserMedia = Boolean(getVoiceUserMedia());
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const hasAudioContext = Boolean(getVoiceAudioContextConstructor());
  const isSecure = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
  return {
    hasGetUserMedia,
    hasMediaRecorder,
    hasAudioContext,
    isSecureContext: isSecure,
    canRecord: hasGetUserMedia && (hasMediaRecorder || hasAudioContext),
  };
}

async function requestVoiceCaptureStream(requestUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  try {
    return await requestUserMedia(VOICE_CAPTURE_CONSTRAINTS);
  } catch {
    return await requestUserMedia({ audio: true, video: false });
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function useDesktopVoiceInputController(params: {
  shellClient: DesktopShellClient;
  session: CloudSession | null;
  sessionRef: { current: CloudSession | null };
  handleSignIn: () => Promise<void> | void;
  showAppToastMessage: (message: string) => void;
  normalizedBuilderTier: string;
  activeCommunity: unknown | null;
  canPostMessagesActiveCommunity: boolean;
  setCommandInput: (updater: (prev: string) => string) => void;
  askInputRef: { current: HTMLInputElement | null };
  setCommunityMessageInput: (updater: (prev: string) => string) => void;
  chatInputRef: { current: HTMLTextAreaElement | null };
}) {
  const [activeVoiceSurface, setActiveVoiceSurface] = useState<VoiceSurface | null>(null);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStopCaptureRef = useRef<(() => Promise<Blob>) | null>(null);
  const voiceCaptureCleanupRef = useRef<(() => void) | null>(null);

  function resolveVoiceInputIntent(surface: "workspace" | "community"): {
    mode:
      | "sign_in"
      | "select_community"
      | "join_community"
      | "start_recording"
      | "stop_recording"
      | "transcribing"
      | "busy";
    title: string;
  } {
    if (!params.session) {
      return {
        mode: "sign_in",
        title:
          surface === "community"
            ? "Sign in to use voice input in community chat."
            : "Sign in to use voice input.",
      };
    }
    if (surface === "community") {
      if (!params.activeCommunity) {
        return {
          mode: "select_community",
          title: "Select a community first.",
        };
      }
      if (!params.canPostMessagesActiveCommunity) {
        return {
          mode: "join_community",
          title: "Join this community to use voice input.",
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
      title:
        params.normalizedBuilderTier === "pro"
          ? "Start voice input ($100 plan)."
          : params.normalizedBuilderTier === "builder"
            ? "Start voice input ($20 plan)."
            : "Start voice input.",
    };
  }

  function resolveVoiceUiState(surface: VoiceSurface): VoiceUiState {
    if (activeVoiceSurface !== surface) return "idle";
    return isVoiceTranscribing ? "transcribing" : "recording";
  }

  function releaseVoiceCaptureResources() {
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
  }

  useEffect(() => {
    return () => {
      releaseVoiceCaptureResources();
    };
  }, [params.shellClient]);

  function applyVoiceTranscript(surface: VoiceSurface, transcript: string) {
    if (!transcript) return;
    if (surface === "workspace") {
      params.setCommandInput((prev) => mergeVoiceTranscript(prev, transcript));
      window.setTimeout(() => params.askInputRef.current?.focus(), 0);
      return;
    }
    params.setCommunityMessageInput((prev) => mergeVoiceTranscript(prev, transcript));
    window.setTimeout(() => {
      const input = params.chatInputRef.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      input.focus();
    }, 0);
  }

  async function transcribeVoiceBlob(surface: VoiceSurface, blob: Blob): Promise<string> {
    const session = params.sessionRef.current ?? params.session;
    if (!session) throw new Error("Sign in to use voice input.");
    return await transcribeCloudVoice({
      session,
      audioBase64: await blobToBase64(blob),
      mimeType: blob.type || "audio/webm",
      language: getVoiceLanguageHint(),
      preferPrimary: false,
      surface,
    });
  }

  async function startVoiceCapture(surface: VoiceSurface): Promise<void> {
    let nativeStartError: string | null = null;
    try {
      await params.shellClient.startNativeVoiceCapture();
      voiceCaptureCleanupRef.current = () => {
        void params.shellClient.cancelNativeVoiceCapture().catch(() => undefined);
      };
      voiceStopCaptureRef.current = async () => {
        const nativeResult = await params.shellClient.stopNativeVoiceCapture();
        console.info("[voice] native capture metrics", {
          sample_rate_hz: nativeResult?.sample_rate_hz,
          duration_ms: nativeResult?.duration_ms,
          rms: nativeResult?.rms,
          peak: nativeResult?.peak,
          speech_ratio: nativeResult?.speech_ratio,
          speech_detected: nativeResult?.speech_detected,
        });
        if (!nativeResult?.audio_base64) {
          throw new Error("No audio captured.");
        }
        if (!nativeResult.speech_detected) {
          throw new Error("No speech detected.");
        }
        return base64ToBlob(nativeResult.audio_base64, nativeResult.mime_type || "audio/wav");
      };
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      voiceChunksRef.current = [];
      setActiveVoiceSurface(surface);
      params.showAppToastMessage("Listening... tap mic again to stop.");
      return;
    } catch (nativeError) {
      nativeStartError = nativeError instanceof Error ? nativeError.message : String(nativeError);
      console.warn("[voice] native capture unavailable, falling back to web capture", nativeError);
    }

    const voiceSupport = getVoiceSupportState();
    const requestUserMedia = getVoiceUserMedia();
    if (!voiceSupport.canRecord) {
      if (nativeStartError) {
        params.showAppToastMessage(`Voice input unavailable: ${nativeStartError}`);
        return;
      }
      console.warn("[voice] unsupported desktop runtime", voiceSupport);
      if (!voiceSupport.hasGetUserMedia) {
        params.showAppToastMessage(
          voiceSupport.isSecureContext
            ? "Voice input unavailable: microphone API missing in this desktop runtime."
            : "Voice input unavailable: app is not running in a secure context.",
        );
      } else {
        params.showAppToastMessage("Voice input unavailable: recording APIs are missing in this desktop runtime.");
      }
      return;
    }
    if (!requestUserMedia) {
      if (nativeStartError) {
        params.showAppToastMessage(`Voice input unavailable: ${nativeStartError}`);
        return;
      }
      params.showAppToastMessage("Voice input unavailable: microphone API missing in this desktop runtime.");
      return;
    }

    try {
      const stream = await requestVoiceCaptureStream(requestUserMedia);
      const AudioContextCtor = getVoiceAudioContextConstructor();
      if (typeof MediaRecorder !== "undefined") {
        try {
          const mimeType = selectVoiceCaptureMimeType();
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          voiceChunksRef.current = [];
          recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data && event.data.size > 0) voiceChunksRef.current.push(event.data);
          };
          recorder.onerror = () => {
            releaseVoiceCaptureResources();
            setActiveVoiceSurface(null);
            setIsVoiceTranscribing(false);
            params.showAppToastMessage("Microphone recording failed.");
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
          setActiveVoiceSurface(surface);
          recorder.start(250);
          params.showAppToastMessage("Listening... tap mic again to stop.");
          return;
        } catch (mediaRecorderError) {
          console.warn(
            "[voice] MediaRecorder unavailable in desktop runtime, attempting PCM fallback",
            mediaRecorderError,
          );
          if (!AudioContextCtor) throw new Error("voice_unsupported");
        }
      }
      if (!AudioContextCtor) throw new Error("voice_unsupported");
      let audioContext: AudioContext;
      try {
        audioContext = new AudioContextCtor({ sampleRate: VOICE_CAPTURE_SAMPLE_RATE });
      } catch {
        audioContext = new AudioContextCtor();
      }
      await audioContext.resume().catch(() => undefined);
      if (audioContext.state !== "running") throw new Error("voice_context_unavailable");
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
        return createWavBlobFromInt16Chunks(pcmChunks, audioContext.sampleRate || VOICE_CAPTURE_SAMPLE_RATE);
      };
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = null;
      voiceChunksRef.current = [];
      setActiveVoiceSurface(surface);
      params.showAppToastMessage("Listening... tap mic again to stop.");
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone was found."
            : error instanceof Error && error.message === "voice_unsupported"
              ? "Voice input unavailable: missing desktop audio runtime support."
              : error instanceof Error && error.message === "voice_context_unavailable"
                ? "Voice input unavailable: could not initialize desktop audio context."
                : "Could not start microphone capture.";
      params.showAppToastMessage(message);
      console.warn("[voice] failed to start capture", {
        error,
        support: getVoiceSupportState(),
      });
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
      const audioBlob = await stopCapture();
      releaseVoiceCaptureResources();
      if (audioBlob.size === 0) {
        params.showAppToastMessage("No audio captured.");
        return;
      }
      const transcript = await transcribeVoiceBlob(surface, audioBlob);
      if (!transcript) {
        params.showAppToastMessage("No speech detected.");
        return;
      }
      applyVoiceTranscript(surface, transcript);
      params.showAppToastMessage("Transcript inserted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      params.showAppToastMessage(message || "Voice transcription failed.");
    } finally {
      releaseVoiceCaptureResources();
      setIsVoiceTranscribing(false);
      setActiveVoiceSurface(null);
    }
  }

  async function handleVoiceInputClick(surface: "workspace" | "community") {
    const intent = resolveVoiceInputIntent(surface);
    if (intent.mode === "sign_in") {
      void params.handleSignIn();
      return;
    }
    if (intent.mode === "select_community" || intent.mode === "join_community" || intent.mode === "busy") {
      params.showAppToastMessage(intent.title);
      return;
    }
    if (intent.mode === "transcribing") {
      params.showAppToastMessage(intent.title);
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
  const workspaceVoiceUiState = resolveVoiceUiState("workspace");
  const communityVoiceUiState = resolveVoiceUiState("community");

  return {
    activeVoiceSurface,
    isVoiceTranscribing,
    workspaceVoiceIntent,
    communityVoiceIntent,
    workspaceVoiceUiState,
    communityVoiceUiState,
    handleVoiceInputClick,
  };
}
