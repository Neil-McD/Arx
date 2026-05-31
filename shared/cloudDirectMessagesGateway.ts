import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { DirectMessage, DirectMessageConversation } from "./communityTypes";

type CloudDirectMessagesGatewayParams<SessionT> = {
  session: SessionT;
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
