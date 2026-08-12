import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import { WebAccountSetupForm } from "./WebAccountSetupForm";
import { WebBlockingSetupModal } from "./WebBlockingSetupModal";
import type {
  PlatformLegalAcceptanceDraft,
  WebAccountSetupSurfaceModel,
} from "./webAccountSetupSurfaceModel";

type WebOnboardingPageProps = {
  accountSetupStatus: AccountSetupStatus | null;
  setup: WebAccountSetupSurfaceModel;
  onCompleteAccountSetup: (
    legalAcceptance: PlatformLegalAcceptanceDraft | null,
  ) => Promise<boolean> | boolean;
};

export function WebOnboardingPage(props: WebOnboardingPageProps) {
  return (
    <WebBlockingSetupModal
      titleId="polynet-account-setup-title"
      descriptionId="polynet-account-setup-description"
      busy={props.setup.submission.isSaving}
      className="polynet-account-setup-modal"
    >
      <div className="account-setup-heading is-platform">
        <div className="account-setup-brand">
          <img src="/favicon.svg" alt="" />
          <span>Polynet</span>
        </div>
        <h1 id="polynet-account-setup-title">Finish your profile</h1>
        <p id="polynet-account-setup-description">
          Add the identity people will see across Polynet.
        </p>
      </div>
      <WebAccountSetupForm
        accountSetupStatus={props.accountSetupStatus}
        setup={props.setup}
        primaryLabel="Finish setup"
        savingLabel="Saving…"
        trustCopy="Communities see your profile — never your billing information."
        onSubmit={props.onCompleteAccountSetup}
      />
    </WebBlockingSetupModal>
  );
}
