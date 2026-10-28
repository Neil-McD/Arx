// What a community site's private twin shows of a member's direct messages:
// Studio's own conversation and message reads, reduced to what the twin's
// Messages page draws. People are named by display name, handle and avatar,
// never by Polynet's internal or public user ids; files by their read URL,
// never their storage id. Pure, so the backend and its tests share it.

export const SITE_DM_TEXT_MAX_CHARS = 4000;
export const SITE_DM_PAGE_SIZE = 50;

export type SiteDirectPerson = { name: string | null; handle: string | null; avatar_url: string | null };

export type SiteDirectConversation = {
  id: string;
  peer: SiteDirectPerson | null;
  community_name: string | null;
  unread_count: number;
  muted: boolean;
  blocked: boolean;
  last_seq: number;
  read_seq: number;
  peer_read_seq: number;
  last_message: { preview: string; from_me: boolean; at: string | null } | null;
};

export type SiteDirectAttachment = { id: string; name: string; kind: "image" | "file"; mime: string | null; size: number; url: string };

export type SiteDirectMessage = {
  id: string;
  seq: number;
  from_me: boolean;
  text: string;
  attachments: SiteDirectAttachment[];
  created_at: string;
  client_message_id: string | null;
};

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

// Studio's conversation (mapDirectConversation) for the viewer whose public id this is.
export function siteDirectConversation(row: any, viewerPublicId: string | null): SiteDirectConversation {
  const participants: any[] = Array.isArray(row?.participants) ? row.participants : [];
  const peer = participants.find((participant) =>
    participant?.status === "active" && participant?.participant_type === "user" && participant?.user_id && participant.user_id !== viewerPublicId) ?? null;
  const preview = textOrNull(row?.last_message_preview);
  return {
    id: String(row?.id ?? ""),
    peer: peer ? { name: textOrNull(peer.display_name), handle: textOrNull(peer.handle), avatar_url: textOrNull(peer.avatar_url) } : null,
    community_name: textOrNull(row?.created_from_community?.name),
    unread_count: count(row?.unread_count),
    muted: row?.viewer_muted === true,
    blocked: row?.viewer_has_blocked_peer === true,
    last_seq: count(row?.last_seq),
    read_seq: count(row?.viewer_last_read_seq),
    peer_read_seq: peer ? count(peer.last_read_seq) : 0,
    last_message: preview ? { preview, from_me: row?.last_message_from_viewer === true, at: textOrNull(row?.last_message_at) } : null,
  };
}

// Studio's message (mapDirectMessage); attachments only once they have a URL to read them at.
export function siteDirectMessage(row: any, viewerPublicId: string | null): SiteDirectMessage {
  const content = row?.content_json;
  const text = typeof content === "string" ? content : typeof content?.text === "string" ? content.text : "";
  const attachments: SiteDirectAttachment[] = (Array.isArray(content?.attachments) ? content.attachments : []).flatMap((item: any) =>
    typeof item?.url === "string" && item.url
      ? [{ id: String(item.id ?? ""), name: String(item.name ?? "attachment"), kind: item.type === "image" ? "image" as const : "file" as const,
        mime: textOrNull(item.mime), size: count(item.size), url: item.url }]
      : []);
  return {
    id: String(row?.id ?? ""),
    seq: count(row?.seq),
    from_me: Boolean(viewerPublicId) && row?.sender_user_id === viewerPublicId,
    text,
    attachments,
    created_at: String(row?.created_at ?? ""),
    client_message_id: textOrNull(row?.client_message_id),
  };
}
