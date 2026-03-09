import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { blobToBase64 } from "./imageTransforms";
import { transcribeVoice as transcribeCloudVoice } from "./authSessionCore";
import {
  createWavBlobFromInt16Chunks,
  floatToInt16Pcm,
  getVoiceAudioContextConstructor,
  getVoiceLanguageHint,
  getVoiceUserMedia,
  mergeVoiceTranscript,
  selectVoiceCaptureMimeType,
} from "./voiceCapture";

export type VoiceSurface = "workspace" | "community";
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

type UseWebVoiceInputControllerArgs<CloudSessionT> = {
  session: CloudSessionT | null;
  sessionRef: MutableRefObject<CloudSessionT | null>;
  activeCommunity: unknown | null;
  activeCommunityJoinMode: "checkout" | "request_access" | "join_free" | null;
  canPostMessagesActiveCommunity: boolean;
  normalizedBuilderTier: "free" | "builder" | "architect";
  openAuthGate: () => void;
  showAppToastMessage: (message: string) => void;
  setWorkspaceInput: Dispatch<SetStateAction<string>>;
  workspaceInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  setCommunityMessageInput: Dispatch<SetStateAction<string>>;
  chatInputRef: MutableRefObject<HTMLTextAreaElement | null>;
};

export function useWebVoiceInputController<CloudSessionT>(args: UseWebVoiceInputControllerArgs<CloudSessionT>) {
  const [activeVoiceSurface, setActiveVoiceSurface] = useState<VoiceSurface | null>(null);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStopCaptureRef = useRef<(() => Promise<Blob>) | null>(null);
  const voiceCaptureCleanupRef = useRef<(() => void) | null>(null);

  function resolveVoiceInputIntent(surface: VoiceSurface): VoiceInputIntent {
    if (!args.session) {
      return {
        mode: "sign_in",
        title:
          surface === "community"
            ? "Sign in to use voice input in community chat."
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
          args.activeCommunityJoinMode === "checkout"
            ? "Pick a plan to use voice input in this community."
            : args.activeCommunityJoinMode === "request_access"
              ? "Request access to use voice input in this community."
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
      title:
        args.normalizedBuilderTier === "builder" || args.normalizedBuilderTier === "architect"
          ? "Start voice input (paid plan)."
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
  }, []);

  function applyVoiceTranscript(surface: VoiceSurface, transcript: string) {
    if (!transcript) return;
    if (surface === "workspace") {
      args.setWorkspaceInput((prev) => mergeVoiceTranscript(prev, transcript));
      window.setTimeout(() => {
        args.workspaceInputRef.current?.focus();
      }, 0);
      return;
    }
    args.setCommunityMessageInput((prev) => mergeVoiceTranscript(prev, transcript));
    window.setTimeout(() => {
      const input = args.chatInputRef.current;
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      input.focus();
    }, 0);
  }

  async function transcribeVoiceBlob(surface: VoiceSurface, blob: Blob): Promise<string> {
    const session = args.sessionRef.current ?? args.session;
    if (!session) throw new Error("Sign in to use voice input.");
    return await transcribeCloudVoice({
      session: session as unknown as { access_token: string },
      audioBase64: await blobToBase64(blob),
      mimeType: blob.type || "audio/webm",
      language: getVoiceLanguageHint(),
      surface,
      preferPrimary: false,
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
      const audioBlob = await stopCapture();
      releaseVoiceCaptureResources();
      if (audioBlob.size === 0) {
        args.showAppToastMessage("No audio captured.");
        return;
      }
      const transcript = await transcribeVoiceBlob(surface, audioBlob);
      if (!transcript) {
        args.showAppToastMessage("No speech detected.");
        return;
      }
      applyVoiceTranscript(surface, transcript);
      args.showAppToastMessage("Transcript inserted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
      args.openAuthGate();
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
  const workspaceVoiceUiState = resolveVoiceUiState("workspace");
  const communityVoiceUiState = resolveVoiceUiState("community");

  return {
    workspaceVoiceIntent,
    communityVoiceIntent,
    workspaceVoiceUiState,
    communityVoiceUiState,
    handleVoiceInputClick,
  };
}
