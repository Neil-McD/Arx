import {
  WebCommunityAiAgentInstructionsEditor,
  type WebCommunityAiAgentInstructionsEditorProps,
} from "./WebCommunityAiAgentInstructionsEditor";
import { WebCommunityHandbookEditor, type WebCommunityHandbookEditorProps } from "./WebCommunityHandbookEditor";
import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";
import {
  POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  type FounderPlanTier,
} from "../../../../shared/founderPlan";
import {
  builderFundingActionLabel,
  builderFundingStateLabel,
  formatBuilderOfferPrice,
  founderPlanTierDisplayName,
  resolveBuilderOfferPrimaryAction,
} from "../../../../shared/builderOffer";
import { SettingsButton, SettingsGroup, SettingsRow } from "./SettingsRows";

// This community's Agent plan lives on its Guide settings pane.
export type WebCommunityAgentPlanProps = {
  community: CloudFounderBillingCommunity | null;
  guideTierAvailable?: boolean;
  guideMonthlyPriceBaseUnits?: number;
  chiefOfStaffMonthlyPriceBaseUnits?: number;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
  startCheckout?: (communityId: string, planTier?: FounderPlanTier) => Promise<void> | void;
  switchTier?: (communityId: string, targetTier: FounderPlanTier) => Promise<boolean> | void;
  openPortal: (communityId: string) => Promise<void> | void;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  refresh: () => Promise<unknown> | void;
};

function AgentPlanGroup({ plan }: { plan: WebCommunityAgentPlanProps }) {
  const community = plan.community;
  if (!community) {
    // Couldn't load: say so and offer a retry, rather than dropping the group.
    if (plan.error && !plan.isLoading) {
      return (
        <SettingsGroup label="Plan">
          <SettingsRow label="Community plan" help={<span className="settings-v1-error">{plan.error}</span>}>
            <SettingsButton onClick={() => void plan.refresh()}>Retry</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      );
    }
    return plan.isLoading ? <SettingsGroup label="Plan"><SettingsRow label="Community plan" help="Loading…" /></SettingsGroup> : null;
  }

  const action = resolveBuilderOfferPrimaryAction({
    state: community.funding_state,
    allowedActions: community.allowed_actions,
  });
  const comped = community.funding_mode === "operator_comp";
  const guidePriceUnits =
    plan.guideMonthlyPriceBaseUnits ?? POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS;
  const chiefOfStaffPriceUnits =
    plan.chiefOfStaffMonthlyPriceBaseUnits ??
    POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS;
  const guidePriceLabel = formatBuilderOfferPrice(guidePriceUnits);
  const chiefOfStaffPriceLabel = formatBuilderOfferPrice(chiefOfStaffPriceUnits);
  const guideTierAvailable = plan.guideTierAvailable === true;

  if (comped) {
    return (
      <SettingsGroup label="Plan">
        <SettingsRow
          label="Chief of Staff"
          help="Included by Polynet ($20/month AI allowance & full proactive suite). The community itself is free."
        >
          <span className="settings-v1-value">Included</span>
        </SettingsRow>
      </SettingsGroup>
    );
  }

  const hasGrantingSubscription =
    community.funding_state === "builder_active" ||
    community.funding_state === "builder_canceling";
  const currentTier: FounderPlanTier | null = community.plan_tier ?? null;
  const isGrandfatheredLegacy =
    currentTier === "chief_of_staff" &&
    community.monthly_price_base_units === POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS;

  // Active paid subscription (Guide or Chief of Staff): show current tier, billing portal, and in-place tier switch.
  if (hasGrantingSubscription && currentTier) {
    const periodNote =
      community.funding_state === "builder_canceling" && community.current_period_end_at
        ? `Ends ${new Date(community.current_period_end_at).toLocaleDateString()}.`
        : "Active.";
    const currentPriceLabel = formatBuilderOfferPrice(community.monthly_price_base_units);
    const currentSummary =
      currentTier === "guide"
        ? `${periodNote} ${currentPriceLabel} · $3/month AI included · Reactive 1:1 chats, @mentions, active threads & living memory.`
        : `${periodNote} ${currentPriceLabel}${isGrandfatheredLegacy ? " (grandfathered)" : ""} · $20/month AI included · Full proactive Chief of Staff suite & optional $30 usage boosts.`;

    return (
      <SettingsGroup label="Plan">
        <SettingsRow
          label={founderPlanTierDisplayName(currentTier)}
          help={
            plan.error ? (
              <span className="settings-v1-error">{plan.error}</span>
            ) : (
              currentSummary
            )
          }
        >
          <SettingsButton
            variant="secondary"
            disabled={plan.isActing}
            onClick={() => void plan.openPortal(community.community_id)}
          >
            {plan.isActing ? "Opening…" : "Manage billing"}
          </SettingsButton>
        </SettingsRow>
        {currentTier === "guide" && plan.switchTier ? (
          <SettingsRow
            label={`Upgrade to Chief of Staff — ${chiefOfStaffPriceLabel}`}
            help="Unlocks Daily Founder Briefs, proactive member & builder check-ins, unanswered-question auto-replies, optional $30 usage boosts, and $20/month AI included. Prorated immediately on your card on file."
          >
            <SettingsButton
              variant="primary"
              disabled={plan.isActing}
              onClick={() => void plan.switchTier?.(community.community_id, "chief_of_staff")}
            >
              {plan.isActing ? "Upgrading…" : "Upgrade to Chief of Staff"}
            </SettingsButton>
          </SettingsRow>
        ) : null}
        {currentTier === "chief_of_staff" && guideTierAvailable && plan.switchTier ? (
          <SettingsRow
            label={`Switch to Guide — ${guidePriceLabel}`}
            help={
              isGrandfatheredLegacy
                ? "Switches to reactive Guide ($3/month AI) and pauses proactive check-ins, Daily Briefs, and usage boosts. Leaving your grandfathered $79 rate moves you to current pricing if you upgrade again later."
                : "Switches to reactive Guide ($3/month AI) and pauses proactive check-ins, Daily Briefs, and usage boosts."
            }
          >
            <SettingsButton
              variant="secondary"
              disabled={plan.isActing}
              onClick={() => void plan.switchTier?.(community.community_id, "guide")}
            >
              {plan.isActing ? "Switching…" : "Switch to Guide"}
            </SettingsButton>
          </SettingsRow>
        ) : null}
      </SettingsGroup>
    );
  }

  // Past due or inactive subscription: direct to Stripe Billing Portal to fix payment.
  if (action === "manage_builder") {
    return (
      <SettingsGroup label="Plan">
        <SettingsRow
          label={currentTier ? founderPlanTierDisplayName(currentTier) : "Community plan"}
          help={
            plan.error ? (
              <span className="settings-v1-error">{plan.error}</span>
            ) : (
              `${builderFundingStateLabel(community.funding_state)}. ${formatBuilderOfferPrice(community.monthly_price_base_units)}; the community itself stays free.`
            )
          }
        >
          <SettingsButton
            variant="primary"
            disabled={plan.isActing}
            onClick={() => void plan.openPortal(community.community_id)}
          >
            {plan.isActing
              ? "Opening…"
              : builderFundingActionLabel({
                  action,
                  state: community.funding_state,
                  includePrice: false,
                })}
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>
    );
  }

  // Free community (or incomplete checkout): show the 3-tier ladder cleanly.
  const pendingTier = community.checkout_pending ? community.pending_checkout_plan_tier ?? null : null;
  const startPlan = (tier: FounderPlanTier) => {
    if (plan.startCheckout) {
      void plan.startCheckout(community.community_id, tier);
    } else {
      plan.onOpenBuilderOffer(community);
    }
  };

  return (
    <SettingsGroup label="Plan">
      <SettingsRow
        label="Free — $0/month"
        help={
          plan.error ? (
            <span className="settings-v1-error">{plan.error}</span>
          ) : (
            "Current plan. Unlimited members, channels, courses, pods, events, DMs, zero-AI weekly digests, and official Polynet MCP."
          )
        }
      >
        <span className="settings-v1-value">Current</span>
      </SettingsRow>
      {guideTierAvailable ? (
        <SettingsRow
          label={`Guide — ${guidePriceLabel}`}
          help="The community that remembers. Reactive AI guide for 1:1 chats, @mentions, active-thread follow-ups, and living community & personal memory ($3/month AI included)."
        >
          <SettingsButton
            variant="secondary"
            disabled={plan.isActing}
            onClick={() => startPlan("guide")}
          >
            {plan.isActing
              ? "Opening…"
              : pendingTier === "guide"
                ? "Resume Guide checkout"
                : `Start Guide — ${guidePriceLabel}`}
          </SettingsButton>
        </SettingsRow>
      ) : null}
      <SettingsRow
        label={`Chief of Staff — ${chiefOfStaffPriceLabel}`}
        help="The agent that helps run your community. Everything in Guide plus Daily Founder Briefs, proactive member & builder check-ins, unanswered-question auto-replies, and optional $30 usage boosts ($20/month AI included)."
      >
        <SettingsButton
          variant="primary"
          disabled={plan.isActing}
          onClick={() => startPlan("chief_of_staff")}
        >
          {plan.isActing
            ? "Opening…"
            : pendingTier === "chief_of_staff"
              ? "Resume checkout"
              : `Start Chief of Staff — ${chiefOfStaffPriceLabel}`}
        </SettingsButton>
      </SettingsRow>
    </SettingsGroup>
  );
}

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentConfig: boolean;
  communityAgentConfigError: string | null;
  onRequireSignIn: () => void;
  instructionsEditorProps: WebCommunityAiAgentInstructionsEditorProps;
  handbookEditorProps?: WebCommunityHandbookEditorProps<any>;
  agentPlan?: WebCommunityAgentPlanProps;
  embedded?: boolean;
};

export function WebCommunityAiAgentSection(props: WebCommunityAiAgentSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityAgentConfig,
    communityAgentConfigError,
    onRequireSignIn,
    instructionsEditorProps,
    handbookEditorProps,
  } = props;

  const ready =
    activeCommunity &&
    hasSession &&
    canManageMembersActiveCommunity &&
    !isLoadingCommunityAgentConfig &&
    !communityAgentConfigError;

  return (
    <>
      {props.agentPlan ? <AgentPlanGroup plan={props.agentPlan} /> : null}
      {ready ? (
        <>
          <WebCommunityAiAgentInstructionsEditor {...instructionsEditorProps} />
          {handbookEditorProps ? <WebCommunityHandbookEditor {...handbookEditorProps} /> : null}
        </>
      ) : (
        <SettingsGroup>
          <SettingsRow
            label="The guide"
            help={
              !activeCommunity
                ? "Pick a community first."
                : !hasSession
                  ? "Sign in to set up the guide."
                  : !canManageMembersActiveCommunity
                    ? "Only owners and admins set up the guide."
                    : isLoadingCommunityAgentConfig
                      ? "Loading…"
                      : <span className="settings-v1-error">{communityAgentConfigError}</span>
            }
          >
            {!hasSession && activeCommunity ? (
              <SettingsButton onClick={onRequireSignIn}>Sign in</SettingsButton>
            ) : null}
          </SettingsRow>
        </SettingsGroup>
      )}
    </>
  );
}
