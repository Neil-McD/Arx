import {
  WebCommunityAiAgentInstructionsEditor,
  type WebCommunityAiAgentInstructionsEditorProps,
} from "./WebCommunityAiAgentInstructionsEditor";
import { WebCommunityHandbookEditor, type WebCommunityHandbookEditorProps } from "./WebCommunityHandbookEditor";
import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";
import { builderFundingActionLabel, builderFundingStateLabel, formatBuilderOfferPrice, resolveBuilderOfferPrimaryAction } from "../../../../shared/builderOffer";
import { SettingsButton, SettingsGroup, SettingsRow } from "./SettingsRows";

// This community's Agent plan lives on its Guide settings pane.
export type WebCommunityAgentPlanProps = {
  community: CloudFounderBillingCommunity | null;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
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
          <SettingsRow label="Agent plan" help={<span className="settings-v1-error">{plan.error}</span>}>
            <SettingsButton onClick={() => void plan.refresh()}>Retry</SettingsButton>
          </SettingsRow>
        </SettingsGroup>
      );
    }
    return plan.isLoading ? <SettingsGroup label="Plan"><SettingsRow label="Agent plan" help="Loading…" /></SettingsGroup> : null;
  }
  const action = resolveBuilderOfferPrimaryAction({ state: community.funding_state, allowedActions: community.allowed_actions });
  const comped = community.funding_mode === "operator_comp";
  const state = comped ? "Included by Polynet."
    : community.funding_state === "builder_canceling" && community.current_period_end_at
      ? `Active until ${new Date(community.current_period_end_at).toLocaleDateString()}.`
      : `${builderFundingStateLabel(community.funding_state)}.`;
  return (
    <SettingsGroup label="Plan">
      <SettingsRow
        label="Agent plan"
        help={
          plan.error ? (
            <span className="settings-v1-error">{plan.error}</span>
          ) : comped ? (
            "Included by Polynet. The community itself is free."
          ) : (
            `${state} ${formatBuilderOfferPrice(community.monthly_price_base_units)}; the community itself is free.`
          )
        }
      >
        {comped || !action ? null : (
          <SettingsButton
            variant={action === "buy_builder" ? "primary" : "secondary"}
            disabled={plan.isActing}
            onClick={() =>
              action === "manage_builder"
                ? void plan.openPortal(community.community_id)
                : plan.onOpenBuilderOffer(community)
            }
          >
            {plan.isActing
              ? "Opening…"
              : builderFundingActionLabel({
                  action,
                  state: community.funding_state,
                  includePrice: false,
                })}
          </SettingsButton>
        )}
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
