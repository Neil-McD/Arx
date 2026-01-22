import { requireEnv } from "./env.ts";

type SupabaseAdmin = {
  url: string;
  serviceRoleKey: string;
};

export function getSupabaseAdmin(): SupabaseAdmin {
  return {
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
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

