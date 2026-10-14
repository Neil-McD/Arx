import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { bootstrapSessionDetailed, logoutAuthSessionRemote, refreshAuthSessionResult } from "../shared/authCore";

const session = { access_token: "synthetic-access", expires_at: 2_000_000_000, user: { id: "fixture-user" } };
const consumers = [
  { name: "bootstrap", run: bootstrapSessionDetailed, payload: { session } },
  { name: "refresh", run: refreshAuthSessionResult, payload: { session } },
  { name: "logout", run: logoutAuthSessionRemote, payload: { ok: true } },
] as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: { origin: "https://synthetic.invalid" }, setTimeout, clearTimeout });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function bodyResponse(signal: AbortSignal, status = 200) {
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const abort = () => body.error(new DOMException("The operation was aborted", "AbortError"));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      body = controller;
      controller.enqueue(new TextEncoder().encode("{"));
      signal.addEventListener("abort", abort, { once: true });
    },
  });
  return {
    response: new Response(stream, { status }),
    finish(payload: unknown) {
      signal.removeEventListener("abort", abort);
      body.enqueue(new TextEncoder().encode(JSON.stringify(payload).slice(1)));
      body.close();
    },
  };
}

test.each(consumers)("$name remains bounded when headers arrive but the body stalls", async consumer => {
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    signal = init.signal!;
    return bodyResponse(signal).response;
  }));
  let settled = false;
  const pending = consumer.run().then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
  await vi.advanceTimersByTimeAsync(9_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(signal.aborted).toBe(true);
  if (consumer.name === "refresh") expect(result).toMatchObject({ value: { status: "transient_failure", reason: "invalid_refresh_response" } });
  else expect(result).toHaveProperty("error");
  expect(vi.getTimerCount()).toBe(0);
});

test.each(consumers)("$name accepts a body completed before the original deadline", async consumer => {
  let signal!: AbortSignal;
  let body!: ReturnType<typeof bodyResponse>;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    signal = init.signal!;
    body = bodyResponse(signal);
    return body.response;
  }));
  const pending = consumer.run();
  await vi.advanceTimersByTimeAsync(9_000);
  body.finish(consumer.payload);
  const result = await pending;
  if (consumer.name === "bootstrap") expect(result).toMatchObject({ session });
  if (consumer.name === "refresh") expect(result).toMatchObject({ status: "refreshed", session });
  if (consumer.name === "logout") expect(result).toBeUndefined();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test.each([401, 503])("refresh retains HTTP %s classification when its error body stalls", async status => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => bodyResponse(init.signal!, status).response));
  const pending = refreshAuthSessionResult();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toEqual({ status: status === 401 ? "terminal_failure" : "transient_failure", reason: `Cloud error (${status})` });
});

test("logout shares one deadline across delayed headers and body consumption", async () => {
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
    signal = init.signal!;
    return new Promise(resolve => setTimeout(() => resolve(bodyResponse(signal).response), 8_000));
  }));
  let settled = false;
  const pending = logoutAuthSessionRemote().catch(error => { settled = true; return error; });
  await vi.advanceTimersByTimeAsync(9_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ message: "Sign out couldn't be confirmed. Try again." });
  expect(signal.aborted).toBe(true);
});

test.each(consumers.slice(0, 2))("$name remains bounded before any response headers", async consumer => {
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })));
  const pending = consumer.run().then(value => ({ value }), error => ({ error }));
  await vi.advanceTimersByTimeAsync(10_000);
  const result = await pending;
  if (consumer.name === "refresh") expect(result).toEqual({ value: { status: "transient_failure", reason: "auth_gateway_unavailable" } });
  else expect(result).toMatchObject({ error: { message: "Auth gateway is unavailable." } });
});

test.each([401, 503])("refresh preserves a completed HTTP %s error body", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "canonical-error" }), { status })));
  expect(await refreshAuthSessionResult()).toEqual({ status: status === 401 ? "terminal_failure" : "transient_failure", reason: "canonical-error" });
  expect(vi.getTimerCount()).toBe(0);
});

test("malformed refresh success is transient and bootstrap preserves provider errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid", { status: 200 })));
  expect(await refreshAuthSessionResult()).toEqual({ status: "transient_failure", reason: "invalid_refresh_response" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bootstrap-rejected" }), { status: 503 })));
  await expect(bootstrapSessionDetailed()).rejects.toThrow("bootstrap-rejected");
});
