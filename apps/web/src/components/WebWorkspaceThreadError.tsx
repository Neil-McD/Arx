import type { WorkspaceThreadErrorView } from "./webWorkspaceThreadViews";

type WebWorkspaceThreadErrorProps = {
  view: WorkspaceThreadErrorView | null;
  onOpenAuthGate: () => void;
  onRetryLastTurn: () => Promise<void> | void;
};

export function WebWorkspaceThreadError(props: WebWorkspaceThreadErrorProps) {
  const { view } = props;
  if (!view) return null;

  return (
    <div className="auth-error">
      {view.displayedError}
      {view.showSignInAction ? (
        <button type="button" className="auth-error-link" onClick={props.onOpenAuthGate}>
          Sign in
        </button>
      ) : null}
      {view.showRetryAction ? (
        <button
          className="auth-error-action"
          type="button"
          onClick={() => void props.onRetryLastTurn()}
          title="Retry"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
