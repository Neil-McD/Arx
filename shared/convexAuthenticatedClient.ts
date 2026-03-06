import { ConvexHttpClient } from "convex/browser";
import {
  resolveCloudAuthSubject,
  resolveCloudSessionAvatarUrl,
  resolveCloudSessionDisplayName,
  resolveCloudSessionEmail,
  type CloudAuthSession,
} from "./cloudAuthSession";
import { readConvexUrl } from "./convexRuntime";

export type ConvexAuthenticatedClientContext = {
  client: ConvexHttpClient;
  authSubject: string;
  userId: string;
  convexUrl: string;
};

export type ConvexClient = ConvexHttpClient;

export type ConvexAnonymousClientContext = {
  client: ConvexHttpClient;
  anonymousId: string;
  convexUrl: string;
};

export function requireConvexUrl(): string {
  const convexUrl = readConvexUrl();
  if (!convexUrl) {
    throw new Error("convex_url_required");
  }
  return convexUrl;
}

export function hasConvexUrl(): boolean {
  return Boolean(readConvexUrl());
}

export function createConvexClientForUrl(convexUrl: string): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl);
}

export function createConvexClient(): ConvexHttpClient {
  return createConvexClientForUrl(requireConvexUrl());
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return String(error.message ?? "").trim().toLowerCase();
  return String(error ?? "").trim().toLowerCase();
}

function rethrowBootstrapActorError(error: unknown): never {
  const message = toErrorMessage(error);
  if (message.includes("verified_identity_required")) {
    throw new Error("convex_verified_identity_required");
  }
  if (message.includes("auth_subject_mismatch")) {
    throw new Error("convex_auth_subject_mismatch");
  }
  if (message.includes("auth_subject_required")) {
    throw new Error("convex_auth_subject_required");
  }
  throw error instanceof Error ? error : new Error("convex_bootstrap_actor_failed");
}

export async function bootstrapConvexAnonymousClient(
  anonymousIdRaw: unknown,
): Promise<ConvexAnonymousClientContext> {
  const anonymousId = String(anonymousIdRaw ?? "").trim();
  if (!anonymousId) {
    throw new Error("convex_anonymous_id_required");
  }

  const convexUrl = requireConvexUrl();
  const client = createConvexClientForUrl(convexUrl);
  await client.mutation("auth:bootstrapActor" as any, {
    authState: "anonymous",
    anonymousId,
  });
  return {
    client,
    anonymousId,
    convexUrl,
  };
}

export async function bootstrapConvexAuthenticatedClient(
  sessionRaw: unknown,
): Promise<ConvexAuthenticatedClientContext> {
  const convexUrl = requireConvexUrl();
  const session = sessionRaw as CloudAuthSession;
  const authSubject = resolveCloudAuthSubject(session);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }

  const client = createConvexClientForUrl(convexUrl);
  const accessToken = String(session?.access_token ?? "").trim();
  if (accessToken) {
    client.setAuth(accessToken);
  }

  let actor: { userId?: string | null; authSubject?: string | null } | null = null;
  try {
    actor = (await client.mutation("auth:bootstrapActor" as any, {
      authState: "authenticated",
      authSubject,
      email: resolveCloudSessionEmail(session),
      displayName: resolveCloudSessionDisplayName(session),
      avatarUrl: resolveCloudSessionAvatarUrl(session),
    })) as { userId?: string | null; authSubject?: string | null };
  } catch (error) {
    rethrowBootstrapActorError(error);
  }

  const actorAuthSubject = String(actor?.authSubject ?? "").trim();
  if (actorAuthSubject && actorAuthSubject !== authSubject) {
    throw new Error("convex_auth_subject_mismatch");
  }
  const userId = String(actor?.userId ?? "").trim();
  if (!userId) {
    throw new Error("convex_owner_not_found");
  }
  if (userId !== authSubject) {
    throw new Error("convex_auth_subject_mismatch");
  }

  return {
    client,
    authSubject,
    userId,
    convexUrl,
  };
}
