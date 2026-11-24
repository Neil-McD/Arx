import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { BrainAttach, BrainMap } from "./communityBrain";

// The community brain's map (convex/communityBrain.ts), as this viewer may
// see it: the community's, or a pod's by its room.
export async function fetchBrainMap(params: { session: unknown; communityId: string; podChannelId?: string | null }): Promise<BrainMap> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBrain:getBrainMap" as any, {
    authSubject, communityId: params.communityId, ...(params.podChannelId ? { podChannelId: params.podChannelId } : {}),
  });
}

// One picked learned thing (convex/communityBrain.ts getBrainNote).
export type BrainNoteView = {
  id: string;
  title: string | null;
  kind: "learned" | "taught";
  learned_at: string;
  at: BrainAttach;
  lesson: { id: string; title: string; course: string; order: number } | null;
  use: number;
  with: Array<{ id: string; title: string; count: number }>;
  mine: boolean;
  body_md?: string;
  slug?: string;
};

export async function fetchBrainNote(params: { session: unknown; communityId: string; noteId: string }): Promise<BrainNoteView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBrain:getBrainNote" as any, { authSubject, communityId: params.communityId, noteId: params.noteId });
}

// A builder moves a learned thing on the map (convex/communityMemory.ts
// fileCommunityNote). about: "lesson:<id>" or a subject's name. A refusal
// comes back as its code: about_invalid, about_is_a_title, about_lesson_missing.
export async function moveBrainNote(params: { session: unknown; communityId: string; slug: string; about: string }): Promise<{ ok: true } | { ok: false; code: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityMemory:fileCommunityNote" as any, { authSubject, communityId: params.communityId, slug: params.slug, about: params.about });
}

// The map came back with its lesson links behind the lessons: ask for them to
// be worked out again (convex/communityLessonLinks.ts). It does nothing when
// they are already fresh or a rebuild is running.
export async function refreshBrainLessonLinks(params: { session: unknown; communityId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityLessonLinks:refreshLessonLinks" as any, { authSubject, communityId: params.communityId });
}
