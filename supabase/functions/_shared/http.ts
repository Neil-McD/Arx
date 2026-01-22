export function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: Record<string, string> } = { status: 200 },
): Response {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    ...(init.headers ?? {}),
  };
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

export function noStoreHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra };
}

export function withCors(
  headers: Record<string, string>,
  req: Request,
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
  };
}

