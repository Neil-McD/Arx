import { useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  CircleDashed,
  Copy,
  Handshake,
  Link,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import type {
  BuilderPartnerProgramRequirement,
  BuilderPartnerProgramSnapshot,
} from "../../../../shared/builderPartnerProgramGateway";
import {
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
} from "../../../../shared/builderPartnerProgram";
import { StripeSetupButton } from "./StripeSetupButton";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebBuilderPartnerSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  builderPartnerProgram: BuilderPartnerProgramSnapshot | null;
  isLoadingBuilderPartnerProgram: boolean;
  builderPartnerProgramError: string | null;
  isAcceptingBuilderPartnerTerms: boolean;
  loadBuilderPartnerProgram: (session: NonNullable<SessionLike>) => Promise<void> | void;
  acceptBuilderPartnerTerms: () => Promise<void> | void;
  openCreateCommunityModal: () => void;
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number(value) || 0));
}

function requirementLabel(requirement: BuilderPartnerProgramRequirement): string {
  if (requirement.key === "own_community") return "Build a community on PolyNet";
  if (requirement.key === "accept_terms") return "Accept Builder Partner terms";
  return requirement.label;
}

function BuilderPartnerStatusValue(props: { ready: boolean; children: string }) {
  const Icon = props.ready ? CheckCircle2 : XCircle;
  return (
    <strong className={props.ready ? "is-ready" : "is-not-ready"}>
      <Icon aria-hidden />
      {props.children}
    </strong>
  );
}

function BuilderPartnerRequirementRow(props: {
  requirement: BuilderPartnerProgramRequirement;
  disabled?: boolean;
  isAcceptingBuilderPartnerTerms: boolean;
  onSignIn: () => void;
  onCreateCommunity: () => void;
  onAcceptTerms: () => void;
}) {
  const requirement = props.requirement;
  const Icon = requirement.met ? CheckCircle2 : XCircle;
  let action: JSX.Element | null = null;
  if (!requirement.met && requirement.action === "sign_in") {
    action = (
      <button type="button" onClick={props.onSignIn}>
        Sign in
      </button>
    );
  } else if (!requirement.met && requirement.action === "create_community") {
    action = (
      <button type="button" onClick={props.onCreateCommunity}>
        Create community
      </button>
    );
  } else if (!requirement.met && requirement.action === "accept_terms") {
    action = (
      <button
        type="button"
        onClick={props.onAcceptTerms}
        disabled={props.disabled || props.isAcceptingBuilderPartnerTerms}
      >
        {props.isAcceptingBuilderPartnerTerms ? "Unlocking..." : "Accept and unlock"}
      </button>
    );
  }

  return (
    <div className="builder-partner-requirement">
      <div className={requirement.met ? "builder-partner-requirement-icon is-ready" : "builder-partner-requirement-icon"}>
        <Icon aria-hidden />
      </div>
      <div className="builder-partner-requirement-copy">
        <strong>{requirementLabel(requirement)}</strong>
        <span>{requirement.met ? "Complete" : "Required"}</span>
      </div>
      {action ? <div className="builder-partner-requirement-action">{action}</div> : null}
    </div>
  );
}

export function WebBuilderPartnerSettingsSection(props: WebBuilderPartnerSettingsSectionProps) {
  const [copiedPartnerLink, setCopiedPartnerLink] = useState(false);
  const partnerPlatformFeeShareBps = BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS;
  const communityCommission = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerPlatformFeeShareBps,
  });
  const effectiveCommunityRevenueShareBps = communityCommission.effectiveCommunityRevenueShareBps;
  const toolUsageShareBps = BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS;
  const program = props.builderPartnerProgram;
  const isUnlocked = program?.state === "active";
  const ownCommunityRequirement = program?.requirements.find((item) => item.key === "own_community");
  const canAcceptTerms = ownCommunityRequirement?.met === true;
  const payoutReady = program?.payout.ready === true;
  const eligibilityLabel =
    !props.session
      ? "Sign in required"
      : isUnlocked
        ? "Active"
        : program?.state === "ready_to_unlock"
          ? "Ready to unlock"
          : program?.state === "paused"
            ? "Paused"
            : program?.state === "disabled"
              ? "Disabled"
              : "Requirements open";
  const payoutLabel = program?.payout.label ?? "Stripe required before payouts";
  const partnerLink = program?.partner?.partnerLink ?? "";

  async function copyPartnerLink(): Promise<void> {
    if (!partnerLink) return;
    try {
      await navigator.clipboard.writeText(partnerLink);
      setCopiedPartnerLink(true);
      window.setTimeout(() => setCopiedPartnerLink(false), 1800);
    } catch {
      setCopiedPartnerLink(false);
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
            <h2>Bring builders to PolyNet and share in the value they create.</h2>
            <p>
              Unlock automatically after you are signed in, actively building a community, and
              have accepted the Builder Partner terms.
            </p>
          </div>
          <div className="builder-partner-status-stack" aria-label="Builder Partner status">
            <div className="builder-partner-status">
              <span>Program</span>
              <BuilderPartnerStatusValue ready={Boolean(isUnlocked)}>{eligibilityLabel}</BuilderPartnerStatusValue>
            </div>
            <div className="builder-partner-status">
              <span>Payouts</span>
              <BuilderPartnerStatusValue ready={payoutReady}>{payoutLabel}</BuilderPartnerStatusValue>
            </div>
          </div>
        </div>

        <div className="builder-partner-metrics" role="list" aria-label="Builder Partner economics">
          <div className="builder-partner-metric" role="listitem">
            <BadgeDollarSign />
            <span>Community revenue</span>
            <strong>
              Earn {formatBps(effectiveCommunityRevenueShareBps)} of referred creators'
              community revenue
            </strong>
            <small>Outcome-based partner commission on referred communities.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <CircleDashed />
            <span>Tool usage</span>
            <strong>
              Earn {formatBps(toolUsageShareBps)} of referred creators' tool usage
            </strong>
            <small>Tracked from settled paid usage after attribution is active.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <ShieldCheck />
            <span>Settlement</span>
            <strong>Tracked explicitly</strong>
            <small>Commission balances appear after referred revenue is processed.</small>
          </div>
        </div>

        {!props.session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Partner account</span>
              <strong>Sign in to view partner status</strong>
            </div>
            <div className="auth-actions">
              <button type="button" onClick={props.requireSignIn}>
                Continue to sign in
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {props.session ? (
        <div className="settings-section">
          <div className="settings-section-title">
            <Link />
            Partner account
          </div>
          <div className="settings-section-desc">
            {isUnlocked
              ? "Your Builder Partner account is active."
              : "Complete the requirements to unlock your partner link and dashboard."}
          </div>

          {props.isLoadingBuilderPartnerProgram ? (
            <div className="auth-status">Loading Builder Partner status...</div>
          ) : null}

          {!isUnlocked ? (
            <div className="builder-partner-requirements">
              {(program?.requirements ?? []).map((requirement) => (
                <BuilderPartnerRequirementRow
                  key={requirement.key}
                  requirement={requirement}
                  disabled={requirement.action === "accept_terms" && !canAcceptTerms}
                  isAcceptingBuilderPartnerTerms={props.isAcceptingBuilderPartnerTerms}
                  onSignIn={props.requireSignIn}
                  onCreateCommunity={props.openCreateCommunityModal}
                  onAcceptTerms={() => void props.acceptBuilderPartnerTerms()}
                />
              ))}
              {!program && !props.isLoadingBuilderPartnerProgram ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void props.loadBuilderPartnerProgram(props.session!)}
                >
                  <RefreshCw aria-hidden />
                  Refresh status
                </button>
              ) : null}
            </div>
          ) : (
            <div className="builder-partner-dashboard">
              <div className="builder-partner-link-card">
                <div className="builder-partner-link-copy">
                  <span>Partner link</span>
                  <strong>{partnerLink}</strong>
                </div>
                <button type="button" onClick={() => void copyPartnerLink()} disabled={!partnerLink}>
                  <Copy aria-hidden />
                  {copiedPartnerLink ? "Copied" : "Copy link"}
                </button>
              </div>

              <div className="builder-partner-dashboard-grid" aria-label="Builder Partner dashboard">
                <div className="builder-partner-dashboard-card">
                  <Users />
                  <span>Referred visitors</span>
                  <strong>{program.attributionSummary.activeCount + program.attributionSummary.boundCount}</strong>
                  <small>Tracked from partner-link visits.</small>
                </div>
                <div className="builder-partner-dashboard-card">
                  <Users />
                  <span>Referred builders</span>
                  <strong>{program.attributionSummary.boundCount}</strong>
                  <small>Signed-in builders with active attribution.</small>
                </div>
                <div className="builder-partner-dashboard-card">
                  <Wallet />
                  <span>Commissions</span>
                  <strong>{formatUsd(program.commissionSummary.totalUsd)}</strong>
                  <small>Appears after referred revenue is processed.</small>
                </div>
              </div>
            </div>
          )}

          <div className="account-row">
            <div className="account-identity">
              <span>Stripe payout readiness</span>
              <strong>{payoutLabel}</strong>
            </div>
            <div className="auth-actions">
              <span className="auth-status">
                Builder Partner payouts reuse the same Stripe Connect Express account as paid communities.
              </span>
              {!payoutReady ? (
                <StripeSetupButton
                  label={props.isStartingStripeConnectOnboarding ? "Opening..." : "Connect Stripe"}
                  onClick={() => void props.startStripeConnectOnboarding({ context: "account" })}
                  disabled={props.isStartingStripeConnectOnboarding}
                />
              ) : null}
            </div>
          </div>
          {props.builderPartnerProgramError ? (
            <div className="auth-error">{props.builderPartnerProgramError}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
