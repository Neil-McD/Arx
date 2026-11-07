import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  DiscoverCommunitySnapshot,
} from "../../../../shared/communityTypes";


export function resolveDiscoverCommunityDestination(
  community: DiscoverCommunitySnapshot,
  knownCommunityId: string | null,
): { kind: "joined"; communityId: string } | { kind: "native" } {
  return knownCommunityId ? { kind: "joined", communityId: knownCommunityId } : { kind: "native" };
}

export function useWebDiscoverActivationController(params: {
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
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

      // Not a member yet: /c/<slug> hands over to the community's own site.
      params.openPublicCommunityFunnel(slug, {
        pushSnapshot: true,
      });
    },
    [
      params.enterJoinedCommunity,
      params.openPublicCommunityFunnel,
      params.resolveKnownCommunityIdBySlug,
      params.setDiscoverError,
    ],
  );
}
