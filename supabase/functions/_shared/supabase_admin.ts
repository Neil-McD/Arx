import { getEnv } from "./env.ts";

type SupabaseAdmin = {
  url: string;
  serviceRoleKey: string;
};

export function getSupabaseAdmin(): SupabaseAdmin {
  const url = getEnv("ARX_SUPABASE_URL") || getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("ARX_SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("Missing env var: ARX_SUPABASE_URL or SUPABASE_URL");
  if (!serviceRoleKey) {
    throw new Error("Missing env var: ARX_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    url,
    serviceRoleKey,
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
