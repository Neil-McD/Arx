import { WebCommunityBridgeCard, type WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";

export function WebPlatformBridgePage(props: {
  /** null = hold: setup status is loading, or a completed account is about to
      be redirected to its community destination by the route effect. */
  bridge: WebCommunityBridgeCardProps | null;
}) {
  return (
    <WebBlockingSetupModal
      titleId="polynet-platform-bridge-title"
      descriptionId="polynet-platform-bridge-description"
      className="polynet-platform-bridge-modal"
    >
      <div className="polynet-platform-bridge-mark">
        <img src="/favicon.svg" alt="" />
        <span id="polynet-platform-bridge-title">Polynet</span>
      </div>
      <p id="polynet-platform-bridge-description" className="polynet-platform-bridge-tagline">
        Finish your profile to enter Polynet.
      </p>
      {props.bridge ? (
        <WebCommunityBridgeCard {...props.bridge} />
      ) : (
        <div className="blocking-setup-hold" role="status" aria-label="Loading account setup" />
      )}
    </WebBlockingSetupModal>
  );
}
