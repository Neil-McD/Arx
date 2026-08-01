export type CommunityMentionAttentionRow = {
  mentioned_user_id?: string | null;
  mentioned_role_key?: string | null;
};

export function interactionMentionsViewer(args: {
  mentions: CommunityMentionAttentionRow[] | undefined;
  currentUserId: string | null | undefined;
  actorUserId: string | null | undefined;
}): boolean {
  const currentUserId = String(args.currentUserId ?? "").trim();
  if (
    !currentUserId ||
    currentUserId === String(args.actorUserId ?? "").trim() ||
    !Array.isArray(args.mentions)
  ) {
    return false;
  }
  return args.mentions.some(
    (mention) =>
      mention.mentioned_user_id === currentUserId ||
      mention.mentioned_role_key === "everybody",
  );
}
