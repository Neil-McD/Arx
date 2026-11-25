// The public site's drawings: three line figures in Polynet's own language
// (people as points, one violet light for the AI) and the wide product scenes
// under each feature. Everything here is drawn in markup, never a screenshot,
// so it stays sharp, never goes stale and never shows a real member. The
// people in the scenes are made up.
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { FigureActs, FigureDecides, FigureLearns } from "./LandingFigures";
import { Sparkles } from "lucide-react";

const INK = "#08090A";

function Glow(props: { id: string }) {
  return (
    <radialGradient id={props.id} cx=".5" cy=".5" r=".5">
      <stop offset="0" stopColor="#A78BFA" stopOpacity=".55" /><stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
    </radialGradient>
  );
}

const FIGURES: Array<[number, ReactNode, string, string]> = [
  [1, <FigureLearns key="a" />, "It learns", "Courses, answers and conversations add up to one memory. What one member figures out, the next one finds."],
  [2, <FigureActs key="b" />, "It acts", "It answers at 2am, spots who's gone quiet, and drafts what to say."],
  [3, <FigureDecides key="c" />, "You decide", "Drafts wait for your yes. Who joins, who leaves and what gets taught stays your call."],
];

// Each figure responds under a pointer. On a phone (no hover) each plays its
// move once as it comes into view; with less motion asked for, none moves.
export function StatementFigures() {
  const figs = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = figs.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (!window.matchMedia?.("(hover: none)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("play");
        seen.unobserve(entry.target);
      }
    }, { threshold: 0.6 });
    node.querySelectorAll("article").forEach((article) => seen.observe(article));
    return () => seen.disconnect();
  }, []);
  return (
    <section className="statement" aria-labelledby="statement-title" data-rv>
      <h2 id="statement-title">Communities that think. <span>Polynet gives your community an AI at its core: it learns from everything, acts on what it learns, and leaves the decisions to you.</span></h2>
      <div className="figs" ref={figs}>
        {FIGURES.map(([n, drawing, title, text]) => (
          <article key={n} className={`f${n}`}>
            <span className="fig-label">FIG 0.{n}</span>
            {drawing}
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- the scenes ----------

type Person = [initials: string, name: string, colour: string];
const MAYA: Person = ["MA", "Maya Alvarez", "#7A4E9E"];
const JOSH: Person = ["JU", "Josh Underwood", "#2F6B5A"];
const DEV: Person = ["DO", "Dev Okafor", "#3B5B8C"];
const PRIYA: Person = ["PS", "Priya Shah", "#8C6A2F"];
const TOM: Person = ["TR", "Tom Reyes", "#9E4E5F"];
const LENA: Person = ["LN", "Lena Novak", "#4E6B9E"];
const AMIR: Person = ["AK", "Amir Khan", "#5F7A3A"];

function Face(props: { person: Person; small?: boolean }) {
  return <span className={props.small ? "sc-face small" : "sc-face"} style={{ background: props.person[2] }}>{props.person[0]}</span>;
}

// One feature: a label-like title, one paragraph, a wide scene that runs off
// the page's right edge and fades, and the names of what's inside.
export function FeatureSection(props: {
  id: string; plan: string; title: [string, string]; children: ReactNode; sceneLabel: string;
  front: ReactNode; back: ReactNode; features: string[];
}) {
  const half = Math.ceil(props.features.length / 2);
  return (
    <section className="feat" id={props.id} aria-labelledby={`${props.id}-title`} data-rv>
      <div className="feat-head">
        <div>
          <span className="plan-tag">{props.plan}</span>
          <h2 id={`${props.id}-title`}>{props.title[0]}<br />{props.title[1]}</h2>
        </div>
        <p>{props.children}</p>
      </div>
      <div className="scene" role="img" aria-label={props.sceneLabel}>
        <div className="scene-back" aria-hidden="true">{props.back}</div>
        <div className="scene-front" aria-hidden="true">{props.front}</div>
      </div>
      <div className="feat-list">
        <span>Features</span>
        <ul>{props.features.slice(0, half).map((name) => <li key={name}>{name}</li>)}</ul>
        <ul>{props.features.slice(half).map((name) => <li key={name}>{name}</li>)}</ul>
      </div>
    </section>
  );
}

// The guide: a member's private question, answered from a lesson that is lit
// in the course behind it.
export function guideScene() {
  const lessons: Array<[string, string, string, boolean?]> = [
    ["1", "Why a community, why now", "8 min"], ["2", "Find your first ten members", "12 min"], ["3", "Your first live call", "9 min"],
    ["4", "Pricing your first cohort", "14 min", true], ["5", "Keeping people to the end", "11 min"], ["6", "From cohort to community", "10 min"],
    ["7", "What to measure", "7 min"],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">Your guide · private to Dev</span>
        <div className="sc-msg"><Face person={DEV} /><div><b>Dev <i>2:07 am</i></b><span>How should I price my first cohort?</span></div></div>
        <div className="sc-msg ai">
          <span className="sc-face ai"><Sparkles size={14} aria-hidden="true" /></span>
          <div>
            <b>Your guide <i>2:07 am</i></b>
            <span>Maya ran two cohorts here. Monthly billing kept more people to the end than one payment. Lesson 4 walks through the numbers.</span>
            <em>Lesson 4 · Pricing your first cohort</em>
          </div>
        </div>
        <div className="sc-box">Ask your guide anything</div>
      </div>
    ),
    back: (
      <div className="sc-table">
        <div className="sc-row head"><span /><span>Build your community, A to Z</span><span>Length</span><span>Finished</span></div>
        {lessons.map(([number, title, length, lit], index) => (
          <div key={number} className={lit ? "sc-row lit" : "sc-row"}>
            <span /><span><i className="sc-num">{number}</i>{title}</span><span>{length}</span><span>{[14, 12, 11, 9, 6, 4, 3][index]} members</span>
          </div>
        ))}
      </div>
    ),
  };
}

// The brain: what the community knows as a map, and what it learned lately.
export function brainScene() {
  const clusters: Array<[number, number, Array<[number, number]>, boolean?]> = [
    [250, 120, [[190, 80], [206, 150], [262, 62], [306, 96], [226, 176]]],
    [560, 96, [[508, 62], [570, 40], [622, 70], [628, 122], [540, 150]], true],
    [430, 330, [[362, 306], [372, 366], [420, 392], [478, 384], [500, 326], [470, 286]]],
    [760, 300, [[706, 268], [778, 244], [826, 290], [806, 348], [736, 356]]],
    [900, 130, [[858, 92], [924, 76], [960, 132], [922, 180]]],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">What your community knows</span>
        {[
          ["Monthly billing keeps cohorts together", "From Maya's answer in # General", true],
          ["Most members join for the live calls", "From 11 introductions"],
          ["Lesson 4 is where people get stuck", "From 9 questions to the guide"],
        ].map(([title, source, fresh]) => (
          <div key={String(title)} className="sc-learned"><i className={fresh ? "new" : undefined} /><div><b>{title}</b><span>{source}</span></div></div>
        ))}
        <span className="sc-foot">3 learned this week · you can correct any of it</span>
      </div>
    ),
    back: (
      <svg className="sc-brain" viewBox="120 10 900 420">
        <defs><Glow id="pnSceneBrain" /></defs>
        <g fill="none" stroke="#33363D" strokeWidth="1.2">
          {clusters.map(([x, y, leaves], index) => (
            <Fragment key={index}>
              <path d={`M600 215 Q${(600 + x) / 2} ${(215 + y) / 2 - 24} ${x} ${y}`} />
              {leaves.map(([lx, ly]) => <line key={`${lx}-${ly}`} x1={x} y1={y} x2={lx} y2={ly} />)}
            </Fragment>
          ))}
        </g>
        <circle cx="600" cy="215" r="70" fill="url(#pnSceneBrain)" /><circle cx="600" cy="215" r="9" fill="#FFFFFF" />
        {clusters.map(([x, y, leaves, bright], index) => (
          <Fragment key={index}>
            {leaves.map(([lx, ly]) => <circle key={`${lx}-${ly}`} cx={lx} cy={ly} r="4.5" fill={bright ? "#EEF0F4" : "#7D828C"} />)}
            <circle cx={x} cy={y} r="7.5" fill="#EEF0F4" />
          </Fragment>
        ))}
        <circle cx="622" cy="70" r="16" fill="url(#pnSceneBrain)" /><circle cx="622" cy="70" r="5" fill="#C4B5FD" />
      </svg>
    ),
  };
}

// Chief of Staff: the morning brief over the Members table; the member it
// wants to check in on is lit in the table behind.
export function chiefScene() {
  const rows: Array<[Person, string, boolean, string, string, boolean?]> = [
    [MAYA, "Active", true, "Member", "Today"], [JOSH, "Quiet 25 days", false, "Member", "Oct 31", true], [DEV, "Active", true, "Free", "Today"],
    [PRIYA, "Active", true, "Member", "Yesterday"], [TOM, "Quiet 12 days", false, "Free", "Nov 13"], [LENA, "Active", true, "Member", "Today"],
    [AMIR, "Active", true, "Free", "Today"],
  ];
  return {
    front: (
      <div className="sc-panel">
        <span className="sc-eyebrow">Your guide · 9:24 am</span>
        <strong className="sc-hello">Good morning.</strong>
        <span className="sc-text">Two people finished Start here. Dev's pricing question was answered overnight. Two things need you.</span>
        <div className="sc-ask">
          <div className="sc-ask-top"><Face person={JOSH} small /><b>Check in with Josh</b><span>Quiet 25 days</span></div>
          <p>"Hey Josh, Friday's call covers the pricing piece you were stuck on. Want me to save you the notes?"</p>
          <div className="sc-acts"><i>Approve</i><span>Edit</span><span>Skip</span></div>
        </div>
        <div className="sc-ask plain"><div className="sc-ask-top"><Face person={PRIYA} small /><b>Reply drafted for Priya</b><i>Review</i></div></div>
      </div>
    ),
    back: (
      <div className="sc-table">
        <div className="sc-row head"><span /><span>Member</span><span>Status</span><span>Last here</span></div>
        {rows.map(([person, status, active, , last, lit]) => (
          <div key={person[1]} className={lit ? "sc-row lit" : "sc-row"}>
            <span /><span><Face person={person} />{person[1]}</span>
            <span><i className={active ? "sc-dot" : "sc-dot quiet"} />{status}</span><span>{last}</span>
          </div>
        ))}
      </div>
    ),
  };
}
