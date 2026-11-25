import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { formatPlanPrice } from "../../../../../shared/accountCommerce";
import { listCloudDiscoverCommunities } from "../../../../../shared/cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "../../../../../shared/communityTypes";
import {
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  POLYNET_FOUNDER_TIER_CATALOG,
} from "../../../../../shared/founderPlan";
import { StableFramedMedia } from "../../../../../shared/StableFramedMedia";
import { captureProductAnalyticsEvent } from "../../posthogAnalytics";

type JoinProps = { onJoin: () => void };

// The prices and included AI come from the same numbers checkout charges.
const dollars = (baseUnits: number) => `$${baseUnits / 100}`;
const aiDollars = (micros: number) => `$${micros / 1_000_000}`;
const GUIDE = POLYNET_FOUNDER_TIER_CATALOG.guide;
const CHIEF = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;
export const LANDING_OFFER_LINE =
  `Free to build · Guide ${dollars(GUIDE.monthlyPriceBaseUnits)}/mo · Chief of Staff ${dollars(CHIEF.monthlyPriceBaseUnits)}/mo`;
const FEE = `${POLYNET_COMMUNITY_PLATFORM_FEE_BPS / 100}%`;

type Plan = { name: string; line: string; price: string; per: string; points: string[]; ai: string | null; lit?: boolean };
export const LANDING_PLANS: Plan[] = [
  {
    name: "Free", line: "Run your community", price: "$0", per: "/ month", ai: null,
    points: ["Unlimited members", "Channels, messages, courses, events and pods", "Paid memberships and weekly digest emails", "Connect your own Claude or ChatGPT"],
  },
  {
    name: GUIDE.label, line: "It answers and remembers", price: dollars(GUIDE.monthlyPriceBaseUnits), per: "/ month per community",
    ai: `${aiDollars(GUIDE.includedCostMicros)} of AI included each month`,
    points: ["Everything in Free", "A private guide for every member", "Replies when tagged in channels", "A community brain that keeps what's learned"],
  },
  {
    name: CHIEF.label, line: "It helps run the place", price: dollars(CHIEF.monthlyPriceBaseUnits), per: "/ month per community", lit: true,
    ai: `${aiDollars(CHIEF.includedCostMicros)} of AI included each month; add more if you need it`,
    points: ["Everything in Guide", "A morning brief for you", "Member check-ins and win-backs", "Reply drafts for unanswered questions"],
  },
];

const PROBLEMS = [
  ["Repeat questions", "You answer the same onboarding and course questions every week."],
  ["Quiet members", "People drift away and cancel before you notice they went quiet."],
  ["Buried answers", "Your best advice disappears into the chat a day after you write it."],
];

const INCLUDED = [
  ["Channels and messages", "Group channels, threaded replies and a calm inbox."],
  ["Courses and knowledge", "Publish lessons, see who's progressing, attach notes and files."],
  ["Events", "One-off or recurring sessions, with reminders."],
  ["Pods", "Give cohorts or small groups their own room and calls."],
  ["Paid memberships", "Charge for access, with payouts straight to you through Stripe."],
  ["Works with your own AI", "Connect Claude or ChatGPT. It acts inside your permissions."],
];

const QUESTIONS = [
  ["Is the Free plan really free?", "Yes. Unlimited members, courses, channels, pods and events, with no time limit. You pay only if you turn on Guide or Chief of Staff, or when you sell memberships."],
  ["What happens at the monthly AI limit?", "The AI pauses until your next billing cycle. You never get a surprise bill. On Chief of Staff you can turn on prepaid boosts, under a monthly cap you set."],
  ["How does charging members work?", `Connect Stripe once and set your community to free, approval-only or paid. Payouts go to your account, less a ${FEE} Polynet fee and Stripe's processing fee.`],
  ["Can I change plans later?", "Yes. Plans are month to month per community. Start free and move up or down whenever you like."],
];

// Funnel step: which door a visitor used, and from where on the page.
export function trackStart(placement: string, onJoin: () => void) {
  return () => {
    captureProductAnalyticsEvent("start_community_clicked", { placement });
    onJoin();
  };
}

function trackFind(placement: string) {
  return () => captureProductAnalyticsEvent("find_community_clicked", { placement });
}

// Visitors only see communities that look finished: a banner and a one-liner.
const SHOWCASE_LIMIT = 6;

// The Polynet mark on its graphite tile, as the tab icon draws it. Same
// geometry as scripts/generate_brand_icons.mjs.
const MARK_NODES: Record<string, [number, number, number]> = {
  a: [133, 148, 34], hub: [258, 205, 62], c: [382, 98, 34], d: [440, 268, 40], e: [304, 378, 34], f: [72, 295, 34],
};
const MARK_LINKS: Array<[string, string]> = [
  ["a", "hub"], ["a", "f"], ["f", "hub"], ["hub", "c"], ["c", "d"], ["hub", "d"], ["hub", "e"], ["e", "d"],
];
function Mark(props: { size: number }) {
  return (
    <svg className="mark" viewBox="12 -2 488 488" width={props.size} height={props.size} aria-hidden="true">
      <rect x="12" y="-2" width="488" height="488" rx="107" fill="#15161A" />
      <g transform="translate(256 242) scale(1.0157) translate(-259 -238)" fill="#B9A2FF" stroke="#B9A2FF">
        {MARK_LINKS.map(([from, to]) => (
          <line key={`${from}-${to}`} x1={MARK_NODES[from][0]} y1={MARK_NODES[from][1]} x2={MARK_NODES[to][0]} y2={MARK_NODES[to][1]} strokeWidth="26" strokeLinecap="round" />
        ))}
        {Object.entries(MARK_NODES).map(([id, [cx, cy, r]]) => <circle key={id} cx={cx} cy={cy} r={r} stroke="none" />)}
      </g>
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Polynet home">
      <Mark size={28} />
      <span>Polynet</span>
    </a>
  );
}

// The hero's picture: the Earth's horizon at night, and lines of violet light
// spreading from one bright point (the community's AI) to its people.
const ARCS: Array<[string, number, number, number, number]> = [
  ["M720 690 Q560 470 300 792", 0.9, 300, 792, 4], ["M720 690 Q600 560 448 738", 0.6, 448, 738, 4],
  ["M720 690 Q650 660 590 764", 0.35, 590, 764, 3.6], ["M720 690 Q800 620 860 746", 0.45, 860, 746, 4],
  ["M720 690 Q900 520 1010 776", 0.75, 1010, 776, 4], ["M720 690 Q980 420 1178 834", 1.05, 1178, 834, 3.6],
  ["M720 690 Q680 770 662 832", 0.55, 662, 832, 3.4], ["M720 690 Q770 780 802 852", 0.65, 802, 852, 3.4],
];
const STARS: Array<[number, number, number]> = [
  [96, 84, 1.3], [212, 168, 0.8], [338, 62, 1.1], [470, 214, 0.7], [560, 96, 1.4], [842, 58, 1], [968, 182, 0.8], [1096, 88, 1.3],
  [1238, 150, 1], [1356, 72, 1.2], [60, 300, 0.8], [182, 392, 1], [1290, 320, 0.9], [1392, 430, 1.1], [1150, 262, 0.7], [284, 270, 0.7],
  [700, 40, 0.8], [1010, 330, 0.7], [420, 356, 0.7],
];
const CITY_LIGHTS: Array<[number, number, number]> = [
  [296, 792, 1.7], [308, 800, 1.1], [286, 806, 1], [318, 812, 1.3], [330, 796, 0.9], [446, 738, 1.6], [458, 748, 1.1], [436, 752, 1],
  [468, 742, 0.9], [452, 762, 1], [588, 764, 1.5], [600, 774, 1], [578, 778, 0.9], [610, 760, 0.9], [706, 700, 1.4], [738, 706, 1.1],
  [694, 716, 1], [748, 722, 1], [858, 746, 1.6], [872, 756, 1.1], [848, 760, 1], [882, 748, 0.9], [1008, 776, 1.5], [1022, 786, 1],
  [998, 790, 0.9], [1176, 834, 1.5], [1190, 842, 1], [660, 832, 1.2], [800, 852, 1.2], [520, 850, 1], [940, 868, 1], [380, 868, 1],
];

function OrbitScene() {
  return (
    <svg className="orbit" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="pnEarth" gradientUnits="userSpaceOnUse" cx="560" cy="820" r="1000"><stop offset="0" stopColor="#172646" /><stop offset=".45" stopColor="#0B1326" /><stop offset="1" stopColor="#03050A" /></radialGradient>
        <radialGradient id="pnAtmo" gradientUnits="userSpaceOnUse" cx="720" cy="1780" r="1230"><stop offset=".912" stopColor="#6E8FFF" stopOpacity="0" /><stop offset=".922" stopColor="#8FB0FF" stopOpacity=".55" /><stop offset=".94" stopColor="#B9A2FF" stopOpacity=".22" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <linearGradient id="pnRim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9DB8FF" stopOpacity="0" /><stop offset=".3" stopColor="#BFD0FF" stopOpacity=".9" /><stop offset=".55" stopColor="#E4DAFF" /><stop offset=".8" stopColor="#9DB8FF" stopOpacity=".5" /><stop offset="1" stopColor="#9DB8FF" stopOpacity="0" /></linearGradient>
        <radialGradient id="pnHub" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".18" stopColor="#E4DAFF" stopOpacity=".95" /><stop offset=".5" stopColor="#A78BFA" stopOpacity=".45" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <radialGradient id="pnHaze" gradientUnits="userSpaceOnUse" cx="720" cy="700" r="520"><stop offset="0" stopColor="#7C5CF0" stopOpacity=".34" /><stop offset=".6" stopColor="#7C5CF0" stopOpacity=".07" /><stop offset="1" stopColor="#7C5CF0" stopOpacity="0" /></radialGradient>
        <linearGradient id="pnFade" x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stopColor="#08090A" stopOpacity="0" /><stop offset="1" stopColor="#08090A" /></linearGradient>
        <filter id="pnBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id="pnClip"><circle cx="720" cy="1780" r="1130" /></clipPath>
      </defs>
      <g fill="#DFE6FF">
        {STARS.map(([cx, cy, r], index) => (
          <circle key={index} className={index % 4 === 0 ? "orbit-star" : undefined} style={index % 4 === 0 ? { animationDelay: `-${index * 0.4}s` } : undefined} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <circle cx="720" cy="700" r="520" fill="url(#pnHaze)" />
      <circle cx="720" cy="1780" r="1230" fill="url(#pnAtmo)" />
      <circle cx="720" cy="1780" r="1130" fill="url(#pnEarth)" />
      <circle cx="720" cy="1780" r="1131" fill="none" stroke="url(#pnRim)" strokeWidth="10" opacity=".5" filter="url(#pnBlur)" />
      <circle cx="720" cy="1780" r="1130.5" fill="none" stroke="url(#pnRim)" strokeWidth="1.6" />
      <g clipPath="url(#pnClip)" fill="#FFC98A" opacity=".82">
        {CITY_LIGHTS.map(([cx, cy, r], index) => <circle key={index} cx={cx} cy={cy} r={r} />)}
      </g>
      <g fill="none" stroke="#C4B5FD" strokeWidth="1.5" strokeLinecap="round">
        {ARCS.map(([d, delay], index) => <path key={index} className="orbit-arc" pathLength={1} style={{ animationDelay: `${delay}s` }} d={d} />)}
      </g>
      <g fill="#EDE5FF">
        {ARCS.map(([, delay, cx, cy, r], index) => <circle key={index} className="orbit-node" style={{ animationDelay: `${delay + 1.3}s` }} cx={cx} cy={cy} r={r} />)}
      </g>
      <circle className="orbit-hub" cx="720" cy="690" r="86" fill="url(#pnHub)" />
      <circle cx="720" cy="690" r="7.5" fill="#FFFFFF" />
      <rect width="1440" height="900" fill="url(#pnFade)" />
    </svg>
  );
}

// What the community knows, as the app draws it: clusters around a bright centre.
function BrainPicture(props: { small?: boolean }) {
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

function BriefCard(props: { action: ReactNode; line: string; big?: boolean }) {
  return (
    <>
      <span className="shot-eyebrow">Your guide · 9:24 am</span>
      <strong className={props.big ? "shot-hello big" : "shot-hello"}>Good morning.</strong>
      <span className="shot-text">{props.line}</span>
      <div className="shot-ask">
        <div><b>Check in with Josh</b><span>Quiet for 25 days · next call is Friday</span></div>
        <div className="shot-acts">{props.action}</div>
      </div>
    </>
  );
}

// The app itself, drawn small: left menu, the morning brief, the brain beside it.
function ProductShot() {
  return (
    <div className="shot" role="img" aria-label="Polynet's Home: the left menu, the guide's morning brief, and the community brain">
      <div className="shot-side" aria-hidden="true">
        <b>Polynet</b>
        <span className="on">Home</span><span>Inbox</span>
        <em>Channels</em><span># General</span><span># wins</span>
        <em>Community</em><span>Knowledge</span><span>Events</span><span>Members</span>
      </div>
      <div className="shot-main" aria-hidden="true">
        <BriefCard big line="Two people finished Start here. Dev asked about pricing overnight and got an answer. One person needs you." action={<i>Review</i>} />
        <div className="shot-box">Ask your guide anything</div>
      </div>
      <div className="shot-rail" aria-hidden="true">
        <em>The community brain</em>
        <BrainPicture small />
        <span>1 learned · 1 new this week</span>
      </div>
    </div>
  );
}

function Showcase(props: { communities: DiscoverCommunitySnapshot[] }) {
  if (props.communities.length === 0) return null;
  return (
    <section className="showcase" id="communities" aria-labelledby="showcase-title" data-rv>
      <h2 id="showcase-title" className="label">Communities on Polynet</h2>
      <div className="showcase-grid">
        {props.communities.map((community) => (
          <a
            className="showcase-card"
            key={community.id}
            href={`/c/${community.slug}`}
            onClick={() => captureProductAnalyticsEvent("community_card_opened", { community_id: community.id, placement: "home" })}
          >
            <StableFramedMedia
              className="showcase-banner"
              imageUrl={community.banner_url}
              frame={{
                focusX: community.banner_focus_x,
                focusY: community.banner_focus_y,
                zoom: community.banner_zoom,
              }}
              alt=""
              loading="lazy"
              aria-hidden
            />
            <span className="showcase-body">
              <strong>{community.name}</strong>
              <span>{community.one_liner}</span>
              <em>{community.active_plan ? formatPlanPrice(community.active_plan) : "Free"}</em>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Header and footer shared by every public page. `links`: the page's own
// places to jump to (the landing page's sections).
export function PublicFrame(props: { onJoin: () => void; links?: ReactNode; children: ReactNode }) {
  return (
    <div className="pn-landing">
      <div className="page">
        <header className="topbar">
          <Brand />
          {props.links ? <nav className="topbar-links" aria-label="On this page">{props.links}</nav> : null}
          <nav aria-label="Account">
            <a href="/login">Sign in</a>
            <button className="cta cta-small" type="button" onClick={trackStart("header", props.onJoin)}>Start a community</button>
          </nav>
        </header>

        <main>{props.children}</main>

        <footer className="footer">
          <div className="footer-identity">
            <span>© 2026 Polynet</span>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/discover" onClick={trackFind("footer")}>Find a community</a>
            <a href="/login">Sign in</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}

// Sections fade in once as they come into view. Without the observer (or with
// motion turned down) everything is simply there.
function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-in", "1");
        seen.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    root.setAttribute("data-anim", "1");
    root.querySelectorAll("[data-rv]").forEach((node) => seen.observe(node));
    return () => {
      seen.disconnect();
      root.removeAttribute("data-anim");
    };
  }, []);
  return ref;
}

export function ConversionLanding({ onJoin }: JoinProps) {
  const [communities, setCommunities] = useState<DiscoverCommunitySnapshot[]>([]);
  const reveal = useReveal();

  useEffect(() => {
    captureProductAnalyticsEvent("home_viewed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listCloudDiscoverCommunities({ limit: 24 })
      .then((all) => {
        if (cancelled) return;
        setCommunities(
          all.filter((community) => community.banner_url && community.one_liner?.trim()).slice(0, SHOWCASE_LIMIT),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicFrame
      onJoin={onJoin}
      links={<><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="/discover" onClick={trackFind("header")}>Find a community</a></>}
    >
      <div ref={reveal} className="landing-body">
        <section className="hero" aria-labelledby="hero-title">
          <OrbitScene />
          <div className="hero-text">
            <h1 id="hero-title">A normal community forgets.<br /><b>Yours will think.</b></h1>
            <p className="subhead">Give your people a home with its own AI. It answers them, remembers them, and helps you run the place.</p>
            <div className="doors">
              <button className="cta" type="button" onClick={trackStart("hero", onJoin)}>Start a community</button>
              <a className="cta-quiet" href="/discover" onClick={trackFind("hero")}>Find a community</a>
            </div>
            <p className="microcopy">{LANDING_OFFER_LINE}</p>
          </div>
        </section>

        <section className="product" id="how" aria-label="The product" data-rv>
          <ProductShot />
          <p className="caption">One workspace for your members, your courses, your events and your community's memory.</p>
        </section>

        <section className="problem" aria-labelledby="problem-title" data-rv>
          <h2 id="problem-title">Communities take more work than they should.</h2>
          <div className="cards three">
            {PROBLEMS.map(([title, text]) => <article className="card" key={title}><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className="features" aria-label="What the AI does">
          <div className="feature" data-rv>
            <div className="feature-text">
              <span className="plan-tag">Guide</span>
              <h3>It answers members any hour of the day.</h3>
              <p>Every member gets a private guide that answers from your courses, notes and past discussions. Tag it in any channel when a question comes up again.</p>
            </div>
            <div className="panel" aria-hidden="true">
              <div className="msg"><span className="face">DO</span><div><b>Dev <i>2:07 am</i></b><span>How should I price my first cohort?</span></div></div>
              <div className="msg guide"><span className="face"><Sparkles size={15} aria-hidden="true" /></span><div><b>Your guide</b><span>Maya ran two cohorts here. Monthly billing kept more people to the end. Lesson 4 walks through it.</span><em>Lesson 4 · Pricing</em></div></div>
            </div>
          </div>

          <div className="feature flip" data-rv>
            <div className="feature-text">
              <span className="plan-tag">Guide · Community brain</span>
              <h3>It remembers what your community learns.</h3>
              <p>Courses, notes and helpful answers connect into one memory. When one member solves a problem, everyone who joins next benefits.</p>
            </div>
            <div className="panel">
              <span className="panel-label">The community brain</span>
              <BrainPicture />
              <span className="learned"><i />Learned this week: monthly billing keeps cohorts together</span>
            </div>
          </div>

          <div className="feature" data-rv>
            <div className="feature-text">
              <span className="plan-tag">Chief of Staff</span>
              <h3>It helps you run the community every day.</h3>
              <p>A morning brief shows what matters, who went quiet and which questions need you. It checks in on slipping members and drafts replies for you to approve.</p>
            </div>
            <div className="panel" aria-hidden="true">
              <BriefCard line="Two people finished Start here. One question went unanswered overnight; a reply is drafted." action={<><i>Approve</i><span>Edit</span><span>Skip</span></>} />
            </div>
          </div>
        </section>

        <section className="included" aria-labelledby="included-title" data-rv>
          <h2 id="included-title">Everything else your community needs.</h2>
          <div className="grid-six">
            {INCLUDED.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <Showcase communities={communities} />

        <section className="pricing" id="pricing" aria-labelledby="pricing-title" data-rv>
          <h2 id="pricing-title">Pricing</h2>
          <p className="section-sub">Start free with unlimited members. Add Guide or Chief of Staff per community when you're ready.</p>
          <div className="cards three plans">
            {LANDING_PLANS.map((plan) => (
              <article className={plan.lit ? "card plan lit" : "card plan"} key={plan.name}>
                <header>
                  <h3>{plan.name}{plan.lit ? <span className="recommended">Recommended</span> : null}</h3>
                  <p>{plan.line}</p>
                </header>
                <p className="price"><strong>{plan.price}</strong> {plan.per}</p>
                <ul>
                  {plan.points.map((point) => <li key={point}>{point}</li>)}
                  {plan.ai ? <li className="ai">{plan.ai}</li> : null}
                </ul>
                <button className={plan.lit ? "cta" : "cta-secondary"} type="button" onClick={trackStart(`pricing_${plan.name.toLowerCase().replace(/\s+/g, "_")}`, onJoin)}>Get started</button>
              </article>
            ))}
          </div>
          <p className="microcopy">Month to month, cancel anytime. Selling memberships carries a {FEE} fee plus Stripe's processing. No surprise AI bills.</p>
        </section>

        <section className="questions" aria-labelledby="questions-title" data-rv>
          <h2 id="questions-title">Questions</h2>
          <dl>
            {QUESTIONS.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
          </dl>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Your community is one name away.</h2>
          <button className="cta" type="button" onClick={trackStart("closing", onJoin)}>Start a community</button>
        </section>
      </div>
    </PublicFrame>
  );
}
