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
import { useEffect, useState, type ReactNode } from "react";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  BUILDER_PARTNER_EARNING_WINDOW_MS,
} from "../../../../shared/builderPartnerProgram";
import type {
  BuilderPartnerProgramRequirement,
  BuilderPartnerProgramSnapshot,
} from "../../../../shared/builderPartnerProgramGateway";
import { BUILDER_PARTNER_TERMS_ENTRY } from "../docs/legalDocumentsContent";
import { StripeConnectCountrySelect } from "./StripeConnectCountrySelect";
import "./WebBuilderPartnerProgramPanel.css";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type WebBuilderPartnerProgramPanelProps = {
  showProgramOverview?: boolean;
  session: SessionLike;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  builderPartnerProgram: BuilderPartnerProgramSnapshot | null;
  isLoadingBuilderPartnerProgram: boolean;
  builderPartnerProgramError: string | null;
  isAcceptingBuilderPartnerTerms: boolean;
  renderMarkdown: (text: string) => ReactNode;
  loadBuilderPartnerProgram: (session: NonNullable<SessionLike>) => Promise<void> | void;
  acceptBuilderPartnerTerms: (termsVersion: string) => Promise<void> | void;
  openAccountSetup: () => void;
  openCreateCommunityModal: () => void;
  communities: Array<{ id: string; name: string }>;
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  startStripeConnectOnboarding: (opts?: {
    context?: "account" | "community";
    communitySlug?: string | null;
    country?: string | null;
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
  if (requirement.action === "accept_terms") return "Review terms";
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

export function WebBuilderPartnerProgramPanel(props: WebBuilderPartnerProgramPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [stripeConnectCountry, setStripeConnectCountry] = useState("");
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [hasConfirmedTermsAcceptance, setHasConfirmedTermsAcceptance] = useState(false);
  const activeTermsDocument = BUILDER_PARTNER_TERMS_ENTRY;
  const showProgramOverview = props.showProgramOverview ?? true;
  const attributionWindowDays = Math.round(BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS / (24 * 60 * 60 * 1000));
  const earningWindowMonths = Math.round(BUILDER_PARTNER_EARNING_WINDOW_MS / (365 * 24 * 60 * 60 * 1000) * 12);
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
  const storedStripeConnectCountry = props.accountCommerceStatus?.stripe_connect.country ?? null;
  useEffect(() => {
    if (storedStripeConnectCountry) {
      setStripeConnectCountry(storedStripeConnectCountry);
    }
  }, [storedStripeConnectCountry]);
  const selectedStripeConnectCountry = stripeConnectCountry || storedStripeConnectCountry || "";
  useEffect(() => {
    if (!isReadyToUnlock) {
      setIsTermsModalOpen(false);
      setHasConfirmedTermsAcceptance(false);
    }
  }, [isReadyToUnlock]);

  function openTermsModal(): void {
    setHasConfirmedTermsAcceptance(false);
    setIsTermsModalOpen(true);
  }

  function closeTermsModal(): void {
    if (props.isAcceptingBuilderPartnerTerms) return;
    setIsTermsModalOpen(false);
    setHasConfirmedTermsAcceptance(false);
  }

  async function handleAcceptTermsFromModal(): Promise<void> {
    if (!hasConfirmedTermsAcceptance || props.isAcceptingBuilderPartnerTerms) return;
    await props.acceptBuilderPartnerTerms(activeTermsDocument.version);
    setIsTermsModalOpen(false);
    setHasConfirmedTermsAcceptance(false);
  }

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
      openTermsModal();
    }
  }

  return (
    <>
      {showProgramOverview ? (
        <div className="settings-section">
          <div className="settings-section-title">
            <Handshake />
            Builder Partner Program
          </div>
          <div className="settings-section-desc">
            An optional partner program for builders who refer new community creators to Polynet.
          </div>

          <div className="builder-partner-hero">
            <div className="builder-partner-hero-copy">
              <span className="builder-partner-kicker">Platform partner program</span>
              <h2>{isActive ? "Your Builder Partner account is active." : "Bring builders to Polynet and share in the value they create."}</h2>
              <p>
                Builder Partners can earn up to {formatBps(BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS)}{" "}
                of eligible settled community revenue. Partner links are generated automatically when
                the requirements are met.
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
                Earn up to {formatBps(BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS)} of eligible revenue.
              </strong>
              <small>Paid from Polynet's platform fee, never from the community builder's payout.</small>
            </div>
            <div className="builder-partner-metric" role="listitem">
              <Clock3 />
              <span>Attribution</span>
              <strong>{attributionWindowDays}-day bind window, {earningWindowMonths}-month earning window</strong>
              <small>The earning window starts at the referral's first authenticated bind.</small>
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
      ) : null}

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
                  onClick={openTermsModal}
                  disabled={props.isAcceptingBuilderPartnerTerms}
                >
                  <CheckCircle2 />
                  {props.isAcceptingBuilderPartnerTerms ? "Unlocking..." : "Review and accept terms"}
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
                  <>
                    <StripeConnectCountrySelect
                      value={selectedStripeConnectCountry}
                      disabled={props.isStartingStripeConnectOnboarding}
                      onChange={setStripeConnectCountry}
                      style={{ margin: 0, maxWidth: 280 }}
                    />
                    <button
                      className="platform-save-button platform-save-button--compact"
                      type="button"
                      disabled={props.isStartingStripeConnectOnboarding || !selectedStripeConnectCountry}
                      onClick={() =>
                        void props.startStripeConnectOnboarding({
                          context: "account",
                          country: selectedStripeConnectCountry || null,
                        })
                      }
                    >
                      {props.isStartingStripeConnectOnboarding ? "Opening Stripe..." : "Set up Stripe payouts"}
                    </button>
                  </>
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

      {isTermsModalOpen ? (
        <div className="modal-overlay builder-partner-terms-overlay" onClick={closeTermsModal}>
          <div
            className="modal builder-partner-terms-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="builder-partner-terms-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-title" id="builder-partner-terms-modal-title">
                  {activeTermsDocument.title}
                </div>
                <div className="builder-partner-terms-modal-meta">
                  {activeTermsDocument.version} - Effective {activeTermsDocument.effectiveDate}
                </div>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={closeTermsModal}
                title="Close"
                disabled={props.isAcceptingBuilderPartnerTerms}
              >
                x
              </button>
            </div>
            <div className="modal-body builder-partner-terms-modal-body">
              <div className="builder-partner-terms-reader message-text">
                {props.renderMarkdown(activeTermsDocument.content)}
              </div>
            </div>
            <div className="modal-footer builder-partner-terms-footer">
              <label className="builder-partner-terms-confirmation">
                <input
                  type="checkbox"
                  checked={hasConfirmedTermsAcceptance}
                  onChange={(event) => setHasConfirmedTermsAcceptance(event.currentTarget.checked)}
                  disabled={props.isAcceptingBuilderPartnerTerms}
                />
                <span>I have read and agree to {activeTermsDocument.title}.</span>
              </label>
              <div className="builder-partner-terms-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeTermsModal}
                  disabled={props.isAcceptingBuilderPartnerTerms}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleAcceptTermsFromModal()}
                  disabled={props.isAcceptingBuilderPartnerTerms || !hasConfirmedTermsAcceptance}
                >
                  {props.isAcceptingBuilderPartnerTerms ? "Continuing..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
