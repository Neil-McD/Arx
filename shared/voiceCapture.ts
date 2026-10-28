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
