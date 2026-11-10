// Home for the community's owner (design system v1, docs/specs/design-system-v1.md
// section 5): a greeting in the guide's voice, the one thing that needs them,
// and what happened across the community in the last day. The facts are the
// daily brief's, read live (convex/communityFounderBrief.ts).
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  getCloudCommunityHomeSnapshot,
  type CloudCommunityHomeSnapshot,
} from "../../../../shared/cloudCommunityAdminGateway";

export type WebCommunityHomeSectionProps = {
  communityId: string;
  communityName: string;
  firstName: string;
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  onOpenJoinRequests: () => void;
  onOpenChannelByName: (channelName: string) => void;
  onOpenEvents: () => void;
  // Changes each time Home is opened, so the facts are read again.
  refreshKey?: number;
  now?: Date;
};

type HomeCard = { label: string; title: string; detail: string; action: string; onAction: () => void };
type HomeRow = { kind: string; title: string; detail: string; onOpen?: () => void };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listNames(names: string[], total: number): string {
  const shown = names.slice(0, 2);
  const rest = total - shown.length;
  if (shown.length === 0) return "";
  if (rest <= 0) return shown.join(" and ");
  return `${shown.join(", ")} and ${rest} more`;
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function homeCardFor(
  snapshot: CloudCommunityHomeSnapshot,
  actions: Pick<WebCommunityHomeSectionProps, "onOpenJoinRequests" | "onOpenChannelByName">,
): HomeCard | null {
  if (snapshot.joinRequestsPending > 0) {
    const waiting = snapshot.joinRequestsPending;
    return {
      label: "Needs your decision",
      title: `${plural(waiting, "person is", "people are")} waiting to join`,
      detail: "Nobody joins until you or a moderator says yes.",
      action: waiting === 1 ? "Review the request" : "Review the requests",
      onAction: actions.onOpenJoinRequests,
    };
  }
  const oldest = snapshot.unanswered[0];
  if (oldest) {
    const age = oldest.hoursAgo >= 48 ? plural(Math.floor(oldest.hoursAgo / 24), "day", "days") : plural(oldest.hoursAgo, "hour", "hours");
    return {
      label: "Waiting for an answer",
      title: `${oldest.author}'s question has had no answer for ${age}`,
      detail: `“${oldest.text}” in #${oldest.channel}`,
      action: `Open #${oldest.channel}`,
      onAction: () => actions.onOpenChannelByName(oldest.channel),
    };
  }
  return null;
}

export function homeSentenceFor(snapshot: CloudCommunityHomeSnapshot, card: HomeCard | null): string {
  const joined = snapshot.newMembers.count;
  const joinedPart = joined > 0 ? `${plural(joined, "person", "people")} joined since yesterday` : "";
  if (card && joinedPart) return `${joinedPart}, and 1 thing needs you.`;
  if (card) return "1 thing needs you today.";
  if (joinedPart) return `${joinedPart}. Nothing needs you today.`;
  return "Nothing needs you today.";
}

export function homeRowsFor(
  snapshot: CloudCommunityHomeSnapshot,
  actions: Pick<WebCommunityHomeSectionProps, "onOpenEvents" | "onOpenChannelByName">,
): HomeRow[] {
  const rows: HomeRow[] = [];
  if (snapshot.newMembers.count > 0) {
    rows.push({
      kind: "Joined",
      title: `${plural(snapshot.newMembers.count, "new member", "new members")}`,
      detail: listNames(snapshot.newMembers.names, snapshot.newMembers.count),
    });
  }
  // The oldest question is skipped only when it is the card (no join requests).
  const firstQuestion = snapshot.joinRequestsPending > 0 ? 0 : 1;
  for (const question of snapshot.unanswered.slice(firstQuestion, firstQuestion + 2)) {
    rows.push({
      kind: "Waiting",
      title: `${question.author} asked in #${question.channel}`,
      detail: question.text,
      onOpen: () => actions.onOpenChannelByName(question.channel),
    });
  }
  if (snapshot.quietNewcomers.count > 0) {
    rows.push({
      kind: "Quiet",
      title: `${plural(snapshot.quietNewcomers.count, "newcomer hasn't", "newcomers haven't")} said hello yet`,
      detail: listNames(snapshot.quietNewcomers.names, snapshot.quietNewcomers.count),
    });
  }
  for (const event of snapshot.upcomingEvents.slice(0, 2)) {
    const startsAt = new Date(event.startsAt);
    rows.push({
      kind: "Coming up",
      title: event.title,
      detail: Number.isNaN(startsAt.getTime())
        ? ""
        : startsAt.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }),
      onOpen: actions.onOpenEvents,
    });
  }
  const { posts, replies, activePeople } = snapshot.activity;
  rows.push({
    kind: "Activity",
    title: posts + replies > 0
      ? `${plural(posts, "post", "posts")} and ${plural(replies, "reply", "replies")} from ${plural(activePeople, "person", "people")}`
      : "No new posts or replies in the last day",
    detail: `${plural(snapshot.memberCount, "member", "members")} in all`,
  });
  return rows;
}

export function WebCommunityHomeSection(props: WebCommunityHomeSectionProps) {
  const [snapshot, setSnapshot] = useState<CloudCommunityHomeSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A new community starts blank; reopening the same one keeps what is shown
    // until the fresh facts arrive.
    if (loadedCommunityIdRef.current !== props.communityId) {
      loadedCommunityIdRef.current = props.communityId;
      setSnapshot(null);
    }
    setFailed(false);
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        const loaded = session ? await getCloudCommunityHomeSnapshot({ session, communityId: props.communityId }) : null;
        if (!cancelled) setSnapshot(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId, props.refreshKey]);

  // Home is extra; if its facts can't load, the conversation below still works.
  if (failed) return null;

  const greeting = `${greetingFor(props.now ?? new Date())}, ${props.firstName}.`;
  const card = snapshot ? homeCardFor(snapshot, props) : null;
  const rows = snapshot ? homeRowsFor(snapshot, props) : [];

  return (
    <section className="community-home" aria-label={`${props.communityName} home`}>
      <div className="community-home-eyebrow">
        <Sparkles size={14} aria-hidden="true" />
        <span>{props.communityName}, your guide</span>
      </div>
      <p className="community-home-hello">
        {greeting}
        <span>{snapshot ? homeSentenceFor(snapshot, card) : " "}</span>
      </p>
      {card ? (
        <div className="community-home-card">
          <span className="community-home-card-label">{card.label}</span>
          <h2>{card.title}</h2>
          <p>{card.detail}</p>
          <button type="button" className="community-home-card-action" onClick={card.onAction}>
            {card.action}
          </button>
        </div>
      ) : null}
      {rows.length ? (
        <div className="community-home-rows">
          <span className="community-home-rows-label">Across the community</span>
          {rows.map((row, index) => {
            const body = (
              <>
                <span className="community-home-row-kind">{row.kind}</span>
                <span className="community-home-row-text">
                  <b>{row.title}</b>
                  {row.detail ? <span>{row.detail}</span> : null}
                </span>
                {row.onOpen ? <ArrowRight size={15} aria-hidden="true" /> : <span aria-hidden="true" />}
              </>
            );
            return row.onOpen ? (
              <button type="button" className="community-home-row" key={index} onClick={row.onOpen}>{body}</button>
            ) : (
              <div className="community-home-row" key={index}>{body}</div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
