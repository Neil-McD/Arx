import { useEffect, useState } from "react";

import type {
  CloudFounderBillingCommunity,
  CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import {
  builderFundingActionLabel,
  formatBuilderOfferPrice,
  resolveBuilderOfferPrimaryAction,
} from "../../../../shared/builderOffer";
import { WebSignOutConfirmModal } from "./WebSignOutConfirmModal";
import { WebArchivedCommunityList } from "./WebArchivedCommunityList";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type WebAccountSettingsSectionProps = {
  session: SessionLike;
  authError: string | null;
  requireSignIn: () => void;
  handleSignOut: () => Promise<void> | void;
  founderBillingOverview: CloudFounderBillingOverview;
  isLoadingFounderBilling: boolean;
  founderBillingActionCommunityId: string | null;
  founderBillingError: string | null;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  onOpenCommunityBilling: () => void;
  onOpenCreateCommunity: () => void;
  retryCommunityArchive: (communityId: string) => Promise<void> | void;
  restoreCommunityWithoutPayment: (
    communityId: string,
    lifecycleGeneration: number,
  ) => Promise<void> | void;
};

export function WebAccountSettingsSection(
  props: WebAccountSettingsSectionProps,
) {
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const [isSubmittingSignOut, setIsSubmittingSignOut] = useState(false);

  useEffect(() => {
    if (props.session) return;
    setIsSignOutConfirmOpen(false);
    setIsSubmittingSignOut(false);
  }, [props.session]);

  const handleConfirmSignOut = async (): Promise<void> => {
    if (isSubmittingSignOut) return;
    setIsSubmittingSignOut(true);
    try {
      await props.handleSignOut();
      setIsSignOutConfirmOpen(false);
    } finally {
      setIsSubmittingSignOut(false);
    }
  };
  const activeCommunities = props.founderBillingOverview.communities.filter(
    (community) => community.lifecycle_status === "active",
  );
  const archivedCommunities = props.founderBillingOverview.communities.filter(
    (community) => community.lifecycle_status === "archived",
  );
  const archivedCommunityCount = archivedCommunities.length;
  const builderAttentionCommunity = activeCommunities.find((community) =>
    [
      "builder_required",
      "checkout_pending",
      "builder_inactive",
      "builder_past_due",
      "builder_ended",
    ].includes(community.funding_state),
  ) ?? null;
  const activeBuilderCount = activeCommunities.filter((community) =>
    ["builder_active", "builder_canceling", "builder_included"].includes(
      community.funding_state,
    ),
  ).length;
  const builderAttentionAction = builderAttentionCommunity
    ? resolveBuilderOfferPrimaryAction({
        state: builderAttentionCommunity.funding_state,
        allowedActions: builderAttentionCommunity.allowed_actions,
      })
    : null;
  const builderIsOptional =
    builderAttentionCommunity?.builder_access_mode === "grandfathered";

  return (
    <>
      <div className="settings-section">
        <div className="settings-section-title">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Account
        </div>
        <div className="settings-section-desc">
          Manage your sign-in identity.
        </div>
        {props.session ? (
          <div className="account-row">
            <div className="account-identity">
              <span>Signed in as</span>
              <strong>{props.session.user.email ?? props.session.user.id}</strong>
            </div>
            <button
              className="settings-primary-action"
              type="button"
              onClick={() => setIsSignOutConfirmOpen(true)}
              disabled={isSubmittingSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="account-row">
            <button className="google-sign-in" type="button" onClick={props.requireSignIn}>
              Continue to sign in
            </button>
          </div>
        )}
        {props.authError ? <div className="key-error">{props.authError}</div> : null}
      </div>

      {props.session ? (
        <div className="settings-section builder-account-section">
          <div className="settings-section-title">Builder communities</div>
          <div className="settings-section-desc">
            Builder is attached to communities, not your account. Each Builder community is {formatBuilderOfferPrice()}.
          </div>
          {props.isLoadingFounderBilling && props.founderBillingOverview.communities.length === 0 ? (
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Checking Builder…</span>
            </div>
          ) : (
            <div className="builder-account-summary">
              <div>
                {props.founderBillingOverview.communities.length === 0 ? (
                  <>
                    <strong>No Builder community yet</strong>
                    <span>Create your first community to continue.</span>
                  </>
                ) : activeCommunities.length === 0 && archivedCommunityCount > 0 ? (
                  <>
                    <strong>{`${archivedCommunityCount} archived ${archivedCommunityCount === 1 ? "community" : "communities"}`}</strong>
                    <span>Review or restore them below.</span>
                  </>
                ) : builderAttentionCommunity ? (
                  <>
                    <strong>
                      {builderIsOptional
                        ? `Builder AI is optional for ${builderAttentionCommunity.community_name}`
                        : `${builderAttentionCommunity.community_name} needs attention`}
                    </strong>
                    <span>
                      {builderIsOptional
                        ? "Your community remains available. Activate Builder for Polynet-hosted AI."
                        : "Restore Builder to recover paid community access and hosted AI."}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>{`Builder active for ${activeBuilderCount} ${activeBuilderCount === 1 ? "community" : "communities"}`}</strong>
                    <span>All owned communities are current.</span>
                  </>
                )}
              </div>
              {props.founderBillingOverview.communities.length === 0 ||
              (activeCommunities.length === 0 && archivedCommunityCount > 0) ? (
                <button className="settings-primary-action" type="button" onClick={props.onOpenCreateCommunity}>Create community</button>
              ) : builderAttentionCommunity && builderAttentionAction ? (
                <button className="settings-primary-action" type="button" onClick={() => props.onOpenBuilderOffer(builderAttentionCommunity)}>
                  {builderFundingActionLabel({
                    action: builderAttentionAction,
                    state: builderAttentionCommunity.funding_state,
                    includePrice: builderAttentionAction === "buy_builder",
                  })}
                </button>
              ) : (
                <button className="settings-primary-action" type="button" onClick={props.onOpenCommunityBilling}>
                  Manage billing
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {props.session ? (
        <WebArchivedCommunityList
          communities={archivedCommunities}
          actionCommunityId={props.founderBillingActionCommunityId}
          error={props.founderBillingError}
          retryCommunityArchive={props.retryCommunityArchive}
          restoreCommunityWithoutPayment={props.restoreCommunityWithoutPayment}
          onOpenBuilderOffer={props.onOpenBuilderOffer}
        />
      ) : null}

      <WebSignOutConfirmModal
        isOpen={Boolean(props.session) && isSignOutConfirmOpen}
        isSubmitting={isSubmittingSignOut}
        onClose={() => {
          if (!isSubmittingSignOut) setIsSignOutConfirmOpen(false);
        }}
        onConfirm={handleConfirmSignOut}
      />
    </>
  );
}
