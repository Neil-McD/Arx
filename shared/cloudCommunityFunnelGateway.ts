import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityFunnelGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityFunnelSaveResult<TConfig = unknown> = {
  community_id: string;
  description: string | null;
  updated_at: string;
  funnel: TConfig | null;
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
  const payload = await client.query("community:getCommunityFunnelConfig" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const row = firstObjectRow(payload);
  return (row as TConfig | null) ?? null;
}

export async function saveCloudCommunityFunnel<SessionT, TConfig = unknown>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    communityId: string;
    description: string | null;
    config: TConfig;
  },
): Promise<CloudCommunityFunnelSaveResult<TConfig> | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunityFunnel" as any, {
    authSubject,
    communityId: params.communityId,
    description: params.description,
    config: params.config,
  });
  const row = firstObjectRow(payload);
  if (!row) return null;
  return {
    community_id: String(row.community_id ?? params.communityId).trim() || params.communityId,
    description: typeof row.description === "string" ? row.description : row.description === null ? null : null,
    updated_at: String(row.updated_at ?? "").trim(),
    funnel: (row.funnel as TConfig | null | undefined) ?? null,
  };
}

export async function uploadCloudCommunityFunnelMediaFile<SessionT>(
  params: CloudCommunityFunnelGatewayParams<SessionT> & {
    file: File;
  },
): Promise<{ storageId: string; kind: "image" | "video" }> {
  const kind = params.file.type.toLowerCase().startsWith("video/") ? "video" : "image";
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:generateCommunityBrandingUploadUrl" as any, {
    authSubject,
    kind: "banner",
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start media upload.");
  }
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": params.file.type || "application/octet-stream",
    },
    body: params.file,
  });
  if (!response.ok) {
    throw new Error("Failed to upload media.");
  }
  const uploadPayload = (await response.json()) as { storageId?: string | null };
  const storageId = String(uploadPayload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error("Failed to upload media.");
  }
  return { storageId, kind };
}
