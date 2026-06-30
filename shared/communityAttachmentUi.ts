import { classifyMediaKind } from "./attachmentHelpers";

export type AttachmentWithOptionalImageData = {
  type: string;
  name: string;
  mime?: string | null;
  url?: string | null;
  data_url?: string | null;
};

export type CommunityImageAttachment<T extends AttachmentWithOptionalImageData> = {
  attachment: T;
  url: string;
  previewUrl: string;
  fullUrl: string;
  name: string;
};

export type CommunityMediaAttachment<T extends AttachmentWithOptionalImageData> = {
  attachment: T;
  url: string;
  name: string;
};

export function partitionCommunityAttachments<T extends AttachmentWithOptionalImageData>(
  attachments: readonly T[] | null | undefined,
): {
  imageAttachments: CommunityImageAttachment<T>[];
  videoAttachments: CommunityMediaAttachment<T>[];
  audioAttachments: CommunityMediaAttachment<T>[];
  fileAttachments: T[];
} {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { imageAttachments: [], videoAttachments: [], audioAttachments: [], fileAttachments: [] };
  }

  const imageAttachments: CommunityImageAttachment<T>[] = [];
  const videoAttachments: CommunityMediaAttachment<T>[] = [];
  const audioAttachments: CommunityMediaAttachment<T>[] = [];
  const fileAttachments: T[] = [];

  for (const attachment of attachments) {
    const storageUrl = typeof attachment.url === "string" && attachment.url.trim()
      ? attachment.url.trim()
      : null;
    const dataUrl = typeof attachment.data_url === "string" && attachment.data_url.trim()
      ? attachment.data_url.trim()
      : null;
    if (attachment.type === "image" && (storageUrl || dataUrl)) {
      const previewUrl = dataUrl || storageUrl || "";
      const fullUrl = storageUrl || dataUrl || "";
      imageAttachments.push({
        attachment,
        url: previewUrl,
        previewUrl,
        fullUrl,
        name: attachment.name,
      });
      continue;
    }
    // Video/audio play inline when they have a streamable source. Classify by mime/name so
    // files stored as the generic "file" type (including ones sent before this shipped) still play.
    const mediaUrl = storageUrl || dataUrl;
    if (mediaUrl) {
      const mediaKind = classifyMediaKind(attachment.mime, attachment.name);
      if (mediaKind === "video") {
        videoAttachments.push({ attachment, url: mediaUrl, name: attachment.name });
        continue;
      }
      if (mediaKind === "audio") {
        audioAttachments.push({ attachment, url: mediaUrl, name: attachment.name });
        continue;
      }
    }
    fileAttachments.push(attachment);
  }

  return { imageAttachments, videoAttachments, audioAttachments, fileAttachments };
}
