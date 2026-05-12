import {
  BadgeDollarSign,
  CheckCircle2,
  CircleDashed,
  Handshake,
  Link,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
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

type OwnedCommunity = {
  id: string;
};

type WebBuilderPartnerSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  communities: OwnedCommunity[];
  communityRoleById: Record<string, string>;
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

function BuilderPartnerStatusValue(props: { ready: boolean; children: string }) {
  const Icon = props.ready ? CheckCircle2 : XCircle;
  return (
    <strong className={props.ready ? "is-ready" : "is-not-ready"}>
      <Icon aria-hidden />
      {props.children}
    </strong>
  );
}

export function WebBuilderPartnerSettingsSection(props: WebBuilderPartnerSettingsSectionProps) {
  const hasOwnedCommunity = props.communities.some(
    (community) => props.communityRoleById[community.id] === "owner",
  );
  const partnerPlatformFeeShareBps = BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS;
  const communityCommission = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerPlatformFeeShareBps,
  });
  const effectiveCommunityRevenueShareBps = communityCommission.effectiveCommunityRevenueShareBps;
  const toolGrossMarginShareBps = BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS;
  const stripeConnect = props.accountCommerceStatus?.stripe_connect ?? null;
  const canReceivePayouts = stripeConnect?.payouts_enabled === true;
  const isEligible = Boolean(props.session && hasOwnedCommunity);

  const statusLabel = !props.session
    ? "Sign in required"
    : !hasOwnedCommunity
      ? "Community required"
      : "Eligible";
  const payoutLabel = canReceivePayouts
    ? "Stripe ready"
    : "Stripe required before payouts";

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
              Partners are PolyNet builders. Enrollment, partner links, attribution, and
              commission reporting will live here.
            </p>
          </div>
          <div className="builder-partner-status-stack" aria-label="Builder Partner status">
            <div className="builder-partner-status">
              <span>Eligibility</span>
              <BuilderPartnerStatusValue ready={isEligible}>{statusLabel}</BuilderPartnerStatusValue>
            </div>
            <div className="builder-partner-status">
              <span>Payouts</span>
              <BuilderPartnerStatusValue ready={canReceivePayouts}>{payoutLabel}</BuilderPartnerStatusValue>
            </div>
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

        {props.session ? (
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
                Earn {formatBps(toolGrossMarginShareBps)} of referred creators' tool usage
              </strong>
              <small>Tracked from settled usage after enrollment and approval.</small>
            </div>
            <div className="builder-partner-metric" role="listitem">
              <ShieldCheck />
              <span>Settlement</span>
              <strong>Manual review first</strong>
              <small>Pending, payable, paid, and voided states will be ledger-backed.</small>
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
            Attribution and commission reporting will appear here once enrollment opens.
          </div>
          <div className="account-row">
            <div className="account-identity">
              <span>Partner link</span>
              <strong>{isEligible ? "Available after enrollment" : "Not available yet"}</strong>
            </div>
            <div className="auth-actions">
              <span className="auth-status">
                Links are issued after partner enrollment and fraud checks are active.
              </span>
            </div>
          </div>
          <div className="account-row">
            <div className="account-identity">
              <span>Stripe payout readiness</span>
              <strong>{payoutLabel}</strong>
            </div>
            <div className="auth-actions">
              <span className="auth-status">
                Builder Partner payouts reuse the same Stripe Connect Express account as paid communities.
              </span>
              {!canReceivePayouts ? (
                <StripeSetupButton
                  label={props.isStartingStripeConnectOnboarding ? "Opening..." : "Connect Stripe"}
                  onClick={() => void props.startStripeConnectOnboarding({ context: "account" })}
                  disabled={props.isStartingStripeConnectOnboarding}
                />
              ) : null}
            </div>
          </div>
          {props.accountCommerceError ? <div className="auth-error">{props.accountCommerceError}</div> : null}
        </div>
      ) : null}
    </>
  );
}
