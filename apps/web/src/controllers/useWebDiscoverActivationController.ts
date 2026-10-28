import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  CommunityAccess,
  DiscoverCommunitySnapshot,
  PublicPlanSummary,
} from "../../../../shared/communityTypes";
import type { WebPublicCommunityRecord } from "../webAppContracts";

type PublicCommunityUiActions = {
  setPublicCommunity: Dispatch<
    SetStateAction<WebPublicCommunityRecord | null>
  >;
  setPublicCommunityPlans: Dispatch<
    SetStateAction<PublicPlanSummary[]>
  >;
  setPublicCommunityAccess: Dispatch<
    SetStateAction<CommunityAccess | null>
  >;
  setPublicCommunityError: Dispatch<SetStateAction<string | null>>;
  setPublicJoinError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingPublicCommunity: Dispatch<SetStateAction<boolean>>;
};

export function resolveDiscoverCommunityDestination(
  community: DiscoverCommunitySnapshot,
  knownCommunityId: string | null,
): { kind: "joined"; communityId: string } | { kind: "native" } {
  return knownCommunityId ? { kind: "joined", communityId: knownCommunityId } : { kind: "native" };
}

export function useWebDiscoverActivationController(params: {
  publicCommunityUi: PublicCommunityUiActions;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  setCheckoutError: Dispatch<SetStateAction<string | null>>;
  setCheckoutStatus: Dispatch<
    SetStateAction<
      "idle" | "loading" | "pending" | "succeeded" | "error"
    >
  >;
  resolveKnownCommunityIdBySlug: (
    slug: string,
  ) => string | null;
  enterJoinedCommunity: (value: {
    communityId: string;
    communitySlug: string;
  }) => void;
  openPublicCommunityFunnel: (
    slug: string,
    options: { pushSnapshot: true },
  ) => void;
}) {
  return useCallback(
    (options: {
      canActivate: boolean;
      community: DiscoverCommunitySnapshot;
    }) => {
      if (!options.canActivate) return;
      const community = options.community;
      const slug = community.slug.trim();
      if (!slug) return;
      params.setDiscoverError(null);

      const knownCommunityId =
        params.resolveKnownCommunityIdBySlug(slug);
      const destination = resolveDiscoverCommunityDestination(community, knownCommunityId);
      if (destination.kind === "joined") {
        params.enterJoinedCommunity({
          communityId: destination.communityId,
          communitySlug: slug,
        });
        return;
      }

      params.publicCommunityUi.setPublicCommunity({
        slug,
        name: community.name,
        one_liner: community.one_liner ?? null,
        about: community.about ?? null,
        avatar_url: community.avatar_url ?? null,
        avatar_focus_x: community.avatar_focus_x ?? null,
        avatar_focus_y: community.avatar_focus_y ?? null,
        avatar_zoom: community.avatar_zoom ?? null,
        banner_url: community.banner_url ?? null,
        banner_focus_x: community.banner_focus_x ?? null,
        banner_focus_y: community.banner_focus_y ?? null,
        banner_zoom: community.banner_zoom ?? null,
        visibility: community.visibility,
        entry_policy: community.entry_policy ?? null,
        funnel: community.funnel ?? null,
        member_count:
          typeof community.member_count === "number"
            ? community.member_count
            : null,
      });
      params.publicCommunityUi.setPublicCommunityPlans(
        community.active_plan ? [community.active_plan] : [],
      );
      params.publicCommunityUi.setPublicCommunityAccess(null);
      params.publicCommunityUi.setPublicCommunityError(null);
      params.publicCommunityUi.setPublicJoinError(null);
      params.publicCommunityUi.setIsLoadingPublicCommunity(true);
      params.setCheckoutError(null);
      params.setCheckoutStatus("idle");
      params.openPublicCommunityFunnel(slug, {
        pushSnapshot: true,
      });
    },
    [
      params.enterJoinedCommunity,
      params.openPublicCommunityFunnel,
      params.publicCommunityUi,
      params.resolveKnownCommunityIdBySlug,
      params.setCheckoutError,
      params.setCheckoutStatus,
      params.setDiscoverError,
    ],
  );
}
