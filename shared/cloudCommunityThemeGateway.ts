import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  bootstrapConvexAuthenticatedClient,
  createConvexClient,
} from "./convexAuthenticatedClient";
import type { CommunityThemeV1 } from "./communityTheme";

export type CommunityThemeDraftState = {
  draft: CommunityThemeV1;
  draftRevision: number;
  published: CommunityThemeV1 | null;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
};

/** The community's published theme, or null for Polynet's own look. Needs no session. */
export async function fetchCloudPublishedCommunityTheme(params: {
  communityId: string;
}): Promise<CommunityThemeV1 | null> {
  const client = createConvexClient();
  return (await client.query(api.communityThemes.getPublishedCommunityTheme, {
    communityId: params.communityId as Id<"communities">,
  })) as CommunityThemeV1 | null;
}

export async function fetchCloudCommunityThemeDraft<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CommunityThemeDraftState> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communityThemes.getCommunityThemeDraft, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
  })) as CommunityThemeDraftState;
}

export async function saveCloudCommunityThemeDraft<SessionT>(params: {
  session: SessionT;
  communityId: string;
  expectedDraftRevision: number;
  theme: unknown;
}): Promise<CommunityThemeDraftState> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityThemes.saveCommunityThemeDraft, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    expectedDraftRevision: params.expectedDraftRevision,
    theme: params.theme,
  })) as CommunityThemeDraftState;
}

export async function publishCloudCommunityThemeDraft<SessionT>(params: {
  session: SessionT;
  communityId: string;
  expectedDraftRevision: number;
}): Promise<CommunityThemeDraftState> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityThemes.publishCommunityThemeDraft, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    expectedDraftRevision: params.expectedDraftRevision,
  })) as CommunityThemeDraftState;
}

export async function discardCloudCommunityThemeDraft<SessionT>(params: {
  session: SessionT;
  communityId: string;
  expectedDraftRevision: number;
}): Promise<CommunityThemeDraftState> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityThemes.discardCommunityThemeDraft, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    expectedDraftRevision: params.expectedDraftRevision,
  })) as CommunityThemeDraftState;
}

// Saved themes: looks the owner saved under a name (convex/communitySavedThemes.ts).
export type CommunitySavedTheme = {
  savedThemeId: string;
  name: string;
  // null when it no longer passes the theme rules; it can be renamed or deleted, not applied.
  theme: CommunityThemeV1 | null;
  createdAt: number;
  updatedAt: number;
};

export async function fetchCloudCommunitySavedThemes<SessionT>(params: {
  session: SessionT;
  communityId: string;
}): Promise<CommunitySavedTheme[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communitySavedThemes.listCommunitySavedThemes, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
  })) as CommunitySavedTheme[];
}

/** Saves `theme` under a new name, or with savedThemeId replaces that saved theme's look. */
export async function saveCloudCommunitySavedTheme<SessionT>(params: {
  session: SessionT;
  communityId: string;
  name?: string;
  theme: unknown;
  savedThemeId?: string;
}): Promise<{ savedThemeId: string; savedThemes: CommunitySavedTheme[] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communitySavedThemes.saveCommunitySavedTheme, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    ...(params.name !== undefined ? { name: params.name } : {}),
    theme: params.theme,
    ...(params.savedThemeId ? { savedThemeId: params.savedThemeId as Id<"communitySavedThemes"> } : {}),
  })) as { savedThemeId: string; savedThemes: CommunitySavedTheme[] };
}

export async function renameCloudCommunitySavedTheme<SessionT>(params: {
  session: SessionT;
  communityId: string;
  savedThemeId: string;
  name: string;
}): Promise<CommunitySavedTheme[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communitySavedThemes.renameCommunitySavedTheme, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    savedThemeId: params.savedThemeId as Id<"communitySavedThemes">,
    name: params.name,
  })) as CommunitySavedTheme[];
}

export async function deleteCloudCommunitySavedTheme<SessionT>(params: {
  session: SessionT;
  communityId: string;
  savedThemeId: string;
}): Promise<CommunitySavedTheme[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communitySavedThemes.deleteCommunitySavedTheme, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    savedThemeId: params.savedThemeId as Id<"communitySavedThemes">,
  })) as CommunitySavedTheme[];
}
