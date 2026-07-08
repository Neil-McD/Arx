/* The standalone platform bridge: generic joiners (no community context) meet
   the same bridge card in its platform presentation on a clean page — no
   community pitch, no community backdrop — and exit to the workspace, where
   the guide greets them. Community joiners never see this page. */
import { WebCommunityBridgeCard, type WebCommunityBridgeCardProps } from "./WebCommunityBridgeCard";

export function WebPlatformBridgePage(props: {
  /** null = hold: setup status still loading, or a completed account is about
      to be redirected to the workspace by the route effect. */
  bridge: WebCommunityBridgeCardProps | null;
}) {
  return (
    <div className="polynet-platform-bridge-page">
      <div className="polynet-platform-bridge-mark">
        <img src="/favicon.svg" alt="" />
        <span>Polynet</span>
      </div>
      <p className="polynet-platform-bridge-tagline">Communities with a brain.</p>
      {props.bridge ? (
        <WebCommunityBridgeCard {...props.bridge} />
      ) : (
        <div className="landing-auth-hold" aria-hidden="true" />
      )}
    </div>
  );
}
