import { useEffect } from "react";
import { useCommunityVisualIdentityRegistryActions } from "../../../../shared/CommunityVisualIdentityRegistry";

export function useWebCommunityVisualIdentityRegistryLifecycle(
  canonicalSessionUserId: string | null,
) {
  const registry = useCommunityVisualIdentityRegistryActions();

  useEffect(() => {
    registry.clearCommunityVisualIdentities();
  }, [canonicalSessionUserId, registry.clearCommunityVisualIdentities]);

  return {
    upsertCommunityVisualIdentities: registry.upsertCommunityVisualIdentities,
  };
}
