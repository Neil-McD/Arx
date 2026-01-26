import { supabaseAdminFetch } from "./supabase_admin.ts";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const candidate = forwarded.split(",")[0]?.trim();
  if (candidate) return candidate;
  const realIp = (req.headers.get("x-real-ip") ?? "").trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function edgeRateLimitAllow(params: {
  req: Request;
  key: string;
  windowSeconds: number;
  limit: number;
}): Promise<boolean> {
  const ip = getClientIp(params.req);
  const fullKey = `${params.key}:${ip}`;
  const res = await supabaseAdminFetch("/rest/v1/rpc/edge_rate_limit_allow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_key: fullKey,
      p_window_seconds: params.windowSeconds,
      p_limit: params.limit,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as unknown;
  if (typeof data === "boolean") return data;
  return Boolean(data);
}

