import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { WebAccountSetupForm } from "./WebAccountSetupForm";
import type {
  PlatformLegalAcceptanceDraft,
  WebAccountSetupSurfaceModel,
} from "./webAccountSetupSurfaceModel";

export type WebCommunityBridgeCardProps = {
  variant?: "community" | "platform";
  communityName: string;
  communityAvatarUrl: string | null;
  communityAvatarFocusX: number | null;
  communityAvatarFocusY: number | null;
  communityAvatarZoom: number | null;
  paidReceiptLabel: string | null;
  enterLabel: string;
  accountSetupStatus: AccountSetupStatus | null;
  setup: WebAccountSetupSurfaceModel;
  onEnter: (
    legalAcceptance: PlatformLegalAcceptanceDraft | null,
  ) => Promise<boolean> | boolean;
};

export function WebCommunityBridgeCard(props: WebCommunityBridgeCardProps) {
  const isPlatform = props.variant === "platform";

  return (
    <div className="community-account-setup">
      {!isPlatform ? (
        <div className="account-setup-heading is-community">
          <CommunityAvatar
            className="account-setup-community-avatar"
            imageUrl={props.communityAvatarUrl}
            focusX={props.communityAvatarFocusX}
            focusY={props.communityAvatarFocusY}
            zoom={props.communityAvatarZoom}
            name={props.communityName}
            alt={`${props.communityName} avatar`}
          />
          <div>
            <p className="account-setup-kicker">Account setup</p>
            <h1 id="community-account-setup-title">Enter {props.communityName}</h1>
            <p id="community-account-setup-description">
              Finish your profile to join this community.
            </p>
          </div>
        </div>
      ) : null}
      {props.paidReceiptLabel ? (
        <p className="account-setup-receipt" role="status">
          <span aria-hidden="true" />
          {props.paidReceiptLabel}
        </p>
      ) : null}
      <WebAccountSetupForm
        accountSetupStatus={props.accountSetupStatus}
        setup={props.setup}
        primaryLabel={props.enterLabel}
        savingLabel="Saving…"
        trustCopy="Communities see your profile — never your billing information."
        onSubmit={props.onEnter}
      />
    </div>
  );
}
