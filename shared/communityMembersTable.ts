// The host's Members table (apps/web/src/v1/KitMembersTable.tsx): the rules
// for what it shows and what a selection means, free of the page so they
// can be tested on their own.
import type { MemberMoney, MemberPlan } from "./communityMemberRecords";

export type MemberTableRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  handle: string | null;
  role: string;
  plan: MemberPlan;
  money: MemberMoney;
  joined_at: string | null;
  last_active_at: string | null;
  working_on: string | null;
};

// The owner has no membership: one fixed key stands for them.
export const MEMBER_OWNER_KEY = "owner";
export const memberKey = (row: { membership_id: string | null }): string => row.membership_id ?? MEMBER_OWNER_KEY;

// One word for where someone stands. Money trouble comes first: it is what
// the host has to act on.
export type MemberStatus = { kind: "active" | "on_hold" | "cancelling"; label: string };
export function memberStatus(row: Pick<MemberTableRow, "plan" | "money">): MemberStatus {
  if (row.money?.kind === "on_hold") return { kind: "on_hold", label: "On hold" };
  if (row.money?.kind === "cancelling") return { kind: "cancelling", label: "Cancelling" };
  return { kind: "active", label: "Active" };
}

// Search by name or handle: every word typed has to be in one of them.
export function matchesMemberSearch(row: Pick<MemberTableRow, "name" | "handle">, query: string): boolean {
  const words = query.toLowerCase().replace(/@/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${row.name} ${row.handle ?? ""}`.toLowerCase();
  return words.every((word) => hay.includes(word));
}

// The header checkbox: with everyone shown already ticked it unticks them;
// otherwise it ticks everyone shown. People ticked but not shown (another
// search) stay as they are.
export function toggleAllShown(selected: ReadonlySet<string>, shown: string[]): Set<string> {
  const next = new Set(selected);
  const all = shown.length > 0 && shown.every((key) => next.has(key));
  for (const key of shown) { if (all) next.delete(key); else next.add(key); }
  return next;
}

export function membersCsv(rows: MemberTableRow[]): string {
  const cell = (value: string | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Handle", "Role", "Plan", "Standing", "Joined", "Last active", "Working on"];
  return [head.map(cell).join(","), ...rows.map((row) => [row.name, row.handle, row.role, row.plan.label, row.money?.label ?? "", row.joined_at, row.last_active_at, row.working_on].map(cell).join(","))].join("\n");
}
