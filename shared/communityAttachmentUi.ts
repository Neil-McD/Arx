export type AttachmentWithOptionalImageData = {
  type: string;
  name: string;
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

export function partitionCommunityAttachments<T extends AttachmentWithOptionalImageData>(
  attachments: readonly T[] | null | undefined,
): {
  imageAttachments: CommunityImageAttachment<T>[];
  fileAttachments: T[];
} {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { imageAttachments: [], fileAttachments: [] };
  }

  const imageAttachments: CommunityImageAttachment<T>[] = [];
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
    fileAttachments.push(attachment);
  }

  return { imageAttachments, fileAttachments };
}
