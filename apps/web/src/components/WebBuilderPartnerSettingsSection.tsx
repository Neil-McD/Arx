import {
  BadgeDollarSign,
  CircleDashed,
  Handshake,
  Link,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import {
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
} from "../../../../shared/builderPartnerProgram";
import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { StripeSetupButton } from "./StripeSetupButton";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type OwnedCommunity = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WebBuilderPartnerSettingsSectionProps = {
  session: SessionLike;
  requireSignIn: () => void;
  accountCommerceStatus: AccountCommerceStatus | null;
  accountCommerceError: string | null;
  communities: OwnedCommunity[];
  communityRoleById: Record<string, string>;
  openOwnedCommunitySettings: (communityId: string) => void;
  communityInitials: (value: string) => string;
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

export function WebBuilderPartnerSettingsSection(props: WebBuilderPartnerSettingsSectionProps) {
  const ownedCommunities = props.communities
    .filter((community) => props.communityRoleById[community.id] === "owner")
    .sort((a, b) => a.name.localeCompare(b.name));
  const platformFeeBps = Math.max(0, Number(props.accountCommerceStatus?.platform_fee_bps ?? 1500) || 0);
  const partnerPlatformFeeShareBps = BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS;
  const effectiveCommunityRevenueShareBps = Math.round(platformFeeBps * (partnerPlatformFeeShareBps / 10000));
  const toolGrossMarginShareBps = BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS;
  const stripeConnect = props.accountCommerceStatus?.stripe_connect ?? null;
  const canReceivePayouts = stripeConnect?.payouts_enabled === true;
  const hasOwnedCommunity = ownedCommunities.length > 0;
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
          Help builders launch community intelligence systems on PolyNet.
        </div>

        <div className="builder-partner-hero">
          <div className="builder-partner-hero-copy">
            <span className="builder-partner-kicker">Platform partner program</span>
            <h2>Bring builders to PolyNet and share in the value they create.</h2>
            <p>
              Partner accounts are for PolyNet builders with at least one community. Enrollment,
              partner links, attribution, and commission ledgers will live here.
            </p>
          </div>
          <div className="builder-partner-status-stack" aria-label="Builder Partner status">
            <div className={`builder-partner-status ${isEligible ? "is-ready" : "is-pending"}`}>
              <span>Status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className={`builder-partner-status ${canReceivePayouts ? "is-ready" : "is-pending"}`}>
              <span>Payouts</span>
              <strong>{payoutLabel}</strong>
            </div>
          </div>
        </div>

        {!props.session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Partner account</span>
              <strong>Sign in to check eligibility</strong>
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
              <strong>{formatBps(partnerPlatformFeeShareBps)} of PolyNet fee</strong>
              <small>{formatBps(effectiveCommunityRevenueShareBps)} of referred creator revenue at the current take rate.</small>
            </div>
            <div className="builder-partner-metric" role="listitem">
              <CircleDashed />
              <span>Tool usage</span>
              <strong>{formatBps(toolGrossMarginShareBps)} of gross margin</strong>
              <small>Calculated only on settled paid tool usage after vendor cost.</small>
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
            <Users />
            Eligibility
          </div>
          <div className="settings-section-desc">
            Builder Partners must be actively building on PolyNet.
          </div>
          {hasOwnedCommunity ? (
            <div className="invite-list">
              {ownedCommunities.map((community) => (
                <div key={community.id} className="invite-row">
                  <div className="invite-main with-avatar">
                    <CommunityAvatar
                      className="invite-avatar"
                      imageClassName="invite-avatar-img"
                      fallbackClassName="invite-avatar-fallback"
                      imageUrl={community.avatar_url}
                      focusX={community.avatar_focus_x}
                      focusY={community.avatar_focus_y}
                      zoom={community.avatar_zoom}
                      name={community.name}
                      alt=""
                      fallback={props.communityInitials(community.name)}
                      aria-hidden
                    />
                    <div className="invite-text">
                      <div className="invite-code">{community.name}</div>
                      <div className="invite-status">{`/c/${community.slug}`}</div>
                    </div>
                  </div>
                  <div className="invite-actions">
                    <button type="button" onClick={() => props.openOwnedCommunitySettings(community.id)}>
                      Open settings
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="model-note">
              Create a community to become eligible for Builder Partner enrollment.
            </div>
          )}
        </div>
      ) : null}

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
