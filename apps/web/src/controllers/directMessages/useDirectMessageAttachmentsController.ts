import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { DirectMessageConversation } from "../../../../../shared/communityTypes";
import {
  discardCloudDirectMessageAttachment,
  downloadCloudDirectMessageAttachment,
  uploadCloudDirectMessageAttachmentFile,
} from "../../../../../shared/cloudDirectMessagesGateway";
import { COMMUNITY_ATTACHMENT_MAX_COUNT, communityAttachmentByteLimit } from "../../../../../shared/communityAttachmentPolicy";
import {
  createLocalDirectMessageId,
  getDirectAttachmentUploadStatus,
  isVirtualDirectConversationId,
  resolveDirectMessageSession,
  virtualPeerUserIdFromConversationId,
  type DirectMessageAttachmentDraft,
  type DirectMessageDraft,
  type DirectMessagePanelState,
  type EnsureDirectMessageSession,
} from "./directMessageHostHelpers";

export function useDirectMessageAttachmentsController<SessionT>(params: {
  session: SessionT | null;
  ensureSession?: EnsureDirectMessageSession<SessionT>;
  directMessagePanel: DirectMessagePanelState | null;
  setDirectMessagePanel: Dispatch<SetStateAction<DirectMessagePanelState | null>>;
  draftsByConversationRef: MutableRefObject<Record<string, DirectMessageDraft>>;
}) {
  const {
    session,
    ensureSession,
    directMessagePanel,
    setDirectMessagePanel,
    draftsByConversationRef,
  } = params;

  const patchConversationAttachments = useCallback(
    (
      conversationId: string,
      change: (list: DirectMessageAttachmentDraft[]) => DirectMessageAttachmentDraft[],
      error?: string | null,
    ) => {
      setDirectMessagePanel((previous) =>
        previous?.conversation.id === conversationId
          ? {
              ...previous,
              attachments: change(previous.attachments),
              ...(error !== undefined ? { error } : null),
            }
          : previous,
      );
      // Uploads finish after you move to another conversation too.
      const draft = draftsByConversationRef.current[conversationId];
      if (draft) {
        draftsByConversationRef.current[conversationId] = {
          ...draft,
          attachments: change(draft.attachments),
        };
      }
    },
    [draftsByConversationRef, setDirectMessagePanel],
  );

  // Drafts taken out while still uploading: their reservation is freed when the upload lands.
  const removedAttachmentDraftsRef = useRef<Set<string>>(new Set());

  const discardDirectAttachmentReservation = useCallback(
    async (attachmentId: string) => {
      try {
        const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_send");
        if (usableSession) {
          await discardCloudDirectMessageAttachment({ session: usableSession, attachmentId });
        }
      } catch {
        // The server clears an unsent upload after 30 minutes anyway.
      }
    },
    [ensureSession, session],
  );

  const uploadDirectAttachmentDraft = useCallback(
    async (conversation: DirectMessageConversation, draft: DirectMessageAttachmentDraft) => {
      const conversationId = conversation.id;
      const file = draft.file;
      if (!(file instanceof File)) return;
      patchConversationAttachments(conversationId, (list) =>
        list.map((item) =>
          item.id === draft.id ? { ...item, uploadStatus: "uploading" as const, uploadError: null } : item,
        ),
      );
      try {
        const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_send");
        if (!usableSession) throw new Error("Sign in to attach files.");
        // A first message has no conversation yet: the file is reserved for the person.
        const virtual = isVirtualDirectConversationId(conversationId);
        const uploaded = await uploadCloudDirectMessageAttachmentFile({
          session: usableSession,
          conversationId: virtual ? null : conversationId,
          targetUserId: virtual ? virtualPeerUserIdFromConversationId(conversationId) : null,
          communityId: virtual ? conversation.created_from_community?.id ?? null : null,
          messageKey: `dm:${conversationId}`.slice(0, 150),
          file,
        });
        if (removedAttachmentDraftsRef.current.delete(draft.id)) {
          void discardDirectAttachmentReservation(uploaded.attachmentId);
          return;
        }
        patchConversationAttachments(conversationId, (list) =>
          list.map((item) =>
            item.id === draft.id
              ? {
                  ...item,
                  attachment_id: uploaded.attachmentId,
                  mime: uploaded.mime,
                  size: uploaded.size,
                  type: uploaded.type === "image" ? ("image" as const) : ("file" as const),
                  uploadStatus: "ready" as const,
                  uploadError: null,
                }
              : item,
          ),
        );
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "That file couldn't be attached.";
        patchConversationAttachments(
          conversationId,
          (list) =>
            list.map((item) =>
              item.id === draft.id ? { ...item, uploadStatus: "failed" as const, uploadError: message } : item,
            ),
          message,
        );
      }
    },
    [discardDirectAttachmentReservation, ensureSession, patchConversationAttachments, session],
  );

  const addDirectAttachmentFiles = useCallback(
    (files: FileList | readonly File[]) => {
      const current = directMessagePanel;
      if (!current) return;
      // Read the list now: a drop's or a paste's files are gone once its event ends.
      const picked = Array.from(files).filter((file): file is File => file instanceof File);
      const room = Math.max(0, COMMUNITY_ATTACHMENT_MAX_COUNT - current.attachments.length);
      let error: string | null =
        picked.length > room ? `You can attach up to ${COMMUNITY_ATTACHMENT_MAX_COUNT} files to a message.` : null;
      const drafts: DirectMessageAttachmentDraft[] = [];
      for (const file of picked.slice(0, room)) {
        const isImage = /^image\/(png|jpeg|gif|webp)$/.test(file.type);
        const name = file.name || (isImage ? "Pasted image" : "Attachment");
        if (file.size > communityAttachmentByteLimit(file.type || "")) {
          error = `${name} is too large.`;
          continue;
        }
        drafts.push({
          id: createLocalDirectMessageId(),
          name,
          type: isImage ? "image" : "file",
          mime: file.type || null,
          size: file.size,
          file,
          data_url: isImage ? URL.createObjectURL(file) : null,
          uploadStatus: "queued",
          uploadError: null,
        });
      }
      if (drafts.length === 0 && !error) return;
      patchConversationAttachments(current.conversation.id, (list) => [...list, ...drafts], error);
      for (const draft of drafts) void uploadDirectAttachmentDraft(current.conversation, draft);
    },
    [directMessagePanel, patchConversationAttachments, uploadDirectAttachmentDraft],
  );

  const retryDirectAttachment = useCallback(
    (attachmentId: string) => {
      const current = directMessagePanel;
      const draft = current?.attachments.find((item) => item.id === attachmentId);
      if (current && draft) void uploadDirectAttachmentDraft(current.conversation, draft);
    },
    [directMessagePanel, uploadDirectAttachmentDraft],
  );

  const removeDirectAttachment = useCallback(
    (attachmentId: string) => {
      const current = directMessagePanel;
      if (!current) return;
      const draft = current.attachments.find((item) => item.id === attachmentId);
      if (draft?.data_url?.startsWith("blob:")) URL.revokeObjectURL(draft.data_url);
      // Free the server's reservation, so a replacement can be attached.
      const reservationId = String(draft?.attachment_id ?? "").trim();
      if (reservationId) void discardDirectAttachmentReservation(reservationId);
      else if (draft && getDirectAttachmentUploadStatus(draft) === "uploading") {
        removedAttachmentDraftsRef.current.add(draft.id);
      }
      patchConversationAttachments(
        current.conversation.id,
        (list) => list.filter((item) => item.id !== attachmentId),
        null,
      );
    },
    [directMessagePanel, discardDirectAttachmentReservation, patchConversationAttachments],
  );

  const loadDirectAttachment = useCallback(
    async (attachmentId: string) => {
      const usableSession = await resolveDirectMessageSession(session, ensureSession, "direct_messages_read");
      if (!usableSession) throw new Error("Sign in to open this file.");
      return downloadCloudDirectMessageAttachment({ session: usableSession, attachmentId });
    },
    [ensureSession, session],
  );

  return {
    addDirectAttachmentFiles,
    retryDirectAttachment,
    removeDirectAttachment,
    loadDirectAttachment,
  };
}
