import { useCallback, useState } from "react";
import type { BuilderFundingAction } from "../../../../shared/builderFunding";
import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";
import type { FounderPlanTier } from "../../../../shared/founderPlan";

export function useWebBuilderOfferController(params: {
  startCheckout: (communityId: string, planTier?: FounderPlanTier) => Promise<void>;
  openPortal: (communityId: string) => Promise<void>;
}) {
  const [community, setCommunity] = useState<CloudFounderBillingCommunity | null>(null);

  const open = useCallback((next: {
    community: CloudFounderBillingCommunity;
  }) => {
    setCommunity(next.community);
  }, []);

  const close = useCallback(() => {
    setCommunity(null);
  }, []);

  const confirm = useCallback(async (
    action: BuilderFundingAction,
    planTier?: FounderPlanTier,
  ): Promise<void> => {
    if (!community) return;
    if (action === "buy_builder" || action === "resume_checkout") {
      await params.startCheckout(community.community_id, planTier);
      return;
    }
    if (action === "manage_builder") {
      await params.openPortal(community.community_id);
      return;
    }
  }, [community, params]);

  return {
    community,
    open,
    close,
    confirm,
  };
}
