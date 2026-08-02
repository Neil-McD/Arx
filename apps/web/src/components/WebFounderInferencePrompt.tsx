import type { CloudFounderInferenceStatus } from "../../../../shared/cloudFounderInferenceGateway";

type WebFounderInferencePromptProps = {
  isOpen: boolean;
  communities: CloudFounderInferenceStatus["communities"];
  keyConnected: boolean;
  onContinue: () => void;
  onClose: () => void;
};

export function WebFounderInferencePrompt(props: WebFounderInferencePromptProps) {
  if (!props.isOpen || props.communities.length === 0) return null;

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Connect your OpenAI API key</div>
            <div className="create-community-subtitle">
              Your key powers AI for your existing communities.
            </div>
          </div>
          <button className="modal-close" onClick={props.onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="model-list">
            {props.communities.map((community) => (
              <div className="account-row" key={community.id}>
                <div className="account-identity">
                  <span>{community.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <div className="auth-actions">
            <button className="secondary" type="button" onClick={props.onClose}>
              Not now
            </button>
            <button type="button" onClick={props.onContinue}>
              {props.keyConnected ? "Activate community AI" : "Connect API key"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
