import { supabaseAdminFetch } from "./supabase_admin.ts";

type AuthAdminUser = { email?: string | null };

export async function loadAuthAdminUserEmail(userId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "GET",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as AuthAdminUser;
  const email = String(data?.email ?? "").trim();
  return email ? email : null;
}
