import { getSupabaseAdmin } from "./supabase_admin.ts";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export function extractBearerToken(req: Request): string {
  const header = (req.headers.get("Authorization") ?? "").trim();
  const [kind, token] = header.split(/\s+/);
  if (!kind || kind.toLowerCase() !== "bearer" || !token) throw new Error("Missing bearer token");
  return token;
}

export async function requireVerifiedUserId(req: Request): Promise<string> {
  const token = extractBearerToken(req);
  const admin = getSupabaseAdmin();

  // Fail closed: verify the JWT against Supabase Auth, even if a function is
  // accidentally deployed with verify_jwt=false.
  const res = await fetch(`${admin.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: admin.serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error("Invalid bearer token");

  const data = (await res.json()) as { id?: unknown; user?: { id?: unknown } };
  const userId = typeof data?.id === "string" ? data.id : typeof data?.user?.id === "string" ? data.user.id : "";
  if (!UUID_RE.test(userId)) throw new Error("Invalid user");
  return userId;
}

