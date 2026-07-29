import { useCallback, useState } from "react";

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

export function useWebCommunityEntryBridgeController(params: {
  publicRouteKind: string;
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

  const enterCommunity = useCallback(
    (entry: Entry): void => {
      if (
        params.publicRouteKind === "community_funnel" &&
        params.accountSetupStatus &&
        !params.accountSetupStatus.completed
      ) {
        const communityName =
          String(entry.communityName ?? "").trim() ||
          (params.activeCommunity?.id === entry.communityId
            ? params.activeCommunity.name
            : "") ||
          (params.publicCommunityAccessId === entry.communityId
            ? params.publicCommunity?.name ?? ""
            : "");
        setBridgePendingEntry({
          ...entry,
          communityName: communityName || null,
        });
        setIsBridgeGateOpen(true);
        return;
      }
      void params.resolveAndEnter({
        communityId: entry.communityId,
        communitySlug: entry.communitySlug,
        replace: true,
      });
    },
    [params],
  );

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
