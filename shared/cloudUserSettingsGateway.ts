import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

type CloudUserSettingsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudUserMemorySettingsRow = {
  memory_mode?: unknown;
  remember_intent_enabled?: unknown;
};

export type CloudUserModelSettingsRow = {
  system_prompt?: unknown;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
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

export async function loadCloudUserMemorySettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT>,
): Promise<CloudUserMemorySettingsRow | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.query("settings:getUserMemorySettings" as any, {
    authSubject,
  });
  const row = firstObjectRow(payload);
  if (!row) return null;
  return {
    memory_mode: row.memory_mode,
    remember_intent_enabled: row.remember_intent_enabled,
  };
}

export async function saveCloudUserMemorySettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT> & {
    memoryMode: "off" | "suggest" | "auto";
    rememberIntentEnabled: boolean;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("settings:saveUserMemorySettings" as any, {
    authSubject,
    memoryMode: params.memoryMode,
    rememberIntentEnabled: Boolean(params.rememberIntentEnabled),
  });
}

export async function loadCloudUserModelSettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT>,
): Promise<CloudUserModelSettingsRow | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.query("settings:getUserModelSettings" as any, {
    authSubject,
  });
  const row = firstObjectRow(payload);
  if (!row) return null;
  return {
    system_prompt: row.system_prompt,
  };
}

export async function saveCloudUserModelSettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT> & {
    systemPrompt: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("settings:saveUserModelSettings" as any, {
    authSubject,
    systemPrompt: String(params.systemPrompt ?? ""),
  });
}
