import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";

import type { BrainAttach, BrainMap, BrainPoint } from "../../../../../shared/communityBrain";
import type { MemberTableRow } from "../../../../../shared/communityMembersTable";
import { memberKey } from "../../../../../shared/communityMembersTable";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import {
  Btn, Card, Chips, Cover, Dock, Eyebrow, Figs, Foot, Group, Hello, HomeBody, Icon, KitApp, Main, Me, Mine, NavRow, Rail, Sec, Sep,
  Side, Since, SinceItem, Spacer, Talk, Theirs, Top, View, cx, type KitView,
} from "../../v1/kit";
import { KitBrainMap } from "../../v1/KitBrainMap";
import { MembersTable, MembersToolbar } from "../../v1/KitMembersTable";

// The home page's product preview: the real app, drawn by the app's own kit,
// in a made-up community (The Build Club) with made-up people. Every click
// moves a fixed script; nothing is sent anywhere. It shows only what Polynet
// does today: the morning brief and a check-in waiting for your yes, the
// guide answering from your courses, the community brain, members, events.

export type PreviewPage = "home" | "inbox" | "general" | "wins" | "know" | "events" | "members";

export type PreviewState = {
  page: PreviewPage;
  draftOpen: boolean;
  joshCheckedIn: boolean;
  /** The visitor sent the question waiting in #general's message box. */
  asked: boolean;
  answered: boolean;
  /** The question chip the visitor pressed on Home, if any. */
  talk: string | null;
  /** The member open in Members' side panel. */
  member: string | null;
  /** What's picked on the brain map. */
  picked: string | null;
};

export type PreviewAction =
  | { type: "open"; page: PreviewPage; picked?: string | null }
  | { type: "review" }
  | { type: "skip" }
  | { type: "send" }
  | { type: "ask" }
  | { type: "answer" }
  | { type: "talk"; chip: string | null }
  | { type: "member"; key: string | null }
  | { type: "pick"; id: string | null };

export const INITIAL_PREVIEW: PreviewState = {
  page: "home", draftOpen: false, joshCheckedIn: false, asked: false, answered: false, talk: null, member: null, picked: null,
};

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case "open":
      return { ...state, page: action.page, talk: null, draftOpen: false, member: action.page === "members" ? state.member : null,
        picked: action.picked !== undefined ? action.picked : action.page === "know" ? state.picked : null };
    case "review":
      return state.joshCheckedIn ? state : { ...state, draftOpen: true, talk: null };
    case "skip":
      return { ...state, draftOpen: false };
    case "send":
      return state.draftOpen ? { ...state, draftOpen: false, joshCheckedIn: true } : state;
    case "ask":
      return state.asked ? state : { ...state, asked: true };
    case "answer":
      return state.asked ? { ...state, answered: true } : state;
    case "talk":
      return { ...state, talk: action.chip, draftOpen: false };
    case "member":
      return { ...state, member: action.key, draftOpen: false };
    case "pick":
      return { ...state, picked: action.id };
  }
}

export const PREVIEW_COMMUNITY = "The Build Club";
const BANNER = "/design-lab/polynet-earth.webp";

// The kit names a page by the mock's view; the two channels share its channel view.
const KIT_VIEW: Record<PreviewPage, KitView> = {
  home: "home", inbox: "inbox", general: "wins", wins: "wins", know: "know", events: "events", members: "members",
};

const CHECK_IN_DRAFT =
  "Hey Josh, we've missed you on the last two calls. Friday's call covers pricing, the thing you asked about in your first week. Hope to see you there.";

export const QUESTION = "@guide where's the lesson on finding your first customers?";
export const GUIDE_REPLY =
  "It's Lesson 4 of Start here, \"Your first ten customers\". The short version: start with people who already asked you for help, then ask each one who else has the same problem.";

// What the guide says when a question chip on Home is pressed.
export const CHIP_ANSWERS: Record<string, string> = {
  "How was this week?": "Busy. 132 people were active, three joined, and I answered 41 questions. Jon's invitation post was the most useful thing shared.",
  "Who might leave?": "Josh. He's been quiet for 25 days and missed the last two calls. I've drafted a check-in for you, it's at the top of Home.",
  "Draft Friday's agenda": "1. Jon's three-line invitation, with his numbers. 2. Pricing your first offer, since four people asked this week. 3. Wins from the week.",
};

function track(action: string) {
  captureProductAnalyticsEvent("preview_used", { action });
}

function lessMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// ---------- a channel, drawn the way the app's mock draws one ----------

type Message = {
  who: string; tone: string; time: string; text: ReactNode; host?: boolean; guide?: boolean;
  reactions?: string[]; replies?: string; note?: { title: string; id: string };
};

const GENERAL: Array<Message | string> = [
  "Yesterday",
  { who: "Lena", tone: "a3", time: "6:10 pm", text: "Hi all, I'm Lena. I teach Excel to small business owners and I want to turn it into a paid course.", reactions: ["👋 6"] },
  { who: "Maya", tone: "a4", time: "6:24 pm", text: "Welcome Lena! Start here is the best first stop. Lesson 2 is all about picking your first offer." },
  "Today",
  { who: "Dev", tone: "a1", time: "2:14 am", text: <><span className={cx("at")}>@guide</span> how should I price my first offer?</> },
  { who: "Guide", tone: "guide", guide: true, time: "2:14 am", text: "Start with one clear result and one price. Lesson 3 walks through it, with three examples from members here.",
    note: { title: "Pricing your first offer", id: "resource:price" } },
  { who: "Dev", tone: "a1", time: "8:02 am", text: "That's exactly what I needed. Going with $49.", reactions: ["🙌 4"] },
  { who: "Priya", tone: "a5", time: "8:40 am", text: "Anyone tried a founding-member price? Thinking 30 seats at half price.", replies: "3 replies · last 20 min ago" },
];

const WINS: Array<Message | string> = [
  "Yesterday",
  { who: "Rashid", tone: "a5", time: "4:18 pm", text: "First paid member came in today. Forty-nine dollars never felt so good.", reactions: ["🎉 9"] },
  { who: "Sara", tone: "a6", time: "6:02 pm", text: "Ran my first live call with eleven people. Nobody left early, which I'm counting as a win." },
  "Today",
  { who: "Jon", tone: "a1", time: "8:40 am", text: "We passed 100 members last night. The invitation that worked was three lines: the result, who it's for, one link.",
    reactions: ["🎉 12", "🔥 5"], replies: "4 replies · last 10 min ago" },
  { who: "Guide", tone: "guide", guide: true, time: "8:53 am", text: "I've saved Jon's invitation to Knowledge, with his numbers. Two members asked for exactly this last week.",
    note: { title: "Invitations that work", id: "note:invite" } },
  { who: "Maya", tone: "a4", time: "9:12 am", text: "Sending my first ten today. Wish me luck.", reactions: ["🚀 3"] },
];

function Feed(props: { items: Array<Message | string>; onNote: (id: string) => void; extra?: ReactNode }) {
  return (
    <div className={cx("feed")}>
      {props.items.map((item, index) => typeof item === "string" ? <div key={index} className={cx("day")}>{item}</div> : (
        <div key={index} className={cx("msg", item.guide && "g")}>
          <span className={cx("av", item.tone)}>{item.guide ? <Icon name="spark" /> : item.who.slice(0, 1)}</span>
          <div className={cx("b")}>
            <div className={cx("h")}>
              <b>{item.guide ? PREVIEW_COMMUNITY : item.who}</b>
              {item.guide ? <span className={cx("tag g")}>guide</span> : item.host ? <span className={cx("tag")}>host</span> : null}
              <time>{item.time}</time>
            </div>
            <p>{item.text}</p>
            {item.note ? (
              <button type="button" className={cx("note")} onClick={() => { track("channel_note"); props.onNote(item.note!.id); }}>
                <Icon name="stars" /><span><b>{item.note.title}</b> · in Knowledge</span>
              </button>
            ) : null}
            {item.reactions || item.replies ? (
              <div className={cx("rx")}>
                {(item.reactions ?? []).map((reaction) => <span key={reaction} className={cx("re")}>{reaction}</span>)}
                {item.replies ? <span className={cx("th")}><b>{item.replies}</b></span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ))}
      {props.extra}
    </div>
  );
}

function AskBox(props: { value: string; placeholder: string; disabled: boolean; glow: boolean; onSend: () => void }) {
  return (
    <form className={cx("ask")} onSubmit={(event) => { event.preventDefault(); if (!props.disabled) props.onSend(); }}>
      <input type="text" readOnly value={props.disabled ? "" : props.value} placeholder={props.placeholder} aria-label={props.placeholder} />
      <button type="submit" className={[cx("send"), props.glow ? "rp-glow" : ""].join(" ")} aria-label="Send" disabled={props.disabled}><Icon name="up" /></button>
    </form>
  );
}

function GeneralPage(props: { state: PreviewState; dispatch: (action: PreviewAction) => void }) {
  const { state, dispatch } = props;
  const words = GUIDE_REPLY.split(" ");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!state.asked || state.answered) return;
    const thinking = window.setTimeout(() => dispatch({ type: "answer" }), lessMotion() ? 0 : 900);
    return () => window.clearTimeout(thinking);
  }, [state.asked, state.answered, dispatch]);
  useEffect(() => {
    if (!state.answered) return;
    if (lessMotion()) { setShown(words.length); return; }
    if (shown >= words.length) return;
    const next = window.setTimeout(() => setShown((count) => count + 1), 40);
    return () => window.clearTimeout(next);
  }, [state.answered, shown, words.length]);
  const typing = state.answered && shown < words.length;
  const feed = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = feed.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [state.asked, state.answered, shown]);
  const mine: Array<Message | string> = state.asked ? [
    { who: "You", tone: "a2", host: true, time: "now", text: <><span className={cx("at")}>@guide</span> where's the lesson on finding your first customers?</> },
    { who: "Guide", tone: "guide", guide: true, time: "now",
      text: state.answered ? <>{words.slice(0, shown).join(" ")}{typing ? <span className="rp-caret" aria-hidden="true" /> : null}</> : <span className="rp-thinking">Looking through your courses…</span>,
      note: state.answered && !typing ? { title: "Your first ten customers", id: "resource:first10" } : undefined },
  ] : [];
  return (
    <>
      <div className="rp-scroll" aria-live="polite" ref={feed}>
        <Feed items={[...GENERAL, ...mine]} onNote={(id) => dispatch({ type: "open", page: "know", picked: id })} />
      </div>
      <Dock>
        <AskBox value={QUESTION} placeholder="Message #general" disabled={state.asked} glow={!state.asked}
          onSend={() => { track("guide_asked"); dispatch({ type: "ask" }); }} />
      </Dock>
    </>
  );
}

// ---------- the community brain, with The Build Club's own knowledge ----------

const DAY = 86_400_000;

export function buildClubBrain(now: number): BrainMap {
  const lesson = (id: string): BrainAttach => ({ kind: "lesson", id: `resource:${id}` });
  const subject = (name: string): BrainAttach => ({ kind: "subject", name });
  const pt = (id: string, title: string, at: BrainAttach, daysAgo: number, extra: Partial<BrainPoint> = {}): BrainPoint => ({
    id: `note:${id}`, title, kind: "learned", at, learned_at: new Date(now - daysAgo * DAY).toISOString(), fresh: daysAgo <= 7, use: 0, mine: false, ...extra,
  });
  const map: BrainMap = {
    center: { name: PREVIEW_COMMUNITY, kind: "community" },
    counts: { courses: 0, lessons: 0, learned: 0, this_week: 0 },
    can_manage: true,
    courses: [
      { id: "course:start", name: "Start here", order: 0, lessons: [
        { id: "resource:welcome", title: "Welcome to the club", order: 1, done: true, use: 3 },
        { id: "resource:offer", title: "Picking your first offer", order: 2, done: true, use: 5 },
        { id: "resource:price", title: "Pricing your first offer", order: 3, done: true, use: 9 },
        { id: "resource:first10", title: "Your first ten customers", order: 4, done: false, use: 4 },
      ] },
      { id: "course:launch", name: "Launch week", order: 1, lessons: [
        { id: "resource:page", title: "A one-page offer", order: 1, done: false, use: 2 },
        { id: "resource:post", title: "The launch post", order: 2, done: false, use: 1 },
        { id: "resource:after", title: "The week after launch", order: 3, done: false, use: 0 },
      ] },
    ],
    subjects: [],
    points: [
      pt("founding", "Founding-member pricing", lesson("price"), 1, { use: 6 }),
      pt("onePrice", "One price beats three tiers at the start", lesson("price"), 12, { use: 4 }),
      pt("refund", "A simple refund line builds trust", lesson("price"), 30),
      pt("askedHelp", "Start with people who asked you for help", lesson("first10"), 2, { use: 5 }),
      pt("dms", "Ten DMs, not one big post", lesson("first10"), 9, { use: 3 }),
      pt("invite", "Invitations that work", subject("Growth"), 0, { use: 7 }),
      pt("hundred", "How Jon passed 100 members", subject("Growth"), 1, { use: 2 }),
      pt("referral", "Ask each customer who else needs this", subject("Growth"), 15),
      pt("calls", "How the Friday call runs", subject("Calls"), 40, { use: 3 }),
      pt("record", "Where call recordings live", subject("Calls"), 22),
      pt("noshow", "What to do when nobody shows up", subject("Calls"), 5, { use: 1 }),
      pt("headline", "Launch post headlines that worked", lesson("post"), 3, { use: 2 }),
      pt("onepage", "What goes on a one-page offer", lesson("page"), 18),
      pt("podplan", "Launch pod's weekly plan", { kind: "pod", id: "pod:launch" }, 2),
    ],
    pods: [{ id: "pod:launch", name: "Launch pod", inside: true, count: 1 }],
    arcs: [{ a: "note:invite", b: "resource:first10", count: 3 }, { a: "note:founding", b: "note:onePrice", count: 2 }, { a: "note:hundred", b: "note:invite", count: 2 }],
    hidden: {},
  };
  const sizes = new Map<string, { first: number; size: number }>();
  for (const point of map.points) {
    if (point.at.kind !== "subject") continue;
    const at = Date.parse(point.learned_at);
    const entry = sizes.get(point.at.name) ?? { first: at, size: 0 };
    entry.first = Math.min(entry.first, at);
    entry.size += 1;
    sizes.set(point.at.name, entry);
  }
  map.subjects = [...sizes].map(([name, s]) => ({ name, first_at: new Date(s.first).toISOString(), size: s.size }));
  const community = map.points.filter((point) => point.at.kind !== "pod");
  map.counts = {
    courses: map.courses.length,
    lessons: map.courses.reduce((n, course) => n + course.lessons.length, 0),
    learned: community.length,
    this_week: community.filter((point) => now - Date.parse(point.learned_at) <= 7 * DAY).length,
  };
  return map;
}

function pickedWords(map: BrainMap, id: string | null): { title: string; where: string; say: string } | null {
  if (!id) return null;
  for (const course of map.courses) {
    const found = course.lessons.find((lesson) => lesson.id === id);
    if (found) return { title: found.title, where: `${course.name} · lesson ${found.order}`, say: `Asked about ${found.use} times this month. The guide answers from it and links back here.` };
  }
  const point = map.points.find((entry) => entry.id === id);
  if (!point) return null;
  const where = point.at.kind === "subject" ? point.at.name : point.at.kind === "pod" ? "Launch pod" : "Learned from a lesson";
  return { title: point.title ?? "Learned", where: `Learned · ${where}`, say: "Saved from a conversation in the community. Members can find it, and the guide uses it in answers." };
}

// ---------- members ----------

const NAMES = ["Alex Rivera", "Maya Chen", "Dev Patel", "Priya Shah", "Jon Park", "Lena Novak", "Josh Reed", "Rashid Khan", "Sara Lind", "Tom Alvarez",
  "Hana Sato", "Omar Haddad", "Ivy Nguyen", "Noah Kim", "Zoe Martin", "Elif Demir"];
const JOSH = "u6";

function memberRows(now: number): MemberTableRow[] {
  return NAMES.map((name, i) => ({
    membership_id: i === 0 ? null : `m${i}`, user_id: `u${i}`, name, handle: name.toLowerCase().replace(/\s+/g, "-"), avatar_url: null,
    role: i === 0 ? "owner" : i === 1 ? "admin" : "member",
    plan: i === 0 ? { kind: "owner", label: "Owner", price_point_id: null }
      : i % 4 === 3 ? { kind: "free", label: "Free", price_point_id: null }
      : { kind: "paid", label: i % 3 === 1 ? "$490 a year" : "$49 a month", price_point_id: "p" },
    money: i === 11 ? { kind: "cancelling", label: "cancelling", since_at: null, ends_at: null } : null,
    joined_at: new Date(now - (i + 3) * 8 * DAY).toISOString(),
    last_active_at: new Date(now - (i === 6 ? 25 * DAY : (i % 5) * 9 * 3_600_000)).toISOString(),
    working_on: null,
  })) as MemberTableRow[];
}

function timeFor(iso: string | null, now: number): string {
  if (!iso) return "—";
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 5) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function dayFor(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
}

const colour = (id: string) => `hsl(${(id.charCodeAt(1) * 47) % 360} 35% 38%)`;
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);

// ---------- the check-in Chief of Staff drafted ----------

function CheckInCard(props: { state: PreviewState; dispatch: (action: PreviewAction) => void; where: string }) {
  const { state, dispatch } = props;
  const [text, setText] = useState(CHECK_IN_DRAFT);
  if (state.joshCheckedIn) {
    return <SinceItem kind="Sent" title="Checked in with Josh" detail="Just now · his reply will land in Inbox" still />;
  }
  return (
    <Card label="Needs you" note="Drafted at 7:02 am" title="Check in with Josh"
      say="Quiet for 25 days and missed the last two calls. Friday covers pricing, which he asked about in his first week.">
      {state.draftOpen ? (
        <div className="rp-draft">
          <textarea aria-label="Check-in message to Josh" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          <div className="rp-draft-acts">
            <Btn go disabled={!text.trim()} onClick={() => { track(`check_in_sent_${props.where}`); dispatch({ type: "send" }); }}>Send to Josh</Btn>
            <Btn txt onClick={() => dispatch({ type: "skip" })}>Not now</Btn>
          </div>
        </div>
      ) : (
        <span className="rp-acts">
          <Btn go onClick={() => { track(`check_in_review_${props.where}`); dispatch({ type: "review" }); }}>Review the draft</Btn>
        </span>
      )}
    </Card>
  );
}

// ---------- the whole app ----------

const TITLE_VIEW: Record<PreviewPage, number> = { home: 0, inbox: 3, general: 1, wins: 1, know: 2, events: 4, members: 5 };

function pageTitle(page: PreviewPage, brain: BrainMap): ReactNode {
  switch (page) {
    case "home": return null;
    case "inbox": return "Inbox";
    case "general": return <># general <small>Say hello, ask anything</small></>;
    case "wins": return <># wins <small>Share what worked</small></>;
    case "know": return <>The community brain <small>{brain.counts.courses} courses · {brain.counts.lessons} lessons · {brain.counts.learned} learned · {brain.counts.this_week} this week</small></>;
    case "events": return "Events";
    case "members": return "Members";
  }
}

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function useFitScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.875);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Fits the width; on a phone it stops shrinking and the right side is
    // cut off at the edge, like a desktop screenshot.
    const fit = () => setScale(Math.max(0.6, Math.min(1, node.clientWidth / DESIGN_WIDTH)));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(fit);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  return { ref, scale };
}

export function RealAppPreview() {
  const [state, dispatch] = useReducer(previewReducer, INITIAL_PREVIEW);
  const { ref, scale } = useFitScale();
  const [now] = useState(Date.now);
  const [brain] = useState(() => buildClubBrain(now));
  const [rows] = useState(() => memberRows(now));
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setPlayed(true); return; }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setPlayed(true); seen.disconnect(); }
    }, { threshold: 0.3 });
    seen.observe(node);
    return () => seen.disconnect();
  }, [ref]);
  const go = (page: PreviewPage, picked?: string | null) => { track(`open_${page}`); dispatch({ type: "open", page, picked }); };
  const open = rows.find((row) => memberKey(row) === state.member) ?? null;
  const picked = pickedWords(brain, state.picked);
  const channelRow = (page: "general" | "wins", label: string, extra: { unread?: boolean; dot?: boolean } = {}) => (
    <NavRow icon="hash" label={label} view={state.page === page ? "wins" : undefined} {...extra} onClick={() => go(page)} />
  );
  return (
    <div ref={ref} className={played ? "rp played" : "rp"} style={{ height: DESIGN_HEIGHT * scale }}
      role="region" aria-label={`A working preview of Polynet, in a made-up community called ${PREVIEW_COMMUNITY}`}>
      <div className="rp-stage" style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, zoom: scale }}>
        <KitApp view={KIT_VIEW[state.page]} host talking={state.page === "home" && Boolean(state.talk)} banner={BANNER} bannerPosition="72% 38%" aura={0.08} className="rp-app">
          <Side>
            <Cover name={PREVIEW_COMMUNITY} onSwitch={() => go("home")} />
            <Spacer height={10} />
            <NavRow icon="home" label="Home" view="home" onClick={() => go("home")} />
            <NavRow icon="inbox" label="Inbox" view="inbox" hint="2" onClick={() => go("inbox")} />
            <Group>Channels</Group>
            {channelRow("general", "general")}
            {channelRow("wins", "wins", { unread: true, dot: true })}
            <Group>Community</Group>
            <NavRow icon="stars" label="Knowledge" view="know" hint="4 new" onClick={() => go("know")} />
            <NavRow icon="cal" label="Events" view="events" live="Fri" onClick={() => go("events")} />
            <NavRow icon="users" label="Members" view="members" hint="214" onClick={() => go("members")} />
            <Foot>
              <Me name="You" role="Host" avatar="Y" tone="a2" />
            </Foot>
          </Side>

          <Main>
            <Top title={pageTitle(state.page, brain)} titleView={TITLE_VIEW[state.page]} />
            {/* Home: the morning brief and the one thing that needs you. */}
            <View index={0}>
              {state.talk ? (
                <div className="rp-talk">
                  <Talk>
                    <Mine>{state.talk}</Mine>
                    <Theirs><p>{CHIP_ANSWERS[state.talk]}</p></Theirs>
                  </Talk>
                  <Btn txt onClick={() => dispatch({ type: "talk", chip: null })}>Back to the brief</Btn>
                </div>
              ) : (
                <HomeBody hostOnly>
                  <Eyebrow community={PREVIEW_COMMUNITY} time="9:24 am" />
                  <Hello greeting="Good morning." line={state.joshCheckedIn ? "You're all caught up. The community looked after itself overnight." : "One person needs you. Everything else is handled."} />
                  <div className="rp-card"><CheckInCard state={state} dispatch={dispatch} where="home" /></div>
                  <Since label="Since yesterday" style={{ marginTop: 28 }}>
                    <SinceItem kind="Answered" learned title="I answered Dev's pricing question at 2:14 am" detail="From Start here, lesson 3 · he's going with $49" onOpen={() => go("general")} />
                    <SinceItem kind="Saved" learned title="Jon's invitation is in Knowledge now" detail="Two members asked for exactly this last week" onOpen={() => go("know", "note:invite")} />
                    <SinceItem kind="Joined" title="Lena joined and said hello" detail="Maya pointed her to Start here" onOpen={() => go("general")} />
                  </Since>
                </HomeBody>
              )}
              <Dock>
                <Chips hostOnly chips={Object.keys(CHIP_ANSWERS)} onChip={(chip) => { track("home_chip"); dispatch({ type: "talk", chip }); }} />
              </Dock>
            </View>

            {/* Inbox: direct messages. */}
            <View index={3}>
              <div className={cx("page")}>
                <p className={cx("lead")}><span className={cx("aura")}><Icon name="spark" /></span>Two of these need a reply.</p>
                <div className={cx("list")} style={{ marginTop: 18 }}>
                  <div className={cx("mrow sel")}><span className={cx("av a1")}>J</span><div><div className={cx("h")}><b>Jon</b><span>Direct message</span><time>20 min</time></div><p>Happy to share the full invitation sequence if you want it for Friday.</p></div><span className={cx("dot")} /></div>
                  <div className={cx("mrow")}><span className={cx("av a6")}>S</span><div><div className={cx("h")}><b>Sara</b><span>Mentioned you in #general</span><time>1 h</time></div><p><span className={cx("at")}>@You</span> how did you price your founding tier?</p></div><span className={cx("dot")} /></div>
                  <div className={cx("mrow read")}><span className={cx("av a3")}>L</span><div><div className={cx("h")}><b>Lena</b><span>Direct message</span><time>Yesterday</time></div><p>Thanks for the welcome! Starting the course tonight.</p></div></div>
                  {state.joshCheckedIn ? (
                    <div className={cx("mrow read")}><span className={cx("av a2")}>Y</span><div><div className={cx("h")}><b>Josh</b><span>You checked in</span><time>now</time></div><p>{CHECK_IN_DRAFT}</p></div></div>
                  ) : null}
                </div>
              </div>
            </View>

            {/* The two channels share the channel view. */}
            <View index={1}>
              {state.page === "wins" ? (
                <div className="rp-scroll"><Feed items={WINS} onNote={(id) => go("know", id)} /></div>
              ) : (
                <GeneralPage state={state} dispatch={dispatch} />
              )}
            </View>

            {/* Knowledge: the community brain. */}
            <View index={2}>
              <div className="rp-brain">
                <KitBrainMap map={brain} size="page" now={now} selectedId={state.picked} onSelect={(id) => { track("brain_pick"); dispatch({ type: "pick", id }); }}
                  onClear={() => dispatch({ type: "pick", id: null })} />
              </div>
            </View>

            {/* Events. */}
            <View index={4}>
              <div className={cx("page")}>
                <div className={cx("card")} style={{ marginTop: 28, maxWidth: "none" }}>
                  <div className={cx("meta")}><span className={cx("livepill")}><i />Friday</span><span>10:00 am · every week</span></div>
                  <h2>Friday build call</h2>
                  <p className={cx("say")}>Jon is sharing the invitation that took him past 100 members. I'll save what's learned to Knowledge afterwards.</p>
                  <div className={cx("acts")}><Btn go>Join when it starts</Btn><Btn>Add to calendar</Btn></div>
                </div>
                <Since label="Coming up" style={{ marginTop: 32 }}>
                  <SinceItem kind="Tue" title="Office hours" detail="4:00 pm · bring one question" still />
                  <SinceItem kind="Dec 2" title="Launch week kickoff" detail="6:00 pm · Launch pod" still />
                </Since>
              </div>
            </View>

            {/* Members. */}
            <View index={5}>
              <div className={cx("page")} style={{ overflowY: "auto" }}>
                <p className={cx("sub")} style={{ margin: 0 }}>Everyone in {PREVIEW_COMMUNITY}, what they pay and who needs you.</p>
                <MembersToolbar search="" onSearch={() => undefined} filter="everyone" onFilter={() => undefined} onExport={() => undefined} exporting={false} canExport={false}
                  filters={[{ id: "everyone", label: "Everyone", count: 214 }, { id: "paid", label: "Paying", count: 151 }]} />
                <MembersTable rows={rows} avatarOf={() => null} now={now} timeFor={timeFor} dayFor={dayFor} sort={null} onSort={() => undefined}
                  selected={new Set()} onToggle={() => undefined} onToggleAll={() => undefined}
                  openKey={state.member} onOpen={(key) => { track("member_open"); dispatch({ type: "member", key }); }} empty="No one here."
                  getAvatarColor={colour} getInitials={initials} />
              </div>
            </View>
          </Main>

          {/* Right column. */}
          <Rail index={0} hostOnly label="The community right now">
            <Figs figures={[
              { label: "Members", value: "214", note: "3 joined this week" },
              { label: "Active this week", value: "132", note: "62 percent" },
              { label: "Revenue this month", value: "$7,350", note: "up $490" },
              { label: "Next payout", value: "$1,820", note: "Friday" },
            ]} />
            <Sep />
            <Sec label="Next up">
              <h3>Friday build call</h3>
              <p>Friday, 10:00 am · you're hosting</p>
            </Sec>
            <Sep />
            <Sec label="Your guide, this week">
              <p>Answered 41 questions, welcomed 3 members, and saved 4 things to Knowledge.</p>
            </Sec>
          </Rail>
          <Rail index={1} label="About this channel">
            <Sec label="In this channel · 214"><p>6 here now</p></Sec>
            <Sep />
            <Sec label="Your guide here"><p>Answers when tagged, from your courses and what the community has learned. Every answer links to where it came from.</p></Sec>
          </Rail>
          <Rail index={2} label="Picked">
            {picked ? (
              <Sec label={picked.where}><h3>{picked.title}</h3><p>{picked.say}</p></Sec>
            ) : (
              <Sec label="The community brain"><p>Courses, lessons and what members learn from each other, kept and connected. Click anything on the map.</p></Sec>
            )}
          </Rail>
          <Rail index={4} label="Events"><Sec label="This week"><p>Friday build call · 10:00 am</p><p>Office hours · Tuesday</p></Sec></Rail>
          <Rail index={5} label="Member">
            {open ? (
              <Sec label="Member">
                <h3>{open.name}</h3>
                <p>{open.plan.label} · joined {dayFor(open.joined_at)}</p>
                <p>Last active {open.user_id === JOSH && state.joshCheckedIn ? "— you checked in just now" : timeFor(open.last_active_at, now).toLowerCase()}</p>
                {open.user_id === JOSH ? (
                  <div style={{ marginTop: 12 }}><CheckInCard state={state} dispatch={dispatch} where="members" /></div>
                ) : null}
              </Sec>
            ) : (
              <Sec label="Who needs you"><p>Josh Reed has been quiet for 25 days. Open him to check in.</p></Sec>
            )}
          </Rail>
        </KitApp>
      </div>
    </div>
  );
}
