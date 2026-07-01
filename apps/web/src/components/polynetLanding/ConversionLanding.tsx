/* Conversion landing page — design locked in polynet-landing-mocks/08-premium-simplified.html.
   Composed by WebLandingPage.tsx. One CTA (onJoin) repeated; pink is reserved for the AI. */
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
  { strong: "Answers every member, 24/7", rest: " — even at 2:47 AM, in your voice." },
  { strong: "Nothing evaporates", rest: " — great answers become playbooks, reused by every member." },
  { strong: "New members onboard themselves", rest: " — greeted, guided to a first win, retained." },
];

const Q_TEXT = "How should I price my first paid cohort? ~400 on the waitlist.";
const A_TEXT =
  "Start at $149 and cap cohort one at ~200 — scarcity converts the list and de-risks delivery. Another member ran this exact play and sold out. Want the launch sequence?";
const WELCOME_TEXT = "Welcome! You said you're launching a course — here's your first-win path:";

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
            Community AI <span>trained on your content</span>
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
            Saved to <b>Cohort pricing playbook</b>
            <em>Reused 31 times by members</em>
          </span>
        </div>
      </div>
    </div>
  );
}

const ONBOARD_STEPS = [
  "Read the launch playbook",
  "Meet 3 members in your niche",
  "Draft your offer with the AI",
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
              <span className="b" /> Chat
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
            vs Skool &amp; Discord
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
          Start free <span className="arrow">→</span>
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
            <b>Early access</b> · The AI-first community platform
          </div>
          <h1>Give your community an AI that answers for you.</h1>
          <p className="sub">
            Train it on your content and your voice. Every member gets 1:1 help around the clock —
            you keep the work only you can do.
          </p>
          <div className="cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={onJoin}>
              Start free <span className="arrow">→</span>
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
            <b>No card</b> · Bring your members from Skool or Discord · Live in an afternoon
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
          <h2>Stop being the bottleneck in your own community.</h2>
        </div>
        <div className="bens">
          <div className="ben">
            <h3>Never answer twice</h3>
            <p>The AI handles repeat questions 24/7 — trained on your content, in your voice.</p>
          </div>
          <div className="ben">
            <h3>Your knowledge compounds</h3>
            <p>Great answers become playbooks instead of scrolling away. Smarter every week.</p>
          </div>
          <div className="ben">
            <h3>Members stay</h3>
            <p>Everyone gets 1:1 help on demand — the thing that makes people renew.</p>
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

const COMPARISON_ROWS: Array<{ label: string; them: boolean }> = [
  { label: "An AI trained on your content, in your voice", them: false },
  { label: "Answers every member 1:1, 24/7", them: false },
  { label: "Knowledge saved into searchable playbooks", them: false },
  { label: "Onboards every new member for you", them: false },
  { label: "Sell memberships & paid access", them: true },
];

function Comparison({ onJoin }: JoinProps) {
  return (
    <section className="blk tight" id="compare">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">The difference</div>
          <h2>Built for the AI era. Skool and Discord weren't.</h2>
        </div>
        <div className="cmp">
          <div className="row h">
            <div>&nbsp;</div>
            <div className="them">Skool / Discord</div>
            <div className="us">Polynet</div>
          </div>
          {COMPARISON_ROWS.map((row) => (
            <div className="row" key={row.label}>
              <div className="lbl">{row.label}</div>
              <div className="them">{row.them ? <span className="ck">✓</span> : <span className="xk">—</span>}</div>
              <div className="us">
                <span className="ck">✓</span>
              </div>
            </div>
          ))}
        </div>
        <div className="midcta">
          <button type="button" className="btn btn-primary" onClick={onJoin}>
            Start free <span className="arrow">→</span>
          </button>
          <span>No card · Live in an afternoon</span>
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
          <h2>Live in an afternoon.</h2>
        </div>
        <div className="howline">
          <div className="hs">
            <div className="num">01</div>
            <h3>Bring your content</h3>
            <p>Courses, docs, videos, past Q&amp;As.</p>
          </div>
          <div className="hs">
            <div className="num">02</div>
            <h3>Your AI trains on you</h3>
            <p>Your method, your voice — nothing else.</p>
          </div>
          <div className="hs">
            <div className="num">03</div>
            <h3>Invite your members</h3>
            <p>One link. 1:1 help from day one.</p>
          </div>
        </div>
        <p className="migrate">
          Coming from Skool or Discord? <b>Move in an afternoon</b> — we help with the transition.
        </p>
      </div>
    </section>
  );
}

function PricingJourney() {
  return (
    <section className="blk tight" id="pricing">
      <div className="wrap">
        <div className="shead">
          <div className="eyebrow">Pricing</div>
          <h2>You don't pay until you get paid.</h2>
        </div>
        <div className="journey">
          <div className="j hi">
            <div className="stage">Launch</div>
            <div className="amt">Free</div>
            <p>
              Everything you need: your community, your trained AI, your members. No card, no trial
              clock.
            </p>
          </div>
          <div className="j">
            <div className="stage">Grow</div>
            <div className="amt">Pro, when you're ready</div>
            <p>Optional power: deeper AI, more memory, advanced controls.</p>
          </div>
          <div className="j">
            <div className="stage">Earn</div>
            <div className="amt">No monthly bill</div>
            <p>When members pay you, we keep a small share. If you earn nothing, you pay nothing.</p>
          </div>
        </div>
        <p className="price-micro">
          No $99/month just to keep the lights on. Polynet is free until your community pays you.
        </p>
      </div>
    </section>
  );
}

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Do I need to be technical?",
    a: "No. If you can upload a file and paste a link, you can launch. No code, no prompt engineering.",
  },
  {
    q: "What about my existing Skool or Discord community?",
    a: "Bring it with you. Import your content, invite members with one link — most creators move in an afternoon, and we help.",
  },
  {
    q: "What if the AI gets something wrong?",
    a: "Every answer cites its sources, you can correct it in one click, and corrections become memory — it gets sharper the more your community uses it.",
  },
  {
    q: "What does free actually include?",
    a: "The real thing: your community, your trained AI, your members. You only ever pay two ways — optional Pro upgrades, and a small share of memberships you charge for. If you earn nothing, you pay nothing.",
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
        <div className="note">Communities are becoming intelligent. Get yours there first.</div>
        <h2>Keep being the expert. Stop being the bottleneck.</h2>
        <div className="cta">
          <button type="button" className="btn btn-primary btn-lg" onClick={onJoin}>
            Start free <span className="arrow">→</span>
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
        <span className="lg">© Polynet 2026 · The AI-first community platform</span>
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
        <PricingJourney />
        <Faq />
        <CloseCta onJoin={onJoin} />
      </main>
      <LandingFooter />
    </div>
  );
}
