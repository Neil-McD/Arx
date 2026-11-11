// Design system v1, the Members page: the filter chips above the list. They
// narrow the people already loaded; they never widen who is shown.
export type MemberFilter = "everyone" | "here" | "hosts" | "new";

export const MEMBER_FILTERS: ReadonlyArray<{ id: MemberFilter; label: string }> = [
  { id: "everyone", label: "Everyone" },
  { id: "here", label: "Here now" },
  { id: "hosts", label: "Hosts" },
  { id: "new", label: "New this week" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function memberPassesFilter(
  member: { role: string; membership_created_at?: string | number | null },
  presence: "online" | "offline" | "unknown",
  filter: MemberFilter,
  now: number,
): boolean {
  if (filter === "here") return presence === "online";
  if (filter === "hosts") return member.role === "owner" || member.role === "admin" || member.role === "moderator";
  if (filter === "new") {
    const joined = typeof member.membership_created_at === "number"
      ? member.membership_created_at
      : Date.parse(String(member.membership_created_at ?? ""));
    return Number.isFinite(joined) && now - joined < WEEK_MS && now >= joined;
  }
  return true;
}
