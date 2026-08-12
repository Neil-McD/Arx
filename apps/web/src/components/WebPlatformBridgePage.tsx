import {
  WebCommunityBridgeCard,
  type WebCommunityBridgeCardProps,
} from "./WebCommunityBridgeCard";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";

export function WebPlatformBridgePage(props: {
  bridge: WebCommunityBridgeCardProps | null;
}) {
  return (
    <WebBlockingSetupModal
      titleId="polynet-platform-bridge-title"
      descriptionId="polynet-platform-bridge-description"
      busy={props.bridge?.setup.submission.isSaving}
      className="polynet-account-setup-modal"
    >
      <div className="account-setup-heading is-platform">
        <div className="account-setup-brand">
          <img src="/favicon.svg" alt="" />
          <span>Polynet</span>
        </div>
        <h1 id="polynet-platform-bridge-title">Finish your profile</h1>
        <p id="polynet-platform-bridge-description">
          Add the identity people will see across Polynet.
        </p>
      </div>
      {props.bridge ? (
        <WebCommunityBridgeCard {...props.bridge} />
      ) : (
        <div className="account-setup-loading" role="status">
          Loading account setup…
        </div>
      )}
    </WebBlockingSetupModal>
  );
}
