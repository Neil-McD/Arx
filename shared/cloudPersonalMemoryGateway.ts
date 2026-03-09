import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

export type CloudPersonalMemoryScope = "global" | "workspace";

export type CloudPersonalMemoryRow = {
  id: string;
  content: string;
  scope: string;
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type CloudPersonalMemoryGatewayParams<SessionT> = {
  session: SessionT;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
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

function normalizeScopeId(scopeId: string | null | undefined): string | undefined {
  const normalized = String(scopeId ?? "").trim();
  return normalized || undefined;
}

export async function listCloudPersonalMemoryRows<SessionT>(
  params: CloudPersonalMemoryGatewayParams<SessionT> & {
    scope?: CloudPersonalMemoryScope;
    scopeId?: string | null;
    limit?: number;
  },
): Promise<CloudPersonalMemoryRow[]> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.query("personalMemory:listPersonalMemoryItems" as any, {
    authSubject,
    scope: params.scope,
    scopeId: normalizeScopeId(params.scopeId),
    limit: params.limit ?? 200,
  });
  return coerceObjectRows<CloudPersonalMemoryRow>(payload);
}

export async function listCloudPersonalMemoryRowsByScopes<SessionT>(
  params: CloudPersonalMemoryGatewayParams<SessionT> & {
    workspaceScopeId?: string | null;
    limitPerScope?: number;
  },
): Promise<CloudPersonalMemoryRow[]> {
  const [globalRows, workspaceRows] = await Promise.all([
    listCloudPersonalMemoryRows({
      session: params.session,
      scope: "global",
      limit: params.limitPerScope,
    }),
    listCloudPersonalMemoryRows({
      session: params.session,
      scope: "workspace",
      scopeId: params.workspaceScopeId,
      limit: params.limitPerScope,
    }),
  ]);
  return [...globalRows, ...workspaceRows];
}

export async function createCloudPersonalMemoryItem<SessionT>(
  params: CloudPersonalMemoryGatewayParams<SessionT> & {
    content: string;
    scope: CloudPersonalMemoryScope;
    scopeId: string | null;
    pinned: boolean;
    returnRepresentation?: boolean;
  },
): Promise<CloudPersonalMemoryRow[] | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("personalMemory:createPersonalMemoryItem" as any, {
    authSubject,
    content: String(params.content ?? ""),
    scope: params.scope,
    scopeId: normalizeScopeId(params.scopeId),
    pinned: Boolean(params.pinned),
  });
  if (!params.returnRepresentation) return null;
  const rows = coerceObjectRows<CloudPersonalMemoryRow>(payload);
  return rows;
}

export async function updateCloudPersonalMemoryPinned<SessionT>(
  params: CloudPersonalMemoryGatewayParams<SessionT> & {
    id: string;
    pinned: boolean;
    updatedAtIso?: string;
  },
): Promise<void> {
  void params.updatedAtIso;
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("personalMemory:updatePersonalMemoryItemPinned" as any, {
    authSubject,
    id: params.id,
    pinned: Boolean(params.pinned),
  });
}

export async function deleteCloudPersonalMemoryItem<SessionT>(
  params: CloudPersonalMemoryGatewayParams<SessionT> & {
    id: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  await client.mutation("personalMemory:deletePersonalMemoryItem" as any, {
    authSubject,
    id: params.id,
  });
}
