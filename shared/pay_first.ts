import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

const PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY = "arx_pending_public_join_community_id";
const PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY = "arx_pending_public_join_community_slug";

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function safeLocalStorageGet(key: string): string {
  try {
    return (localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function storePendingPublicJoin(communityId: string): void {
  const trimmed = communityId.trim();
  if (trimmed) {
    if (isUuid(trimmed)) {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY, trimmed);
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
    } else {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY, trimmed.toLowerCase());
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
    }
  }
}

export function readPendingPublicJoinCommunityId(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
}

export function readPendingPublicJoinCommunitySlug(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
}

export function clearPendingPublicJoin(): void {
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
}

export type SessionLike = {
  access_token: string;
};

async function bootstrapConvexUserForPayFirst(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

function normalizeErrorToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collectStructuredErrorFields(error: unknown, collect: (value: unknown) => void): void {
  if (!error || typeof error !== "object") return;
  const record = error as Record<string, unknown>;
  collect(record.code);
  collect(record.message);
  collect(record.details);
  collect(record.hint);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export type PublicCommunityJoinErrorKind =
  | "paid_plan_required"
  | "approval_pending"
  | "approval_denied"
  | "authentication_required"
  | "community_not_found"
  | "forbidden"
  | null;

export function classifyPublicCommunityJoinError(error: unknown): PublicCommunityJoinErrorKind {
  const values: string[] = [];
  const collect = (value: unknown) => {
    const normalized = normalizeErrorToken(value);
    if (normalized) values.push(normalized);
  };

  collectStructuredErrorFields(error, collect);
  if (error instanceof Error) {
    collect(error.message);
  } else if (!error || typeof error !== "object") {
    collect(error);
  }

  const has = (token: string): boolean =>
    values.some((value) => value === token || value.includes(token));

  if (has("paid_plan_required")) return "paid_plan_required";
  if (has("approval_pending")) return "approval_pending";
  if (has("approval_denied")) return "approval_denied";
  if (has("approval_required")) return "approval_pending";
  if (has("community_not_found") || has("community not found")) return "community_not_found";
  if (has("forbidden") || has("42501")) return "forbidden";
  if (has("authentication required") || has("28000")) return "authentication_required";

  return null;
}

export async function joinPublicCommunityRpc<S extends SessionLike>(opts: {
  session: S;
  communityId?: string;
  communitySlug?: string;
}): Promise<{
  outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
  community_id: string;
  reapply_at?: string | null;
}> {
  const { client } = await bootstrapConvexUserForPayFirst(opts.session);
  const slug = (opts.communitySlug ?? "").trim();
  const id = (opts.communityId ?? "").trim();
  let result:
    | {
        outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
        community_id: string;
        reapply_at?: string | null;
      }
    | null = null;
  if (slug) {
    result = ((await client.mutation("communityPublic:joinPublicCommunityBySlug" as any, {
      communitySlug: slug,
    })) as {
      outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
      community_id: string;
      reapply_at?: string | null;
    } | null) ?? null;
  } else if (id) {
    result = ((await client.mutation("communityPublic:joinPublicCommunity" as any, {
      communityId: id,
    })) as {
      outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
      community_id: string;
      reapply_at?: string | null;
    } | null) ?? null;
  } else {
    throw new Error("Missing community");
  }
  return result ?? {
    outcome: "joined",
    community_id: id,
  };
}
