import type { CommunityChatMessage } from "./communityTypes";
import type { CommunityMessageAttachment } from "./communityMessageParsing";

const COMMUNITY_CHAT_CACHE_PREFIX = "community_chat_cache:v1:";
const COMMUNITY_CHAT_CACHE_LIMIT = 50;

type CachedCommunityChatMessage = CommunityChatMessage<CommunityMessageAttachment>;

type CommunityChatCachePayload = {
  communityId: string;
  savedAt: string;
  messages: CachedCommunityChatMessage[];
};

function getCommunityChatCacheKey(communityId: string): string {
  return `${COMMUNITY_CHAT_CACHE_PREFIX}${communityId}`;
}

function sanitizeAttachmentForCache(
  attachment: CommunityMessageAttachment,
): CommunityMessageAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mime: attachment.mime,
    size: attachment.size,
    url: attachment.url ?? null,
    storage_id: attachment.storage_id ?? null,
    data_url: null,
    text: null,
    truncated: attachment.truncated ?? null,
  };
}

function sanitizeMessageForCache(
  message: CachedCommunityChatMessage,
): CachedCommunityChatMessage | null {
  const id = String(message.id ?? "").trim();
  const communityId = String(message.community_id ?? "").trim();
  if (!id || !communityId) return null;
  if (id.startsWith("pending-")) return null;
  return {
    id,
    community_id: communityId,
    sender_id: String(message.sender_id ?? "").trim(),
    body: String(message.body ?? ""),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(sanitizeAttachmentForCache)
      : undefined,
    reply_to_id: message.reply_to_id ?? null,
    created_at: String(message.created_at ?? ""),
    seq: Number.isFinite(message.seq) ? Number(message.seq) : 0,
  };
}

export function loadCachedCommunityChatMessages(communityIdRaw: string | null | undefined): CachedCommunityChatMessage[] {
  const communityId = String(communityIdRaw ?? "").trim();
  if (!communityId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getCommunityChatCacheKey(communityId));
    if (!raw) return [];
    const payload = JSON.parse(raw) as CommunityChatCachePayload;
    if (!payload || payload.communityId !== communityId || !Array.isArray(payload.messages)) return [];
    return payload.messages
      .map(sanitizeMessageForCache)
      .filter(Boolean)
      .sort((a, b) => a.seq - b.seq) as CachedCommunityChatMessage[];
  } catch {
    return [];
  }
}

export function saveCachedCommunityChatMessages(
  communityIdRaw: string | null | undefined,
  messages: CachedCommunityChatMessage[],
): void {
  const communityId = String(communityIdRaw ?? "").trim();
  if (!communityId || typeof window === "undefined") return;
  try {
    const sanitized = messages
      .map(sanitizeMessageForCache)
      .filter(Boolean)
      .sort((a, b) => a.seq - b.seq)
      .slice(-COMMUNITY_CHAT_CACHE_LIMIT) as CachedCommunityChatMessage[];
    const payload: CommunityChatCachePayload = {
      communityId,
      savedAt: new Date().toISOString(),
      messages: sanitized,
    };
    window.localStorage.setItem(getCommunityChatCacheKey(communityId), JSON.stringify(payload));
  } catch {
    // Cache is best-effort only.
  }
}
