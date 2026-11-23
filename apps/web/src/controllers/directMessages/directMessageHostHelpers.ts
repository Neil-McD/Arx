import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversation,
  DirectMessageNetworkPerson,
} from "../../../../../shared/communityTypes";
import type { IncomingDirectMessageEvent } from "../../components/WebDirectMessagesHost";

export type DirectMessageAttachmentDraft = DirectMessageAttachment & {
  data_url?: string | null;
  file?: File | null;
  uploadStatus?: "queued" | "uploading" | "ready" | "failed";
  uploadError?: string | null;
};

export type DirectMessageLocalEcho = DirectMessage & {
  local_id: string;
  local_status: "sending" | "sent" | "failed";
  local_error?: string | null;
  local_payload: {
    text: string;
    attachments: DirectMessageAttachmentDraft[];
  };
};

export type DirectMessageDraft = {
  input: string;
  attachments: DirectMessageAttachmentDraft[];
};

export type DirectMessagePanelState = {
  conversation: DirectMessageConversation;
  messages: DirectMessage[];
  localEchoes: DirectMessageLocalEcho[];
  input: string;
  attachments: DirectMessageAttachmentDraft[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  // Opened for you when Inbox opened (design v1): it stays unread until you
  // touch it, so it doesn't drop out of "Needs a reply" unseen.
  deferRead?: boolean;
};

export type EnsureDirectMessageSession<SessionT> = (
  session?: SessionT | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<SessionT | null>;

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function friendlyDirectMessageSendError(error: unknown, fallback: string): string {
  const raw = toErrorMessage(error, fallback);
  const normalized = raw.toLowerCase();
  if (normalized.includes("dm_rate_limited")) {
    return "You're sending messages too quickly. Give it a minute and try again.";
  }
  if (normalized.includes("dm_conversation_access_required")) {
    return "You can't message this person right now.";
  }
  if (normalized.includes("dm_target_not_found")) {
    return "That person is no longer available.";
  }
  if (normalized.includes("dm_message_payload_required")) {
    return "Write a message first.";
  }
  const looksLikeRawServerError =
    normalized.includes("server error") ||
    normalized.includes("uncaught error") ||
    normalized.startsWith("dm_") ||
    normalized.startsWith("convex_");
  return looksLikeRawServerError ? fallback : raw;
}

export function friendlyDirectMessageReadError(error: unknown, fallback: string): string {
  const raw = toErrorMessage(error, fallback);
  const normalized = raw.toLowerCase();
  const isRecoverableConnectionError =
    normalized.includes("verified_identity_required") ||
    normalized.includes("server error") ||
    normalized.includes("uncaught error") ||
    normalized.includes("[convex") ||
    normalized.startsWith("convex_");
  return isRecoverableConnectionError
    ? "Messages temporarily disconnected. Reconnecting…"
    : raw;
}

export async function resolveDirectMessageSession<SessionT>(
  session: SessionT | null,
  ensureSession: EnsureDirectMessageSession<SessionT> | undefined,
  source: string,
): Promise<SessionT | null> {
  if (!session) return null;
  if (!ensureSession) return session;
  return ensureSession(session, source);
}

export function createLocalDirectMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `local-${globalThis.crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const VIRTUAL_DM_CONVERSATION_ID_PREFIX = "virtual:";

export function isVirtualDirectConversationId(conversationId: string | null | undefined): boolean {
  return String(conversationId ?? "").startsWith(VIRTUAL_DM_CONVERSATION_ID_PREFIX);
}

export function virtualPeerUserIdFromConversationId(conversationId: string): string {
  return conversationId.slice(VIRTUAL_DM_CONVERSATION_ID_PREFIX.length);
}

// A local-only stand-in conversation for first contact with a person; the real
// conversation row is created server-side on first send, never on open.
export function buildVirtualConversationForPerson(
  person: DirectMessageNetworkPerson,
  sessionUserId: string | null,
): DirectMessageConversation {
  const nowIso = new Date().toISOString();
  return {
    id: `${VIRTUAL_DM_CONVERSATION_ID_PREFIX}${person.user_id}`,
    kind: "direct",
    created_from_community: {
      id: person.community_id,
      slug: "",
      name: person.community_name,
    },
    last_seq: 0,
    viewer_last_read_seq: 0,
    unread_count: 0,
    has_unread: false,
    last_message_preview: null,
    last_message_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    participants: [
      {
        id: "virtual-self",
        participant_type: "user",
        user_id: sessionUserId,
        display_name: null,
        avatar_url: null,
        status: "active",
        last_read_seq: 0,
      },
      {
        id: "virtual-peer",
        participant_type: "user",
        user_id: person.user_id,
        display_name: person.display_name,
        avatar_url: person.avatar_url,
        avatar_focus_x: person.avatar_focus_x ?? 0.5,
        avatar_focus_y: person.avatar_focus_y ?? 0.5,
        avatar_zoom: person.avatar_zoom ?? 1,
        status: "active",
        last_read_seq: 0,
      },
    ],
  };
}

export function findConversationPeerUserId(
  conversation: DirectMessageConversation,
  sessionUserId: string | null,
): string {
  const peer = conversation.participants.find(
    (participant) =>
      participant.status === "active" &&
      participant.participant_type === "user" &&
      participant.user_id &&
      participant.user_id !== sessionUserId,
  );
  return String(peer?.user_id ?? "").trim();
}

export function buildLocalEchoContentJson(
  text: string,
  attachments: DirectMessageAttachmentDraft[],
): unknown {
  if (attachments.length === 0) return { text };
  return {
    text,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime ?? null,
      size: attachment.size,
      // The picture the sender picked, shown until the sent message replaces this one.
      url: attachment.data_url ?? null,
    })),
  };
}

export function getDirectAttachmentUploadStatus(
  attachment: DirectMessageAttachmentDraft,
): "queued" | "uploading" | "ready" | "failed" {
  if (String(attachment.attachment_id ?? "").trim()) return "ready";
  if (attachment.uploadStatus) return attachment.uploadStatus;
  if (attachment.file instanceof File) return "queued";
  return "failed";
}

export function hasUnreadyDirectAttachments(attachments: DirectMessageAttachmentDraft[]): boolean {
  return attachments.some((attachment) => getDirectAttachmentUploadStatus(attachment) !== "ready");
}

export function countDirectInboxUnread(
  conversations: readonly DirectMessageConversation[],
  countConversations: boolean,
): number {
  return conversations.reduce((total, conversation) => {
    if (conversation.viewer_muted) return total;
    const count = Number(conversation.unread_count ?? 0);
    if (!Number.isFinite(count)) return total;
    if (countConversations) return total + (conversation.has_unread || count > 0 ? 1 : 0);
    return total + Math.max(0, Math.floor(count));
  }, 0);
}

export function mergeDirectPanelMessages(
  messages: readonly DirectMessage[],
  localEchoes: readonly DirectMessageLocalEcho[],
): DirectMessage[] {
  if (localEchoes.length === 0) return [...messages];
  const messageIds = new Set(messages.map((message) => message.id));
  const clientMessageIds = new Set(
    messages.map((message) => String(message.client_message_id ?? "").trim()).filter(Boolean),
  );
  return [
    ...messages,
    ...localEchoes.filter(
      (echo) => !messageIds.has(echo.id) && !clientMessageIds.has(echo.local_id),
    ),
  ];
}

export function collectIncomingDirectMessageEvents(params: {
  rows: readonly DirectMessageConversation[];
  previousSeqByConversation: Readonly<Record<string, number>>;
  sessionUserId: string | null;
  isReadingConversation: (conversationId: string) => boolean;
}): {
  nextSeqByConversation: Record<string, number>;
  events: IncomingDirectMessageEvent[];
} {
  const nextSeqByConversation: Record<string, number> = {};
  const events: IncomingDirectMessageEvent[] = [];
  for (const row of params.rows) {
    const seq = Math.max(0, Math.floor(Number(row.last_seq ?? 0)));
    nextSeqByConversation[row.id] = seq;
    const previousSeq = params.previousSeqByConversation[row.id] ?? 0;
    if (seq <= previousSeq) continue;
    if (row.last_message_from_viewer) continue;
    if (row.viewer_muted) continue;
    if (params.isReadingConversation(row.id)) continue;
    const peer =
      row.participants.find(
        (participant) =>
          participant.status === "active" &&
          participant.participant_type === "user" &&
          participant.user_id &&
          participant.user_id !== params.sessionUserId,
      ) ?? null;
    events.push({
      conversationId: row.id,
      peerDisplayName: String(peer?.display_name ?? "").trim() || "New message",
      peerAvatarUrl: peer?.avatar_url ?? null,
      previewText: String(row.last_message_preview ?? "").trim() || "New message",
      lastSeq: seq,
    });
  }
  return { nextSeqByConversation, events };
}
