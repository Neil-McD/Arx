import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { SDK_SOURCE } from "./sdk";

// Loads the exact text the edge serves, fresh for each test.
let loads = 0;
async function loadSdk() {
  const file = join(mkdtempSync(join(tmpdir(), "polynet-sdk-")), `sdk-${++loads}.mjs`);
  writeFileSync(file, SDK_SOURCE);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default;
}

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
function stubFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ url, body });
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return await route(url, init);
  }));
  return calls;
}

const signedIn = () => Response.json({ signed_in: true, community: "run-club", join_url: "https://polynet.example/c/run-club", live: { url: "https://live.example", token: "pnw_x" } });
const ok = (value: unknown) => Response.json({ ok: true, value });

afterEach(() => vi.unstubAllGlobals());

test("posts, replies, reacts and asks the agent through the door on this community's paths", async () => {
  const calls = stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { tool, input } = JSON.parse(String(init.body));
      if (tool === "polynet_list" && input.path === "/communities/run-club/") return ok({ community: { slug: "run-club", name: "Run Club" } });
      return ok({ tool, input });
    },
  });
  const polynet = await loadSdk();
  expect(polynet.version).toBe("1");
  await polynet.session();

  await polynet.post("general", "Morning run at 7");
  await polynet.post("general", "I'm in", { replyTo: "interaction:root:abc123" });
  await polynet.react("interaction:root:abc123", "🔥", true);
  await polynet.post("general", "what's the route?", { askAgent: true });

  const writes = calls.filter((call) => call.body?.tool === "polynet_write").map((call) => call.body.input);
  expect(writes[0]).toMatchObject({ path: "/communities/run-club/channels/general/", mode: "create", content: { text: "Morning run at 7" } });
  expect(writes[1]).toMatchObject({ mode: "append", content: { text: "I'm in", root_id: "abc123" } });
  expect(writes[2]).toMatchObject({ content: { text: "@Run Club what's the route?", mentions: [{ agentKey: "community_agent" }] } });
  for (const input of writes) expect(input.idempotency_key).toMatch(/^[a-f0-9]{32}$/);
  const reaction = calls.find((call) => call.body?.tool === "polynet_call")!.body.input;
  expect(reaction).toMatchObject({
    target: "/communities/run-club/capabilities/community.interaction.react.json", operation: "community.interaction.react",
    version: 1, input: { ref: "interaction:root:abc123", emoji: "🔥", on: true },
  });
});

test("feed returns posts oldest first; errors surface as PolynetError", async () => {
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/api": (_url, init) => {
      const { input } = JSON.parse(String(init.body));
      if (input.path.endsWith("/missing/")) return Response.json({ ok: false, code: "semantic_not_found", message: "Not found." });
      return ok({ entries: [
        { ref: "interaction:root:2", object_type: "root" },
        { ref: "interaction:reply:9", object_type: "reply" },
        { ref: "interaction:root:1", object_type: "root" },
      ] });
    },
  });
  const polynet = await loadSdk();
  await polynet.session();
  expect((await polynet.feed("general")).map((entry: any) => entry.ref)).toEqual(["interaction:root:1", "interaction:root:2"]);
  await expect(polynet.feed("missing")).rejects.toMatchObject({ name: "PolynetError", code: "semantic_not_found" });
});

test("a signed-out member gets sign_in_required", async () => {
  stubFetch({
    "/__polynet/auth/session": () => Response.json({ signed_in: false, community: "run-club", join_url: "x" }),
    "/__polynet/api": () => Response.json({ ok: false, code: "sign_in_required" }, { status: 401 }),
  });
  const polynet = await loadSdk();
  await polynet.session();
  await expect(polynet.channels()).rejects.toMatchObject({ code: "sign_in_required", status: 401 });
});

test("askAgent streams the reply", async () => {
  const sse = "event: start\ndata: {}\n\nevent: delta\ndata: {\"delta\":\"Hi \"}\n\nevent: delta\ndata: {\"delta\":\"there\"}\n\nevent: done\ndata: {\"full_content\":\"Hi there\"}\n\n";
  stubFetch({
    "/__polynet/auth/session": signedIn,
    "/__polynet/agent": () => new Response(sse, { headers: { "content-type": "text/event-stream" } }),
  });
  const polynet = await loadSdk();
  const seen: string[] = [];
  expect(await polynet.askAgent("hello", { onDelta: (text: string) => seen.push(text) })).toBe("Hi there");
  expect(seen).toEqual(["Hi ", "Hi there", "Hi there"]);
});

test("watch subscribes to this channel's live signal with the watch token", async () => {
  stubFetch({ "/__polynet/auth/session": signedIn });
  const subscriptions: Array<{ name: string; args: any }> = [];
  vi.stubGlobal("convex", {
    ConvexClient: class {
      constructor(public url: string) {}
      onUpdate(name: string, args: any, callback: (result: any) => void) {
        subscriptions.push({ name, args });
        callback({ ok: true, version: 1 });
        return () => undefined;
      }
      close() {}
    },
  });
  const polynet = await loadSdk();
  let changes = 0;
  await polynet.watch("general", () => { changes += 1; });
  expect(subscriptions).toEqual([{ name: "communityLive:watch", args: { token: "pnw_x", path: "/communities/run-club/channels/general/" } }]);
  expect(changes).toBe(1);
});
