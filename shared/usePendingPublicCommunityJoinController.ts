import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  applyShellVariantToPublicPath,
  readShellVariantFromPathname,
  clearPendingPublicJoin,
  classifyPublicCommunityJoinError,
  getErrorMessage,
  joinPublicCommunityRpc,
  readPendingPublicJoinBrandosAid,
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
  type SessionLike,
} from "./pay_first";

type OpenExternalUrlClient = {
  openExternalUrl: (url: string) => Promise<void>;
};

type UsePendingPublicCommunityJoinControllerArgs<SessionT extends SessionLike> = {
  shellClient: OpenExternalUrlClient;
  session: SessionT | null;
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

export function usePendingPublicCommunityJoinController<SessionT extends SessionLike>(
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
    const shellVariant = readShellVariantFromPathname(window.location.pathname || "/");
    const landingPath = applyShellVariantToPublicPath(`/c/${encodeURIComponent(slug)}`, shellVariant);
    const ok = await openExternalUrl(`${base}${landingPath}`);
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

    current.setJoiningDiscoverCommunityId(attemptKey);
    current.setDiscoverError(null);
    try {
      const resolvedBrandosAid = (() => {
        const candidate = (brandosAid ?? "").trim();
        if (candidate && current.isUuid(candidate)) return candidate;
        return null;
      })();
      const joinResult = await joinPublicCommunityRpc({
        session,
        communityId: id || undefined,
        communitySlug: slug || undefined,
        brandosAid: resolvedBrandosAid,
      });
      clearPendingPublicJoin();

      if (joinResult.outcome === "joined") {
        await current.loadCommunities(session);
        current.onJoinSuccess(joinResult.community_id);
        return;
      }
      if (
        slug &&
        (joinResult.outcome === "paid_plan_required" ||
          joinResult.outcome === "approval_pending" ||
          joinResult.outcome === "approval_denied")
      ) {
        await openCommunityLandingExternal({ slug });
        return;
      }
    } catch (error) {
      const kind = classifyPublicCommunityJoinError(error);
      const message = getErrorMessage(error, current.joinCommunityFailureMessage ?? "Failed to join community.");
      if (
        slug &&
        (kind === "paid_plan_required" || kind === "approval_pending" || kind === "approval_denied")
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
    current.setDiscoverError(null);

    if (!current.session) {
      await openCommunityLandingExternal(community);
      return;
    }

    current.setJoiningDiscoverCommunityId(community.slug);
    try {
      const brandosAid = current.getBrandosAidForCommunitySlug(community.slug ?? null);
      const resolvedBrandosAid = brandosAid && current.isUuid(brandosAid) ? brandosAid : null;
      const joinResult = await joinPublicCommunityRpc({
        session: current.session,
        communitySlug: community.slug,
        brandosAid: resolvedBrandosAid,
      });
      clearPendingPublicJoin();

      if (joinResult.outcome === "joined") {
        await current.loadCommunities(current.session);
        current.onJoinSuccess(joinResult.community_id);
        return;
      }
      if (
        joinResult.outcome === "paid_plan_required" ||
        joinResult.outcome === "approval_pending" ||
        joinResult.outcome === "approval_denied"
      ) {
        await openCommunityLandingExternal(community);
        return;
      }
    } catch (error) {
      const kind = classifyPublicCommunityJoinError(error);
      const message = getErrorMessage(error, current.joinCommunityFailureMessage ?? "Failed to join community.");
      if (
        kind === "paid_plan_required" ||
        kind === "approval_pending" ||
        kind === "approval_denied"
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
