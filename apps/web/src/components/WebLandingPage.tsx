type WebLandingPageProps = {
  onTryFree: () => void;
  onAskPolynet: () => void;
};

const stackItems = [
  {
    category: "AI assistance",
    vendor: "Perplexity Pro",
    domain: "perplexity.ai",
    cost: "$20",
  },
  {
    category: "Community",
    vendor: "Circle Professional",
    domain: "circle.so",
    cost: "$89",
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

const stackTotal = "$425+";

export function WebLandingPage(props: WebLandingPageProps) {
  return (
    <div className="polynet-landing-page">
      <section className="polynet-landing-hero" aria-labelledby="polynet-landing-title">
        <nav className="polynet-landing-nav" aria-label="PolyNet">
          <a className="polynet-landing-brand" href="/">
            <img src="/favicon.svg" alt="" />
            <span>PolyNet</span>
          </a>
          <div className="polynet-landing-nav-actions">
            <button type="button" onClick={props.onAskPolynet}>
              Ask PolyNet
            </button>
            <button type="button" className="primary" onClick={props.onTryFree}>
              Try PolyNet free
            </button>
          </div>
        </nav>

        <div className="polynet-landing-hero-grid">
          <div className="polynet-landing-copy">
            <p className="polynet-landing-kicker">Services as software</p>
            <h1 id="polynet-landing-title">
              Build an AI community that can think, remember, and act.
            </h1>
            <p className="polynet-landing-subcopy">
              PolyNet lets you build, distribute, and monetize agent-powered
              communities.
            </p>
            <div className="polynet-landing-cta-row">
              <button type="button" className="primary" onClick={props.onTryFree}>
                Try PolyNet free
              </button>
              <button type="button" onClick={props.onAskPolynet}>
                Ask PolyNet
              </button>
            </div>
          </div>

          <button
            type="button"
            className="polynet-landing-video"
            onClick={props.onAskPolynet}
            aria-label="Ask PolyNet to explain the platform"
          >
            <span className="polynet-landing-video-topline">PolyNet overview</span>
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
                      Welcome to <span>PolyNet</span>
                    </strong>
                    <em>You are in the PolyNet workspace</em>
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

      <section className="polynet-landing-section" aria-labelledby="polynet-landing-stack">
        <div>
          <p className="polynet-landing-kicker">Stack comparison</p>
          <h2 id="polynet-landing-stack">
            A creator stack gets expensive before it gets coherent.
          </h2>
          <p>
            Builders usually stitch together AI assistance, community software,
            resource docs, funnels, checkout, and paid access. PolyNet puts the
            core agent-community system in one platform.
          </p>
        </div>
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
          <div className="polynet-landing-stack-total">
            <span>
              <img src="/favicon.svg" alt="" />
              <span>
                <strong>PolyNet Builder</strong>
                <em>Agents, communities, resources, funnels, and access</em>
              </span>
            </span>
            <strong>$24/mo</strong>
          </div>
        </div>
      </section>

      <section className="polynet-landing-section compact" aria-labelledby="polynet-landing-flow">
        <div>
          <p className="polynet-landing-kicker">How it works</p>
          <h2 id="polynet-landing-flow">Turn expertise into a useful system.</h2>
        </div>
        <div className="polynet-landing-flow">
          <span>Build the agent</span>
          <span>Wrap it in a community</span>
          <span>Gate access</span>
          <span>Improve with usage</span>
        </div>
      </section>
    </div>
  );
}
