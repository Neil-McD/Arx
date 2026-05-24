import {
  buildCommunityLaunchSetupRoutePath,
  normalizeLaunchSetupRouteParam,
  readCommunityLaunchSetupRouteContext,
} from "./communityLaunchSetupRoute";

export const SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES = [
  "source_integration_oauth",
  "source_integration_provider",
  "source_integration_state",
  "source_integration_finalize_token",
  "source_integration_message",
  "source_integration_context",
] as const;

export type SourceIntegrationOAuthProvider = "google_drive" | "github";
export type SourceIntegrationOAuthReturnContextKind =
  | "community_launch_knowledge"
  | null;

export type CommunityLaunchKnowledgeOAuthContext = {
  shouldRestore: boolean;
  communityId: string | null;
  communitySlug: string | null;
  provider?: SourceIntegrationOAuthProvider | null;
  state?: string | null;
  createdAt?: number | null;
};

const COMMUNITY_LAUNCH_KNOWLEDGE_SOURCE_OAUTH_INTENT_STORAGE_PREFIX =
  "community_launch_knowledge_source_oauth:";
const COMMUNITY_LAUNCH_KNOWLEDGE_SOURCE_OAUTH_INTENT_TTL_MS = 60 * 60_000;

export function normalizeLaunchOAuthContextParam(
  value: unknown,
  maxLength = 300,
): string | null {
  return normalizeLaunchSetupRouteParam(value, maxLength);
}

export function normalizeSourceIntegrationOAuthProvider(
  value: unknown,
): SourceIntegrationOAuthProvider | null {
  const normalized = normalizeLaunchOAuthContextParam(value, 80);
  return normalized === "google_drive" || normalized === "github" ? normalized : null;
}

export function normalizeSourceIntegrationOAuthReturnContextKind(
  value: unknown,
): SourceIntegrationOAuthReturnContextKind {
  const normalized = normalizeLaunchOAuthContextParam(value, 80);
  return normalized === "community_launch_knowledge" ? normalized : null;
}

function buildCommunityLaunchKnowledgeSourceOAuthIntentStorageKey(args: {
  provider?: unknown;
  state?: unknown;
}): string | null {
  const provider = normalizeSourceIntegrationOAuthProvider(args.provider);
  const state = normalizeLaunchOAuthContextParam(args.state, 500);
  if (!provider || !state) return null;
  return `${COMMUNITY_LAUNCH_KNOWLEDGE_SOURCE_OAUTH_INTENT_STORAGE_PREFIX}${provider}:${state}`;
}

export function readSourceIntegrationOAuthStateFromAuthorizeUrl(
  authorizeUrl: unknown,
): string | null {
  const raw = normalizeLaunchOAuthContextParam(authorizeUrl, 4_000);
  if (!raw || typeof window === "undefined") return null;
  try {
    return normalizeLaunchOAuthContextParam(
      new URL(raw, window.location.origin).searchParams.get("state"),
      500,
    );
  } catch {
    return null;
  }
}

export function writeCommunityLaunchKnowledgeSourceOAuthIntent(args: {
  provider: SourceIntegrationOAuthProvider;
  state: string | null;
  communityId: string | null;
  communitySlug: string | null;
}): void {
  if (typeof window === "undefined") return;
  const key = buildCommunityLaunchKnowledgeSourceOAuthIntentStorageKey(args);
  if (!key) return;
  const intent: CommunityLaunchKnowledgeOAuthContext = {
    shouldRestore: true,
    provider: args.provider,
    state: normalizeLaunchOAuthContextParam(args.state, 500),
    communityId: normalizeLaunchOAuthContextParam(args.communityId),
    communitySlug: normalizeLaunchOAuthContextParam(args.communitySlug),
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(intent));
  } catch {
    // OAuth return context is recoverable from the callback URL/backend.
  }
}

export function readCommunityLaunchKnowledgeSourceOAuthIntent(args: {
  provider?: unknown;
  state?: unknown;
}): CommunityLaunchKnowledgeOAuthContext | null {
  if (typeof window === "undefined") return null;
  const key = buildCommunityLaunchKnowledgeSourceOAuthIntentStorageKey(args);
  if (!key) return null;
  try {
    const parsed = JSON.parse(String(window.sessionStorage.getItem(key) ?? "{}")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const createdAt = typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : 0;
    if (!createdAt || createdAt < Date.now() - COMMUNITY_LAUNCH_KNOWLEDGE_SOURCE_OAUTH_INTENT_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return {
      shouldRestore: parsed.shouldRestore === true,
      provider: normalizeSourceIntegrationOAuthProvider(parsed.provider),
      state: normalizeLaunchOAuthContextParam(parsed.state, 500),
      communityId: normalizeLaunchOAuthContextParam(parsed.communityId),
      communitySlug: normalizeLaunchOAuthContextParam(parsed.communitySlug),
      createdAt,
    };
  } catch {
    return null;
  }
}

export function clearCommunityLaunchKnowledgeSourceOAuthIntent(args: {
  provider?: unknown;
  state?: unknown;
}): void {
  if (typeof window === "undefined") return;
  const key = buildCommunityLaunchKnowledgeSourceOAuthIntentStorageKey(args);
  if (!key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function buildCommunityLaunchKnowledgeSourceOAuthReturnToPath(args: {
  communityId?: string | null;
  communitySlug?: string | null;
} = {}): string {
  return buildCommunityLaunchSetupRoutePath({
    step: "knowledge",
    communityId: args.communityId,
    communitySlug: args.communitySlug,
  });
}

export function readCommunityLaunchKnowledgeOAuthContext(
  params: URLSearchParams,
): CommunityLaunchKnowledgeOAuthContext {
  const context = readCommunityLaunchSetupRouteContext(params);
  return {
    shouldRestore: context.shouldRestore && context.step === "knowledge",
    communityId: context.communityId,
    communitySlug: context.communitySlug,
  };
}

export function mergeCommunityLaunchKnowledgeOAuthContext(
  primary: CommunityLaunchKnowledgeOAuthContext,
  fallback?: CommunityLaunchKnowledgeOAuthContext | null,
  server?: {
    community_id?: unknown;
    community_slug?: unknown;
    return_context_kind?: unknown;
  } | null,
): CommunityLaunchKnowledgeOAuthContext {
  const serverCommunityId = normalizeLaunchOAuthContextParam(server?.community_id);
  const serverCommunitySlug = normalizeLaunchOAuthContextParam(server?.community_slug);
  const serverReturnContextKind = normalizeSourceIntegrationOAuthReturnContextKind(
    server?.return_context_kind,
  );
  const shouldRestore =
    primary.shouldRestore ||
    fallback?.shouldRestore === true ||
    serverReturnContextKind === "community_launch_knowledge";
  return {
    shouldRestore,
    provider: primary.provider ?? fallback?.provider ?? null,
    state: primary.state ?? fallback?.state ?? null,
    communityId: primary.communityId ?? fallback?.communityId ?? serverCommunityId,
    communitySlug: primary.communitySlug ?? fallback?.communitySlug ?? serverCommunitySlug,
    createdAt: primary.createdAt ?? fallback?.createdAt ?? null,
  };
}
