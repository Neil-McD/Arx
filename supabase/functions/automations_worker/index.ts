import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";

type WorkerInput = { batch_size?: number };

type DequeuedEvent = {
  event_id: string;
  community_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  attempt_count: number;
};

type DeliveryEndpoint = {
  endpoint_id: string;
  kind: "webhook" | "brandos";
  url: string;
  include_email: boolean;
  secret: string;
  brandos_account_id: string | null;
};

async function loadWorkerSecret(): Promise<string> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_worker_secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ secret: string | null }>;
  const secret = (rows[0]?.secret ?? "").trim();
  if (!secret) throw new Error("worker_secret_not_configured");
  return secret;
}

async function requireWorkerAuth(req: Request): Promise<void> {
  const got = (req.headers.get("x-arx-worker-secret") ?? "").trim();
  if (!got) throw new Error("forbidden");
  const expected = await loadWorkerSecret();
  if (got !== expected) throw new Error("forbidden");
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

async function dequeueEvents(batchSize: number): Promise<DequeuedEvent[]> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_dequeue_events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_batch_size: batchSize }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DequeuedEvent[];
}

async function listEndpoints(params: { communityId: string; eventType: string }): Promise<DeliveryEndpoint[]> {
  const res = await supabaseAdminFetch("/rest/v1/rpc/automation_list_delivery_endpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_community_id: params.communityId, p_event_type: params.eventType }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DeliveryEndpoint[];
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

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function shouldRetryBrandos(code: number | null): boolean {
  if (code === null) return true; // network error
  if (code === 408 || code === 425 || code === 429) return true;
  return code >= 500;
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    await requireWorkerAuth(req);
    const input = (await req.json().catch(() => ({}))) as WorkerInput;
    const batchSize = Math.max(1, Math.min(Number(input.batch_size ?? 25) || 25, 100));

    const events = await dequeueEvents(batchSize);
    let delivered = 0;
    let failed = 0;

    for (const event of events) {
      const endpoints = await listEndpoints({ communityId: event.community_id, eventType: event.event_type });
      if (!endpoints.length) {
        await finalizeEvent({ eventId: event.event_id, success: true, error: null });
        delivered += 1;
        continue;
      }

      const occurredAt = new Date(event.occurred_at).toISOString();
      const payload = {
        id: event.event_id,
        type: event.event_type,
        community_id: event.community_id,
        occurred_at: occurredAt,
        data: event.payload ?? {},
      };
      const body = JSON.stringify(payload);
      const ts = Math.floor(Date.now() / 1000);

      let eventOk = true;
      let lastError: string | null = null;

      for (const ep of endpoints) {
        const started = Date.now();
        let responseCode: number | null = null;
        let ok = false;
        let error: string | null = null;
        let retryable = true;
        try {
          if (ep.kind === "brandos") {
            const email = String((event.payload as Record<string, unknown>)?.email ?? "").trim();
            const brandosAid = String((event.payload as Record<string, unknown>)?.brandos_aid ?? "").trim();
            const accountId = String(ep.brandos_account_id ?? "").trim();
            if (!email) throw new Error("missing_email");
            if (!accountId || !isUuid(accountId)) throw new Error("missing_brandos_account_id");

            if (!brandosAid || !isUuid(brandosAid)) {
              ok = true; // skip quietly if the event has no attribution token
              retryable = false;
            } else {
              const identifyBody = JSON.stringify({ account_id: accountId, brandos_aid: brandosAid, email });
              const res = await fetchWithTimeout(
                ep.url,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${ep.secret}`,
                    "User-Agent": "Arx-Automations/1.0",
                    "X-Arx-Event-Id": event.event_id,
                    "X-Arx-Event-Type": event.event_type,
                    "X-Arx-Community-Id": event.community_id,
                  },
                  body: identifyBody,
                },
                10_000,
              );
              responseCode = res.status;
              ok = res.ok;
              retryable = shouldRetryBrandos(responseCode);
              if (!res.ok) error = `HTTP ${res.status}`;
            }
          } else {
            const sig = await hmacSha256Hex(ep.secret, `${ts}.${body}`);
            const res = await fetchWithTimeout(
              ep.url,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "User-Agent": "Arx-Automations/1.0",
                  "X-Arx-Event-Id": event.event_id,
                  "X-Arx-Event-Type": event.event_type,
                  "X-Arx-Community-Id": event.community_id,
                  "X-Arx-Signature": `t=${ts},v1=${sig}`,
                },
                body,
              },
              10_000,
            );
            responseCode = res.status;
            ok = res.ok;
            if (!res.ok) error = `HTTP ${res.status}`;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          retryable = true;
          if (ep.kind === "brandos" && (error === "missing_email" || error === "missing_brandos_account_id")) {
            retryable = false;
          }
        }

        const durationMs = Date.now() - started;
        await recordDelivery({
          eventId: event.event_id,
          endpointId: ep.endpoint_id,
          status: ok ? "success" : "fail",
          responseCode,
          durationMs,
          error,
        });

        if (!ok && retryable) {
          eventOk = false;
          lastError = error;
        } else if (!ok && !retryable && lastError === null) {
          lastError = error;
        }
      }

      await finalizeEvent({ eventId: event.event_id, success: eventOk, error: lastError });
      if (eventOk) delivered += 1;
      else failed += 1;
    }

    return jsonResponse({ ok: true, processed: events.length, delivered, failed }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "forbidden" ? 403 : 400;
    return jsonResponse({ ok: false, error: message }, { status, headers });
  }
});
