import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, firstGatewayRow } from "./cloudGateway";
import type { AccountSetupStatus } from "./accountSetup";
import type { CommunityAvatarSummary, ProfileCommunityContext } from "./communityTypes";
import type { SocialProfileLinks } from "./socialProfileLinks";
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "./asyncDeadline";

type CloudProfilesGatewayParams<SessionT> = {
  session: SessionT;
};

type CloudProfileBase = {
  user_id: string;
  display_name: string | null;
  handle?: string | null;
  normalized_handle?: string | null;
  bio?: string | null;
  social_links?: SocialProfileLinks | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CloudProfileAvatarFieldInput = {
  storageId?: string | null;
  url?: string | null;
};

export type CloudProfileDetailRow = CloudProfileBase & {
  bio: string | null;
  show_owned_communities?: boolean;
  show_joined_communities?: boolean;
  social_links?: SocialProfileLinks | null;
  onboarding_completed_at?: string | null;
  account_setup?: AccountSetupStatus | null;
};

export type CloudProfileHandleAvailability = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

function emptyProfileCommunityContext(): ProfileCommunityContext {
  return {
    owned_communities: [],
    mutual_communities: [],
    is_self: false,
    can_message: false,
    message_context_community_id: null,
    message_unavailable_reason: "no_mutual_community",
  };
}

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

function isInlineImageDataUrl(raw: unknown): raw is string {
  return String(raw ?? "").trim().toLowerCase().startsWith("data:image/");
}

function dataUrlToUploadPayload(dataUrl: string): { blob: Blob; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) throw new Error("Invalid image data URL.");
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

async function requestCloudProfileAvatarUploadUrl<SessionT>(
  params: CloudProfilesGatewayParams<SessionT>,
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = (await client.mutation("profiles:generateProfileAvatarUploadUrl" as any, {
    authSubject,
  })) as { uploadUrl?: string | null };
  const uploadUrl = String(payload?.uploadUrl ?? "").trim();
  if (!uploadUrl) throw new Error("Failed to prepare profile photo upload.");
  return uploadUrl;
}

async function uploadCloudProfileAvatarDataUrl<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & {
    dataUrl: string;
  },
): Promise<string> {
  const uploadUrl = await requestCloudProfileAvatarUploadUrl({
    session: params.session,
  });
  const { blob, mimeType } = dataUrlToUploadPayload(params.dataUrl);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
    },
    body: blob,
  });
  if (!response.ok) throw new Error("Failed to upload profile photo.");
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) throw new Error("Failed to upload profile photo.");
  return storageId;
}

export async function prepareCloudProfileAvatarField<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & {
    nextValue: string | null | undefined;
    currentStorageId?: string | null;
    currentResolvedUrl?: string | null;
  },
): Promise<CloudProfileAvatarFieldInput> {
  const trimmedNext = String(params.nextValue ?? "").trim();
  if (!trimmedNext) {
    return {
      storageId: null,
      url: null,
    };
  }
  if (isInlineImageDataUrl(trimmedNext)) {
    const storageId = await uploadCloudProfileAvatarDataUrl({
      session: params.session,
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

export async function listCloudProfileRowsByUserIds<SessionT, TProfile extends CloudProfileBase = CloudProfileBase>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userIds: string[];
  },
): Promise<TProfile[]> {
  const uniqueIds = Array.from(new Set(params.userIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:listProfilesByUserIds" as any, {
    userIds: uniqueIds,
  });
  return coerceGatewayRows<TProfile>(payload);
}

export async function fetchCloudProfileCommunityContext<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & {
    targetUserId: string;
    preferredCommunityId?: string | null;
  },
): Promise<ProfileCommunityContext> {
  const targetUserId = String(params.targetUserId ?? "").trim();
  if (!targetUserId) return emptyProfileCommunityContext();
  const preferredCommunityId = String(params.preferredCommunityId ?? "").trim() || null;
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = (await client.query("profiles:getProfileCommunityContext" as any, {
    authSubject,
    targetUserId,
    preferredCommunityId,
  })) as Partial<ProfileCommunityContext> | null;
  return {
    owned_communities: coerceGatewayRows<CommunityAvatarSummary & { co_creator?: boolean }>(payload?.owned_communities ?? []),
    joined_communities: coerceGatewayRows<CommunityAvatarSummary>(payload?.joined_communities ?? []),
    mutual_communities: coerceGatewayRows<CommunityAvatarSummary>(payload?.mutual_communities ?? []),
    is_self: Boolean(payload?.is_self),
    can_message: Boolean(payload?.can_message),
    message_context_community_id: String(payload?.message_context_community_id ?? "").trim() || null,
    message_unavailable_reason:
      payload?.message_unavailable_reason === "self" ||
      payload?.message_unavailable_reason === "no_mutual_community"
        ? payload.message_unavailable_reason
        : null,
  };
}

export async function fetchCloudProfileDetailByUserId<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
  },
): Promise<TProfile | null> {
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:getProfileDetailByUserId" as any, {
    userId: params.userId,
  });
  return firstGatewayRow<TProfile>(payload);
}

export async function resolveCloudOnboardingProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
  },
): Promise<TProfile | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await withAsyncDeadline(
    client.mutation("profiles:resolveOnboardingProfileDetail" as any, {
      authSubject,
      userId: params.userId,
    }),
    {
      timeoutMs: APP_ADMISSION_TIMEOUT_MS,
      code: "onboarding_profile_resolution_timeout",
    },
  );
  return firstGatewayRow<TProfile>(payload);
}

export async function loadCloudAccountSetupStatus<SessionT>(
  params: CloudProfilesGatewayParams<SessionT>,
): Promise<AccountSetupStatus | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return (await withAsyncDeadline(
    client.query("profiles:getMyAccountSetupStatus" as any, {
      authSubject,
    }),
    {
      timeoutMs: APP_ADMISSION_TIMEOUT_MS,
      code: "account_setup_status_timeout",
    },
  )) as AccountSetupStatus | null;
}

export async function checkCloudProfileHandleAvailability<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & {
    handle: string;
  },
): Promise<CloudProfileHandleAvailability> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return (await client.query("profiles:checkHandleAvailability" as any, {
    authSubject,
    handle: params.handle,
  })) as CloudProfileHandleAvailability;
}

export async function upsertCloudProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
    displayName: string | null;
    handle?: string | null;
    avatarStorageId?: string | null;
    avatarUrl: string | null;
    avatarFocusX?: number | null;
    avatarFocusY?: number | null;
    avatarZoom?: number | null;
    bio: string | null;
    socialLinks?: SocialProfileLinks | null;
    markOnboardingDismissed?: boolean;
    completeOnboarding?: boolean;
    termsOfServiceVersion?: string | null;
    privacyPolicyVersion?: string | null;
  },
): Promise<TProfile | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("profiles:upsertProfileDetail" as any, {
    authSubject,
    userId: params.userId,
    displayName: params.displayName,
    handle: params.handle,
    avatarStorageId: params.avatarStorageId ?? null,
    avatarUrl: params.avatarUrl,
    avatarFocusX: params.avatarFocusX ?? 0.5,
    avatarFocusY: params.avatarFocusY ?? 0.5,
    avatarZoom: params.avatarZoom ?? 1,
    bio: params.bio,
    ...(params.socialLinks !== undefined ? { socialLinks: params.socialLinks } : null),
    markOnboardingDismissed: params.markOnboardingDismissed,
    completeOnboarding: params.completeOnboarding,
    termsOfServiceVersion: params.termsOfServiceVersion ?? null,
    privacyPolicyVersion: params.privacyPolicyVersion ?? null,
  });
  return firstGatewayRow<TProfile>(payload);
}

/* Silent deterministic capture: the browser's IANA timezone for the member
   ontology's account context. Fire-and-forget from the client. */
export async function setCloudProfileCommunityVisibility<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & { showOwned?: boolean; showJoined?: boolean },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("profiles:setMyProfileCommunityVisibility" as any, {
    authSubject,
    ...(params.showOwned === undefined ? {} : { showOwned: params.showOwned }),
    ...(params.showJoined === undefined ? {} : { showJoined: params.showJoined }),
  });
}

export async function recordMemberTimezoneRpc<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & { timezone: string },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("profiles:recordMemberTimezone" as any, {
    authSubject,
    timezone: params.timezone,
  });
}

// The member's own Light/Dark pick, kept on their account (null: not set there).
export type CloudDisplayPreferences = { theme: "light" | "dark" | null; look_everywhere: boolean | null };

export async function fetchCloudMyDisplayPreferences<SessionT>(
  params: CloudProfilesGatewayParams<SessionT>,
): Promise<CloudDisplayPreferences> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return await client.query("profiles:getMyDisplayPreferences" as any, { authSubject }) as CloudDisplayPreferences;
}

export async function setCloudMyDisplayPreferences<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & { theme?: "light" | "dark"; lookEverywhere?: boolean },
): Promise<CloudDisplayPreferences> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return await client.mutation("profiles:setMyDisplayPreferences" as any, {
    authSubject,
    ...(params.theme === undefined ? {} : { theme: params.theme }),
    ...(params.lookEverywhere === undefined ? {} : { lookEverywhere: params.lookEverywhere }),
  }) as CloudDisplayPreferences;
}
