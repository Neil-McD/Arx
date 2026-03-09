import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAdminGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityRevenueSeriesRow = {
  bucket_start: string;
  net_base_units: number | string | null;
  currency: string | null;
  currency_decimals: number | null;
};

export type CloudCommunitySettingsSaveResult = {
  community_id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  updated_at: string;
};

export type CloudCommunityOneLinerSaveResult = {
  community_id: string;
  description: string | null;
  updated_at: string;
};

type CloudCommunityFreeAccessModeResult = {
  community_id?: string;
  entry_policy?: "open" | "approval" | "paid_unlock" | "paid_subscription";
  updated_at?: string;
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export type CloudCommunityBrandingKind = "avatar" | "banner";

export type CloudCommunityBrandingFieldInput = {
  storageId?: string | null;
  url?: string | null;
};

function isInlineImageDataUrl(raw: unknown): raw is string {
  return String(raw ?? "").trim().toLowerCase().startsWith("data:image/");
}

function dataUrlToUploadPayload(dataUrl: string): { blob: Blob; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }
  const mimeType = match[1]!.trim() || "application/octet-stream";
  const base64 = match[2]!.trim();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}

async function requestCloudCommunityBrandingUploadUrl<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:generateCommunityBrandingUploadUrl" as any, {
    authSubject,
    kind: params.kind,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start image upload.");
  }
  return uploadUrl;
}

async function uploadCloudCommunityBrandingDataUrl<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
    dataUrl: string;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityBrandingUploadUrl({
    session: params.session,
    kind: params.kind,
  });
  const { blob, mimeType } = dataUrlToUploadPayload(params.dataUrl);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload ${params.kind}.`);
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error(`Failed to upload ${params.kind}.`);
  }
  return storageId;
}

export async function prepareCloudCommunityBrandingField<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    kind: CloudCommunityBrandingKind;
    nextValue: string | null | undefined;
    currentStorageId?: string | null;
    currentResolvedUrl?: string | null;
  },
): Promise<CloudCommunityBrandingFieldInput> {
  const trimmedNext = String(params.nextValue ?? "").trim();
  if (!trimmedNext) {
    return {
      storageId: null,
      url: null,
    };
  }
  if (isInlineImageDataUrl(trimmedNext)) {
    const storageId = await uploadCloudCommunityBrandingDataUrl({
      session: params.session,
      kind: params.kind,
      dataUrl: trimmedNext,
    });
    return {
      storageId,
      url: null,
    };
  }
  const currentStorageId = String(params.currentStorageId ?? "").trim();
  const currentResolvedUrl = String(params.currentResolvedUrl ?? "").trim();
  if (currentStorageId && currentResolvedUrl && trimmedNext === currentResolvedUrl) {
    return {
      storageId: currentStorageId,
      url: null,
    };
  }
  return {
    storageId: null,
    url: trimmedNext,
  };
}

export async function listCloudCommunityRevenueSeriesRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CloudCommunityRevenueSeriesRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityRevenueSeries" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return coerceObjectRows<CloudCommunityRevenueSeriesRow>(payload);
}

export async function fetchCloudCommunityEntitledMemberCount<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  try {
    const payload = await client.query("community:countCommunityMemberships" as any, {
      authSubject,
      communityId: params.communityId,
      sinceIso: null,
    });
    return parseNumberLike(payload);
  } catch {
    return null;
  }
}

export async function setCloudCommunityMemberRole<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    userId: string;
    role: "admin" | "moderator" | "member";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:setCommunityMemberRole" as any, {
    authSubject,
    communityId: params.communityId,
    targetUserId: params.userId,
    role: params.role,
  });
}

export async function removeCloudCommunityMember<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    userId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:removeCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetUserId: params.userId,
  });
}

export async function countCloudCommunityResourceRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    sinceIso?: string | null;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  try {
    const payload = await client.query("community:countCommunityResources" as any, {
      authSubject,
      communityId: params.communityId,
      sinceIso: params.sinceIso ?? null,
    });
    return parseNumberLike(payload);
  } catch {
    return null;
  }
}

export async function listCloudCommunityJoinRequestRows<SessionT, TJoinRequest = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TJoinRequest[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityJoinRequests" as any, {
    authSubject,
    communityId: params.communityId,
    limit: 200,
    includeStatuses: ["pending"],
  });
  return coerceObjectRows<TJoinRequest>(payload);
}

export async function fetchCloudCommunityMemberSettingsRow<SessionT, TRow = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    userId: string;
  },
): Promise<TRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
    targetUserId: params.userId,
  });
  const rows = coerceObjectRows<TRow>(payload);
  return rows[0] ?? null;
}

export async function approveCloudCommunityJoinRequest<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    requestId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:approveCommunityJoinRequest" as any, {
    authSubject,
    requestId: params.requestId,
  });
}

export async function denyCloudCommunityJoinRequest<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    requestId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:denyCommunityJoinRequest" as any, {
    authSubject,
    requestId: params.requestId,
  });
}

export async function listCloudCommunityPricePointRows<SessionT, TPricingRow = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TPricingRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityPricePoints" as any, {
    authSubject,
    communityId: params.communityId,
    activeOnly: true,
  });
  return coerceObjectRows<TPricingRow>(payload);
}

export async function listCloudCommunityResourceRows<SessionT, TResource = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
    init?: RequestInit;
  },
): Promise<TResource[]> {
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceObjectRows<TResource>(payload);
}

export async function saveCloudCommunityResource<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityResource" as any, {
    authSubject,
    resourceId: params.resourceId,
    isPatch: params.isPatch,
    payload: params.payload,
  });
}

export async function deleteCloudCommunityResource<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    resourceId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunityResource" as any, {
    authSubject,
    resourceId: params.resourceId,
  });
}

export async function createCloudCommunity<SessionT, TCommunity = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    name: string;
    slug: string;
    visibility: string;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    description: string | null;
    bannerStorageId?: string | null;
    bannerUrl?: string | null;
    bannerFocusX?: number | null;
    bannerFocusY?: number | null;
    bannerZoom?: number | null;
  },
): Promise<TCommunity | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createCommunity" as any, {
    authSubject,
    name: params.name,
    slug: params.slug,
    visibility: params.visibility,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl ?? null,
    description: params.description,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
  });
  const rows = coerceObjectRows<TCommunity>(payload);
  return rows[0] ?? null;
}

export async function setCloudCommunityFreeAccessMode<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    mode: "open" | "approval";
  },
): Promise<CloudCommunityFreeAccessModeResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:setCommunityFreeAccessMode" as any, {
    authSubject,
    communityId: params.communityId,
    mode: params.mode,
  });
  const rows = coerceObjectRows<CloudCommunityFreeAccessModeResult>(payload);
  return rows[0] ?? null;
}

export async function leaveCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:leaveCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function saveCloudCommunitySettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    name: string;
    slug: string;
    description: string | null;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    bannerStorageId?: string | null;
    bannerUrl?: string | null;
    bannerFocusX?: number | null;
    bannerFocusY?: number | null;
    bannerZoom?: number | null;
    visibility: string;
    monthlyAmountBaseUnits: number | null;
    yearlyAmountBaseUnits: number | null;
  },
): Promise<CloudCommunitySettingsSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunitySettings" as any, {
    authSubject,
    communityId: params.communityId,
    name: params.name,
    slug: params.slug,
    description: params.description,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl ?? null,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
    visibility: params.visibility,
    monthlyAmountBaseUnits: params.monthlyAmountBaseUnits,
    yearlyAmountBaseUnits: params.yearlyAmountBaseUnits,
    currency: "usd",
    currencyDecimals: 2,
  });
  const rows = coerceObjectRows<CloudCommunitySettingsSaveResult>(payload);
  return rows[0] ?? null;
}

export async function saveCloudCommunityOneLiner<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    description: string | null;
  },
): Promise<CloudCommunityOneLinerSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunityOneLiner" as any, {
    authSubject,
    communityId: params.communityId,
    description: params.description,
  });
  const rows = coerceObjectRows<CloudCommunityOneLinerSaveResult>(payload);
  return rows[0] ?? null;
}

export async function saveCloudCommunityMemberSettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    userId: string;
    muted: boolean;
    mutedUntil?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
    targetUserId: params.userId,
    muted: params.muted,
    mutedUntilIso: params.mutedUntil ?? null,
  });
}

export async function deleteCloudCommunity<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunity" as any, {
    authSubject,
    communityId: params.communityId,
  });
}
