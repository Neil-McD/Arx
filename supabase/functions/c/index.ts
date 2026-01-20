import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type InviteContext = {
  invite: string | null;
  communityId: string | null;
};

function normalizeInvite(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  if (!/^[A-Z0-9]+$/.test(trimmed)) return null;
  return trimmed;
}

function parseInviteContext(reqUrl: URL): InviteContext {
  const invite = normalizeInvite(
    reqUrl.searchParams.get("invite") ?? reqUrl.searchParams.get("join")
  );

  // Expected path forms:
  // - /c/<community_id>?invite=CODE
  // - /c?invite=CODE
  const segments = reqUrl.pathname.split("/").filter(Boolean);
  const communityId = segments.length >= 2 ? segments[1] : null;

  return { invite, communityId };
}

function getSupabaseUrl(): string {
  return (
    Deno.env.get("SUPABASE_URL") ??
    Deno.env.get("SUPABASE_URL".toLowerCase()) ??
    ""
  ).trim();
}

function normalizeJoinPageUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith(".html")) return trimmed;
  return `${trimmed}/join.html`;
}

function getJoinPageUrl(): string | null {
  const fromEnv = normalizeJoinPageUrl(
    Deno.env.get("ARX_JOIN_PAGE_URL") ??
      Deno.env.get("ARX_JOIN_PAGE_URL".toLowerCase()) ??
      ""
  );
  if (fromEnv) return fromEnv;

  return "https://arx-teal.vercel.app/join.html";
}

function buildRedirectUrl(joinPageUrl: string, ctx: InviteContext): string {
  const params = new URLSearchParams();
  if (ctx.invite) params.set("invite", ctx.invite);
  if (ctx.communityId) params.set("c", ctx.communityId);
  const fragment = params.toString();
  return fragment ? `${joinPageUrl}#${fragment}` : joinPageUrl;
}

function renderPlainTextFallback(ctx: InviteContext): string {
  const inviteCode = ctx.invite;
  const lines: string[] = [];
  lines.push("Join on Arx");
  lines.push("");

  if (!inviteCode) {
    lines.push("This link is missing an invite code.");
    lines.push("Ask the community owner for an invite link or code.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`Invite code: ${inviteCode}`);
  lines.push("");
  lines.push("If you have Arx installed, open:");
  lines.push(`arx://join?invite=${encodeURIComponent(inviteCode)}`);
  lines.push("");
  lines.push("Or open Arx and paste the invite code.");
  return lines.join("\n");
}

const PROBE_TTL_MS = 2 * 60 * 1000;
let joinPageProbeCache: { ok: boolean; checkedAt: number } | null = null;

async function isJoinPageReady(joinPageUrl: string): Promise<boolean> {
  const now = Date.now();
  if (joinPageProbeCache && now - joinPageProbeCache.checkedAt < PROBE_TTL_MS) {
    return joinPageProbeCache.ok;
  }

  let ok = false;
  try {
    const res = await fetch(joinPageUrl, { method: "HEAD" });
    ok = res.ok;
  } catch {
    ok = false;
  }

  joinPageProbeCache = { ok, checkedAt: now };
  return ok;
}

Deno.serve(async (req: Request) => {
  const reqUrl = new URL(req.url);
  const ctx = parseInviteContext(reqUrl);
  const joinPageUrl = getJoinPageUrl();
  const redirectUrl = joinPageUrl ? buildRedirectUrl(joinPageUrl, ctx) : null;

  if (reqUrl.searchParams.get("debug") === "1") {
    return new Response(
      JSON.stringify(
        {
          ok: true,
          url: reqUrl.toString(),
          invite: ctx.invite,
          communityId: ctx.communityId,
          joinPageUrl,
          redirectUrl,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers });
  }

  if (redirectUrl && (await isJoinPageReady(joinPageUrl!))) {
    const redirectHeaders: Record<string, string> = {
      Location: redirectUrl,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    };
    return new Response(null, { status: 302, headers: redirectHeaders });
  }

  const text = renderPlainTextFallback(ctx);
  return new Response(req.method === "HEAD" ? "" : text, { status: 200, headers });
});
