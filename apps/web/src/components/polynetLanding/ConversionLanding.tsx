import { useState } from "react";

import {
  PRIVACY_AI_DATA_POLICY_ENTRY,
  TERMS_OF_SERVICE_ENTRY,
  type LegalDocumentEntry,
} from "../../docs/legalDocumentsContent";
import { WebPlatformLegalReaderModal } from "../WebPlatformLegalReaderModal";

type JoinProps = { onJoin: () => void };

function PersonNode(props: { x: number; y: number }) {
  return (
    <g transform={`translate(${props.x} ${props.y})`}>
      <circle className="diagram-node" r="17" />
      <circle className="diagram-node" cy="-4" r="4" />
      <path className="diagram-line" d="M-8 9 C-5 1 5 1 8 9" />
    </g>
  );
}

function Brain(props: { compact?: boolean } = {}) {
  const brain = (
    <>
      <path
        className="brain-outline"
        d="M46 25 C38 18 28 22 28 31 C21 34 20 43 25 49 C20 56 24 66 34 67 C37 75 46 73 46 65 Z"
      />
      <path
        className="brain-outline"
        d="M46 25 C54 18 64 22 64 31 C71 34 72 43 67 49 C72 56 68 66 58 67 C55 75 46 73 46 65 Z"
      />
      <path className="brain-fold" d="M46 36 C40 31 34 34 35 41 M27 49 C34 46 39 51 36 57" />
      <path className="brain-fold brain-fold-2" d="M46 56 C41 52 37 57 39 64 M46 45 C41 43 39 46 39 50" />
      <path className="brain-fold brain-fold-3" d="M46 36 C52 31 58 34 57 41 M65 49 C58 46 53 51 56 57" />
      <path className="brain-fold brain-fold-2" d="M46 56 C51 52 55 57 53 64 M46 45 C51 43 53 46 53 50" />
    </>
  );
  return props.compact ? <g transform="scale(0.565)">{brain}</g> : brain;
}

function BuildCommunityVisual() {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-labelledby="community-visual-title">
      <title id="community-visual-title">Information moving through a founder-led community</title>
      <circle className="diagram-orbit" cx="180" cy="120" r="92" />
      <path className="diagram-line" d="M180 28 L180 120 L258 74 M180 120 L258 166 M180 120 L180 212 M180 120 L102 166 M180 120 L102 74" />
      <path className="diagram-line" d="M180 28 L258 74 L258 166 L180 212 L102 166 L102 74 Z" />
      <g transform="translate(180 120)">
        <circle className="diagram-node" r="24" />
        <circle className="diagram-node-accent" cy="-6" r="6" />
        <path className="diagram-line-accent" d="M-11 13 C-8 1 8 1 11 13" />
      </g>
      <PersonNode x={180} y={28} />
      <PersonNode x={258} y={74} />
      <PersonNode x={258} y={166} />
      <PersonNode x={180} y={212} />
      <PersonNode x={102} y={166} />
      <PersonNode x={102} y={74} />
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="5.2s" repeatCount="indefinite" path="M180 28 L180 120 L258 166" />
      </circle>
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="5.2s" begin="-1.8s" repeatCount="indefinite" path="M102 74 L180 120 L258 74" />
      </circle>
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="5.2s" begin="-3.6s" repeatCount="indefinite" path="M102 166 L180 120 L180 212" />
      </circle>
    </svg>
  );
}

function TrainAiVisual() {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-labelledby="knowledge-visual-title">
      <title id="knowledge-visual-title">Founder-owned material flowing into an AI that becomes more knowledgeable</title>
      <g transform="translate(42 120)">
        <circle className="diagram-node" r="20" />
        <circle className="diagram-node-accent" cy="-5" r="5" />
        <path className="diagram-line-accent" d="M-9 11 C-6 1 6 1 9 11" />
      </g>
      <g transform="translate(86 30)">
        <path className="diagram-boundary" d="M0 0 H42 V50 H0 Z M29 0 V13 H42" />
        <path className="diagram-line" d="M9 25 H32 M9 35 H28" />
      </g>
      <g transform="translate(81 96)">
        <path className="diagram-boundary" d="M0 0 H50 V36 H19 L9 46 V36 H0 Z" />
        <circle className="diagram-node-accent" cx="15" cy="18" r="2.3" />
        <circle className="diagram-node-accent" cx="25" cy="18" r="2.3" />
        <circle className="diagram-node-accent" cx="35" cy="18" r="2.3" />
      </g>
      <g transform="translate(86 166)">
        <rect className="diagram-boundary" width="44" height="34" rx="5" />
        <path className="diagram-line-accent" d="M18 8 L31 17 L18 26 Z" />
      </g>
      <path className="diagram-line" d="M62 112 C73 91 78 76 86 55 M62 120 H81 M62 128 C74 149 79 166 86 183" />
      <path className="diagram-line" d="M128 55 C178 55 187 94 230 108 M131 114 H230 M130 183 C177 183 187 145 230 132" />
      <g transform="translate(230 76)">
        <rect className="diagram-ai" width="92" height="92" rx="24" />
        <Brain />
      </g>
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="4.8s" repeatCount="indefinite" path="M128 55 C178 55 187 94 230 108" />
      </circle>
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="4.8s" begin="-1.6s" repeatCount="indefinite" path="M131 114 H230" />
      </circle>
      <circle className="diagram-particle" r="3.2">
        <animateMotion dur="4.8s" begin="-3.2s" repeatCount="indefinite" path="M130 183 C177 183 187 145 230 132" />
      </circle>
    </svg>
  );
}

function ServeAtScaleVisual() {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-labelledby="scale-visual-title">
      <title id="scale-visual-title">A trained AI sending useful information to every community member</title>
      <circle className="diagram-orbit" cx="180" cy="120" r="92" />
      <path className="diagram-line" d="M180 120 L180 28 M180 120 L258 74 M180 120 L258 166 M180 120 L180 212 M180 120 L102 166 M180 120 L102 74" />
      <g transform="translate(154 94)">
        <rect className="diagram-ai" width="52" height="52" rx="14" />
        <Brain compact />
      </g>
      <circle className="diagram-signal" cx="180" cy="28" r="21" />
      <circle className="diagram-signal diagram-signal-2" cx="258" cy="166" r="21" />
      <circle className="diagram-signal diagram-signal-3" cx="102" cy="166" r="21" />
      <PersonNode x={180} y={28} />
      <PersonNode x={258} y={74} />
      <PersonNode x={258} y={166} />
      <PersonNode x={180} y={212} />
      <PersonNode x={102} y={166} />
      <PersonNode x={102} y={74} />
      {[
        ["0s", "M180 120 L180 28"],
        ["-0.9s", "M180 120 L258 74"],
        ["-1.8s", "M180 120 L258 166"],
        ["-2.7s", "M180 120 L180 212"],
        ["-3.6s", "M180 120 L102 166"],
        ["-4.5s", "M180 120 L102 74"],
      ].map(([begin, path]) => (
        <circle className="diagram-particle" r="3.2" key={path}>
          <animateMotion dur="5.4s" begin={begin} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </svg>
  );
}

const STEPS = [
  {
    number: "01",
    title: "Build your community",
    description: "Bring your people, conversations, and resources into one shared place.",
    visual: <BuildCommunityVisual />,
  },
  {
    number: "02",
    title: "Train your AI",
    description: "Seed it with your content, calls, and best answers so it learns how you think.",
    visual: <TrainAiVisual />,
  },
  {
    number: "03",
    title: "Execute for every member",
    description: "Give every member an autonomous agent that coaches, supports, and helps complete the work whenever they need it.",
    visual: <ServeAtScaleVisual />,
  },
] as const;

const PROBLEMS = [
  {
    title: "A platform people actually want to use",
    description: "Simple enough to feel effortless. Flexible enough to feel alive. AI is built into the community from the beginning—not added as another disconnected tool.",
  },
  {
    title: "Grow without becoming the support team",
    description: "Train your AI on your content, frameworks, and best answers. Members get help immediately, while you stop answering the same questions repeatedly.",
  },
  {
    title: "Your AI gets smarter as your community grows",
    description: "You provide the foundation. Useful answers, conversations, and outcomes become shared intelligence that is easier to find and reuse—without constantly creating, organizing, and updating more content.",
  },
] as const;

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Polynet home">
      <img src="/landing-polynet/logo.png" alt="" />
      <span>Polynet<span>.</span></span>
    </a>
  );
}

export function ConversionLanding({ onJoin }: JoinProps) {
  const [activeLegalDocument, setActiveLegalDocument] =
    useState<LegalDocumentEntry | null>(null);

  return (
    <div className="pn-landing">
      <div className="page">
        <Brand />
        <main>
          <div className="intro">
            <p className="intro-kicker">For community builders, coaches, course creators, and agencies</p>
            <h1>The autonomous client success platform.</h1>
            <p className="subhead">Train an AI on your expertise, methodology, content, and processes—then deploy it to coach, support, and execute for every member or client, all at once.</p>
          </div>

          <div className="vsl">
            <iframe
              src="https://player.vimeo.com/video/1216548030?dnt=1&title=0&byline=0&portrait=0"
              title="Polynet video sales letter"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="conversion">
            <button className="cta" type="button" onClick={onJoin}>Create your community — $79/month</button>
            <p className="microcopy">$79/month per community · Polynet-hosted AI included · No technical setup</p>
          </div>

          <section className="mechanism" aria-label="What Polynet Builder helps you do">
            <p className="mechanism-title">How Polynet works</p>
            <div className="mechanism-grid">
              {STEPS.map((step) => (
                <article className="mechanism-step" key={step.number}>
                  <div className="mechanism-copy">
                    <span className="mechanism-label">{step.number}</span>
                    <h2>{step.title}</h2>
                  </div>
                  <div className="mechanism-visual">{step.visual}</div>
                  <p className="mechanism-description">{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="problems" aria-labelledby="problems-title">
            <div className="problems-intro">
              <p className="problems-kicker">Built to compound</p>
              <h2 id="problems-title">Your community should get easier to run as it grows.</h2>
              <p className="problems-lead">Most platforms create more administration, more repeated questions, and more content to maintain. Polynet turns growth into leverage.</p>
            </div>
            <div className="problem-list">
              {PROBLEMS.map((problem, index) => (
                <article className="problem" key={problem.title}>
                  <span className="problem-index">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{problem.title}</h3>
                  <p>{problem.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="closing" aria-labelledby="closing-title">
            <h2 id="closing-title">Build your community. Train your AI. Execute for every member.</h2>
            <p className="closing-copy">Give your members a better home—and an agent grounded in how you think.</p>
            <button className="cta" type="button" onClick={onJoin}>Create your community — $79/month</button>
            <p className="closing-meta">$79/month per community · Polynet-hosted AI included · No technical setup</p>
            <p className="closing-terms">Paid memberships carry a 2.9% Polynet platform fee. Stripe processing fees are separate.</p>
          </section>
        </main>

        <footer className="footer">
          <div className="footer-identity">
            <Brand />
            <span>© 2026 Polynet</span>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/login">Sign in</a>
            <button type="button" onClick={() => setActiveLegalDocument(PRIVACY_AI_DATA_POLICY_ENTRY)}>Privacy</button>
            <button type="button" onClick={() => setActiveLegalDocument(TERMS_OF_SERVICE_ENTRY)}>Terms</button>
          </nav>
        </footer>
      </div>
      {activeLegalDocument ? (
        <WebPlatformLegalReaderModal
          document={activeLegalDocument}
          onClose={() => setActiveLegalDocument(null)}
        />
      ) : null}
    </div>
  );
}
