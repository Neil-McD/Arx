/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./communityEvents.ts", "./_generated/**/*.*s"]);
const start = Date.parse("2026-10-01T00:00:00Z");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", { authSubject: "events-owner", createdAt: start, updatedAt: start });
    const otherId = await db.insert("users", { authSubject: "events-other", createdAt: start, updatedAt: start });
    const communityId = await db.insert("communities", {
      ownerId, slug: "event-window", name: "Events", visibility: "unlisted", entryPolicy: "open",
      inferenceFundingPolicy: "managed_required", createdAt: 1_750_000_000_000, updatedAt: start,
    });
    return { ownerId, otherId, communityId };
  });
  const add = (offset: number, endOffset?: number, extra: Record<string, unknown> = {}) => t.run(({ db }) => db.insert("communityEvents", {
    communityId: ids.communityId, createdByUserId: ids.ownerId, title: String(offset),
    startsAt: start + offset, ...(endOffset === undefined ? {} : { endsAt: start + endOffset }),
    timezone: "UTC", locationType: "online", visibility: "members", status: "live",
    createdAt: start, updatedAt: start, ...extra,
  } as any));
  const read = (extra = {}) => t.withIdentity({ subject: "events-owner" }).query(api.communityEvents.listCommunityEvents, {
    communityId: ids.communityId, startIso: new Date(start).toISOString(),
    endIso: new Date(start + 86400000).toISOString(), overlap: true, ...extra,
  });
  return { t, ids, add, read };
}

test("overlap includes carry-over events, uses half-open boundaries, and preserves default callers", async () => {
  const f = await fixture();
  await f.add(-7200000, 3600000);
  await f.add(-1800000); // unknown end uses the shared one-hour display window
  await f.add(-3600000, 0); // ends exactly at range start
  await f.add(0, 1800000);
  await f.add(86400000, 90000000); // begins exactly at range end
  await f.add(1000, 2000, { status: "cancelled" });
  const rows = await f.read();
  expect(rows.map((row) => row.title)).toEqual(["-7200000", "-1800000", "0"]);
  expect(rows[1].ends_at).toBeNull();
  const legacy = await f.read({ overlap: false });
  expect(legacy.map((row) => row.title)).toEqual(["0", "86400000"]);
});

test("recurring carry-over occurrences are deduplicated and retain series identity", async () => {
  const f = await fixture();
  const id = await f.add(-86400000 - 1800000, -86400000 + 1800000, { recurrenceFrequency: "daily", recurrenceInterval: 1 });
  const rows = await f.read();
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  expect(rows.every((row) => row.parent_event_id === id)).toBe(true);
  expect(rows[0].starts_at).toBe(new Date(start - 1800000).toISOString());
});

test("overlap rejects truncated results and unauthorized reads", async () => {
  const f = await fixture();
  await f.add(0, 1000);
  await f.add(2000, 3000);
  await expect(f.read({ limit: 1 })).rejects.toThrow("Too many events");
  await expect(f.t.withIdentity({ subject: "events-other" }).query(api.communityEvents.listCommunityEvents, {
    communityId: f.ids.communityId, overlap: true,
    startIso: new Date(start).toISOString(), endIso: new Date(start + 86400000).toISOString(),
  })).rejects.toThrow();
});

test("weekly occurrence clocks survive DST and cancelled series stay excluded", async () => {
  const f = await fixture();
  const initial = Date.parse("2026-10-25T13:00:00Z");
  await f.add(initial - start, initial - start + 3600000, {
    timezone: "America/New_York", recurrenceFrequency: "weekly", recurrenceInterval: 1,
  });
  const rows = await f.read({ startIso: "2026-11-01T14:30:00Z", endIso: "2026-11-09T00:00:00Z" });
  expect(rows.map((row) => row.starts_at)).toEqual(["2026-11-01T14:00:00.000Z", "2026-11-08T14:00:00.000Z"]);
});
