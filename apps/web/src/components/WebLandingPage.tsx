type WebLandingPageProps = {
  onTryFree: () => void;
  onAskPolynet: () => void;
};

const stackItems = [
  { label: "AI workspace", cost: "$20+" },
  { label: "community platform", cost: "$99+" },
  { label: "automation tools", cost: "$30+" },
  { label: "docs and knowledge", cost: "$20+" },
  { label: "billing and access", cost: "$30+" },
];

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

          <div className="polynet-landing-product" aria-label="PolyNet workspace preview">
            <div className="polynet-landing-rail" aria-hidden="true">
              <div className="polynet-landing-rail-icon active">
                <img src="/favicon.svg" alt="" />
              </div>
              <div className="polynet-landing-rail-icon">D</div>
              <div className="polynet-landing-rail-add">+</div>
            </div>
            <div className="polynet-landing-workspace">
              <div className="polynet-landing-agent-card">
                <img src="/favicon.svg" alt="" />
                <h2>
                  Welcome to <span>PolyNet</span>
                </h2>
                <p>You are in the PolyNet workspace</p>
              </div>
              <div className="polynet-landing-composer">
                <span>Describe what you need help with...</span>
                <div>
                  <span>+</span>
                  <span>GPT 5.5</span>
                  <span className="polynet-landing-send">↑</span>
                </div>
              </div>
              <div className="polynet-landing-actions">
                <span>Help me build a business</span>
                <span>Tell me about the platform</span>
                <span>Help me with something specific</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="polynet-landing-section" aria-labelledby="polynet-landing-stack">
        <div>
          <p className="polynet-landing-kicker">One operating layer</p>
          <h2 id="polynet-landing-stack">
            One platform instead of a stitched-together stack.
          </h2>
          <p>
            A serious builder stack can turn into hundreds of dollars per month
            before the parts work together. PolyNet starts at $24/month for the
            core agent-community system.
          </p>
        </div>
        <div className="polynet-landing-stack-list">
          {stackItems.map((item) => (
            <div key={item.label} className="polynet-landing-stack-row">
              <span>{item.label}</span>
              <strong>{item.cost}</strong>
            </div>
          ))}
          <div className="polynet-landing-stack-total">
            <span>PolyNet builder plan</span>
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
