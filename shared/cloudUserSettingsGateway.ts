import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import { firstGatewayObjectRow } from "./cloudGateway";

type CloudUserSettingsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudUserMemorySettingsRow = {
  memory_mode?: unknown;
  remember_intent_enabled?: unknown;
  agent_name?: unknown;
  agent_soul?: unknown;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

export async function loadCloudUserMemorySettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT>,
): Promise<CloudUserMemorySettingsRow | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.query("settings:getUserMemorySettings" as any, {
    authSubject,
  });
  const row = firstGatewayObjectRow(payload);
  if (!row) return null;
  return {
    memory_mode: row.memory_mode,
    remember_intent_enabled: row.remember_intent_enabled,
    agent_name: row.agent_name,
    agent_soul: row.agent_soul,
  };
}

export async function saveCloudUserMemorySettings<SessionT>(
  params: CloudUserSettingsGatewayParams<SessionT> & {
    memoryMode: "off" | "suggest" | "auto";
    rememberIntentEnabled: boolean;
    agentName?: string;
    agentSoul?: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("settings:saveUserMemorySettings" as any, {
    authSubject,
    memoryMode: params.memoryMode,
    rememberIntentEnabled: Boolean(params.rememberIntentEnabled),
    agentName: params.agentName,
    agentSoul: params.agentSoul,
  });
}
