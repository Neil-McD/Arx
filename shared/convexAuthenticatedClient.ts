import { ConvexHttpClient } from "convex/browser";
import {
  resolveAuthSubject,
  resolveConvexRuntimeToken,
  resolveAuthSessionEmail,
  type AuthSessionLike,
} from "./authSession";
import { readConvexUrl } from "./convexRuntime";
import { normalizeGatewayNullableString, readGatewayConvexIdMaybe } from "./cloudGateway";
import { readPersistedDistributionAttribution } from './distributionAttribution';
import {
  APP_ADMISSION_TIMEOUT_MS,
  withAsyncDeadline,
} from "./asyncDeadline";

export type ConvexAuthenticatedClientContext = {
  client: ConvexHttpClient;
  authSubject: string;
  convexUrl: string;
  bootstrap: ConvexAuthenticatedBootstrapResult | null;
};

export type ConvexAuthenticatedBootstrapContinuity = {
  resolutionPath: string | null;
  blockers: string[];
  resolvedUserId: string | null;
  wouldCreateNewUser: boolean;
  subjectMatchUserId: string | null;
  relinkCandidateUserId: string | null;
};

export type ConvexAuthenticatedBootstrapResult = {
  authSubject: string | null;
  dbUserId: string | null;
  canonicalTier: string | null;
  effectiveTier: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  continuity: ConvexAuthenticatedBootstrapContinuity | null;
};

export type ConvexClient = ConvexHttpClient;

type AuthenticatedBootstrapCacheEntry = {
  key: string;
  promise: Promise<ConvexAuthenticatedClientContext>;
};

let authenticatedBootstrapCache: AuthenticatedBootstrapCacheEntry | null = null;

export function requireConvexUrl(): string {
  const convexUrl = readConvexUrl();
  if (!convexUrl) {
    throw new Error("convex_url_required");
  }
  return convexUrl;
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

function buildAuthenticatedBootstrapCacheKey(session: AuthSessionLike): string | null {
  const authSubject = resolveAuthSubject(session);
  const runtimeToken = resolveConvexRuntimeToken(session);
  if (!authSubject || !runtimeToken) return null;
  return `${authSubject}::${runtimeToken}`;
}

export async function bootstrapConvexAuthenticatedClient(
  sessionRaw: unknown,
): Promise<ConvexAuthenticatedClientContext> {
  const session = sessionRaw as AuthSessionLike;
  const cacheKey = buildAuthenticatedBootstrapCacheKey(session);
  if (cacheKey && authenticatedBootstrapCache?.key === cacheKey) {
    return await authenticatedBootstrapCache.promise;
  }

  const promise = (async (): Promise<ConvexAuthenticatedClientContext> => {
    const convexUrl = requireConvexUrl();
    const authSubject = resolveAuthSubject(session);
    if (!authSubject) {
      throw new Error("convex_auth_subject_required");
    }

    const client = createConvexClientForUrl(convexUrl);
    const runtimeToken = resolveConvexRuntimeToken(session);
    if (runtimeToken) {
      client.setAuth(runtimeToken);
    }

    let actor: Record<string, unknown> | null = null;
    const sessionEmail = resolveAuthSessionEmail(session);
    try {
      actor = (await withAsyncDeadline(
        client.mutation("auth:bootstrapActor" as any, {
          authState: "authenticated",
          authSubject,
          email: sessionEmail,
          distributionAttribution: readPersistedDistributionAttribution() ?? undefined,
        }),
        {
          timeoutMs: APP_ADMISSION_TIMEOUT_MS,
          code: "convex_bootstrap_actor_timeout",
        },
      )) as Record<string, unknown>;
    } catch (error) {
      rethrowBootstrapActorError(error);
    }

    const actorAuthSubject = String(actor?.authSubject ?? "").trim();
    if (actorAuthSubject && actorAuthSubject !== authSubject) {
      throw new Error("convex_auth_subject_mismatch");
    }
    return {
      client,
      authSubject,
      convexUrl,
      bootstrap: {
        authSubject: actorAuthSubject || null,
        dbUserId: readGatewayConvexIdMaybe(actor?.dbUserId) ?? null,
        canonicalTier: normalizeGatewayNullableString(actor?.canonicalTier),
        effectiveTier: normalizeGatewayNullableString(actor?.effectiveTier),
        email: normalizeGatewayNullableString(actor?.email),
        displayName: normalizeGatewayNullableString(actor?.displayName),
        avatarUrl: normalizeGatewayNullableString(actor?.avatarUrl),
        continuity: actor?.continuity && typeof actor.continuity === "object"
          ? {
              resolutionPath: normalizeGatewayNullableString((actor.continuity as Record<string, unknown>).resolutionPath),
              blockers: Array.isArray((actor.continuity as Record<string, unknown>).blockers)
                ? ((actor.continuity as Record<string, unknown>).blockers as unknown[])
                    .map((value) => normalizeGatewayNullableString(value))
                    .filter((value): value is string => Boolean(value))
                : [],
              resolvedUserId: normalizeGatewayNullableString((actor.continuity as Record<string, unknown>).resolvedUserId),
              wouldCreateNewUser: Boolean((actor.continuity as Record<string, unknown>).wouldCreateNewUser),
              subjectMatchUserId: normalizeGatewayNullableString(
                (actor.continuity as Record<string, unknown>).subjectMatchUser &&
                  typeof (actor.continuity as Record<string, unknown>).subjectMatchUser === "object"
                  ? ((actor.continuity as Record<string, unknown>).subjectMatchUser as Record<string, unknown>).userId
                  : null,
              ),
              relinkCandidateUserId: normalizeGatewayNullableString(
                (actor.continuity as Record<string, unknown>).relinkCandidateUser &&
                  typeof (actor.continuity as Record<string, unknown>).relinkCandidateUser === "object"
                  ? ((actor.continuity as Record<string, unknown>).relinkCandidateUser as Record<string, unknown>).userId
                  : null,
              ),
            }
          : null,
      },
    };
  })();

  if (cacheKey) {
    authenticatedBootstrapCache = {
      key: cacheKey,
      promise,
    };
  }

  try {
    return await promise;
  } catch (error) {
    if (cacheKey && authenticatedBootstrapCache?.key === cacheKey) {
      authenticatedBootstrapCache = null;
    }
    throw error;
  }
}
