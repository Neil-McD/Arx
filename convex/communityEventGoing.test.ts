/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

async function seed(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string, name: string) => ctx.db.insert("users", { authSubject: subject, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner", "Neil");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "going", name: "Going", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW });
    for (const [subject, name] of [["jon", "Jon"], ["maya", "Maya"]]) {
      const userId = await user(subject, name);
      await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    }
    await user("stranger", "Stranger");
    const event = (status: "live" | "cancelled") => ctx.db.insert("communityEvents", { communityId, createdByUserId: ownerId, title: "Friday build call",
      startsAt: NOW, timezone: "UTC", locationType: "online", visibility: "members", status, recurrenceFrequency: "weekly", createdAt: NOW, updatedAt: NOW });
    return { communityId, eventId: await event("live"), cancelledId: await event("cancelled") };
  });
}

test("members say they're going to one date; everyone sees the count, faces, their own answer and the host", async () => {
  const t = convexTest(schema, modules);
  const { communityId, eventId } = await seed(t);
  const WEEK = 7 * 86_400_000;
  const jon = t.withIdentity({ subject: "jon" });
  const maya = t.withIdentity({ subject: "maya" });
  await jon.mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId, occurrenceStartsAt: NOW, going: true });
  // Saying it twice counts once.
  await jon.mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId, occurrenceStartsAt: NOW, going: true });
  await maya.mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId, occurrenceStartsAt: NOW, going: true });
  const items = [{ eventId, occurrenceStartsAt: NOW }, { eventId, occurrenceStartsAt: NOW + WEEK }];
  const [thisWeek, nextWeek] = await jon.query(api.communityEventGoing.listCommunityEventGoing, { communityId, items });
  expect(thisWeek).toMatchObject({ count: 2, mine: true, host_name: "Neil" });
  expect(thisWeek.faces.map((face: any) => face.name).sort()).toEqual(["Jon", "Maya"]);
  // Each date of a repeating event is its own answer.
  expect(nextWeek).toMatchObject({ count: 0, mine: false });

  await jon.mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId, occurrenceStartsAt: NOW, going: false });
  const [after] = await maya.query(api.communityEventGoing.listCommunityEventGoing, { communityId, items });
  expect(after).toMatchObject({ count: 1, mine: true });
});

test("only members can answer or look, and never for a cancelled event", async () => {
  const t = convexTest(schema, modules);
  const { communityId, eventId, cancelledId } = await seed(t);
  const stranger = t.withIdentity({ subject: "stranger" });
  await expect(stranger.mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId, occurrenceStartsAt: NOW, going: true })).rejects.toThrow();
  await expect(stranger.query(api.communityEventGoing.listCommunityEventGoing, { communityId, items: [{ eventId, occurrenceStartsAt: NOW }] })).rejects.toThrow();
  await expect(t.withIdentity({ subject: "jon" }).mutation(api.communityEventGoing.setCommunityEventGoing, { communityId, eventId: cancelledId, occurrenceStartsAt: NOW, going: true })).rejects.toThrow(/community_event_cancelled/);
});
