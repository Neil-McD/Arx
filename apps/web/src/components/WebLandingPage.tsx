import { Brain, DollarSign, RefreshCw, UserRound } from "lucide-react";

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

function CommunityFlowVisual() {
  return (
    <span className="polynet-landing-flow-visual community" aria-hidden="true">
      <UserRound className="polynet-community-person top" />
      <UserRound className="polynet-community-person left" />
      <UserRound className="polynet-community-person right" />
      <Brain className="polynet-community-brain" />
    </span>
  );
}

function LandingFlowVisual(props: { kind: "agent" | "community" | "gate" | "loop" }) {
  if (props.kind === "community") {
    return <CommunityFlowVisual />;
  }

  if (props.kind === "gate") {
    return (
      <span className="polynet-landing-flow-visual monetize" aria-hidden="true">
        <DollarSign />
      </span>
    );
  }

  if (props.kind === "loop") {
    return (
      <span className="polynet-landing-flow-visual loop" aria-hidden="true">
        <RefreshCw />
      </span>
    );
  }

  return (
    <span className="polynet-landing-flow-visual agent" aria-hidden="true">
      <Brain />
    </span>
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
            <strong>Monetize</strong>
          </span>
          <span>
            <LandingFlowVisual kind="loop" />
            <strong>Improve with usage</strong>
          </span>
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
    </div>
  );
}
