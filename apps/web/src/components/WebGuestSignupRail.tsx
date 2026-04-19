type WebGuestSignupRailProps = {
  onSignIn: () => void;
};

export function WebGuestSignupRail(props: WebGuestSignupRailProps) {
  const { onSignIn } = props;

  return (
    <div className="guest-signup-rail workspace-rail-card" role="note" aria-label="Sign in benefits">
      <div className="guest-signup-rail-copy workspace-rail-card-copy">
        <div className="guest-signup-rail-title workspace-rail-card-title">
          Create a free account to keep going
        </div>
        <div className="guest-signup-rail-description workspace-rail-card-subtitle">
          Unlock more models, use your ChatGPT Plus / Pro access on Polynet, and discover communities, agents, and apps across the network.
        </div>
      </div>
      <button
        type="button"
        className="guest-signup-rail-button workspace-rail-card-action platform-save-button platform-save-button--compact"
        onClick={onSignIn}
      >
        Continue with Google
      </button>
    </div>
  );
}
