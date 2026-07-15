export const MEMBER_AGENT_MAX_IMAGE_ATTACHMENTS = 4;
export const MEMBER_AGENT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MEMBER_AGENT_MAX_IMAGE_TOTAL_BYTES = 25 * 1024 * 1024;
export const MEMBER_AGENT_MAX_IMAGE_NAME_CHARS = 256;
export const MEMBER_AGENT_ATTACHMENT_UPLOAD_PATH = "/runtime/member_agent_attachment_upload";

export const MEMBER_AGENT_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif";

export const MEMBER_AGENT_ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type MemberAgentImageAttachment = {
  id: string;
  name: string;
  type: "image";
  mime: string;
  size: number;
  storage_id: string;
  url?: string | null;
};

export function normalizeMemberAgentImageMime(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function normalizeMemberAgentImageName(raw: unknown): string {
  const normalized = String(raw ?? "").trim();
  return (normalized || "image").slice(0, MEMBER_AGENT_MAX_IMAGE_NAME_CHARS);
}

export function isAllowedMemberAgentImageMime(raw: unknown): boolean {
  return MEMBER_AGENT_ALLOWED_IMAGE_MIME_TYPES.has(
    normalizeMemberAgentImageMime(raw),
  );
}

export function validateMemberAgentImageDrafts(
  files: readonly { name?: string; type?: string; size?: number }[],
  existing: readonly { size?: number }[] = [],
): string | null {
  if (existing.length + files.length > MEMBER_AGENT_MAX_IMAGE_ATTACHMENTS) {
    return `You can attach up to ${MEMBER_AGENT_MAX_IMAGE_ATTACHMENTS} images.`;
  }
  let totalBytes = existing.reduce((sum, file) => {
    const size = Number(file.size);
    return sum + (Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0);
  }, 0);
  for (const file of files) {
    const name = normalizeMemberAgentImageName(file.name);
    const mime = normalizeMemberAgentImageMime(file.type);
    const size = Number(file.size);
    if (!isAllowedMemberAgentImageMime(mime)) {
      return `${name} is not a supported image. Use JPEG, PNG, WebP, or GIF.`;
    }
    if (!Number.isFinite(size) || size <= 0) {
      return `${name} is empty or unreadable.`;
    }
    if (size > MEMBER_AGENT_MAX_IMAGE_BYTES) {
      return `${name} is too large (max 10MB).`;
    }
    totalBytes += Math.floor(size);
    if (totalBytes > MEMBER_AGENT_MAX_IMAGE_TOTAL_BYTES) {
      return "Images can be up to 25MB total per message.";
    }
  }
  return null;
}
