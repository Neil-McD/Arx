import { ConvexReactClient } from "convex/react";
import { resolveAuthIdentityToken, resolveAuthSubject } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import type { DirectMessage, DirectMessageConversation } from "./communityTypes";

type CloudDirectMessagesGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudDirectMessagesLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

function coerceRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  for (const key of ["rows", "items", "data"] as const) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

function resolveSessionIdentityToken(sessionRaw: unknown): string {
  return String(resolveAuthIdentityToken((sessionRaw ?? null) as any) ?? "").trim();
}

function emitLiveRows<TRow>(
  watch: { localQueryResult(): unknown },
  onUpdate: (rows: TRow[]) => void,
  onError?: (error: unknown) => void,
) {
  try {
    const result = watch.localQueryResult();
    if (typeof result === "undefined") return;
    onUpdate(coerceRows<TRow>(result));
  } catch (error) {
    onError?.(error);
  }
}

export function createCloudDirectMessagesLiveClient<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT>,
): CloudDirectMessagesLiveClient {
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }
  const identityToken = resolveSessionIdentityToken(params.session);
  if (!identityToken) {
    throw new Error("convex_identity_token_required");
  }

  const client = new ConvexReactClient(requireConvexUrl());
  client.setAuth(async () => resolveSessionIdentityToken(params.session) || null);
  return {
    client,
    authSubject,
    close: () => {
      client.close();
    },
  };
}

export async function ensureCloudDirectConversationFromCommunity<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
    communityId: string;
  },
): Promise<DirectMessageConversation> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:ensureDirectConversationFromCommunity" as any, {
    authSubject,
    targetUserId: params.targetUserId,
    communityId: params.communityId,
  })) as DirectMessageConversation | null;
  if (!payload?.id) throw new Error("Failed to open direct message.");
  return payload;
}

export async function listCloudDirectMessages<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    beforeSeq?: number | null;
    limit?: number;
  },
): Promise<DirectMessage[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("directMessages:listDirectMessages" as any, {
    authSubject,
    conversationId: params.conversationId,
    beforeSeq: params.beforeSeq ?? null,
    limit: params.limit ?? 100,
  });
  return coerceRows<DirectMessage>(payload);
}

export function subscribeCloudDirectMessages<TRow = DirectMessage>(
  params: {
    liveClient: CloudDirectMessagesLiveClient;
    conversationId: string;
    limit?: number;
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    "directMessages:listDirectMessages" as any,
    {
      authSubject: params.liveClient.authSubject,
      conversationId: params.conversationId as any,
      beforeSeq: null,
      limit: params.limit ?? 100,
    } as any,
  );
  const publish = () => {
    emitLiveRows<TRow>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export async function sendCloudDirectMessage<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    text: string;
  },
): Promise<DirectMessage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:sendDirectMessage" as any, {
    authSubject,
    conversationId: params.conversationId,
    text: params.text,
  })) as DirectMessage | null;
  if (!payload?.id) throw new Error("Failed to send direct message.");
  return payload;
}
