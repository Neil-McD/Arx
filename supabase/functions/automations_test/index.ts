import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { requireVerifiedUserId } from "../_shared/auth.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type TestInput = { endpoint_id: string };

type EndpointRow = {
  community_id: string;
  endpoint_id: string;
  url: string;
  include_email: boolean;
  signing_secret: string;
};

type EnqueueRow = { event_id: string };

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(handle);
  }
}

async function getEndpointForManage(params: { userId: string; endpointId: string }): Promise<EndpointRow> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_get_endpoint_for_manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: params.userId, p_endpoint_id: params.endpointId }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as EndpointRow[];
  const row = rows[0];
  if (!row?.endpoint_id) throw new Error("endpoint_not_found");
  return row;
}

async function enqueueTestEvent(params: { communityId: string }): Promise<string> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_enqueue_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_community_id: params.communityId,
      p_event_type: "test.ping",
      p_payload: { source: "automations_test" },
      p_idempotency_key: null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as EnqueueRow[];
  const row = rows[0];
  if (!row?.event_id) throw new Error("Failed to enqueue test event");
  return row.event_id;
}

async function recordDelivery(params: {
  eventId: string;
  endpointId: string;
  status: "success" | "fail";
  responseCode: number | null;
  durationMs: number | null;
  error: string | null;
}): Promise<void> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_record_delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_event_id: params.eventId,
      p_endpoint_id: params.endpointId,
      p_status: params.status,
      p_response_code: params.responseCode,
      p_duration_ms: params.durationMs,
      p_error: params.error,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function finalizeEvent(params: { eventId: string; success: boolean; error: string | null }): Promise<void> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_finalize_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_event_id: params.eventId, p_success: params.success, p_error: params.error }),
  });
  if (!res.ok) throw new Error(await res.text());
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const userId = await requireVerifiedUserId(req);
    const input = await readJson<TestInput>(req);
    const endpointId = String(input.endpoint_id ?? "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(endpointId)) throw new Error("endpoint_id_required");

    const endpoint = await getEndpointForManage({ userId, endpointId });
    if (!endpoint.signing_secret?.trim()) throw new Error("endpoint_missing_secret");

    const eventId = await enqueueTestEvent({ communityId: endpoint.community_id });

    const occurredAt = new Date().toISOString();
    const payload = {
      id: eventId,
      type: "test.ping",
      community_id: endpoint.community_id,
      occurred_at: occurredAt,
      data: { message: "ping" },
    };
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacSha256Hex(endpoint.signing_secret, `${ts}.${body}`);

    const started = Date.now();
    let responseCode: number | null = null;
    let ok = false;
    let error: string | null = null;
    try {
      const res = await fetchWithTimeout(
        endpoint.url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Arx-Automations/1.0",
            "X-Arx-Event-Id": eventId,
            "X-Arx-Event-Type": "test.ping",
            "X-Arx-Community-Id": endpoint.community_id,
            "X-Arx-Signature": `t=${ts},v1=${sig}`,
          },
          body,
        },
        10_000,
      );
      responseCode = res.status;
      ok = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - started;
    await recordDelivery({
      eventId,
      endpointId: endpoint.endpoint_id,
      status: ok ? "success" : "fail",
      responseCode,
      durationMs,
      error,
    });
    await finalizeEvent({ eventId, success: ok, error });

    return jsonResponse({ ok: true, event_id: eventId, endpoint_id: endpoint.endpoint_id, delivered: ok, response_code: responseCode, duration_ms: durationMs, error }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, { status: 400, headers });
  }
});
