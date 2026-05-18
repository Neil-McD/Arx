import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, firstGatewayRow, parseGatewayNumberLike } from "./cloudGateway";
import type { CommunityAnalyticsSnapshot } from "./communityTypes";

type CloudCommunityAdminGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityRevenueSeriesRow = {
  bucket_start: string;
  net_base_units: number | string | null;
  currency: string | null;
  currency_decimals: number | null;
};

export type CloudCommunityCreatedAtRow = {
  created_at: string;
};

export type CloudCommunityAnalyticsSummaryRow = {
  page_visits_window: number | null;
  total_members: number | null;
  new_members_window: number | null;
  conversion_rate_window: number | null;
  mrr_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
};

export type CloudCommunitySettingsSaveResult = {
  community_id: string;
  name: string;
  slug: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
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
  one_liner: string | null;
  updated_at: string;
};

export type CloudCommunityArchiveHealthRow = {
  community_id: string;
  total_documents: number;
  status_counts: {
    pending: number;
    embedded: number;
    failed: number;
  };
  source_counts: {
    chat: number;
    ai_feed: number;
    resource: number;
  };
  pdf_counts: {
    pdf_documents: number;
  };
  last_embedding_updated_at: string | null;
  latest_failure_message: string | null;
};

export type CloudCommunityArchiveBackfillResult = {
  chat: number;
  ai_feed: number;
  resource: number;
};

export type CloudCommunityArchiveProcessResult = {
  processed: number;
  succeeded: number;
  failed: number;
  pdf_extraction_attempted: number;
  pdf_extraction_succeeded: number;
  embedding_model: string | null;
  error: string | null;
};

export type CloudCommunityArchiveRetryResult = CloudCommunityArchiveProcessResult & {
  retried: number;
};

type CloudCommunityFreeAccessModeResult = {
  community_id?: string;
  entry_policy?: "open" | "approval" | "paid_subscription";
  updated_at?: string;
};

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
  return coerceGatewayRows<CloudCommunityRevenueSeriesRow>(payload);
}

export async function listCloudCommunityFunnelVisitCreatedAtRows<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    sinceIso?: string | null;
    limit?: number;
  },
): Promise<CloudCommunityCreatedAtRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityFunnelVisitCreatedAtRows" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
    limit: params.limit,
  });
  return coerceGatewayRows<CloudCommunityCreatedAtRow>(payload);
}

export async function fetchCloudCommunityAnalyticsSummary<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CloudCommunityAnalyticsSummaryRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityAnalyticsSummary" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return firstGatewayRow<CloudCommunityAnalyticsSummaryRow>(payload);
}

export async function fetchCloudCommunityAnalyticsSnapshot<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    range: string;
  },
): Promise<CommunityAnalyticsSnapshot | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityAnalyticsSnapshot" as any, {
    authSubject,
    communityId: params.communityId,
    range: params.range,
  });
  return firstGatewayRow<CommunityAnalyticsSnapshot>(payload);
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
    return parseGatewayNumberLike(payload);
  } catch {
    return null;
  }
}

export async function setCloudCommunityMemberRole<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
    role: "admin" | "moderator" | "member";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:setCommunityMemberRole" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
    role: params.role,
  });
}

export async function removeCloudCommunityMember<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.action("community:removeCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
  });
}

export async function banCloudCommunityMember<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    membershipId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.action("community:banCommunityMember" as any, {
    authSubject,
    communityId: params.communityId,
    targetMembershipId: params.membershipId,
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
    return parseGatewayNumberLike(payload);
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
  return coerceGatewayRows<TJoinRequest>(payload);
}

export async function fetchCloudCommunityMemberSettingsRow<SessionT, TRow = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<TRow>(payload);
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
  return coerceGatewayRows<TPricingRow>(payload);
}

export async function listCloudCommunityResourceRows<SessionT, TResource = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TResource[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<TResource>(payload);
}

export async function listCloudCommunityResourceModuleRows<SessionT, TModule = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TModule[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityResourceModules" as any, {
    authSubject,
    communityId: params.communityId,
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<TModule>(payload);
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

export async function saveCloudCommunityResourceModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    moduleId: string | null;
    isPatch: boolean;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityResourceModule" as any, {
    authSubject,
    moduleId: params.moduleId,
    isPatch: params.isPatch,
    payload: params.payload,
  });
}

export async function reorderCloudCommunityResourceModules<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    moduleIds: string[];
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:reorderCommunityResourceModules" as any, {
    authSubject,
    communityId: params.communityId,
    moduleIds: params.moduleIds,
  });
}

export async function reorderCloudCommunityResources<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    moduleId: string | null;
    resourceIds: string[];
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:reorderCommunityResources" as any, {
    authSubject,
    communityId: params.communityId,
    moduleId: params.moduleId,
    resourceIds: params.resourceIds,
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

export async function deleteCloudCommunityResourceModule<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    moduleId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunityResourceModule" as any, {
    authSubject,
    moduleId: params.moduleId,
  });
}

export async function createCloudCommunity<SessionT, TCommunity = unknown>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    name: string;
    slug: string;
    visibility: string;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    avatarFocusX?: number | null;
    avatarFocusY?: number | null;
    avatarZoom?: number | null;
    oneLiner: string | null;
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
    avatarFocusX: params.avatarFocusX ?? 0.5,
    avatarFocusY: params.avatarFocusY ?? 0.5,
    avatarZoom: params.avatarZoom ?? 1,
    oneLiner: params.oneLiner,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
  });
  return firstGatewayRow<TCommunity>(payload);
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
  return firstGatewayRow<CloudCommunityFreeAccessModeResult>(payload);
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
    oneLiner: string | null;
    about: string | null;
    avatarStorageId?: string | null;
    avatarUrl?: string | null;
    avatarFocusX?: number | null;
    avatarFocusY?: number | null;
    avatarZoom?: number | null;
    bannerStorageId?: string | null;
    bannerUrl?: string | null;
    bannerFocusX?: number | null;
    bannerFocusY?: number | null;
    bannerZoom?: number | null;
    visibility: string;
    monthlyAmountBaseUnits: number | null;
    annualAmountBaseUnits: number | null;
  },
): Promise<CloudCommunitySettingsSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunitySettings" as any, {
    authSubject,
    communityId: params.communityId,
    name: params.name,
    slug: params.slug,
    oneLiner: params.oneLiner,
    about: params.about,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl ?? null,
    avatarFocusX: params.avatarFocusX ?? 0.5,
    avatarFocusY: params.avatarFocusY ?? 0.5,
    avatarZoom: params.avatarZoom ?? 1,
    bannerStorageId: params.bannerStorageId ?? null,
    bannerUrl: params.bannerUrl ?? null,
    bannerFocusX: params.bannerFocusX ?? 0.5,
    bannerFocusY: params.bannerFocusY ?? 0.5,
    bannerZoom: params.bannerZoom ?? 1,
    visibility: params.visibility,
    monthlyAmountBaseUnits: params.monthlyAmountBaseUnits,
    annualAmountBaseUnits: params.annualAmountBaseUnits,
    currency: "usd",
    currencyDecimals: 2,
  });
  return firstGatewayRow<CloudCommunitySettingsSaveResult>(payload);
}

export async function saveCloudCommunityOneLiner<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    oneLiner: string | null;
  },
): Promise<CloudCommunityOneLinerSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:saveCommunityOneLiner" as any, {
    authSubject,
    communityId: params.communityId,
    oneLiner: params.oneLiner,
  });
  return firstGatewayRow<CloudCommunityOneLinerSaveResult>(payload);
}

export async function saveCloudCommunityMemberSettings<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
    muted: boolean;
    mutedUntil?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:saveCommunityMemberSettings" as any, {
    authSubject,
    communityId: params.communityId,
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

export async function fetchCloudCommunityArchiveHealth<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveHealthRow | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityArchiveHealth" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveHealthRow>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveHealthRow)
      : null);
}

export async function requestCloudCommunityArchiveBackfill<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveBackfillResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:requestCommunityArchiveBackfill" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveBackfillResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveBackfillResult)
      : null);
}

export async function processCloudCommunityArchivePending<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveProcessResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:processCommunityArchivePending" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveProcessResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveProcessResult)
      : null);
}

export async function retryCloudCommunityArchiveFailures<SessionT>(
  params: CloudCommunityAdminGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityArchiveRetryResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.action("community:retryCommunityArchiveFailures" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstGatewayRow<CloudCommunityArchiveRetryResult>(payload)
    ?? ((payload && typeof payload === "object" && !Array.isArray(payload))
      ? (payload as CloudCommunityArchiveRetryResult)
      : null);
}
