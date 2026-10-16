// Polynet community edge: the one Worker in front of every community front end.
//
//   /__polynet/api   same-origin proxy to the Polynet backend (Convex /runtime/app)
//   everything else  the community's own front end (a user Worker with static assets)
//
// Production reaches user Workers through a Workers for Platforms dispatch
// namespace. Local dev reaches the single hello Worker through a service binding,
// because wrangler cannot run namespace user Workers locally.

type Fetcher = { fetch(request: Request): Promise<Response> };

export interface Env {
  POLYNET_API_URL: string;
  DISPATCHER?: { get(scriptName: string): Fetcher };
  ROUTES?: { get(key: string): Promise<string | null> };
  DEV_ROUTES_JSON?: string;
  DEV_USER_WORKER?: Fetcher;
}

const API_PREFIX = "/__polynet/api";
const MAX_API_BODY_BYTES = 64 * 1024;

async function resolveScriptName(hostname: string, env: Env): Promise<string | null> {
  const host = hostname.toLowerCase();
  if (env.ROUTES) return await env.ROUTES.get(`host:${host}`);
  if (env.DEV_ROUTES_JSON) {
    const routes = JSON.parse(env.DEV_ROUTES_JSON) as Record<string, string>;
    return routes[host] ?? null;
  }
  return null;
}

function userWorker(scriptName: string, env: Env): Fetcher | null {
  if (env.DISPATCHER) return env.DISPATCHER.get(scriptName);
  return env.DEV_USER_WORKER ?? null;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// The browser talks only to its own community origin. The edge forwards the
// call server-side, so app code never handles cross-origin requests.
async function proxyApi(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
  const body = await request.text();
  if (body.length > MAX_API_BODY_BYTES) return json(413, { ok: false, code: "request_too_large" });
  const headers = new Headers({ "Content-Type": "application/json", Origin: url.origin });
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app`, {
    method: "POST",
    headers,
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const scriptName = await resolveScriptName(url.hostname, env);
    if (!scriptName) return new Response("Community not found", { status: 404 });
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return await proxyApi(request, url, env);
    }
    const worker = userWorker(scriptName, env);
    if (!worker) return new Response("Community front end unavailable", { status: 503 });
    return await worker.fetch(request);
  },
};
