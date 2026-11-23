import type { useWebCommunityChatController } from "./useWebCommunityChatController";
import type { useWebCommunityVoiceController } from "./useWebCommunityVoiceController";
import type { BuildWebCommunitySurfaceProjectionParams } from "./buildWebCommunitySurfaceProjection";

type CommunityChatController = ReturnType<typeof useWebCommunityChatController>;
type CommunityVoiceController = ReturnType<typeof useWebCommunityVoiceController>;

export function buildWebCommunityChatProjectionBindings(params: {
  communityChat: CommunityChatController;
  voice: Pick<
    CommunityVoiceController,
    | "mainCommunityVoiceButtonState"
    | "drawerCommunityVoiceButtonState"
    | "activeCommunityVoiceButtonOwner"
    | "communityVoiceButtonTitle"
    | "handleCommunityVoiceInputClick"
  >;
}): Pick<
  BuildWebCommunitySurfaceProjectionParams,
  | "replyingToMessage"
  | "communityAttachments"
  | "communityMessageInput"
  | "communityMessageMentions"
  | "setCommunityMessageMentions"
  | "isSendingCommunityMessage"
  | "communityChatError"
  | "fileInputRef"
  | "chatInputRef"
  | "onSetReplyingToMessage"
  | "onRemoveCommunityAttachment"
  | "onCommunityAttachmentError"
  | "onIngestCommunityAttachmentsFromFileList"
  | "onCommunityFileInputChange"
  | "onCommunityAttachmentDrop"
  | "onCommunityAttachmentDragEnter"
  | "onCommunityAttachmentDragOver"
  | "onCommunityAttachmentDragLeave"
  | "onCommunityAttachmentPaste"
  | "isCommunityAttachmentDragOver"
  | "onCommunityMessageInputChange"
  | "onSendCommunityMessage"
  | "onOpenCommunityChatLightbox"
  | "voiceButtonProps"
  | "drawerVoiceButtonProps"
  | "onCommunityVoiceInputClick"
  | "lightboxModalProps"
> {
  const { communityChat, voice } = params;
  return {
    replyingToMessage: communityChat.replyingToMessage,
    communityAttachments: communityChat.attachments,
    communityMessageInput: communityChat.messageInput,
    communityMessageMentions: communityChat.messageMentions,
    setCommunityMessageMentions: communityChat.setMessageMentions,
    isSendingCommunityMessage: communityChat.isSendingMessage,
    communityChatError: communityChat.error,
    fileInputRef: communityChat.fileInputRef,
    chatInputRef: communityChat.inputRef,
    onSetReplyingToMessage: communityChat.setReplyingToMessage,
    onRemoveCommunityAttachment: communityChat.removeAttachment,
    onCommunityAttachmentError: communityChat.setError,
    onIngestCommunityAttachmentsFromFileList: communityChat.ingestAttachmentsFromFileList,
    onCommunityFileInputChange: communityChat.handleAttachmentFileInputChange,
    onCommunityAttachmentDrop: communityChat.handleAttachmentDrop,
    onCommunityAttachmentDragEnter: communityChat.handleAttachmentDragEnter,
    onCommunityAttachmentDragOver: communityChat.handleAttachmentDragOver,
    onCommunityAttachmentDragLeave: communityChat.handleAttachmentDragLeave,
    onCommunityAttachmentPaste: communityChat.handleAttachmentPaste,
    isCommunityAttachmentDragOver: communityChat.isAttachmentDragOver,
    onCommunityMessageInputChange: communityChat.setMessageInputFromTextarea,
    onSendCommunityMessage: communityChat.handleSendCommunityMessage,
    onOpenCommunityChatLightbox: communityChat.openCommunityChatLightbox,
    voiceButtonProps: {
      state: voice.mainCommunityVoiceButtonState,
      title:
        voice.activeCommunityVoiceButtonOwner === "drawer"
          ? "Finish the current voice capture in the thread first."
          : voice.communityVoiceButtonTitle,
      onClick: () => voice.handleCommunityVoiceInputClick(null, "main"),
      disabled: voice.activeCommunityVoiceButtonOwner === "drawer",
    },
    drawerVoiceButtonProps: {
      state: voice.drawerCommunityVoiceButtonState,
      title:
        voice.activeCommunityVoiceButtonOwner === "main"
          ? "Finish the current voice capture in the main chat first."
          : voice.communityVoiceButtonTitle,
      disabled: voice.activeCommunityVoiceButtonOwner === "main",
    },
    onCommunityVoiceInputClick: voice.handleCommunityVoiceInputClick,
    lightboxModalProps: {
      isOpen: communityChat.lightbox.isOpen,
      images: communityChat.lightbox.images,
      index: communityChat.lightbox.index,
      setIndex: communityChat.lightbox.setIndex,
      onClose: communityChat.lightbox.onClose,
    },
  };
}
