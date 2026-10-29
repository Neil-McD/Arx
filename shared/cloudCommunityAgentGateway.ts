import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, createConvexClient } from "./convexAuthenticatedClient";

type CloudCommunityAgentGatewayParams<SessionT> = {
  session: SessionT;
};

type CloudCommunityAgentConfigMutationRow = {
  id?: unknown;
  updated_at?: unknown;
};

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

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

export type CloudCommunityAgentConfigMutationResult = {
  id: string;
  updated_at: string;
};

export async function fetchCloudCommunityAgentConfig<SessionT, TConfig = unknown>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAgent:getCommunityAgentConfig" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const rows = coerceObjectRows<TConfig>(payload);
  return rows[0] ?? null;
}

function parseConfigMutationResult(payload: unknown): CloudCommunityAgentConfigMutationResult | null {
  const row = firstObjectRow(payload) as CloudCommunityAgentConfigMutationRow | null;
  const id = toOptionalString(row?.id);
  const updatedAt = toOptionalString(row?.updated_at);
  if (!id || !updatedAt) return null;
  return {
    id,
    updated_at: updatedAt,
  };
}

export async function saveCloudCommunityAgentConfig<SessionT>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
    landingJson: unknown;
    communitySystemPrompt: string;
  },
): Promise<CloudCommunityAgentConfigMutationResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityAgent:saveCommunityAgentConfig" as any, {
    authSubject,
    communityId: params.communityId,
    landingJson: params.landingJson,
    communitySystemPrompt: params.communitySystemPrompt,
  });
  return parseConfigMutationResult(payload);
}

export type CloudCommunityAgentProfile = {
  community_id: string;
  name: string;
  custom_name: string | null;
  avatar_url: string | null;
  avatar_storage_id: string | null;
  community_avatar_url?: string | null;
};

/** The agent's name and photo. Needs no session. */
export async function fetchCloudCommunityAgentProfile(communityId: string): Promise<CloudCommunityAgentProfile | null> {
  const client = createConvexClient();
  return (await client.query(api.communityAgent.getCommunityAgentProfile, {
    communityId: communityId as Id<"communities">,
  })) as CloudCommunityAgentProfile | null;
}

/**
 * Saves the agent's name and photo. `displayName` null puts the community's
 * name back; `photo` is a new image file, or null for the community's icon.
 * Leave either out to keep it.
 */
export async function saveCloudCommunityAgentProfile(session: unknown, communityId: string, change: {
  displayName?: string | null;
  photo?: File | null;
}): Promise<CloudCommunityAgentProfile | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  let avatarStorageId: string | null | undefined;
  if (change.photo === null) avatarStorageId = null;
  else if (change.photo) {
    const { uploadUrl } = await client.mutation(api.communityLifecycle.generateCommunityBrandingUploadUrl, { authSubject, kind: "avatar" });
    const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": change.photo.type || "image/png" }, body: change.photo });
    if (!response.ok) throw new Error("Couldn't upload the photo.");
    avatarStorageId = String(((await response.json()) as { storageId?: string }).storageId ?? "") || null;
    if (!avatarStorageId) throw new Error("Couldn't upload the photo.");
  }
  return (await client.mutation(api.communityAgent.saveCommunityAgentProfile, {
    authSubject,
    communityId: communityId as Id<"communities">,
    ...(change.displayName !== undefined ? { displayName: change.displayName } : {}),
    ...(avatarStorageId !== undefined ? { avatarStorageId: avatarStorageId as Id<"_storage"> | null } : {}),
    ...(change.photo === null ? { avatarUrl: null } : {}),
  })) as CloudCommunityAgentProfile | null;
}

