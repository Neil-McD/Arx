import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityTrackCoverStyle, CommunityTrackDefinition, CommunityTrackRule, CommunityTrackStageDefinition } from "./communityLessonTracks";

// The owner's skill track editor (Knowledge → Roadmap). The agent saves through
// the same mutations (community.track.*).

export type CommunityBuilderTrack = CommunityTrackDefinition & { revision: number; derived: boolean };

export type CommunityBuilderTracks = {
  tracks: CommunityBuilderTrack[];
  archived: Array<CommunityTrackDefinition & { revision: number }>;
  lessons: Array<{ id: string; title: string; kind: string | null }>;
  workflow_stages: Array<{ key: string; name: string }>;
  client_properties: Array<{ key: string; name: string; type: string; options: string[] }>;
  // The offer ladder, for selling a track ({"type":"offer"} rule).
  offers?: Array<{ key: string; name: string; rank: number; is_base: boolean }>;
};

export async function fetchCloudCommunityLessonTracks<SessionT>(params: { session: SessionT; communityId: string }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communityLessonTracks.listCommunityLessonTracks, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
  })) as CommunityBuilderTracks;
}

export async function saveCloudCommunityLessonTrack<SessionT>(params: {
  session: SessionT;
  communityId: string;
  key: string;
  expectedRevision: number;
  title: string;
  summary?: string | null;
  coverUrl?: string | null;
  coverStyle?: CommunityTrackCoverStyle | null;
  outcomes?: string[];
  audience?: string | null;
  order?: number;
  show?: "always" | "when_open";
  opensWhen: CommunityTrackRule[];
  stages: CommunityTrackStageDefinition[];
}) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    key: params.key,
    expectedRevision: params.expectedRevision,
    title: params.title,
    ...(params.summary !== undefined ? { summary: params.summary } : {}),
    ...(params.coverUrl !== undefined ? { coverUrl: params.coverUrl } : {}),
    ...(params.coverStyle !== undefined ? { coverStyle: params.coverStyle } : {}),
    ...(params.outcomes !== undefined ? { outcomes: params.outcomes } : {}),
    ...(params.audience !== undefined ? { audience: params.audience } : {}),
    ...(params.order !== undefined ? { order: params.order } : {}),
    ...(params.show ? { show: params.show } : {}),
    opensWhen: params.opensWhen,
    stages: params.stages,
  })) as { key: string; revision: number };
}

export async function reorderCloudCommunityLessonTracks<SessionT>(params: { session: SessionT; communityId: string; keys: string[] }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityLessonTracks.reorderCommunityLessonTracks, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    keys: params.keys,
  });
}

export async function setCloudCommunityLessonTrackArchived<SessionT>(params: { session: SessionT; communityId: string; key: string; archived: boolean }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityLessonTracks.setCommunityLessonTrackArchived, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    key: params.key,
    archived: params.archived,
  });
}
