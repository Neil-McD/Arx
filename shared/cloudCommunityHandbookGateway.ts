import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityHandbookManagerView } from "./communityHandbookEditorState";

// Studio's handbook editor: owners and admins load, save, approve and ask the
// agent for a draft (convex/communityHandbook.ts).

type HandbookCall = { session: unknown; communityId: string };

async function call(kind: "query" | "mutation", name: string, params: HandbookCall, extra: Record<string, unknown> = {}) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const args = { authSubject, communityId: params.communityId, ...extra };
  const payload = kind === "query" ? await client.query(name as any, args) : await client.mutation(name as any, args);
  return payload as CommunityHandbookManagerView;
}

export const fetchCommunityHandbook = (params: HandbookCall) =>
  call("query", "communityHandbook:getCommunityHandbookForManager", params);

export const saveCommunityHandbookDraft = (params: HandbookCall & { text: string }) =>
  call("mutation", "communityHandbook:saveCommunityHandbookDraft", params, { text: params.text });

export const approveCommunityHandbook = (params: HandbookCall & { text: string }) =>
  call("mutation", "communityHandbook:approveCommunityHandbook", params, { text: params.text });

export const requestCommunityHandbookDraft = (params: HandbookCall) =>
  call("mutation", "communityHandbook:requestCommunityHandbookDraft", params);
