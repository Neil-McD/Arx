import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  clearPendingPublicJoin,
  classifyPublicCommunityJoinError,
  getErrorMessage,
  joinPublicCommunityRpc,
  readPendingPublicJoinBrandosAid,
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
  type FetchWithSupabaseAuth,
  type ReadSupabaseError,
  type SupabaseSessionLike,
} from "./pay_first";

type OpenExternalUrlClient = {
  openExternalUrl: (url: string) => Promise<void>;
};

type UsePendingPublicCommunityJoinControllerArgs<SessionT extends SupabaseSessionLike> = {
  shellClient: OpenExternalUrlClient;
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<SessionT>;
  readSupabaseError: ReadSupabaseError;
  loadCommunities: (session: SessionT) => Promise<void>;
  autoJoinPublicCommunitiesAttemptedRef: MutableRefObject<Set<string>>;
  getBrandosAidForCommunitySlug: (slug: string | null) => string | null;
  isUuid: (value: string) => boolean;
  onJoinSuccess: (communityId: string) => void;
  setJoiningDiscoverCommunityId: Dispatch<SetStateAction<string | null>>;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  missingPublicAppUrlMessage?: string;
  missingCommunitySlugMessage?: string;
  openJoinPageFailureMessage?: string;
  joinCommunityFailureMessage?: string;
};

export function usePendingPublicCommunityJoinController<SessionT extends SupabaseSessionLike>(
  args: UsePendingPublicCommunityJoinControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const getPublicAppBaseUrl = useCallback((): string | null => {
    const raw =
      (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ??
      (import.meta.env.VITE_APP_URL as string | undefined) ??
      "";
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed;

    const origin = window.location.origin.trim().replace(/\/+$/, "");
    if (origin && /^https?:\/\//i.test(origin)) return origin;

    return null;
  }, []);

  const openExternalUrl = useCallback(async (url: string): Promise<boolean> => {
    const current = argsRef.current;
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      await current.shellClient.openExternalUrl(trimmed);
      return true;
    } catch {
      try {
        window.open(trimmed, "_blank", "noopener,noreferrer");
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  const openCommunityLandingExternal = useCallback(async (community: { slug?: string | null }): Promise<void> => {
    const current = argsRef.current;
    const base = getPublicAppBaseUrl();
    if (!base) {
      current.setDiscoverError(
        current.missingPublicAppUrlMessage ?? "Missing public app URL. Set VITE_PUBLIC_APP_URL to enable checkout links.",
      );
      return;
    }
    const slug = (community.slug ?? "").trim();
    if (!slug) {
      current.setDiscoverError(current.missingCommunitySlugMessage ?? "Missing community slug.");
      return;
    }
    const ok = await openExternalUrl(`${base}/c/${encodeURIComponent(slug)}`);
    if (!ok) {
      current.setDiscoverError(current.openJoinPageFailureMessage ?? "Failed to open the join page.");
    }
  }, [getPublicAppBaseUrl, openExternalUrl]);

  const maybeAutoJoinPendingPublicCommunity = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const slug = readPendingPublicJoinCommunitySlug();
    const id = readPendingPublicJoinCommunityId();
    const brandosAid = readPendingPublicJoinBrandosAid();
    const attemptKey = (slug || id).trim();
    if (!attemptKey) return;
    if (current.autoJoinPublicCommunitiesAttemptedRef.current.has(attemptKey)) return;
    current.autoJoinPublicCommunitiesAttemptedRef.current.add(attemptKey);

    const url = current.getSupabaseUrl();
    if (!url) return;

    current.setJoiningDiscoverCommunityId(attemptKey);
    current.setDiscoverError(null);
    try {
      const resolvedBrandosAid = (() => {
        const candidate = (brandosAid ?? "").trim();
        if (candidate && current.isUuid(candidate)) return candidate;
        return null;
      })();
      const joinedId = await joinPublicCommunityRpc({
        url,
        session,
        communityId: id || undefined,
        communitySlug: slug || undefined,
        brandosAid: resolvedBrandosAid,
        fetchWithSupabaseAuth: current.fetchWithSupabaseAuth,
        readSupabaseError: current.readSupabaseError,
      });
      clearPendingPublicJoin();

      await current.loadCommunities(session);
      current.onJoinSuccess(joinedId);
    } catch (error) {
      const kind = classifyPublicCommunityJoinError(error);
      const message = getErrorMessage(error, current.joinCommunityFailureMessage ?? "Failed to join community.");
      if (
        slug &&
        (kind === "paid_plan_required" ||
          kind === "approval_required" ||
          kind === "paid_communities_do_not_use_request_access")
      ) {
        clearPendingPublicJoin();
        await openCommunityLandingExternal({ slug });
        return;
      }
      current.setDiscoverError(message);
    } finally {
      current.setJoiningDiscoverCommunityId(null);
    }
  }, [openCommunityLandingExternal]);

  const handleJoinDiscoverCommunity = useCallback(async (community: { slug: string }) => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) {
      current.setDiscoverError("Missing Supabase URL.");
      return;
    }
    current.setDiscoverError(null);

    if (!current.supabaseSession) {
      await openCommunityLandingExternal(community);
      return;
    }

    current.setJoiningDiscoverCommunityId(community.slug);
    try {
      const brandosAid = current.getBrandosAidForCommunitySlug(community.slug ?? null);
      const resolvedBrandosAid = brandosAid && current.isUuid(brandosAid) ? brandosAid : null;
      const joinedId = await joinPublicCommunityRpc({
        url,
        session: current.supabaseSession,
        communitySlug: community.slug,
        brandosAid: resolvedBrandosAid,
        fetchWithSupabaseAuth: current.fetchWithSupabaseAuth,
        readSupabaseError: current.readSupabaseError,
      });
      clearPendingPublicJoin();

      await current.loadCommunities(current.supabaseSession);
      current.onJoinSuccess(joinedId);
    } catch (error) {
      const kind = classifyPublicCommunityJoinError(error);
      const message = getErrorMessage(error, current.joinCommunityFailureMessage ?? "Failed to join community.");
      if (
        kind === "paid_plan_required" ||
        kind === "approval_required" ||
        kind === "paid_communities_do_not_use_request_access"
      ) {
        clearPendingPublicJoin();
        await openCommunityLandingExternal(community);
        return;
      }
      current.setDiscoverError(message);
    } finally {
      current.setJoiningDiscoverCommunityId(null);
    }
  }, [openCommunityLandingExternal]);

  return {
    openCommunityLandingExternal,
    maybeAutoJoinPendingPublicCommunity,
    handleJoinDiscoverCommunity,
  };
}
