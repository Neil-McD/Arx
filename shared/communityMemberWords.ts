// Small words a member reads on Knowledge and Members (the member-view pass,
// Nov 16), kept as pure rules so they can be tested.

// A lesson's page draws its title; many lessons also open their own text with
// the same title as a heading. That heading is not drawn twice. A different
// first heading, or the same words further down, are left alone.
export function lessonBodyWithoutRepeatedTitle(title: string, bodyMd: string): string {
  const plain = (text: string) => text.replace(/[*_`~]/g, "").replace(/[\s.:!?]+$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const lines = bodyMd.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first < 0) return bodyMd;
  const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[first]);
  if (!heading || !plain(title) || plain(heading[1]) !== plain(title)) return bodyMd;
  return lines.slice(first + 1).join("\n").replace(/^(\s*\n)+/, "");
}

// How far along a course a member is, in a word.
export function courseProgressWord(percent: number): string {
  if (!(percent > 0)) return "Not started";
  if (percent >= 100) return "Done";
  return `${Math.round(percent)}%`;
}

// Who someone is in the community, said once.
export function memberRoleLine(role: string, hereNow: boolean): string {
  const word = role === "owner" ? "Host · runs this community" : role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "Member";
  return hereNow ? `${word} · here now` : word;
}

// The short tag beside a name in a list (nothing for an ordinary member).
export function memberRoleTag(role: string): string | null {
  return role === "owner" ? "host" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null;
}
