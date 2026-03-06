import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import type { ThreadContextCloudState } from "./threadContextCloudSync";

type CloudThreadContextGatewayParams<SessionT> = {
  session: SessionT;
  threadId: string;
};

type ConvexThreadContextRow = {
  thread_id: string;
  community_id: string | null;
  context_version: unknown;
  updated_at: string;
};

function parseContextVersion(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bootstrapConvexOwner(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

export async function fetchCloudThreadContextById<SessionT>(
  params: CloudThreadContextGatewayParams<SessionT>,
): Promise<ThreadContextCloudState | null> {
  const { client, authSubject } = await bootstrapConvexOwner(params.session);
  const row = (await client.query("threads:getCloudThreadContext" as any, {
    authSubject,
    threadId: params.threadId,
  })) as ConvexThreadContextRow | null;
  if (!row?.thread_id) return null;
  return {
    thread_id: row.thread_id,
    community_id: row.community_id ?? null,
    context_version: parseContextVersion(row.context_version, 0),
    updated_at: row.updated_at,
  };
}

export async function setCloudThreadContext<SessionT>(
  params: {
    session: SessionT;
    threadId: string;
    expectedContextVersion: number;
    communityId: string | null;
    updateCommunityId?: boolean;
  },
): Promise<ThreadContextCloudState | null> {
  const { client, authSubject } = await bootstrapConvexOwner(params.session);
  const row = (await client.mutation("threads:setCloudThreadContext" as any, {
    authSubject,
    threadId: params.threadId,
    expectedContextVersion: Math.max(0, Math.floor(params.expectedContextVersion)),
    communityId: params.communityId,
    updateCommunityId: params.updateCommunityId ?? true,
  })) as ConvexThreadContextRow | null;
  if (!row?.thread_id) return null;
  return {
    thread_id: row.thread_id,
    community_id: row.community_id ?? null,
    context_version: parseContextVersion(row.context_version, params.expectedContextVersion + 1),
    updated_at: row.updated_at,
  };
}
