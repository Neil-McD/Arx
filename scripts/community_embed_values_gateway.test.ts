import { beforeEach, expect, test, vi } from "vitest";
import { createServerCommunityEmbedStorage } from "../shared/cloudCommunityEmbedValuesGateway";
import type { CommunityEmbedStorage } from "../shared/communityEmbed";

// One fake server: answers by member, and a switch that takes it offline.
const server = { online: true, values: new Map<string, string>() };
vi.mock("../shared/convexAuthenticatedClient", () => ({
  bootstrapConvexAuthenticatedClient: vi.fn(async (session: { subject: string }) => ({
    authSubject: session.subject,
    client: {
      query: async (_ref: unknown, args: { authSubject: string; key: string }) => {
        if (!server.online) throw new Error("offline");
        return server.values.get(`${args.authSubject}:${args.key}`) ?? null;
      },
      mutation: async (_ref: unknown, args: { authSubject: string; key: string; value: string }) => {
        if (!server.online) throw new Error("offline");
        server.values.set(`${args.authSubject}:${args.key}`, args.value);
        return null;
      },
    },
  })),
  requireConvexUrl: () => "https://fixture.convex.cloud",
}));

const browser = new Map<string, string>();
function browserStorage(scope: string): CommunityEmbedStorage {
  return {
    load: async (key) => browser.get(`${scope}:${key}`) ?? null,
    save: async (key, value) => { browser.set(`${scope}:${key}`, value); return true; },
  };
}
function storageFor(subject: string) {
  return createServerCommunityEmbedStorage({ communityId: "c1", ensureSession: async () => ({ subject }),
    fallback: browserStorage(`c1:user:${subject}`) });
}

beforeEach(() => { server.online = true; server.values.clear(); browser.clear(); });

test("one member's saved answer never reaches another member who opens the widget in the same browser", async () => {
  expect(await storageFor("member-a").save("goal", "A's private answer")).toBe(true);
  expect(await storageFor("member-b").load("goal")).toBeNull();
  expect(server.values.get("member-b:goal")).toBeUndefined();
});

test("a save made offline is sent when the widget next loads, instead of losing to the older server answer", async () => {
  const a = storageFor("member-a");
  await a.save("goal", "first");
  server.online = false;
  expect(await a.save("goal", "second")).toBe(true);
  server.online = true;
  expect(await a.load("goal")).toBe("second");
  expect(server.values.get("member-a:goal")).toBe("second");
  // Once sent, the server answer leads again, so a change from another device shows here.
  server.values.set("member-a:goal", "from phone");
  expect(await a.load("goal")).toBe("from phone");
});
