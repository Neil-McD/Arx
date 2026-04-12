import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";

type CommunityLike = {
  id: string;
  slug: string;
};

export function useWebSelectedCommunityController<TCommunity extends CommunityLike>(params: {
  initialCommunitySlug?: string | null;
  communities: TCommunity[];
  setCommunityTab: Dispatch<SetStateAction<CommunityTab>>;
}) {
  const { communities, setCommunityTab } = params;
  const [activeCommunitySlug, setActiveCommunitySlug] = useState<string | null>(
    () => String(params.initialCommunitySlug ?? "").trim() || null,
  );
  const [pendingCommunityId, setPendingCommunityId] = useState<string | null>(() => {
    if (String(params.initialCommunitySlug ?? "").trim()) return null;
    return null;
  });

  const resolveKnownCommunityIdBySlug = useCallback((communitySlug: string | null | undefined): string | null => {
    const normalizedSlug = String(communitySlug ?? "").trim();
    if (!normalizedSlug) return null;
    const matchedCommunity =
      communities.find((community) => String(community.slug ?? "").trim() === normalizedSlug) ?? null;
    return matchedCommunity?.id ?? null;
  }, [communities]);

  const resolveKnownCommunitySlugById = useCallback((communityId: string | null | undefined): string | null => {
    const normalizedId = String(communityId ?? "").trim();
    if (!normalizedId) return null;
    const matchedCommunity =
      communities.find((community) => String(community.id ?? "").trim() === normalizedId) ?? null;
    const slug = String(matchedCommunity?.slug ?? "").trim();
    return slug || null;
  }, [communities]);

  const activeCommunity = useMemo(() => {
    const selectedSlug = String(activeCommunitySlug ?? "").trim();
    if (selectedSlug) {
      return communities.find((community) => String(community.slug ?? "").trim() === selectedSlug) ?? null;
    }
    if (!pendingCommunityId) return null;
    return communities.find((community) => community.id === pendingCommunityId) ?? null;
  }, [activeCommunitySlug, communities, pendingCommunityId]);

  useEffect(() => {
    if (activeCommunitySlug) {
      if (pendingCommunityId !== null) setPendingCommunityId(null);
      return;
    }
    if (!pendingCommunityId) return;
    const resolvedSlug = resolveKnownCommunitySlugById(pendingCommunityId);
    if (!resolvedSlug) return;
    setActiveCommunitySlug(resolvedSlug);
    setPendingCommunityId(null);
  }, [activeCommunitySlug, pendingCommunityId, resolveKnownCommunitySlugById]);

  const selectedActiveCommunitySlug =
    String(activeCommunity?.slug ?? activeCommunitySlug ?? "").trim() || null;
  const selectedActiveCommunityId =
    activeCommunity?.id ??
    (selectedActiveCommunitySlug
      ? resolveKnownCommunityIdBySlug(selectedActiveCommunitySlug)
      : pendingCommunityId);

  const setActiveCommunityId = useCallback<Dispatch<SetStateAction<string | null>>>((next) => {
    const previousCommunityId = selectedActiveCommunityId ?? null;
    const resolvedValue =
      typeof next === "function" ? next(previousCommunityId) : next;
    const normalizedId = String(resolvedValue ?? "").trim() || null;
    if (!normalizedId) {
      setActiveCommunitySlug(null);
      setPendingCommunityId(null);
      return;
    }
    const resolvedSlug = resolveKnownCommunitySlugById(normalizedId);
    if (resolvedSlug) {
      setActiveCommunitySlug(resolvedSlug);
      setPendingCommunityId(null);
      return;
    }
    if (normalizedId === previousCommunityId && activeCommunitySlug) {
      return;
    }
    setActiveCommunitySlug(null);
    setPendingCommunityId(normalizedId);
  }, [activeCommunitySlug, resolveKnownCommunitySlugById, selectedActiveCommunityId]);

  const applyCommunityShellState = useCallback((opts: {
    communityId?: string | null;
    communitySlug?: string | null;
    communityTab?: CommunityTab;
  }) => {
    const requestedCommunitySlug =
      opts.communitySlug !== undefined ? String(opts.communitySlug ?? "").trim() || null : undefined;
    const requestedCommunityId =
      opts.communityId !== undefined ? String(opts.communityId ?? "").trim() || null : undefined;

    if (requestedCommunitySlug !== undefined) {
      setActiveCommunitySlug(requestedCommunitySlug);
      if (!requestedCommunitySlug) {
        setPendingCommunityId(null);
      } else {
        const resolvedCommunityId = resolveKnownCommunityIdBySlug(requestedCommunitySlug);
        setPendingCommunityId(resolvedCommunityId ? null : requestedCommunityId ?? null);
      }
    } else if (requestedCommunityId !== undefined) {
      if (!requestedCommunityId) {
        setActiveCommunitySlug(null);
        setPendingCommunityId(null);
      } else {
        const resolvedCommunitySlug = resolveKnownCommunitySlugById(requestedCommunityId);
        if (resolvedCommunitySlug) {
          setActiveCommunitySlug(resolvedCommunitySlug);
          setPendingCommunityId(null);
        } else {
          setActiveCommunitySlug(null);
          setPendingCommunityId(requestedCommunityId);
        }
      }
    }

    if (opts.communityTab !== undefined) {
      setCommunityTab(opts.communityTab);
    }
  }, [resolveKnownCommunityIdBySlug, resolveKnownCommunitySlugById, setCommunityTab]);

  return {
    activeCommunity,
    activeCommunityId: selectedActiveCommunityId ?? null,
    activeCommunitySlug,
    selectedActiveCommunityId,
    selectedActiveCommunitySlug,
    setActiveCommunityId,
    resolveKnownCommunityIdBySlug,
    resolveKnownCommunitySlugById,
    applyCommunityShellState,
  };
}
