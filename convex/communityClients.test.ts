/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  communityClientPropertyKey,
  deriveCommunityClientStatus,
  deriveCommunityClientStuck,
  normalizeCommunityClientPropertyDraft,
  normalizeCommunityClientPropertyValue,
} from "../shared/communityClients";
import { applyCommunityClientView, communityClientFields, normalizeCommunityClientView, groupCommunityClients, personalizeCommunityClientMessage } from "../shared/communityClientViews";

const modules = import.meta.glob([
  "./communityClients.ts",
  "./directMessages.ts",
  "./directMessageEmails.ts",
  "./_generated/**/*.*s",
]);

const DAY = 24 * 60 * 60 * 1000;

describe("client property rules", () => {
  test("keys come from names", () => {
    expect(communityClientPropertyKey("Business offer")).toBe("business_offer");
    expect(communityClientPropertyKey("  ")).toBe("property");
  });

  test("select needs options; other types refuse them", () => {
    expect(normalizeCommunityClientPropertyDraft({ name: " Tier ", type: "select", options: ["VIP", " Standard "] }))
      .toEqual({ name: "Tier", type: "select", options: ["VIP", "Standard"] });
    expect(() => normalizeCommunityClientPropertyDraft({ name: "Tier", type: "select" })).toThrow("client_property_options_invalid");
    expect(() => normalizeCommunityClientPropertyDraft({ name: "Notes", type: "text", options: ["x"] })).toThrow("client_property_options_not_allowed");
    expect(() => normalizeCommunityClientPropertyDraft({ name: "Notes", type: "formula" })).toThrow("client_property_type_invalid");
    expect(() => normalizeCommunityClientPropertyDraft({ name: "Tier", type: "select", options: ["VIP", "vip"] })).toThrow("client_property_options_duplicate");
  });

  test("values are checked against their property", () => {
    const tags = { key: "tags", name: "Tags", type: "multi_select" as const, options: ["Hot", "Cold", "Partner"] };
    expect(normalizeCommunityClientPropertyValue(tags, ["partner", "hot"])).toEqual(["Hot", "Partner"]);
    expect(normalizeCommunityClientPropertyValue(tags, [])).toBeNull();
    expect(() => normalizeCommunityClientPropertyValue(tags, ["Warm"])).toThrow("client_property_value_invalid");
    const due = { key: "due", name: "Due", type: "date" as const, options: [] };
    expect(normalizeCommunityClientPropertyValue(due, "2026-10-29")).toBe("2026-10-29");
    expect(() => normalizeCommunityClientPropertyValue(due, "2026-02-30")).toThrow();
    const site = { key: "site", name: "Site", type: "url" as const, options: [] };
    expect(() => normalizeCommunityClientPropertyValue(site, "javascript:alert(1)")).toThrow();
    const notes = { key: "notes", name: "Notes", type: "text" as const, options: [] };
    expect(normalizeCommunityClientPropertyValue(notes, "   ")).toBeNull();
    expect(normalizeCommunityClientPropertyValue(notes, null)).toBeNull();
  });

  test("status reads membership first, then billing", () => {
    expect(deriveCommunityClientStatus({ active: true, subscription: null })).toBe("active");
    expect(deriveCommunityClientStatus({ active: true, subscription: { status: "active", cancelAtPeriodEnd: true } })).toBe("cancelling");
    expect(deriveCommunityClientStatus({ active: true, subscription: { status: "past_due", cancelAtPeriodEnd: false } })).toBe("past_due");
    expect(deriveCommunityClientStatus({ active: false, subscription: { status: "canceled", cancelAtPeriodEnd: false } })).toBe("cancelled");
    expect(deriveCommunityClientStatus({ active: false, subscription: null })).toBe("previous");
  });

  test("stuck defaults to seven days without progress and can be changed", () => {
    const nowMs = 100 * DAY;
    expect(deriveCommunityClientStuck({ active: true, lastProgressAtMs: nowMs - 7 * DAY, nowMs })).toBe(true);
    expect(deriveCommunityClientStuck({ active: true, lastProgressAtMs: nowMs - 6 * DAY, nowMs })).toBe(false);
    expect(deriveCommunityClientStuck({ active: true, lastProgressAtMs: nowMs - 6 * DAY, nowMs, days: 3 })).toBe(true);
    expect(deriveCommunityClientStuck({ active: false, lastProgressAtMs: 0, nowMs })).toBe(false);
  });
});

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = async (subject: string, handle: string) => {
      const userId = await ctx.db.insert("users", {
        authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      });
      return userId;
    };
    const ownerId = await user("clients-owner", "owner");
    const activeId = await user("clients-active", "thomas");
    const stuckId = await user("clients-stuck", "dean");
    const leftId = await user("clients-left", "former");
    const outsiderId = await user("clients-outsider", "outsider");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "aieb", name: "AI Employee Builders", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: nowMs, updatedAt: nowMs,
    });
    const member = (userId: any, extra: Record<string, unknown>) => ctx.db.insert("communityMemberships", {
      communityId, userId, role: "member", accessSource: "paid_subscription", active: true, activationSequence: 1,
      activatedAt: nowMs - DAY, createdAt: nowMs - DAY, updatedAt: nowMs - DAY, ...extra,
    });
    const activeMembership = await member(activeId, {});
    const stuckMembership = await member(stuckId, { activatedAt: nowMs - 20 * DAY, createdAt: nowMs - 20 * DAY });
    const leftMembership = await member(leftId, { active: false, revokedAt: nowMs - 2 * DAY });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "month", name: "Monthly", amountBaseUnits: 13000, currency: "usd", currencyDecimals: 2,
      isCurrent: true, createdAt: nowMs, updatedAt: nowMs,
    });
    const subscription = (userId: any, membershipId: any, status: any, cancelAtPeriodEnd = false) =>
      ctx.db.insert("communitySubscriptions", {
        communityId, userId, membershipId, pricePointId, source: "stripe", status, cancelAtPeriodEnd, createdAt: nowMs, updatedAt: nowMs,
      });
    await subscription(activeId, activeMembership, "active", true);
    await subscription(leftId, leftMembership, "canceled");
    await ctx.db.insert("memberFacts", {
      contextKind: "profile", userId: activeId, communityId, kind: "situation", body: "Runs a dental practice",
      provenance: "form_answer", confidence: 1, evidenceRefs: [], stalenessScore: 0, consentState: "approved",
      createdByActorType: "member", version: 1, createdAt: nowMs, updatedAt: nowMs,
    } as any);
    await ctx.db.insert("memberFacts", {
      contextKind: "profile", userId: activeId, communityId, kind: "interest", body: "Inferred, not yet approved",
      provenance: "inferred_agent", confidence: 0.5, evidenceRefs: [], stalenessScore: 0, consentState: "pending",
      createdByActorType: "agent", version: 1, createdAt: nowMs, updatedAt: nowMs,
    } as any);
    return { ownerId, outsiderId, communityId, activeMembership, stuckMembership, leftMembership };
  });
  return { t, ...ids, asOwner: t.withIdentity({ subject: "clients-owner" }), asOutsider: t.withIdentity({ subject: "clients-outsider" }) };
}

describe("client list", () => {
  test("owner defines properties, sets values and reads every client", async () => {
    const f = await fixture();
    const communityId = f.communityId;
    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Tier", type: "select", options: ["VIP", "Standard"] });
    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Notes", type: "text" });
    await expect(f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "notes", type: "text" }))
      .rejects.toThrow("client_property_name_taken");
    await f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId, membershipId: String(f.activeMembership), key: "tier", value: "vip" });
    await f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId, membershipId: String(f.leftMembership), key: "notes", value: "Asked to rejoin in January" });
    await expect(f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId, membershipId: String(f.activeMembership), key: "tier", value: "Gold" })).rejects.toThrow("client_property_value_invalid");

    const list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    expect(list.properties.map((property: any) => property.key)).toEqual(["tier", "notes"]);
    const byName = Object.fromEntries(list.clients.map((client: any) => [client.name, client]));
    expect(byName.thomas).toMatchObject({ status: "cancelling", stuck: false, properties: { tier: "VIP", notes: null },
      facts: [{ kind: "situation", body: "Runs a dental practice", provenance: "form_answer" }] });
    expect(byName.dean).toMatchObject({ status: "active", stuck: true, subscription: null });
    expect(byName.former).toMatchObject({ status: "cancelled", stuck: false, properties: { notes: "Asked to rejoin in January" } });
    expect(byName.former.left_at).not.toBeNull();

    // A shorter stuck rule catches more members; the default is seven days.
    expect(list.stuck_days).toBe(7);
    const preview = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId, stuckDays: 1 });
    expect(preview.clients.find((client: any) => client.name === "thomas").stuck).toBe(true);
    await f.asOwner.mutation(api.communityClients.setClientSettings, { communityId, stuckDays: 30 });
    const relaxed = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    expect(relaxed.stuck_days).toBe(30);
    expect(relaxed.clients.find((client: any) => client.name === "dean").stuck).toBe(false);
  });

  test("an option removed from a select reads as empty, and archived properties disappear", async () => {
    const f = await fixture();
    const communityId = f.communityId;
    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Tier", type: "select", options: ["VIP", "Standard"] });
    await f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId, membershipId: String(f.activeMembership), key: "tier", value: "VIP" });
    await f.asOwner.mutation(api.communityClients.updateClientProperty, { communityId, key: "tier", options: ["Standard"] });
    let list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    expect(list.clients.find((client: any) => client.name === "thomas").properties.tier).toBeNull();
    await f.asOwner.mutation(api.communityClients.archiveClientProperty, { communityId, key: "tier" });
    list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    expect(list.properties).toEqual([]);
    // A new property with the same name gets a fresh key, so old values never come back.
    const created = await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Tier", type: "text" });
    expect(created.property.key).toBe("tier_2");
  });

  test("only owners and admins can read or change clients", async () => {
    const f = await fixture();
    await expect(f.asOutsider.query(api.communityClients.listClientsForOwner, { communityId: f.communityId })).rejects.toThrow();
    await expect(f.asOutsider.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Tier", type: "text" }))
      .rejects.toThrow();
  });

  test("a client's timeline joins every record, and the action log shows who contacted them", async () => {
    const f = await fixture();
    const communityId = f.communityId;
    await f.t.run(async (ctx) => {
      const now = Date.now();
      const membership = (await ctx.db.get(f.activeMembership))!;
      const moduleId = await ctx.db.insert("communityResourceModules", {
        communityId, createdByUserId: f.ownerId, status: "live", name: "Get set up", sortOrder: 1, createdAt: now, updatedAt: now,
      });
      const resourceId = await ctx.db.insert("communityResources", {
        communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
        title: "Install Claude Code", bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder: 1, createdAt: now, updatedAt: now,
      } as any);
      await ctx.db.insert("communityResourceProgress", {
        communityId, userId: membership.userId, resourceId, status: "done", startedAt: now - 3000, completedAt: now - 1000,
        responses: [{ element: "installed", value: true, complete: true, at: now - 2000 }], updatedAt: now - 1000,
      });
    });
    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Tier", type: "select", options: ["VIP"] });
    await f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId, membershipId: String(f.activeMembership), key: "tier", value: "VIP" });
    await f.asOwner.mutation(api.communityClients.recordClientEvent, {
      communityId, membershipId: String(f.activeMembership), type: "contacted", channel: "email", body: "Sent the setup checklist" });
    await expect(f.asOwner.mutation(api.communityClients.recordClientEvent, {
      communityId, membershipId: String(f.activeMembership), type: "note" })).rejects.toThrow("client_event_body_invalid");
    await expect(f.asOwner.mutation(api.communityClients.recordClientEvent, {
      communityId, membershipId: String(f.activeMembership), type: "note", body: "x", channel: "email" })).rejects.toThrow("client_event_channel_invalid");

    const timeline = await f.asOwner.query(api.communityClients.getClientTimeline, { communityId, membershipId: String(f.activeMembership) });
    const types = timeline.entries.map((entry: any) => entry.type);
    expect(types).toEqual(expect.arrayContaining(["joined", "lesson_started", "lesson_answered", "lesson_done", "subscription_started",
      "property_set", "contacted"]));
    expect(timeline.entries.find((entry: any) => entry.type === "lesson_done")!.summary).toBe("Finished Install Claude Code");
    expect(timeline.entries.find((entry: any) => entry.type === "contacted")!.summary).toBe("Owner contacted by email: Sent the setup checklist");
    const sorted = [...timeline.entries].sort((a: any, b: any) => b.at.localeCompare(a.at));
    expect(timeline.entries).toEqual(sorted);

    const list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    const thomas = list.clients.find((client: any) => client.name === "thomas");
    expect(thomas.last_contacted_at).not.toBeNull();
    expect(thomas.last_flagged_at).toBeNull();
    expect(thomas.courses).toMatchObject([{ name: "Get set up", lesson_count: 1, done_count: 1, percent: 100 }]);

    // Plenty of later bookkeeping doesn't hide the contact.
    await f.t.run(async (ctx) => {
      const later = Date.now() + 1000;
      for (let i = 0; i < 60; i++) await ctx.db.insert("communityClientEvents", { communityId, membershipId: f.activeMembership,
        type: "property_set", actorUserId: f.ownerId, via: "workflow", propertyKey: "tier", value: "VIP", createdAt: later + i });
    });
    const after = (await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId })).clients
      .find((client: any) => client.name === "thomas");
    expect(after.last_contacted_at).toBe(thomas.last_contacted_at);
  });
});

describe("views and bulk actions", () => {
  test("default views read without writing; the first change copies them in and can then be edited or deleted", async () => {
    const f = await fixture();
    const communityId = f.communityId;
    const first = await f.asOwner.query(api.communityClients.listClientViews, { communityId });
    expect(first.views.map((view: any) => view.key)).toEqual(["all", "stuck", "not_seen", "just_finished", "about_to_cancel", "cancelled", "previous"]);
    expect(first.fields.some((field: any) => field.key === "last_seen_at")).toBe(true);
    expect(await f.t.run((ctx) => ctx.db.query("communityClientViews").collect())).toEqual([]);

    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Tier", type: "select", options: ["VIP", "Standard"] });
    const saved = await f.asOwner.mutation(api.communityClients.saveClientView, { communityId,
      view: { name: "VIPs", columns: ["status", "prop:tier"], filters: [{ field: "prop:tier", op: "is", value: ["VIP"] }], sort: { field: "joined_at", direction: "desc" } } });
    expect(saved.view.key).toBe("vips");
    await expect(f.asOwner.mutation(api.communityClients.saveClientView, { communityId,
      view: { name: "Typo", filters: [{ field: "prop:teir", op: "is", value: ["VIP"] }] } })).rejects.toThrow("client_view_invalid");
    await f.asOwner.mutation(api.communityClients.deleteClientView, { communityId, key: "previous" });
    const after = await f.asOwner.query(api.communityClients.listClientViews, { communityId });
    expect(after.views.map((view: any) => view.key)).toEqual(["all", "stuck", "not_seen", "just_finished", "about_to_cancel", "cancelled", "vips"]);
    await expect(f.asOutsider.mutation(api.communityClients.saveClientView, { communityId, view: { name: "Mine" } })).rejects.toThrow();
  });

  test("the list's rows filter the same way the page and the agent read a view", async () => {
    const f = await fixture();
    const communityId = f.communityId;
    const list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
    const { views } = await f.asOwner.query(api.communityClients.listClientViews, { communityId });
    const names = (key: string) => applyCommunityClientView(list.clients, views.find((view: any) => view.key === key), Date.now())
      .map((client: any) => client.name).sort();
    expect(names("stuck")).toEqual(["dean"]);
    expect(names("about_to_cancel")).toEqual(["thomas"]);
    expect(names("cancelled")).toEqual(["former"]);
    // Nobody has opened the community yet, so everyone still here counts as not seen.
    expect(names("not_seen")).toEqual(["dean", "thomas"]);
  });

  test("a bulk action sets a property, flags and messages each selected member, and logs it on their timeline", async () => {
    vi.useFakeTimers();
    try {
      const f = await fixture();
      const communityId = f.communityId;
      await f.t.run(async (ctx) => {
        await ctx.db.insert("communityMemberships", { communityId, userId: f.ownerId, role: "admin", active: true,
          activationSequence: 1, activatedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() } as any);
      });
      await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId, name: "Cohort", type: "select", options: ["October", "November"] });
      const ids = [String(f.activeMembership), String(f.stuckMembership)];
      const run = async (action: any) => {
        const started = await f.asOwner.mutation(api.communityClients.runClientBulkAction, { communityId, action, membershipIds: ids });
        await f.t.finishAllScheduledFunctions(vi.runAllTimers);
        return await f.asOwner.query(api.communityClients.getClientBulkAction, { communityId, bulkActionId: started.bulk_action_id });
      };
      expect(await run({ type: "set_property", propertyKey: "cohort", value: "october" })).toMatchObject({ status: "done", total: 2, succeeded: 2, failed: [] });
      const list = await f.asOwner.query(api.communityClients.listClientsForOwner, { communityId });
      expect(list.clients.filter((client: any) => client.properties.cohort === "October").map((client: any) => client.name).sort()).toEqual(["dean", "thomas"]);

      expect(await run({ type: "flag", body: "Check in this week" })).toMatchObject({ succeeded: 2 });
      expect(await run({ type: "message", body: "Hi {first_name}, how is your first skill going?" })).toMatchObject({ succeeded: 2 });
      const messages = await f.t.run((ctx) => ctx.db.query("dmMessages").collect());
      expect(messages.map((row: any) => row.contentJson.text).sort()).toEqual([
        "Hi dean, how is your first skill going?", "Hi thomas, how is your first skill going?"]);
      const timeline = await f.asOwner.query(api.communityClients.getClientTimeline, { communityId, membershipId: String(f.activeMembership) });
      const summaries = timeline.entries.map((entry: any) => entry.summary);
      expect(summaries).toContain("Owner contacted by message: Hi thomas, how is your first skill going?");
      expect(summaries).toContain("Owner flagged: Check in this week");
      expect(summaries).toContain('Owner set cohort to "October"');

      await expect(f.asOwner.mutation(api.communityClients.runClientBulkAction, { communityId,
        action: { type: "message", body: "  " }, membershipIds: ids })).rejects.toThrow("client_event_body_invalid");
      await expect(f.asOutsider.mutation(api.communityClients.runClientBulkAction, { communityId,
        action: { type: "flag" }, membershipIds: ids })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("view rules", () => {
  const fields = communityClientFields({ properties: [{ key: "tier", name: "Tier", type: "select", options: ["VIP"] }] });
  test("unknown fields and ops are refused, so a typo never shows everyone", () => {
    expect(() => normalizeCommunityClientView({ name: "x", columns: ["nope"] }, fields)).toThrow("client_view_invalid");
    expect(() => normalizeCommunityClientView({ name: "x", filters: [{ field: "stuck", op: "contains", value: "a" }] }, fields)).toThrow("client_view_invalid");
    expect(normalizeCommunityClientView({ name: " Hot  leads ", filters: [{ field: "prop:tier", op: "is", value: ["VIP", "VIP"] }] }, fields))
      .toMatchObject({ name: "Hot leads", filters: [{ field: "prop:tier", op: "is", value: ["VIP"] }], match: "all", sort: null });
  });
  test("dates filter by days, and empty values sort last", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    const rows = [
      { name: "a", status: "active", last_seen_at: "2026-10-25T12:00:00Z" },
      { name: "b", status: "active", last_seen_at: "2026-10-10T12:00:00Z" },
      { name: "c", status: "active", last_seen_at: null },
    ];
    const seen = (op: any) => applyCommunityClientView(rows, { filters: [{ field: "last_seen_at", op, value: 7 }], match: "all", sort: null }, now).map((row) => row.name);
    expect(seen("within_days")).toEqual(["a"]);
    expect(seen("more_than_days_ago")).toEqual(["b", "c"]);
    expect(applyCommunityClientView(rows, { filters: [], match: "all", sort: { field: "last_seen_at", direction: "asc" } }, now).map((row) => row.name)).toEqual(["b", "a", "c"]);
    expect(personalizeCommunityClientMessage("Hi {first_name} ({name})", "Ava Brooks")).toBe("Hi Ava (Ava Brooks)");
  });
  test("groups follow the choice order, with the empty group last; only short-list fields can group", () => {
    expect(normalizeCommunityClientView({ name: "x", group: "prop:tier" }, fields).group).toBe("prop:tier");
    expect(() => normalizeCommunityClientView({ name: "x", group: "email" }, fields)).toThrow("client_view_invalid");
    const rows = [
      { name: "a", status: "cancelled" }, { name: "b", status: "active" }, { name: "c", status: "active", properties: { tier: "VIP" } },
    ];
    const status = fields.find((field) => field.key === "status")!;
    expect(groupCommunityClients(rows, status).map((group) => [group.value, group.rows.map((row) => row.name)]))
      .toEqual([["active", ["b", "c"]], ["cancelled", ["a"]]]);
    const tier = fields.find((field) => field.key === "prop:tier")!;
    expect(groupCommunityClients(rows, tier).map((group) => group.label)).toEqual(["VIP", "No tier"]);
  });
});
