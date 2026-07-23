import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { resolveAuthSubject, resolveConvexRuntimeToken } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  createAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeAuthState,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";

type CloudCommunityChatGatewayParams<SessionT> = {
  session: SessionT;
};

type CommunityChatUploadableFile = {
  type?: string;
};

export type CloudCommunityChatLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

function resolveSessionRuntimeToken(sessionRaw: unknown): string {
  return String(resolveConvexRuntimeToken((sessionRaw ?? null) as any) ?? "").trim();
}

export function createCloudCommunityChatLiveClient<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudCommunityChatLiveClient {
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }
  const runtimeToken = resolveSessionRuntimeToken(params.session);
  if (!runtimeToken) {
    throw new Error("convex_identity_token_required");
  }

  const authState: ConvexRealtimeAuthState<SessionT> = {
    sessionRef: { current: params.session },
    ensureSessionRef: { current: params.ensureSession },
  };
  const realtimeClient = createAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    authState,
    source: "community_chat_live",
  });
  return {
    client: realtimeClient.client,
    authSubject,
    close: () => {
      realtimeClient.close();
    },
  };
}

function emitLiveResult<TResult>(
  watch: { localQueryResult(): unknown },
  onUpdate: (result: TResult) => void,
  onError?: (error: unknown) => void,
) {
  try {
    const result = watch.localQueryResult();
    if (typeof result === "undefined") return;
    onUpdate(result as TResult);
  } catch (error) {
    onError?.(error);
  }
}

export function subscribeCloudCommunityTyping<TResult = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    communityId: string;
    onUpdate: (result: TResult) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.community.listCommunityTyping,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    emitLiveResult<TResult>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export async function setCloudCommunityTyping<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    rootId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:setCommunityTyping" as any, {
    authSubject,
    communityId: params.communityId,
    rootId: params.rootId ?? undefined,
  });
}

async function requestCloudCommunityChatAttachmentUploadUrl<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:generateCommunityChatAttachmentUploadUrl" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start community attachment upload.");
  }
  return uploadUrl;
}

export async function uploadCloudCommunityChatAttachmentFile<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    file: File | Blob | CommunityChatUploadableFile;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityChatAttachmentUploadUrl({
    session: params.session,
    communityId: params.communityId,
  });
  const contentType =
    params.file && typeof params.file === "object" && "type" in params.file
      ? String((params.file as CommunityChatUploadableFile).type ?? "").trim() || "application/octet-stream"
      : "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: params.file as BodyInit,
  });
  if (!response.ok) {
    throw new Error("Failed to upload attachment.");
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error("Failed to upload attachment.");
  }
  return storageId;
}
