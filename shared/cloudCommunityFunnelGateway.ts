import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityFunnelGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityPublicPresentationSaveResult<TConfig = unknown> = {
  community_id: string;
  updated_at: string;
  funnel: TConfig | null;
};

export type CloudCommunityAboutSaveResult = {
  community_id: string;
  about: string | null;
  updated_at: string;
  settings_revision: number;
};

function firstObjectRow(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const row = payload[0];
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return row as Record<string, unknown>;
    }
    return null;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

export async function fetchCloudCommunityFunnelConfig<SessionT, TConfig = unknown>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityFunnel:getCommunityFunnelConfig" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const row = firstObjectRow(payload);
  return (row as TConfig | null) ?? null;
}

export async function saveCloudCommunityPublicPresentation<SessionT, TConfig = unknown>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    config: TConfig;
  },
): Promise<CloudCommunityPublicPresentationSaveResult<TConfig> | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityLifecycle:saveCommunityPublicPresentation" as any, {
    authSubject,
    communityId: params.communityId,
    config: params.config,
  });
  const row = firstObjectRow(payload);
  if (!row) return null;
  return {
    community_id: String(row.community_id ?? params.communityId).trim() || params.communityId,
    updated_at: String(row.updated_at ?? "").trim(),
    funnel: (row.funnel as TConfig | null | undefined) ?? null,
  };
}

export async function saveCloudCommunityAbout<SessionT>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    about: string | null;
  },
): Promise<CloudCommunityAboutSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityLifecycle:saveCommunityAbout" as any, {
    authSubject,
    communityId: params.communityId,
    about: params.about,
  });
  const row = firstObjectRow(payload);
  if (!row) return null;
  return {
    community_id: String(row.community_id ?? params.communityId).trim() || params.communityId,
    about: typeof row.about === "string" ? row.about : null,
    updated_at: String(row.updated_at ?? "").trim(),
    settings_revision: Math.max(0, Math.floor(Number(row.settings_revision ?? 0))),
  };
}
