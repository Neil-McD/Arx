import { Fragment, useEffect } from "react";

import { POLYNET_FOUNDER_TIER_CATALOG } from "../../../../../shared/founderPlan";
import "./ConversionLanding.css";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";
import { FEE, INCLUDED, LANDING_PLANS, PlanCards, PublicFrame, QUESTIONS, trackStart } from "./ConversionLanding";

const aiDollars = (micros: number) => `$${micros / 1_000_000}`;
const GUIDE = POLYNET_FOUNDER_TIER_CATALOG.guide;
const CHIEF = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;

// A cell is a tick (true), a dash (false) or a few words.
type Cell = boolean | string;
type Row = { name: string; hint?: string; cells: [Cell, Cell, Cell] };
type Group = { title: string; rows: Row[] };

const ALL: [Cell, Cell, Cell] = [true, true, true];
const GUIDE_UP: [Cell, Cell, Cell] = [false, true, true];
const CHIEF_ONLY: [Cell, Cell, Cell] = [false, false, true];

// Only what each plan does today. The prices and AI amounts come from the
// same numbers checkout charges.
export const COMPARE: Group[] = [
  {
    title: "Your community",
    rows: [
      { name: "Members", cells: ["Unlimited", "Unlimited", "Unlimited"] },
      { name: "Channels, threads and direct messages", cells: ALL },
      { name: "Courses and knowledge", cells: ALL },
      { name: "Events", cells: ALL },
      { name: "Pods for cohorts and small groups", cells: ALL },
      { name: "Weekly digest emails", cells: ALL },
      { name: "Connect your own Claude or ChatGPT", cells: ALL },
    ],
  },
  {
    title: "Money",
    rows: [
      { name: "Paid memberships", cells: ALL },
      { name: "Payouts to your own Stripe account", cells: ALL },
      { name: "Polynet fee on member payments", hint: "Stripe's processing fee is separate.", cells: [FEE, FEE, FEE] },
    ],
  },
  {
    title: "The AI",
    rows: [
      { name: "A private guide for every member", cells: GUIDE_UP },
      { name: "Replies when tagged in channels", cells: GUIDE_UP },
      { name: "Follow-ups in active threads", cells: GUIDE_UP },
      { name: "Community brain", hint: "What your community learns, kept and connected.", cells: GUIDE_UP },
      { name: "Morning brief for you", cells: CHIEF_ONLY },
      { name: "Member check-ins and win-backs", cells: CHIEF_ONLY },
      { name: "Reply drafts for unanswered questions", cells: CHIEF_ONLY },
    ],
  },
  {
    title: "Usage",
    rows: [
      { name: "AI included each month", cells: [false, aiDollars(GUIDE.includedCostMicros), aiDollars(CHIEF.includedCostMicros)] },
      { name: "At the monthly limit", cells: [false, "The AI pauses until next month", "Pauses, or add more under a cap you set"] },
      { name: "Surprise bills", cells: ["Never", "Never", "Never"] },
      { name: "Billed", hint: "Each community has its own plan.", cells: ["Never", "Monthly", "Monthly"] },
    ],
  },
];

const PRICING_QUESTIONS: Array<[string, string]> = [
  ...QUESTIONS,
  ["Is a plan per community?", "Yes. Each community has its own plan, so one can run on Chief of Staff while another stays free."],
];

function CellView(props: { cell: Cell }) {
  if (props.cell === true) return <span className="tick" role="img" aria-label="Included">✓</span>;
  if (props.cell === false) return <span className="dash" role="img" aria-label="Not included">–</span>;
  return <>{props.cell}</>;
}

export function PricingPage(props: { onJoin: () => void }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Pricing · Polynet";
    captureProductAnalyticsEvent("pricing_viewed");
    // Arriving at /pricing#questions (or #included, #compare) from another page.
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView();
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <PublicFrame onJoin={props.onJoin}>
      <div className="pricing-page">
        <section className="pricing-head" aria-labelledby="pricing-title">
          <h1 id="pricing-title">Pricing</h1>
          <p className="subhead">Free to build, with unlimited members. Add an AI to any community when you're ready.</p>
        </section>

        <section className="pricing-plans" aria-label="Plans">
          <PlanCards onJoin={props.onJoin} placement="pricing_page" />
          <p className="microcopy">Month to month, cancel anytime. Selling memberships carries a {FEE} fee plus Stripe's processing. No surprise AI bills.</p>
        </section>

        <section className="included" id="included" aria-labelledby="included-title">
          <h2 id="included-title">Every plan includes</h2>
          <div className="grid-six">
            {INCLUDED.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className="compare" id="compare" aria-labelledby="compare-title">
          <h2 id="compare-title">Compare plans</h2>
          <div className="compare-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col"><span className="visually-hidden">Feature</span></th>
                  {LANDING_PLANS.map((plan) => (
                    <th scope="col" key={plan.name} className={plan.lit ? "lit" : undefined}>
                      <b>{plan.name}</b>
                      <span>{plan.price} / month</span>
                      <button className={plan.lit ? "cta cta-small" : "cta-secondary cta-small"} type="button"
                        onClick={trackStart(`pricing_table_${plan.name.toLowerCase().replace(/\s+/g, "_")}`, props.onJoin, plan.tier)}>
                        {plan.tier ? "Start" : "Start free"}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="group"><th scope="rowgroup" colSpan={4}>{group.title}</th></tr>
                    {group.rows.map((row) => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}{row.hint ? <small>{row.hint}</small> : null}</th>
                        {row.cells.map((cell, index) => (
                          <td key={index} className={LANDING_PLANS[index]?.lit ? "lit" : undefined}><CellView cell={cell} /></td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="questions" id="questions" aria-labelledby="questions-title">
          <h2 id="questions-title">Questions</h2>
          <dl>
            {PRICING_QUESTIONS.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
          </dl>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Start free. Upgrade when it pays for itself.</h2>
          <button className="cta" type="button" onClick={trackStart("pricing_closing", props.onJoin)}>Start a community</button>
          <p className="microcopy">Questions about a plan? <a href="mailto:support@polynet.ai">support@polynet.ai</a></p>
        </section>
      </div>
    </PublicFrame>
  );
}
