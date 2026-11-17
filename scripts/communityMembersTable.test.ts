import { expect, test } from "vitest";
import { compableMembers, matchesMemberSearch, memberKey, memberStatus, membersCsv, toggleAllShown, type MemberTableRow } from "../shared/communityMembersTable";

const row = (name: string, extra: Partial<MemberTableRow> = {}): MemberTableRow => ({
  membership_id: `m-${name}`, user_id: `u-${name}`, name, handle: name.toLowerCase().replace(/\s+/g, "-"), role: "member",
  plan: { kind: "free", label: "Free", price_point_id: null }, money: null, joined_at: "2026-10-01T00:00:00.000Z", last_active_at: null, working_on: null, ...extra,
});

test("status says what the host has to act on first", () => {
  expect(memberStatus(row("A"))).toEqual({ kind: "active", label: "Active" });
  expect(memberStatus(row("A", { plan: { kind: "comped", label: "Free for good", price_point_id: null } })).kind).toBe("comped");
  const hold = { kind: "on_hold" as const, label: "on hold", since_at: null, ends_at: null };
  // On hold beats comped, and cancelling beats active.
  expect(memberStatus(row("A", { plan: { kind: "comped", label: "Free for good", price_point_id: null }, money: hold })).kind).toBe("on_hold");
  expect(memberStatus(row("A", { money: { kind: "cancelling", label: "cancelling", since_at: null, ends_at: null } })).label).toBe("Cancelling");
});

test("search is by name or handle, every word, any case", () => {
  const maya = row("Maya Chen", { handle: "maya-crimps" });
  expect(matchesMemberSearch(maya, "")).toBe(true);
  expect(matchesMemberSearch(maya, "  MAYA ")).toBe(true);
  expect(matchesMemberSearch(maya, "chen maya")).toBe(true);
  expect(matchesMemberSearch(maya, "@maya-crimps")).toBe(true);
  expect(matchesMemberSearch(maya, "maya park")).toBe(false);
  expect(matchesMemberSearch(row("Theo", { handle: null }), "theo")).toBe(true);
});

test("the header checkbox ticks everyone shown, or unticks them, and leaves the rest alone", () => {
  const some = toggleAllShown(new Set(["x"]), ["a", "b"]);
  expect([...some].sort()).toEqual(["a", "b", "x"]);
  // One of the shown already ticked: it fills in the rest.
  expect([...toggleAllShown(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
  // Everyone shown ticked: they come off, the other stays.
  expect([...toggleAllShown(some, ["a", "b"])]).toEqual(["x"]);
  expect(toggleAllShown(new Set(), []).size).toBe(0);
});

test("a bulk comp is only for people in for free, never the owner or anyone paying", () => {
  const rows = [row("Free"), row("Paid", { plan: { kind: "paid", label: "$20 a month", price_point_id: "p" } }),
    row("Owner", { membership_id: null, plan: { kind: "owner", label: "Owner", price_point_id: null } }),
    row("Gift", { plan: { kind: "comped", label: "Free for good", price_point_id: null } })];
  expect(compableMembers(rows).map((entry) => entry.name)).toEqual(["Free"]);
  expect(memberKey(rows[2])).toBe("owner");
});

test("the export keeps commas and quotes inside their cells", () => {
  const csv = membersCsv([row('Ana "The Wall" Ruiz', { working_on: "V5, then V6" })]);
  const [head, line] = csv.split("\n");
  expect(head).toBe('"Name","Handle","Role","Plan","Standing","Joined","Last active","Working on"');
  expect(line).toContain('"Ana ""The Wall"" Ruiz"');
  expect(line).toContain('"V5, then V6"');
});
