export const VOICE_TRANSCRIPTION_UPLOAD_TIMEOUT_MS = 45_000;

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
