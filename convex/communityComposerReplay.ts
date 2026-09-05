// Stored on the existing message, never recomputed from editable projections.
// Authorization is still checked on each request; this is identity, not a grant.
export async function fingerprintCommunityComposerPayload(args: {
  channelId: string;
  rootId?: string;
  targetReplyId?: string;
  text: string;
  attachmentIds: string[];
  mentions: unknown[];
}): Promise<string> {
  const payload = JSON.stringify({
    version: 1,
    channelId: args.channelId,
    rootId: args.rootId ?? null,
    targetReplyId: args.targetReplyId ?? null,
    text: args.text,
    attachmentIds: args.attachmentIds,
    mentions: args.mentions.map(mention => JSON.stringify(mention)).sort(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
