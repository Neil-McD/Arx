import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

// Studio's tags on people (convex/communityTags.ts): owners, admins and
// moderators read them; owners and admins change them.

export type CommunityTagView = { slug: string; name: string; people: number };
export type CommunityTagsView = { can_manage: boolean; tags: CommunityTagView[] };
export type CommunityMemberTagsView = Record<string, Array<{ slug: string; name: string }>>;

type TagsCall = { session: unknown; communityId: string };

export async function fetchCommunityTags(params: TagsCall): Promise<CommunityTagsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityTags:listCommunityTags" as any, { authSubject, communityId: params.communityId });
}

export async function fetchCommunityMemberTags(params: TagsCall & { userIds: string[] }): Promise<CommunityMemberTagsView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityTags:listCommunityMemberTags" as any, {
    authSubject, communityId: params.communityId, targetUserIds: params.userIds,
  });
}

export async function createCommunityTag(params: TagsCall & { name: string }): Promise<{ slug: string; name: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityTags:createCommunityTag" as any, { authSubject, communityId: params.communityId, name: params.name });
}

export async function setCommunityMemberTags(params: TagsCall & { tag: string; userIds: string[]; on: boolean }): Promise<{ changed: number; skipped: string[] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityTags:setCommunityMemberTags" as any, {
    authSubject, communityId: params.communityId, tag: params.tag, targetUserIds: params.userIds, on: params.on,
  });
}
