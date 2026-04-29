type WebOnboardingPageProps = {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  isSaving: boolean;
  error: string | null;
  onDisplayNameChange: (value: string) => void;
  onAvatarUrlChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onBuildCommunity: () => void;
  onDiscoverCommunity: () => void;
  onLearnAboutPolynet: () => void;
};

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  return (
    <main className="polynet-onboarding-page" aria-labelledby="polynet-onboarding-title">
      <section className="polynet-onboarding-panel">
        <div className="polynet-onboarding-brand">
          <img src="/favicon.svg" alt="" />
          <span>Polynet</span>
        </div>

        <div className="polynet-onboarding-header">
          <p className="polynet-landing-kicker">Set up your account</p>
          <h1 id="polynet-onboarding-title">Welcome to Polynet.</h1>
          <p>
            Confirm your profile, then choose whether you want to build a
            community or discover one first.
          </p>
        </div>

        <div className="polynet-onboarding-profile">
          <div className="polynet-onboarding-avatar">
            {props.avatarUrl ? <img src={props.avatarUrl} alt="" /> : <span>P</span>}
          </div>
          <label>
            Display name
            <input
              value={props.displayName}
              onChange={(event) => props.onDisplayNameChange(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <label>
            Avatar URL
            <input
              value={props.avatarUrl ?? ""}
              onChange={(event) => props.onAvatarUrlChange(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Bio
            <textarea
              value={props.bio}
              onChange={(event) => props.onBioChange(event.target.value)}
              placeholder="What are you building, learning, or exploring?"
              rows={4}
            />
          </label>
          {props.email ? <p className="polynet-onboarding-email">{props.email}</p> : null}
          {props.error ? <p className="polynet-onboarding-error">{props.error}</p> : null}
        </div>

        <div className="polynet-onboarding-actions">
          <button type="button" className="primary" disabled={props.isSaving} onClick={props.onBuildCommunity}>
            Build a community
          </button>
          <button type="button" disabled={props.isSaving} onClick={props.onDiscoverCommunity}>
            Discover a community
          </button>
        </div>

        <button
          type="button"
          className="polynet-onboarding-learn"
          disabled={props.isSaving}
          onClick={props.onLearnAboutPolynet}
        >
          Learn about Polynet
        </button>
      </section>
    </main>
  );
}
