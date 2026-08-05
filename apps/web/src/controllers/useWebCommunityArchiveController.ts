import { useCallback, useEffect, useRef, useState } from "react";

import { requestCloudMyCommunityArchive } from "../../../../shared/cloudCommunityLifecycleGateway";
import type { CommunityArchiveCommandResult } from "../../../../shared/communityLifecycleManagement";
import type { AuthSession } from "../auth";

type ArchiveCommunity = {
  id: string;
  lifecycle_generation?: number | null;
};

function archiveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("community_lifecycle_protected")) {
    return "This community is protected and cannot be archived.";
  }
  if (message.includes("community_archive_generation_stale")) {
    return "The community changed. Refresh and try again.";
  }
  if (message.includes("community_owner_required")) {
    return "Only the community owner can archive this community.";
  }
  if (message.includes("external_subscription_cancellation_unsupported")) {
    return "An externally managed subscription prevents automatic archival.";
  }
  if (
    message.includes("stripe_subscription_identity_incomplete") ||
    message.includes("checkout_identity_incomplete")
  ) {
    return "Billing records need attention before this community can be archived.";
  }
  if (message.includes("community_already_archived")) {
    return "This community is already archived.";
  }
  return "The archive request could not be started. Nothing was changed.";
}

export function useWebCommunityArchiveController(params: {
  activeCommunity: ArchiveCommunity | null;
  session: AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
    source?: string,
  ) => Promise<AuthSession | null>;
  reloadCommunities: (session: AuthSession) => Promise<void>;
  reloadCommunityAccess: (
    communityId: string,
    session: AuthSession,
  ) => Promise<void>;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const requestRef = useRef(0);
  const isRequestingRef = useRef(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestRef.current += 1;
    isRequestingRef.current = false;
    setIsRequesting(false);
    setError(null);
  }, [params.activeCommunity?.id]);

  const requestArchive = useCallback(async (): Promise<CommunityArchiveCommandResult | null> => {
    const current = paramsRef.current;
    const community = current.activeCommunity;
    if (!community || isRequestingRef.current) return null;
    const request = requestRef.current + 1;
    requestRef.current = request;
    isRequestingRef.current = true;
    setIsRequesting(true);
    setError(null);
    try {
      const session = await current.ensureSession(
        current.session,
        "community_archive",
      );
      if (!session) throw new Error("verified_identity_required");
      const result = await requestCloudMyCommunityArchive({
        session,
        communityId: community.id,
        expectedGeneration: Number.isSafeInteger(community.lifecycle_generation)
          ? Number(community.lifecycle_generation)
          : 0,
      });
      if (requestRef.current !== request) return result;
      await Promise.allSettled([
        current.reloadCommunityAccess(community.id, session),
        current.reloadCommunities(session),
      ]);
      return result;
    } catch (nextError) {
      if (requestRef.current === request) {
        setError(archiveErrorMessage(nextError));
      }
      return null;
    } finally {
      if (requestRef.current === request) {
        isRequestingRef.current = false;
        setIsRequesting(false);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isRequesting,
    error,
    clearError,
    requestArchive,
  };
}
