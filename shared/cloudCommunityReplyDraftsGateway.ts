// "Your guide suggests" on a host's Home (convex/communityReplyDrafts.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { ReplyDraftView } from "./communityReplyDrafts";

type Params = { session: unknown; communityId: string };

export async function fetchReplyDrafts(params: Params): Promise<ReplyDraftView[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityReplyDrafts:listReplyDrafts" as any, { authSubject, communityId: params.communityId })) ?? [];
}

// `text`: the host's own words, when they edited the draft.
export async function postReplyDraft(params: Params & { draftId: string; text?: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityReplyDrafts:postReplyDraft" as any, {
    authSubject, communityId: params.communityId, draftId: params.draftId, ...(params.text !== undefined ? { text: params.text } : {}) });
}

export async function skipReplyDraft(params: Params & { draftId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityReplyDrafts:skipReplyDraft" as any, { authSubject, communityId: params.communityId, draftId: params.draftId });
}
