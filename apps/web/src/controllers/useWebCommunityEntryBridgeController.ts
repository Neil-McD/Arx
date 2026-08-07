import { useCallback, useEffect, useState } from "react";

import type { AccountSetupStatus } from "../../../../shared/accountSetup";
import type { CloudMemberEntryDestination } from "../../../../shared/cloudMemberEntryDestinationGateway";

type LegalAcceptance = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
} | null;

type Entry = {
  communityId: string;
  communitySlug: string | null;
  communityName?: string | null;
};

type CommunitySummary = {
  id: string;
  name: string;
} | null;

type PublicCommunitySummary = {
  name: string;
} | null;

export function resolveCommunityEntrySetupAction(args: {
  publicRouteKind: string;
  isAccountSetupResolved: boolean;
  accountSetupStatus: AccountSetupStatus | null;
}): "wait" | "setup" | "enter" {
  if (args.publicRouteKind !== "community_funnel") return "enter";
  if (!args.isAccountSetupResolved) return "wait";
  return args.accountSetupStatus?.completed ? "enter" : "setup";
}

export function useWebCommunityEntryBridgeController(params: {
  publicRouteKind: string;
  isAccountSetupResolved: boolean;
  accountSetupStatus: AccountSetupStatus | null;
  activeCommunity: CommunitySummary;
  activeCommunityId: string | null;
  selectedActiveCommunitySlug: string | null;
  publicCommunity: PublicCommunitySummary;
  publicCommunityAccessId: string | null;
  approvalPending: boolean;
  validateProfileInputs: (acceptance: LegalAcceptance) => boolean;
  saveOnboardingProfile: (acceptance: LegalAcceptance) => Promise<boolean>;
  finishOnboarding: (options: { navigate: false }) => Promise<boolean>;
  setOnboardingError: (message: string | null) => void;
  resolveDestination: (options?: {
    communityId?: string | null;
    communitySlug?: string | null;
  }) => Promise<CloudMemberEntryDestination | null>;
  applyDestination: (
    destination: CloudMemberEntryDestination,
    options?: { replace?: boolean },
  ) => void;
  resolveAndEnter: (options?: {
    communityId?: string | null;
    communitySlug?: string | null;
    replace?: boolean;
  }) => Promise<boolean>;
}) {
  const [isBridgeGateOpen, setIsBridgeGateOpen] = useState(false);
  const [bridgePendingEntry, setBridgePendingEntry] = useState<Entry | null>(
    null,
  );

  const buildPendingEntry = useCallback(
    (entry: Entry): Entry => {
      const communityName =
        String(entry.communityName ?? "").trim() ||
        (params.activeCommunity?.id === entry.communityId
          ? params.activeCommunity.name
          : "") ||
        (params.publicCommunityAccessId === entry.communityId
          ? params.publicCommunity?.name ?? ""
          : "");
      return {
        ...entry,
        communityName: communityName || null,
      };
    },
    [
      params.activeCommunity,
      params.publicCommunity,
      params.publicCommunityAccessId,
    ],
  );

  const enterCommunity = useCallback(
    (entry: Entry): void => {
      const setupAction = resolveCommunityEntrySetupAction(params);
      if (setupAction !== "enter") {
        setBridgePendingEntry(buildPendingEntry(entry));
        if (setupAction === "setup") {
          setIsBridgeGateOpen(true);
        }
        return;
      }
      void params.resolveAndEnter({
        communityId: entry.communityId,
        communitySlug: entry.communitySlug,
        replace: true,
      });
    },
    [buildPendingEntry, params],
  );

  useEffect(() => {
    if (params.publicRouteKind !== "community_funnel") {
      setIsBridgeGateOpen(false);
      setBridgePendingEntry(null);
      return;
    }
    if (!bridgePendingEntry) return;

    const setupAction = resolveCommunityEntrySetupAction(params);
    if (setupAction === "wait") return;
    if (setupAction === "setup") {
      setIsBridgeGateOpen(true);
      return;
    }

    const entry = bridgePendingEntry;
    setBridgePendingEntry(null);
    setIsBridgeGateOpen(false);
    void params.resolveAndEnter({
      communityId: entry.communityId,
      communitySlug: entry.communitySlug,
      replace: true,
    });
  }, [
    bridgePendingEntry,
    params.accountSetupStatus,
    params.isAccountSetupResolved,
    params.publicRouteKind,
    params.resolveAndEnter,
  ]);

  const completePlatformBridge = useCallback(
    async (legalAcceptance: LegalAcceptance): Promise<boolean> => {
      if (!params.validateProfileInputs(legalAcceptance)) return false;
      if (!(await params.saveOnboardingProfile(legalAcceptance))) return false;
      if (!(await params.finishOnboarding({ navigate: false }))) return false;
      const entered = await params.resolveAndEnter({ replace: true });
      if (!entered) {
        params.setOnboardingError("We could not open Polynet. Try again.");
        return false;
      }
      return true;
    },
    [params],
  );

  const completeCommunityBridge = useCallback(
    async (legalAcceptance: LegalAcceptance): Promise<boolean> => {
      if (params.approvalPending) {
        if (!(await params.saveOnboardingProfile(legalAcceptance))) return false;
        if (!(await params.finishOnboarding({ navigate: false }))) return false;
        setIsBridgeGateOpen(false);
        setBridgePendingEntry(null);
        return true;
      }
      if (!params.validateProfileInputs(legalAcceptance)) return false;
      const entry =
        bridgePendingEntry ??
        (params.activeCommunityId
          ? {
              communityId: params.activeCommunityId,
              communitySlug: params.selectedActiveCommunitySlug,
            }
          : null);
      if (!entry?.communityId) {
        params.setOnboardingError(
          "We could not verify this community. Try again.",
        );
        return false;
      }
      if (!(await params.saveOnboardingProfile(legalAcceptance))) return false;
      if (!(await params.finishOnboarding({ navigate: false }))) return false;
      const destination = await params.resolveDestination({
        communityId: entry.communityId,
        communitySlug: entry.communitySlug,
      });
      if (!destination || destination.page !== "community") {
        params.setOnboardingError(
          "We could not open this community. Try again.",
        );
        return false;
      }
      setIsBridgeGateOpen(false);
      setBridgePendingEntry(null);
      params.applyDestination(destination, { replace: true });
      return true;
    },
    [bridgePendingEntry, params],
  );

  return {
    isBridgeGateOpen,
    bridgePendingEntry,
    enterCommunity,
    completePlatformBridge,
    completeCommunityBridge,
  };
}
