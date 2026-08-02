/* Conversion landing page composed by WebLandingPage.tsx.
   One CTA (onJoin) repeated; pink is reserved for the community AI. */
import { useCallback, useEffect, useRef, useState } from "react";

type JoinProps = { onJoin: () => void };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/* Types out `text` when `active` flips true; instant under reduced motion. */
function useTyped(text: string, speedMs: number, active: boolean, onDone?: () => void) {
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      setCount(text.length);
      const t = setTimeout(() => doneRef.current?.(), 300);
      return () => clearTimeout(t);
    }
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        clearInterval(iv);
        doneRef.current?.();
      }
    }, speedMs);
    return () => clearInterval(iv);
  }, [text, speedMs, active]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

function Caret() {
  return <span className="caret" aria-hidden="true" />;
}

/* --- demo scenes ------------------------------------------------------- */

const SCENE_CAPTIONS: Array<{ strong: string; rest: string }> = [
  { strong: "Answers with community context", rest: " — grounded in shared resources and past learnings." },
  { strong: "Useful knowledge compounds", rest: " — what works becomes reusable community intelligence." },
  { strong: "The right context finds each member", rest: " — without digging through old conversations." },
];

const Q_TEXT = "How should I price my first paid cohort? ~400 on the waitlist.";
const A_TEXT =
  "Start at $149 and cap cohort one at ~200 — that keeps delivery focused while validating demand. A member documented a similar launch in the community. Want the playbook?";
const WELCOME_TEXT = "Here's the community context for planning your first launch:";

type SceneProps = { onDone: () => void };

function SceneAnswer(props: SceneProps & { onAnswered: () => void }) {
  const [phase, setPhase] = useState<"q" | "wait" | "a" | "end">("q");
  const [reacted, setReacted] = useState(false);
  const q = useTyped(Q_TEXT, 16, phase === "q", () => setPhase("wait"));
  const answeredRef = useRef(props.onAnswered);
  answeredRef.current = props.onAnswered;
  useEffect(() => {
    if (phase !== "wait") return;
    const t = setTimeout(() => setPhase("a"), 400);
    return () => clearTimeout(t);
  }, [phase]);
  const a = useTyped(A_TEXT, 11, phase === "a" || phase === "end", () => {
    setPhase("end");
    answeredRef.current();
  });
  const doneRef = useRef(props.onDone);
  doneRef.current = props.onDone;
  useEffect(() => {
    if (phase !== "end") return;
    const t1 = setTimeout(() => setReacted(true), 500);
    const t2 = setTimeout(() => doneRef.current(), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);
  return (
    <>
      <div className="msg">
        <div className="av" />
        <div className="body">
          <div className="nm">
            Member <span className="time">2:47 AM</span>
          </div>
          <div className="tx">
            {q.shown}
            {!q.done && <Caret />}
          </div>
        </div>
      </div>
      <div className="msg ai">
        <div className="av ai" />
        <div className="body">
          <div className="nm">
            Community AI <span>using community knowledge</span>
          </div>
          <div className="tx">
            {a.shown}
            {(phase === "a" || phase === "wait") && !a.done && <Caret />}
          </div>
          <div className={`sources${phase === "end" ? " on" : ""}`}>
            <span>◆ Pricing playbook</span>
            <span>▤ Member launch recap</span>
          </div>
        </div>
      </div>
      <div className={`react${reacted ? " on" : ""}`}>🔥 Member reacted</div>
    </>
  );
}

function SceneMemory(props: SceneProps & { onSaved: () => void }) {
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(props.onSaved);
  savedRef.current = props.onSaved;
  const doneRef = useRef(props.onDone);
  doneRef.current = props.onDone;
  useEffect(() => {
    const t1 = setTimeout(() => {
      setSaved(true);
      savedRef.current();
    }, 700);
    const t2 = setTimeout(() => doneRef.current(), 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <div className="msg ai">
      <div className="av ai" />
      <div className="body">
        <div className="nm">Community AI</div>
        <div className="tx">…so price the first cohort at $149 and cap it at 200.</div>
        <div className={`savecard${saved ? " on" : ""}`}>
          <span className="ic">◆</span>
          <span className="l">
            Added to <b>Cohort pricing playbook</b>
            <em>Available to the community</em>
          </span>
        </div>
      </div>
    </div>
  );
}

const ONBOARD_STEPS = [
  "Cohort pricing playbook",
  "Member launch recap",
  "Offer workshop notes",
];

function SceneOnboard(props: SceneProps) {
  const [typingDone, setTypingDone] = useState(false);
  const [ticked, setTicked] = useState(0);
  const w = useTyped(WELCOME_TEXT, 13, true, () => setTypingDone(true));
  const doneRef = useRef(props.onDone);
  doneRef.current = props.onDone;
  useEffect(() => {
    if (!typingDone) return;
    const timers = ONBOARD_STEPS.map((_, i) =>
      setTimeout(() => setTicked((n) => Math.max(n, i + 1)), 300 + i * 500),
    );
    const done = setTimeout(() => doneRef.current(), 3400);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [typingDone]);
  return (
    <div className="msg ai">
      <div className="av ai" />
      <div className="body">
        <div className="nm">Community AI</div>
        <div className="tx">
          {w.shown}
          {!w.done && <Caret />}
        </div>
        <div className="steps">
          {ONBOARD_STEPS.map((label, i) => (
            <div className={`st${ticked > i ? " done" : ""}`} key={label}>
              <span className="c">✓</span> {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoWindow() {
  const [scene, setScene] = useState(0);
  const [run, setRun] = useState(0);
  const [playbooks, setPlaybooks] = useState(14);
  const [answers, setAnswers] = useState(128);
  const advance = useCallback(() => setScene((s) => (s + 1) % 3), []);
  const jump = useCallback((i: number) => {
    setScene(i);
    setRun((r) => r + 1);
  }, []);
  const caption = SCENE_CAPTIONS[scene];
  const onboardBoost = scene === 2;
  return (
    <>
      <div className="product" id="demo">
        <div className="pbar">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="addr">polynet.ai / your-community</span>
          <span className="live">
            <i /> Demo · AI online
          </span>
        </div>
        <div className="app">
          <div className="nav-col">
            <div className="wtitle">
              <span className="g" />
              <b>Your Community</b>
            </div>
            <div className="it on">
              <span className="b" /> General
            </div>
            <div className="it">
              <span className="b" /> AI Feed
            </div>
            <div className="it">
              <span className="b" /> Resources
            </div>
            <div className="it">
              <span className="b" /> Events
            </div>
            <div className="it">
              <span className="b" /> Members
            </div>
          </div>
          <div className="chat-col">
            {scene === 0 && (
              <SceneAnswer
                key={`s0-${run}`}
                onDone={advance}
                onAnswered={() => setAnswers((n) => n + 1)}
              />
            )}
            {scene === 1 && (
              <SceneMemory
                key={`s1-${run}`}
                onDone={advance}
                onSaved={() => setPlaybooks((n) => n + 1)}
              />
            )}
            {scene === 2 && <SceneOnboard key={`s2-${run}`} onDone={advance} />}
          </div>
          <div className="mem-col">
            <div className="h">Online · {onboardBoost ? 7 : 6}</div>
            <div className="mrow">
              <span className="on-dot" /> You
            </div>
            <div className="mrow">
              <span className="a" /> Moderator
            </div>
            <div className="mrow">
              <span className="a" /> Member
            </div>
            <div className={`mrow newjoin${onboardBoost ? " on" : ""}`}>
              <span className="on-dot" /> New member · joined
            </div>
            <div className="h gap">Memory</div>
            <div className="mrow tick">◆ {playbooks} playbooks</div>
            <div className="mrow">▤ {answers} answers saved</div>
          </div>
        </div>
      </div>
      <div className="scene-cap">
        <b>{caption.strong}</b>
        {caption.rest}
      </div>
      <div className="scene-dots">
        {SCENE_CAPTIONS.map((c, i) => (
          <button
            type="button"
            key={c.strong}
            className={scene === i ? "on" : ""}
            aria-label={`Play scene ${i + 1}`}
            onClick={() => jump(i)}
          />
        ))}
      </div>
    </>
  );
}

/* --- page sections ------------------------------------------------------ */

function LandingNav({ onJoin }: JoinProps) {
  return (
    <nav className="pn-nav">
      <div className="wrap in">
        <a href="/" className="lockup" onClick={(e) => e.preventDefault()}>
          <img src="/landing-polynet/logo.png" alt="Polynet" />
          <span className="name">
            Polynet<b>.</b>
          </span>
        </a>
        <div className="links">
          <a
            href="#why"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("why");
            }}
          >
            Why Polynet
          </a>
          <a
            href="#compare"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("compare");
            }}
          >
            The difference
          </a>
          <a
            href="#pricing"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("pricing");
            }}
          >
            Pricing
          </a>
        </div>
        <button type="button" className="btn btn-primary" onClick={onJoin}>
          Create your community <span className="arrow">→</span>
        </button>
      </div>
    </nav>
  );
}

function Hero({ onJoin }: JoinProps) {
  return (
    <header className="hero">
      <div className="glowbg" />
      <div className="wrap">
        <div className="inner">
          <div className="pill">
            <b>Early access</b> · Collective intelligence for communities
          </div>
          <h1>Build a community that gets smarter every day.</h1>
          <p className="sub">
            Polynet brings your members, knowledge, and community AI into one living system — so
            useful context compounds instead of disappearing in chat.
          </p>
          <div className="cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={onJoin}>
              Create your community <span className="arrow">→</span>
            </button>
            <a
              className="btn btn-ghost btn-lg"
              href="#demo"
              onClick={(e) => {
                e.preventDefault();
                scrollToId("demo");
              }}
            >
              Watch it work ↓
            </a>
          </div>
          <div className="micro">
            <b>One simple plan</b> · $79/month per community
          </div>
        </div>
        <DemoWindow />
      </div>
    </header>
  );
}

function ProofLine() {
  return (
    <div className="proof">
      <div className="wrap in">
        <i>“I built Polynet because my best answers kept dying in the scroll.”</i> —{" "}
        <b>Neil, founder</b> &nbsp;·&nbsp; Early access — communities onboarding now
      </div>
    </div>
  );
}

function Benefits() {
  return (
    <section className="blk" id="why">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">Why Polynet</div>
          <h2>Stop being the bottleneck. Let your community’s knowledge compound.</h2>
        </div>
        <div className="bens">
          <div className="ben">
            <h3>Preserve what works</h3>
            <p>Useful answers, resources, and outcomes become durable community knowledge.</p>
          </div>
          <div className="ben">
            <h3>Put knowledge to work</h3>
            <p>The community AI uses relevant context to help members move forward.</p>
          </div>
          <div className="ben">
            <h3>Stay the expert, not the help desk</h3>
            <p>Give members access to the community’s intelligence without repeating yourself.</p>
          </div>
        </div>
        <p className="personas-line">
          Built for <b>coaches, consultants, course creators, YouTubers, streamers, and vibe coders</b>{" "}
          — anyone who teaches what they know.
        </p>
      </div>
    </section>
  );
}

const COMPARISON_ROWS: Array<{ label: string; conventional: string; polynet: string }> = [
  { label: "Conversations", conventional: "Organized in feeds", polynet: "Become reusable context" },
  { label: "Knowledge", conventional: "Stored in posts and files", polynet: "Available to members and agents" },
  { label: "AI", conventional: "An add-on for admins", polynet: "A community participant" },
  { label: "Value over time", conventional: "More content to search", polynet: "A community that learns" },
  { label: "Commerce", conventional: "Paid memberships", polynet: "Memberships plus collective intelligence" },
];

function Comparison({ onJoin }: JoinProps) {
  return (
    <section className="blk tight" id="compare">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">The difference</div>
          <h2>Community software gives people a place to talk. Polynet helps them think together.</h2>
        </div>
        <div className="cmp">
          <div className="row h">
            <div>&nbsp;</div>
            <div className="them">Community software</div>
            <div className="us">Polynet</div>
          </div>
          {COMPARISON_ROWS.map((row) => (
            <div className="row" key={row.label}>
              <div className="lbl">{row.label}</div>
              <div className="them">{row.conventional}</div>
              <div className="us">{row.polynet}</div>
            </div>
          ))}
        </div>
        <div className="midcta">
          <button type="button" className="btn btn-primary" onClick={onJoin}>
            Create your community <span className="arrow">→</span>
          </button>
          <span>$79/month per community</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="blk tight">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">How it works</div>
          <h2>Turn participation into shared intelligence.</h2>
        </div>
        <div className="howline">
          <div className="hs">
            <div className="num">01</div>
            <h3>Create your community</h3>
            <p>Define its purpose, access, and member experience.</p>
          </div>
          <div className="hs">
            <div className="num">02</div>
            <h3>Add shared knowledge</h3>
            <p>Bring resources, expertise, and useful community context.</p>
          </div>
          <div className="hs">
            <div className="num">03</div>
            <h3>Let intelligence compound</h3>
            <p>Members and agents reuse what the community learns.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const INCLUDED_FEATURES = [
  "Your hosted community and member space",
  "A dedicated community AI",
  "Polynet-hosted inference",
  "Shared knowledge, resources, and memory",
  "Posts, chat, and voice",
  "Member access and community invitations",
  "Paid memberships and automated payouts",
  "Connections to external AI tools",
];

function PricingOffer({ onJoin }: JoinProps) {
  return (
    <section className="blk tight" id="pricing">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">Pricing</div>
          <h2>One plan. One intelligent community.</h2>
        </div>
        <div className="offer">
          <div className="offer-price">
            <div className="stage">Polynet community</div>
            <div className="amt">
              $79 <span>/month</span>
            </div>
            <p>Per community. Create as many communities as you want; each is billed separately.</p>
            <button type="button" className="btn btn-primary" onClick={onJoin}>
              Create your community <span className="arrow">→</span>
            </button>
          </div>
          <div className="offer-includes">
            <div className="stage">Included</div>
            <ul>
              {INCLUDED_FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="price-micro">
          Polynet keeps a 2.9% platform fee from paid-member revenue. Stripe processing fees apply
          separately.
        </p>
      </div>
    </section>
  );
}

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Do I need to be technical?",
    a: "No. Polynet hosts the community AI and inference for you. You can build the community, add resources, and invite members without managing AI infrastructure.",
  },
  {
    q: "Do I pay per account or per community?",
    a: "Per community. Each community is $79 per month. You can create as many communities as you want, and each is billed separately.",
  },
  {
    q: "What is Polynet-hosted inference?",
    a: "Your community AI runs on Polynet. You do not need to connect or manage a separate AI provider for your hosted community.",
  },
  {
    q: "Can I charge members for access?",
    a: "Yes. Polynet supports paid memberships and automated payouts. Polynet keeps a 2.9% platform fee from paid-member revenue, and Stripe processing fees apply separately.",
  },
  {
    q: "What makes Polynet different from community software?",
    a: "Polynet is built around collective intelligence. Community knowledge can be used by members and agents instead of remaining trapped in feeds, files, and old conversations.",
  },
];

function Faq() {
  return (
    <section className="blk tight">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">Questions</div>
          <h2>The things everyone asks.</h2>
        </div>
        <div className="faq">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <div className="a">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CloseCta({ onJoin }: JoinProps) {
  return (
    <section className="close">
      <div className="wrap">
        <div className="note">One plan · $79/month per community</div>
        <h2>Build the community that learns with its members.</h2>
        <div className="cta">
          <button type="button" className="btn btn-primary btn-lg" onClick={onJoin}>
            Create your community <span className="arrow">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer>
      <div className="wrap in">
        <span className="lockup">
          <img src="/landing-polynet/logo.png" alt="" />
          <span className="name">
            Polynet<b>.</b>
          </span>
        </span>
        <span className="lg">© Polynet 2026 · The collective intelligence platform for communities</span>
      </div>
    </footer>
  );
}

export function ConversionLanding({ onJoin }: JoinProps) {
  return (
    <div className="pn-landing">
      <LandingNav onJoin={onJoin} />
      <main>
        <Hero onJoin={onJoin} />
        <ProofLine />
        <Benefits />
        <Comparison onJoin={onJoin} />
        <HowItWorks />
        <PricingOffer onJoin={onJoin} />
        <Faq />
        <CloseCta onJoin={onJoin} />
      </main>
      <LandingFooter />
    </div>
  );
}
