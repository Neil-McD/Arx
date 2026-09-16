export const COMMUNITY_ATTACHMENT_UPLOAD_PATH = "/runtime/community_attachment_upload";
export const COMMUNITY_ATTACHMENT_DOWNLOAD_PATH = "/runtime/community_attachment_download";
export const COMMUNITY_ATTACHMENT_MAX_COUNT = 8;
export const COMMUNITY_ATTACHMENT_IMAGE_BYTES = 25 * 1024 * 1024;
export const COMMUNITY_ATTACHMENT_MEDIA_BYTES = 50 * 1024 * 1024;
export const COMMUNITY_ATTACHMENT_FILE_BYTES = 5 * 1024 * 1024;

export function communityAttachmentByteLimit(mime: string): number {
  return mime.startsWith("image/") ? COMMUNITY_ATTACHMENT_IMAGE_BYTES
    : /^(audio|video)\//.test(mime) ? COMMUNITY_ATTACHMENT_MEDIA_BYTES
    : COMMUNITY_ATTACHMENT_FILE_BYTES;
}

// Classify bytes, not the filename or the browser's claimed Content-Type.
// Unknown files remain downloadable opaque files, never executable inline media.
export function detectCommunityAttachmentMime(bytes: Uint8Array, declared: string): string {
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brands = ascii(8, 64);
    if (/avif|avis/.test(brands)) return "image/avif";
    return declared.startsWith("audio/") ? "audio/mp4" : "video/mp4";
  }
  if (matches([0x1a, 0x45, 0xdf, 0xa3])) {
    return declared.startsWith("audio/") ? "audio/webm" : "video/webm";
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return declared.startsWith("video/") ? "video/ogg" : "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "audio/aac";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (declared.startsWith("image/")) throw new Error("community_attachment_content_invalid");
  return "application/octet-stream";
}
