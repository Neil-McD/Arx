// Home (design system v1, docs/specs/design-system-v1.md section 5): a greeting
// in the guide's voice, the one thing worth your attention, what happened
// across the community in the last day, and a quiet panel of where things
// stand. The owner sees the daily brief's facts read live; a member sees only
// what any member can already see (convex/communityFounderBrief.ts).
import { KitHomeRail } from "../v1/KitHomeRail";
import { dismissOwnerMoment, fetchOwnerMoment, markOwnerMomentShown } from "../../../../shared/cloudCommunityOwnerMomentsGateway";
import type { OwnerMoment } from "../../../../shared/communityOwnerMoments";
import type { CommunityPresenceSummary } from "../../../../shared/communityTypes";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  getCloudCommunityHomeSnapshot,
  type CloudCommunityHomeSnapshot,
} from "../../../../shared/cloudCommunityAdminGateway";
import { Btn, Card, Eyebrow, Hello, HomeBody, KitApp, Rail, Since, SinceItem, TextLink } from "../v1/kit";

export type WebCommunityHomeSectionProps = {
  communityId: string;
  communityName: string;
  firstName: string;
  audience: "host" | "member";
  session: unknown;
  ensureSession: (session: any) => Promise<any | null>;
  onOpenJoinRequests: () => void;
  onOpenChannelByName: (channelName: string) => void;
  onOpenEvents: () => void;
  onOpenKnowledge?: () => void;
  // Changes each time Home is opened, so the facts are read again.
  refreshKey?: number;
  // Where the right-hand column goes on wide windows (the page's own rail).
  // The same panel also renders inline, for windows too narrow for a rail.
  asideContainer?: HTMLElement | null;
  now?: Date;
  // Design system v1, the host's Home on the kit (docs/design/hifi-mock):
  // the dock supplies the conversation and whether it is open.
  // `hasConversation`: the one thread has something to read, so a quiet Home
  // still offers a way back into it.
  kit?: { talking: boolean; talk: ReactNode; onTalkItOver: () => void; hasConversation?: boolean } | null;
  // Whether the community's agent is on (docs/specs/community-agent-gateway-v0.md).
  // Off: Home is plain (no guide, no next step, no upsell).
  agentOn?: boolean;
  // The owner's milestone and problem cards turn the agent on in Billing.
  onTurnOnAgent?: () => void;
  // Who is here now (a member's "Right now" shows the faces).
  presence?: CommunityPresenceSummary | null;
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
  audience: "host" | "member" = "host",
): HomeCard | null {
  // Nothing "needs" a member; their Home has rows, not a card.
  if (audience === "member") return null;
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

export function homeSentenceFor(
  snapshot: CloudCommunityHomeSnapshot,
  card: HomeCard | null,
  audience: "host" | "member" = "host",
): string {
  const joined = snapshot.newMembers.count;
  const joinedPart = joined > 0 ? `${plural(joined, "person", "people")} joined since yesterday` : "";
  if (audience === "member") {
    const said = snapshot.activity.posts + snapshot.activity.replies;
    if (joinedPart && said > 0) return `${joinedPart}, and there ${said === 1 ? "is 1 new message" : `are ${said} new messages`}.`;
    if (joinedPart) return `${joinedPart}.`;
    if (said > 0) return `${plural(said, "new message", "new messages")} since yesterday.`;
    return "It's quiet today.";
  }
  if (card && joinedPart) return `${joinedPart}, and 1 thing needs you.`;
  if (card) return "1 thing needs you today.";
  if (joinedPart) return `${joinedPart}. Nothing needs you today.`;
  return "Nothing needs you today.";
}

export function homeRowsFor(
  snapshot: CloudCommunityHomeSnapshot,
  actions: Pick<WebCommunityHomeSectionProps, "onOpenEvents" | "onOpenChannelByName">,
  audience: "host" | "member" = "host",
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
  const firstQuestion = audience === "member" || snapshot.joinRequestsPending > 0 ? 0 : 1;
  for (const question of snapshot.unanswered.slice(firstQuestion, firstQuestion + 2)) {
    rows.push({
      kind: audience === "member" ? "Can you help?" : "Waiting",
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

type HomeFigure = { label: string; value: string; note: string };

// Where things stand, in numbers the page already has. Money joins these when
// the payments slice lands; nothing here is estimated.
export function homeFiguresFor(snapshot: CloudCommunityHomeSnapshot, audience: "host" | "member" = "host"): HomeFigure[] {
  const figures: HomeFigure[] = [
    {
      label: "Members",
      value: String(snapshot.memberCount),
      note: snapshot.newMembers.count > 0 ? `${snapshot.newMembers.count} joined since yesterday` : "No one new since yesterday",
    },
    {
      label: "Active today",
      value: String(snapshot.activity.activePeople),
      note: `${plural(snapshot.activity.posts, "post", "posts")}, ${plural(snapshot.activity.replies, "reply", "replies")}`,
    },
  ];
  if (audience === "host") {
    figures.push({
      label: "Waiting to join",
      value: String(snapshot.joinRequestsPending),
      note: snapshot.joinRequestsPending === 1 ? "request" : "requests",
    });
    figures.push({
      label: "Unanswered",
      // The list is capped at 5 (it feeds the brief), so 5 means "5 or more".
      value: snapshot.unanswered.length >= 5 ? "5+" : String(snapshot.unanswered.length),
      note: snapshot.unanswered.length === 1 ? "question" : "questions",
    });
  }
  return figures;
}

// "8:40 pm", as the mock's eyebrow has it.
export function homeClockFor(now: Date): string {
  return now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase();
}

export function homeEventTimeFor(startsAtIso: string, now: Date): string {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return "";
  const minutes = Math.round((startsAt.getTime() - now.getTime()) / 60000);
  if (minutes >= 0 && minutes < 60) return minutes <= 1 ? "Starting now" : `In ${minutes} minutes`;
  if (minutes >= 60 && minutes < 6 * 60) return `In ${plural(Math.round(minutes / 60), "hour", "hours")}`;
  return startsAt.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
}

export function WebCommunityHomeSection(props: WebCommunityHomeSectionProps) {
  const [snapshot, setSnapshot] = useState<CloudCommunityHomeSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  // The owner's moment card (a milestone or a detected problem), when nothing
  // urgent holds the next-step spot.
  const [ownerMoment, setOwnerMoment] = useState<{ moment: OwnerMoment; isNew: boolean } | null>(null);
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
        const loaded = session
          ? await getCloudCommunityHomeSnapshot({ session, communityId: props.communityId, audience: props.audience })
          : null;
        if (!cancelled) setSnapshot(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.communityId, props.refreshKey, props.audience]);

  useEffect(() => {
    if (props.audience !== "host" || !props.kit) { setOwnerMoment(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const session = await props.ensureSession(props.session);
        if (!session) return;
        const picked = await fetchOwnerMoment({ session, communityId: props.communityId });
        if (cancelled) return;
        setOwnerMoment(picked);
        if (picked?.isNew) await markOwnerMomentShown({ session, communityId: props.communityId, key: picked.moment.key }).catch(() => undefined);
      } catch { if (!cancelled) setOwnerMoment(null); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.communityId, props.refreshKey, props.audience]);

  const dismissMoment = async () => {
    const current = ownerMoment;
    setOwnerMoment(null);
    if (!current) return;
    try {
      const session = await props.ensureSession(props.session);
      if (session) await dismissOwnerMoment({ session, communityId: props.communityId, key: current.moment.key });
    } catch { /* It shows again next time; nothing is lost. */ }
  };

  // Home is extra; if its facts can't load, the conversation below still works.
  if (failed && !props.kit) return null;

  const now = props.now ?? new Date();
  const greeting = `${greetingFor(now)}, ${props.firstName}.`;
  const agentOn = props.agentOn !== false;
  const card = snapshot && agentOn ? homeCardFor(snapshot, props, props.audience) : null;
  const rows = snapshot ? homeRowsFor(snapshot, props, props.audience) : [];
  const figures = snapshot ? homeFiguresFor(snapshot, props.audience) : [];
  const nextEvent = snapshot?.upcomingEvents[0] ?? null;

  if (props.kit) {
    const kit = props.kit;
    const isHost = props.audience === "host";
    // The right column: Today, who is online, and the community's memory.
    const panel = snapshot ? (
      <KitHomeRail session={props.session} communityId={props.communityId} audience={props.audience} snapshot={snapshot} agentOn={agentOn}
        presence={props.presence} now={now.getTime()} onOpenEvents={props.onOpenEvents}
        onOpenChannelByName={props.onOpenChannelByName} onOpenMembers={props.onOpenJoinRequests} onOpenKnowledge={props.onOpenKnowledge} />
    ) : null;
    const rail = panel ? (
      <KitApp view="home" host={isHost} part="rail">
        <Rail index={0} label="The community today">{panel}</Rail>
      </KitApp>
    ) : null;
    return (
      <>
        <HomeBody>
          <Eyebrow community={props.communityName} time={homeClockFor(now)} plain={!agentOn} />
          <Hello greeting={greeting} line={snapshot ? homeSentenceFor(snapshot, card, props.audience) : failed ? "" : " "} />
          {!card && ownerMoment ? (
            <Card label={ownerMoment.moment.kind === "milestone" ? "Milestone" : "Worth a look"} title={ownerMoment.moment.title}
              say={[ownerMoment.moment.detail, ownerMoment.moment.guide ? (agentOn ? `Your guide ${ownerMoment.moment.guide}.` : `With your community's agent, your guide ${ownerMoment.moment.guide}.`) : ""].filter(Boolean).join(" ")}>
              {ownerMoment.moment.guide && !agentOn && props.onTurnOnAgent ? <Btn go onClick={props.onTurnOnAgent}>Turn on your community's agent</Btn> : null}
              {ownerMoment.moment.guide && agentOn ? <Btn go onClick={kit.onTalkItOver}>Talk it over</Btn> : null}
              <Btn txt onClick={() => void dismissMoment()}>{ownerMoment.moment.guide ? "Not now" : "Thanks"}</Btn>
            </Card>
          ) : null}
          {card ? (
            <Card label={card.label} title={card.title} say={card.detail}>
              <Btn go onClick={card.onAction}>{card.action}</Btn>
              <Btn txt onClick={kit.onTalkItOver}>Talk it over</Btn>
            </Card>
          ) : null}
          {rows.length ? (
            <Since label="Across the community" style={card ? undefined : { marginTop: 44 }}>
              {rows.map((row, index) => (
                <SinceItem key={index} kind={row.kind} title={row.title} detail={row.detail} onOpen={row.onOpen} still={!row.onOpen} />
              ))}
            </Since>
          ) : null}
          {agentOn && !kit.talking && kit.hasConversation && !card ? (
            <TextLink style={{ marginTop: 20 }} onClick={kit.onTalkItOver}>Continue your conversation</TextLink>
          ) : null}
          {kit.talk}
          {/* Windows too narrow for the right column get its panel here. */}
          {panel && !kit.talking ? <div className="community-home-kit-inline" aria-label="The community right now">{panel}</div> : null}
        </HomeBody>
        {props.asideContainer && rail ? createPortal(rail, props.asideContainer) : null}
      </>
    );
  }

  const aside = (placement: "inline" | "rail") => snapshot ? (
        <aside className={`community-home-aside${placement === "rail" ? " is-rail" : " is-inline"}`} aria-label="The community right now">
          <div className="community-home-figures">
            {figures.map((figure) => (
              <div className="community-home-figure" key={figure.label}>
                <span>{figure.label}</span>
                <b>{figure.value}</b>
                <em>{figure.note}</em>
              </div>
            ))}
          </div>
          <div className="community-home-aside-section">
            <span className="community-home-rows-label">Coming up</span>
            {nextEvent ? (
              <>
                <h3>{nextEvent.title}</h3>
                <p>{homeEventTimeFor(nextEvent.startsAt, now)}</p>
              </>
            ) : (
              <p>Nothing in the next 2 days.</p>
            )}
            <button type="button" className="community-home-aside-link" onClick={props.onOpenEvents}>
              All events <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </aside>
  ) : null;

  return (
    <section className="community-home" aria-label={`${props.communityName} home`}>
      <div className="community-home-main">
      <div className="community-home-eyebrow">
        <Sparkles size={14} aria-hidden="true" />
        <span>{props.communityName}, your guide</span>
      </div>
      <p className="community-home-hello">
        {greeting}
        <span>{snapshot ? homeSentenceFor(snapshot, card, props.audience) : " "}</span>
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
      </div>
      {aside("inline")}
      {props.asideContainer ? createPortal(aside("rail"), props.asideContainer) : null}
    </section>
  );
}
