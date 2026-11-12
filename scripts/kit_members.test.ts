import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
const { memberTimeFor, paymentText } = await import("../apps/web/src/v1/KitMembersPage");
const { memberDirectoryRowsFor } = await import("../apps/web/src/v1/KitMembersDirectory");
const { planFor, moneyFor, formatPrice, outReasonFor, memberInView } = await import("../shared/communityMemberRecords");

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
  // A refund or a card dispute ends access; they read as their own reasons.
  expect(outReasonFor("lapsed", false, "subscription_refunded")).toBe("refunded");
  expect(outReasonFor("lapsed", false, "subscription_dispute_opened")).toBe("disputed");
  expect(outReasonFor("removed", true, "subscription_refunded")).toBe("blocked");
  // Billing holds them as payment_hold, but access has ended.
  expect(outReasonFor("payment_hold", false, "subscription_refunded")).toBe("refunded");
  expect(outReasonFor("payment_hold", false, "subscription_dispute_opened")).toBe("disputed");
  expect(outReasonFor("payment_hold", false, null)).toBeNull();
});

test("the host's saved views narrow the table to the right people", () => {
  const rows = [
    row("Jon", { plan: plan("paid", "Founding · $7", "f"), working_on: "Invites" }),
    row("Tanya", { plan: plan("paid", "Member · $27", "m"), money: { kind: "on_hold" } }),
    row("Rashid", { plan: plan("paid", "Member · $27", "m"), money: { kind: "cancelling" } }),
    row("Tom", { plan: plan("comped", "Comped") }),
  ];
  const names = (view: string) => rows.filter((r: any) => memberInView(view, r)).map((r: any) => r.name);
  expect(names("price:m")).toEqual(["Tanya", "Rashid"]);
  expect(names("on_hold")).toEqual(["Tanya"]);
  expect(names("cancelling")).toEqual(["Rashid"]);
  expect(names("comped")).toEqual(["Tom"]);
  expect(names("know_little")).toEqual(["Tanya", "Rashid", "Tom"]);
  expect(names("past")).toEqual([]);
  const now = Date.parse("2026-11-11T20:00:00Z");
  expect(memberTimeFor("2026-11-11T19:58:00Z", now)).toBe("Now");
  expect(memberTimeFor("2026-11-11T19:00:00Z", now)).toBe("1 h ago");
  expect(memberTimeFor(null, now)).toBe("—");
});

test("payment history reads in plain words", () => {
  const event = (status: string, kind = "subscription_event") => ({ id: status, kind, status, source: null, billing_period: "monthly", amount_base_units: 2700, currency: "usd", currency_decimals: 2,
    occurred_at: "2026-11-01T00:00:00Z", created_at: null, updated_at: null, current_period_start_at: null, current_period_end_at: null, ended_at: null, cancel_at_period_end: null }) as any;
  expect(paymentText(event("active"))).toBe("Subscription active · $27 a month");
  expect(paymentText(event("past_due"))).toBe("Payment failed · $27 a month");
  expect(paymentText(event("cancel_at_period_end"))).toBe("Asked to stop renewing · $27 a month");
  expect(paymentText(event("ended"))).toBe("Subscription ended · $27 a month");
  expect(paymentText(event("complete", "checkout"))).toBe("Paid to join · $27 a month");
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
