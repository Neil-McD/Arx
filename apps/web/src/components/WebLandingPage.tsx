type WebLandingPageProps = {
  onTryFree: () => void;
};

const stackItems = [
  {
    category: "AI assistance",
    vendor: "Perplexity Computer",
    domain: "perplexity.ai",
    cost: "$200",
  },
  {
    category: "Community",
    vendor: "Skool Pro",
    domain: "skool.com",
    cost: "$99",
  },
  {
    category: "Knowledge resources",
    vendor: "Notion Business",
    domain: "notion.com",
    cost: "$20",
  },
  {
    category: "Funnel + paid access",
    vendor: "ClickFunnels Scale",
    domain: "clickfunnels.com",
    cost: "$197",
  },
];

const stackTotal = "$516+";

function FlowCoreMark() {
  return (
    <g className="polynet-flow-core-mark">
      <path d="M45 40C35 40 28 33 28 24C28 15 35 9 44 10C49 3 61 3 66 10C76 9 84 16 84 26C84 35 77 42 68 42" />
      <path d="M45 40C37 46 38 58 49 61C53 69 67 69 71 60C82 58 84 45 76 39" />
      <path d="M45 40L55 29L68 42L76 39" />
      <path d="M49 61L57 48L71 60" />
      <circle cx="45" cy="40" r="5" />
      <circle cx="55" cy="29" r="5" />
      <circle cx="68" cy="42" r="5" />
      <circle cx="49" cy="61" r="5" />
      <circle cx="71" cy="60" r="5" />
    </g>
  );
}

function LandingFlowVisual(props: { kind: "agent" | "community" | "gate" | "loop" }) {
  if (props.kind === "community") {
    return (
      <svg className="polynet-landing-flow-visual" viewBox="0 0 112 88" aria-hidden="true">
        <ellipse className="polynet-flow-muted" cx="56" cy="44" rx="48" ry="31" />
        <circle className="polynet-flow-person" cx="56" cy="9" r="5" />
        <circle className="polynet-flow-person" cx="89" cy="24" r="5" />
        <circle className="polynet-flow-person" cx="89" cy="64" r="5" />
        <circle className="polynet-flow-person" cx="56" cy="79" r="5" />
        <circle className="polynet-flow-person" cx="23" cy="64" r="5" />
        <circle className="polynet-flow-person" cx="23" cy="24" r="5" />
        <FlowCoreMark />
      </svg>
    );
  }

  if (props.kind === "gate") {
    return (
      <svg className="polynet-landing-flow-visual" viewBox="0 0 112 88" aria-hidden="true">
        <rect className="polynet-flow-muted fill" x="25" y="29" width="62" height="46" rx="14" />
        <path className="polynet-flow-line" d="M39 31V23C39 12 46 5 56 5C66 5 73 12 73 23V31" />
        <rect className="polynet-flow-line" x="31" y="31" width="50" height="38" rx="9" />
        <circle className="polynet-flow-line fill" cx="56" cy="50" r="3" />
        <g transform="translate(0 3) scale(0.92) translate(5 0)">
          <FlowCoreMark />
        </g>
      </svg>
    );
  }

  if (props.kind === "loop") {
    return (
      <svg className="polynet-landing-flow-visual" viewBox="0 0 112 88" aria-hidden="true">
        <path className="polynet-flow-line" d="M26 29C34 13 55 6 73 15C84 21 91 31 93 43" />
        <path className="polynet-flow-line" d="M86 39L94 45L99 36" />
        <path className="polynet-flow-line" d="M86 61C76 76 53 82 36 70C27 64 20 54 19 42" />
        <path className="polynet-flow-line" d="M26 46L18 40L13 49" />
        <rect className="polynet-flow-memory" x="18" y="66" width="14" height="10" rx="3" />
        <rect className="polynet-flow-memory" x="37" y="74" width="14" height="10" rx="3" />
        <rect className="polynet-flow-memory" x="80" y="67" width="14" height="10" rx="3" />
        <FlowCoreMark />
      </svg>
    );
  }

  return (
    <svg className="polynet-landing-flow-visual" viewBox="0 0 112 88" aria-hidden="true">
      <FlowCoreMark />
    </svg>
  );
}

export function WebLandingPage(props: WebLandingPageProps) {
  return (
    <div className="polynet-landing-page">
      <section className="polynet-landing-hero" aria-labelledby="polynet-landing-title">
        <nav className="polynet-landing-nav" aria-label="Polynet">
          <a className="polynet-landing-brand" href="/">
            <img src="/favicon.svg" alt="" />
            <span>Polynet</span>
          </a>
          <div className="polynet-landing-nav-actions">
            <button type="button" className="primary" onClick={props.onTryFree}>
              Try Polynet free
            </button>
          </div>
        </nav>

        <div className="polynet-landing-hero-grid">
          <div className="polynet-landing-copy">
            <p className="polynet-landing-kicker">Services as software</p>
            <h1 id="polynet-landing-title">
              Build an <span>AI community</span> that <span>thinks</span>, <span>remembers</span>, and <span>acts</span>.
            </h1>
            <p className="polynet-landing-subcopy">
              Build, distribute, and monetize agent-powered communities.
            </p>
            <div className="polynet-landing-cta-row">
              <button type="button" className="primary" onClick={props.onTryFree}>
                Try Polynet free
              </button>
            </div>
          </div>

          <div
            className="polynet-landing-video"
            aria-label="Polynet overview video preview"
          >
            <span className="polynet-landing-video-topline">Polynet overview</span>
            <span className="polynet-landing-video-stage">
              <span className="polynet-landing-product" aria-hidden="true">
                <span className="polynet-landing-rail">
                  <span className="polynet-landing-rail-icon active">
                    <img src="/favicon.svg" alt="" />
                  </span>
                  <span className="polynet-landing-rail-icon">D</span>
                  <span className="polynet-landing-rail-add">+</span>
                </span>
                <span className="polynet-landing-workspace">
                  <span className="polynet-landing-agent-card">
                    <img src="/favicon.svg" alt="" />
                    <strong>
                      Welcome to <span>Polynet</span>
                    </strong>
                    <em>You are in the Polynet workspace</em>
                  </span>
                  <span className="polynet-landing-composer">
                    <span>Describe what you need help with...</span>
                    <span>
                      <span>+</span>
                      <span>GPT 5.5</span>
                      <span className="polynet-landing-send">↑</span>
                    </span>
                  </span>
                  <span className="polynet-landing-actions">
                    <span>Build a business</span>
                    <span>Explain the platform</span>
                    <span>Use a community agent</span>
                  </span>
                </span>
              </span>
              <span className="polynet-landing-play">▶</span>
            </span>
            <span className="polynet-landing-video-caption">
              Watch how an agent-powered community comes together.
            </span>
          </div>
        </div>
      </section>

      <section className="polynet-landing-offer" aria-labelledby="polynet-landing-offer">
        <div>
          <p className="polynet-landing-kicker">One builder system</p>
          <h2 id="polynet-landing-offer">
            One place to build, distribute, and monetize useful agents.
          </h2>
        </div>
        <div className="polynet-landing-offer-actions">
          <button type="button" onClick={props.onTryFree}>
            Continue free
          </button>
          <button type="button" className="primary" onClick={props.onTryFree}>
            Become a builder - $24/mo
          </button>
        </div>
      </section>

      <section className="polynet-landing-section comparison" aria-labelledby="polynet-landing-stack">
        <div className="polynet-landing-comparison-copy">
          <p className="polynet-landing-kicker">Stack comparison</p>
          <h2 id="polynet-landing-stack">
            The Collective Intelligence Platform
          </h2>
          <p>
            Polynet compresses agents, community, resources, funnels, and paid
            access into one clean product.
          </p>
        </div>
        <div className="polynet-landing-comparison">
          <div className="polynet-landing-stack-list">
            <div className="polynet-landing-stack-header">
              <span>Example monthly stack</span>
              <strong>{stackTotal}/mo</strong>
            </div>
            {stackItems.map((item) => (
              <div key={`${item.category}-${item.vendor}`} className="polynet-landing-stack-row">
                <span className="polynet-landing-stack-vendor">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`}
                    alt=""
                  />
                  <span>
                    <strong>{item.vendor}</strong>
                    <em>{item.category}</em>
                  </span>
                </span>
                <strong>{item.cost}/mo</strong>
              </div>
            ))}
          </div>

          <button type="button" className="polynet-landing-polynet-plan" onClick={props.onTryFree}>
            <div>
              <img src="/favicon.svg" alt="" />
              <span>Polynet Builder</span>
            </div>
            <strong>$24/mo</strong>
            <p>Agents, communities, resources, funnels, paid access, and builder controls in one platform.</p>
          </button>
        </div>
      </section>

      <section className="polynet-landing-section compact" aria-labelledby="polynet-landing-flow">
        <div>
          <p className="polynet-landing-kicker">How it works</p>
          <h2 id="polynet-landing-flow">Turn expertise into a useful system.</h2>
        </div>
        <div className="polynet-landing-flow">
          <span>
            <LandingFlowVisual kind="agent" />
            <strong>Build the agent</strong>
          </span>
          <span>
            <LandingFlowVisual kind="community" />
            <strong>Wrap it in a community</strong>
          </span>
          <span>
            <LandingFlowVisual kind="gate" />
            <strong>Gate access</strong>
          </span>
          <span>
            <LandingFlowVisual kind="loop" />
            <strong>Improve with usage</strong>
          </span>
        </div>
      </section>
    </div>
  );
}
