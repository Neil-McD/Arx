import { useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { AccountSetupMissing, AccountSetupStatus } from "../../../../shared/accountSetup";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

type WorkspaceUserPanelTab = "workspace" | "community";

export type WorkspaceUserPanelCommunity = {
  id: string;
  slug: string | null;
  name: string;
  oneLiner: string | null;
  visibility: string | null;
  memberCount: number | null;
  canManage: boolean;
};

export type WorkspaceUserDataPanelDataProps = {
  accountSetupStatus: AccountSetupStatus | null;
  isLoadingAccountSetupStatus: boolean;
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  workspaceCreditTopupError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  activeCommunity: WorkspaceUserPanelCommunity | null;
  canCreateCommunity: boolean;
  onOpenAccountSetup: () => void;
  onTopUpWorkspaceCredits: () => void;
  onOpenCreateCommunity: () => void;
  onOpenActiveCommunity: () => void;
  onOpenActiveCommunitySettings: () => void;
};

export type WorkspaceUserDataPanelProps = WorkspaceUserDataPanelDataProps & {
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const WORKSPACE_USER_PANEL_TABS: WorkspaceUserPanelTab[] = ["workspace", "community"];

const ACCOUNT_SETUP_MISSING_LABELS: Record<AccountSetupMissing, string> = {
  display_name: "Display name",
  handle: "Handle",
  avatar: "Avatar",
  inference_provider: "Inference provider",
  agent_name: "Agent name",
};

function formatCreditAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatCommunityVisibility(value: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "published") return "Published";
  if (normalized === "unlisted") return "Unlisted";
  return "Unlisted";
}

function buildMissingSetupLabel(status: AccountSetupStatus | null): string {
  if (!status) return "Setup status unavailable";
  if (status.completed) return "Account setup complete";
  const labels = status.missing
    .map((field) => ACCOUNT_SETUP_MISSING_LABELS[field])
    .filter(Boolean)
    .slice(0, 3);
  if (labels.length === 0) return "Finish account setup";
  return `Missing ${labels.join(", ")}`;
}

export function WebWorkspaceUserDataPanel(props: WorkspaceUserDataPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceUserPanelTab>("workspace");
  const tabItems = useMemo(
    () =>
      WORKSPACE_USER_PANEL_TABS.map((id) => ({
        id,
        label:
          id === "workspace"
            ? "Workspace"
            : props.activeCommunity?.name?.trim() || "Build community",
      })),
    [props.activeCommunity?.name],
  );
  const activeTabIndex = tabItems.findIndex((tab) => tab.id === activeTab);
  const tabSwitcherStyle = buildPlatformSwitcherStyle(tabItems.length, activeTabIndex);

  return (
    <>
      <div
        className="operator-data-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace panel"
        tabIndex={0}
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onDoubleClick={props.onResizeDoubleClick}
        onKeyDown={props.onResizeKeyDown}
      />
      <div
        className="platform-switcher platform-switcher-compact operator-data-panel__tabs workspace-user-data-panel__tabs"
        role="tablist"
        aria-label="Workspace panel tabs"
        style={tabSwitcherStyle as CSSProperties}
      >
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`platform-switcher-btn${activeTab === tab.id ? " is-active" : ""}`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="operator-data-panel__content workspace-user-data-panel__content">
        {activeTab === "workspace" ? (
          <WorkspacePanelContent {...props} />
        ) : (
          <CommunityPanelContent {...props} />
        )}
      </div>
    </>
  );
}

function WorkspacePanelContent(props: WorkspaceUserDataPanelDataProps) {
  const totalCredits =
    (props.workspaceCreditBalance?.includedCreditsBalance ?? 0) +
    (props.workspaceCreditBalance?.purchasedCreditsBalance ?? 0);

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Account setup</div>
        <div className="workspace-user-data-card__headline">
          {props.isLoadingAccountSetupStatus
            ? "Checking..."
            : props.accountSetupStatus?.completed
              ? "Complete"
              : `${props.accountSetupStatus?.percent ?? 0}% complete`}
        </div>
        <div className="workspace-user-data-meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, props.accountSetupStatus?.percent ?? 0))}%` }} />
        </div>
        <p>{buildMissingSetupLabel(props.accountSetupStatus)}</p>
        {!props.accountSetupStatus?.completed ? (
          <button type="button" className="workspace-user-data-action" onClick={props.onOpenAccountSetup}>
            Continue setup
          </button>
        ) : null}
      </section>

      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Tool credits</div>
        <div className="workspace-user-data-card__headline">
          {props.isLoadingWorkspaceCreditBalance ? "Checking..." : formatCreditAmount(totalCredits)}
        </div>
        <p>
          Included {formatCreditAmount(props.workspaceCreditBalance?.includedCreditsBalance ?? 0)} / Purchased{" "}
          {formatCreditAmount(props.workspaceCreditBalance?.purchasedCreditsBalance ?? 0)}
        </p>
        {props.workspaceCreditBalanceError ? <p>{props.workspaceCreditBalanceError}</p> : null}
        {props.workspaceCreditTopupError ? <p>{props.workspaceCreditTopupError}</p> : null}
        <button
          type="button"
          className="workspace-user-data-action"
          onClick={props.onTopUpWorkspaceCredits}
          disabled={props.isStartingWorkspaceCreditTopupCheckout}
        >
          {props.isStartingWorkspaceCreditTopupCheckout ? "Opening checkout..." : "Top up credits"}
        </button>
      </section>

      <section className="workspace-user-data-card">
        <div className="workspace-user-data-card__meta">Current workspace</div>
        <div className="workspace-user-data-card__headline">
          {props.activeProjectName?.trim() || "Personal workspace"}
        </div>
        <dl className="workspace-user-data-list">
          <div>
            <dt>Thread</dt>
            <dd>{props.activeThreadTitle?.trim() || "New thread"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{props.activeModelLabel?.trim() || "Default"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function CommunityPanelContent(props: WorkspaceUserDataPanelDataProps) {
  const community = props.activeCommunity;
  if (!community) {
    return (
      <div className="workspace-user-data-panel__grid">
        <section className="workspace-user-data-card">
          <div className="workspace-user-data-card__meta">Community</div>
          <div className="workspace-user-data-card__headline">No community selected</div>
          <p>Build a community when your account and workspace are ready.</p>
          <button
            type="button"
            className="workspace-user-data-action"
            onClick={props.onOpenCreateCommunity}
            disabled={!props.canCreateCommunity}
          >
            {props.canCreateCommunity ? "Build community" : "Community limit reached"}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-user-data-panel__grid">
      <section className="workspace-user-data-card workspace-user-data-card--community">
        <div className="workspace-user-data-card__meta">
          {community.canManage ? "Builder community" : "Member community"}
        </div>
        <div className="workspace-user-data-card__headline">{community.name}</div>
        <p>{community.oneLiner?.trim() || "Community workspace is ready."}</p>
        <dl className="workspace-user-data-list">
          <div>
            <dt>Visibility</dt>
            <dd>{formatCommunityVisibility(community.visibility)}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{community.memberCount === null ? "Unknown" : String(community.memberCount)}</dd>
          </div>
        </dl>
        <div className="workspace-user-data-actions">
          <button type="button" className="workspace-user-data-action" onClick={props.onOpenActiveCommunity}>
            Open community
          </button>
          {community.canManage ? (
            <button
              type="button"
              className="workspace-user-data-action workspace-user-data-action--secondary"
              onClick={props.onOpenActiveCommunitySettings}
            >
              Settings
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
