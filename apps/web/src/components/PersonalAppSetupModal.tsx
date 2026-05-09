import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import {
  buildDiscoverAppPersonalConnectModalCopy,
  buildDiscoverAppPersonalConnectRequirements,
  type DiscoverAppCatalogEntry,
} from "../lib/discoverCatalog";

type PersonalAppSetupCatalogEntry = DiscoverAppCatalogEntry & {
  personalConnect: Extract<
    DiscoverAppCatalogEntry["personalConnect"],
    { availability: "ready" }
  >;
};

type PersonalAppSetupModalProps = {
  modalTitleId: string;
  catalogEntry: PersonalAppSetupCatalogEntry;
  endpoint: string;
  authType: DeveloperAppAuthType;
  secret: string;
  error: string | null;
  isSubmitting: boolean;
  isOauth: boolean;
  onEndpointChange: (value: string) => void;
  onAuthTypeChange: (value: DeveloperAppAuthType) => void;
  onSecretChange: (value: string) => void;
  onClearError: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PersonalAppSetupModal({
  modalTitleId,
  catalogEntry,
  endpoint,
  authType,
  secret,
  error,
  isSubmitting,
  isOauth,
  onEndpointChange,
  onAuthTypeChange,
  onSecretChange,
  onClearError,
  onCancel,
  onConfirm,
}: PersonalAppSetupModalProps) {
  const modalCopy = buildDiscoverAppPersonalConnectModalCopy(catalogEntry);
  const requirements = buildDiscoverAppPersonalConnectRequirements(catalogEntry, {
    endpointUrl: endpoint,
    authType,
  });

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => {
        if (isSubmitting) return;
        onCancel();
      }}
    >
      <div
        className="modal discover-connect-modal integration-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" id={modalTitleId}>
            Set up {catalogEntry.name}
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <div className="modal-body discover-connect-modal-body">
          {modalCopy ? (
            <div className="discover-connect-modal-copy">{modalCopy}</div>
          ) : null}
          <div className="agent-capability-field-grid discover-connect-grid">
            {requirements.map((requirement) =>
              requirement.kind === "readonly" ? (
                <label key={requirement.id} className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    {requirement.label}
                  </span>
                  <input
                    className="agent-editor-inline-label-input"
                    value={requirement.value}
                    readOnly
                  />
                </label>
              ) : requirement.kind === "text" ? (
                <label
                  key={requirement.id}
                  className="agent-capability-field discover-connect-secret-field"
                >
                  <span className="agent-capability-field-label">
                    {requirement.label}
                  </span>
                  <input
                    className="agent-editor-inline-label-input"
                    value={endpoint}
                    onChange={(event) => {
                      onEndpointChange(event.target.value);
                      onClearError();
                    }}
                    placeholder={requirement.placeholder}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
              ) : requirement.kind === "select" ? (
                <label key={requirement.id} className="agent-capability-field">
                  <span className="agent-capability-field-label">
                    {requirement.label}
                  </span>
                  <select
                    className="agent-capability-select"
                    value={authType}
                    onChange={(event) => {
                      onAuthTypeChange(event.target.value as DeveloperAppAuthType);
                      onClearError();
                    }}
                  >
                    {requirement.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label
                  key={requirement.id}
                  className="agent-capability-field discover-connect-secret-field"
                >
                  <span className="agent-capability-field-label">
                    {requirement.label}
                  </span>
                  <input
                    className="agent-editor-inline-label-input"
                    type="password"
                    value={secret}
                    onChange={(event) => {
                      onSecretChange(event.target.value);
                      onClearError();
                    }}
                    placeholder={requirement.placeholder}
                  />
                  {catalogEntry.personalConnect.connectionKind === "known" &&
                  catalogEntry.personalConnect.availability === "ready" &&
                  catalogEntry.personalConnect.authMethod === "token" ? (
                    <a
                      className="discover-connect-help-link"
                      href={catalogEntry.personalConnect.tokenHelpUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {catalogEntry.personalConnect.tokenHelpLabel}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </label>
              ),
            )}
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
        </div>
        <div className="modal-footer discover-connect-modal-footer">
          <button
            type="button"
            className="settings-cta"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="platform-save-button is-dirty"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isOauth
                ? "Starting…"
                : "Setting up…"
              : isOauth
                ? "Continue"
                : "Set up"}
          </button>
        </div>
      </div>
    </div>
  );
}
