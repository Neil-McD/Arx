import {
  BadgeDollarSign,
  CircleDashed,
  Handshake,
  Link,
  ShieldCheck,
} from "lucide-react";
import {
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
} from "../../../../shared/builderPartnerProgram";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type WebBuilderPartnerSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
};

function formatBps(bps: number): string {
  const percent = Math.max(0, Number(bps) || 0) / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

export function WebBuilderPartnerSettingsSection(props: WebBuilderPartnerSettingsSectionProps) {
  const partnerPlatformFeeShareBps = BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS;
  const communityCommission = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd: 100,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerPlatformFeeShareBps,
  });
  const effectiveCommunityRevenueShareBps = communityCommission.effectiveCommunityRevenueShareBps;
  const toolUsageShareBps = BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS;
  const isSignedIn = Boolean(props.session);

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
            <h2>Builder Partner Program is coming soon.</h2>
            <p>
              Partner links, attribution, commission tracking, dashboards, and partner payouts
              are not active yet.
            </p>
          </div>
          <div className="builder-partner-status-stack" aria-label="Builder Partner status">
            <div className="builder-partner-status">
              <span>Status</span>
              <strong>Coming soon</strong>
            </div>
            <div className="builder-partner-status">
              <span>Payouts</span>
              <strong>Not active yet</strong>
            </div>
          </div>
        </div>

        <div className="builder-partner-metrics" role="list" aria-label="Planned Builder Partner economics">
          <div className="builder-partner-metric" role="listitem">
            <BadgeDollarSign />
            <span>Planned community revenue</span>
            <strong>
              Target: {formatBps(effectiveCommunityRevenueShareBps)} of referred creators'
              community revenue
            </strong>
            <small>Outcome-based partner commission after the finance system is live.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <CircleDashed />
            <span>Planned tool usage</span>
            <strong>
              Target: {formatBps(toolUsageShareBps)} of referred creators' tool usage
            </strong>
            <small>Tracked only after partner attribution and commission ledgers are active.</small>
          </div>
          <div className="builder-partner-metric" role="listitem">
            <ShieldCheck />
            <span>Settlement</span>
            <strong>Offline until launch</strong>
            <small>No partner commissions, balances, or payouts are active yet.</small>
          </div>
        </div>

        {!isSignedIn ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Partner account</span>
              <strong>Program access is not open yet</strong>
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
            This page will show your partner link, referral analytics, commission ledger,
            payout status, and payout history once the program opens.
          </div>
          <div className="account-row">
            <div className="account-identity">
              <span>Partner link</span>
              <strong>Coming soon</strong>
            </div>
            <div className="auth-actions">
              <span className="auth-status">No partner links are currently issued.</span>
            </div>
          </div>
          <div className="account-row">
            <div className="account-identity">
              <span>Partner payouts</span>
              <strong>Not active yet</strong>
            </div>
            <div className="auth-actions">
              <span className="auth-status">
                Partner payouts will reuse Stripe Connect after the full affiliate finance
                system is ready.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
