// Design system v1, Home's right column: "Today". A few plain sentences about
// what is going on in the community, from the same facts Home already reads
// (the shared channels, joins, questions, events). Written without a model;
// the guide's own overview replaces these lines later. Pure, so each case is
// tested.
import type { CloudCommunityHomeSnapshot } from "./cloudCommunityAdminGateway";

export type TodayLine = {
  text: string;
  // Where the line goes when clicked: a channel by slug, or a page.
  target: { kind: "channel"; slug: string; name: string } | { kind: "members" } | null;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function todayLines(snapshot: CloudCommunityHomeSnapshot, audience: "host" | "member", max = 3): TodayLine[] {
  const lines: TodayLine[] = [];
  const { highlight, busiest } = snapshot;
  if (highlight) {
    lines.push({
      text: `“${highlight.title}” in #${highlight.channel} has ${plural(highlight.replies, "reply", "replies")}.`,
      target: { kind: "channel", slug: highlight.channelSlug, name: highlight.channel },
    });
  }
  if (busiest && busiest.posts + busiest.replies > 1) {
    const said = busiest.posts + busiest.replies;
    lines.push({
      text: `Busiest in #${busiest.channel}: ${plural(said, "message", "messages")} from ${plural(busiest.people, "person", "people")}.`,
      target: { kind: "channel", slug: busiest.channelSlug, name: busiest.channel },
    });
  }
  if (audience === "host" && snapshot.joinRequestsPending > 0) {
    lines.push({ text: `${plural(snapshot.joinRequestsPending, "person is", "people are")} waiting to join.`, target: { kind: "members" } });
  }
  const question = snapshot.unanswered[0];
  if (question) {
    lines.push({
      text: audience === "host"
        ? `${question.author}'s question in #${question.channel} has no answer yet.`
        : `A question in #${question.channel} is waiting for an answer.`,
      target: null,
    });
  }
  if (snapshot.newMembers.count > 0) {
    const names = snapshot.newMembers.names;
    lines.push({
      text: audience === "host" && names.length
        ? `${names.slice(0, 2).join(" and ")}${snapshot.newMembers.count > 2 ? ` and ${snapshot.newMembers.count - 2} more` : ""} joined.`
        : `${plural(snapshot.newMembers.count, "new member", "new members")} joined.`,
      target: audience === "host" ? { kind: "members" } : null,
    });
  }
  if (!lines.length) {
    lines.push({ text: "A quiet day so far.", target: null });
  }
  return lines.slice(0, max);
}

// "7 posts · 4 replies · 5 people", or nothing on a silent day.
export function todayCounts(snapshot: CloudCommunityHomeSnapshot): string | null {
  const { posts, replies, activePeople } = snapshot.activity;
  if (!posts && !replies) return null;
  return [plural(posts, "post", "posts"), plural(replies, "reply", "replies"), plural(activePeople, "person", "people")].join(" · ");
}

// Events that start today, in the viewer's own day.
export function eventsToday(snapshot: CloudCommunityHomeSnapshot, now: Date): Array<{ title: string; startsAt: string }> {
  return snapshot.upcomingEvents.filter((event) => {
    const starts = new Date(event.startsAt);
    return !Number.isNaN(starts.getTime()) && sameDay(starts, now);
  });
}
