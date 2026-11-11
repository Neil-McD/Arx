/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;
const DAY = 86_400_000;

async function seed(t: any) {
  return await t.run(async (ctx: any) => {
    const user = (subject: string, name: string) => ctx.db.insert("users", { authSubject: subject, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner", "Neil");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "records", name: "Records", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 6, createdAt: NOW - 90 * DAY, updatedAt: NOW });
    const price = (name: string, amount: number, isCurrent: boolean) => ctx.db.insert("communityPricePoints", { communityId, billingPeriod: "monthly",
      name, amountBaseUnits: amount, currency: "usd", currencyDecimals: 2, isCurrent, createdAt: NOW, updatedAt: NOW });
    const founding = await price("Founding", 700, false);
    const member = await price("Member", 2700, true);
    const join = async (subject: string, name: string, extra: Record<string, unknown>) => {
      const userId = await user(subject, name);
      const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", state: "active", createdAt: NOW - 10 * DAY, updatedAt: NOW, ...extra });
      return { userId, membershipId };
    };
    const sub = (m: { userId: any; membershipId: any }, pricePointId: any, status: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("communitySubscriptions", { communityId, userId: m.userId, membershipId: m.membershipId, pricePointId, status,
        cancelAtPeriodEnd: status === "cancel_at_period_end", currentPeriodEndAt: NOW + 5 * DAY, createdAt: NOW, updatedAt: NOW, ...extra });

    const jon = await join("jon", "Jon", { accessSource: "paid_subscription", pricePointId: founding });
    await sub(jon, founding, "active");
    const tanya = await join("tanya", "Tanya", { accessSource: "paid_subscription", pricePointId: member, state: "payment_hold" });
    await sub(tanya, member, "past_due");
    const rashid = await join("rashid", "Rashid", { accessSource: "paid_subscription", pricePointId: member });
    await sub(rashid, member, "cancel_at_period_end", { cancelRequestedAt: NOW - DAY });
    const martin = await join("martin", "Martin", { accessSource: "manual_grant", role: "moderator" });
    await join("ana", "Ana", { accessSource: "paid_subscription", pricePointId: founding, state: "left", revokedAt: NOW - 3 * DAY });
    const lee = await join("lee", "Lee", { accessSource: "free_grant", state: "removed", revokedAt: NOW - 4 * DAY });
    await ctx.db.insert("communityBlocks", { communityId, userId: lee.userId, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW });
    const dana = await user("dana", "Dana");
    await ctx.db.insert("communityJoinRequests", { communityId, userId: dana, status: "denied", deniedAt: NOW - 6 * DAY, createdAt: NOW - 7 * DAY, updatedAt: NOW });

    const fact = (userId: any, kind: string, body: string, provenance: string, consentState: string) => ctx.db.insert("memberFacts", {
      userId, communityId, kind, body, provenance, consentState, confidence: 1, evidenceRefs: [], stalenessScore: 0,
      createdByActorType: "member", version: 1, createdAt: NOW, updatedAt: NOW });
    await fact(tanya.userId, "goal", "Finding her first ten members", "stated_interview", "approved");
    await fact(tanya.userId, "interest", "Restaurant owners", "inferred_agent", "pending");
    await fact(tanya.userId, "skill", "Watches what others post", "observed_behavior", "agent_internal");
    return { communityId, founding, member, tanya, martin };
  });
}

test("the host sees every way someone is in, at which price, and who needs them", async () => {
  const t = convexTest(schema, modules);
  const { communityId, founding, member } = await seed(t);
  const list = await t.withIdentity({ subject: "owner" }).query(api.communityMemberRecords.listCommunityMemberRecords, { communityId });
  const by = (name: string) => list.rows.find((row: any) => row.name === name);

  expect(by("Neil")).toMatchObject({ role: "owner", plan: { kind: "owner", label: "Owner" } });
  // A raised price keeps its people: $7 and $27 side by side.
  expect(by("Jon")?.plan).toMatchObject({ kind: "paid", label: "Founding · $7", price_point_id: String(founding) });
  expect(by("Tanya")?.plan.label).toBe("Member · $27");
  expect(by("Tanya")?.money).toMatchObject({ kind: "on_hold" });
  expect(by("Rashid")?.money).toMatchObject({ kind: "cancelling" });
  expect(by("Martin")).toMatchObject({ role: "moderator", plan: { kind: "comped", label: "Comped" } });
  expect(by("Tanya")?.working_on).toBe("Finding her first ten members");
  expect(list.rows.map((row: any) => row.name)).not.toContain("Ana");

  // A view per price that has people on it, including one no longer offered.
  expect(list.prices).toEqual(expect.arrayContaining([
    expect.objectContaining({ price_point_id: String(founding), label: "Founding · $7", count: 1, current: false }),
    expect.objectContaining({ price_point_id: String(member), label: "Member · $27", count: 2, current: true }),
  ]));

  // People who are out never vanish.
  const past = Object.fromEntries(list.past.map((row: any) => [row.name, row.reason]));
  expect(past).toEqual({ Ana: "left", Lee: "blocked", Dana: "declined" });
  expect(list.capped).toBe(false);
});

test("the record shows only what the member approved, each with where it came from", async () => {
  const t = convexTest(schema, modules);
  const { communityId, tanya } = await seed(t);
  const record = await t.withIdentity({ subject: "owner" }).query(api.communityMemberRecords.getCommunityMemberRecord, { communityId, membershipId: tanya.membershipId });
  expect(record).toMatchObject({ name: "Tanya", plan: { label: "Member · $27" }, money: { kind: "on_hold" } });
  expect(record?.facts).toEqual([expect.objectContaining({ label: "Working on", body: "Finding her first ten members", source: "Said to the guide" })]);
  const text = JSON.stringify(record);
  // A guess waits for her; what is only observed stays with the agent.
  expect(text).not.toContain("Restaurant owners");
  expect(text).not.toContain("Watches what others post");
  expect(record?.events[0]).toMatchObject({ kind: "joined", text: "Joined on Member · $27" });
});

test("only people who manage members can read plans, prices and payments", async () => {
  const t = convexTest(schema, modules);
  const { communityId, tanya } = await seed(t);
  const asMember = t.withIdentity({ subject: "jon" });
  await expect(asMember.query(api.communityMemberRecords.listCommunityMemberRecords, { communityId })).rejects.toThrow(/community_forbidden/);
  await expect(asMember.query(api.communityMemberRecords.getCommunityMemberRecord, { communityId, membershipId: tanya.membershipId })).rejects.toThrow(/community_forbidden/);
  // A moderator moderates content; they don't see what people pay.
  await expect(t.withIdentity({ subject: "martin" }).query(api.communityMemberRecords.listCommunityMemberRecords, { communityId })).rejects.toThrow(/community_forbidden/);
});
