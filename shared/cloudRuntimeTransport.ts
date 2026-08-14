import { readConvexRuntimeUrl } from "./convexRuntime";

export type CloudRuntimeTransport<SessionT> = {
  baseUrl: string;
  fetchAuth: (input: string, init: RequestInit, session: SessionT) => Promise<Response>;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function requireCloudRuntimeBaseUrl(readBaseUrl: () => string | null): string {
  const raw = String(readConvexRuntimeUrl() ?? readBaseUrl() ?? "").trim();
  if (!raw) {
    throw new Error("Missing cloud runtime base URL.");
  }
  return trimTrailingSlashes(raw);
}

function buildConvexRuntimeUrl(baseUrl: string, routePath: string): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${trimTrailingSlashes(baseUrl)}${route}`;
}

export async function invokeCloudRuntimeTurn<SessionT>(params: {
  transport: CloudRuntimeTransport<SessionT>;
  session: SessionT;
  payload: unknown;
  signal?: AbortSignal;
}): Promise<Response> {
  return await params.transport.fetchAuth(
    buildConvexRuntimeUrl(params.transport.baseUrl, "/runtime/runtime_turn"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.payload),
      ...(params.signal ? { signal: params.signal } : null),
    },
    params.session,
  );
}
