import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

// The host's house rules for members' own AIs (convex/communityAiRules.ts):
// owners and admins read and save them in Settings.

export type CommunityAiRulesView = { house_rules: string; max_chars: number; polynet_rules: string; empty_words: string };

type RulesCall = { session: unknown; communityId: string };

export async function fetchCommunityAiRules(params: RulesCall): Promise<CommunityAiRulesView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityAiRules:getCommunityAiRulesForManager" as any, { authSubject, communityId: params.communityId });
}

export async function saveCommunityAiRules(params: RulesCall & { text: string }): Promise<CommunityAiRulesView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityAiRules:saveCommunityAiRules" as any, { authSubject, communityId: params.communityId, text: params.text });
}
