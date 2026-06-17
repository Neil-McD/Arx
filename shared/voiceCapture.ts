export type VoiceAudioContextCtor = new (contextOptions?: AudioContextOptions) => AudioContext;
export type VoiceUserMediaFn = (constraints: MediaStreamConstraints) => Promise<MediaStream>;
export type VoiceLegacyGetUserMediaFn = (
  constraints: MediaStreamConstraints,
  onSuccess: (stream: MediaStream) => void,
  onError: (error: unknown) => void,
) => void;

export const VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES = 6_000_000;
export const VOICE_TRANSCRIPTION_MAX_DURATION_MS = 120_000;
export const VOICE_TRANSCRIPTION_UPLOAD_TIMEOUT_MS = 45_000;

const VOICE_CAPTURE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
];

export function normalizeVoiceTranscriptionMimeType(input: string | null | undefined): string | null {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!value) return "audio/webm";
  if (value.startsWith("audio/webm")) return "audio/webm";
  if (value.startsWith("audio/mp4") || value.startsWith("audio/m4a")) return "audio/mp4";
  if (value.startsWith("audio/mpeg") || value.startsWith("audio/mp3") || value.startsWith("audio/mpga")) {
    return "audio/mpeg";
  }
  if (value.startsWith("audio/wav") || value.startsWith("audio/x-wav")) return "audio/wav";
  return null;
}

export function selectVoiceCaptureMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  for (const candidate of VOICE_CAPTURE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function getVoiceAudioContextConstructor(): VoiceAudioContextCtor | null {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: VoiceAudioContextCtor };
  const ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return typeof ctor === "function" ? ctor : null;
}

export function getVoiceUserMedia(): VoiceUserMediaFn | null {
  const modern = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (modern) return modern;
  const legacyNavigator = navigator as Navigator & {
    getUserMedia?: VoiceLegacyGetUserMediaFn;
    webkitGetUserMedia?: VoiceLegacyGetUserMediaFn;
    mozGetUserMedia?: VoiceLegacyGetUserMediaFn;
    msGetUserMedia?: VoiceLegacyGetUserMediaFn;
  };
  const legacy =
    legacyNavigator.getUserMedia ??
    legacyNavigator.webkitGetUserMedia ??
    legacyNavigator.mozGetUserMedia ??
    legacyNavigator.msGetUserMedia;
  if (!legacy) return null;
  return (constraints) =>
    new Promise<MediaStream>((resolve, reject) => {
      try {
        legacy.call(legacyNavigator, constraints, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
}

export function floatToInt16Pcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

export function createWavBlobFromInt16Chunks(chunks: Int16Array[], sampleRate: number): Blob {
  let totalSamples = 0;
  for (const chunk of chunks) totalSamples += chunk.length;
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.max(8000, Math.floor(sampleRate || 16000)), true);
  view.setUint32(28, Math.max(8000, Math.floor(sampleRate || 16000)) * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      view.setInt16(offset, chunk[i], true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function mergeVoiceTranscript(existing: string, transcript: string): string {
  const next = transcript.trim();
  if (!next) return existing;
  if (!existing.trim()) return next;
  return /\s$/.test(existing) ? `${existing}${next}` : `${existing} ${next}`;
}

export function getVoiceLanguageHint(): string {
  const locale = typeof navigator !== "undefined" ? (navigator.language || "").trim().toLowerCase() : "";
  const twoLetter = locale.slice(0, 2);
  return /^[a-z]{2}$/.test(twoLetter) ? twoLetter : "";
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
