export type CommunityMentionAttentionRow = {
  mentioned_user_id?: string | null;
  mentioned_role_key?: string | null;
};

export function interactionMentionsViewer(
  mentions: readonly CommunityMentionAttentionRow[] | undefined,
  currentUserId: string | null | undefined,
  actorUserId?: string | null,
): boolean {
  if (!currentUserId || actorUserId === currentUserId || !Array.isArray(mentions)) {
    return false;
  }
  return mentions.some(
    (mention) =>
      mention.mentioned_user_id === currentUserId ||
      String(mention.mentioned_role_key ?? "").trim() === "everybody",
  );
}
