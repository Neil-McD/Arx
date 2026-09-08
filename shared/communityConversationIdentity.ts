export const COMMUNITY_CONVERSATION_PREFIX = "community-conversation:";

export function buildCommunityConversationThreadKey(communityId: string, ordinal: number): string {
  if (!communityId || communityId.includes(":") || !Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error("community_conversation_identity_invalid");
  }
  return `${COMMUNITY_CONVERSATION_PREFIX}${communityId}:episode:${ordinal}`;
}

export function parseCommunityConversationIdentity(thread: { threadKey?: string; communityId?: string }) {
  if (!thread.threadKey?.startsWith(COMMUNITY_CONVERSATION_PREFIX)) return null;
  const match = /^community-conversation:([^:]+):episode:([1-9][0-9]*)$/.exec(thread.threadKey);
  if (!match || thread.communityId !== match[1] || !Number.isSafeInteger(Number(match[2]))) {
    throw new Error("community_conversation_scope_mismatch");
  }
  return { communityId: match[1], ordinal: Number(match[2]) };
}
