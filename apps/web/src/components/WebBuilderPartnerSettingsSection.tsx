import {
  BadgeDollarSign,
  CheckCircle2,
  CircleDashed,
  Clipboard,
  Clock3,
  Handshake,
  Link,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import {
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
} from "../../../../shared/builderPartnerProgram";
import type {
  BuilderPartnerProgramRequirement,
  BuilderPartnerProgramSnapshot,
} from "../../../../shared/builderPartnerProgramGateway";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebBuilderPartnerSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  builderPartnerProgram: BuilderPartnerProgramSnapshot | null;
  isLoadingBuilderPartnerProgram: boolean;
  builderPartnerProgramError: string | null;
  isAcceptingBuilderPartnerTerms: boolean;
  loadBuilderPartnerProgram: (session: NonNullable<SessionLike>) => Promise<void> | void;
  acceptBuilderPartnerTerms: () => Promise<void> | void;
  openAccountSetup: () => void;
  openCreateCommunityModal: () => void;
  communities: Array<{ id: string; name: string }>;
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
  }) => Promise<void> | void;
  isStartingStripeConnectOnboarding: boolean;
};

function formatBps(bps: number): string {
  const percent = Math.max(0, Number(bps) || 0) / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function formatUsd(value: number): string {
  return `$${Math.max(0, Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: number | null): string {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRequirementDetail(requirement: BuilderPartnerProgramRequirement): string {
  if (requirement.key === "account_setup_complete") return "Finish profile, inference provider, and agent setup.";
  if (requirement.key === "own_community") return "Create or own at least one community.";
  if (requirement.key === "community_publish_ready") return "Add a community name, one-liner, avatar, and banner.";
  if (requirement.key === "accept_terms") return "Accept the Builder Partner terms.";
  if (requirement.key === "account_good_standing") return "No account restrictions are active.";
  return requirement.label;
}

function formatRequirementAction(requirement: BuilderPartnerProgramRequirement): string {
  if (requirement.action === "complete_account_setup") return "Finish setup";
  if (requirement.action === "create_community") return "Create community";
  if (requirement.action === "finish_community_setup") return "Open settings";
  if (requirement.action === "accept_terms") return "Accept terms";
  return requirement.label;
}

function formatPayoutStatus(value: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ready") return "Stripe ready";
  if (normalized === "restricted") return "Stripe restricted";
  if (normalized === "pending") return "Stripe pending";
  if (normalized === "not_connected") return "Stripe not connected";
  return value || "Not connected";
}

export function WebBuilderPartnerSettingsSection(props: WebBuilderPartnerSettingsSectionProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const partnerPlatformFeeShareBps = BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS;
  const communityCommission = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerPlatformFeeShareBps,
  });
  const effectiveCommunityRevenueShareBps = communityCommission.effectiveCommunityRevenueShareBps;
  const toolUsageShareBps = BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS;
  const isSignedIn = Boolean(props.session);
  const snapshot = props.builderPartnerProgram;
  const partner = snapshot?.partner ?? null;
  const isActive = snapshot?.state === "active" && Boolean(partner);
  const isReadyToUnlock = snapshot?.state === "ready_to_unlock";
  const isLocked = snapshot?.state === "locked" || snapshot?.state === "ready_to_unlock";
  const statusLabel = !isSignedIn
    ? "Sign in required"
    : props.isLoadingBuilderPartnerProgram && !snapshot
      ? "Loading"
      : isActive
        ? "Active"
        : isReadyToUnlock
          ? "Ready to unlock"
          : snapshot?.state === "disabled"
            ? "Disabled"
            : snapshot?.state === "paused"
              ? "Paused"
              : "Requirements pending";
  const payoutReady = Boolean(snapshot?.payout.ready);
  const payoutLabel = snapshot?.payout.label || formatPayoutStatus(snapshot?.payout.status ?? "");

  async function copyPartnerLink(): Promise<void> {
    const link = partner?.partnerLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  function handleRequirementAction(requirement: BuilderPartnerProgramRequirement): void {
    if (requirement.met) return;
    if (requirement.action === "complete_account_setup") {
      props.openAccountSetup();
      return;
    }
    if (requirement.action === "create_community") {
      props.openCreateCommunityModal();
      return;
    }
    if (requirement.action === "finish_community_setup") {
      const ownedCommunity = props.communities.find((community) => (
        props.communityRoleById[community.id] === "owner"
      ));
      if (ownedCommunity) {
        props.openOwnedCommunitySettings(ownedCommunity.id);
      }
      return;
    }
    if (requirement.action === "accept_terms") {
      void props.acceptBuilderPartnerTerms();
    }
  }

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">
          <Handshake />
          Builder Partner Program
        </div>
        <div className="settings-section-desc">
          Platform-level partner program for builders bringing new communities to PolyNet.
        </div>

        <div className="builder-partner-hero">
          <div className="builder-partner-hero-copy">
            <span className="builder-partner-kicker">Platform partner program</span>
            <h2>{isActive ? "Your Builder Partner account is active." : "Bring builders to PolyNet and share in the value they create."}</h2>
            <p>
              Builder Partners earn from referred creators' community revenue and settled paid
              tool usage. Partner links are generated automatically when the requirements are met.
            </p>
          </div>
          <div className="builder-partner-status-stack" aria-label="Builder Partner status">
            <div className="builder-partner-status">
              <span>Status</span>
              <strong className={isActive ? "is-ready" : "is-not-ready"}>
                {isActive ? <CheckCircle2 /> : <Clock3 />}
                {statusLabel}
              </strong>
            </div>
            <div className="builder-partner-status">
              <span>Payouts</span>
              <strong className={payoutReady ? "is-ready" : "is-not-ready"}>
                {payoutReady ? <CheckCircle2 /> : <XCircle />}
                {payoutLabel}
              </strong>
            </div>
          </div>
        </div>

        <div className="builder-partner-metrics" role="list" aria-label="Builder Partner economics">
          <div className="builder-partner-metric" role="listitem">
            <BadgeDollarSign />
            <span>Community revenue</span>
            <strong>
              Earn {formatBps(effectiveCommunityRevenueShareBps)} of referred creators'
              community revenue.
            </strong>
            <small>Calculated from PolyNet's platform fee on eligible referred creators.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <CircleDashed />
            <span>Tool usage</span>
            <strong>
              Earn {formatBps(toolUsageShareBps)} of referred creators' tool usage.
            </strong>
            <small>Calculated on settled paid tool usage after vendor cost.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <ShieldCheck />
            <span>Settlement</span>
            <strong>Risk hold, then payout buffer</strong>
            <small>Commissions clear a 30-day hold and 14-day payout review buffer.</small>
          </div>
        </div>

        {!isSignedIn ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Partner account</span>
              <strong>Sign in to check requirements</strong>
            </div>
            <div className="auth-actions">
              <button type="button" onClick={props.requireSignIn}>
                Continue to sign in
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isSignedIn ? (
        <div className="settings-section">
          <div className="settings-section-title">
            <Link />
            Partner account
          </div>
          <div className="settings-section-desc">
            Complete the requirements to unlock your partner link and dashboard.
          </div>

          {props.builderPartnerProgramError ? (
            <div className="auth-error">{props.builderPartnerProgramError}</div>
          ) : null}
          {props.accountCommerceError ? <div className="auth-error">{props.accountCommerceError}</div> : null}

          {props.isLoadingBuilderPartnerProgram && !snapshot ? (
            <div className="auth-status">Loading Builder Partner status...</div>
          ) : null}

          {snapshot && isLocked ? (
            <div className="builder-partner-requirements">
              {snapshot.requirements.map((requirement) => (
                <div className="builder-partner-requirement" key={requirement.key}>
                  <span className={`builder-partner-requirement-icon${requirement.met ? " is-ready" : ""}`}>
                    {requirement.met ? <CheckCircle2 /> : <CircleDashed />}
                  </span>
                  <span className="builder-partner-requirement-copy">
                    <strong>{requirement.label}</strong>
                    <span>{formatRequirementDetail(requirement)}</span>
                  </span>
                  <span className="builder-partner-requirement-action">
                    {requirement.met || !requirement.action ? null : (
                      <button
                        type="button"
                        onClick={() => handleRequirementAction(requirement)}
                        disabled={props.isAcceptingBuilderPartnerTerms}
                      >
                        {formatRequirementAction(requirement)}
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {isReadyToUnlock ? (
                <button
                  type="button"
                  onClick={() => void props.acceptBuilderPartnerTerms()}
                  disabled={props.isAcceptingBuilderPartnerTerms}
                >
                  <CheckCircle2 />
                  {props.isAcceptingBuilderPartnerTerms ? "Unlocking..." : "Accept and unlock"}
                </button>
              ) : null}
            </div>
          ) : null}

          {isActive && partner && snapshot ? (
            <div className="builder-partner-dashboard">
              <div className="builder-partner-link-card">
                <div className="builder-partner-link-copy">
                  <span>Partner link</span>
                  <strong>{partner.partnerLink}</strong>
                </div>
                <button type="button" onClick={() => void copyPartnerLink()}>
                  <Clipboard />
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}
                </button>
              </div>

              <div className="builder-partner-dashboard-grid" role="list" aria-label="Builder Partner dashboard">
                <div className="builder-partner-dashboard-card" role="listitem">
                  <Handshake />
                  <span>Referred builders</span>
                  <strong>{snapshot.attributionSummary.boundCount}</strong>
                  <small>{snapshot.attributionSummary.activeCount} active visitor referral(s).</small>
                </div>
                <div className="builder-partner-dashboard-card" role="listitem">
                  <Clock3 />
                  <span>Pending hold</span>
                  <strong>{formatUsd(snapshot.commissionSummary.pendingUsd)}</strong>
                  <small>{snapshot.commissionSummary.pendingCount} commission(s) in risk hold.</small>
                </div>
                <div className="builder-partner-dashboard-card" role="listitem">
                  <CircleDashed />
                  <span>Payable soon</span>
                  <strong>{formatUsd(snapshot.commissionSummary.bufferedUsd)}</strong>
                  <small>{snapshot.commissionSummary.bufferedCount} commission(s) inside payout buffer.</small>
                </div>
                <div className="builder-partner-dashboard-card" role="listitem">
                  <BadgeDollarSign />
                  <span>Ready for next payout</span>
                  <strong>{formatUsd(snapshot.commissionSummary.readyUsd)}</strong>
                  <small>{snapshot.commissionSummary.readyCount} commission(s) ready for the next payout cycle.</small>
                </div>
              </div>

              <div className="builder-partner-payouts">
                <div className="builder-partner-payouts-header">
                  <div>
                    <span>Partner payouts</span>
                    <strong>{payoutLabel}</strong>
                  </div>
                  <div className="builder-partner-payouts-ready">
                    <span>Ready</span>
                    <strong>{formatUsd(snapshot.commissionSummary.readyUsd)}</strong>
                  </div>
                </div>
                {!payoutReady ? (
                  <button
                    className="platform-save-button platform-save-button--compact"
                    type="button"
                    disabled={props.isStartingStripeConnectOnboarding}
                    onClick={() => void props.startStripeConnectOnboarding({ context: "account" })}
                  >
                    {props.isStartingStripeConnectOnboarding ? "Opening Stripe..." : "Set up Stripe payouts"}
                  </button>
                ) : null}
                <div className="builder-partner-payout-grid" role="list" aria-label="Partner payout balances">
                  <div className="builder-partner-payout-card" role="listitem">
                    <span>Total earned</span>
                    <strong>{formatUsd(snapshot.commissionSummary.totalUsd)}</strong>
                    <small>All active, payable, and paid partner commissions.</small>
                  </div>
                  <div className="builder-partner-payout-card" role="listitem">
                    <span>Paid</span>
                    <strong>{formatUsd(snapshot.commissionSummary.paidUsd)}</strong>
                    <small>{snapshot.commissionSummary.paidCount} settled commission(s).</small>
                  </div>
                  <div className="builder-partner-payout-card" role="listitem">
                    <span>Buffer</span>
                    <strong>{formatUsd(snapshot.commissionSummary.bufferedUsd)}</strong>
                    <small>Payable but still inside review buffer.</small>
                  </div>
                  <div className="builder-partner-payout-card" role="listitem">
                    <span>Hold</span>
                    <strong>{formatUsd(snapshot.commissionSummary.pendingUsd)}</strong>
                    <small>Waiting for refund and dispute risk to clear.</small>
                  </div>
                  {snapshot.commissionSummary.clawbackDebtUsd > 0 ? (
                    <div className="builder-partner-payout-card" role="listitem">
                      <span>Carryforward adjustment</span>
                      <strong>{formatUsd(snapshot.commissionSummary.clawbackDebtUsd)}</strong>
                      <small>
                        Future payouts are reduced until prior refunds or disputes are cleared.
                      </small>
                    </div>
                  ) : null}
                </div>
                <div className="builder-partner-payout-history">
                  <div className="builder-partner-payout-history-title">
                    <span>Payout history</span>
                    <small>Completed Stripe transfers.</small>
                  </div>
                  {snapshot.payoutHistory.transfers.length > 0 ? (
                    <div className="builder-partner-payout-history-list">
                      {snapshot.payoutHistory.transfers.map((transfer) => (
                        <div className="builder-partner-payout-history-row" key={transfer.id}>
                          <div>
                            <strong>{formatUsd(transfer.amountUsd)}</strong>
                            <span>{formatDateTime(transfer.processedAt ?? transfer.createdAt)}</span>
                          </div>
                          <small>{transfer.status}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="builder-partner-payout-history-empty">
                      Payouts appear here after transfer.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {snapshot?.state === "disabled" ? (
            <div className="account-row">
              <div className="account-identity">
                <span>Partner account</span>
                <strong>Disabled</strong>
              </div>
              <div className="auth-actions">
                <span className="auth-status">{partner?.disabledReason || "Contact support."}</span>
              </div>
            </div>
          ) : null}

          {snapshot?.state === "paused" ? (
            <div className="account-row">
              <div className="account-identity">
                <span>Partner account</span>
                <strong>Paused</strong>
              </div>
              <div className="auth-actions">
                <span className="auth-status">Partner links and new commissions are paused. Contact support.</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
