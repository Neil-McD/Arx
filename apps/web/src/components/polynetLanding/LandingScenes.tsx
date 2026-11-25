// The public site's drawings: three line figures in Polynet's own language
// (people as points, one violet light for the AI) and the wide product scenes
// under each feature. Everything here is drawn in markup, never a screenshot,
// so it stays sharp, never goes stale and never shows a real member. The
// people in the scenes are made up.
import { useEffect, useRef, type ReactNode } from "react";
import { FigureActs, FigureDecides, FigureLearns } from "./LandingFigures";

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

// One feature: a label-like title, one paragraph, a wide scene that runs off
// the page's right edge and fades, and the names of what's inside.
export function FeatureSection(props: {
  id: string; title: [string, string]; children: ReactNode; sceneLabel: string;
  features: string[];
  // The scene you use, made from the app's own parts.
  live: ReactNode;
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
      <div className="scene live" aria-label={props.sceneLabel} role="group">{props.live}</div>
      <div className="feat-list">
        <span>Features</span>
        <ul>{props.features.slice(0, half).map((name) => <li key={name}>{name}</li>)}</ul>
        <ul>{props.features.slice(half).map((name) => <li key={name}>{name}</li>)}</ul>
      </div>
    </section>
  );
}

