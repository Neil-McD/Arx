import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronRight, Hash, Library, Plus, Repeat, Video } from "lucide-react";
import { cardAction, cardLines, type EntityTarget } from "../../../../../shared/entityChips";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { eventDateBlock, eventDayWord } from "../communityEventsList";
import { Ask, Chips, Dock, Eyebrow, Icon, KitApp, Mine, Talk, Theirs, cx } from "../../v1/kit";
import { EVENTS, PREVIEW_COMMUNITY } from "./RealAppPreview";

// The guide section's scene, made from the app's own parts (docs: the plan
// "guide sections", Nov 25). In front, the member's private guide chat as it
// is on Home: their question, the guide's answer, the suggestion chips and
// the box. Behind it, the place the answer points to, lit: a lesson in its
// course, a channel, an event. In the answer, the name of that place is the
// app's chip (shared/entityChipsUi.tsx), and resting on it opens its card.
// Every line in the section's feature list is something you can see here.

type Source = "lesson" | "wins" | "call";
type AskItem = { question: string; source: Source; before: string; target: EntityTarget; label: string; after: string };

const COURSE = "Start here";

export const LESSON_TARGET: EntityTarget = {
  kind: "lesson", name: "Pricing your first offer", path: "/#guide",
  facts: { courseName: COURSE, finished: false, hasVideo: true },
};
const WINS_TARGET: EntityTarget = {
  kind: "channel", name: "wins", path: "/#guide",
  facts: { about: "Share what worked this week, big or small." },
};

export function guideAsks(now: number): AskItem[] {
  const { next } = EVENTS(now);
  const day = new Date(next.at).toLocaleDateString("en-US", { weekday: "long" });
  return [
    {
      question: "How should I price my first offer?", source: "lesson",
      before: "Start with one clear result and one price. Priya and Jon both gave their first ten a founding price. ",
      target: LESSON_TARGET, label: "Pricing your first offer", after: " has three examples from members here.",
    },
    {
      question: "Where do people share what's working?", source: "wins",
      before: "In ", target: WINS_TARGET, label: "wins",
      after: ". Jon posted the invitation that got him 11 members in two days, word for word.",
    },
    {
      question: "Is there a call this week?", source: "call",
      before: "Yes. The ",
      target: { kind: "event", name: next.title, path: "/#guide", startsAt: new Date(next.at).toISOString(), facts: { where: "online", repeats: "weekly" } },
      label: next.title, after: ` is on ${day} at ${next.clock.replace(":00 ", "")}, on Zoom. Jon is sharing his invitation.`,
    },
  ];
}

function track(action: string) {
  captureProductAnalyticsEvent("guide_scene_used", { action });
}

function lessMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// The app's chip and its card: the same look and the same lines
// (shared/entityChips.ts), opened by resting on it, or by a tap.
function Chip(props: { target: EntityTarget; label: string; open: boolean; onOpen: (open: boolean) => void }) {
  const { target } = props;
  const lines = cardLines(target);
  const action = cardAction(target);
  return (
    <span className="entity-chip-wrap" onMouseEnter={() => props.onOpen(true)} onMouseLeave={() => props.onOpen(false)}>
      <button type="button" className={`entity-chip is-${target.kind}`} aria-expanded={props.open} onClick={() => props.onOpen(!props.open)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {target.kind === "lesson" ? <><circle cx="12" cy="12" r="10" /><path d="m10 8 6 4-6 4z" /></>
            : target.kind === "channel" ? <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
              : <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>}
        </svg>
        <span className="entity-chip-name">{props.label}</span>
      </button>
      <span className={`entity-card${props.open ? " is-open" : ""}`} role="group" aria-label={`${target.name} preview`}>
        <span className="entity-card-name">{target.kind === "channel" ? `#${target.name}` : target.name}</span>
        {lines.map((line) => <span key={line} className="entity-card-line">{line}</span>)}
        <span className="entity-card-action">{action.label} →</span>
      </span>
    </span>
  );
}

// ---------- behind: the place the answer points to ----------

// The preview's own course (RealAppPreview's buildClubBrain), as Dev has it.
const LESSONS: Array<[title: string, done?: boolean]> = [
  ["Welcome to the club", true], ["Picking your first offer", true], ["Pricing your first offer"], ["Your first ten customers"],
];
const LIT = 2;

function CoursePage(props: { lit: boolean }) {
  return (
    <div className="rpw-page gsc-page">
      <KitApp view="know" part="flow">
        <p className={cx("lab")} style={{ margin: "0 0 6px" }}>Course · 4 lessons</p>
        <h2 className="gsc-h">{COURSE}</h2>
        <p className={cx("sub")} style={{ margin: "6px 0 22px" }}>2 of 4 done</p>
        <div className={cx("klrows")}>
          {LESSONS.map(([title, done], index) => {
            const lit = props.lit && index === LIT;
            return (
              <div key={title} className={[cx("kl", lit && "on", done && "d"), lit ? "gsc-lit" : ""].filter(Boolean).join(" ")}>
                <span className={cx("kdot", done ? "done" : index === LIT ? "now" : "")}>{done ? <Icon name="check" /> : null}</span>
                <span className={cx("kl-t")}>{title}</span>
              </div>
            );
          })}
        </div>
      </KitApp>
    </div>
  );
}

type Post = { who: string; tone: string; time: string; text: ReactNode; guide?: boolean; reactions?: string[]; replies?: string; lit?: boolean };

function WinsPage(props: { lit: boolean }) {
  const posts: Array<Post | string> = [
    "Tuesday",
    { who: "Jon", tone: "a1", time: "4:02 pm", lit: true, reactions: ["🔥 6", "🙌 4"], replies: "3 replies",
      text: "Sent my invitation to 40 people from my newsletter. 11 joined in two days. Here's the exact message I used." },
    { who: "Priya", tone: "a3", time: "5:18 pm", reactions: ["🎉 9"], text: "First sale! A founding seat at $29. Tiny, but it's real." },
    "Today",
    { who: "Kai", tone: "a5", time: "9:12 am", text: <><span className={cx("at")}>@guide</span> what should a founding seat cost?</> },
    { who: "Guide", tone: "guide", guide: true, time: "9:12 am",
      text: <>Founding seats here have landed between $29 and $49. <span className="entity-chip is-lesson gsc-static">Pricing your first offer</span> has three examples.</> },
  ];
  return (
    <div className="rpw-channel gsc-page">
      <KitApp view="wins" part="flow">
        <div className={cx("feed")}>
          {posts.map((item, index) => typeof item === "string" ? <div key={index} className={cx("day")}>{item}</div> : (
            <div key={index} className={[cx("msg", item.guide && "g"), props.lit && item.lit ? "gsc-lit" : ""].filter(Boolean).join(" ")}>
              <span className={cx("av", item.tone)}>{item.guide ? <Icon name="spark" /> : item.who.slice(0, 1)}</span>
              <div className={cx("b")}>
                <div className={cx("h")}>
                  <b>{item.guide ? PREVIEW_COMMUNITY : item.who}</b>
                  {item.guide ? <span className={cx("tag g")}>guide</span> : null}
                  <time>{item.time}</time>
                </div>
                <p>{item.text}</p>
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
      </KitApp>
    </div>
  );
}

function CallPage(props: { lit: boolean; now: number }) {
  const { next, later } = EVENTS(props.now);
  const block = eventDateBlock(next.at, false);
  return (
    <div className="rpw-page gsc-page">
      <KitApp view="events" part="flow">
        <div className={cx("evtop")}>
          <div>
            <p className={cx("evlead")}>{later.length + 1} coming up.</p>
            <p className={cx("sub")} style={{ margin: "4px 0 0" }}>Times are in your time zone.</p>
          </div>
          <span className={cx("btn go")}><Plus size={14} aria-hidden="true" />Add an event</span>
        </div>
        <span className={cx("lab")} style={{ display: "block", marginTop: 28 }}>Next</span>
        <div className={[cx("evnext", props.lit && "on"), props.lit ? "gsc-lit" : ""].filter(Boolean).join(" ")}>
          <span className={cx("evday")}><b>{block.number}</b><span>{block.word}</span></span>
          <div>
            <span className={cx("evsoon")}><i />In 2 days</span>
            <h2>{next.title}<span className={cx("evtag")}><Repeat size={11} aria-hidden="true" />Every {new Date(next.at).toLocaleDateString("en-US", { weekday: "long" })}</span></h2>
            <p className={cx("evnext-when")}>{eventDayWord(next.at, props.now)} · {next.clock} your time</p>
            <p className={cx("evnext-where")}><Video size={14} aria-hidden="true" />{next.place}</p>
            <p className={cx("evnext-say")}>{next.say}</p>
          </div>
        </div>
        <span className={cx("lab")} style={{ display: "block", marginTop: 28 }}>Later</span>
        <div className={cx("evrows")}>
          {later.slice(0, 2).map((event) => {
            const day = eventDateBlock(event.at, false);
            return (
              <div key={event.id} className={cx("evrow")}>
                <span className={cx("evday sm")}><b>{day.number}</b><span>{day.word}</span></span>
                <span className={cx("evrow-t")}><b>{event.title}</b><small>{[eventDayWord(event.at, props.now), event.clock, event.place].join(" · ")}</small></span>
                <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" className={cx("evrow-go")} />
              </div>
            );
          })}
        </div>
      </KitApp>
    </div>
  );
}

const HEADS: Record<Source, ReactNode> = {
  lesson: <span className="rpw-ch"><Library size={15} aria-hidden="true" />Knowledge</span>,
  wins: <span className="rpw-ch"><Hash size={15} aria-hidden="true" />wins</span>,
  call: <span className="rpw-ch"><CalendarDays size={15} aria-hidden="true" />Events</span>,
};

// ---------- the scene ----------

export function GuideScene() {
  const [now] = useState(() => Date.now());
  const asks = guideAsks(now);
  const [asked, setAsked] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [card, setCard] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  const ask = (index: number, auto = false) => {
    started.current = true;
    if (!auto) track(`ask_${asks[index].source}`);
    setAsked(index);
    setCard(false);
    setAnswered(lessMotion());
  };

  useEffect(() => {
    if (asked === null || answered) return;
    const thinking = window.setTimeout(() => setAnswered(true), 1100);
    return () => window.clearTimeout(thinking);
  }, [asked, answered]);

  // It plays its first question by itself as it comes into view, and shows
  // the chip's card once, so the scene is never empty and the chip is found.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") { ask(0, true); return; }
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || started.current) return;
      seen.disconnect();
      ask(0, true);
      if (!lessMotion()) {
        window.setTimeout(() => setCard(true), 1900);
        window.setTimeout(() => setCard(false), 4600);
      }
    }, { threshold: 0.45 });
    seen.observe(node);
    return () => seen.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = asked === null ? null : asks[asked];
  const source: Source = current?.source ?? "lesson";
  const lit = answered && current !== null;

  return (
    <div className="gsc" ref={root}>
      <div className="gsc-back" aria-hidden="true">
        <div className="rpw gsc-win">
          <div className="rpw-panel">
            <div className="rpw-head">{HEADS[source]}</div>
            <div className="rpw-body" key={source}>
              {source === "lesson" ? <CoursePage lit={lit} /> : source === "wins" ? <WinsPage lit={lit} /> : <CallPage lit={lit} now={now} />}
            </div>
          </div>
        </div>
      </div>
      <div className="gsc-front">
        <KitApp view="home" part="main" talking>
          <div className="gsc-chat">
            <Eyebrow community={PREVIEW_COMMUNITY} time="2:07 am" />
            <div className="gsc-talk" aria-live="polite">
              {current ? (
                <Talk>
                  <Mine>{current.question}</Mine>
                  {answered ? (
                    <Theirs>
                      <p className="gsc-answer">{current.before}<Chip target={current.target} label={current.label} open={card} onOpen={(open) => { if (open) track("chip"); setCard(open); }} />{current.after}</p>
                    </Theirs>
                  ) : (
                    <Theirs><p className="gsc-typing" aria-label="Your guide is writing"><i /><i /><i /></p></Theirs>
                  )}
                </Talk>
              ) : null}
            </div>
            <Dock>
              <Chips chips={asks.map((item) => item.question)} onChip={(chip) => ask(asks.findIndex((item) => item.question === chip))} />
              <Ask placeholder="Ask your guide anything" guide value="" onChange={() => undefined} />
            </Dock>
          </div>
        </KitApp>
      </div>
    </div>
  );
}
