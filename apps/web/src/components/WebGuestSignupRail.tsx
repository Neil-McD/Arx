type WebGuestSignupRailProps = {
  onSignIn: () => void;
};

export function WebGuestSignupRail(props: WebGuestSignupRailProps) {
  const { onSignIn } = props;

  return (
    <div className="guest-signup-rail workspace-rail-card" role="note" aria-label="Sign in benefits">
      <div className="guest-signup-rail-copy workspace-rail-card-copy">
        <div className="guest-signup-rail-title workspace-rail-card-title">
          Sign in to unlock more models and higher limits
        </div>
        <div className="guest-signup-rail-description workspace-rail-card-subtitle">
          Save chats and use your ChatGPT Plus / Pro limits or your own provider.
        </div>
      </div>
      <button
        type="button"
        className="guest-signup-rail-button workspace-rail-card-action platform-save-button platform-save-button--compact"
        onClick={onSignIn}
      >
        Sign in
      </button>
    </div>
  );
}
