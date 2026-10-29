import { useCallback, useEffect, useRef, useState } from "react";

import type { CreateCommunityIntentDraft } from "../../../../shared/createCommunityIntent";
import {
  findPendingBuilderSetupSubscription,
  reconcileBuilderSetupSuppressions,
  resolveBuilderSetupModalReconciliation,
  type BuilderSetupSubscriptionLike,
  type BuilderSetupSuppressionReason,
  type BuilderSetupSuppressions,
} from "../../../../shared/builderSetupReconciliation";

export function useWebBuilderSetupSubscriptionController(
  subscriptions: BuilderSetupSubscriptionLike[],
) {
  const [suppressions, setSuppressions] = useState<BuilderSetupSuppressions>({});

  const suppressSubscription = useCallback((
    subscriptionId: string | null,
    reason: BuilderSetupSuppressionReason,
  ) => {
    const normalizedSubscriptionId = String(subscriptionId ?? "").trim();
    if (!normalizedSubscriptionId) return;
    setSuppressions((current) => (
      current[normalizedSubscriptionId] === reason
        ? current
        : { ...current, [normalizedSubscriptionId]: reason }
    ));
  }, []);

  useEffect(() => {
    setSuppressions((current) => reconcileBuilderSetupSuppressions(
      current,
      subscriptions,
    ));
  }, [subscriptions]);

  return {
    pendingBuilderSetupSubscription: findPendingBuilderSetupSubscription(
      subscriptions,
      suppressions,
    ),
    suppressBuilderSetupSubscription: suppressSubscription,
  };
}

type OpenCommunityCreate = (
  draft?: CreateCommunityIntentDraft | null,
) => void;

export function useWebBuilderPurchaseFlowController(params: {
  pendingSubscriptionId: string | null;
  sessionUserId: string | null;
  isAuthBootstrapComplete: boolean;
  isAccountSetupResolved: boolean;
  isAccountSetupComplete: boolean;
  isCreateModalOpen: boolean;
  requiredSubscriptionId: string | null;
  openCreateCommunityModal: OpenCommunityCreate;
  openRequiredCreateCommunityModal: (
    subscriptionId: string,
    draft?: CreateCommunityIntentDraft | null,
  ) => void;
  closeRequiredCreateCommunityModal: () => void;
  openPurchasePrompt: () => void;
}) {
  const pendingDraftRef = useRef<CreateCommunityIntentDraft | null>(null);

  const openCommunityPurchaseFlow = useCallback<OpenCommunityCreate>((draft = null) => {
    // A plan bought first is attached to the community created next.
    if (params.pendingSubscriptionId) {
      params.openRequiredCreateCommunityModal(params.pendingSubscriptionId, draft);
      return;
    }
    // Creating a community is free: straight to setup.
    params.openCreateCommunityModal(draft);
  }, [
    params.pendingSubscriptionId,
    params.openRequiredCreateCommunityModal,
    params.openCreateCommunityModal,
  ]);

  const clearPendingDraft = useCallback(() => {
    pendingDraftRef.current = null;
  }, []);
  const consumePendingDraft = useCallback(() => {
    const draft = pendingDraftRef.current;
    pendingDraftRef.current = null;
    return draft;
  }, []);

  useEffect(() => {
    if (
      !params.sessionUserId
      || !params.isAuthBootstrapComplete
      || !params.isAccountSetupResolved
      || !params.isAccountSetupComplete
    ) {
      return;
    }
    const reconciliation = resolveBuilderSetupModalReconciliation({
      isModalOpen: params.isCreateModalOpen,
      requiredSubscriptionId: params.requiredSubscriptionId,
      pendingSubscriptionId: params.pendingSubscriptionId,
    });
    if (reconciliation.kind === "close_required") {
      params.closeRequiredCreateCommunityModal();
      return;
    }
    if (reconciliation.kind === "open_required") {
      params.openRequiredCreateCommunityModal(reconciliation.subscriptionId);
    }
  }, [
    params.sessionUserId,
    params.isAuthBootstrapComplete,
    params.isAccountSetupResolved,
    params.isAccountSetupComplete,
    params.pendingSubscriptionId,
    params.isCreateModalOpen,
    params.requiredSubscriptionId,
    params.closeRequiredCreateCommunityModal,
    params.openRequiredCreateCommunityModal,
  ]);

  return {
    openCommunityPurchaseFlow,
    clearPendingDraft,
    consumePendingDraft,
  };
}
