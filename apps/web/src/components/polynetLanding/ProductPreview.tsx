import { Fragment, useEffect, useReducer, useRef, useState } from "react";

import { captureProductAnalyticsEvent } from "../../posthogAnalytics";

// The home page's product preview: a small Polynet you can click. A made-up
// community ("The Build Club") and made-up people, showing only what the
// product does today: the morning brief, a check-in drafted for your yes, the
// guide answering from a lesson, and the members list. Nothing is sent
// anywhere; every click moves a fixed script one step.

export type PreviewScreen = "home" | "general" | "members";

export type PreviewState = {
  screen: PreviewScreen;
  /** The drafted check-in to Josh is open (on Home or on his profile). */
  draftOpen: boolean;
  joshCheckedIn: boolean;
  /** The visitor sent their question to the guide in #general. */
  asked: boolean;
  answered: boolean;
  sourceOpen: boolean;
  /** The member whose profile is open on Members. */
  profile: string | null;
};

export type PreviewAction =
  | { type: "open"; screen: PreviewScreen }
  | { type: "review" }
  | { type: "skip" }
  | { type: "send" }
  | { type: "ask" }
  | { type: "answer" }
  | { type: "toggle_source" }
  | { type: "profile"; member: string | null };

export const INITIAL_PREVIEW: PreviewState = {
  screen: "home",
  draftOpen: false,
  joshCheckedIn: false,
  asked: false,
  answered: false,
  sourceOpen: false,
  profile: null,
};

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case "open":
      return { ...state, screen: action.screen, draftOpen: false, sourceOpen: false, profile: action.screen === "members" ? state.profile : null };
    case "review":
      return state.joshCheckedIn ? state : { ...state, draftOpen: true };
    case "skip":
      return { ...state, draftOpen: false };
    case "send":
      return state.draftOpen ? { ...state, draftOpen: false, joshCheckedIn: true } : state;
    case "ask":
      return state.asked ? state : { ...state, asked: true };
    case "answer":
      return state.asked ? { ...state, answered: true } : state;
    case "toggle_source":
      return state.answered ? { ...state, sourceOpen: !state.sourceOpen } : state;
    case "profile":
      return { ...state, profile: action.member, draftOpen: false };
  }
}

export const PREVIEW_COMMUNITY = "The Build Club";

const CHECK_IN_DRAFT =
  "Hey Josh, we've missed you on the last two calls. Friday's call covers pricing, the thing you asked about in your first week. Hope to see you there.";

const QUESTION = "@guide where's the lesson on finding your first customers?";
export const GUIDE_REPLY =
  "It's Lesson 4 of Start here, \"Your first ten customers\". The short version: start with people who already asked you for help, then ask each one who else has the same problem.";

type Member = { key: string; name: string; since: string; course: string; seen: string; status: "active" | "quiet" | "new" };
export const PREVIEW_MEMBERS: Member[] = [
  { key: "maya", name: "Maya Chen", since: "Joined in August", course: "Start here · 6 of 6 lessons", seen: "Today", status: "active" },
  { key: "dev", name: "Dev Patel", since: "Joined in September", course: "Start here · 4 of 6 lessons", seen: "Today", status: "active" },
  { key: "priya", name: "Priya Shah", since: "Joined in September", course: "Start here · 5 of 6 lessons", seen: "Yesterday", status: "active" },
  { key: "josh", name: "Josh Reed", since: "Joined in October", course: "Start here · 2 of 6 lessons", seen: "25 days ago", status: "quiet" },
  { key: "tom", name: "Tom Alvarez", since: "Joined in October", course: "Start here · 3 of 6 lessons", seen: "3 days ago", status: "active" },
  { key: "lena", name: "Lena Novak", since: "Joined today", course: "Start here · not started", seen: "Today", status: "new" },
];

const SCREENS: Array<[PreviewScreen, string]> = [["home", "Home"], ["general", "# general"], ["members", "Members"]];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("");
}

// What the community knows, as the app draws it: clusters around a bright centre.
export function BrainPicture(props: { small?: boolean }) {
  const spokes: Array<[number, number, Array<[number, number]>]> = [
    [130, 60, [[96, 38], [90, 72], [140, 28], [164, 46], [112, 94]]],
    [346, 64, [[320, 38], [358, 30], [384, 48], [382, 84], [326, 96]]],
    [222, 184, [[182, 170], [176, 200], [200, 216], [236, 218], [268, 206], [270, 176]]],
  ];
  return (
    <svg className={props.small ? "brain small" : "brain"} viewBox="60 14 380 216" role="img" aria-label="A map of what the community knows, in clusters around a glowing centre">
      <defs><radialGradient id={props.small ? "pnBrainS" : "pnBrain"} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#C2A9FF" stopOpacity=".75" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient></defs>
      <g fill="none" stroke="#3A3D46" strokeWidth="1.2">
        {spokes.map(([x, y, leaves], index) => (
          <Fragment key={index}>
            <line x1="240" y1="112" x2={x} y2={y} />
            {leaves.map(([lx, ly], leaf) => <line key={leaf} x1={x} y1={y} x2={lx} y2={ly} />)}
          </Fragment>
        ))}
        <path d="M240 112 Q352 162 416 150" />
      </g>
      <circle cx="240" cy="112" r="42" fill={`url(#${props.small ? "pnBrainS" : "pnBrain"})`} />
      <circle cx="240" cy="112" r="7.5" fill="#FFFFFF" />
      {spokes.map(([x, y, leaves], index) => (
        <Fragment key={index}>
          {leaves.map(([lx, ly], leaf) => <circle key={leaf} cx={lx} cy={ly} r="3.6" fill={index === 1 ? "#EEF0F4" : "#8A8F98"} />)}
          <circle cx={x} cy={y} r="6" fill="#EEF0F4" />
        </Fragment>
      ))}
      <circle cx="416" cy="150" r="4.5" fill="#C4B5FD" />
    </svg>
  );
}

function prefersLessMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function track(action: string) {
  captureProductAnalyticsEvent("preview_used", { action });
}

function CheckInDraft(props: { onSend: () => void; onSkip: () => void }) {
  const [text, setText] = useState(CHECK_IN_DRAFT);
  return (
    <div className="pv-draft">
      <span className="pv-draft-label">Draft to Josh · you can edit it</span>
      <textarea aria-label="Check-in message to Josh" value={text} onChange={(event) => setText(event.target.value)} rows={3} />
      <div className="pv-draft-acts">
        <button type="button" className="pv-send" onClick={props.onSend} disabled={!text.trim()}>Send</button>
        <button type="button" className="pv-quiet" onClick={props.onSkip}>Not now</button>
      </div>
    </div>
  );
}

function HomeScreen(props: { state: PreviewState; dispatch: (action: PreviewAction) => void }) {
  const { state, dispatch } = props;
  return (
    <div className="pv-screen pv-home">
      <span className="shot-eyebrow pv-line">Your guide · 9:24 am</span>
      <strong className="shot-hello big pv-line">Good morning.</strong>
      <p className="shot-text pv-line">
        Two people finished Start here.{" "}
        <a href="/#how" className="pv-link" onClick={(event) => { event.preventDefault(); track("brief_see_answer"); dispatch({ type: "open", screen: "general" }); }}>
          Dev asked about pricing overnight
        </a>{" "}
        and got an answer. {state.joshCheckedIn ? "You're all caught up." : "One person needs you."}
      </p>
      {state.joshCheckedIn ? (
        <div className="shot-ask pv-line pv-done">
          <div><b>Checked in with Josh</b><span>Sent just now · you'll see his reply in Inbox</span></div>
          <span className="pv-tick" aria-hidden="true">✓</span>
        </div>
      ) : (
        <div className="shot-ask pv-line">
          <div><b>Check in with Josh</b><span>Quiet for 25 days · next call is Friday</span></div>
          {state.draftOpen ? null : (
            <div className="shot-acts">
              <button type="button" className="pv-review" onClick={() => { track("brief_review"); dispatch({ type: "review" }); }}>Review</button>
            </div>
          )}
          {state.draftOpen ? (
            <CheckInDraft
              onSend={() => { track("check_in_sent_home"); dispatch({ type: "send" }); }}
              onSkip={() => { track("check_in_skipped"); dispatch({ type: "skip" }); }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function GuideAvatar() {
  return <span className="pv-face pv-guide" aria-hidden="true">✦</span>;
}

function Face(props: { name: string }) {
  return <span className="pv-face" aria-hidden="true">{initials(props.name)}</span>;
}

function GeneralScreen(props: { state: PreviewState; dispatch: (action: PreviewAction) => void }) {
  const { state, dispatch } = props;
  const [shownWords, setShownWords] = useState(0);
  const words = GUIDE_REPLY.split(" ");
  // The guide "types" its answer a word at a time; with less motion it simply appears.
  useEffect(() => {
    if (!state.asked || state.answered) return;
    const thinking = window.setTimeout(() => dispatch({ type: "answer" }), prefersLessMotion() ? 0 : 900);
    return () => window.clearTimeout(thinking);
  }, [state.asked, state.answered, dispatch]);
  useEffect(() => {
    if (!state.answered) return;
    if (prefersLessMotion()) { setShownWords(words.length); return; }
    if (shownWords >= words.length) return;
    const next = window.setTimeout(() => setShownWords((count) => count + 1), 45);
    return () => window.clearTimeout(next);
  }, [state.answered, shownWords, words.length]);
  const typing = state.answered && shownWords < words.length;
  return (
    <div className="pv-screen pv-channel">
      <span className="pv-channel-head"># general</span>
      <div className="pv-msg">
        <Face name="Dev Patel" />
        <div><b>Dev Patel <i>2:14 am</i></b><p>@guide how should I price my first offer?</p></div>
      </div>
      <div className="pv-msg">
        <GuideAvatar />
        <div>
          <b className="pv-guide-name">Guide <i>2:14 am</i></b>
          <p>Start with one clear result and one price. Lesson 3 walks through it with three examples from members here.</p>
          <span className="pv-chip pv-chip-static">Start here · Lesson 3</span>
        </div>
      </div>
      {state.asked ? (
        <div className="pv-msg">
          <span className="pv-face pv-you" aria-hidden="true">You</span>
          <div><b>You <i>now</i></b><p>{QUESTION}</p></div>
        </div>
      ) : null}
      {state.asked ? (
        <div className="pv-msg" aria-live="polite">
          <GuideAvatar />
          <div>
            <b className="pv-guide-name">Guide <i>now</i></b>
            {state.answered ? (
              <>
                <p>{words.slice(0, shownWords).join(" ")}{typing ? <span className="pv-caret" aria-hidden="true" /> : null}</p>
                {typing ? null : (
                  <button type="button" className="pv-chip" aria-expanded={state.sourceOpen}
                    onClick={() => { track("guide_source"); dispatch({ type: "toggle_source" }); }}>
                    Start here · Lesson 4
                  </button>
                )}
                {state.sourceOpen ? (
                  <div className="pv-source">
                    <b>Your first ten customers</b>
                    <span>Start here · Lesson 4 · 8 min</span>
                    <p>Who already asks you for help, how to reach them, and the one question that finds the next customer.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="pv-thinking">Looking through your courses…</p>
            )}
          </div>
        </div>
      ) : null}
      <form className="pv-composer" onSubmit={(event) => { event.preventDefault(); if (!state.asked) { track("guide_asked"); dispatch({ type: "ask" }); } }}>
        <span>{state.asked ? "Message #general" : QUESTION}</span>
        <button type="submit" disabled={state.asked}>{state.asked ? "Sent" : "Send"}</button>
      </form>
    </div>
  );
}

function statusWord(member: Member, joshCheckedIn: boolean) {
  if (member.key === "josh" && joshCheckedIn) return "Checked in";
  if (member.status === "quiet") return "Quiet";
  if (member.status === "new") return "New";
  return "Active";
}

function MembersScreen(props: { state: PreviewState; dispatch: (action: PreviewAction) => void }) {
  const { state, dispatch } = props;
  const open = PREVIEW_MEMBERS.find((member) => member.key === state.profile) ?? null;
  return (
    <div className="pv-screen pv-members">
      <div className="pv-members-list">
        <span className="pv-channel-head">Members · {PREVIEW_MEMBERS.length}</span>
        {PREVIEW_MEMBERS.map((member) => {
          const quiet = member.status === "quiet" && !(member.key === "josh" && state.joshCheckedIn);
          return (
            <button type="button" key={member.key} className={state.profile === member.key ? "pv-member on" : "pv-member"}
              onClick={() => { track(`member_${member.key}`); dispatch({ type: "profile", member: member.key }); }}>
              <Face name={member.name} />
              <span className="pv-member-name">{member.name}</span>
              <span className={quiet ? "pv-status quiet" : member.key === "josh" && state.joshCheckedIn ? "pv-status done" : "pv-status"}>
                <i aria-hidden="true" />{statusWord(member, state.joshCheckedIn)}
              </span>
              <span className="pv-seen">{member.key === "josh" && state.joshCheckedIn ? "Just now" : member.seen}</span>
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="pv-profile">
          <div className="pv-profile-head">
            <Face name={open.name} />
            <div><b>{open.name}</b><span>{open.since}</span></div>
            <button type="button" className="pv-close" aria-label="Close profile" onClick={() => dispatch({ type: "profile", member: null })}>×</button>
          </div>
          <dl>
            <div><dt>Course</dt><dd>{open.course}</dd></div>
            <div><dt>Last active</dt><dd>{open.key === "josh" && state.joshCheckedIn ? "Checked in just now" : open.seen}</dd></div>
          </dl>
          {open.key === "josh" && !state.joshCheckedIn ? (
            state.draftOpen ? (
              <CheckInDraft
                onSend={() => { track("check_in_sent_profile"); dispatch({ type: "send" }); }}
                onSkip={() => dispatch({ type: "skip" })}
              />
            ) : (
              <button type="button" className="pv-review" onClick={() => { track("profile_check_in"); dispatch({ type: "review" }); }}>Check in</button>
            )
          ) : null}
          {open.key === "josh" && state.joshCheckedIn ? <p className="pv-note">Check-in sent. His reply will land in Inbox.</p> : null}
        </div>
      ) : (
        <p className="pv-hint">Click someone to open their profile.</p>
      )}
    </div>
  );
}

export function ProductPreview() {
  const [state, dispatch] = useReducer(previewReducer, INITIAL_PREVIEW);
  const [played, setPlayed] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  // Plays once: the brief arrives line by line the first time the preview is seen.
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") { setPlayed(true); return; }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setPlayed(true); seen.disconnect(); }
    }, { threshold: 0.35 });
    seen.observe(node);
    return () => seen.disconnect();
  }, []);
  const go = (screen: PreviewScreen) => { track(`open_${screen}`); dispatch({ type: "open", screen }); };
  return (
    <div ref={root} className={played ? "shot pv played" : "shot pv"} aria-label={`A working preview of Polynet, in a made-up community called ${PREVIEW_COMMUNITY}`} role="region">
      <nav className="shot-side pv-side" aria-label="Preview menu">
        <b>{PREVIEW_COMMUNITY}</b>
        {SCREENS.map(([screen, label]) => (
          <button type="button" key={screen} className={state.screen === screen ? "on" : undefined} aria-current={state.screen === screen ? "page" : undefined} onClick={() => go(screen)}>{label}</button>
        ))}
      </nav>
      <div className="shot-main pv-main">
        {state.screen === "home" ? <HomeScreen state={state} dispatch={dispatch} /> : null}
        {state.screen === "general" ? <GeneralScreen state={state} dispatch={dispatch} /> : null}
        {state.screen === "members" ? <MembersScreen state={state} dispatch={dispatch} /> : null}
      </div>
      <div className="shot-rail" aria-hidden="true">
        <em>The community brain</em>
        <BrainPicture small />
        <span>{state.answered ? "1 learned · 2 new this week" : "1 learned · 1 new this week"}</span>
      </div>
    </div>
  );
}
