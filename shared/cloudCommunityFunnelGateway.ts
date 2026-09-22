import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "./asyncDeadline";
import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelActivationTarget,
} from "./communityTypes";

type CloudCommunityFunnelGatewayParams<SessionT> = {
  session: SessionT;
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

export async function setCloudCommunityExternalFunnelUrl<SessionT, TConfig = unknown>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    expectedSettingsRevision: number;
    url: string | null;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityFunnel:setCommunityExternalFunnelUrl" as any, {
    authSubject,
    communityId: params.communityId,
    expectedSettingsRevision: params.expectedSettingsRevision,
    url: params.url,
  });
  return firstObjectRow(payload) as TConfig | null;
}

export async function fetchCloudCommunityFunnelDraftPreview<SessionT, TConfig = unknown>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & { communitySlug: string },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await withAsyncDeadline(
    client.query("communityFunnel:getCommunityFunnelDraftPreview" as any, {
      authSubject,
      slug: params.communitySlug,
    }),
    {
      timeoutMs: APP_ADMISSION_TIMEOUT_MS,
      code: "community_funnel_draft_preview_timeout",
    },
  );
  return firstObjectRow(payload) as TConfig | null;
}

export async function publishCloudCommunityFunnelDraft<
  SessionT,
  TConfig = unknown,
>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    slot: CommunityCustomFunnelSlot;
    expectedDraftRevision: number;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation(
    "communityFunnel:publishCommunityFunnelDraft" as any,
    {
      authSubject,
      communityId: params.communityId,
      slot: params.slot,
      expectedDraftRevision: params.expectedDraftRevision,
    },
  );
  return firstObjectRow(payload) as TConfig | null;
}

export async function setCloudCommunityFunnelDraftVsl<
  SessionT,
  TConfig = unknown,
>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    slot: CommunityCustomFunnelSlot;
    expectedDraftRevision: number;
    url: string | null;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation(
    "communityFunnel:setCommunityFunnelDraftVsl" as any,
    {
      authSubject,
      communityId: params.communityId,
      slot: params.slot,
      expectedDraftRevision: params.expectedDraftRevision,
      url: params.url,
    },
  );
  return firstObjectRow(payload) as TConfig | null;
}

export async function setCloudActiveCommunityFunnel<
  SessionT,
  TConfig = unknown,
>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    target: CommunityFunnelActivationTarget;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation(
    "communityFunnel:setActiveCommunityFunnel" as any,
    {
      authSubject,
      communityId: params.communityId,
      target: params.target,
    },
  );
  return firstObjectRow(payload) as TConfig | null;
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
