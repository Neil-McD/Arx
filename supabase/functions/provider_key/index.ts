import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type ProviderKeyAction = "set" | "get" | "clear";

type ProviderKeyInput =
  | { action: "set"; provider: string; key: string }
  | { action: "get"; provider: string; reveal?: boolean }
  | { action: "clear"; provider: string };

type ProviderKeyRow = { api_key: string; updated_at: string };

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getBearerToken(req: Request): string {
  const header = (req.headers.get("Authorization") ?? "").trim();
  const [kind, token] = header.split(/\s+/);
  if (!kind || kind.toLowerCase() !== "bearer" || !token) throw new Error("Missing bearer token");
  return token;
}

function getVerifiedJwtSub(token: string): string {
  // `verify_jwt=true` means only verified JWTs reach this function.
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const payloadJson = new TextDecoder().decode(base64UrlToBytes(parts[1]));
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  const sub = String(payload.sub ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(sub)) throw new Error("Invalid JWT subject");
  return sub;
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

function normalizeProvider(value: string): "openrouter" {
  const v = (value ?? "").trim().toLowerCase();
  if (v !== "openrouter") throw new Error("Unsupported provider");
  return "openrouter";
}

async function upsertProviderKey(params: { userId: string; provider: string; apiKey: string }): Promise<void> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_provider_keys?on_conflict=user_id,provider`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: params.userId,
        provider: params.provider,
        api_key: params.apiKey,
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function loadProviderKey(params: {
  userId: string;
  provider: string;
}): Promise<ProviderKeyRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_provider_keys?select=api_key,updated_at&user_id=eq.${encodeURIComponent(
      params.userId,
    )}&provider=eq.${encodeURIComponent(params.provider)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ProviderKeyRow[];
  return rows[0] ?? null;
}

async function clearProviderKey(params: { userId: string; provider: string }): Promise<void> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_provider_keys?user_id=eq.${encodeURIComponent(params.userId)}&provider=eq.${encodeURIComponent(
      params.provider,
    )}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!res.ok) throw new Error(await res.text());
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const token = getBearerToken(req);
    const userId = getVerifiedJwtSub(token);
    const input = await readJson<ProviderKeyInput>(req);
    const provider = normalizeProvider((input as { provider?: string }).provider ?? "");

    const action = (input as { action?: unknown }).action as ProviderKeyAction;
    if (action === "set") {
      const raw = (input as { key?: unknown }).key;
      const key = typeof raw === "string" ? raw.trim() : "";
      if (!key) throw new Error("Key is required");
      await upsertProviderKey({ userId, provider, apiKey: key });
      return jsonResponse({ ok: true, provider, status: "saved" }, { status: 200, headers });
    }

    if (action === "clear") {
      await clearProviderKey({ userId, provider });
      return jsonResponse({ ok: true, provider, status: "cleared" }, { status: 200, headers });
    }

    if (action === "get") {
      const row = await loadProviderKey({ userId, provider });
      const reveal = Boolean((input as { reveal?: unknown }).reveal);
      return jsonResponse(
        {
          ok: true,
          provider,
          has_key: Boolean(row?.api_key?.trim()),
          updated_at: row?.updated_at ?? null,
          ...(reveal ? { key: row?.api_key ?? null } : null),
        },
        { status: 200, headers },
      );
    }

    throw new Error("Invalid action");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});

