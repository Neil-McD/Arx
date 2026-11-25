import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { BarChart2, Boxes, CalendarDays, ChevronDown, ChevronRight, Hash, House, Inbox, Library, Plus, Search, UserPlus, Users } from "lucide-react";

import type { BrainAttach, BrainMap, BrainPoint } from "../../../../../shared/communityBrain";
import { brainFact, latestLearned } from "../../../../../shared/communityBrain";
import type { MemberTableRow } from "../../../../../shared/communityMembersTable";
import { memberKey } from "../../../../../shared/communityMembersTable";
import type { ReplyDraftView } from "../../../../../shared/communityReplyDrafts";
import type { MemberCoachDraftView } from "../../../../../shared/communityMemberCoachTypes";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import {
  Btn, Chips, Cover, Dock, Eyebrow, Hello, HomeBody, Icon, KitApp, Main, Mine, Rail, Scroll, Talk, TextLink, Theirs, cx,
} from "../../v1/kit";
import { KitBrainMap } from "../../v1/KitBrainMap";
import { GuideSuggests } from "../../v1/KitGuideSuggests";
import { JoinRequestsLine, MembersTable, MembersToolbar } from "../../v1/KitMembersTable";
import { NeedsYou, type HomeThing } from "../../v1/KitNeedsYou";
import { PanelAction, PanelLearned, PanelLine, PanelNext, PanelPart, PanelPeople } from "../../v1/KitPanel";

// The home page's product preview: Polynet as it is today, drawn with the
// app's own pieces (the frame and left column copied from the app's styles),
// in a made-up community (The Build Club) with made-up people. Every click
// moves a fixed script; nothing is sent anywhere. Only what Polynet does today.

export type PreviewPage = "home" | "inbox" | "general" | "wins" | "know" | "brain" | "events" | "members";

export type PreviewState = {
  page: PreviewPage;
  /** Join requests still waiting (ids). */
  waiting: string[];
  /** The guide's drafts still waiting on Home. */
  replyDraft: boolean;
  checkIn: boolean;
  /** The visitor sent the question waiting in #general's message box. */
  asked: boolean;
  answered: boolean;
  talk: string | null;
  member: string | null;
  picked: string | null;
  podsOpen: boolean;
};

export type PreviewAction =
  | { type: "open"; page: PreviewPage; picked?: string | null }
  | { type: "approve"; id: string }
  | { type: "decline"; id: string }
  | { type: "post_reply" }
  | { type: "skip_reply" }
  | { type: "send_check_in" }
  | { type: "skip_check_in" }
  | { type: "ask" }
  | { type: "answer" }
  | { type: "talk"; chip: string | null }
  | { type: "member"; key: string | null }
  | { type: "pick"; id: string | null }
  | { type: "pods" };

export const INITIAL_PREVIEW: PreviewState = {
  page: "home", waiting: ["r1", "r2"], replyDraft: true, checkIn: true, asked: false, answered: false,
  talk: null, member: null, picked: null, podsOpen: false,
};

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case "open":
      return { ...state, page: action.page, talk: null, member: action.page === "members" ? state.member : null,
        picked: action.picked !== undefined ? action.picked : action.page === "brain" ? state.picked : null };
    case "approve":
    case "decline":
      return { ...state, waiting: state.waiting.filter((id) => id !== action.id) };
    case "post_reply":
      return { ...state, replyDraft: false };
    case "skip_reply":
      return { ...state, replyDraft: false };
    case "send_check_in":
    case "skip_check_in":
      return { ...state, checkIn: false };
    case "ask":
      return state.asked ? state : { ...state, asked: true };
    case "answer":
      return state.asked ? { ...state, answered: true } : state;
    case "talk":
      return { ...state, talk: action.chip };
    case "member":
      return { ...state, member: action.key };
    case "pick":
      return { ...state, picked: action.id };
    case "pods":
      return { ...state, podsOpen: !state.podsOpen };
  }
}

export const PREVIEW_COMMUNITY = "The Build Club";
const BANNER = "/design-lab/polynet-earth.webp";

const JOIN_REQUESTS = [
  { id: "r1", userId: "x1", displayName: "Kai Tanaka", avatarUrl: null, message: "I sell templates for freelancers. Want to turn it into a course.", createdAtLabel: "2 hours ago" },
  { id: "r2", userId: "x2", displayName: "Rosa Lind", avatarUrl: null, message: null, createdAtLabel: "Yesterday" },
];

const REPLY_DRAFT: ReplyDraftView = {
  id: "d1", author: "Priya", channel: "general", hours_waiting: 3,
  question: "Anyone tried a founding-member price?",
  text: "Yes. Three members did this in Start here's pricing lesson: 30 seats at half price, then the full price once they're gone. The note \"Founding-member pricing\" in Knowledge has their numbers.",
  source: "Pricing your first offer",
};

export const CHECK_IN_TEXT =
  "Hey Josh, we've missed you on the last two calls. Friday's call covers pricing, the thing you asked about in your first week. Hope to see you there.";

const CHECK_IN: MemberCoachDraftView = {
  id: "c1", member_name: "Josh Reed", member_handle: "josh-reed", reason: "quiet_member" as MemberCoachDraftView["reason"],
  reason_label: "Quiet member", signal_summary: "Quiet for 25 days and missed the last two calls.",
  text: CHECK_IN_TEXT, created_at: new Date().toISOString(),
};

export const QUESTION = "@guide where's the lesson on finding your first customers?";
export const GUIDE_REPLY =
  "It's Lesson 4 of Start here, \"Your first ten customers\". The short version: start with people who already asked you for help, then ask each one who else has the same problem.";

// The live app's chips on Home, and what the guide says to each.
export const CHIP_ANSWERS: Record<string, string> = {
  "How was this week?": "Busy. 132 people were active, three joined, and I answered 41 questions. Jon's invitation post was the most useful thing shared.",
  "Who is at risk of leaving?": "Josh. He's been quiet for 25 days and missed the last two calls. I've drafted a check-in for you, it's under Your guide suggests.",
  "Who should I welcome?": "Lena joined yesterday and said hello in #general. Kai and Rosa are waiting to join, so you could welcome them once you let them in.",
};

function track(action: string) {
  captureProductAnalyticsEvent("preview_used", { action });
}

function lessMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// ---------- a channel, in the app's message style ----------

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

function Feed(props: { items: Array<Message | string>; onNote: (id: string) => void }) {
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
    </div>
  );
}

function Composer(props: { value: string; placeholder: string; sent: boolean; glow?: boolean; onSend?: () => void }) {
  return (
    <form className="rpw-composer" onSubmit={(event) => { event.preventDefault(); if (!props.sent) props.onSend?.(); }}>
      <input type="text" readOnly value={props.sent ? "" : props.value} placeholder={props.placeholder} aria-label={props.placeholder} />
      <span className="rpw-composer-tools" aria-hidden="true"><Plus size={15} /><span>@</span><Icon name="mic" /></span>
      <button type="submit" className={props.glow && !props.sent ? "rpw-send rp-glow" : "rpw-send"} aria-label="Send" disabled={props.sent || !props.onSend}><Icon name="up" /></button>
    </form>
  );
}

function ChannelPage(props: { state: PreviewState; dispatch: (action: PreviewAction) => void; slug: "general" | "wins" }) {
  const { state, dispatch } = props;
  const words = GUIDE_REPLY.split(" ");
  const [shown, setShown] = useState(0);
  const feed = useRef<HTMLDivElement | null>(null);
  const general = props.slug === "general";
  useEffect(() => {
    if (!general || !state.asked || state.answered) return;
    const thinking = window.setTimeout(() => dispatch({ type: "answer" }), lessMotion() ? 0 : 900);
    return () => window.clearTimeout(thinking);
  }, [general, state.asked, state.answered, dispatch]);
  useEffect(() => {
    if (!state.answered) return;
    if (lessMotion()) { setShown(words.length); return; }
    if (shown >= words.length) return;
    const next = window.setTimeout(() => setShown((count) => count + 1), 40);
    return () => window.clearTimeout(next);
  }, [state.answered, shown, words.length]);
  useEffect(() => {
    const node = feed.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [props.slug, state.asked, state.answered, shown, state.replyDraft]);
  const typing = state.answered && shown < words.length;
  const extra: Array<Message | string> = general ? [
    ...(state.replyDraft ? [] : [{ who: "Guide", tone: "guide", guide: true, time: "now", text: REPLY_DRAFT.text, note: { title: "Founding-member pricing", id: "note:founding" } } as Message]),
    ...(state.asked ? [
      { who: "You", tone: "a2", host: true, time: "now", text: <><span className={cx("at")}>@guide</span> where's the lesson on finding your first customers?</> } as Message,
      { who: "Guide", tone: "guide", guide: true, time: "now",
        text: state.answered ? <>{words.slice(0, shown).join(" ")}{typing ? <span className="rp-caret" aria-hidden="true" /> : null}</> : <span className="rp-thinking">Looking through your courses…</span>,
        note: state.answered && !typing ? { title: "Your first ten customers", id: "resource:first10" } : undefined } as Message,
    ] : []),
  ] : [];
  return (
    <div className="rpw-channel">
      <div className="rpw-feed" ref={feed} aria-live="polite">
        <KitApp view="wins" part="flow">
          <Feed items={[...(general ? GENERAL : WINS), ...extra]} onNote={(id) => dispatch({ type: "open", page: "brain", picked: id })} />
        </KitApp>
      </div>
      <div className="rpw-dock">
        {general ? (
          <Composer value={QUESTION} placeholder="Message #general" sent={state.asked} glow onSend={() => { track("guide_asked"); dispatch({ type: "ask" }); }} />
        ) : (
          <Composer value="" placeholder="Message #wins" sent={false} />
        )}
      </div>
    </div>
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

function learnedWhen(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

// The panels' brain part, as the app draws it: the small map, the count, the latest names, Open.
function BrainPart(props: { map: BrainMap; now: number; onOpen: () => void }) {
  return (
    <PanelPart label="The community brain" action={<PanelAction onClick={props.onOpen}>Open</PanelAction>}>
      <button type="button" className={cx("brainmini")} onClick={props.onOpen} aria-label="Open the community brain">
        <KitBrainMap map={props.map} size="panel" now={props.now} />
      </button>
      {brainFact(props.map) ? <span className={cx("braincap")}>{brainFact(props.map)}</span> : null}
      {latestLearned(props.map, 2).map((note) => <PanelLearned key={note.id} title={note.title} when={learnedWhen(note.at, props.now)} />)}
    </PanelPart>
  );
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

// ---------- the frame ----------

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function useFitScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.875);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Fits the width; on a phone it stops shrinking and is cut off at the right edge.
    const fit = () => setScale(Math.max(0.6, Math.min(1, node.clientWidth / DESIGN_WIDTH)));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(fit);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  return { ref, scale };
}

function NavRow(props: { icon: ReactNode; label: string; on?: boolean; hint?: string; count?: string; dot?: boolean; onClick?: () => void; chevron?: ReactNode }) {
  const inner = (
    <>
      <span className="rpw-ic">{props.icon}</span>
      <span className="rpw-label">{props.label}</span>
      {props.chevron}
      {props.count ? <span className="rpw-count">{props.count}</span> : null}
      {props.hint ? <span className="rpw-hint">{props.hint}</span> : null}
      {props.dot ? <span className="rpw-dot" aria-hidden="true" /> : null}
    </>
  );
  return props.onClick
    ? <button type="button" className={props.on ? "rpw-row on" : "rpw-row"} aria-current={props.on ? "page" : undefined} onClick={props.onClick}>{inner}</button>
    : <div className="rpw-row">{inner}</div>;
}

const TITLES: Partial<Record<PreviewPage, ReactNode>> = {
  home: "Home",
  inbox: "Inbox",
  general: <span className="rpw-ch"><Hash size={15} />general<ChevronDown size={13} /></span>,
  wins: <span className="rpw-ch"><Hash size={15} />wins<ChevronDown size={13} /></span>,
  know: "Knowledge",
  events: "Events",
  members: "Members",
};

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
  const page = state.page;
  const things: HomeThing[] = [
    { key: "sara", icon: "question", title: "Sara asked how you priced your founding tier", detail: "In Inbox · 1 hour ago", action: "Reply", strong: true, onAction: () => go("inbox") },
  ];
  const requests = JOIN_REQUESTS.filter((request) => state.waiting.includes(request.id));

  // The right column for each page, drawn as the app draws it.
  const rail: ReactNode = (() => {
    if (page === "home") {
      return (
        <KitApp view="home" host part="rail"><Rail index={0} label="The community today">
          <PanelPart label="Next up" fact="Friday" action={<PanelAction onClick={() => go("events")}>All events</PanelAction>}>
            <PanelNext title="Friday build call" sub="10:00 am · you're hosting" onClick={() => go("events")} />
          </PanelPart>
          <BrainPart map={brain} now={now} onOpen={() => go("brain")} />
          <PanelPart label="Here" fact="214 members">
            <PanelPeople names={["Maya Chen", "Dev Patel", "Priya Shah", "Jon Park", "Lena Novak", "Sara Lind"]} max={4} />
            <PanelLine>3 joined this week</PanelLine>
          </PanelPart>
        </Rail></KitApp>
      );
    }
    if (page === "general" || page === "wins") {
      return (
        <KitApp view="wins" part="rail"><Rail index={1} label="About this channel">
          <PanelPart label="About"><p className={cx("chabout")}>{page === "general" ? "Say hello, ask anything. The guide answers when you tag it." : "Share what worked, big or small."}</p></PanelPart>
          {page === "general" ? (
            <PanelPart label="Pinned">
              <div className={cx("chpin")}>
                <span className={cx("chpin-by")}><b>You</b><em>2 weeks ago</em></span>
                <strong className={cx("chpin-title")}>Start here</strong>
                <div className={cx("chpin-body")}><p>New? Take the Start here course first. It's five short lessons and the guide can answer anything in it.</p></div>
              </div>
            </PanelPart>
          ) : null}
          <PanelPart label="Here" fact="214 members" action={<PanelAction onClick={() => go("members")}>Everyone</PanelAction>}>
            <PanelPeople names={["Maya Chen", "Dev Patel", "Priya Shah", "Jon Park", "Lena Novak", "Sara Lind"]} max={5} />
            <PanelLine>6 here now</PanelLine>
          </PanelPart>
        </Rail></KitApp>
      );
    }
    if (page === "know") {
      return (
        <KitApp view="know" part="rail"><Rail index={2} label="Knowledge">
          <PanelPart label="Waiting on an answer" fact="1">
            <PanelLine action={<PanelAction onClick={() => go("general")}>Teach</PanelAction>}>How do I run a waitlist?</PanelLine>
          </PanelPart>
          <BrainPart map={brain} now={now} onOpen={() => go("brain")} />
          <PanelPart label="Learning">
            <PanelLine fact="38 started · 21 finished">Start here</PanelLine>
            <PanelLine fact="12 started · 3 finished">Launch week</PanelLine>
          </PanelPart>
        </Rail></KitApp>
      );
    }
    if (page === "brain") {
      return (
        <KitApp view="know" part="rail"><Rail index={2} label="Picked">
          {picked ? (
            <PanelPart label={picked.where}><p className={cx("chabout")}><b>{picked.title}</b></p><PanelLine dim>{picked.say}</PanelLine></PanelPart>
          ) : (
            <PanelPart label="The community brain"><PanelLine dim>Courses, lessons and what members learn from each other, kept and connected. Click anything on the map.</PanelLine></PanelPart>
          )}
        </Rail></KitApp>
      );
    }
    if (page === "events") {
      return (
        <KitApp view="events" part="rail"><Rail index={4} label="This event">
          <PanelPart label="Friday build call" fact="weekly">
            <PanelLine>Fridays, 10:00 am</PanelLine>
            <PanelLine dim>Jon is sharing the invitation that took him past 100 members. What's learned is saved to Knowledge afterwards.</PanelLine>
          </PanelPart>
        </Rail></KitApp>
      );
    }
    if (page === "members" && open) {
      const josh = open.user_id === JOSH;
      return (
        <KitApp view="members" part="rail"><Rail index={5} label="Member">
          <div className="rpw-record-top"><button type="button" onClick={() => dispatch({ type: "member", key: null })}>← Members</button></div>
          <PanelPart label={open.name}>
            <PanelLine fact={open.plan.label}>Plan</PanelLine>
            <PanelLine fact={dayFor(open.joined_at)}>Joined</PanelLine>
            <PanelLine fact={timeFor(open.last_active_at, now)}>Last active</PanelLine>
          </PanelPart>
          {josh ? (
            <PanelPart label="Journey · steers your guide">
              <PanelLine dim>Quiet for 25 days. Asked about pricing in his first week.</PanelLine>
              {state.checkIn ? <TextLink onClick={() => go("home")}>A check-in is drafted on Home</TextLink> : <PanelLine>You checked in today.</PanelLine>}
            </PanelPart>
          ) : null}
          <PanelPart label="Notes · only hosts see these">
            <PanelLine dim>{josh ? "Wants to launch in January." : "No notes yet."}</PanelLine>
          </PanelPart>
        </Rail></KitApp>
      );
    }
    if (page === "inbox") {
      return (
        <div className="rpw-convo">
          <div className="rpw-convo-head"><b>Jon Park</b><span>Direct message</span></div>
          <KitApp view="inbox" part="flow">
            <div className="rpw-bubbles">
              <div className="rpw-theirs"><span className={cx("av a1")}>J</span><p>Thanks for asking me to share on Friday.</p></div>
              <Mine>Can't wait. Bring the numbers too.</Mine>
              <div className="rpw-theirs"><span className={cx("av a1")}>J</span><p>Happy to share the full invitation sequence if you want it for Friday.</p></div>
            </div>
          </KitApp>
          <Composer value="" placeholder="Reply to Jon" sent={false} />
        </div>
      );
    }
    return null;
  })();

  const main: ReactNode = (() => {
    switch (page) {
      case "home":
        return (
          <KitApp view="home" host talking={Boolean(state.talk)} part="main">
            <Main>
            <Scroll>
              {state.talk ? (
                <HomeBody>
                  <Talk>
                    <Mine>{state.talk}</Mine>
                    <Theirs><p>{CHIP_ANSWERS[state.talk]}</p></Theirs>
                  </Talk>
                  <TextLink style={{ marginTop: 20 }} onClick={() => dispatch({ type: "talk", chip: null })}>Back to Home</TextLink>
                </HomeBody>
              ) : (
                <HomeBody>
                  <Eyebrow community={PREVIEW_COMMUNITY} time="9:24 am" />
                  <Hello greeting="Good morning, Alex." line="" />
                  <div className={cx("hbrief")}>
                    <p>Most of the talk is about pricing a first offer: Dev settled on $49 after the guide's answer, and Priya is weighing a founding-member price. Jon's three-line invitation took him past 100 members, and Friday's call is where it's all headed.</p>
                    <span><em>Written 2 hours ago</em>
                      <button type="button" onClick={() => go("general")}>#general</button>
                      <button type="button" onClick={() => go("wins")}>#wins</button>
                    </span>
                  </div>
                  <NeedsYou label="Needs you"
                    join={{ requests, loaded: true, decidingId: null,
                      onApprove: (id) => { track("join_approved"); dispatch({ type: "approve", id }); },
                      onDecline: (id) => { track("join_declined"); dispatch({ type: "decline", id }); } }}
                    joinCount={requests.length} onShowAllJoinRequests={() => go("members")} things={things} />
                  <GuideSuggests
                    drafts={state.replyDraft ? [REPLY_DRAFT] : []}
                    onPost={async () => { track("reply_posted"); dispatch({ type: "post_reply" }); return null; }}
                    onSkip={() => dispatch({ type: "skip_reply" })}
                    coachDrafts={state.checkIn ? [CHECK_IN] : []}
                    onSendCoach={async () => { track("check_in_sent"); dispatch({ type: "send_check_in" }); return null; }}
                    onSkipCoach={() => dispatch({ type: "skip_check_in" })} />
                  {!state.replyDraft && !state.checkIn && requests.length === 0 ? <p className={cx("hnone")}>Nothing else needs you today.</p> : null}
                </HomeBody>
              )}
            </Scroll>
            <Dock>
              <Chips chips={Object.keys(CHIP_ANSWERS)} onChip={(chip) => { track("home_chip"); dispatch({ type: "talk", chip }); }} />
              <form className={cx("ask")} onSubmit={(event) => event.preventDefault()}>
                <Icon name="spark" extra="sp" />
                <input type="text" readOnly placeholder="Ask your guide anything" aria-label="Ask your guide anything" />
                <span className={cx("ib")}><Icon name="mic" /></span>
                <span className={cx("send")}><Icon name="up" /></span>
              </form>
            </Dock>
            </Main>
          </KitApp>
        );
      case "general":
      case "wins":
        return <ChannelPage state={state} dispatch={dispatch} slug={page} />;
      case "know":
        return (
          <div className="rpw-page">
            <KitApp view="know" part="flow" host>
              <p className={cx("lead")} style={{ marginTop: 0 }}><span className={cx("aura")}><Icon name="spark" /></span>Members have started 2 courses between them.</p>
              <button type="button" className={cx("ask kask kask-btn")} onClick={() => go("brain")}><Icon name="spark" extra="sp" /><span>Ask anything {PREVIEW_COMMUNITY} knows</span></button>
              <span className={cx("lab")} style={{ display: "block", marginTop: 28 }}>Courses</span>
              <div className={cx("kgrid")} style={{ marginTop: 12 }}>
                {brain.courses.map((course, index) => (
                  <div key={course.id} className={cx("kcard")}>
                    <button type="button" className={cx("kcourse")} onClick={() => go("brain", course.lessons[0]?.id ?? null)}>
                      <span className={cx("kcover", index === 0 ? "t2" : "t5")}><Icon name="book" /></span>
                      <b><i className={cx("knum")}>{index + 1}</i><span>{course.name}</span></b>
                      <span className={cx("kmeta")}><span>{index === 0 ? "38 started · 21 finished" : "12 started · 3 finished"}</span><span className={cx("right")}>{course.lessons.length} lessons</span></span>
                    </button>
                  </div>
                ))}
                <button type="button" className={cx("kcourse knew")} disabled><Icon name="plus" />New course</button>
              </div>
            </KitApp>
          </div>
        );
      case "brain":
        return (
          <div className="rpw-brain">
            <KitApp view="know" part="main">
              <KitBrainMap map={brain} size="page" now={now} selectedId={state.picked}
                onSelect={(id) => { track("brain_pick"); dispatch({ type: "pick", id }); }} onClear={() => dispatch({ type: "pick", id: null })} />
            </KitApp>
          </div>
        );
      case "events":
        return (
          <div className="rpw-page">
            <KitApp view="events" part="flow" host>
              <div className={cx("card")} style={{ marginTop: 0, maxWidth: "none" }}>
                <div className={cx("meta")}><span className={cx("livepill")}><i />Friday</span><span>10:00 am · every week</span></div>
                <h2>Friday build call</h2>
                <p className={cx("say")}>Jon is sharing the invitation that took him past 100 members. I'll save what's learned to Knowledge afterwards.</p>
                <div className={cx("acts")}><Btn go>Join when it starts</Btn><Btn>Add to calendar</Btn></div>
              </div>
              <span className={cx("lab")} style={{ display: "block", marginTop: 32 }}>Coming up</span>
              <div className="rpw-events">
                <div><b>Office hours</b><span>Tuesday · 4:00 pm · bring one question</span></div>
                <div><b>Launch week kickoff</b><span>Dec 2 · 6:00 pm · Launch pod</span></div>
              </div>
            </KitApp>
          </div>
        );
      case "members":
        return (
          <div className="rpw-page">
            <KitApp view="members" part="flow" host>
              <JoinRequestsLine count={requests.length} open={false} onOpen={() => go("home")} />
              <MembersToolbar search="" onSearch={() => undefined} filter="everyone" onFilter={() => undefined} onExport={() => undefined} exporting={false} canExport
                filters={[{ id: "everyone", label: "Everyone", count: 214 }, { id: "paid", label: "$49 a month", count: 151 }]} />
              <MembersTable rows={rows} avatarOf={() => null} now={now} timeFor={timeFor} dayFor={dayFor} sort={null} onSort={() => undefined}
                selected={new Set()} onToggle={() => undefined} onToggleAll={() => undefined}
                openKey={state.member} onOpen={(key) => { track("member_open"); dispatch({ type: "member", key }); }} empty="No one here."
                getAvatarColor={colour} getInitials={initials} />
            </KitApp>
          </div>
        );
      case "inbox":
        return (
          <div className="rpw-page">
            <KitApp view="inbox" part="flow" host>
              <p className={cx("lead")} style={{ marginTop: 0 }}><span className={cx("aura")}><Icon name="spark" /></span>2 of these need a reply. The newest is from Jon.</p>
              <div className={cx("filters")} style={{ marginTop: 18 }}><span className={cx("chip sel")}>Needs a reply · 2</span><span className={cx("chip")}>Everything</span><span className={cx("chip")}>Only {PREVIEW_COMMUNITY}</span></div>
              <div className={cx("list")} style={{ marginTop: 14 }}>
                <div className={cx("mrow one sel")}><span className={cx("av a1")}>J</span><div><div className={cx("h")}><b>Jon Park</b><span>{PREVIEW_COMMUNITY}</span><time>20 min</time></div><p>Happy to share the full invitation sequence if you want it for Friday.</p></div><span className={cx("dot")} /></div>
                <div className={cx("mrow one")}><span className={cx("av a6")}>S</span><div><div className={cx("h")}><b>Sara Lind</b><span>{PREVIEW_COMMUNITY}</span><time>1 h</time></div><p>How did you price your founding tier?</p></div><span className={cx("dot")} /></div>
                <div className={cx("mrow one read")}><span className={cx("av a3")}>L</span><div><div className={cx("h")}><b>Lena Novak</b><span>{PREVIEW_COMMUNITY}</span><time>Yesterday</time></div><p>Thanks for the welcome! Starting the course tonight.</p></div></div>
                {!state.checkIn ? <div className={cx("mrow one read")}><span className={cx("av a2")}>J</span><div><div className={cx("h")}><b>Josh Reed</b><span>You checked in</span><time>now</time></div><p>{CHECK_IN_TEXT}</p></div></div> : null}
              </div>
            </KitApp>
          </div>
        );
    }
  })();

  const title = page === "brain"
    ? <span className="rpw-ch"><button type="button" className="rpw-back" onClick={() => go("know")}>← Knowledge</button>The community brain</span>
    : TITLES[page];

  return (
    <div ref={ref} className={played ? "rp played" : "rp"} style={{ height: DESIGN_HEIGHT * scale }}
      role="region" aria-label={`A working preview of Polynet, in a made-up community called ${PREVIEW_COMMUNITY}`}>
      <div className="rp-stage rpw" style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, zoom: scale }}>
        <aside className="rpw-nav" aria-label="Community">
          <div className="rpw-cover">
            <KitApp view="home" part="cover" banner={BANNER} bannerPosition="72% 38%"><Cover name={PREVIEW_COMMUNITY} onSwitch={() => go("home")} /></KitApp>
          </div>
          <div className="rpw-search"><Search size={14} /><span>Search or ask</span><kbd>⌘K</kbd></div>
          <NavRow icon={<House size={14} />} label="Home" on={page === "home"} onClick={() => go("home")} />
          <NavRow icon={<Inbox size={14} />} label="Inbox" count="2" on={page === "inbox"} onClick={() => go("inbox")} />
          <div className="rpw-section"><span>Channels</span><Plus size={13} /></div>
          <NavRow icon={<Hash size={14} />} label="general" on={page === "general"} onClick={() => go("general")} />
          <NavRow icon={<Hash size={14} />} label="wins" dot={page !== "wins"} on={page === "wins"} onClick={() => go("wins")} />
          <NavRow icon={<Hash size={14} />} label="intros" />
          <div className="rpw-section"><span>Community</span></div>
          <NavRow icon={<Boxes size={14} />} label="Pods" chevron={state.podsOpen ? <ChevronDown size={12} className="rpw-chev" /> : <ChevronRight size={12} className="rpw-chev" />} onClick={() => dispatch({ type: "pods" })} />
          {state.podsOpen ? <div className="rpw-pods"><NavRow icon={<span className="rpw-podmark" />} label="Launch pod" /></div> : null}
          <NavRow icon={<Library size={14} />} label="Knowledge" on={page === "know" || page === "brain"} onClick={() => go("know")} />
          <NavRow icon={<CalendarDays size={14} />} label="Events" on={page === "events"} onClick={() => go("events")} />
          <NavRow icon={<Users size={14} />} label="Members" hint="214" on={page === "members"} onClick={() => go("members")} />
          <div className="rpw-foot">
            <NavRow icon={<BarChart2 size={14} />} label="Analytics" />
            <NavRow icon={<UserPlus size={14} />} label="Invite people" />
            <div className="rpw-me"><span className="rpw-av">A</span><div><b>Alex Rivera</b><span>Host</span></div></div>
          </div>
        </aside>
        <main className={rail ? "rpw-panel has-rail" : "rpw-panel"}>
          <header className="rpw-head">{title}</header>
          <div className="rpw-body">{main}</div>
          {rail ? <div className="rpw-rail">{rail}</div> : null}
        </main>
      </div>
    </div>
  );
}
