// The quiet dot on Knowledge (the left column and the phone's community
// menu): a lesson or course you can see became visible since you last opened
// Knowledge. Who gets it (members, never anyone who edits courses) and what
// counts as new is decided by the attention query (convex/communityAttention.ts);
// this only reads its row. While Knowledge is open it is being read, so it
// shows nothing, as an open channel's row does.
export function knowledgeAttentionDot(args: {
  indicators: { resources?: boolean } | null | undefined;
  knowledgeOpen: boolean;
}): boolean {
  return !args.knowledgeOpen && Boolean(args.indicators?.resources);
}
