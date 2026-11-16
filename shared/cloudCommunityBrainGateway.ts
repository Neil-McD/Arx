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
