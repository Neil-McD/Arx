import { WebBuilderOfferSummary } from "./WebBuilderOfferSummary";

type WebCreateCommunityModalProps = {
  isOpen: boolean;
  hasSession: boolean;
  createCommunityName: string;
  createCommunitySlug: string;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  onClose: () => void;
  onPrimaryAction: () => Promise<void> | void;
  onChangeName: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
};

export function WebCreateCommunityModal(props: WebCreateCommunityModalProps) {
  if (!props.isOpen) return null;

  return (
    <div className="modal-overlay builder-offer-overlay" onClick={props.onClose}>
      <div
        className="modal create-community-modal builder-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close builder-offer-close" onClick={props.onClose} title="Close">
          ×
        </button>

        <div id="builder-create-title">
          <WebBuilderOfferSummary />
        </div>

        <div className="builder-create-fields">
          <label className="create-community-field">
            <span>Community name</span>
            <input
              autoFocus
              type="text"
              placeholder="Your community"
              value={props.createCommunityName}
              onChange={(event) => props.onChangeName(event.target.value)}
            />
          </label>
          <details className="builder-create-url">
            <summary>Customize community URL</summary>
            <label className="create-community-field">
              <span>polynet.ai/c/</span>
              <input
                type="text"
                placeholder="your-community"
                value={props.createCommunitySlug}
                onChange={(event) => {
                  props.onChangeSlug(event.target.value);
                  props.onChangeSlugEdited(true);
                }}
              />
            </label>
          </details>
        </div>

        {props.createCommunityError ? (
          <div className="auth-error builder-offer-error">{props.createCommunityError}</div>
        ) : null}

        <div className="builder-offer-actions">
          <button
            className="builder-offer-primary"
            type="button"
            onClick={() => void props.onPrimaryAction()}
            disabled={props.isCreatingCommunity || props.createCommunityName.trim().length === 0}
          >
            {props.isCreatingCommunity
              ? "Creating community…"
              : props.hasSession
                ? "Create community"
                : "Sign in to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
