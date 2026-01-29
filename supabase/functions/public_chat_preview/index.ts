import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";

type CommunityRow = {
  id: string;
  visibility: string;
};

type MessageRow = {
  thread_id: string;
  seq: number;
  role: string;
  content_json: unknown;
  sender_id: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type PreviewMessage = {
  seq: number;
  created_at: string;
  sender_key: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  body: string;
};

function normalizeUuid(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new Error("community_id is required");
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error("Invalid community_id");
  return trimmed;
}

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(30, Math.max(1, Math.trunc(parsed)));
}

function extractTextFromContentJson(contentJson: unknown): string {
  if (contentJson === null || contentJson === undefined) return "";
  if (typeof contentJson === "string") {
    const trimmed = contentJson.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractTextFromContentJson(parsed);
    } catch {
      return trimmed;
    }
  }
  if (typeof contentJson === "object") {
    const asAny = contentJson as Record<string, unknown>;
    if (typeof asAny.text === "string") return asAny.text;
    if (typeof asAny.body === "string") return asAny.body;
  }
  return "";
}

async function loadCommunity(communityId: string): Promise<CommunityRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/communities?select=id,visibility&id=eq.${encodeURIComponent(communityId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as CommunityRow[];
  const row = rows[0];
  if (!row?.id) throw new Error("not_found");
  return row;
}

async function loadMessages(communityId: string, limit: number): Promise<MessageRow[]> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=thread_id,seq,role,content_json,sender_id,created_at` +
      `&thread_id=eq.${encodeURIComponent(communityId)}` +
      `&role=eq.user&order=seq.desc&limit=${limit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessageRow[];
}

async function loadProfiles(userIds: string[]): Promise<Record<string, ProfileRow>> {
  const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return {};
  const list = unique.map((id) => `"${id}"`).join(",");
  const res = await supabaseAdminFetch(
    `/rest/v1/profiles?select=user_id,display_name,avatar_url&user_id=in.(${encodeURIComponent(list)})`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ProfileRow[];
  const out: Record<string, ProfileRow> = {};
  for (const row of rows) {
    if (!row?.user_id) continue;
    out[row.user_id] = row;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const allowed = await edgeRateLimitAllow({ req, key: "public_chat_preview", windowSeconds: 60, limit: 240 });
    if (!allowed) return jsonResponse({ ok: false, error: "rate_limited" }, { status: 429, headers });

    const url = new URL(req.url);
    const communityId = normalizeUuid(url.searchParams.get("community_id"));
    const limit = clampLimit(url.searchParams.get("limit"));

    const community = await loadCommunity(communityId);
    if (String(community.visibility ?? "").trim() !== "public") {
      return jsonResponse({ ok: true, messages: [] }, { status: 200, headers });
    }

    const rowsDesc = await loadMessages(communityId, limit);
    const rows = [...rowsDesc].reverse();
    const senderIds = rows
      .map((row) => (row.sender_id ?? "").trim())
      .filter(Boolean);
    const profiles = await loadProfiles(senderIds);
    const uniqueSenderIds = Array.from(new Set(senderIds));
    const senderKeyById = new Map<string, string>();
    for (let i = 0; i < uniqueSenderIds.length; i++) {
      senderKeyById.set(uniqueSenderIds[i], `s${i + 1}`);
    }

    const messages: PreviewMessage[] = rows.map((row) => {
      const senderId = (row.sender_id ?? "").trim();
      const senderKey = senderId ? senderKeyById.get(senderId) ?? "unknown" : "unknown";
      const profile = senderId ? profiles[senderId] ?? null : null;
      const body = extractTextFromContentJson(row.content_json);
      return {
        seq: Number(row.seq) || 0,
        created_at: row.created_at,
        sender_key: senderKey,
        sender_display_name: profile?.display_name ?? null,
        sender_avatar_url: profile?.avatar_url ?? null,
        body,
      };
    });

    return jsonResponse({ ok: true, messages }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "not_found" ? 404 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
