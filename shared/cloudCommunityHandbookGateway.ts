import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityHandbookManagerView } from "./communityHandbookEditorState";

// Studio's handbook editor: owners and admins load, save, approve and ask the
// agent for a draft (convex/communityHandbook.ts).

type HandbookCall = { session: unknown; communityId: string };

export async function fetchCommunityHandbook(params: HandbookCall): Promise<CommunityHandbookManagerView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityHandbook:getCommunityHandbookForManager" as any, { authSubject, communityId: params.communityId });
}

export async function saveCommunityHandbookDraft(params: HandbookCall & { text: string }): Promise<CommunityHandbookManagerView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityHandbook:saveCommunityHandbookDraft" as any, { authSubject, communityId: params.communityId, text: params.text });
}

export async function approveCommunityHandbook(params: HandbookCall & { text: string }): Promise<CommunityHandbookManagerView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityHandbook:approveCommunityHandbook" as any, { authSubject, communityId: params.communityId, text: params.text });
}

export async function requestCommunityHandbookDraft(params: HandbookCall): Promise<CommunityHandbookManagerView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityHandbook:requestCommunityHandbookDraft" as any, { authSubject, communityId: params.communityId });
}
