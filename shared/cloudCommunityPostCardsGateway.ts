import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { FormAnswers } from "./communityFormAnswers";
import type { CommunityFormQuestion } from "./communityForms";
import type { PostFormResponseRow, PostPollCard } from "./communityPostCards";

// Polls, shared Forms and "who reacted" for posts (convex/communityPostCards.ts and
// communityInteractions.listCommunityInteractionReactors). Cards themselves arrive
// live on each post; these calls change them or read the longer lists.

export type CommunityReactorPerson = { user_id: string | null; name: string; avatar_url: string | null; is_agent: boolean };
export type CommunityReactorGroup = { emoji: string; people: CommunityReactorPerson[] };
export type ShareablePostForm = { key: string; name: string; question_count: number };
export type PostFormForViewer = {
  id: string; name: string; questions: CommunityFormQuestion[]; answers: FormAnswers; revision: number;
  status: "none" | "draft" | "submitted";
};

async function client(session: unknown) {
  return await bootstrapConvexAuthenticatedClient(session);
}

export async function listCommunityInteractionReactors(session: unknown, target: { type: "root" | "reply"; id: string }): Promise<CommunityReactorGroup[]> {
  const { client: c, authSubject } = await client(session);
  const result = await c.query("communityInteractions:listCommunityInteractionReactors" as any, { authSubject, targetType: target.type, targetId: target.id });
  return Array.isArray((result as any)?.reactions) ? (result as any).reactions : [];
}

export async function createCommunityPollPost(session: unknown, args: {
  communityId: string; channelId?: string | null; idempotencyKey: string; question: string; options: string[]; multiple: boolean;
}): Promise<{ root_id: string }> {
  const { client: c, authSubject } = await client(session);
  return await c.mutation("communityPostCards:createPollPost" as any, {
    authSubject, communityId: args.communityId, ...(args.channelId ? { channelId: args.channelId } : {}),
    idempotencyKey: args.idempotencyKey, question: args.question, options: args.options, multiple: args.multiple,
  });
}

export async function createCommunityFormPost(session: unknown, args: {
  communityId: string; channelId?: string | null; idempotencyKey: string; formKey: string; note: string; answersVisibleTo: "everyone" | "builders";
}): Promise<{ root_id: string }> {
  const { client: c, authSubject } = await client(session);
  return await c.mutation("communityPostCards:createFormPost" as any, {
    authSubject, communityId: args.communityId, ...(args.channelId ? { channelId: args.channelId } : {}),
    idempotencyKey: args.idempotencyKey, formKey: args.formKey, note: args.note, answersVisibleTo: args.answersVisibleTo,
  });
}

export async function listShareablePostForms(session: unknown, communityId: string): Promise<ShareablePostForm[]> {
  const { client: c, authSubject } = await client(session);
  const rows = await c.query("communityPostCards:listShareablePostForms" as any, { authSubject, communityId });
  return Array.isArray(rows) ? rows : [];
}

export async function voteCommunityPoll(session: unknown, rootId: string, optionKeys: string[]): Promise<PostPollCard> {
  const { client: c, authSubject } = await client(session);
  return await c.mutation("communityPostCards:votePostPoll" as any, { authSubject, rootId, optionKeys });
}

export async function setCommunityPollClosed(session: unknown, rootId: string, closed: boolean): Promise<PostPollCard> {
  const { client: c, authSubject } = await client(session);
  return await c.mutation("communityPostCards:setPostPollClosed" as any, { authSubject, rootId, closed });
}

export async function getPostFormForViewer(session: unknown, rootId: string): Promise<PostFormForViewer> {
  const { client: c, authSubject } = await client(session);
  return await c.query("communityPostCards:getPostFormForViewer" as any, { authSubject, rootId });
}

export async function savePostFormAnswers(session: unknown, rootId: string, args: { expectedRevision: number; answers: FormAnswers; submit: boolean }): Promise<{ revision: number; submitted: boolean }> {
  const { client: c, authSubject } = await client(session);
  return await c.mutation("communityPostCards:savePostFormAnswers" as any, { authSubject, rootId, ...args });
}

export async function listPostFormResponses(session: unknown, rootId: string): Promise<{ rows: PostFormResponseRow[]; can_view_answers: boolean }> {
  const { client: c, authSubject } = await client(session);
  return await c.query("communityPostCards:listPostFormResponses" as any, { authSubject, rootId });
}
