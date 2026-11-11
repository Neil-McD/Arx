import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { memberRowsForView, memberTimeFor } = await import("../apps/web/src/v1/KitMembersPage");
const { memberDirectoryRowsFor } = await import("../apps/web/src/v1/KitMembersDirectory");
const { planFor, moneyFor, formatPrice, outReasonFor } = await import("../shared/communityMemberRecords");

const plan = (kind: string, label: string, id: string | null = null) => ({ kind, label, price_point_id: id }) as any;
const row = (name: string, extra: Record<string, unknown> = {}) => ({ membership_id: name, user_id: name, name, handle: null, avatar_url: null, role: "member",
  plan: plan("free", "Free"), money: null, joined_at: null, last_active_at: null, working_on: null, ...extra }) as any;

test("prices, money states and plans read the way the checklist says", () => {
  expect(formatPrice(700, "usd", 2)).toBe("$7");
  expect(formatPrice(2750, "usd", 2)).toBe("$27.50");
  const point = { id: "p", name: "Founding", amountBaseUnits: 700, currency: "usd", currencyDecimals: 2, billingPeriod: "monthly" };
  expect(planFor({ isOwner: false, accessSource: "paid_subscription", pricePoint: point }).label).toBe("Founding · $7");
  expect(planFor({ isOwner: false, accessSource: "paid_subscription", pricePoint: { ...point, billingPeriod: "annual" } }).label).toBe("Founding · $7 a year");
  expect(planFor({ isOwner: false, accessSource: "manual_grant", pricePoint: point }).kind).toBe("comped");
  expect(planFor({ isOwner: true, accessSource: null, pricePoint: null }).label).toBe("Owner");
  expect(moneyFor({ membershipState: "payment_hold", subscription: null })?.kind).toBe("on_hold");
  expect(moneyFor({ membershipState: "active", subscription: { status: "cancel_at_period_end", cancelAtPeriodEnd: true, updatedAt: 1 } })?.kind).toBe("cancelling");
  expect(moneyFor({ membershipState: "active", subscription: { status: "ended", cancelAtPeriodEnd: true, updatedAt: 1 } })).toBeNull();
  expect(outReasonFor("active", true)).toBe("blocked");
  expect(outReasonFor("lapsed", false)).toBe("lapsed");
  expect(outReasonFor("payment_hold", false)).toBeNull();
});

test("the host's saved views narrow the table to the right people", () => {
  const data = { rows: [
    row("Jon", { plan: plan("paid", "Founding · $7", "f"), working_on: "Invites" }),
    row("Tanya", { plan: plan("paid", "Member · $27", "m"), money: { kind: "on_hold" } }),
    row("Rashid", { plan: plan("paid", "Member · $27", "m"), money: { kind: "cancelling" } }),
    row("Tom", { plan: plan("comped", "Comped") }),
  ], past: [], prices: [], capped: false } as any;
  const names = (view: any) => memberRowsForView(data, view).map((r: any) => r.name);
  expect(names("price:m")).toEqual(["Tanya", "Rashid"]);
  expect(names("on_hold")).toEqual(["Tanya"]);
  expect(names("cancelling")).toEqual(["Rashid"]);
  expect(names("comped")).toEqual(["Tom"]);
  expect(names("know_little")).toEqual(["Tanya", "Rashid", "Tom"]);
  const now = Date.parse("2026-11-11T20:00:00Z");
  expect(memberTimeFor("2026-11-11T19:58:00Z", now)).toBe("Now");
  expect(memberTimeFor("2026-11-11T19:00:00Z", now)).toBe("1 h ago");
  expect(memberTimeFor(null, now)).toBe("—");
});

test("a member's directory puts you first, then whoever is here, and filters by what people shared", () => {
  const rows = [
    { membership_id: "a", user_id: "a", name: "Ana", avatar_url: null, role: "member", working_on: "Pricing", here_now: false, you: false },
    { membership_id: null, user_id: "n", name: "Neil", avatar_url: null, role: "owner", working_on: null, here_now: true, you: false },
    { membership_id: "m", user_id: "m", name: "Maya", avatar_url: null, role: "member", working_on: null, here_now: false, you: true },
  ] as any;
  expect(memberDirectoryRowsFor(rows, "everyone", "").map((r: any) => r.name)).toEqual(["Maya", "Neil", "Ana"]);
  expect(memberDirectoryRowsFor(rows, "here", "").map((r: any) => r.name)).toEqual(["Neil"]);
  expect(memberDirectoryRowsFor(rows, "hosts", "").map((r: any) => r.name)).toEqual(["Neil"]);
  expect(memberDirectoryRowsFor(rows, "everyone", "pric").map((r: any) => r.name)).toEqual(["Ana"]);
});
