import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAgentGatewayParams<SessionT> = {
  session: SessionT;
};

type RawCloudCommunityAgentPromptRow = {
  community_system_prompt?: unknown;
  system_prompt?: unknown;
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

export type CloudCommunityAgentSystemPromptResult = {
  communitySystemPrompt: string;
};

export type CloudCommunityAgentConfigMutationResult = {
  id: string;
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
  const communitySystemPrompt =
    toOptionalString(row?.community_system_prompt) ?? toOptionalString(row?.system_prompt);
  if (!communitySystemPrompt) return null;
  return {
    communitySystemPrompt,
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

export async function fetchCloudCommunityAgentConfig<SessionT, TConfig = unknown>(
  params: CloudCommunityAgentGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TConfig | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getCommunityAgentConfig" as any, {
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
  const payload = await client.mutation("community:saveCommunityAgentConfig" as any, {
    authSubject,
    communityId: params.communityId,
    landingJson: params.landingJson,
    communitySystemPrompt: params.communitySystemPrompt,
  });
  return parseConfigMutationResult(payload);
}
