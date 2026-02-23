import { getEnv } from "./env.ts";

type SupabaseAdmin = {
  url: string;
  serviceRoleKey: string;
};

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function mismatchError(nameA: string, nameB: string): Error {
  return new Error(`Supabase env mismatch: ${nameA} and ${nameB} must match when both are set.`);
}

export function getSupabaseAdmin(): SupabaseAdmin {
  const canonicalUrlRaw = getEnv("SUPABASE_URL");
  const aliasUrlRaw = getEnv("ARX_SUPABASE_URL");
  const canonicalKeyRaw = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const aliasKeyRaw = getEnv("ARX_SUPABASE_SERVICE_ROLE_KEY");

  if (canonicalUrlRaw && aliasUrlRaw) {
    if (normalizeUrl(canonicalUrlRaw) !== normalizeUrl(aliasUrlRaw)) {
      throw mismatchError("SUPABASE_URL", "ARX_SUPABASE_URL");
    }
  }
  if (canonicalKeyRaw && aliasKeyRaw) {
    if (canonicalKeyRaw.trim() !== aliasKeyRaw.trim()) {
      throw mismatchError("SUPABASE_SERVICE_ROLE_KEY", "ARX_SUPABASE_SERVICE_ROLE_KEY");
    }
  }

  const url = canonicalUrlRaw || aliasUrlRaw;
  const serviceRoleKey = canonicalKeyRaw || aliasKeyRaw;
  if (!url) throw new Error("Missing env var: SUPABASE_URL (fallback: ARX_SUPABASE_URL)");
  if (!serviceRoleKey) {
    throw new Error(
      "Missing env var: SUPABASE_SERVICE_ROLE_KEY (fallback: ARX_SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return {
    url: normalizeUrl(url),
    serviceRoleKey: serviceRoleKey.trim(),
  };
}

export async function supabaseAdminFetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const admin = getSupabaseAdmin();
  const headers = {
    apikey: admin.serviceRoleKey,
    Authorization: `Bearer ${admin.serviceRoleKey}`,
    ...(init.headers ?? {}),
  };
  return fetch(`${admin.url}${path}`, { ...init, headers });
}
