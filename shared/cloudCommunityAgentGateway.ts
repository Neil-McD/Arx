import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAgentGatewayParams<SessionT> = {
  session: SessionT;
};

type RawCloudCommunityAgentPromptRow = {
  system_prompt?: unknown;
  draft_id?: unknown;
};

type CloudCommunityAgentDraftMutationRow = {
  id?: unknown;
  slot?: unknown;
  is_active?: unknown;
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

export type CloudCommunityAgentSystemPromptResult = {
  systemPrompt: string;
  draftId: string | null;
};

export type CloudCommunityAgentDraftMutationResult = {
  id: string;
  slot: number;
  is_active: boolean;
  updated_at: string;
};

export async function fetchActiveCloudCommunityAgentSystemPrompt<SessionT>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityAgentSystemPromptResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.query("community:getActiveCommunityAgentSystemPrompt" as any, {
    authSubject,
    communityId: params.communityId,
  })) as RawCloudCommunityAgentPromptRow | null;
  const row = firstObjectRow(payload) as RawCloudCommunityAgentPromptRow | null;
  const systemPrompt = toOptionalString(row?.system_prompt);
  if (!systemPrompt) return null;
  return {
    systemPrompt,
    draftId: toOptionalString(row?.draft_id),
  };
}

export async function fetchActiveCloudCommunityAgentLanding<SessionT>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
    init?: RequestInit;
  },
): Promise<unknown | null> {
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("community:getActiveCommunityAgentLanding" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function listCloudCommunityAgentDraftRows<SessionT, TDraft = unknown>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TDraft[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAgentDrafts" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceObjectRows<TDraft>(payload);
}

function parseDraftMutationResult(payload: unknown): CloudCommunityAgentDraftMutationResult | null {
  const row = firstObjectRow(payload) as CloudCommunityAgentDraftMutationRow | null;
  const id = toOptionalString(row?.id);
  const updatedAt = toOptionalString(row?.updated_at);
  const slot = Number(row?.slot);
  if (!id || !updatedAt || !Number.isFinite(slot)) return null;
  return {
    id,
    slot,
    is_active: Boolean(row?.is_active),
    updated_at: updatedAt,
  };
}

export async function upsertCloudCommunityAgentDraft<SessionT>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
    slot: number;
    name: string | null;
    landingJson: unknown;
    systemPrompt: string;
  },
): Promise<CloudCommunityAgentDraftMutationResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:upsertCommunityAgentDraft" as any, {
    authSubject,
    communityId: params.communityId,
    slot: params.slot,
    name: params.name,
    landingJson: params.landingJson,
    systemPrompt: params.systemPrompt,
  });
  return parseDraftMutationResult(payload);
}

export async function setActiveCloudCommunityAgentDraft<SessionT>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
    slot: number;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:setActiveCommunityAgentDraft" as any, {
    authSubject,
    communityId: params.communityId,
    slot: params.slot,
  });
}
