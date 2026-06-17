import type {
  WorkspaceCreditTopupSurface,
  WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";
import type {
  WorkspaceBillingOverview,
  WorkspaceCreditBalance,
} from "../../../../shared/workspaceCreditsGateway";
import type { CloudWorkspaceAutoRechargeSettings } from "../../../../shared/cloudAccountCommerceGateway";
import { WorkspacePayAsYouGoPanel } from "./WorkspacePayAsYouGoPanel";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WorkspaceCardOnFileStatus = {
  has_card_on_file?: unknown;
  payment_method_status?: unknown;
  card_brand?: unknown;
  card_last4?: unknown;
} | null;

type WebBillingSettingsSectionProps = {
  session: SessionLike;
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  workspaceBillingOverview: WorkspaceBillingOverview | null;
  isLoadingWorkspaceBillingOverview: boolean;
  workspaceBillingOverviewError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  workspaceCreditTopupError: string | null;
  workspaceCardOnFileStatus: WorkspaceCardOnFileStatus;
  workspaceCardOnFileError: string | null;
  isStartingWorkspaceCardSetupCheckout: boolean;
  workspaceCardSetupError: string | null;
  workspaceAutoRechargeSettings: CloudWorkspaceAutoRechargeSettings | null;
  isLoadingWorkspaceAutoRechargeSettings: boolean;
  workspaceAutoRechargeSettingsError: string | null;
  isSavingWorkspaceAutoRechargeSettings: boolean;
  startWorkspaceCreditTopupCheckout: (
    packId?: WorkspaceToolBalanceTopupPackId,
    surface?: WorkspaceCreditTopupSurface,
  ) => Promise<void> | void;
  startWorkspaceCardSetupCheckout: () => Promise<void> | void;
  saveWorkspaceAutoRechargeSettings: (next: {
    thresholdCredits: number;
    restoreToCredits: number;
    monthlyLimitCredits: number | null;
  }) => Promise<void> | void;
  disableWorkspaceAutoRechargeSettings: () => Promise<void> | void;
};

export function WebBillingSettingsSection(props: WebBillingSettingsSectionProps) {
  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <WorkspacePayAsYouGoPanel {...props} />
      </div>
    </>
  );
}
