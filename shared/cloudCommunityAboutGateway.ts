import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityAboutSaveResult = {
  community_id: string;
  about: string | null;
  updated_at: string;
  settings_revision: number;
};

export async function saveCloudCommunityAbout<SessionT>(params: {
  session: SessionT;
  communityId: string;
  about: string | null;
}): Promise<CloudCommunityAboutSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityLifecycle:saveCommunityAbout" as any, {
    authSubject,
    communityId: params.communityId,
    about: params.about,
  });
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    community_id: String(record.community_id ?? params.communityId).trim() || params.communityId,
    about: typeof record.about === "string" ? record.about : null,
    updated_at: String(record.updated_at ?? "").trim(),
    settings_revision: Math.max(0, Math.floor(Number(record.settings_revision ?? 0))),
  };
}
