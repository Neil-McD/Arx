export type AttachmentWithOptionalImageData = {
  type: string;
  name: string;
  data_url?: string | null;
};

export type CommunityImageAttachment<T extends AttachmentWithOptionalImageData> = {
  attachment: T;
  url: string;
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
    if (
      attachment.type === "image" &&
      typeof attachment.data_url === "string" &&
      attachment.data_url.startsWith("data:image/")
    ) {
      imageAttachments.push({
        attachment,
        url: attachment.data_url,
        name: attachment.name,
      });
      continue;
    }
    fileAttachments.push(attachment);
  }

  return { imageAttachments, fileAttachments };
}
