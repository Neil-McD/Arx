import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

// Studio's community notes (convex/communityNotes.ts): every member reads
// them; owners and admins edit or delete them.

export type CommunityNoteView = {
  slug: string; title: string; body_md: string; source: string; updated_at: string;
  // Where it came from (founder, ask, tag, migrated), when it was made, and
  // the host who wrote it (only for notes a host wrote).
  kind?: "ask" | "tag" | "founder" | "migrated"; created_at?: string; written_by?: string | null;
};
export type CommunityNotesView = { can_manage: boolean; has_more: boolean; notes: CommunityNoteView[] };

type NotesCall = { session: unknown; communityId: string };

export async function fetchCommunityNotes(params: NotesCall & { limit?: number }): Promise<CommunityNotesView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityNotes:listCommunityNotes" as any, {
    authSubject, communityId: params.communityId, ...(params.limit ? { limit: params.limit } : {}),
  });
}

export async function updateCommunityNote(params: NotesCall & { slug: string; title: string; text: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityNotes:updateCommunityNote" as any, {
    authSubject, communityId: params.communityId, slug: params.slug, title: params.title, text: params.text,
  });
}

export async function deleteCommunityNote(params: NotesCall & { slug: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityNotes:deleteCommunityNote" as any, { authSubject, communityId: params.communityId, slug: params.slug });
}

export async function createCommunityNote(params: NotesCall & { title: string; text: string }): Promise<{ slug: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityNotes:createCommunityNote" as any, { authSubject, communityId: params.communityId, title: params.title, text: params.text });
}
