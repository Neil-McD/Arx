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
  id: string; title: [string, string]; children: ReactNode; sceneLabel: string;
  front?: ReactNode; back?: ReactNode; features: string[];
  // A scene you use, made from the app's own parts, in place of the picture.
  live?: ReactNode;
}) {
  const half = Math.ceil(props.features.length / 2);
  return (
    <section className="feat" id={props.id} aria-labelledby={`${props.id}-title`} data-rv>
      <div className="feat-head">
        <div>
          <h2 id={`${props.id}-title`}>{props.title[0]}<br />{props.title[1]}</h2>
        </div>
        <p>{props.children}</p>
      </div>
      {props.live ? (
        <div className="scene live" aria-label={props.sceneLabel} role="group">{props.live}</div>
      ) : (
        <div className="scene" role="img" aria-label={props.sceneLabel}>
          <div className="scene-back" aria-hidden="true">{props.back}</div>
          <div className="scene-front" aria-hidden="true">{props.front}</div>
        </div>
      )}
      <div className="feat-list">
        <span>Features</span>
        <ul>{props.features.slice(0, half).map((name) => <li key={name}>{name}</li>)}</ul>
        <ul>{props.features.slice(half).map((name) => <li key={name}>{name}</li>)}</ul>
      </div>
    </section>
  );
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
